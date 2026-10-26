// 호출 D(d1, AI 추정): 이름만 보내는 텍스트 호출로 100g당 값을 받는다.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 D. 응답 스키마는 per_100g_guess와 같다.
// 시간 제한 10초(스펙 4.5.1), 재시도·오류 변환은 aiCall.ts. 결과 캐시: IndexedDB meal-analysis-cache 'nutrition'.
import { ThinkingLevel, type GenerationConfig, type Part } from 'firebase/ai'
import { AI_MODEL_ID, getModel } from '../../lib/ai'
import type { Nutrients } from '../../types/analysis'
import { generateWithRetry, type ParseOutcome } from '../aiCall'
import { PER100_SCHEMA, checkPer100 } from '../beforePrompt'
import { cacheGet, cachePut } from '../cache'
import type { EstimateCache } from './resolve.ts'

export const PROMPT_VERSION_D = 'd1'
export const ESTIMATE_TIMEOUT_MS = 10_000

/** 사용자 입력 이름을 따옴표 안에 넣는다. 따옴표·줄바꿈은 공백으로 바꾸고 60자로 자른다 */
export function buildPromptD(name: string): string {
  const safe = name.replace(/["“”\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `"${safe}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 일반적인 조리 기준으로 추정하라.`
}

export const GENERATION_CONFIG_D: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: PER100_SCHEMA,
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  maxOutputTokens: 1024,
}

/** 응답 텍스트 → 100g당 값(범위 검사: kcal 0~900, 탄·단·지 0~100, 합 100 이하) */
export function parseEstimateText(text: string): ParseOutcome<Nutrients> {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, detail: 'JSON 파싱 실패' }
  }
  const v = checkPer100(raw)
  return v ? { ok: true, value: v } : { ok: false, detail: '100g당 값이 없거나 범위를 벗어났습니다' }
}

/** 실제 호출 D. 실패: AnalysisError(ANALYSIS_UNAVAILABLE), 취소: AbortError */
export async function estimateWithCallD(name: string, signal?: AbortSignal): Promise<Nutrients> {
  const model = getModel(AI_MODEL_ID, { generationConfig: GENERATION_CONFIG_D })
  const parts: Part[] = [{ type: 'text', text: buildPromptD(name) }]
  const { value } = await generateWithRetry({
    model,
    parts,
    parse: parseEstimateText,
    signal,
    label: '호출 D',
    timeoutMs: ESTIMATE_TIMEOUT_MS,
  })
  return value
}

/** 호출 D 결과 영구 캐시. 모델·프롬프트 버전이 같고 7일 안인 항목만 쓴다(cache.ts 규칙) */
export const estimateCache: EstimateCache = {
  async get(key) {
    const hit = await cacheGet<Nutrients>('nutrition', key, { model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_D })
    return hit ? checkPer100(hit.value) : null
  },
  async put(key, value) {
    await cachePut('nutrition', { key, value, at: Date.now(), model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_D })
  },
}
