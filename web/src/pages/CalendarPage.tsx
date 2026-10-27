// S10 달력(3단계 조각 3-1, 스펙 4.7절 "달력", M18). AI 호출 없음.
// 주소 /calendar?month=YYYY-MM(없거나 틀리거나 이번 달보다 뒤면 이번 달, lib/calendar.ts parseMonth).
// 그달 1일~말일 기록(subscribeDaysInRange)과 말일까지의 날짜별 목표(subscribeGoalsUpTo)를 구독해, 날마다 총 kcal과
// 목표 대비 색(calendarTone + goalForDate)을 보인다. 두 구독의 첫 값이 모두 오기 전에는 숫자·색을 비우고 "불러오는 중…".
// 방문 기록: 홈에서 push(state.fromHome)로 들어온다. 달 이동은 ?month만 replace(state는 그대로 넘겨 fromHome을 지킨다).
// ‹ = 홈에서 왔으면 navigate(-1), 주소로 바로 열었으면 홈으로 replace.
// 날짜 누르기 = 홈에서 왔으면 navigate(-1)이 끝난 뒤(라우터가 돌려주는 promise) 그 홈 자리를 그날 홈으로 replace,
// 주소로 바로 열었으면 달력 자리를 그날 홈으로 replace. 어느 쪽이든 홈이 두 번 쌓이지 않는다.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { dateKeyLabel, formatKcal, homeHref } from '../components/mealText'
import { subscribeGoalsUpTo, type DatedGoal } from '../data/goals'
import { subscribeDaysInRange } from '../data/meals'
import {
  calendarTone,
  goalForDate,
  monthCells,
  monthRange,
  parseMonth,
  shiftMonth,
  type CalendarTone,
} from '../lib/calendar'
import { toDateKey } from '../lib/time'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

const TONE_CLASS: Record<Exclude<CalendarTone, null>, string> = {
  green: 'bg-emerald-100 text-emerald-900',
  orange: 'bg-orange-100 text-orange-900',
  blue: 'bg-sky-100 text-sky-900',
  gray: 'bg-gray-200 text-gray-700',
}

const TONE_LABEL: Record<Exclude<CalendarTone, null>, string> = {
  green: '목표 근처',
  orange: '목표 초과',
  blue: '목표 미달',
  gray: '기록 없음',
}

const LEGEND: { tone: Exclude<CalendarTone, null>; text: string }[] = [
  { tone: 'green', text: '목표 근처 90~110%' },
  { tone: 'orange', text: '초과' },
  { tone: 'blue', text: '미달' },
  { tone: 'gray', text: '기록 없음' },
]

const navBtn = 'flex min-h-11 min-w-20 items-center rounded-lg px-3 text-sm'

function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}년 ${m}월`
}

/** 그달 첫 값. forMonth가 지금 달과 다르면 첫 값 전으로 본다(달을 옮긴 직후 이전 달 숫자를 보이지 않게). */
type Loaded<T> = { forMonth: string; value: T } | { forMonth: string; error: true }

export default function CalendarPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const today = toDateKey(new Date())
  const month = parseMonth(params.get('month'), today)
  const isThisMonth = month === today.slice(0, 7)
  const { start, end } = monthRange(month)
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const leaving = useRef(false)

  const [days, setDays] = useState<Loaded<Map<string, number>> | null>(null)
  const [goals, setGoals] = useState<Loaded<DatedGoal[]> | null>(null)

  useEffect(
    () =>
      subscribeDaysInRange(
        uid,
        start,
        end,
        (m) => setDays({ forMonth: month, value: new Map([...m].map(([k, s]) => [k, s.totals.kcal])) }),
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
  const dayKcal = ready && daysNow !== null && 'value' in daysNow ? daysNow.value : null
  const goalList = ready && goalsNow !== null && 'value' in goalsNow ? goalsNow.value : null
  const daysError = daysNow !== null && 'error' in daysNow
  const goalsError = goalsNow !== null && 'error' in goalsNow

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

  const cells = monthCells(month)

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
        <span className="text-sm text-gray-600">달력</span>
      </header>

      <nav aria-label="달 이동" className="mt-1 flex items-center justify-between gap-1">
        <button type="button" onClick={() => moveMonth(-1)} className={`${navBtn} text-gray-700`}>
          ◀ 지난달
        </button>
        <h1 className="min-w-0 text-center text-xl font-bold">{monthTitle(month)}</h1>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          disabled={isThisMonth}
          className={`${navBtn} justify-end ${isThisMonth ? 'text-gray-300' : 'text-gray-700'}`}
        >
          다음 달 ▶
        </button>
      </nav>

      <p role="status" className="mt-2 min-h-5 text-center text-sm">
        {!ready ? (
          <span className="text-gray-500">불러오는 중…</span>
        ) : daysError ? (
          <span className="text-amber-800">기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</span>
        ) : goalsError ? (
          <span className="text-amber-800">목표를 불러오지 못해 색 없이 보여요.</span>
        ) : null}
      </p>

      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-xs sm:gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            aria-hidden="true"
            className={`py-1 font-medium ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} aria-hidden="true" />
          const isFuture = d > today
          const isToday = d === today
          const kcal = dayKcal?.get(d) ?? null
          const target = goalList ? (goalForDate(goalList, d)?.target_kcal ?? null) : null
          const tone = isFuture || !dayKcal || !goalList ? null : calendarTone(kcal, target)
          const kcalText = kcal === null ? '' : formatKcal(kcal)
          const status = isFuture
            ? '아직 오지 않은 날'
            : !ready
              ? '불러오는 중'
              : tone
                ? TONE_LABEL[tone]
                : kcal === null && dayKcal
                  ? '기록 없음'
                  : ''
          const label = [dateKeyLabel(d), isToday && '오늘', kcalText && `${kcalText}kcal`, status]
            .filter(Boolean)
            .join(', ')
          return (
            <button
              key={d}
              type="button"
              disabled={isFuture}
              onClick={() => void openDay(d)}
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
              className={`flex aspect-square min-h-11 flex-col items-center justify-start rounded-lg pt-1 ${
                tone ? TONE_CLASS[tone] : 'bg-white text-gray-900'
              } ${isToday ? 'ring-2 ring-emerald-600 ring-inset' : ''} ${isFuture ? 'opacity-40' : ''}`}
            >
              <span className={`text-sm leading-tight ${isToday ? 'font-bold' : 'font-medium'}`}>
                {Number(d.slice(8))}
              </span>
              <span
                className={`mt-auto mb-1 leading-none font-semibold tabular-nums ${
                  kcalText.length > 5 ? 'text-[9px] sm:text-[11px]' : 'text-[11px] sm:text-xs'
                }`}
              >
                {kcalText}
              </span>
            </button>
          )
        })}
      </div>

      <ul aria-label="색 설명" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
        {LEGEND.map(({ tone, text }) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-3.5 w-3.5 rounded ${TONE_CLASS[tone]}`} />
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-500">
        숫자는 그날 먹은 kcal이에요. 그날 목표가 없으면 색 없이 숫자만 보여요. 날짜를 누르면 그날 기록으로 가요.
      </p>
    </main>
  )
}
