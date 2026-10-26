// 먹기 전·후 사진 분석(스펙 4.3절). 1단계 조각 2: 먹기 전 분석(호출 A)만 있다.
// analyzeAfter·assembleAnalysis는 조각 3·4에서 추가한다.
import type { Part } from 'firebase/ai'
import { AI_MODEL_ID, getModel } from '../lib/ai'
import type { BeforeAnalysis } from '../types/analysis'
import { delay, generateWithRetry, throwIfAborted, type ParseOutcome } from './aiCall'
import {
  GENERATION_CONFIG_A,
  PROMPT_VERSION_A,
  SYSTEM_INSTRUCTION_A,
  USER_TEXT_A,
  normalizeBeforeResponse,
  parseBeforeText,
  type BeforeParsed,
} from './beforePrompt'
import { cacheGet, cachePut, sha256Hex, type CacheEntry } from './cache'
import { AnalysisError } from './errors'

export { AnalysisError } from './errors'

const MOCK = import.meta.env.VITE_AI_MOCK === '1'
/** 목업 결과의 model 값 */
export const MOCK_MODEL_ID = 'mock'
const MOCK_DELAY_MS = 600

// ── 현재 모드 ──
export type AnalysisMode = 'mock' | 'live'
export interface AnalysisModeInfo {
  /** mock이면 모델을 부르지 않고 __fixtures__ 응답을 돌려준다(VITE_AI_MOCK=1) */
  mode: AnalysisMode
  /** 설정된 모델 ID(VITE_AI_MODEL, 기본 gemini-3.5-flash-lite) */
  model: string
  promptVersions: { before: string }
}
export function getAnalysisMode(): AnalysisModeInfo {
  return { mode: MOCK ? 'mock' : 'live', model: AI_MODEL_ID, promptVersions: { before: PROMPT_VERSION_A } }
}

// ── 결과 출처(캐시 여부): 반환 타입을 바꾸지 않고, 돌려준 결과 객체로 조회한다 ──
export type AnalysisOriginSource = 'live' | 'cache' | 'mock'
export interface AnalysisOrigin {
  /** live: 이번에 모델 호출, cache: 같은 사진의 이전 결과(호출 없음), mock: 픽스처 */
  source: AnalysisOriginSource
  /** 결과를 만든 시각(cache면 원래 분석 시각), epoch ms */
  analyzedAt: number
  /** 이번에 한 모델 호출 수(cache·mock은 0, 재시도했으면 2) */
  attempts: number
}
const origins = new WeakMap<object, AnalysisOrigin>()
/** analyzeBefore가 돌려준 객체 그대로 넘기면 출처를 알려 준다. 복사본이면 null */
export function getAnalysisOrigin(result: BeforeAnalysis): AnalysisOrigin | null {
  return origins.get(result) ?? null
}
function tag<T extends object>(result: T, origin: AnalysisOrigin): T {
  origins.set(result, origin)
  return result
}

// IndexedDB가 안 될 때도 세션 안에서는 같은 사진을 다시 부르지 않는다.
const memCache = new Map<string, CacheEntry<BeforeAnalysis>>()

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function parseA(text: string): ParseOutcome<BeforeParsed> {
  const r = parseBeforeText(text)
  if (r.ok) return { ok: true, value: r }
  if (r.kind === 'empty') throw new AnalysisError('NO_FOOD_DETECTED', '사진에서 음식을 찾지 못했습니다')
  return { ok: false, detail: r.detail }
}

/** 먹기 전 분석(호출 A). 음식이 1개 이상이고 id는 i1부터 다시 매긴다.
 *  같은 사진(압축본 SHA-256)이면 캐시 결과를 돌려주고 호출하지 않는다. 출처는 getAnalysisOrigin(result).
 *  오류: ANALYSIS_UNAVAILABLE(재시도 후), NO_FOOD_DETECTED(음식 0개), PHOTO_INVALID(413·읽기 실패). 취소: AbortError */
export async function analyzeBefore(photo: Blob, opts?: { signal?: AbortSignal }): Promise<BeforeAnalysis> {
  const signal = opts?.signal
  throwIfAborted(signal)
  if (!(photo instanceof Blob) || photo.size === 0 || (photo.type !== '' && !photo.type.startsWith('image/'))) {
    throw new AnalysisError('PHOTO_INVALID', '사진 파일이 비어 있거나 이미지가 아닙니다')
  }
  if (MOCK) return mockBefore(signal)

  let bytes: ArrayBuffer
  try {
    bytes = await photo.arrayBuffer()
  } catch (e) {
    throw new AnalysisError('PHOTO_INVALID', '사진을 읽지 못했습니다', { cause: e })
  }
  const meta = { model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_A }

  const key = await sha256Hex(bytes)
  if (key) {
    const hit = memCache.get(key) ?? (await cacheGet<BeforeAnalysis>('before', key, meta))
    throwIfAborted(signal)
    const r = hit ? normalizeBeforeResponse(hit.value) : null
    if (hit && r?.ok) {
      memCache.set(key, hit)
      return tag({ items: r.items, warnings: r.warnings, ...meta }, { source: 'cache', analyzedAt: hit.at, attempts: 0 })
    }
  }

  const parts: Part[] = [
    { type: 'text', text: USER_TEXT_A },
    { type: 'inlineData', inlineData: { mimeType: photo.type || 'image/jpeg', data: toBase64(bytes) } },
  ]
  const model = getModel(AI_MODEL_ID, { systemInstruction: SYSTEM_INSTRUCTION_A, generationConfig: GENERATION_CONFIG_A })
  const { value, attempts } = await generateWithRetry({ model, parts, parse: parseA, signal, label: '호출 A' })

  const result: BeforeAnalysis = { items: value.items, warnings: value.warnings, ...meta }
  const at = Date.now()
  if (key) {
    const entry: CacheEntry<BeforeAnalysis> = { key, value: structuredClone(result), at, ...meta }
    memCache.set(key, entry)
    void cachePut('before', entry)
  }
  return tag(result, { source: 'live', analyzedAt: at, attempts })
}

// ── 목업(VITE_AI_MOCK=1) ── 픽스처는 모델 원본 응답 형태이고, 실제 응답과 같은 정리 함수를 거친다.
const FIXTURES = import.meta.glob<{ default: unknown }>('./__fixtures__/before-*.json')

async function mockBefore(signal?: AbortSignal): Promise<BeforeAnalysis> {
  const paths = Object.keys(FIXTURES).sort()
  if (paths.length === 0) {
    throw new AnalysisError('ANALYSIS_UNAVAILABLE', '목업 픽스처가 없습니다', { reason: 'invalid_response' })
  }
  const mod = await FIXTURES[paths[0]]()
  await delay(MOCK_DELAY_MS, signal)
  const r = normalizeBeforeResponse(mod.default)
  if (!r.ok) {
    if (r.kind === 'empty') throw new AnalysisError('NO_FOOD_DETECTED', '사진에서 음식을 찾지 못했습니다(목업)')
    throw new AnalysisError('ANALYSIS_UNAVAILABLE', `목업 픽스처 형식 오류: ${r.detail}`, { reason: 'invalid_response' })
  }
  return tag(
    { items: r.items, warnings: r.warnings, model: MOCK_MODEL_ID, prompt_version: PROMPT_VERSION_A },
    { source: 'mock', analyzedAt: Date.now(), attempts: 0 },
  )
}
