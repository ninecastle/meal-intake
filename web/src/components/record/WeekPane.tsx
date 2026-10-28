// 기록 보기 [주간] 탭(디자인 조각 D7, 시안 calendar() panes.week 마크업·SVG 값 그대로, 숫자만 실제 데이터). AI 호출 없음.
// .chartcard > header([◀ 지난주] 10.19 – 10.25 [다음 주 ▶]) → SVG 320×170(가로 보조선 4개·눈금 숫자, 목표 점선 ink-3 "4 4", 평균 점선 peach-deep "2 4",
// 먹은 양 lime-deep 3px 선과 점, 요일) → .callout(고른 날 "토요일 섭취 2,290kcal · 목표 대비 121% · 주 평균 1,889kcal 대비 121%").
// 실제 데이터라 달라지는 곳: 세로축 눈금은 그 주 값·목표·평균에 맞춰(lib/week rangeTicks), 목표는 주 중간에 바뀌면 그 날부터 계단(weekGoalSteps),
// 기록 없는 날은 선을 끊고, 오늘 뒤는 그리지 않는다. 평균 글은 시안처럼 평균선 아래(+14, 목표선보다 위면 선 위). 고른 날 기본값은 그 주 가장 최근 기록일.
// 날짜 누르기는 SVG 위 투명 버튼 7개(점 자리 가운데). 항목은 [칼로리|탄|단|지](몸무게 칩이면 그 전 항목, 2026-10-28 사용자 결정).
import { useState, type ReactNode } from 'react'
import type { DatedGoal } from '../../data/goals'
import { goalForDate, metricOf, METRIC_NAME, METRIC_UNIT, REFERENCE_AMOUNT, targetOf, type Metric } from '../../lib/calendar'
import { isCurrentOrLaterWeek, rangeTicks, weekAverage, weekDays, weekGoalSteps } from '../../lib/week'
import type { Nutrients } from '../../types/analysis'
import { formatGrams, formatKcal } from '../mealText'

const WD = ['월', '화', '수', '목', '금', '토', '일'] as const
const DAY_NAME = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'] as const

// 시안 weekSvg 값
const W = 320
const H = 170
const PL = 34
const PR = 40
const PT = 14
const PB = 26
const STEP = (W - PL - PR) / 6
const x = (i: number) => PL + i * STEP

/** "10.19 – 10.25"(홈 날짜 줄과 같은 월.일 두 자리) */
const md = (dateKey: string) => `${Number(dateKey.slice(5, 7))}.${dateKey.slice(8)}`

export interface WeekPaneProps {
  /** 고른 주의 월요일 dateKey(항상 그달 격자 안이라 달력 구독 값을 그대로 쓴다) */
  weekStart: string
  today: string
  metric: Metric
  ready: boolean
  days: ReadonlyMap<string, Nutrients> | null
  goals: readonly DatedGoal[] | null
  /** ◀ 지난주(-1) / 다음 주 ▶(+1) */
  onMoveWeek: (delta: number) => void
}

export default function WeekPane({ weekStart, today, metric, ready, days, goals, onMoveWeek }: WeekPaneProps) {
  const [picked, setPicked] = useState<{ week: string; d: string } | null>(null)
  const keys = weekDays(weekStart)
  const unit = METRIC_UNIT[metric]
  const loaded = ready && days !== null
  const values = keys.map((d) => {
    const t = loaded && d <= today ? days.get(d) : undefined
    return t ? metricOf(t, metric) : null
  })
  const dayGoals = keys.map((d) => {
    const t = ready && goals ? targetOf(goalForDate(goals, d), metric) : null
    return t !== null && t > 0 ? t : null
  })
  const steps = weekGoalSteps(dayGoals)
  const avg = loaded ? weekAverage(values) : null
  const ticks = rangeTicks([...values, ...(steps ?? []), avg].filter((v): v is number => v !== null), REFERENCE_AMOUNT[metric])
  const lo = ticks[0]
  const hi = ticks[3]
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB)

  // 고른 날: 누른 날(이 주) → 없으면 그 주 가장 최근 기록일
  let lastRecorded = -1
  values.forEach((v, i) => {
    if (v !== null) lastRecorded = i
  })
  const pickedIdx = picked?.week === weekStart ? keys.indexOf(picked.d) : -1
  const sel = loaded ? (pickedIdx >= 0 ? pickedIdx : lastRecorded) : -1

  // 먹은 양 선: 기록이 이어지는 날끼리(기록 없는 날에서 끊긴다)
  const lines: string[] = []
  let cur: string[] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length > 1) lines.push(cur.join(' '))
      cur = []
    } else cur.push(`${cur.length ? 'L' : 'M'}${x(i)} ${y(v)}`)
  })
  if (cur.length > 1) lines.push(cur.join(' '))

  // 목표 점선: 바뀌는 날은 두 점 사이 가운데에서 세로로
  let goalPath = ''
  if (steps) {
    goalPath = `M${x(0)} ${y(steps[0])}`
    for (let i = 1; i < 7; i++) {
      if (steps[i] !== steps[i - 1]) goalPath += ` H${(x(i - 1) + x(i)) / 2} V${y(steps[i])}`
    }
    goalPath += ` H${x(6)}`
  }

  // 오른쪽 끝 글: "목표"는 선 높이 + 4(시안), "평균"은 시안처럼 평균선 바로 아래(+14). 평균선이 목표선보다 위면 평균선 바로 위(−6)로
  // 올려 목표 글과 겹치지 않게 한다. 목표가 없으면 평균 글도 선 높이 + 4
  const ends: { kind: 'goal' | 'avg'; ty: number }[] = []
  if (steps) ends.push({ kind: 'goal', ty: y(steps[6]) + 4 })
  if (avg !== null) ends.push({ kind: 'avg', ty: !steps ? y(avg) + 4 : y(avg) >= y(steps[6]) ? y(avg) + 14 : y(avg) - 6 })

  const amount = (n: number) => `${unit === 'kcal' ? formatKcal(n) : formatGrams(n)}${unit}`
  const thisWeek = isCurrentOrLaterWeek(weekStart, today)

  let callout: ReactNode
  if (!ready) callout = '불러오는 중…'
  else if (days === null) callout = '기록을 불러오지 못했어요'
  else if (lastRecorded < 0 && sel < 0) callout = '이 주에는 기록이 없어요'
  else {
    const v = values[sel]
    const g = dayGoals[sel]
    callout =
      v === null ? (
        <>
          <b>{DAY_NAME[sel]}</b>은 기록이 없어요
        </>
      ) : (
        <>
          <b>{DAY_NAME[sel]}</b>
          {unit === 'kcal' ? ' 섭취 ' : ` ${METRIC_NAME[metric]} `}
          <b className="num">{amount(v)}</b>
          {g !== null && (
            <>
              {' · 목표 대비 '}
              <b className="num">{`${Math.round((v / g) * 100)}%`}</b>
            </>
          )}
          {avg !== null && avg > 0 && (
            <>
              {' · 주 평균 '}
              <span className="num">{amount(avg)}</span>
              {' 대비 '}
              <b className="num">{`${Math.round((v / avg) * 100)}%`}</b>
            </>
          )}
        </>
      )
  }

  return (
    <div className="chartcard">
      <header>
        <button type="button" className="chipbtn" aria-label="지난주" onClick={() => onMoveWeek(-1)}>
          ◀ 지난주
        </button>
        <h3 className="num">{`${md(keys[0])} – ${md(keys[6])}`}</h3>
        <button
          type="button"
          className="chipbtn"
          aria-label="다음 주"
          disabled={thisWeek}
          style={thisWeek ? { color: 'var(--ink-3)', cursor: 'not-allowed' } : undefined}
          onClick={() => onMoveWeek(1)}
        >
          다음 주 ▶
        </button>
      </header>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`주간 섭취 ${METRIC_NAME[metric]}`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PL - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
                {v}
              </text>
            </g>
          ))}
          {steps && <path d={goalPath} fill="none" stroke="var(--ink-3)" strokeDasharray="4 4" />}
          {avg !== null && <line x1={PL} x2={W - PR} y1={y(avg)} y2={y(avg)} stroke="var(--peach-deep)" strokeDasharray="2 4" />}
          {ends.map((e) => (
            <text key={e.kind} x={W - PR + 4} y={e.ty} fontSize="10" fill={e.kind === 'goal' ? 'var(--ink-2)' : 'var(--peach-deep)'}>
              {e.kind === 'goal' ? '목표' : '평균'}
            </text>
          ))}
          {lines.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--lime-deep)" strokeWidth="3" strokeLinejoin="round" />
          ))}
          {values.map((v, i) =>
            v === null ? null : (
              <circle
                key={keys[i]}
                cx={x(i)}
                cy={y(v)}
                r={i === sel ? 5 : 3.5}
                fill={i === sel ? 'var(--lime-deep)' : 'var(--surface)'}
                stroke="var(--lime-deep)"
                strokeWidth="2"
              />
            ),
          )}
          {WD.map((w, i) => (
            <text key={w} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-2)">
              {w}
            </text>
          ))}
        </svg>
        {/* 날짜 누르기: 점 자리를 가운데로 한 세로 띠 7개(그래프 전체 높이) */}
        <div
          style={{
            position: 'absolute',
            inset: `0 auto 0 ${((PL - STEP / 2) / W) * 100}%`,
            width: `${((STEP * 7) / W) * 100}%`,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          }}
        >
          {keys.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-label={DAY_NAME[i]}
              aria-pressed={i === sel}
              disabled={!loaded || d > today}
              style={{ padding: 0, minWidth: 0, cursor: !loaded || d > today ? 'default' : undefined }}
              onClick={() => setPicked({ week: weekStart, d })}
            />
          ))}
        </div>
      </div>
      <div className="callout" aria-live="polite">
        {callout}
      </div>
    </div>
  )
}
