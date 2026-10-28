// S10 기록 보기(디자인 조각 D7, 시안 calendar() 마크업·클래스 그대로, 숫자만 실제 데이터). AI 호출 없음.
// div.screen > .topbar.sticky(‹ "기록 보기") → .pad > 달력(RecordCalendar: .calhead·.monthsum·.cal·.legendrow·.nchips)
// → .segment [주간 | 월간 👑 | AI 리포트 👑](margin-top 26px) → 고른 탭 하나(WeekPane·MonthPane·AiReportPane).
// 2026-10-28 사용자 결정: 예전 기록 보기 모양(카드 테두리, ✓, 토일 색, 주 줄 ›, 아래로 스크롤하는 섹션 등)은 모두 시안대로,
// [몸무게] 칩은 달력에만(그래프는 그 전에 고른 항목, 처음엔 칼로리), AI 리포트 탭은 D14 AI 주간 리포트(AiReportPane, 주 이동은 탭 안에서).
// 주소 /calendar?month=YYYY-MM&week=월요일&tab=month|ai(lib/calendar parseMonth, lib/week parseWeek, 탭 없거나 틀리면 주간).
// 달·주·탭 바꾸기는 replace(state를 그대로 넘겨 fromHome을 지킨다, ScrollMemory가 같은 화면이라 스크롤 위치를 그대로 둔다).
// 달 이동은 ?week를 빼서 그달 기본 주로. 주 이동이 격자 밖으로 나가면 monthForWeek로 달도 따라간다(고른 주는 늘 그달 격자 안 → 새 구독 없음).
// 고른 칩은 localStorage 'record-view-metric'(몸무게 포함), 그래프 항목은 'record-view-graph-metric'(몸무게를 고르기 전 항목)에 기억한다.
// 조회: 격자 범위 기록(subscribeDaysInRange, 최대 42일)·격자 끝까지 날짜별 목표(subscribeGoalsUpTo)·그달 체중(subscribeWeightsInRange).
// 오류는 달력 위 시안 .note 상자 한 줄. 방문 기록: 홈에서 push(state.fromHome)로 들어온다. ‹ = 홈에서 왔으면 navigate(-1), 아니면 홈으로 replace.
// 날짜 누르기 = 홈에서 왔으면 navigate(-1)이 끝난 뒤 그 홈 자리를 그날 홈으로 replace, 주소로 바로 열었으면 이 자리를 그날 홈으로 replace.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { homeHref } from '../components/mealText'
import AiReportPane from '../components/record/AiReportPane'
import MonthPane from '../components/record/MonthPane'
import RecordCalendar from '../components/record/RecordCalendar'
import WeekPane from '../components/record/WeekPane'
import { IconButton } from '../components/ui'
import { subscribeGoalsUpTo, type DatedGoal } from '../data/goals'
import { subscribeDaysInRange } from '../data/meals'
import { subscribeWeightsInRange } from '../data/weights'
import { CAL_NUTS, gridRange, METRICS, monthRange, parseMonth, shiftMonth, type CalNut, type Metric } from '../lib/calendar'
import { isCurrentOrLaterWeek, monthForWeek, parseWeek, shiftWeek } from '../lib/week'
import { toDateKey } from '../lib/time'
import type { Nutrients } from '../types/analysis'

const NUT_KEY = 'record-view-metric'
const GRAPH_KEY = 'record-view-graph-metric'

function readKey<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.find((m) => m === v) ?? fallback
  } catch {
    return fallback
  }
}

function writeKey(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    // 사생활 보호 모드 등: 이번 화면에서만 기억한다
  }
}

type Tab = 'week' | 'month' | 'ai'
const TABS: readonly Tab[] = ['week', 'month', 'ai']

/** 시안 탭 안 작은 왕관(12px, fill crown) */
const TAB_CROWN = (
  <svg width="12" height="12" viewBox="0 0 16 16" role="img" aria-label="프리미엄" style={{ fill: 'var(--crown)' }}>
    <path d="M2 12 L1 4 L5 7 L8 2 L11 7 L15 4 L14 12 Z" />
  </svg>
)

/** 그달 첫 값. forMonth가 지금 달과 다르면 첫 값 전으로 본다(달을 옮긴 직후 이전 달 숫자를 보이지 않게). */
type Loaded<T> = { forMonth: string; value: T } | { forMonth: string; error: true }

export default function CalendarPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const today = toDateKey(new Date())
  const month = parseMonth(params.get('month'), today)
  const week = parseWeek(params.get('week'), month, today)
  const tab: Tab = TABS.find((t) => t === params.get('tab')) ?? 'week'
  const { start, end } = gridRange(month)
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const leaving = useRef(false)

  const [nut, setNut] = useState<CalNut>(() => readKey(NUT_KEY, CAL_NUTS, 'kcal'))
  const [graphMetric, setGraphMetric] = useState<Metric>(() => {
    const n = readKey(NUT_KEY, CAL_NUTS, 'kcal')
    return n === 'weight' ? readKey(GRAPH_KEY, METRICS, 'kcal') : n
  })
  const [days, setDays] = useState<Loaded<Map<string, Nutrients>> | null>(null)
  const [goals, setGoals] = useState<Loaded<DatedGoal[]> | null>(null)
  const [weights, setWeights] = useState<Loaded<Map<string, number>> | null>(null)

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
  useEffect(() => {
    const r = monthRange(month)
    return subscribeWeightsInRange(
      uid,
      r.start,
      r.end,
      (m) => setWeights({ forMonth: month, value: m }),
      () => setWeights({ forMonth: month, error: true }),
    )
  }, [uid, month])

  const daysNow = days && days.forMonth === month ? days : null
  const goalsNow = goals && goals.forMonth === month ? goals : null
  const weightsNow = weights && weights.forMonth === month ? weights : null
  const ready = daysNow !== null && goalsNow !== null
  // 숫자·색은 두 구독의 첫 값이 모두 온 뒤에만(숫자 먼저, 색 나중으로 깜빡이지 않게). 기록 오류면 숫자 없이, 목표 오류면 색 없이.
  const dayTotals = ready && 'value' in daysNow ? daysNow.value : null
  const goalList = ready && 'value' in goalsNow ? goalsNow.value : null
  const weightMap = weightsNow && 'value' in weightsNow ? weightsNow.value : null

  const notice =
    nut === 'weight'
      ? weightsNow && 'error' in weightsNow
        ? '체중 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
        : null
      : ready && dayTotals === null
        ? '기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
        : ready && goalList === null
          ? '목표를 불러오지 못해 색 없이 보여요.'
          : null

  function chooseNut(n: CalNut) {
    setNut(n)
    writeKey(NUT_KEY, n)
    if (n !== 'weight') {
      setGraphMetric(n)
      writeKey(GRAPH_KEY, n)
    }
  }

  /** 같은 화면 안 주소 바꾸기(replace, fromHome state 그대로) */
  function go(next: { month: string; week?: string; tab: Tab }) {
    const q = new URLSearchParams({ month: next.month })
    if (next.week) q.set('week', next.week)
    if (next.tab !== 'week') q.set('tab', next.tab)
    navigate({ pathname: '/calendar', search: `?${q}` }, { replace: true, state: location.state })
  }

  function moveMonth(delta: number) {
    const next = shiftMonth(month, delta)
    if (next > today.slice(0, 7)) return
    go({ month: next, tab })
  }

  function moveWeek(delta: number) {
    if (delta > 0 && isCurrentOrLaterWeek(week, today)) return
    const next = shiftWeek(week, delta)
    go({ month: monthForWeek(month, next), week: next, tab })
  }

  function chooseTab(t: Tab) {
    go({ month, week: params.get('week') ? week : undefined, tab: t })
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
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={goHome} />
        </div>
        <h1>기록 보기</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad">
        {notice && (
          <p className="note" role="status" style={{ margin: '0 0 12px' }}>
            {notice}
          </p>
        )}
        <RecordCalendar
          month={month}
          today={today}
          nut={nut}
          ready={ready}
          days={dayTotals}
          goals={goalList}
          weights={weightMap}
          onMoveMonth={moveMonth}
          onOpenDay={(d) => void openDay(d)}
          onNut={chooseNut}
        />
        <div className="segment" role="tablist" aria-label="통계" style={{ marginTop: 26 }}>
          <button type="button" role="tab" aria-selected={tab === 'week'} onClick={() => chooseTab('week')}>
            주간
          </button>
          <button type="button" role="tab" aria-selected={tab === 'month'} onClick={() => chooseTab('month')}>
            월간 {TAB_CROWN}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ai'} onClick={() => chooseTab('ai')}>
            AI 리포트 {TAB_CROWN}
          </button>
        </div>
        {tab === 'week' ? (
          <WeekPane weekStart={week} today={today} metric={graphMetric} ready={ready} days={dayTotals} goals={goalList} onMoveWeek={moveWeek} />
        ) : tab === 'month' ? (
          <MonthPane month={month} today={today} metric={graphMetric} ready={ready} days={dayTotals} goals={goalList} />
        ) : (
          <AiReportPane uid={uid} today={today} onOpenDay={(d) => void openDay(d)} />
        )}
      </div>
    </main>
  )
}
