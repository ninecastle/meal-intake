// S10 기록 보기(3단계 조각 3-1, 스펙 4.7절 "기록 보기", 2026-10-27 사용자 결정으로 히트맵 달력). AI 호출 없음.
// 주소 /calendar?month=YYYY-MM(없거나 틀리거나 이번 달보다 뒤면 이번 달, lib/calendar.ts parseMonth).
// 상태는 페이지가 갖는다: 보고 있는 달(?month)과 고른 항목(metric, localStorage 'record-view-metric').
// 위쪽 [◀ 10월 ▶] · [칼로리|탄|단|지]가 아래 섹션 모두에 같이 적용된다. 지금은 달력(RecordHeatmap)만 있다.
// 달력 조회: 격자 첫 칸~마지막 칸(gridRange, 앞뒤 달 날짜 포함, 최대 42일) 기록(subscribeDaysInRange)과 마지막 칸까지의
// 날짜별 목표(subscribeGoalsUpTo). 두 구독의 첫 값이 모두 오기 전에는 숫자·색을 비우고 "불러오는 중…".
// 방문 기록: 홈에서 push(state.fromHome)로 들어온다. 달 이동은 ?month만 replace(state는 그대로 넘겨 fromHome을 지킨다).
// ‹ = 홈에서 왔으면 navigate(-1), 주소로 바로 열었으면 홈으로 replace.
// 날짜 누르기 = 홈에서 왔으면 navigate(-1)이 끝난 뒤(라우터가 돌려주는 promise) 그 홈 자리를 그날 홈으로 replace,
// 주소로 바로 열었으면 이 자리를 그날 홈으로 replace. 어느 쪽이든 홈이 두 번 쌓이지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { homeHref } from '../components/mealText'
import MetricToggle from '../components/record/MetricToggle'
import MonthNav from '../components/record/MonthNav'
import RecordHeatmap from '../components/record/RecordHeatmap'
import { subscribeGoalsUpTo, type DatedGoal } from '../data/goals'
import { subscribeDaysInRange } from '../data/meals'
import { gridRange, METRICS, parseMonth, shiftMonth, type Metric } from '../lib/calendar'
import { toDateKey } from '../lib/time'
import type { Nutrients } from '../types/analysis'

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
  const { start, end } = gridRange(month)
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const leaving = useRef(false)

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center">
        <button
          type="button"
          onClick={goHome}
          aria-label="홈으로"
          className="-ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-2xl text-gray-700"
        >
          ‹
        </button>
        <h1 className="text-lg font-bold">기록 보기</h1>
      </header>

      {/* 위쪽 조작: 왼쪽 월 이동, 오른쪽 항목 선택. 좁아서 한 줄에 못 들어가면 항목 선택이 다음 줄로(가로 스크롤 없음) */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <MonthNav month={month} today={today} onMove={moveMonth} />
        <MetricToggle value={metric} onChange={chooseMetric} />
      </div>

      <div className="mt-2">
        <RecordHeatmap
          month={month}
          today={today}
          metric={metric}
          ready={ready}
          days={dayTotals}
          goals={goalList}
          onOpenDay={(d) => void openDay(d)}
        />
      </div>

      {/* 아래 섹션(앞으로, 같은 metric·month를 props로 받는다):
          ① 주간 추이 그래프(조각 4) ② PREMIUM 주간 분석 리포트 ③ PREMIUM 월간 그래프·요약 */}
    </main>
  )
}
