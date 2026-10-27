// 기록 보기 ① 주간 추이(3단계 조각 4, 스펙 4.7절 "주간 추이")의 순수 함수. Firestore·AI 호출 없음.
// 한 주 = 달력과 같은 월요일~일요일. 주는 그 주 월요일 dateKey로 가리킨다.
import { monthGrid, monthRange } from './calendar.ts'

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const pad = (n: number) => String(n).padStart(2, '0')
const toUtc = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const isRealDate = (v: string) => DATE_RE.test(v) && fromUtc(toUtc(v)) === v

/** 그 날짜가 든 주의 월요일 */
export function mondayOf(dateKey: string): string {
  const t = toUtc(dateKey)
  const back = (new Date(t).getUTCDay() + 6) % 7 // 월 0 … 일 6
  return fromUtc(t - back * DAY_MS)
}

/** 월요일부터 7일 */
export function weekDays(monday: string): string[] {
  const t = toUtc(monday)
  return Array.from({ length: 7 }, (_, i) => fromUtc(t + i * DAY_MS))
}

/** 주 옮기기(delta 주) */
export function shiftWeek(monday: string, delta: number): string {
  return fromUtc(toUtc(monday) + delta * 7 * DAY_MS)
}

/** 보고 있는 달의 기본 주: 이번 달(또는 그 뒤)이면 오늘이 든 주, 지난 달이면 그달 말일이 든 주. */
export function defaultWeek(month: string, todayKey: string): string {
  if (month >= todayKey.slice(0, 7)) return mondayOf(todayKey)
  return mondayOf(monthRange(month).end)
}

/** 주가 그달 격자(앞뒤 달 날짜를 채운 월요일 시작 격자) 안이면 그 달을 유지하고, 밖이면 그 주 월요일이 든 달로 옮긴다. */
export function monthForWeek(currentMonth: string, monday: string): string {
  const g = monthGrid(currentMonth)
  if (monday >= g[0].dateKey && monday <= g[g.length - 1].dateKey) return currentMonth
  return monday.slice(0, 7)
}

/** 주소의 ?week 검증: 실제 날짜이고 월요일이고 그달 격자 안이고 오늘이 든 주보다 뒤가 아니면 그 값, 아니면 defaultWeek. */
export function parseWeek(v: unknown, month: string, todayKey: string): string {
  if (typeof v !== 'string' || !isRealDate(v) || mondayOf(v) !== v) return defaultWeek(month, todayKey)
  if (v > mondayOf(todayKey) || monthForWeek(month, v) !== month) return defaultWeek(month, todayKey)
  return v
}

/** 이번 주(오늘이 든 주)면 "다음 주 ▶"를 막는다 */
export function isCurrentOrLaterWeek(monday: string, todayKey: string): boolean {
  return monday >= mondayOf(todayKey)
}

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** x 이상인 보기 좋은 수(1·1.2·1.5·2·2.5·3·4·5·6·8 × 10^k) */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 0
  const p = 10 ** Math.floor(Math.log10(x))
  const f = x / p
  const nf = NICE.find((n) => f <= n + 1e-9) ?? 10
  return Math.round(nf * p * 1e6) / 1e6
}

/**
 * 그래프 세로축 눈금 5개(0과 4칸). 값·목표 가운데 가장 큰 값의 110% 이상이 되게 칸 크기를 보기 좋은 수로 올린다.
 * 값이 모두 없거나 0이면 fallbackMax(예: 기준량)를 쓴다.
 */
export function axisTicks(values: readonly number[], fallbackMax: number): number[] {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0)
  const max = finite.length > 0 ? Math.max(...finite) : fallbackMax
  const step = niceCeil((max * 1.1) / 4) || 1
  return [0, step, step * 2, step * 3, step * 4]
}

/**
 * 주간 그래프 목표선(2026-10-27 사용자 결정): 날짜별 목표를 주 전체 폭(월~일)에 계단 모양으로 잇는다.
 * 목표를 정하기 전 날(앞쪽 null)은 그 주에 처음 적용된 목표로 채운다. 그 주에 목표가 하나도 없으면 null(목표선 없음).
 * 목표를 한 번 정한 뒤의 날은 goalForDate가 항상 값을 주므로 가운데·뒤쪽 null은 생기지 않지만, 생기면 바로 앞 값을 잇는다.
 */
export function weekGoalSteps(goals: readonly (number | null)[]): number[] | null {
  const first = goals.find((g): g is number => g !== null && Number.isFinite(g))
  if (first === undefined) return null
  let prev = first
  return goals.map((g) => {
    if (g !== null && Number.isFinite(g)) prev = g
    return prev
  })
}

/** 주간 평균(평균선·상세 비교): 그 주에 기록이 있는 날(값이 null이 아닌 날)만으로 낸다. 기록이 없으면 null. */
export function weekAverage(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x))
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null
}
