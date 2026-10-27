import type { DetailKey, MealIntakeAnalysis, Nutrients } from '../types/analysis'
import type { MealType, MealWithId } from './meals'

// 하루 요약(스펙 4.3절 summary.ts, 4.6절 하루 요약). 순수 함수: Firestore·브라우저 API를 쓰지 않는다.
// 서버 집계(daily/*) 없이 그날 done 문서들의 analysis.totals.consumed를 클라이언트에서 더한다(CLAUDE.md).

export interface DaySummaryMeal {
  id: string
  mealType: MealType
  createdAt: Date | null
  /** done 기록을 고친 마지막 시각(M16). 없으면 null. 화면의 "수정됨" 표시용 */
  editedAt: Date | null
  /** 저장된 analysis.totals.consumed 그대로(저장 때 이미 소수 첫째 자리) */
  consumed: Nutrients
  itemNames: string[]
}

/** 세부 영양소(D4) 키 순서: 당류·나트륨·포화지방·식이섬유 */
export const DETAIL_KEYS: readonly DetailKey[] = ['sugar_g', 'sodium_mg', 'satfat_g', 'fiber_g']

/** 세부 영양소 한 가지의 합. value는 값이 있는 음식만 더한 것, count는 그 음식 수, est는 더한 값에 AI 추정이 하나라도 있음 */
export type DetailTotal = { value: number; count: number; est: boolean }
/** 세부 영양소 합계(2026-10-27 사용자 결정): 값이 있는 음식만 더하고 화면은 "음식 ○개(items) 중 ○개(count) 기준"을 보인다 */
export type DetailSummary = { items: number; totals: Partial<Record<DetailKey, DetailTotal>> }

export interface DaySummary {
  dateKey: string
  /** 그날 done 문서들의 analysis.totals.consumed 합(소수 첫째 자리) */
  totals: Nutrients
  /** 네 끼니 모두 들어 있다(기록이 없으면 0, count 0) */
  byMealType: Record<MealType, Nutrients & { count: number }>
  /** createdAt 오름차순(createdAt이 없으면 맨 뒤) */
  meals: DaySummaryMeal[]
  /** user_input 항목이나 per_100g_fill에 missing이 있는 항목이 하나라도 있으면 true */
  incompleteMacros: boolean
  /** 오프라인 저장 대기. summarizeDay는 false를 넣고 subscribeDay가 스냅숏 메타데이터로 채운다 */
  hasPendingWrites: boolean
  /** 세부 영양소 합(D4). 저장된 음식별 detail_consumed를 더한다(값이 없는 음식은 빼고 센다) */
  detail: DetailSummary
}

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const KEYS = ['kcal', 'carbs_g', 'protein_g', 'fat_g'] as const

/** compute.ts round1과 같은 방식(소수 첫째 자리, -0 → 0). 반올림 전 값을 더한 뒤 한 번만 반올림한다(4.6절). */
function round1(v: number): number {
  const r = Math.round(v * 10) / 10
  return r === 0 ? 0 : r
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const zero = (): Nutrients => ({ kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 })

function addInto(acc: Nutrients, n: Nutrients): void {
  for (const k of KEYS) acc[k] += n[k]
}

function roundAll<T extends Nutrients>(n: T): T {
  for (const k of KEYS) n[k] = round1(n[k])
  return n
}

function toDate(t: { toDate(): Date } | null | undefined): Date | null {
  return t && typeof t.toDate === 'function' ? t.toDate() : null
}

/** 음식별 detail_consumed(먹은 양 기준 세부 영양소)를 더한다. 반올림 전 값을 더한 뒤 g은 소수 첫째 자리, mg은 정수로 한 번만 반올림한다. */
export function sumDetail(analyses: MealIntakeAnalysis[]): DetailSummary {
  let items = 0
  const totals: Partial<Record<DetailKey, DetailTotal>> = {}
  for (const a of analyses) {
    for (const it of Array.isArray(a.items) ? a.items : []) {
      items++
      for (const k of DETAIL_KEYS) {
        const v = it.detail_consumed?.[k]
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        const t = (totals[k] ??= { value: 0, count: 0, est: false })
        t.value += v
        t.count++
        if (it.detail_source?.[k] === 'ai_estimate') t.est = true
      }
    }
  }
  for (const k of DETAIL_KEYS) {
    const t = totals[k]
    if (t) t.value = k === 'sodium_mg' ? Math.round(t.value) : round1(t.value)
  }
  return { items, totals }
}

/**
 * 그날 요약. status가 done이고 analysis가 있고 dateKey가 같은 문서만 더한다
 * (쿼리가 이미 거르지만, 지연 보정 중 끼니·날짜를 바꾼 문서가 섞이지 않게 한 번 더 거른다).
 */
export function summarizeDay(dateKey: string, meals: MealWithId[]): DaySummary {
  const totals = zero()
  const byMealType = Object.fromEntries(MEAL_TYPES.map((t) => [t, { ...zero(), count: 0 }])) as DaySummary['byMealType']
  const list: DaySummaryMeal[] = []
  const analyses: MealIntakeAnalysis[] = []
  let incompleteMacros = false

  for (const m of meals) {
    if (m.status !== 'done' || !m.analysis || m.dateKey !== dateKey) continue
    const c = m.analysis.totals?.consumed
    const consumed: Nutrients = {
      kcal: num(c?.kcal),
      carbs_g: num(c?.carbs_g),
      protein_g: num(c?.protein_g),
      fat_g: num(c?.fat_g),
    }
    addInto(totals, consumed)
    const bucket = byMealType[m.mealType]
    if (bucket) {
      addInto(bucket, consumed)
      bucket.count++
    }
    analyses.push(m.analysis)
    const items = Array.isArray(m.analysis.items) ? m.analysis.items : []
    for (const it of items) {
      if (it.nutrition_source === 'user_input') incompleteMacros = true
      else if (it.per_100g_fill && Object.values(it.per_100g_fill).includes('missing')) incompleteMacros = true
    }
    list.push({
      id: m.id,
      mealType: m.mealType,
      createdAt: toDate(m.createdAt),
      editedAt: toDate(m.editedAt),
      consumed,
      itemNames: items.map((it) => (typeof it.name === 'string' ? it.name.trim() : '')).filter((s) => s.length > 0),
    })
  }

  const t = (x: DaySummaryMeal) => x.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER
  list.sort((a, b) => t(a) - t(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  roundAll(totals)
  for (const mt of MEAL_TYPES) roundAll(byMealType[mt])

  return { dateKey, totals, byMealType, meals: list, incompleteMacros, hasPendingWrites: false, detail: sumDetail(analyses) }
}
