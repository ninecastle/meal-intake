// 기록 보기(S10) 히트맵 달력(2026-10-27 사용자 결정). 고른 항목(metric)의 그날 목표 대비 %로 emerald 한 가지 색의 진하기 4단계.
// 그리기만 한다: 보고 있는 달·항목·조회 결과는 페이지(CalendarPage)가 넘긴다(아래 섹션들과 같은 상태를 나눠 쓰게).
// 계산은 lib/calendar.ts(heatLevelFor·monthGrid·monthSummary·goalForDate) 그대로. AI 호출 없음.
import type { DatedGoal } from '../../data/goals'
import {
  goalForDate,
  heatLevelFor,
  metricOf,
  monthGrid,
  monthSummary,
  METRIC_UNIT,
  REFERENCE_AMOUNT,
  targetOf,
  type HeatCell,
  type HeatLevel,
  type Metric,
} from '../../lib/calendar'
import type { Nutrients } from '../../types/analysis'
import { dateKeyLabel, formatGrams, formatKcal } from '../mealText'
import { METRIC_NAME } from './MetricToggle'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 진하기별 칸 바탕(2026-10-27 사용자 요청으로 한 단계씩 연하게: 100·300·500·700 → 50·200·400·600). 0 = 기록 없음(칠하지 않음) */
const LEVEL_BG: Record<HeatLevel, string> = {
  0: 'bg-gray-100',
  1: 'bg-emerald-50',
  2: 'bg-emerald-200',
  3: 'bg-emerald-400',
  4: 'bg-emerald-600',
}
/** 가장 연한 단계(emerald-50)는 기록 없는 칸(gray-100)과 밝기가 비슷해 얇은 초록 테두리로 구분한다(오늘 칸은 오늘 테두리가 대신한다) */
const LEVEL_EDGE: Record<HeatLevel, string> = {
  0: '',
  1: 'ring-1 ring-inset ring-emerald-300',
  2: '',
  3: '',
  4: '',
}
/** 진하기별 글자색(바탕과 4.5:1 이상: 1~3은 emerald-950 약 8~17:1, 4는 emerald-600 위 gray-950 약 5.4:1. 흰 글자는 약 3.8:1이라 쓰지 않는다) */
const LEVEL_TEXT: Record<HeatLevel, string> = {
  0: 'text-gray-700',
  1: 'text-emerald-950',
  2: 'text-emerald-950',
  3: 'text-emerald-950',
  4: 'text-gray-950',
}

const LEGEND: { level: HeatLevel; text: string }[] = [
  { level: 1, text: '0~50%' },
  { level: 2, text: '50~90%' },
  { level: 3, text: '90~110% ✓' },
  { level: 4, text: '110%+' },
]

/** kcal은 formatKcal, g은 정수(천 단위 쉼표) */
function formatMetric(n: number, metric: Metric): string {
  return METRIC_UNIT[metric] === 'kcal' ? formatKcal(n) : formatGrams(n)
}

export interface RecordHeatmapProps {
  /** 보고 있는 달 'YYYY-MM' */
  month: string
  /** 오늘 dateKey */
  today: string
  metric: Metric
  /** 두 구독(기록·목표)의 첫 값(또는 오류)이 모두 왔는지 */
  ready: boolean
  /** 격자 범위(gridRange) 날짜별 하루 합계(done만). ready인데 null이면 기록을 못 불러옴 */
  days: ReadonlyMap<string, Nutrients> | null
  /** 격자 끝 날짜까지의 날짜별 목표. ready인데 null이면 목표를 못 불러옴(색 없이 숫자만) */
  goals: readonly DatedGoal[] | null
  /** 아래 ① 주간 추이가 보고 있는 주의 월요일. 그 주 줄을 옅은 회색 테두리로 표시한다(없으면 표시 안 함) */
  weekStart?: string
  onOpenDay: (dateKey: string) => void
}

export default function RecordHeatmap({ month, today, metric, ready, days, goals, weekStart, onOpenDay }: RecordHeatmapProps) {
  const cells = monthGrid(month)
  // 고른 주 줄(0부터). 격자 1줄은 요일 머리줄이라 grid-row는 +2
  const weekIndex = weekStart ? cells.findIndex((c) => c.dateKey === weekStart) : -1
  const weekRow = weekIndex >= 0 ? Math.floor(weekIndex / 7) : -1
  const unit = METRIC_UNIT[metric]
  const daysError = ready && days === null
  const goalsError = ready && days !== null && goals === null

  const valueByDate = new Map<string, number>()
  if (days) for (const [k, t] of days) valueByDate.set(k, metricOf(t, metric))
  const summary = ready && days ? monthSummary(valueByDate, month) : null
  const ref = REFERENCE_AMOUNT[metric]

  return (
    <section aria-label="달력">
      <p role="status" className="min-h-5 text-center text-sm">
        {!ready ? (
          <span className="text-gray-500">불러오는 중…</span>
        ) : daysError ? (
          <span className="text-amber-800">기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</span>
        ) : goalsError ? (
          <span className="text-amber-800">목표를 불러오지 못해 색 없이 보여요.</span>
        ) : null}
      </p>

      <div className="relative mt-1 grid grid-cols-7 gap-0.5 text-center sm:gap-1">
        {/* 고른 주 줄 표시: 절대 위치 격자 자식이라 칸 배치에 끼지 않고 그 줄 영역을 기준으로 놓인다.
            테두리는 안쪽(ring-inset) 2px라 칸 사이 틈(2px)에만 그려져 칸 색·오늘 테두리를 가리지 않는다 */}
        {weekRow >= 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-0.5 rounded-lg ring-2 ring-gray-400 ring-inset sm:-inset-1"
            style={{ gridColumn: '1 / -1', gridRow: weekRow + 2 }}
          />
        )}
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            aria-hidden="true"
            className={`py-1 text-xs font-medium ${i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-600' : 'text-gray-500'}`}
          >
            {w}
          </div>
        ))}
        {cells.map(({ dateKey: d, inMonth }) => {
          const isFuture = d > today
          const isToday = d === today
          const totals = days?.get(d)
          const value = totals && !isFuture ? metricOf(totals, metric) : null
          // 목표를 못 불러왔으면 색 없이 숫자만(목표가 있는 사람의 날을 기준량으로 칠하지 않게)
          const heat: HeatCell | null =
            isFuture || !days || !goals ? null : heatLevelFor(value, targetOf(goalForDate(goals, d), metric), metric)
          const valueText = value === null ? '' : formatMetric(value, metric)

          const tone = isFuture
            ? 'text-gray-300'
            : !days
              ? `bg-white text-gray-800 ${isToday ? '' : 'ring-1 ring-gray-100 ring-inset'}`
              : `${LEVEL_BG[heat?.level ?? 0]} ${LEVEL_TEXT[heat?.level ?? 0]}`

          const parts: string[] = [dateKeyLabel(d)]
          if (isToday) parts.push('오늘')
          if (isFuture) parts.push('아직 오지 않은 날')
          else if (!ready) parts.push('불러오는 중')
          else if (days && value === null) parts.push('기록 없음')
          else if (value !== null) {
            parts.push(unit === 'kcal' ? `${valueText}kcal` : `${METRIC_NAME[metric]} ${valueText}g`)
            if (heat?.ratio != null) {
              const pct = Math.round(heat.ratio * 100)
              parts.push(heat.basis === 'goal' ? `목표의 ${pct}%` : `기준량의 ${pct}%`)
              if (heat.inRange) parts.push('목표 범위')
            }
          }

          return (
            <button
              key={d}
              type="button"
              disabled={isFuture}
              onClick={() => onOpenDay(d)}
              aria-label={parts.join(', ')}
              aria-current={isToday ? 'date' : undefined}
              className={`relative flex aspect-square min-h-11 w-full min-w-0 flex-col items-center justify-start rounded-md pt-1 ${tone} ${
                isToday ? 'ring-2 ring-gray-900 ring-inset' : days && !isFuture ? LEVEL_EDGE[heat?.level ?? 0] : ''
              } ${!inMonth && !isFuture ? 'opacity-40' : ''}`}
            >
              <span className={`text-xs leading-none sm:text-sm ${isToday ? 'font-bold' : 'font-medium'}`}>
                {Number(d.slice(8))}
              </span>
              {heat?.inRange && (
                <span aria-hidden="true" className="absolute top-1 right-1 text-[10px] leading-none font-bold">
                  ✓
                </span>
              )}
              {valueText && (
                <span
                  className={`mt-auto mb-1 rounded-full bg-white/90 px-1 py-0.5 leading-none font-semibold whitespace-nowrap text-gray-900 tabular-nums ring-1 ring-black/5 ${
                    valueText.length >= 6 ? 'text-[9px] sm:text-[11px]' : 'text-[10px] sm:text-[11px]'
                  }`}
                >
                  {valueText}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ul aria-label="진하기: 그날 목표 대비" className="flex flex-wrap gap-0.5">
            {LEGEND.map(({ level, text }) => (
              <li
                key={level}
                className={`rounded px-1.5 py-1 text-[10px] leading-none font-medium whitespace-nowrap ${LEVEL_BG[level]} ${LEVEL_TEXT[level]} ${LEVEL_EDGE[level]}`}
              >
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
            목표가 없는 날은 기준량({formatMetric(ref, metric)}
            {unit}) 대비
          </p>
        </div>
        {summary && (
          <p className="shrink-0 text-right text-xs leading-relaxed text-gray-600">
            <span className="block">
              <span className="font-semibold text-gray-800">{Number(month.slice(5))}월</span> · 기록{' '}
              {summary.recordDays}일
            </span>
            {summary.average !== null && (
              <span className="block">
                <span className="sr-only">· </span>하루 평균{' '}
                <span className="font-semibold text-gray-800 tabular-nums">{formatMetric(summary.average, metric)}</span>
                {unit}
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
