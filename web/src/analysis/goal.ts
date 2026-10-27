// 목표 설정 계산(3단계 조각 2, 스펙 4.7절). 순수 함수, AI 호출 없음.
// Mifflin-St Jeor → 기초대사량(BMR)·하루 소모량(TDEE = BMR × 활동량 계수) → 목표 kcal(감량 −400, 유지 ±0, 증량 +300,
// BMR 아래로 내리지 않음) → 탄단지(감량 50:25:25, 유지·증량 55:20:25). 2026-10-27 사용자 결정으로 바꿈(전: 감량 −500, 모두 55:20:25).
// 계산은 원래 정밀도로 하고 돌려줄 때 반올림한다(kcal은 10 단위, 탄·단·지는 g 정수). 하한 비교도 반올림한 값으로 한다
// (화면에 보인 기초대사량과 같은 값을 넣으면 통과하도록).
import type { Nutrients } from '../types/analysis'

export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalType = 'lose' | 'maintain' | 'gain'
export interface GoalInput {
  sex: Sex
  age: number
  height_cm: number
  weight_kg: number
  activity: Activity
  goal: GoalType
}
export interface GoalResult {
  bmr: number
  tdee: number
  target_kcal: number
  macros: { carbs_g: number; protein_g: number; fat_g: number }
  /** 만 18세 미만이면 maintain */
  goal_applied: GoalType
  /** 목표 kcal을 기초대사량까지 올렸으면 true */
  clamped: boolean
  minor: boolean
  formula: 'mifflin-st-jeor'
}
/** 사용자가 직접 조정한 값(없는 키는 추천값). */
export interface GoalOverride {
  target_kcal?: number
  carbs_g?: number
  protein_g?: number
  fat_g?: number
}
export interface GoalTargets {
  target_kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
  /** 하나라도 직접 조정했으면 custom */
  source: 'recommended' | 'custom'
}
type MacroKey = 'carbs_g' | 'protein_g' | 'fat_g'
export type GoalCompareKey = 'kcal' | MacroKey
export interface GoalCompareRow {
  eaten: number
  target: number
  /** 0보다 작으면 초과 */
  remaining: number
  /** eaten ÷ target(자르지 않는다. 막대는 화면에서 100%로 자른다) */
  ratio: number
}

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}
export const GOAL_DELTA_KCAL: Record<GoalType, number> = { lose: -400, maintain: 0, gain: 300 }
export const INPUT_RANGE = {
  age: { min: 14, max: 100 },
  height_cm: { min: 120, max: 220 },
  weight_kg: { min: 30, max: 250 },
} as const
export const ADULT_AGE = 18
/** 목표별 탄·단·지 에너지 비율. 만 18세 미만은 goal_applied가 maintain이라 55:20:25 */
export const MACRO_RATIO: Record<GoalType, Record<MacroKey, number>> = {
  lose: { carbs_g: 0.5, protein_g: 0.25, fat_g: 0.25 },
  maintain: { carbs_g: 0.55, protein_g: 0.2, fat_g: 0.25 },
  gain: { carbs_g: 0.55, protein_g: 0.2, fat_g: 0.25 },
}
const KCAL_PER_G: Record<MacroKey, number> = { carbs_g: 4, protein_g: 4, fat_g: 9 }
const MACRO_KEYS: MacroKey[] = ['carbs_g', 'protein_g', 'fat_g']
export const TARGET_KCAL_MAX = 6000
export const MACRO_MAX_G = 1000

const SEXES: readonly Sex[] = ['male', 'female']
const ACTIVITIES = Object.keys(ACTIVITY_FACTOR) as Activity[]
const GOALS: readonly GoalType[] = ['lose', 'maintain', 'gain']

const round10 = (kcal: number) => Math.round(kcal / 10) * 10
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function splitMacros(kcal: number, goal: GoalType): GoalResult['macros'] {
  const r = MACRO_RATIO[goal]
  return {
    carbs_g: Math.round((kcal * r.carbs_g) / KCAL_PER_G.carbs_g),
    protein_g: Math.round((kcal * r.protein_g) / KCAL_PER_G.protein_g),
    fat_g: Math.round((kcal * r.fat_g) / KCAL_PER_G.fat_g),
  }
}

/** 화면 안내용 비율 글자, 예: "50:25:25" */
export function macroRatioText(goal: GoalType): string {
  const r = MACRO_RATIO[goal]
  return MACRO_KEYS.map((k) => Math.round(r[k] * 100)).join(':')
}

/** 형식·범위 검사. 만 18세 미만이면 goal을 maintain으로 바꿔 돌려준다(감량·증량을 고를 수 없다). */
export function validateGoalInput(x: unknown): { ok: true; value: GoalInput } | { ok: false; errors: string[] } {
  if (!x || typeof x !== 'object') return { ok: false, errors: ['입력이 없어요'] }
  const r = x as Record<string, unknown>
  const errors: string[] = []
  if (!SEXES.includes(r.sex as Sex)) errors.push('성별을 골라 주세요')
  const { age, height_cm, weight_kg } = INPUT_RANGE
  if (!isNum(r.age) || !Number.isInteger(r.age) || r.age < age.min || r.age > age.max) {
    errors.push(`나이는 ${age.min}~${age.max}세 정수로 넣어 주세요`)
  }
  if (!isNum(r.height_cm) || r.height_cm < height_cm.min || r.height_cm > height_cm.max) {
    errors.push(`키는 ${height_cm.min}~${height_cm.max}cm로 넣어 주세요`)
  }
  if (!isNum(r.weight_kg) || r.weight_kg < weight_kg.min || r.weight_kg > weight_kg.max) {
    errors.push(`몸무게는 ${weight_kg.min}~${weight_kg.max}kg으로 넣어 주세요`)
  }
  if (!ACTIVITIES.includes(r.activity as Activity)) errors.push('활동량을 골라 주세요')
  if (!GOALS.includes(r.goal as GoalType)) errors.push('목표를 골라 주세요')
  if (errors.length > 0) return { ok: false, errors }
  const v = r as unknown as GoalInput
  const goal = v.age < ADULT_AGE ? 'maintain' : v.goal
  return {
    ok: true,
    value: { sex: v.sex, age: v.age, height_cm: v.height_cm, weight_kg: v.weight_kg, activity: v.activity, goal },
  }
}

export function computeGoal(input: GoalInput): GoalResult {
  const bmr = 10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + (input.sex === 'male' ? 5 : -161)
  const tdee = bmr * ACTIVITY_FACTOR[input.activity]
  const minor = input.age < ADULT_AGE
  const goal_applied: GoalType = minor ? 'maintain' : input.goal
  const raw = tdee + GOAL_DELTA_KCAL[goal_applied]
  const clamped = raw < bmr
  const target = clamped ? bmr : raw
  return {
    bmr: round10(bmr),
    tdee: round10(tdee),
    target_kcal: round10(target),
    macros: splitMacros(target, goal_applied),
    goal_applied,
    clamped,
    minor,
    formula: 'mifflin-st-jeor',
  }
}

/** 직접 조정할 때 목표 kcal 하한: 성인은 기초대사량, 만 18세 미만은 하루 소모량(유지 중심). */
export function targetKcalFloor(result: GoalResult): number {
  return result.minor ? result.tdee : result.bmr
}

/**
 * 추천값 + 직접 조정 → 실제로 쓰는 목표. errors가 있으면 저장하지 않는다(targets는 화면 표시용으로 돌려준다).
 * kcal만 조정하면 조정하지 않은 탄·단·지는 그 kcal을 목표별 비율(goal_applied)로 다시 나눈다. 탄·단·지를 직접 조정했으면 그 값을 쓴다.
 * 입력이 바뀌어 하한이 올라가도 조정값은 그대로 두고 errors로 알린다.
 */
export function applyOverride(result: GoalResult, o: GoalOverride | null): { targets: GoalTargets; errors: string[] } {
  const errors: string[] = []
  const custom = !!o && (['target_kcal', ...MACRO_KEYS] as const).some((k) => o[k] !== undefined)
  const kcal = o?.target_kcal ?? result.target_kcal
  const floor = targetKcalFloor(result)
  if (!isNum(kcal)) errors.push('목표 칼로리를 숫자로 넣어 주세요')
  else if (kcal < floor) {
    errors.push(`목표 칼로리가 ${result.minor ? '하루 소모량' : '기초대사량'}(${floor}kcal)보다 낮아요`)
  } else if (kcal > TARGET_KCAL_MAX) errors.push(`목표 칼로리는 ${TARGET_KCAL_MAX}kcal 이하로 넣어 주세요`)

  const base = o?.target_kcal !== undefined && isNum(kcal) ? splitMacros(kcal, result.goal_applied) : result.macros
  const macros = { ...base }
  for (const k of MACRO_KEYS) {
    const v = o?.[k]
    if (v === undefined) continue
    macros[k] = v
    if (!isNum(v) || v < 0 || v > MACRO_MAX_G) {
      const label = k === 'carbs_g' ? '탄수화물' : k === 'protein_g' ? '단백질' : '지방'
      errors.push(`${label}은 0~${MACRO_MAX_G}g으로 넣어 주세요`)
    }
  }
  return { targets: { target_kcal: kcal, ...macros, source: custom ? 'custom' : 'recommended' }, errors }
}

/** 하루 요약 막대용: 먹은 양 / 목표, 남은 양(음수면 초과). */
export function compareToGoal(consumed: Nutrients, targets: GoalTargets): Record<GoalCompareKey, GoalCompareRow> {
  const row = (eaten: number, target: number): GoalCompareRow => ({
    eaten,
    target,
    remaining: target - eaten,
    ratio: target > 0 ? eaten / target : 0,
  })
  return {
    kcal: row(consumed.kcal, targets.target_kcal),
    carbs_g: row(consumed.carbs_g, targets.carbs_g),
    protein_g: row(consumed.protein_g, targets.protein_g),
    fat_g: row(consumed.fat_g, targets.fat_g),
  }
}
