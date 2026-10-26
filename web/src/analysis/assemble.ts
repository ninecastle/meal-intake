// 호출 A·B 결과 → 영양값 조회 → 계산 → v2 결과(스펙 4.3절 assembleAnalysis). 오류를 던지지 않는다.
import type {
  AfterAnalysis,
  AfterItem,
  BeforeAnalysis,
  BeforeItem,
  MealIntakeAnalysis,
  MealItem,
  Nutrients,
  NutritionResult,
} from '../types/analysis.ts'
import { applyNutrition, buildAnalysis } from './compute.ts'
import { resolveNutrition } from './nutrition/index.ts'

export type ResolveNutritionFn = (
  name: string,
  opts?: { guess?: Nutrients | null; dbCode?: string; signal?: AbortSignal },
) => Promise<NutritionResult>

export interface AssembleOptions {
  signal?: AbortSignal
  /** 시험용 주입. 기본값은 ./nutrition의 resolveNutrition */
  resolve?: ResolveNutritionFn
}

/** 영양값 조회 동시 실행 상한 */
export const RESOLVE_CONCURRENCY = 4

const WARN_NO_AFTER = '먹은 후 분석 결과가 없어 남긴 비율을 직접 골라야 합니다'

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(xs.length)
  let next = 0
  const worker = async () => {
    while (next < xs.length) {
      const i = next++
      out[i] = await fn(xs[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker))
  return out
}

function draftItem(b: BeforeItem, ratio: number | null, confidence: number): MealItem {
  return {
    id: b.id,
    name: b.name,
    ...(typeof b.location === 'string' ? { location: b.location } : {}),
    db_food_code: null,
    eaters: 1,
    before_grams: b.before_grams,
    remaining_ratio: ratio,
    consumed_grams: 0,
    per_100g: null,
    nutrition_source: 'user_input',
    consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 },
    kcal_overridden: false,
    confidence,
    needs_review: false,
  }
}

function joinVersion(a: string | undefined, b: string | undefined): string | undefined {
  const parts = [a, b].filter((v): v is string => typeof v === 'string' && v !== '')
  return parts.length ? parts.join('-') : undefined
}

/** A·B를 id로 합치고 항목마다 resolveNutrition(name, { guess: per_100g_guess })(동시 최대 4개) → applyNutrition → buildAnalysis.
 *  after가 null이면 remaining_ratio를 모두 null로 둔다(남긴 비율 직접 고르기 경로). 항목 confidence는 A·B 중 낮은 값.
 *  조회가 실패(예외·중단)하면 guess가 있으면 AI 추정, 없으면 직접 입력으로 둔다. eaters는 1. 오류를 던지지 않는다. */
export async function assembleAnalysis(
  before: BeforeAnalysis,
  after: AfterAnalysis | null,
  opts?: AssembleOptions,
): Promise<MealIntakeAnalysis> {
  const resolve = opts?.resolve ?? resolveNutrition
  const signal = opts?.signal
  const warnings: string[] = [...(before?.warnings ?? []), ...(after?.warnings ?? [])]
  const meta = {
    model: before?.model && after?.model && after.model !== before.model ? `${before.model}+${after.model}` : before?.model,
    prompt_version: joinVersion(before?.prompt_version, after?.prompt_version),
  }
  try {
    if (!after) warnings.push(WARN_NO_AFTER)
    const afterById = new Map<string, AfterItem>()
    for (const a of after?.items ?? []) afterById.set(a.id, a)

    const seen = new Set<string>()
    const list: BeforeItem[] = []
    for (const b of Array.isArray(before?.items) ? before.items : []) {
      if (!b || typeof b.id !== 'string' || seen.has(b.id)) {
        warnings.push(`먹기 전 결과의 항목 하나를 건너뛰었습니다(id 없음 또는 중복: ${String(b?.id)})`)
        continue
      }
      seen.add(b.id)
      list.push(b)
    }

    const items = await mapLimit(list, RESOLVE_CONCURRENCY, async (b) => {
      const a = afterById.get(b.id)
      if (after && !a) warnings.push(`${b.name}: 먹은 후 결과에 없어 남긴 비율을 정하지 못했습니다`)
      const ratio = after ? (a?.remaining_ratio ?? null) : null
      const confidence = a ? Math.min(b.confidence, a.confidence) : b.confidence
      const guess = b.per_100g_guess ?? null
      let r: NutritionResult
      try {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
        r = await resolve(b.name, { guess, signal })
      } catch {
        r = guess ? { source: 'ai_estimate', per_100g: guess, via: 'guess' } : { source: 'user_input', per_100g: null }
        if (guess && !signal?.aborted) warnings.push(`${b.name}: 영양값 조회에 실패해 AI 추정값을 썼습니다`)
      }
      if (r.source === 'user_input') warnings.push(`${b.name}: 영양값을 찾지 못했습니다. 칼로리를 직접 입력해 주세요`)
      return applyNutrition(draftItem(b, ratio, confidence), r)
    })
    return buildAnalysis(items, warnings, meta)
  } catch {
    return buildAnalysis([], [...warnings, '분석 결과를 조립하지 못했습니다. 음식을 직접 추가해 주세요'], meta)
  }
}
