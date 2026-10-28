// 먹기 전·후 사진 분석(스펙 4.3절). 1단계 조각 2: 먹기 전 분석(호출 A), 조각 3: 먹은 후 분석(호출 B).
// assembleAnalysis는 조각 4에서 추가한다.
import type { Part } from 'firebase/ai'
import { AI_MODEL_ID, getModel } from '../lib/ai'
import type { AfterAnalysis, BeforeAnalysis } from '../types/analysis'
import { delay, generateWithRetry, throwIfAborted, type ParseOutcome } from './aiCall'
import {
  GENERATION_CONFIG_A,
  PROMPT_VERSION_A,
  SYSTEM_INSTRUCTION_A,
  beforeCacheKey,
  buildUserTextA,
  normalizeBeforeResponse,
  sanitizeMenuCandidates,
  parseBeforeText,
  type BeforeParsed,
} from './beforePrompt'
import {
  GENERATION_CONFIG_B,
  PROMPT_VERSION_B,
  SYSTEM_INSTRUCTION_B,
  USER_TEXT_AFTER_PHOTO,
  USER_TEXT_BEFORE_PHOTO,
  WARNING_NO_BEFORE_PHOTO,
  buildBeforeItemsJson,
  buildBeforeItemsText,
  normalizeAfterResponse,
  parseAfterText,
  type AfterParsed,
} from './afterPrompt'
import { cacheGet, cachePut, sha256Hex, type CacheEntry } from './cache'
import { AnalysisError } from './errors'

export { AnalysisError } from './errors'
// 스펙 4.3절 계약: assembleAnalysis도 analyze.ts에서 가져올 수 있다(구현은 assemble.ts)
export { assembleAnalysis } from './assemble'

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
  promptVersions: { before: string; after: string }
}
export function getAnalysisMode(): AnalysisModeInfo {
  return { mode: MOCK ? 'mock' : 'live', model: AI_MODEL_ID, promptVersions: { before: PROMPT_VERSION_A, after: PROMPT_VERSION_B } }
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
/** analyzeBefore·analyzeAfter가 돌려준 객체 그대로 넘기면 출처를 알려 준다. 복사본이면 null */
export function getAnalysisOrigin(result: BeforeAnalysis | AfterAnalysis): AnalysisOrigin | null {
  return origins.get(result) ?? null
}
function tag<T extends object>(result: T, origin: AnalysisOrigin): T {
  origins.set(result, origin)
  return result
}

// IndexedDB가 안 될 때도 세션 안에서는 같은 사진을 다시 부르지 않는다.
const memCache = new Map<string, CacheEntry<BeforeAnalysis>>()
const memCacheAfter = new Map<string, CacheEntry<AfterAnalysis>>()

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function isImageBlob(b: unknown): b is Blob {
  return b instanceof Blob && b.size > 0 && (b.type === '' || b.type.startsWith('image/'))
}

function parseA(text: string): ParseOutcome<BeforeParsed> {
  const r = parseBeforeText(text)
  if (r.ok) return { ok: true, value: r }
  if (r.kind === 'empty') throw new AnalysisError('NO_FOOD_DETECTED', '사진에서 음식을 찾지 못했습니다')
  return { ok: false, detail: r.detail }
}

/** 먹기 전 분석(호출 A). 음식이 1개 이상이고 id는 i1부터 다시 매긴다.
 *  같은 사진(압축본 SHA-256)이면 캐시 결과를 돌려주고 호출하지 않는다. 출처는 getAnalysisOrigin(result).
 *  menuCandidates(선택, 급식 메뉴 이름): 다듬어(최대 15개) 프롬프트 a7 후보 블록으로 넣고, 캐시 키에도 넣는다.
 *  비었거나 다듬은 뒤 0개면 후보 없는 호출과 같다. 목업 모드는 후보를 쓰지 않는다.
 *  오류: ANALYSIS_UNAVAILABLE(재시도 후), NO_FOOD_DETECTED(음식 0개), PHOTO_INVALID(413·읽기 실패). 취소: AbortError */
export async function analyzeBefore(
  photo: Blob,
  opts?: { signal?: AbortSignal; menuCandidates?: string[] },
): Promise<BeforeAnalysis> {
  const signal = opts?.signal
  const candidates = sanitizeMenuCandidates(opts?.menuCandidates)
  throwIfAborted(signal)
  if (!isImageBlob(photo)) {
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

  const photoHash = await sha256Hex(bytes)
  const key = photoHash ? beforeCacheKey(photoHash, candidates) : null
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
    { type: 'text', text: buildUserTextA(candidates) },
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

/** 먹은 후 분석(호출 B). beforePhoto가 null이면(또는 읽지 못하면) 먹은 후 사진과 목록 텍스트만 보내고
 *  used_before_photo=false, warnings 맨 앞에 "먹기 전 사진 없이 분석"을 넣는다.
 *  before에 없는 id는 버리고 경고, 빠진 id·0~1 밖 값은 remaining_ratio=null. 항목은 before 순서 그대로다.
 *  같은 먹은 후 사진 + 같은 먹기 전 목록이면 캐시 결과를 돌려준다(사진 없이 분석한 캐시는 지금 사진이 있으면 쓰지 않는다).
 *  오류: ANALYSIS_UNAVAILABLE(재시도 후. 먹기 전 목록이 비면 bad_request), PHOTO_INVALID(먹은 후 사진). 취소: AbortError */
export async function analyzeAfter(
  input: { before: BeforeAnalysis; beforePhoto: Blob | null; afterPhoto: Blob },
  opts?: { signal?: AbortSignal },
): Promise<AfterAnalysis> {
  const signal = opts?.signal
  throwIfAborted(signal)
  const { before, afterPhoto } = input
  if (!isImageBlob(afterPhoto)) throw new AnalysisError('PHOTO_INVALID', '먹은 후 사진 파일이 비어 있거나 이미지가 아닙니다')
  const beforeItems = Array.isArray(before?.items) ? before.items : []
  if (beforeItems.length === 0) {
    throw new AnalysisError('ANALYSIS_UNAVAILABLE', '먹기 전 음식 목록이 비어 있습니다', { reason: 'bad_request' })
  }
  if (MOCK) return mockAfter(beforeItems, isImageBlob(input.beforePhoto), signal)

  let afterBytes: ArrayBuffer
  try {
    afterBytes = await afterPhoto.arrayBuffer()
  } catch (e) {
    throw new AnalysisError('PHOTO_INVALID', '먹은 후 사진을 읽지 못했습니다', { cause: e })
  }
  // 먹기 전 사진은 없거나 읽지 못해도 실패로 보지 않고 텍스트만으로 분석한다.
  const beforePhoto = isImageBlob(input.beforePhoto) ? input.beforePhoto : null
  let beforeBytes: ArrayBuffer | null = null
  if (beforePhoto) {
    try {
      beforeBytes = await beforePhoto.arrayBuffer()
    } catch {
      beforeBytes = null
    }
  }
  throwIfAborted(signal)
  const usedBeforePhoto = beforeBytes !== null
  const meta = { model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_B }
  const itemsJson = buildBeforeItemsJson(beforeItems)

  // 키: 먹은 후 압축본 SHA-256 + 먹기 전 목록(모델에 보내는 JSON)의 SHA-256. 먹기 전 결과가 다르면 다시 분석한다.
  const afterHash = await sha256Hex(afterBytes)
  const listHash = afterHash ? await sha256Hex(new TextEncoder().encode(itemsJson).buffer as ArrayBuffer) : null
  const key = afterHash && listHash ? `${afterHash}:${listHash}` : null
  if (key) {
    const hit = memCacheAfter.get(key) ?? (await cacheGet<AfterAnalysis>('after', key, meta))
    throwIfAborted(signal)
    const usable = hit !== null && hit !== undefined && (hit.value.used_before_photo || !usedBeforePhoto)
    const r = usable ? normalizeAfterResponse(hit.value, beforeItems) : null
    if (hit && r?.ok) {
      memCacheAfter.set(key, hit)
      const warnings = Array.isArray(hit.value.warnings)
        ? hit.value.warnings.filter((w): w is string => typeof w === 'string')
        : []
      return tag(
        { items: r.items, warnings, used_before_photo: hit.value.used_before_photo === true, ...meta },
        { source: 'cache', analyzedAt: hit.at, attempts: 0 },
      )
    }
  }

  const parts: Part[] = [{ type: 'text', text: buildBeforeItemsText(itemsJson) }]
  if (beforeBytes && beforePhoto) {
    parts.push(
      { type: 'text', text: USER_TEXT_BEFORE_PHOTO },
      { type: 'inlineData', inlineData: { mimeType: beforePhoto.type || 'image/jpeg', data: toBase64(beforeBytes) } },
    )
  }
  parts.push(
    { type: 'text', text: USER_TEXT_AFTER_PHOTO },
    { type: 'inlineData', inlineData: { mimeType: afterPhoto.type || 'image/jpeg', data: toBase64(afterBytes) } },
  )
  const model = getModel(AI_MODEL_ID, { systemInstruction: SYSTEM_INSTRUCTION_B, generationConfig: GENERATION_CONFIG_B })
  const parseB = (text: string): ParseOutcome<AfterParsed> => {
    const r = parseAfterText(text, beforeItems)
    return r.ok ? { ok: true, value: r } : { ok: false, detail: r.detail }
  }
  const { value, attempts } = await generateWithRetry({ model, parts, parse: parseB, signal, label: '호출 B' })

  const result: AfterAnalysis = {
    items: value.items,
    warnings: usedBeforePhoto ? value.warnings : [WARNING_NO_BEFORE_PHOTO, ...value.warnings],
    used_before_photo: usedBeforePhoto,
    ...meta,
  }
  const at = Date.now()
  if (key) {
    const entry: CacheEntry<AfterAnalysis> = { key, value: structuredClone(result), at, ...meta }
    memCacheAfter.set(key, entry)
    void cachePut('after', entry)
  }
  return tag(result, { source: 'live', analyzedAt: at, attempts })
}

// ── 목업(VITE_AI_MOCK=1) ── 픽스처는 모델 원본 응답 형태이고, 실제 응답과 같은 정리 함수를 거친다.
const FIXTURES = import.meta.glob<{ default: unknown }>('./__fixtures__/before-*.json')
const AFTER_FIXTURES = import.meta.glob<{ default: unknown }>('./__fixtures__/after-*.json')

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

/** after 픽스처를 넘겨받은 before 목록 기준으로 정리한다(목록에 없는 id는 실제와 같이 버리고 경고). */
async function mockAfter(
  beforeItems: BeforeAnalysis['items'],
  hasBeforePhoto: boolean,
  signal?: AbortSignal,
): Promise<AfterAnalysis> {
  const paths = Object.keys(AFTER_FIXTURES).sort()
  if (paths.length === 0) {
    throw new AnalysisError('ANALYSIS_UNAVAILABLE', '목업 픽스처가 없습니다', { reason: 'invalid_response' })
  }
  const mod = await AFTER_FIXTURES[paths[0]]()
  await delay(MOCK_DELAY_MS, signal)
  const r = normalizeAfterResponse(mod.default, beforeItems)
  if (!r.ok) throw new AnalysisError('ANALYSIS_UNAVAILABLE', `목업 픽스처 형식 오류: ${r.detail}`, { reason: 'invalid_response' })
  return tag(
    {
      items: r.items,
      warnings: hasBeforePhoto ? r.warnings : [WARNING_NO_BEFORE_PHOTO, ...r.warnings],
      used_before_photo: hasBeforePhoto,
      model: MOCK_MODEL_ID,
      prompt_version: PROMPT_VERSION_B,
    },
    { source: 'mock', analyzedAt: Date.now(), attempts: 0 },
  )
}
