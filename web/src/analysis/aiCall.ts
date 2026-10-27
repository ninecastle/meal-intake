// 호출 A·B·D 공통: 시도당 시간 제한(기본 40초, 호출 D는 10초), 2초 뒤 1회 재시도, SDK 오류 → AnalysisError 변환(스펙 4.2·4.4절).
// 다시 시도하는 것: 네트워크 오류, 5xx, 응답 형식 오류(길이 잘림 포함).
// 다시 시도하지 않는 것(바로 ANALYSIS_UNAVAILABLE):
// - 시간 초과(자체 타이머, SDK AbortError, HTTP 408). 서버가 느린 시간대에 호출만 2번 쓰고 실패하지 않게(2026-10-27 사용자 결정).
// - 429 전부. 분당 한도는 2초 뒤 다시 보내도 같은 분 안이라 또 막히고 한도만 쓴다(2026-10-27 사용자 결정).
//   quotaScope('minute' | 'day')는 그대로 넘긴다. 화면이 minute면 "잠시 후 다시 시도해 주세요", day면 한도 모드로 안내한다.
// - 차단(SAFETY 등), 401·403(App Check), 400·404, 413(PHOTO_INVALID).
import {
  AIError,
  AIErrorCode,
  type EnhancedGenerateContentResponse,
  type GenerativeModel,
  type Part,
} from 'firebase/ai'
import { AnalysisError, type AnalysisFailReason, type QuotaScope } from './errors'

export const ATTEMPT_TIMEOUT_MS = 40_000
export const RETRY_DELAY_MS = 2_000
const MAX_ATTEMPTS = 2

/** 한 번의 시도가 실패한 이유. retryable이면 2초 뒤 1회 다시 시도한다. */
interface AttemptFailure {
  reason: AnalysisFailReason
  retryable: boolean
  message: string
  photoInvalid?: boolean
  quotaScope?: QuotaScope
  cause?: unknown
}

class AttemptError extends Error {
  readonly failure: AttemptFailure
  constructor(failure: AttemptFailure) {
    super(failure.message)
    this.failure = failure
  }
}

/** parse가 형식 오류를 알리는 방법. 바로 멈춰야 하면(예: NO_FOOD_DETECTED) AnalysisError를 던진다. */
export type ParseOutcome<T> = { ok: true; value: T } | { ok: false; detail: string }

const BLOCK_FINISH = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY'])

export function abortError(signal?: AbortSignal): DOMException {
  const r: unknown = signal?.reason
  return r instanceof DOMException && r.name === 'AbortError' ? r : new DOMException('분석을 취소했습니다', 'AbortError')
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal)
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal))
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError(signal))
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function raceAbort<T>(p: Promise<T>, s: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(s.reason)
    if (s.aborted) return onAbort()
    s.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => s.removeEventListener('abort', onAbort))
  })
}

function readText(r: EnhancedGenerateContentResponse): string {
  const blockReason = r.promptFeedback?.blockReason
  if (blockReason) {
    throw new AttemptError({ reason: 'blocked', retryable: false, message: `요청이 차단되었습니다(${blockReason})` })
  }
  const cand = r.candidates?.[0]
  if (!cand) throw new AttemptError({ reason: 'blocked', retryable: false, message: '응답 후보가 없습니다' })
  const finish = cand.finishReason ? String(cand.finishReason) : ''
  if (BLOCK_FINISH.has(finish)) {
    throw new AttemptError({ reason: 'blocked', retryable: false, message: `응답이 차단되었습니다(${finish})` })
  }
  let text: string
  try {
    text = r.text()
  } catch (e) {
    throw new AttemptError({ reason: 'blocked', retryable: false, message: '응답 텍스트를 읽지 못했습니다', cause: e })
  }
  if (!text.trim()) {
    if (finish === 'MAX_TOKENS') {
      throw new AttemptError({ reason: 'invalid_response', retryable: true, message: '응답이 길이 제한으로 잘렸습니다' })
    }
    throw new AttemptError({ reason: 'blocked', retryable: false, message: '빈 응답입니다' })
  }
  return text
}

async function attemptOnce(
  model: GenerativeModel,
  parts: Part[],
  signal?: AbortSignal,
  timeoutMs: number = ATTEMPT_TIMEOUT_MS,
): Promise<string> {
  const ctl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort(new DOMException('시간 초과', 'AbortError'))
  }, timeoutMs)
  const onAbort = () => ctl.abort(abortError(signal))
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    // SDK 자체 시간 제한은 안전망으로 조금 길게 둔다. 실제 제한은 위 타이머다.
    const call = model.generateContent(parts, { signal: ctl.signal, timeout: timeoutMs + 1_000 })
    const res = await raceAbort(call, ctl.signal)
    return readText(res.response)
  } catch (e) {
    if (signal?.aborted) throw abortError(signal)
    if (timedOut) {
      throw new AttemptError({
        reason: 'timeout',
        retryable: false,
        message: `응답이 ${timeoutMs / 1000}초 안에 오지 않았습니다`,
        cause: e,
      })
    }
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function fromStatus(status: number, e: AIError, message: string): AttemptFailure {
  if (status === 413) return { reason: 'bad_request', retryable: false, photoInvalid: true, message, cause: e }
  if (status === 429) {
    const detail = message + JSON.stringify(e.customErrorData?.errorDetails ?? [])
    const quotaScope: QuotaScope = /per ?day|daily/i.test(detail) ? 'day' : 'minute'
    // 분당·일일 모두 재시도하지 않는다(머리 주석). 화면 문구는 quotaScope로 고른다.
    return { reason: 'quota', retryable: false, quotaScope, message, cause: e }
  }
  if (status === 401 || status === 403) return { reason: 'app_check', retryable: false, message, cause: e }
  if (status === 408) return { reason: 'timeout', retryable: false, message, cause: e }
  if (status >= 500) return { reason: 'server', retryable: true, message, cause: e }
  return { reason: 'bad_request', retryable: false, message, cause: e } // 400·404(모델 ID 오류) 등
}

/** SDK 오류 → 실패 이유. 표는 _workspace/03_vision_eval.md "프롬프트 a1" 절. */
function classify(e: unknown): AttemptFailure {
  if (e instanceof AttemptError) return e.failure
  const message = e instanceof Error ? e.message : String(e)
  if (e instanceof AIError) {
    if (e.code === AIErrorCode.API_NOT_ENABLED) return { reason: 'bad_request', retryable: false, message, cause: e }
    const status = e.customErrorData?.status
    if (typeof status === 'number') return fromStatus(status, e, message)
    switch (e.code) {
      case AIErrorCode.PARSE_FAILED:
      case AIErrorCode.RESPONSE_ERROR:
        return { reason: 'invalid_response', retryable: true, message, cause: e }
      case AIErrorCode.ERROR:
      case AIErrorCode.FETCH_ERROR:
        return { reason: 'network', retryable: true, message, cause: e }
      default:
        return { reason: 'bad_request', retryable: false, message, cause: e }
    }
  }
  if (e instanceof DOMException && e.name === 'AbortError') return { reason: 'timeout', retryable: false, message, cause: e }
  return { reason: 'network', retryable: true, message, cause: e }
}

async function tryOnce<T>(
  model: GenerativeModel,
  parts: Part[],
  parse: (text: string) => ParseOutcome<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<{ ok: true; value: T } | { ok: false; failure: AttemptFailure }> {
  try {
    const out = parse(await attemptOnce(model, parts, signal, timeoutMs))
    if (out.ok) return out
    return { ok: false, failure: { reason: 'invalid_response', retryable: true, message: `응답 형식 오류: ${out.detail}` } }
  } catch (e) {
    if (signal?.aborted) throw abortError(signal)
    if (e instanceof AnalysisError) throw e
    return { ok: false, failure: classify(e) }
  }
}

/** 호출하고 parse까지 통과하면 값을 돌려준다. 실패: ANALYSIS_UNAVAILABLE(reason 포함), PHOTO_INVALID(413). 취소: AbortError */
export async function generateWithRetry<T>(input: {
  model: GenerativeModel
  parts: Part[]
  parse: (text: string) => ParseOutcome<T>
  signal?: AbortSignal
  label: string
  /** 시도당 시간 제한. 기본 ATTEMPT_TIMEOUT_MS(40초) */
  timeoutMs?: number
}): Promise<{ value: T; attempts: number }> {
  const { model, parts, parse, signal, label, timeoutMs } = input
  let failure: AttemptFailure | undefined
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await delay(RETRY_DELAY_MS, signal)
    throwIfAborted(signal)
    const r = await tryOnce(model, parts, parse, signal, timeoutMs)
    if (r.ok) return { value: r.value, attempts: attempt }
    failure = r.failure
    if (import.meta.env.DEV) console.warn(`[analysis] ${label} 시도 ${attempt} 실패: ${failure.reason}`, failure.message)
    if (failure.photoInvalid) {
      throw new AnalysisError('PHOTO_INVALID', '사진이 너무 크거나 읽을 수 없습니다', { cause: failure.cause })
    }
    if (!failure.retryable) break
  }
  const f: AttemptFailure = failure ?? { reason: 'server', retryable: false, message: '알 수 없는 오류' }
  throw new AnalysisError('ANALYSIS_UNAVAILABLE', f.message, { reason: f.reason, quotaScope: f.quotaScope, cause: f.cause })
}
