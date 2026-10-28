// 기록 보기(S10 달력, 3단계 조각 3-1, 스펙 4.7절 "기록 보기")와 주간 추이에서 쓰는 순수 함수. Firestore·AI 호출 없음.
// 날짜는 모두 Asia/Seoul dateKey('YYYY-MM-DD') 문자열로 다룬다(문자열 비교 = 날짜 비교).
// 히트맵(2026-10-27 사용자 결정): 고른 항목(칼로리·탄·단·지)의 그날 목표 대비 %로 한 가지 색의 진하기 4단계.
import type { DatedGoal } from '../data/goals'
import type { GoalTargets } from '../analysis/goal'
import type { Nutrients } from '../types/analysis'

export type Metric = 'kcal' | 'carbs_g' | 'protein_g' | 'fat_g'
export const METRICS: readonly Metric[] = ['kcal', 'carbs_g', 'protein_g', 'fat_g']
/** 선택 버튼 글자 [칼로리 | 탄 | 단 | 지] */
export const METRIC_LABEL: Record<Metric, string> = { kcal: '칼로리', carbs_g: '탄', protein_g: '단', fat_g: '지' }
export const METRIC_UNIT: Record<Metric, 'kcal' | 'g'> = { kcal: 'kcal', carbs_g: 'g', protein_g: 'g', fat_g: 'g' }
/** 화면 읽기·설명 글에 쓰는 항목 이름(버튼 글자 METRIC_LABEL의 긴 이름) */
export const METRIC_NAME: Record<Metric, string> = { kcal: '칼로리', carbs_g: '탄수화물', protein_g: '단백질', fat_g: '지방' }

/** 달력 항목 칩(디자인 조각 D7, 시안 .nchips [칼로리|탄|단|지|몸무게]). 몸무게는 달력에만 쓴다(2026-10-28 사용자 결정) */
export type CalNut = Metric | 'weight'
export const CAL_NUTS: readonly CalNut[] = [...METRICS, 'weight']
export const CAL_NUT_LABEL: Record<CalNut, string> = { ...METRIC_LABEL, weight: '몸무게' }

/** 목표 범위(✓): 목표의 90~110%, 경계 포함 */
export const RANGE_LOW = 0.9
export const RANGE_HIGH = 1.1
/** 진하기 1단계 끝(목표의 50%) */
export const LEVEL1_HIGH = 0.5
/**
 * 그날 목표가 없을 때 진하기 기준이 되는 양(리더 결정): 일반 성인 하루 2,000kcal을 유지 비율 55:20:25로 나눈 값.
 * 이 기준으로는 ✓를 붙이지 않는다(목표가 아니므로).
 */
export const REFERENCE_AMOUNT: Record<Metric, number> = { kcal: 2000, carbs_g: 275, protein_g: 100, fat_g: 56 }

/** 0 = 기록 없음, 1 = 50% 미만, 2 = 50~90%, 3 = 90~110%(목표 범위), 4 = 110% 초과 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4
export interface HeatCell {
  level: HeatLevel
  /** 그날 목표가 있고 90~110%면 true(✓) */
  inRange: boolean
  /** 값 ÷ 기준(목표 또는 REFERENCE_AMOUNT). 기록 없으면 null */
  ratio: number | null
  /** 진하기 기준. 기록 없으면 null */
  basis: 'goal' | 'reference' | null
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')
const toUtc = (dateKey: string) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 하루 합계에서 고른 항목의 값 */
export function metricOf(n: Nutrients, m: Metric): number {
  return n[m]
}

/** 목표에서 고른 항목의 값(kcal은 target_kcal). 목표가 없으면 null */
export function targetOf(t: GoalTargets | null, m: Metric): number | null {
  if (!t) return null
  return m === 'kcal' ? t.target_kcal : t[m]
}

/** 그날 칸의 진하기. value null = 기록 없음. target이 없거나 0 이하면 REFERENCE_AMOUNT 기준(✓ 없음). */
export function heatLevelFor(value: number | null, target: number | null, metric: Metric): HeatCell {
  if (value === null) return { level: 0, inRange: false, ratio: null, basis: null }
  const hasGoal = target !== null && target > 0
  const base = hasGoal ? target : REFERENCE_AMOUNT[metric]
  const ratio = value / base
  const level: HeatLevel = ratio < LEVEL1_HIGH ? 1 : ratio < RANGE_LOW ? 2 : ratio <= RANGE_HIGH ? 3 : 4
  return { level, inRange: hasGoal && level === 3, ratio, basis: hasGoal ? 'goal' : 'reference' }
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

/** 그달 첫날·말일 dateKey(둘 다 포함). */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` }
}

export interface GridCell {
  dateKey: string
  /** 보고 있는 달의 날짜면 true. 앞뒤 달 날짜는 false(흐리게 채운다) */
  inMonth: boolean
}

/** 월요일 시작 격자: 1일 앞은 지난달 날짜, 말일 뒤는 다음 달 날짜로 채워 빈칸이 없다(5주 또는 6주, 4주인 달도 있다). */
export function monthGrid(month: string): GridCell[] {
  const { start, end } = monthRange(month)
  const first = toUtc(start)
  const lead = (new Date(first).getUTCDay() + 6) % 7 // 월요일 0 … 일요일 6
  const last = toUtc(end)
  const trail = 6 - ((new Date(last).getUTCDay() + 6) % 7)
  const cells: GridCell[] = []
  for (let t = first - lead * DAY_MS; t <= last + trail * DAY_MS; t += DAY_MS) {
    const dateKey = fromUtc(t)
    cells.push({ dateKey, inMonth: dateKey >= start && dateKey <= end })
  }
  return cells
}

/** 격자 첫 칸~마지막 칸(앞뒤 달 날짜 포함) 범위. 조회(subscribeDaysInRange, 최대 42일)에 쓴다. */
export function gridRange(month: string): { start: string; end: string } {
  const g = monthGrid(month)
  return { start: g[0].dateKey, end: g[g.length - 1].dateKey }
}

/** 월 요약: 그달(앞뒤 달 날짜 제외) 기록이 있는 날 수와 그날들의 하루 평균. 기록 없으면 average null. */
export function monthSummary(valueByDate: ReadonlyMap<string, number>, month: string): { recordDays: number; average: number | null } {
  const { start, end } = monthRange(month)
  let n = 0
  let sum = 0
  for (const [d, v] of valueByDate) {
    if (d < start || d > end) continue
    n++
    sum += v
  }
  return { recordDays: n, average: n > 0 ? sum / n : null }
}

/** 월간 그래프(D7) 막대 수: 이번 달이면 오늘까지, 지난 달이면 말일까지 */
export function monthDayCount(month: string, todayKey: string): number {
  return month === todayKey.slice(0, 7) ? Number(todayKey.slice(8)) : daysInMonth(month)
}

/**
 * 월간 그래프 가로축 날짜(시안 1·8·15·22·27일): 1일부터 7일마다 + 마지막 날.
 * 마지막 날이 바로 앞 눈금과 4일 안이면 그 눈금 자리에 마지막 날을 쓴다(글자가 겹치지 않게). 5일 전이면 1일만.
 */
export function monthDayLabels(n: number): number[] {
  const out: number[] = []
  for (let d = 1; d <= n; d += 7) out.push(d)
  const last = out[out.length - 1]
  if (last !== n) {
    if (n - last >= 4) out.push(n)
    else if (out.length > 1) out[out.length - 1] = n
  }
  return out
}

/** 그달(앞뒤 달 날짜 제외) 기록한 날 가운데 목표 범위(90~110%) 안에 든 날 수. 그날 목표가 있는 기록일이 하나도 없으면 null */
export function monthInRangeDays(
  valueByDate: ReadonlyMap<string, number>,
  month: string,
  goals: readonly DatedGoal[],
  metric: Metric,
): number | null {
  const { start, end } = monthRange(month)
  let any = false
  let n = 0
  for (const [d, v] of valueByDate) {
    if (d < start || d > end) continue
    const t = targetOf(goalForDate(goals, d), metric)
    if (t === null || !(t > 0)) continue
    any = true
    if (heatLevelFor(v, t, metric).inRange) n++
  }
  return any ? n : null
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
