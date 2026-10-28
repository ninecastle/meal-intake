// 기록 보기 [월간 👑] 탭(디자인 조각 D7, 시안 calendar() panes.month 마크업·SVG 값 그대로, 숫자만 실제 데이터). AI 호출 없음.
// 프리미엄은 왕관 표시만(결제·잠금 없음, CLAUDE.md). .chartcard > header("10월 일별 칼로리" + 왕관) → SVG 320×150(눈금 0과 3칸, 날짜별 막대,
// 1·8·15·22·마지막 날 글자, 목표 점선) → .callout "이번 달 하루 평균 1,812kcal, 목표 범위(90~110%) 안에 든 날은 13일이에요."
// 막대는 이번 달이면 오늘까지, 지난 달이면 말일까지(lib/calendar monthDayCount). 기록 없는 날은 막대 없음. 막대 색은 달력과 같은 기준으로
// 110% 초과(진하기 4단계)면 peach, 아니면 lime. 목표가 달 중간에 바뀌면 그 날부터 계단(목표 전 날은 그달 첫 목표로 잇는다).
import type { ReactNode } from 'react'
import type { DatedGoal } from '../../data/goals'
import {
  goalForDate,
  heatLevelFor,
  metricOf,
  METRIC_NAME,
  METRIC_UNIT,
  monthDayCount,
  monthDayLabels,
  monthInRangeDays,
  monthSummary,
  REFERENCE_AMOUNT,
  targetOf,
  type Metric,
} from '../../lib/calendar'
import { axisTicks, weekGoalSteps } from '../../lib/week'
import type { Nutrients } from '../../types/analysis'
import { formatGrams, formatKcal } from '../mealText'
import { Crown } from '../ui'

// 시안 monthSvg 값
const MW = 320
const MH = 150
const L = 34
const R = 8
const PLOT = MH - 34

export interface MonthPaneProps {
  month: string
  today: string
  metric: Metric
  ready: boolean
  days: ReadonlyMap<string, Nutrients> | null
  goals: readonly DatedGoal[] | null
}

export default function MonthPane({ month, today, metric, ready, days, goals }: MonthPaneProps) {
  const m = Number(month.slice(5))
  const n = monthDayCount(month, today)
  const bw = (MW - L - R) / n
  const unit = METRIC_UNIT[metric]
  const keys = Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
  const loaded = ready && days !== null
  const values = keys.map((d) => {
    const t = loaded ? days.get(d) : undefined
    return t ? metricOf(t, metric) : null
  })
  const dayGoals = keys.map((d) => {
    const t = ready && goals ? targetOf(goalForDate(goals, d), metric) : null
    return t !== null && t > 0 ? t : null
  })
  const steps = weekGoalSteps(dayGoals)
  const ticks = axisTicks([...values, ...(steps ?? [])].filter((v): v is number => v !== null), REFERENCE_AMOUNT[metric], 3)
  const max = ticks[ticks.length - 1]
  const y = (v: number) => 10 + (1 - v / max) * PLOT

  let goalPath = ''
  if (steps) {
    goalPath = `M${L} ${y(steps[0])}`
    steps.forEach((v, i) => {
      if (i > 0 && v !== steps[i - 1]) goalPath += ` V${y(v)}`
      goalPath += ` H${L + (i + 1) * bw}`
    })
  }

  const amount = (v: number) => `${unit === 'kcal' ? formatKcal(v) : formatGrams(v)}${unit}`
  const where = month === today.slice(0, 7) ? '이번 달' : `${m}월`
  let callout: ReactNode
  if (!ready) callout = '불러오는 중…'
  else if (days === null) callout = '기록을 불러오지 못했어요'
  else {
    const byDate = new Map<string, number>()
    values.forEach((v, i) => {
      if (v !== null) byDate.set(keys[i], v)
    })
    const avg = monthSummary(byDate, month).average
    const inRange = goals ? monthInRangeDays(byDate, month, goals, metric) : null
    callout =
      avg === null ? (
        `${where}에는 기록이 없어요`
      ) : inRange === null ? (
        <>
          {`${where} 하루 평균 `}
          <b className="num">{amount(avg)}</b>이에요.
        </>
      ) : (
        <>
          {`${where} 하루 평균 `}
          <b className="num">{amount(avg)}</b>
          {', 목표 범위(90~110%) 안에 든 날은 '}
          <b className="num">{`${inRange}일`}</b>이에요.
        </>
      )
  }

  return (
    <div className="chartcard">
      <header>
        <h3>{`${m}월 일별 ${METRIC_NAME[metric]}`}</h3>
        <Crown />
      </header>
      <svg viewBox={`0 0 ${MW} ${MH}`} role="img" aria-label={`${m}월 일별 섭취 ${METRIC_NAME[metric]}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={MW - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x="28" y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
              {v}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          if (v === null || !(v > 0)) return null
          const h = (Math.min(v, max) / max) * PLOT
          const over = heatLevelFor(v, dayGoals[i], metric).level === 4
          return <rect key={keys[i]} x={L + i * bw + 1} y={10 + PLOT - h} width={bw - 2} height={h} rx="2" fill={over ? 'var(--peach)' : 'var(--lime)'} />
        })}
        {monthDayLabels(n).map((d) => (
          <text key={d} x={L + (d - 1) * bw + bw / 2} y={MH - 6} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
            {`${d}일`}
          </text>
        ))}
        {steps && <path d={goalPath} fill="none" stroke="var(--ink-3)" strokeDasharray="4 4" />}
      </svg>
      <div className="callout">{callout}</div>
    </div>
  )
}
