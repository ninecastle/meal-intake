// 호출 D(d1, AI 추정): 이름만 보내는 텍스트 호출로 100g당 값을 받는다.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 D. 응답 스키마는 per_100g_guess와 같다.
// d2(2026-10-29, 일반 음식 1인분 무게 사용자 결정): 같은 호출에서 보통 1인분 무게 serving_g(정수 g, 선택)도 받는다(호출 수 그대로).
//   직접 입력에서 DB에 없는 이름을 [그대로 추가]하면 무게를 serving_g로 미리 채운다. d1 캐시(1인분 없음)는 쓰지 않는다.
// 시간 제한 10초(스펙 4.5.1), 재시도·오류 변환은 aiCall.ts. 결과 캐시: IndexedDB meal-analysis-cache 'nutrition'.
import { Schema, ThinkingLevel, type GenerationConfig, type Part } from 'firebase/ai'
import { AI_MODEL_ID, getModel } from '../../lib/ai'
import { generateWithRetry, type ParseOutcome } from '../aiCall'
import { checkEstimate, type Estimate } from './resolve.ts'
import { cacheGet, cachePut } from '../cache'
import type { EstimateCache } from './resolve.ts'

/** 100g당 값(필수) + 보통 1인분 무게(정수 g, 선택) */
export const ESTIMATE_SCHEMA = Schema.object({
  properties: {
    kcal: Schema.number(),
    carbs_g: Schema.number(),
    protein_g: Schema.number(),
    fat_g: Schema.number(),
    serving_g: Schema.integer(),
  },
  optionalProperties: ['serving_g'],
})

export const PROMPT_VERSION_D = 'd2'
export const ESTIMATE_TIMEOUT_MS = 10_000

/** 사용자 입력 이름을 따옴표 안에 넣는다. 따옴표·줄바꿈은 공백으로 바꾸고 60자로 자른다 */
export function buildPromptD(name: string): string {
  const safe = name.replace(/["“”\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  return `"${safe}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 일반적인 조리 기준으로 추정하라. serving_g에는 한국에서 보통 1인분(한 그릇·한 접시·1개·1잔)으로 먹는 무게를 g 정수로 적어라(5~1500).`
}

export const GENERATION_CONFIG_D: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: ESTIMATE_SCHEMA,
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  maxOutputTokens: 1024,
}

/** 응답 텍스트 → 100g당 값(범위 검사: kcal 0~900, 탄·단·지 0~100, 합 100 이하) + serving_g(5~1500 정수일 때만, 아니면 뺀다) */
export function parseEstimateText(text: string): ParseOutcome<Estimate> {
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
  const v = checkEstimate(raw)
  return v ? { ok: true, value: v } : { ok: false, detail: '100g당 값이 없거나 범위를 벗어났습니다' }
}

/** 실제 호출 D. 실패: AnalysisError(ANALYSIS_UNAVAILABLE), 취소: AbortError */
export async function estimateWithCallD(name: string, signal?: AbortSignal): Promise<Estimate> {
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
    const hit = await cacheGet<Estimate>('nutrition', key, { model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_D })
    return hit ? checkEstimate(hit.value) : null
  },
  async put(key, value) {
    await cachePut('nutrition', { key, value, at: Date.now(), model: AI_MODEL_ID, prompt_version: PROMPT_VERSION_D })
  },
}
