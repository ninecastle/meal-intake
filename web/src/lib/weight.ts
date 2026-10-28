// 체중 기록·목표 몸무게 계산(디자인 조각 D6, 2026-10-28 사용자 확인). 화면·저장과 떨어진 순수 함수. AI 호출 없음.
// - 입력은 0.1kg 단위, 30~250kg(목표 계산 입력 INPUT_RANGE.weight_kg와 같다, 규칙 v7 validKg).
// - 나의 변화 띠: "지난 기록보다 0.3kg 줄었어요", 목표 알약 "목표까지 4.4kg"(목표에 닿으면 "목표에 도착했어요").
// - 목표 다시 계산 안내(2026-10-28 사용자 결정): 최근 체중이 목표 계산에 쓴 몸무게와 2kg 이상 다르면 묻는다.
//   [나중에]를 누르면 그때 최근 체중에서 1kg 이상 더 바뀌기 전까지는 다시 묻지 않는다.
// 비교는 0.1kg 단위 정수(10배)로 해서 소수 오차(58.4 − 56.4 = 1.9999…)로 경계가 흔들리지 않게 한다.
// 값은 타입만 가져온다(node 시험이 확장자 없는 값 import를 못 읽는다). 범위는 analysis/goal.ts INPUT_RANGE.weight_kg와 같게 둔다.
import type { GoalType } from '../analysis/goal'

export const WEIGHT_MIN = 30
export const WEIGHT_MAX = 250
/** 목표 다시 계산을 묻는 차이(kg) */
export const RECALC_DIFF_KG = 2
/** [나중에] 뒤 다시 묻는 추가 변화(kg) */
export const RECALC_SKIP_KG = 1

const tenths = (n: number) => Math.round(n * 10)

/** 0.1kg 단위로 반올림 */
export const roundKg = (n: number) => tenths(n) / 10

/** "58.4"(소수 한 자리) */
export const formatKg = (n: number) => roundKg(n).toFixed(1)

/** 입력 칸 글자 → kg(0.1kg 단위). 숫자가 아니거나 30~250kg 밖이면 null. 쉼표 소수점도 받는다. */
export function parseKg(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d*)?$/.test(s)) return null
  const n = roundKg(Number(s))
  return n >= WEIGHT_MIN && n <= WEIGHT_MAX ? n : null
}

/** 입력이 끝났는데 틀린 값으로 보이는지(두 자리 이상 숫자 또는 소수점이 있는데 parseKg가 null). 한 자리 입력 중에는 안내하지 않는다. */
export function kgInputLooksWrong(raw: string): boolean {
  const s = raw.trim()
  if (s === '') return false
  if (parseKg(s) !== null) return false
  return !/^\d$/.test(s)
}

/** 값이 kg 범위 안의 숫자인지(저장된 값 읽기용) */
export function isKg(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= WEIGHT_MIN && v <= WEIGHT_MAX
}

/** 나의 변화 띠 .delta: 지난 기록(그 날짜 앞 가장 최근 기록)과 비교 */
export function deltaText(kg: number, prevKg: number): string {
  const d = tenths(kg) - tenths(prevKg)
  if (d === 0) return '지난 기록과 같아요'
  return `지난 기록보다 ${formatKg(Math.abs(d) / 10)}kg ${d < 0 ? '줄었어요' : '늘었어요'}`
}

/** 나의 변화 띠 .goalw .tag. 감량 목표면 목표 이하, 증량 목표면 목표 이상, 그 밖에는 같을 때 "도착" */
export function goalTagText(kg: number, targetKg: number, goal?: GoalType): string {
  const d = tenths(targetKg) - tenths(kg) // 양수 = 더 늘려야 목표
  const reached = d === 0 || (goal === 'lose' && d > 0) || (goal === 'gain' && d < 0)
  return reached ? '목표에 도착했어요' : `목표까지 ${formatKg(Math.abs(d) / 10)}kg`
}

/** 최근 체중과 목표 계산 몸무게의 차이(kg, 0.1 단위, 절댓값) */
export function weightGap(goalKg: number, latestKg: number): number {
  return Math.abs(tenths(latestKg) - tenths(goalKg)) / 10
}

/** 목표 다시 계산을 물을지. skipKg = [나중에]를 누른 때의 최근 체중(없으면 null) */
export function shouldAskRecalc(goalKg: number, latestKg: number, skipKg: number | null): boolean {
  if (Math.abs(tenths(latestKg) - tenths(goalKg)) < RECALC_DIFF_KG * 10) return false
  return skipKg === null || Math.abs(tenths(latestKg) - tenths(skipKg)) >= RECALC_SKIP_KG * 10
}

/** 하루에 바뀔 수 있는 체중 한도(2026-10-28 사용자 결정: 하루 3kg 넘게 바뀐 기록은 저장하지 않는다. 설정 몸무게는 막지 않음) */
export const MAX_DAILY_KG = 3

/** 두 dateKey("YYYY-MM-DD") 사이 날수(절댓값) */
function daysApart(a: string, b: string): number {
  const t = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
  return Math.round(Math.abs(t(a) - t(b)) / 864e5)
}

/**
 * 체중 기록이 바로 앞·뒤 기록과 "3kg × 떨어진 날수"보다 많이 다르면 그 기록과 허용 폭을 돌려준다(앞 기록 먼저). 괜찮으면 null.
 * 앞뒤 기록이 없으면 30~250kg 범위만 본다(parseKg).
 */
export function weightJump(
  kg: number,
  dateKey: string,
  before: { dateKey: string; kg: number } | null,
  after: { dateKey: string; kg: number } | null,
): { ref: { dateKey: string; kg: number }; limitKg: number } | null {
  for (const ref of [before, after]) {
    if (!ref || ref.dateKey === dateKey) continue
    const limitKg = MAX_DAILY_KG * daysApart(ref.dateKey, dateKey)
    if (Math.abs(tenths(kg) - tenths(ref.kg)) > limitKg * 10) return { ref, limitKg }
  }
  return null
}
