// 기록 보기(S10) ① 주간 추이(3단계 조각 4, M17, 스펙 4.7절 "주간 추이"). AI 호출 없음.
// 그리기만 한다: 고른 주(?week → parseWeek)·항목·조회 결과는 페이지(CalendarPage)가 넘긴다. 고른 주는 항상 그달 격자 안이라
// 달력이 이미 구독한 격자 범위 값(날짜별 totals·목표 기록)을 그대로 쓴다(새 구독 없음).
// 계산은 lib/calendar.ts(metricOf·targetOf·goalForDate)와 lib/week.ts(weekDays·axisTicks·weekGoalSteps·weekAverage·
// isCurrentOrLaterWeek) 그대로. 그래프는 인라인 SVG(외부 차트 라이브러리 없음, viewBox + 폭 100%).
// 선(2026-10-27 사용자 요청): 먹은 양 = emerald 실선·점(오늘까지), 목표 = 회색 점선(weekGoalSteps, 월~일 전체 폭, 바뀐 날부터 계단),
// 평균 = amber 둥근 점 줄(weekAverage, 기록한 날만, 월~일 전체 폭). 목표·평균 값 글은 그래프 오른쪽 전용 자리(LABEL)에 둔다.
// 날짜 칸 누르기는 SVG 위에 겹친 HTML 버튼 7개(눈금 자리 AXIS와 값 글 자리 LABEL 사이, 높이 = 그래프 전체).
import { useState } from 'react'
import type { DatedGoal } from '../../data/goals'
import { goalForDate, metricOf, METRIC_UNIT, REFERENCE_AMOUNT, targetOf, type Metric } from '../../lib/calendar'
import { axisTicks, isCurrentOrLaterWeek, weekAverage, weekDays, weekGoalSteps } from '../../lib/week'
import type { Nutrients } from '../../types/analysis'
import { dateKeyLabel, formatGrams, formatKcal } from '../mealText'
import { METRIC_NAME } from './MetricToggle'
import { RECORD_CARD } from './RecordHeatmap'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

// SVG 좌표(viewBox). 360px 폰 카드 안쪽 폭 314px와 1:1(태블릿 카드 안쪽 최대 402px에서 약 1.28배).
// 왼쪽 AXIS = 세로축 눈금 숫자 자리, 가운데 7칸 = 날짜(360px에서 칸·누르는 띠 36.25px),
// 오른쪽 LABEL = 목표·평균 값 글 자리(두 줄 "목표" / "2,060"). 선·점은 LABEL로 들어가지 않아 값 글과 겹치지 않는다.
const AXIS = 29.5
const COL = 36.25
const LABEL = 30.75
const PLOT_R = AXIS + COL * 7 // 날짜 칸 오른쪽 끝(목표·평균선 끝)
const W = PLOT_R + LABEL // 314
const TOP = 14 // 맨 위 보조선
const BASE = 138 // 세로축 0
const WD_Y = 155 // 요일 글자 기준선
const DATE_Y = 171 // 날짜 글자 기준선
const H = 180
const cx = (i: number) => AXIS + COL * i + COL / 2

/** 오른쪽 값 글 한 개: 값 기준선 = cy + 3.5(선 높이에 가운데), 이름 기준선 = cy − 7. 차지하는 높이 = [cy − 15, cy + 5].
 *  두 글 사이는 6 더 띄운다(한 글 안의 이름·값 줄 간격보다 넓게 해서 "평균 1,919"·"목표 1,900"이 네 줄 같은 간격으로 보이지 않게) */
const LABEL_UP = 15
const LABEL_DOWN = 5
const LABEL_GAP = LABEL_UP + LABEL_DOWN + 6

interface EndLabel {
  kind: 'goal' | 'avg'
  word: string
  value: string
  /** 선 높이 */
  y: number
}

/** 값 글 높이 정하기: 두 글이 겹치면 두 선 가운데를 기준으로 위아래로 비켜 놓고(위쪽 선 글이 위), 그래프 위아래 밖으로 나가지 않게 민다 */
function placeEndLabels(labels: readonly EndLabel[]): (EndLabel & { cy: number })[] {
  const out = labels.map((l) => ({ ...l, cy: l.y })).sort((a, b) => a.y - b.y)
  if (out.length === 2 && out[1].cy - out[0].cy < LABEL_GAP) {
    const mid = (out[0].y + out[1].y) / 2
    out[0].cy = mid - LABEL_GAP / 2
    out[1].cy = mid + LABEL_GAP / 2
  }
  if (out.length > 0) {
    const over = LABEL_UP - out[0].cy
    if (over > 0) for (const l of out) l.cy += over
    const under = out[out.length - 1].cy + LABEL_DOWN - H
    if (under > 0) for (const l of out) l.cy -= under
  }
  return out
}

/** 눈금 숫자: 소수 눈금(예: 1.5g)을 반올림하지 않게 한 자리까지 */
const tickText = (t: number) => t.toLocaleString('ko-KR', { maximumFractionDigits: 1 })

interface DayPoint {
  i: number
  d: string
  future: boolean
  /** 그날 고른 항목 합계. 기록 없음·미래·불러오기 전이면 null(0으로 그리지 않는다) */
  value: number | null
  /** 그날 목표(goalForDate, 상세·화면 읽기용). 목표 기록 없음·미래·목표를 못 불러왔으면 null */
  target: number | null
}

/** 값이 이어지는 날끼리 묶는다(null에서 끊긴다) */
function runs(points: readonly DayPoint[], pick: (p: DayPoint) => number | null): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = []
  let cur: { i: number; v: number }[] = []
  for (const p of points) {
    const v = pick(p)
    if (v === null) {
      if (cur.length > 0) out.push(cur)
      cur = []
    } else cur.push({ i: p.i, v })
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/** "10월 26일~11월 1일", 같은 달이면 "11월 2일~8일" */
function rangeLabel(keys: readonly string[]): string {
  const [, m1, d1] = keys[0].split('-').map(Number)
  const [, m2, d2] = keys[6].split('-').map(Number)
  return m1 === m2 ? `${m1}월 ${d1}일~${d2}일` : `${m1}월 ${d1}일~${m2}월 ${d2}일`
}

export interface WeeklyTrendProps {
  /** 고른 주의 월요일 dateKey(페이지가 ?week를 parseWeek로 읽은 값, 항상 그달 격자 안) */
  weekStart: string
  /** 오늘 dateKey */
  today: string
  metric: Metric
  /** 두 구독(기록·목표)의 첫 값(또는 오류)이 모두 왔는지 */
  ready: boolean
  /** 격자 범위 날짜별 하루 합계(done만). ready인데 null이면 기록을 못 불러옴 */
  days: ReadonlyMap<string, Nutrients> | null
  /** 격자 끝 날짜까지의 날짜별 목표. ready인데 null이면 목표를 못 불러옴(점선 없이) */
  goals: readonly DatedGoal[] | null
  /** ◀ 지난주(-1) / 다음 주 ▶(+1). 주·달 바꾸기는 페이지가 한다 */
  onMoveWeek: (delta: number) => void
  /** [그날 기록 보기] = 달력 날짜 누르기와 같은 처리 */
  onOpenDay: (dateKey: string) => void
}

export default function WeeklyTrend({ weekStart, today, metric, ready, days, goals, onMoveWeek, onOpenDay }: WeeklyTrendProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const keys = weekDays(weekStart)
  const range = rangeLabel(keys)
  const unit = METRIC_UNIT[metric]
  const loaded = ready && days !== null
  const goalsKnown = ready && goals !== null

  // 7일 모두(미래 포함)의 그날 목표. 목표선은 월~일 전체 폭이라 미래 날도 넣는다
  const dayGoals = keys.map((d) => {
    const t = ready && goals ? targetOf(goalForDate(goals, d), metric) : null
    return t !== null && t > 0 ? t : null
  })
  const points: DayPoint[] = keys.map((d, i) => {
    const future = d > today
    const totals = ready && !future ? days?.get(d) : undefined
    return { i, d, future, value: totals ? metricOf(totals, metric) : null, target: future ? null : dayGoals[i] }
  })
  const recorded = points.filter((p): p is DayPoint & { value: number } => p.value !== null)
  /** 목표선: 바뀐 날부터 계단, 목표 정하기 전 날은 그 주 첫 목표로. 그 주에 목표가 없으면 null(선 없음) */
  const steps = weekGoalSteps(dayGoals)
  /** 평균선: 그 주에 기록한 날만으로. 기록이 없으면 null(선 없음) */
  const avg = loaded ? weekAverage(points.map((p) => p.value)) : null

  const ticks = axisTicks(
    [...points.map((p) => p.value), ...(steps ?? []), avg].filter((v): v is number => v !== null),
    REFERENCE_AMOUNT[metric],
  )
  const max = ticks[ticks.length - 1]
  const yOf = (v: number) => BASE - (v / max) * (BASE - TOP)

  const valueRuns = runs(points, (p) => p.value)

  // 목표 계단 경로: 각 날 칸 왼쪽 끝~오른쪽 끝 가로, 값이 바뀌는 칸 경계에서 세로
  let goalPath = ''
  if (steps) {
    goalPath = `M${AXIS},${yOf(steps[0])}`
    steps.forEach((v, i) => {
      if (i > 0 && v !== steps[i - 1]) goalPath += ` V${yOf(v)}`
      goalPath += ` H${AXIS + COL * (i + 1)}`
    })
  }

  // 고른 날: 다른 주로 옮기면 그 주에 없으니 저절로 풀린다
  const sel = loaded ? (points.find((p) => p.d === picked && !p.future) ?? null) : null

  const fmt = (n: number) => (unit === 'kcal' ? formatKcal(n) : formatGrams(n))
  const amount = (n: number) => `${fmt(n)}${unit}`
  /** 먹은 양: kcal은 "511kcal", g 항목은 "탄수화물 230g" */
  const eaten = (n: number) => (unit === 'kcal' ? amount(n) : `${METRIC_NAME[metric]} ${amount(n)}`)

  // 오른쪽 값 글: 목표는 일요일 값(계단이면 마지막 값), 평균은 그 주 평균
  const endLabels = placeEndLabels([
    ...(steps ? [{ kind: 'goal' as const, word: '목표', value: fmt(steps[6]), y: yOf(steps[6]) }] : []),
    ...(avg !== null ? [{ kind: 'avg' as const, word: '평균', value: fmt(avg), y: yOf(avg) }] : []),
  ])

  /**
   * 날짜 상세 줄(2026-10-27 사용자 결정): "탄수화물 274g" / "목표 376g 대비 73%" / "주 평균 202g 대비 136%".
   * 칼로리도 "칼로리 511kcal". 목표가 없는 날은 목표 줄 대신 "목표 없음", 그날 기록이 없으면 목표 줄에 %를 붙이지 않는다.
   * 주 평균 줄은 그날 기록과 평균(0 초과)이 있을 때만. 목표를 못 불러왔으면 목표 줄은 뺀다.
   */
  function detailLines(p: DayPoint): string[] {
    const name = METRIC_NAME[metric]
    const lines = [p.value === null ? `${name} 기록 없음` : `${name} ${amount(p.value)}`]
    if (goalsKnown) {
      if (p.target === null) lines.push('목표 없음')
      else if (p.value === null || !(p.target > 0)) lines.push(`목표 ${amount(p.target)}`)
      else lines.push(`목표 ${amount(p.target)} 대비 ${Math.round((p.value / p.target) * 100)}%`)
    }
    if (p.value !== null && avg !== null && avg > 0) {
      lines.push(`주 평균 ${amount(avg)} 대비 ${Math.round((p.value / avg) * 100)}%`)
    }
    return lines
  }

  function dayLabel(p: DayPoint): string {
    const parts: string[] = [dateKeyLabel(p.d)]
    if (p.d === today) parts.push('오늘')
    if (p.future) parts.push('아직 오지 않은 날')
    else if (!ready) parts.push('불러오는 중')
    else if (days === null) parts.push('기록을 불러오지 못함')
    else {
      parts.push(p.value === null ? '기록 없음' : eaten(p.value))
      if (goalsKnown) parts.push(p.target === null ? '목표 없음' : `목표 ${amount(p.target)}`)
    }
    return parts.join(', ')
  }

  const message = !ready
    ? '불러오는 중…'
    : days === null
      ? '기록을 불러오지 못했어요'
      : recorded.length === 0
        ? '이 주에는 기록이 없어요'
        : null

  let summary = `${METRIC_NAME[metric]} 주간 꺾은선그래프, ${range}. `
  if (message) summary += message.replace('…', '')
  else {
    const top = recorded.reduce((a, b) => (b.value > a.value ? b : a))
    summary += `기록 ${recorded.length}일`
    if (avg !== null) summary += `, 기록한 날 평균 ${amount(avg)}(주황 점선)`
    summary += `, 가장 많은 날 ${dateKeyLabel(top.d)} ${amount(top.value)}`
  }
  if (steps) summary += `. 회색 점선은 목표, 일요일 목표 ${amount(steps[6])}`

  return (
    <section aria-labelledby="weekly-trend-title" className={RECORD_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 pl-1.5">
        <h2 id="weekly-trend-title" className="text-base font-bold whitespace-nowrap">
          주간 추이 <span className="font-medium text-gray-600">· {range}</span>
        </h2>
        <nav aria-label="주 이동" className="ml-auto flex">
          <button
            type="button"
            onClick={() => onMoveWeek(-1)}
            className="flex min-h-11 items-center rounded-lg px-2 text-sm whitespace-nowrap text-gray-700"
          >
            ◀ 지난주
          </button>
          <button
            type="button"
            onClick={() => onMoveWeek(1)}
            disabled={isCurrentOrLaterWeek(weekStart, today)}
            className="flex min-h-11 items-center rounded-lg px-2 text-sm whitespace-nowrap text-gray-700 disabled:text-gray-300"
          >
            다음 주 ▶
          </button>
        </nav>
      </div>

      {/* 범례 "— 먹은 양 · - - 목표 · ··· 평균"과 단위 */}
      <div className="mt-1 flex items-center justify-between gap-2 px-1.5 text-xs text-gray-600">
        <ul aria-label="범례" className="flex items-center gap-3">
          <li className="flex items-center gap-1">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" className="stroke-emerald-600" strokeWidth="2" strokeLinecap="round" />
              <circle cx="11" cy="5" r="3.5" className="fill-emerald-600 stroke-white" strokeWidth="1.5" />
            </svg>
            먹은 양
          </li>
          <li className="flex items-center gap-1">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" className="stroke-gray-500" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            목표
          </li>
          <li className="flex items-center gap-1">
            <svg width="22" height="10" aria-hidden="true">
              <line
                x1="3"
                y1="5"
                x2="20"
                y2="5"
                className="stroke-amber-600"
                strokeWidth="2"
                strokeDasharray="0.1 4"
                strokeLinecap="round"
              />
            </svg>
            평균
          </li>
        </ul>
        <span className="whitespace-nowrap">단위 {unit}</span>
      </div>

      <div className="relative mt-1">
        {/* overflow-visible: 아주 큰 눈금 숫자(예: 12,000)가 왼쪽 자리를 넘어도 카드 안쪽 여백으로 보이게(잘리지 않게) */}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block h-auto w-full overflow-visible">
          {/* 가로 보조선(날짜 칸 영역만, 값 글 자리 LABEL에는 긋지 않음)과 눈금 숫자(왼쪽 AXIS 자리, 오른쪽 정렬) */}
          {ticks.map((t, k) => {
            const y = yOf(t)
            return (
              <g key={k}>
                <line x1={AXIS} x2={PLOT_R} y1={y} y2={y} className={k === 0 ? 'stroke-gray-300' : 'stroke-gray-200'} strokeWidth={1} />
                <text x={AXIS - 3} y={y + 3.5} textAnchor="end" fontSize={10} className="fill-gray-500 tabular-nums">
                  {tickText(t)}
                </text>
              </g>
            )
          })}

          {/* 목표: 회색 점선, 월~일 전체 폭(미래 날 위로도), 목표가 바뀐 날부터 계단 */}
          {steps && (
            <path d={goalPath} fill="none" className="stroke-gray-500" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />
          )}

          {/* 평균: amber 둥근 점 줄, 월~일 전체 폭. 목표선과 겹쳐도 점 모양·색으로 구분된다 */}
          {avg !== null && (
            <line
              x1={AXIS + 2}
              x2={PLOT_R - 1}
              y1={yOf(avg)}
              y2={yOf(avg)}
              className="stroke-amber-600"
              strokeWidth={2}
              strokeDasharray="0.1 4"
              strokeLinecap="round"
            />
          )}

          {/* 먹은 양: emerald 실선과 점. 기록 없는 날은 0으로 그리지 않고 선을 끊는다. 오늘 이후는 그리지 않는다 */}
          {valueRuns
            .filter((run) => run.length > 1)
            .map((run, k) => (
              <polyline
                key={k}
                points={run.map((p) => `${cx(p.i)},${yOf(p.v)}`).join(' ')}
                fill="none"
                className="stroke-emerald-600"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          {recorded.map((p) => (
            <circle
              key={p.d}
              cx={cx(p.i)}
              cy={yOf(p.value)}
              r={sel?.d === p.d ? 6 : 4.5}
              className="fill-emerald-600 stroke-white"
              strokeWidth={2}
            />
          ))}

          {/* 오른쪽 값 글(LABEL 자리): "목표" / "2,060", "평균" / "1,234". 가까우면 placeEndLabels가 위아래로 비켜 놓는다 */}
          {endLabels.map((l) => (
            <g key={l.kind} aria-hidden="true" className={l.kind === 'goal' ? 'fill-gray-600' : 'fill-amber-700'}>
              <text x={PLOT_R + 2.5} y={l.cy - 7} fontSize={9} fontWeight={500}>
                {l.word}
              </text>
              <text x={PLOT_R + 2.5} y={l.cy + 3.5} fontSize={10} fontWeight={600} className="tabular-nums">
                {l.value}
              </text>
            </g>
          ))}

          {/* 가로축: 요일과 날짜(토 파랑, 일 빨강). 주의 첫날과 1일은 "11/1"처럼 달을 붙인다. 오늘은 굵게 + 밑줄 */}
          {points.map((p) => {
            const isToday = p.d === today
            const [, m, dd] = p.d.split('-').map(Number)
            const tone =
              p.i === 5 ? 'fill-blue-600' : p.i === 6 ? 'fill-red-600' : isToday ? 'fill-gray-900' : 'fill-gray-600'
            return (
              <g key={p.d} className={p.future ? 'opacity-40' : undefined}>
                <text x={cx(p.i)} y={WD_Y} textAnchor="middle" fontSize={12} fontWeight={isToday ? 700 : 500} className={tone}>
                  {WEEKDAYS[p.i]}
                </text>
                <text
                  x={cx(p.i)}
                  y={DATE_Y}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={isToday ? 700 : 400}
                  className={`${tone} tabular-nums`}
                >
                  {p.i === 0 || dd === 1 ? `${m}/${dd}` : dd}
                </text>
                {isToday && <rect x={cx(p.i) - 8} y={DATE_Y + 3} width={16} height={2} rx={1} className="fill-gray-900" />}
              </g>
            )
          })}
        </svg>

        {message && (
          <p className="pointer-events-none absolute inset-x-0 top-[32%] flex justify-center text-sm text-gray-500">
            <span className="rounded bg-white/90 px-2 py-0.5">{message}</span>
          </p>
        )}

        {/* 누르는 곳: 날짜 칸 세로 띠 전체(왼쪽 눈금 자리와 오른쪽 값 글 자리 사이를 7칸으로, 높이 = 그래프 전체) */}
        <div
          className="absolute inset-y-0 grid grid-cols-7"
          style={{ left: `${(AXIS / W) * 100}%`, right: `${(LABEL / W) * 100}%` }}
        >
          {points.map((p) => {
            const on = sel?.d === p.d
            return (
              <button
                key={p.d}
                type="button"
                disabled={!loaded || p.future}
                aria-pressed={on}
                aria-label={dayLabel(p)}
                onClick={() => setPicked(on ? null : p.d)}
                className={`min-w-0 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 ${
                  on ? 'bg-gray-900/5' : ''
                }`}
              />
            )
          })}
        </div>
      </div>

      {/* 고른 날: 값과 목표, 주 평균 대비, [그날 기록 보기](달력 날짜 누르기와 같은 onOpenDay) */}
      {/* 버튼은 날짜 줄 오른쪽에 두고, 값 줄 3개는 전체 폭을 써서 360px에서도 한 줄씩 들어가게 한다 */}
      <div aria-live="polite" className="mt-2 flex min-h-14 flex-col justify-center rounded-lg bg-gray-50 px-3 py-1.5">
        {sel ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm font-semibold text-gray-800">{dateKeyLabel(sel.d)}</p>
              <button
                type="button"
                onClick={() => onOpenDay(sel.d)}
                className="min-h-11 shrink-0 rounded-lg border border-emerald-600 bg-white px-3 text-sm font-semibold whitespace-nowrap text-emerald-700"
              >
                그날 기록 보기
              </button>
            </div>
            <p className="text-sm leading-snug text-gray-800">
              {detailLines(sel).map((line, k) => (
                <span key={k} className={`block whitespace-nowrap tabular-nums ${k === 0 ? '' : 'text-gray-600'}`}>
                  {k > 0 && <span className="sr-only"> · </span>}
                  {line}
                </span>
              ))}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">점이나 날짜를 누르면 그날 값을 볼 수 있어요</p>
        )}
      </div>
    </section>
  )
}
