// S10 기록 보기(3단계 조각 3-1, 스펙 4.7절 "기록 보기", 2026-10-27 사용자 결정으로 히트맵 달력). AI 호출 없음.
// 주소 /calendar?month=YYYY-MM(없거나 틀리거나 이번 달보다 뒤면 이번 달, lib/calendar.ts parseMonth).
// 상태는 페이지가 갖는다: 보고 있는 달(?month)과 고른 항목(metric, localStorage 'record-view-metric').
// 위쪽 줄 = [◀ 10월 ▶] · 월 요약(MonthSummary), 달력 아래 줄 = 진하기 범례 · [칼로리|탄|단|지](2026-10-27 사용자 요청으로 맞바꿈).
// 달·항목은 아래 섹션 모두에 같이 적용된다. 달력(RecordHeatmap) 아래 ① 주간 추이(WeeklyTrend).
// 달력 주 줄 끝 › = 그 주를 고르고(?week replace) ① 주간 추이로 부드럽게 스크롤(showWeek). 이미 고른 주면 스크롤만.
// 고른 주 = ?week=월요일 dateKey(lib/week.ts parseWeek: 틀리거나 미래 주이거나 그달 격자 밖이면 그달 기본 주).
// 주 이동은 ?month·?week를 replace(옮긴 주가 격자 밖이면 monthForWeek로 달도 따라감). 달 이동은 ?week를 빼서 기본 주로.
// 고른 주는 항상 그달 격자 안이라 주간 추이도 아래 두 구독 값을 그대로 쓴다(새 구독 없음).
// 달력 조회: 격자 첫 칸~마지막 칸(gridRange, 앞뒤 달 날짜 포함, 최대 42일) 기록(subscribeDaysInRange)과 마지막 칸까지의
// 날짜별 목표(subscribeGoalsUpTo). 두 구독의 첫 값이 모두 오기 전에는 숫자·색을 비우고 "불러오는 중…".
// 방문 기록: 홈에서 push(state.fromHome)로 들어온다. 달 이동은 ?month만 replace(state는 그대로 넘겨 fromHome을 지킨다).
// ‹ = 홈에서 왔으면 navigate(-1), 주소로 바로 열었으면 홈으로 replace.
// 날짜 누르기 = 홈에서 왔으면 navigate(-1)이 끝난 뒤(라우터가 돌려주는 promise) 그 홈 자리를 그날 홈으로 replace,
// 주소로 바로 열었으면 이 자리를 그날 홈으로 replace. 어느 쪽이든 홈이 두 번 쌓이지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { homeHref } from '../components/mealText'
import MonthNav from '../components/record/MonthNav'
import RecordHeatmap, { MonthSummary, RECORD_CARD } from '../components/record/RecordHeatmap'
import WeeklyTrend from '../components/record/WeeklyTrend'
import { subscribeGoalsUpTo, type DatedGoal } from '../data/goals'
import { subscribeDaysInRange } from '../data/meals'
import { gridRange, METRICS, parseMonth, shiftMonth, type Metric } from '../lib/calendar'
import { isCurrentOrLaterWeek, monthForWeek, parseWeek, shiftWeek } from '../lib/week'
import { toDateKey } from '../lib/time'
import type { Nutrients } from '../types/analysis'
import { IconButton, TopBar } from '../components/ui'

/** 마지막으로 고른 항목. 못 읽거나 모르는 값이면 칼로리 */
const METRIC_KEY = 'record-view-metric'

function readMetric(): Metric {
  try {
    const v = localStorage.getItem(METRIC_KEY)
    return METRICS.find((m) => m === v) ?? 'kcal'
  } catch {
    return 'kcal'
  }
}

function writeMetric(m: Metric) {
  try {
    localStorage.setItem(METRIC_KEY, m)
  } catch {
    // 사생활 보호 모드 등: 이번 화면에서만 기억한다
  }
}

/** 그달 첫 값. forMonth가 지금 달과 다르면 첫 값 전으로 본다(달을 옮긴 직후 이전 달 숫자를 보이지 않게). */
type Loaded<T> = { forMonth: string; value: T } | { forMonth: string; error: true }

export default function CalendarPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const today = toDateKey(new Date())
  const month = parseMonth(params.get('month'), today)
  const week = parseWeek(params.get('week'), month, today)
  const { start, end } = gridRange(month)
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const leaving = useRef(false)
  const trendRef = useRef<HTMLDivElement>(null)

  const [metric, setMetric] = useState<Metric>(readMetric)
  const [days, setDays] = useState<Loaded<Map<string, Nutrients>> | null>(null)
  const [goals, setGoals] = useState<Loaded<DatedGoal[]> | null>(null)

  useEffect(
    () =>
      subscribeDaysInRange(
        uid,
        start,
        end,
        (m) => setDays({ forMonth: month, value: new Map([...m].map(([k, s]) => [k, s.totals])) }),
        () => setDays({ forMonth: month, error: true }),
      ),
    [uid, month, start, end],
  )
  useEffect(
    () =>
      subscribeGoalsUpTo(
        uid,
        end,
        (g) => setGoals({ forMonth: month, value: g }),
        () => setGoals({ forMonth: month, error: true }),
      ),
    [uid, month, end],
  )

  const daysNow = days && days.forMonth === month ? days : null
  const goalsNow = goals && goals.forMonth === month ? goals : null
  const ready = daysNow !== null && goalsNow !== null
  // 숫자·색은 두 구독의 첫 값이 모두 온 뒤에만(숫자 먼저, 색 나중으로 깜빡이지 않게). 기록 오류면 숫자 없이, 목표 오류면 색 없이.
  const dayTotals = ready && 'value' in daysNow ? daysNow.value : null
  const goalList = ready && 'value' in goalsNow ? goalsNow.value : null

  function chooseMetric(m: Metric) {
    setMetric(m)
    writeMetric(m)
  }

  function moveMonth(delta: number) {
    const next = shiftMonth(month, delta)
    if (next > today.slice(0, 7)) return
    // state를 그대로 넘겨야 fromHome이 남는다(달을 옮겨도 ‹·날짜 누르기가 홈 한 칸으로 돌아간다)
    navigate({ pathname: '/calendar', search: `?month=${next}` }, { replace: true, state: location.state })
  }

  /** 주간 추이 ◀ 지난주 / 다음 주 ▶. 격자 밖으로 나가면 달력 달도 그 주 월요일의 달로 */
  function moveWeek(delta: number) {
    if (delta > 0 && isCurrentOrLaterWeek(week, today)) return
    const next = shiftWeek(week, delta)
    const nextMonth = monthForWeek(month, next)
    navigate(
      { pathname: '/calendar', search: `?month=${nextMonth}&week=${next}` },
      { replace: true, state: location.state },
    )
  }

  /** 달력 주 줄 › : 그 주를 고르고 ① 주간 추이로 스크롤. 고른 주는 그달 격자 안이라 달은 그대로. 미래 주는 막는다 */
  function showWeek(monday: string) {
    if (monday > today) return
    if (monday !== week) {
      navigate({ pathname: '/calendar', search: `?month=${month}&week=${monday}` }, { replace: true, state: location.state })
    }
    let reduce = false
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      // matchMedia가 없으면 부드럽게
    }
    // 섹션 자리는 고른 주와 상관없이 같아서 주소를 바꾼 직후 바로 스크롤해도 된다
    trendRef.current?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' })
  }

  function goHome() {
    if (leaving.current) return
    leaving.current = true
    if (fromHome) void navigate(-1)
    else void navigate('/', { replace: true })
  }

  async function openDay(dateKey: string) {
    if (leaving.current || dateKey > today) return
    leaving.current = true
    const href = homeHref(dateKey, today)
    if (!fromHome) {
      void navigate(href, { replace: true })
      return
    }
    // 홈 한 칸으로 돌아간 뒤(라우터가 POP을 끝내면 promise가 풀린다) 그 자리를 그날 홈으로 바꾼다.
    await navigate(-1)
    void navigate(href, { replace: true })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <TopBar className="-mx-4" left={<IconButton icon="back" label="홈으로" onClick={goHome} />} title="기록 보기" />

      {/* 달력 카드(2026-10-27 사용자 요청): 월 이동·월 요약 줄 + 요일·날짜 격자 + 범례·항목 선택 줄을 둥근 테두리 하나로 감싼다.
          안쪽 여백은 좌우 6px(px-1.5)만: 360px 폰에서 카드 안쪽 328 − 테두리 2 − 여백 12 = 314px → 날짜 칸 (314 − 14 − 18) ÷ 7 ≈ 40.3px.
          8px로 하면 39.7px가 되어 40px 아래로 줄어든다. 화면 좌우 16px(main px-4)는 그대로 */}
      <div className={`mt-1 ${RECORD_CARD}`}>
        {/* 위쪽 줄: 왼쪽 월 이동, 오른쪽 월 요약(불러오기 전·기록 오류면 비움). 항목 선택은 달력 아래 줄 오른쪽(RecordHeatmap) */}
        <div className="flex items-center justify-between gap-x-2 pr-1.5">
          <MonthNav month={month} today={today} onMove={moveMonth} />
          <MonthSummary month={month} metric={metric} days={dayTotals} />
        </div>

        <RecordHeatmap
          month={month}
          today={today}
          metric={metric}
          ready={ready}
          days={dayTotals}
          goals={goalList}
          weekStart={week}
          onOpenDay={(d) => void openDay(d)}
          onShowWeek={showWeek}
          onMetricChange={chooseMetric}
        />
      </div>

      {/* 아래 섹션 순서(같은 metric·month·week와 두 구독 값을 props로 받는다):
          ① 주간 추이 그래프(무료, 조각 4, 달력과 같은 RECORD_CARD 카드) → ② PREMIUM 주간 분석 리포트 → ③ PREMIUM 월간 그래프·요약 */}
      {/* 스크롤 대상(› 누르기). 카드 사이 간격은 이 div의 mt-3, scroll-mt-2로 스크롤하면 카드 위 테두리가 화면 맨 위에서 8px 아래에 온다 */}
      <div ref={trendRef} className="mt-3 scroll-mt-2">
        <WeeklyTrend
          weekStart={week}
          today={today}
          metric={metric}
          ready={ready}
          days={dayTotals}
          goals={goalList}
          onMoveWeek={moveWeek}
          onOpenDay={(d) => void openDay(d)}
        />
      </div>
      {/* ② PREMIUM 주간 분석 리포트: 프리미엄 단계에서 만든다(PREMIUM 배지·"프리미엄 기능(월 요금 예정)" 미리보기·[체험하기]) */}
      {/* ③ PREMIUM 월간 그래프·요약: 프리미엄 단계에서 만든다 */}
    </main>
  )
}
