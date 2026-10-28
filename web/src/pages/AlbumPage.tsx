// 식단 앨범(디자인 조각 D9, 시안 album() 마크업·클래스 그대로, 2026-10-28 사용자 확인 _workspace/design/mock/d9_1_album.png). AI 호출 없음.
// div.screen > .topbar.sticky(‹ "식단 앨범") → .pad > .calhead + .cal(RecordCalendar bare, 기록 보기와 같은 칼로리 히트맵 "시안 그대로")
// → h2 "10월 27일"(18px, 위 26px) → .pairs: 끼니(아침·점심·저녁·간식 순)마다 .pair(h3 끼니 + 먹은 시간) > .two(.shot 먹기 전·먹은 후).
// 같은 끼니의 두 번째 기록부터는 h3 없이 .pair(margin-top −8px). 한쪽 사진이 없으면 회색 "사진 없음" 칸.
// 기록이 없는 날 "이날은 아직 기록이 없어요.", 기록은 있는데 보관한 사진이 없으면 "이날은 보관한 사진이 없어요."
// 보이는 기록은 그날 모든 기록: 저장을 마친 기록(subscribeDayMeals) + 먹은 후를 기다리는 기록(subscribePending 중 그 날짜, 먹기 전 사진 + "사진 없음", 2026-10-28 사용자 결정). 사진은 그날 기록 id로 getMealPhotos 한 번(기록 목록이 바뀔 때만 다시).
// 주소 /album?month=YYYY-MM&date=YYYY-MM-DD(달·날 바꾸기는 replace, state 그대로라 fromHome을 지킨다). 날 기본은 오늘, 미래 날은 못 고른다.
// 방문 기록: 홈 [식단 앨범]에서 push(state.fromHome). ‹ = 홈에서 왔으면 navigate(-1), 아니면 홈으로 replace.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { isDateKey, MEAL_TYPE_LABEL, MEAL_TYPES } from '../components/mealText'
import { PhotoViewer, Shot, type PhotoView } from '../components/photos/PhotoViewer'
import RecordCalendar from '../components/record/RecordCalendar'
import { IconButton } from '../components/ui'
import { subscribeGoalsUpTo, type DatedGoal } from '../data/goals'
import { getMealPhotos, type MealPhotos } from '../data/mealPhotos'
import { subscribeDayMeals, subscribeDaysInRange, subscribePending, type MealWithId } from '../data/meals'
import { subscribeMealTimes, type MealTimes } from '../data/mealTimes'
import { gridRange, parseMonth, shiftMonth } from '../lib/calendar'
import { toDateKey } from '../lib/time'
import type { Nutrients } from '../types/analysis'

type Loaded<T> = { key: string; value: T } | { key: string; error: true }

export default function AlbumPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const today = toDateKey(new Date())
  const rawDate = params.get('date')
  const date = isDateKey(rawDate) && rawDate <= today ? rawDate : today
  const month = parseMonth(params.get('month') ?? date.slice(0, 7), today)
  const { start, end } = gridRange(month)
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const leaving = useRef(false)

  const [days, setDays] = useState<Loaded<Map<string, Nutrients>> | null>(null)
  const [goals, setGoals] = useState<Loaded<DatedGoal[]> | null>(null)
  const [meals, setMeals] = useState<Loaded<MealWithId[]> | null>(null)
  const [pending, setPending] = useState<MealWithId[]>([])
  const [times, setTimes] = useState<{ key: string; value: MealTimes } | null>(null)
  const [photos, setPhotos] = useState<Loaded<Map<string, MealPhotos>> | null>(null)
  const [view, setView] = useState<PhotoView | null>(null)

  useEffect(
    () =>
      subscribeDaysInRange(
        uid,
        start,
        end,
        (m) => setDays({ key: month, value: new Map([...m].map(([k, s]) => [k, s.totals])) }),
        () => setDays({ key: month, error: true }),
      ),
    [uid, month, start, end],
  )
  useEffect(
    () =>
      subscribeGoalsUpTo(
        uid,
        end,
        (g) => setGoals({ key: month, value: g }),
        () => setGoals({ key: month, error: true }),
      ),
    [uid, month, end],
  )
  useEffect(
    () =>
      subscribeDayMeals(
        uid,
        date,
        (m) => setMeals({ key: date, value: m }),
        () => setMeals({ key: date, error: true }),
      ),
    [uid, date],
  )
  useEffect(() => subscribePending(uid, setPending), [uid])
  useEffect(() => subscribeMealTimes(uid, date, (t) => setTimes({ key: date, value: t })), [uid, date])

  const mealsNow = meals && meals.key === date ? meals : null
  const doneList = mealsNow && 'value' in mealsNow ? mealsNow.value : null
  const mealList = doneList ? [...doneList, ...pending.filter((m) => m.dateKey === date)] : null
  // 기록 목록(id 모음)이 바뀔 때만 사진을 다시 읽는다(값만 바뀐 기록 수정으로 사진을 다시 받지 않게)
  const idsKey = mealList ? `${date}|${mealList.map((m) => m.id).join(',')}` : null
  useEffect(() => {
    if (!idsKey || !mealList) return
    if (mealList.length === 0) {
      setPhotos({ key: idsKey, value: new Map() })
      return
    }
    let live = true
    getMealPhotos(
      uid,
      mealList.map((m) => m.id),
    ).then(
      (p) => live && setPhotos({ key: idsKey, value: p }),
      (e: unknown) => {
        console.warn('[album] 사진 불러오기 실패', e)
        if (live) setPhotos({ key: idsKey, error: true })
      },
    )
    return () => {
      live = false
    }
    // mealList는 idsKey와 함께 바뀐다
  }, [uid, idsKey])

  const daysNow = days && days.key === month ? days : null
  const goalsNow = goals && goals.key === month ? goals : null
  const ready = daysNow !== null && goalsNow !== null
  const dayTotals = ready && 'value' in daysNow ? daysNow.value : null
  const goalList = ready && 'value' in goalsNow ? goalsNow.value : null
  const photosNow = photos && photos.key === idsKey ? photos : null
  const photoMap = photosNow && 'value' in photosNow ? photosNow.value : null
  const timeMap = times && times.key === date ? times.value : {}

  /** 같은 화면 안 주소 바꾸기(replace, fromHome state 그대로) */
  function go(next: { month: string; date: string }) {
    const q = new URLSearchParams({ month: next.month, date: next.date })
    navigate({ pathname: '/album', search: `?${q}` }, { replace: true, state: location.state })
  }

  function moveMonth(delta: number) {
    const next = shiftMonth(month, delta)
    if (next > today.slice(0, 7)) return
    go({ month: next, date })
  }

  function goBack() {
    if (leaving.current) return
    leaving.current = true
    if (fromHome) void navigate(-1)
    else void navigate('/', { replace: true })
  }

  const closeView = useCallback(() => setView(null), [])

  const [, mm, dd] = date.split('-').map(Number)
  const notice =
    mealsNow && 'error' in mealsNow
      ? '기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
      : photosNow && 'error' in photosNow
        ? '사진을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
        : null

  let body: ReactNode = null
  if (mealList && mealList.length === 0) body = <p style={{ color: 'var(--ink-3)' }}>이날은 아직 기록이 없어요.</p>
  else if (mealList && photoMap) {
    const pairs = MEAL_TYPES.flatMap((t) => {
      const withPhotos = mealList.filter((m) => m.mealType === t && photoMap.has(m.id))
      const name = MEAL_TYPE_LABEL[t]
      const time = timeMap[t] ?? null
      return withPhotos.map((m, i) => {
        const p = photoMap.get(m.id)!
        const open = (src: string, side: string) => setView({ src, caption: `${name} · ${side}`, time })
        return (
          <div key={m.id} className="pair" style={i > 0 ? { marginTop: -8 } : undefined}>
            {i === 0 && (
              <h3>
                {name}
                {time && (
                  <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 500 }}>
                    {time}
                  </span>
                )}
              </h3>
            )}
            <div className="two">
              <Shot src={p.before} label="먹기 전" onOpen={() => p.before && open(p.before, '먹기 전')} />
              <Shot src={p.after} label="먹은 후" onOpen={() => p.after && open(p.after, '먹은 후')} />
            </div>
          </div>
        )
      })
    })
    body = pairs.length > 0 ? pairs : <p style={{ color: 'var(--ink-3)' }}>이날은 보관한 사진이 없어요.</p>
  }

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={goBack} />
        </div>
        <h1>식단 앨범</h1>
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
          nut="kcal"
          ready={ready}
          days={dayTotals}
          goals={goalList}
          weights={null}
          onMoveMonth={moveMonth}
          onOpenDay={(d) => d <= today && go({ month, date: d })}
          onNut={() => {}}
          bare
          selected={date}
        />
        <h2 style={{ fontSize: 18, margin: '26px 0 0' }}>{`${mm}월 ${dd}일`}</h2>
        <div className="pairs">{body}</div>
      </div>
      <PhotoViewer view={view} onClose={closeView} />
    </main>
  )
}
