// 설정 "목표 칼로리·탄단지" 시트 계산(디자인 조각 D8, 2026-10-28 사용자 결정). AI 호출 없음, 순수 함수.
// - 칼로리를 −/+(50kcal) 하거나 직접 넣으면 탄·단·지는 목표 비율(goal_applied)로 다시 나눈다 → 직접 조정 { target_kcal }.
// - 탄·단·지 g를 직접 바꾸면 칼로리는 세 값의 합(탄·단 4kcal/g, 지 9kcal/g) → 직접 조정 { target_kcal: 합, carbs_g, protein_g, fat_g }.
// - 추천값과 같아지면 직접 조정이 아니다(null). 하한(성인 기초대사량, 만 18세 미만 하루 소모량)·상한 검사는 analysis/goal applyOverride 그대로.
import { applyOverride, targetKcalFloor, type GoalOverride, type GoalResult, type GoalTargets } from '../analysis/goal.ts'

export type MacroKey = 'carbs_g' | 'protein_g' | 'fat_g'
export const MACRO_KEYS: readonly MacroKey[] = ['carbs_g', 'protein_g', 'fat_g']
export const KCAL_PER_G: Record<MacroKey, number> = { carbs_g: 4, protein_g: 4, fat_g: 9 }
/** 시안 kstep: 한 번에 50kcal */
export const KCAL_STEP = 50

export type Macros = Record<MacroKey, number>

/** 탄·단·지 g → kcal(반올림) */
export function kcalOfMacros(m: Macros): number {
  return Math.round(MACRO_KEYS.reduce((s, k) => s + m[k] * KCAL_PER_G[k], 0))
}

/** 탄·단·지 에너지 비율 %(반올림). 합이 0이면 모두 0 */
export function macroShares(m: Macros): Macros {
  const total = MACRO_KEYS.reduce((s, k) => s + m[k] * KCAL_PER_G[k], 0)
  const pct = (k: MacroKey) => (total > 0 ? Math.round(((m[k] * KCAL_PER_G[k]) / total) * 100) : 0)
  return { carbs_g: pct('carbs_g'), protein_g: pct('protein_g'), fat_g: pct('fat_g') }
}

/** 칼로리만 바꾼 직접 조정. 추천 칼로리와 같으면 null */
export function kcalOverride(result: GoalResult, kcal: number): GoalOverride | null {
  return kcal === result.target_kcal ? null : { target_kcal: kcal }
}

/** 탄·단·지를 바꾼 직접 조정(칼로리는 세 값의 합). 세 값이 추천값과 모두 같으면 null */
export function macroOverride(result: GoalResult, m: Macros): GoalOverride | null {
  if (MACRO_KEYS.every((k) => m[k] === result.macros[k])) return null
  return { target_kcal: kcalOfMacros(m), carbs_g: m.carbs_g, protein_g: m.protein_g, fat_g: m.fat_g }
}

/** −/+ 한 번: 지금 칼로리에서 50kcal. 내릴 때는 하한 아래로 가지 않는다(시안 Math.max(800, …) 자리에 우리 하한) */
export function stepKcal(result: GoalResult, kcal: number, dir: 1 | -1): number {
  const next = kcal + dir * KCAL_STEP
  const floor = targetKcalFloor(result)
  return dir < 0 && next < floor ? floor : next
}

/** 화면 표시·저장 가능 여부: applyOverride 결과 + 직접 조정 여부 */
export function previewTargets(result: GoalResult, o: GoalOverride | null): { targets: GoalTargets; errors: string[]; custom: boolean } {
  const { targets, errors } = applyOverride(result, o)
  return { targets, errors, custom: targets.source === 'custom' }
}
