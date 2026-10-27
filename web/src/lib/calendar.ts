// 달력(S10, 3단계 조각 3-1, 스펙 4.7절 "달력")과 주간 추이에서 쓰는 순수 함수. Firestore·AI 호출 없음.
// 날짜는 모두 Asia/Seoul dateKey('YYYY-MM-DD') 문자열로 다룬다(문자열 비교 = 날짜 비교).
import type { DatedGoal } from '../data/goals'
import type { GoalTargets } from '../analysis/goal'

/** 목표 대비 색. null = 색 없음(그날 목표가 없거나 미래). */
export type CalendarTone = 'green' | 'orange' | 'blue' | 'gray' | null

/** 목표의 90~110%(경계 포함)면 초록 */
export const TONE_LOW = 0.9
export const TONE_HIGH = 1.1

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 그날 색. 그날 목표가 없으면 색 없이 숫자만(null).
 * 목표가 있으면 기록 없음(kcal null) 회색, 목표의 90~110% 초록, 110% 초과 주황, 90% 미만 파랑.
 */
export function calendarTone(kcal: number | null, targetKcal: number | null): CalendarTone {
  if (targetKcal === null || !(targetKcal > 0)) return null
  if (kcal === null) return 'gray'
  const r = kcal / targetKcal
  if (r > TONE_HIGH) return 'orange'
  if (r < TONE_LOW) return 'blue'
  return 'green'
}

/** 'YYYY-MM'으로 바꾼다. 형식이 틀리거나 이번 달보다 뒤면 이번 달. */
export function parseMonth(v: unknown, todayKey: string): string {
  const thisMonth = todayKey.slice(0, 7)
  if (typeof v !== 'string' || !MONTH_RE.test(v)) return thisMonth
  return v > thisMonth ? thisMonth : v
}

/** 달 옮기기(delta 개월). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + (m - 1) + delta
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 그달 첫날·말일 dateKey(범위 쿼리용, 둘 다 포함). */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` }
}

/** 달력 칸: 일요일 시작 7칸씩, 1일 앞은 null, 마지막 주 뒤도 7칸이 차도록 null. */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number)
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0 = 일요일
  const n = daysInMonth(month)
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= n; d++) cells.push(`${month}-${pad(d)}`)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * 날짜 D의 비교 목표: 목표 기록 가운데 dateKey <= D인 것 중 가장 늦은 것(스펙 4.7절 "날짜별 목표 기록").
 * goals는 순서와 상관없다. 없으면 null(목표를 처음 정하기 전의 날).
 */
export function goalForDate(goals: readonly DatedGoal[], dateKey: string): GoalTargets | null {
  let best: DatedGoal | null = null
  for (const g of goals) {
    if (g.dateKey <= dateKey && (best === null || g.dateKey > best.dateKey)) best = g
  }
  return best?.targets ?? null
}
