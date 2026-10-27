// 기록 보기(S10) 히트맵 달력(2026-10-27 사용자 결정). 고른 항목(metric)의 그날 목표 대비 %로 진하기 4단계(시안 heat1~heat4: 연두 세 단계, 110% 초과는 복숭아).
// 그리기만 한다: 보고 있는 달·항목·조회 결과는 페이지(CalendarPage)가 넘긴다(아래 섹션들과 같은 상태를 나눠 쓰게).
// 계산은 lib/calendar.ts(heatLevelFor·monthGrid·monthSummary·goalForDate) 그대로. AI 호출 없음.
// 격자 = 요일 머리줄 + 주 줄(5주 달 5줄, 6주 달 6줄) × [월~일 날짜 칸 7개 + 맨 오른쪽 얇은 › 칸(그 주 주간 추이 보기)].
// 아래 줄 = 왼쪽 진하기 범례(2×2 + 기준량 한 줄), 오른쪽 항목 선택(MetricToggle). 월 요약(MonthSummary)은 페이지가 위쪽 줄에 놓는다.
import { Fragment } from 'react'
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
import MetricToggle, { METRIC_NAME } from './MetricToggle'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 기록 보기 카드 공통(달력 카드·주간 추이 카드, 2026-10-27 사용자 요청). 바깥 간격은 쓰는 쪽이 붙인다.
 *  좌우 안쪽 여백 6px: 360px 폰에서 카드 안쪽 폭 328 − 테두리 6 − 12 = 310px(8px면 날짜 칸이 40px 아래로 준다) */
// 테두리: 2026-10-27 사용자 요청으로 굵게, 디자인 조각 D2-C에서 확실히 보이게 3px ink-3(시안 chartcard에는 테두리가 없지만 사용자 결정으로 둔다)
export const RECORD_CARD = 'rounded-card border-[3px] border-ink-3 bg-surface px-1.5 pt-1 pb-2'

/** 날짜 칸 7개 + › 칸 18px. 360px 폰(카드 안쪽 310px, 칸 사이 2px)에서 날짜 칸 (310 − 14 − 18) ÷ 7 ≈ 39.7px */
const GRID_COLS = 'grid-cols-[repeat(7,minmax(0,1fr))_1.125rem]'

/** › 칸 aria-label용 주 범위 글("10월 19일~25일", 달이 바뀌면 "10월 26일~11월 1일"). WeeklyTrend 제목 범위와 같은 글 */
function weekRangeText(monday: string, sunday: string): string {
  const [, m1, d1] = monday.split('-').map(Number)
  const [, m2, d2] = sunday.split('-').map(Number)
  return m1 === m2 ? `${m1}월 ${d1}일~${d2}일` : `${m1}월 ${d1}일~${m2}월 ${d2}일`
}

/** 진하기별 칸 바탕 = 시안 :root heat0~heat4 그대로(heat1~3 연두 세 단계, 110% 초과 heat4 복숭아). 0 = 기록 없음 */
const LEVEL_BG: Record<HeatLevel, string> = {
  0: 'bg-heat0',
  1: 'bg-heat1',
  2: 'bg-heat2',
  3: 'bg-heat3',
  4: 'bg-heat4',
}
/** 시안 칸은 테두리 없이 색만 쓴다(heat1 연두는 heat0 회색과 색이 달라 구분된다). 단계별 자리는 남겨 둔다 */
const LEVEL_EDGE: Record<HeatLevel, string> = {
  0: '',
  1: '',
  2: '',
  3: '',
  4: '',
}
/** 진하기별 글자색: 모든 단계 ink(시안 heat0~heat4 바탕 위 약 7:1 이상) */
const LEVEL_TEXT: Record<HeatLevel, string> = {
  0: 'text-ink',
  1: 'text-ink',
  2: 'text-ink',
  3: 'text-ink',
  4: 'text-ink',
}

/** 2×2로 놓는다(윗줄 1·2단계, 아랫줄 3·4단계) */
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
  /** 아래 ① 주간 추이가 보고 있는 주의 월요일. 그 주 줄을 옅은 회색 테두리로, 그 줄 ›를 진하게 표시한다(없으면 표시 안 함) */
  weekStart?: string
  onOpenDay: (dateKey: string) => void
  /** 주 줄 › 누르기(그 주 월요일). 미래 주는 버튼이 비활성이라 부르지 않는다 */
  onShowWeek: (monday: string) => void
  /** 아래 줄 오른쪽 항목 선택 */
  onMetricChange: (m: Metric) => void
}

export default function RecordHeatmap({
  month,
  today,
  metric,
  ready,
  days,
  goals,
  weekStart,
  onOpenDay,
  onShowWeek,
  onMetricChange,
}: RecordHeatmapProps) {
  const cells = monthGrid(month)
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  // 고른 주 줄(0부터). 격자 1줄은 요일 머리줄이라 grid 줄 번호는 +2
  const weekRow = weekStart ? weeks.findIndex((w) => w[0].dateKey === weekStart) : -1
  const unit = METRIC_UNIT[metric]
  const daysError = ready && days === null
  const goalsError = ready && days !== null && goals === null
  const ref = REFERENCE_AMOUNT[metric]

  return (
    <section aria-label="달력">
      <p role="status" className="min-h-5 text-center text-sm">
        {!ready ? (
          <span className="text-ink-2">불러오는 중…</span>
        ) : daysError ? (
          <span className="rounded-chip bg-butter-soft px-1.5 py-0.5 text-ink">기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</span>
        ) : goalsError ? (
          <span className="rounded-chip bg-butter-soft px-1.5 py-0.5 text-ink">목표를 불러오지 못해 색 없이 보여요.</span>
        ) : null}
      </p>

      {/* 줄 수를 grid-template-rows로 정해 둔다(요일 머리줄 + 주 줄 5~6개). 고른 주 테두리는 절대 위치 격자 자식이라 칸 배치에 끼지 않고,
          grid-row에 시작·끝 줄을 모두 적어 그 주 한 줄에만 놓인다(끝 줄을 비우면 격자 아래 끝까지 늘어나 두 줄 이상을 감쌌다).
          테두리는 안쪽(ring-inset) 2px라 칸 사이 틈(2px)과 격자 바깥 2px에만 그려져 칸 색·오늘 테두리를 가리지 않는다 */}
      <div
        className={`relative mt-1 grid ${GRID_COLS} gap-0.5 text-center sm:gap-1`}
        style={{ gridTemplateRows: `auto repeat(${weeks.length}, auto)` }}
      >
        {weekRow >= 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-0.5 rounded-[12px] ring-2 ring-ink-3 ring-inset sm:-inset-1"
            style={{ gridColumn: '1 / -1', gridRow: `${weekRow + 2} / ${weekRow + 3}` }}
          />
        )}
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            aria-hidden="true"
            className={`py-1 text-xs font-medium ${i === 5 ? 'text-sky-deep' : i === 6 ? 'text-peach-deep' : 'text-ink-3'}`}
          >
            {w}
          </div>
        ))}
        {/* 머리줄 › 칸 자리 */}
        <div aria-hidden="true" />
        {weeks.map((week) => {
          const monday = week[0].dateKey
          const selected = monday === weekStart
          const futureWeek = monday > today
          return (
            <Fragment key={monday}>
              {week.map(({ dateKey: d, inMonth }) => {
                const isFuture = d > today
                const isToday = d === today
                const totals = days?.get(d)
                const value = totals && !isFuture ? metricOf(totals, metric) : null
                // 목표를 못 불러왔으면 색 없이 숫자만(목표가 있는 사람의 날을 기준량으로 칠하지 않게)
                const heat: HeatCell | null =
                  isFuture || !days || !goals ? null : heatLevelFor(value, targetOf(goalForDate(goals, d), metric), metric)
                const valueText = value === null ? '' : formatMetric(value, metric)

                const tone = isFuture
                  ? 'text-ink-3/50'
                  : !days
                    ? `bg-surface text-ink ${isToday ? '' : 'ring-1 ring-line ring-inset'}`
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
                    className={`focus-ring relative flex aspect-square min-h-11 w-full min-w-0 flex-col items-center justify-start rounded-chip pt-1 ${tone} ${
                      isToday ? 'ring-2 ring-ink ring-inset' : days && !isFuture ? LEVEL_EDGE[heat?.level ?? 0] : ''
                    } ${!inMonth && !isFuture ? 'opacity-35' : ''}`}
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
                        className={`mt-auto mb-1 rounded-[6px] bg-white/75 px-1 py-0.5 leading-none font-semibold whitespace-nowrap text-ink tabular-nums ${
                          valueText.length >= 6 ? 'text-[9px] sm:text-[11px]' : 'text-[10px] sm:text-[11px]'
                        }`}
                      >
                        {valueText}
                      </span>
                    )}
                  </button>
                )
              })}
              {/* 주 줄 끝 ›: 그 주를 고르고 아래 주간 추이로 스크롤(페이지 showWeek). 모든 주는 연한 바탕, 고른 주는 진한 바탕(2026-10-27 사용자 결정), 미래 주는 흐리게·비활성 */}
              <button
                type="button"
                disabled={futureWeek}
                onClick={() => onShowWeek(monday)}
                aria-label={`${weekRangeText(monday, week[6].dateKey)} 주간 추이 보기`}
                aria-current={selected ? 'true' : undefined}
                className={`focus-ring flex min-h-11 items-center justify-center rounded-chip text-lg leading-none ${
                  selected ? 'bg-sky text-ink' : futureWeek ? 'text-ink-3/40' : 'bg-ground text-ink-2'
                }`}
              >
                ›
              </button>
            </Fragment>
          )
        })}
      </div>

      {/* 아래 줄: 왼쪽 범례(2×2 + 기준량 한 줄), 오른쪽 항목 선택(위 달력·아래 주간 추이에 함께 적용).
          범례 묶음은 basis 0 + 자동 최소 폭(= 2×2 칸 폭 약 112px)이라 360px 카드 안쪽(310px)에서 항목 선택(약 189px)과 한 줄에 들어가고,
          그보다 좁은 화면에서만 항목 선택이 다음 줄 오른쪽으로 내려간다(가로 넘침 없음). 기준량 글은 남은 폭 안에서 줄바꿈.
          카드 안으로 들어가며 폭이 14px 줄어 범례 칸 좌우 여백 6→4px, 줄 간격 8→6px로 줄였다 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <div className="grow basis-0">
          <ul aria-label="진하기: 그날 목표 대비" className="grid w-max grid-cols-[auto_auto] gap-0.5">
            {LEGEND.map(({ level, text }) => (
              <li
                key={level}
                className={`rounded-chip px-1 py-1 text-center text-[10px] leading-none font-medium whitespace-nowrap ${LEVEL_BG[level]} ${LEVEL_TEXT[level]} ${LEVEL_EDGE[level]}`}
              >
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] leading-snug text-ink-2">
            목표 없으면 기준 {formatMetric(ref, metric)}
            {unit}
          </p>
        </div>
        <MetricToggle value={metric} onChange={onMetricChange} />
      </div>
    </section>
  )
}

/** 위쪽 줄 오른쪽 월 요약 "기록 12일" / "하루 평균 1,850kcal"(그달만, 앞뒤 달 날짜 제외 = monthSummary).
 *  바로 왼쪽 "◀ 10월 ▶"와 겹치는 달 이름은 화면 읽기에만 넣는다. days가 null(불러오기 전·기록 오류)이면 그리지 않는다 */
export function MonthSummary({
  month,
  metric,
  days,
}: {
  month: string
  metric: Metric
  days: ReadonlyMap<string, Nutrients> | null
}) {
  if (!days) return null
  const valueByDate = new Map<string, number>()
  for (const [k, t] of days) valueByDate.set(k, metricOf(t, metric))
  const summary = monthSummary(valueByDate, month)
  return (
    <p className="shrink-0 text-right text-xs leading-relaxed text-ink-2">
      <span className="block">
        <span className="sr-only">{Number(month.slice(5))}월 </span>기록{' '}
        <span className="font-semibold text-ink tabular-nums">{summary.recordDays}</span>일
      </span>
      {summary.average !== null && (
        <span className="block">
          <span className="sr-only">· </span>하루 평균{' '}
          <span className="font-semibold text-ink tabular-nums">{formatMetric(summary.average, metric)}</span>
          {METRIC_UNIT[metric]}
        </span>
      )}
    </p>
  )
}
