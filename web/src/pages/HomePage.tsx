// S1 홈 = 하루 요약. 디자인 조각 D2-H1(시안 home()): 위쪽 고정 줄(기록 보기·설정 아이콘, 날짜 줄 "10.26 월 · 10.27 오늘 · 10.28 화",
// 내일 이후 막기, 오늘이 아니면 [오늘로], ?date=YYYY-MM-DD) → 하늘 띠 "나의 하루"(DayBand: 링·탄단지·막대·작은 줄·남은 양, 목표 없으면 목표 설정 안내)
// → 연두 띠 "식사"(MealBand: 끼니 카드·이어 할 기록·기록 시작, D2-H2 담당) → 복숭아 띠 "나의 변화"(ChangeBand: 체중 자리, D6).
// 데이터: subscribeDay(그날 done 합산, 클라이언트), subscribePending(날짜와 무관한 이어 할 기록), subscribeGoal·subscribeGoalForDate(그날 비교 목표).
// 저장·목표 저장 안내는 공통 토스트로, 오프라인·불러오기 오류는 날짜 줄 아래 안내 상자로 보인다. AI 호출 없음.
// 로그아웃·개발 링크는 설정(D8)이 생길 때까지 맨 아래 작은 글자로 둔다.
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import ChangeBand from '../components/home/ChangeBand'
import DayBand, { type DayGoalView } from '../components/home/DayBand'
import HomeDateBar from '../components/home/HomeDateBar'
import MealBand from '../components/home/MealBand'
import { formatKcal, isDateKey } from '../components/mealText'
import { Band, Toast } from '../components/ui'
import { subscribeGoal, subscribeGoalForDate, type DatedGoal, type StoredGoal } from '../data/goals'
import { subscribeDay, subscribePending, type MealWithId } from '../data/meals'
import type { DaySummary } from '../data/summary'
import { signOutAndClear } from '../lib/auth'
import { clearFlash, peekFlash } from '../lib/flash'
import { toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'

// 앱 시작(로그인 뒤) 1회: 이어 할 먹기 전 사진만 남기고 IndexedDB를 정리한다(스펙 4.3 "앱 시작").
let photoCleanupDone = false

type SavedNotice = { dateKey: string; consumedKcal: number }

function readSaved(state: unknown): SavedNotice | null {
  const s = (state as { saved?: Partial<SavedNotice> } | null)?.saved
  return s && typeof s.dateKey === 'string' && typeof s.consumedKcal === 'number'
    ? { dateKey: s.dateKey, consumedKcal: s.consumedKcal }
    : null
}

function shortDate(dateKey: string): string {
  const [, mm, dd] = dateKey.split('-')
  return `${Number(mm)}월 ${Number(dd)}일`
}

export default function HomePage({ user }: { user: User }) {
  const uid = user.uid
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [saved, setSaved] = useState<SavedNotice | null>(null)
  const [pending, setPending] = useState<MealWithId[] | null>(null)
  const [listError, setListError] = useState(false)
  const [day, setDay] = useState<DaySummary | null>(null)
  const [dayErrorKey, setDayErrorKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [loggingOut, setLoggingOut] = useState(false)
  // [한눈에]·[자세히]·[기록하기]: 화면이 아직 없어 "준비 중이에요" 토스트(D5·D6에서 바꾼다)
  const [soon, setSoon] = useState(false)
  // 현재 목표(users/{uid}.goal). undefined = 첫 값 전
  const [goal, setGoal] = useState<StoredGoal | null | undefined>(undefined)
  const [goalError, setGoalError] = useState(false)
  // 보고 있는 날짜의 비교 목표(users/{uid}/goals). forDate가 지금 날짜와 다르면 첫 값 전으로 본다.
  const [dated, setDated] = useState<{ forDate: string; goal: DatedGoal | null } | null>(null)
  const [datedErrorKey, setDatedErrorKey] = useState<string | null>(null)
  // 목표 설정(S6)에서 저장하고 돌아왔으면 3초 안내(lib/flash, 키는 GoalPage와 같다)
  const [goalNotice, setGoalNotice] = useState<'saved' | 'pending' | null>(() =>
    peekFlash('goal:saved') ? 'saved' : peekFlash('goal:pending') ? 'pending' : null,
  )
  const today = toDateKey(new Date())
  // 보고 있는 날짜. 없거나 틀리거나 미래면 오늘.
  const rawDate = params.get('date')
  const dateKey = isDateKey(rawDate) && rawDate <= today ? rawDate : today
  const isToday = dateKey === today

  // ReviewPage가 저장 뒤 넘겨준 안내. 그 날짜가 오늘이 아니면 그 날짜 요약으로 옮긴다.
  // 새로고침 때 다시 뜨지 않게 기록 상태를 비운다.
  useEffect(() => {
    const s = readSaved(location.state)
    if (!s) return
    setSaved(s)
    const now = toDateKey(new Date())
    const search = isDateKey(s.dateKey) && s.dateKey < now ? `?date=${s.dateKey}` : location.search
    navigate({ pathname: location.pathname, search }, { replace: true, state: null })
    // location.key가 바뀔 때만 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), 3000)
    return () => clearTimeout(t)
  }, [saved])

  useEffect(() => {
    clearFlash('goal:saved')
    clearFlash('goal:pending')
  }, [])
  useEffect(() => {
    if (!goalNotice) return
    const t = window.setTimeout(() => setGoalNotice(null), 3000)
    return () => window.clearTimeout(t)
  }, [goalNotice])

  useEffect(() => {
    if (!soon) return
    const t = window.setTimeout(() => setSoon(false), 2000)
    return () => window.clearTimeout(t)
  }, [soon])

  useEffect(
    () =>
      subscribeGoal(
        uid,
        (g) => {
          setGoal(g)
          setGoalError(false)
        },
        () => setGoalError(true),
      ),
    [uid],
  )

  useEffect(
    () =>
      subscribePending(
        uid,
        (meals) => {
          setPending(meals)
          setListError(false)
          if (!photoCleanupDone) {
            photoCleanupDone = true
            const keep = meals.filter((m) => m.status === 'awaiting_after').map((m) => m.id)
            beforePhotoStore.cleanup(keep).catch((e: unknown) => console.warn('[home] 먹기 전 사진 정리 실패', e))
          }
        },
        () => setListError(true),
      ),
    [uid],
  )

  useEffect(
    () =>
      subscribeDay(
        uid,
        dateKey,
        (s: DaySummary) => {
          setDay(s)
          setDayErrorKey(null)
        },
        () => setDayErrorKey(dateKey),
      ),
    [uid, dateKey],
  )
  // 날짜를 옮긴 직후에는 이전 날짜 요약을 보이지 않는다.
  const summary = day && day.dateKey === dateKey ? day : null
  const dayError = dayErrorKey === dateKey

  // 그날 목표: 날짜가 바뀌면 다시 구독한다. 목표를 저장하면 goals/{오늘}이 바뀌어 오늘 구독에 바로 들어온다.
  useEffect(
    () =>
      subscribeGoalForDate(
        uid,
        dateKey,
        (g) => {
          setDated({ forDate: dateKey, goal: g })
          setDatedErrorKey(null)
        },
        () => setDatedErrorKey(dateKey),
      ),
    [uid, dateKey],
  )
  // undefined = 이 날짜의 첫 값 전
  const datedGoal = dated && dated.forDate === dateKey ? dated.goal : undefined
  const datedError = datedErrorKey === dateKey
  // 오늘은 현재 목표와 같다(스펙). 날짜별 기록이 빠진 예전 데이터라도 오늘은 현재 목표로 비교한다.
  const dayTargets = datedGoal?.targets ?? (isToday && datedGoal === null && goal ? goal.targets : null)

  // 그날 목표와 현재 목표의 첫 값 전에는 안내를 비운다(깜빡임 방지).
  let goalView: DayGoalView
  if (datedGoal === undefined) goalView = { kind: datedError ? 'error' : 'loading' }
  else if (dayTargets) goalView = { kind: 'targets', targets: dayTargets }
  else if (goal === undefined) goalView = { kind: goalError ? 'error' : 'loading' }
  else if (goal === null) goalView = { kind: 'none' }
  else goalView = { kind: 'before' }

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await signOutAndClear()
    } catch {
      setLoggingOut(false)
      setActionError('로그아웃하지 못했어요. 다시 해 주세요.')
    }
  }

  const toastText = soon
    ? '준비 중이에요'
    : saved
      ? `저장했어요 · ${formatKcal(saved.consumedKcal)}kcal${saved.dateKey !== today ? ` (${shortDate(saved.dateKey)})` : ''}`
      : goalNotice === 'saved'
        ? '목표를 저장했어요'
        : goalNotice === 'pending'
          ? '목표를 저장했어요. 연결되면 올라가요.'
          : null

  const hasNotice = !online || listError || actionError != null
  const showSoon = () => setSoon(true)

  return (
    <main className="pb-[120px]">
      <HomeDateBar dateKey={dateKey} today={today} />

      {hasNotice && (
        <div className="pad space-y-2 pb-3 text-[15px]">
          {!online && <p className="rounded-tile bg-ground px-4 py-2.5 text-ink">오프라인이에요. 기록은 연결되면 저장돼요.</p>}
          {listError && (
            <p className="rounded-tile bg-butter-soft px-4 py-2.5 text-ink">
              이어 할 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
            </p>
          )}
          {actionError && <p className="text-peach-deep">{actionError}</p>}
        </div>
      )}

      <DayBand summary={summary} dayError={dayError} isToday={isToday} goal={goalView} onSoon={showSoon} />

      <Band tone="lime" title="식사">
        <MealBand uid={uid} dateKey={dateKey} day={summary} pending={pending} />
      </Band>

      <ChangeBand onSoon={showSoon} />

      <footer className="pad mt-6 flex flex-wrap items-center justify-center gap-x-1 text-[13px] text-ink-3">
        <span className="max-w-full truncate">{user.displayName ?? user.email ?? '로그인됨'}</span>
        {import.meta.env.DEV && (
          <Link to="/dev" className="focus-ring flex min-h-11 items-center rounded-chip px-2">
            개발
          </Link>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          className="focus-ring min-h-11 rounded-chip px-2 underline disabled:opacity-35"
        >
          로그아웃
        </button>
      </footer>

      <Toast message={toastText} />
    </main>
  )
}
