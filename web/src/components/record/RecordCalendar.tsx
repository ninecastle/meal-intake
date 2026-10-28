// 기록 보기(S10) 달력(디자인 조각 D7, 시안 calendar()·monthGrid() 마크업·클래스 그대로, 숫자만 실제 데이터).
// .calhead(‹ 2026년 10월 ›) → .monthsum(기록 ○일 · 하루 평균) → .cal(요일 .wd + 날짜 .cell) → .legendrow → .nchips [칼로리|탄|단|지|몸무게].
// 2026-10-28 사용자 결정 "모두 시안대로": 카드 테두리·✓·토일 색·주 줄 › 칸·고른 주 테두리·기준량 글 없음, 앞뒤 달 날짜는 흐린 숫자만(누르지 않음).
// 진하기는 고른 항목의 그날 목표 대비 %(lib/calendar heatLevelFor, 목표가 없는 날은 기준량) → 시안 .h1~.h4. 몸무게 칩은 체중 기록한 날 .hw + kg.
// 식단 앨범(D9)은 bare로 .calhead + .cal만 쓴다(시안 album()에는 월 요약·범례·칩이 없다). 고른 날은 aria-pressed만(시안에 표시 없음).
// 이번 달이면 다음 달 ›은 홈 날짜 줄 내일처럼 흐리게(.35)·누를 수 없음. 미래 날짜는 눌러도 아무 일 없음. 그리기만 한다(상태·조회는 CalendarPage).
import type { DatedGoal } from '../../data/goals'
import {
  CAL_NUT_LABEL,
  CAL_NUTS,
  goalForDate,
  heatLevelFor,
  metricOf,
  METRIC_NAME,
  METRIC_UNIT,
  monthGrid,
  monthSummary,
  targetOf,
  type CalNut,
} from '../../lib/calendar'
import { formatKg } from '../../lib/weight'
import type { Nutrients } from '../../types/analysis'
import { dateKeyLabel, formatGrams, formatKcal } from '../mealText'
import { IconButton } from '../ui'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

export interface RecordCalendarProps {
  /** 보고 있는 달 'YYYY-MM' */
  month: string
  /** 오늘 dateKey */
  today: string
  nut: CalNut
  /** 기록·목표 두 구독의 첫 값(또는 오류)이 모두 왔는지 */
  ready: boolean
  /** 격자 범위 날짜별 하루 합계. ready인데 null이면 기록을 못 불러옴 */
  days: ReadonlyMap<string, Nutrients> | null
  /** ready인데 null이면 목표를 못 불러옴(색 없이 숫자만) */
  goals: readonly DatedGoal[] | null
  /** 그달 날짜별 체중. null = 불러오기 전·오류 */
  weights: ReadonlyMap<string, number> | null
  onMoveMonth: (delta: number) => void
  onOpenDay: (dateKey: string) => void
  onNut: (n: CalNut) => void
  /** 식단 앨범(D9): 월 요약·범례·칩 없이 달 이동 + 격자만 */
  bare?: boolean
  /** 식단 앨범에서 고른 날(aria-pressed) */
  selected?: string
}

export default function RecordCalendar({ month, today, nut, ready, days, goals, weights, onMoveMonth, onOpenDay, onNut, bare = false, selected }: RecordCalendarProps) {
  const [y, m] = month.split('-').map(Number)
  const isThisMonth = month === today.slice(0, 7)
  const metric = nut === 'weight' ? null : nut
  const dayValues = metric && ready && days ? new Map([...days].map(([k, t]) => [k, metricOf(t, metric)])) : null
  const values: ReadonlyMap<string, number> | null = metric ? dayValues : weights
  const summary = values ? monthSummary(values, month) : null

  /** 칸 안 작은 상자 글: 시안처럼 쉼표 없이 정수("1560"), 몸무게는 소수 한 자리 */
  const cellText = (v: number) => (metric ? String(Math.round(v)) : formatKg(v))
  const avgText = (v: number) => (metric ? `${METRIC_UNIT[metric] === 'kcal' ? formatKcal(v) : formatGrams(v)}${METRIC_UNIT[metric]}` : `${formatKg(v)}kg`)

  return (
    <>
      <div className="calhead">
        <IconButton icon="back" label="이전 달" onClick={() => onMoveMonth(-1)} />
        <h2 className="num">{`${y}년 ${m}월`}</h2>
        <IconButton icon="back" label="다음 달" style={{ transform: 'scaleX(-1)' }} disabled={isThisMonth} onClick={() => onMoveMonth(1)} />
      </div>
      {!bare && (
      <div className="monthsum">
        <span>
          {'기록 '}
          <b className="num">{summary ? `${summary.recordDays}일` : '–'}</b>
        </span>
        <span>
          {metric ? '하루 평균 ' : '평균 '}
          <b className="num">{summary?.average != null ? avgText(summary.average) : '–'}</b>
        </span>
      </div>
      )}
      <div className="cal">
        {WEEKDAYS.map((w) => (
          <div key={w} className="wd">
            {w}
          </div>
        ))}
        {monthGrid(month).map(({ dateKey: d, inMonth }) => {
          const day = Number(d.slice(8))
          if (!inMonth) {
            return (
              <div key={d} className="cell out" aria-hidden="true">
                {day}
              </div>
            )
          }
          const future = d > today
          const v = future ? undefined : values?.get(d)
          let tone = ''
          const label = [dateKeyLabel(d)]
          if (d === today) label.push('오늘')
          if (v !== undefined && metric) {
            // 목표를 못 불러왔으면 색 없이 숫자만(목표가 있는 사람의 날을 기준량으로 칠하지 않게)
            const heat = goals ? heatLevelFor(v, targetOf(goalForDate(goals, d), metric), metric) : null
            if (heat) tone = `h${heat.level}`
            label.push(METRIC_UNIT[metric] === 'kcal' ? `${formatKcal(v)}kcal` : `${METRIC_NAME[metric]} ${formatGrams(v)}g`)
            if (heat?.ratio != null) label.push(`${heat.basis === 'goal' ? '목표' : '기준량'}의 ${Math.round(heat.ratio * 100)}%`)
          } else if (v !== undefined) {
            tone = 'hw'
            label.push(`체중 ${formatKg(v)}kg`)
          } else if (future) label.push('아직 오지 않은 날')
          else if (values) label.push('기록 없음')
          return (
            <button
              key={d}
              type="button"
              className={['cell', tone, d === today ? 'today' : ''].filter(Boolean).join(' ')}
              aria-label={label.join(', ')}
              aria-current={d === today ? 'date' : undefined}
              aria-disabled={future || undefined}
              aria-pressed={selected === undefined ? undefined : selected === d}
              onClick={() => {
                if (!future) onOpenDay(d)
              }}
            >
              <span>{day}</span>
              {v !== undefined && <span className="v">{cellText(v)}</span>}
            </button>
          )
        })}
      </div>
      {bare ? null : nut === 'weight' ? (
        <div className="legendrow">체중을 기록한 날에 kg으로 표시돼요</div>
      ) : (
        <div className="legendrow">
          <span>
            <i style={{ background: 'var(--heat1)' }}></i>~50%
          </span>
          <span>
            <i style={{ background: 'var(--heat2)' }}></i>50~90%
          </span>
          <span>
            <i style={{ background: 'var(--heat3)' }}></i>90~110%
          </span>
          <span>
            <i style={{ background: 'var(--heat4)' }}></i>110%~
          </span>
        </div>
      )}
      {!bare && (
      <div className="nchips">
        {CAL_NUTS.map((k) => (
          <button key={k} type="button" className="nchip" aria-pressed={nut === k} onClick={() => onNut(k)}>
            {CAL_NUT_LABEL[k]}
          </button>
        ))}
      </div>
      )}
    </>
  )
}
