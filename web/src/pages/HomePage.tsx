// S1 홈(2단계 최소판): [식사 기록] 주 버튼, [직접 입력], 이어 할 기록 카드(awaiting_after·needs_review), 저장 안내, 사용자 줄.
// 하루 요약·목표 비교는 3단계에서 이 화면에 더한다.
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { Link, useLocation, useNavigate } from 'react-router'
import { deleteMeal, subscribePending, type MealType, type MealWithId } from '../data/meals'
import { signOutAndClear } from '../lib/auth'
import { APP_TIMEZONE, toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'

const MEAL_TYPE_LABEL: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' }

const timeFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: APP_TIMEZONE, hour: 'numeric', minute: '2-digit' })
const todayFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: APP_TIMEZONE, month: 'long', day: 'numeric', weekday: 'short' })

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

function whenText(m: MealWithId, today: string): string {
  const d = m.createdAt?.toDate()
  const t = d ? timeFmt.format(d) : '방금'
  return m.dateKey === today ? t : `${shortDate(m.dateKey)} ${t}`
}

function namesText(m: MealWithId): string {
  const items: { name: string }[] = m.analysis?.items ?? m.beforeAnalysis?.items ?? []
  const names = items.map((i) => i.name).filter(Boolean)
  if (names.length === 0) return '음식 정보 없음'
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개` : names.join(', ')
}

export default function HomePage({ user }: { user: User }) {
  const uid = user.uid
  const navigate = useNavigate()
  const location = useLocation()
  const [saved, setSaved] = useState<SavedNotice | null>(null)
  const [pending, setPending] = useState<MealWithId[] | null>(null)
  const [listError, setListError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [loggingOut, setLoggingOut] = useState(false)
  const today = toDateKey(new Date())

  // ReviewPage가 저장 뒤 넘겨준 안내. 새로고침 때 다시 뜨지 않게 기록 상태를 비운다.
  useEffect(() => {
    const s = readSaved(location.state)
    if (!s) return
    setSaved(s)
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    // location.key가 바뀔 때만 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(null), 3000)
    return () => clearTimeout(t)
  }, [saved])

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

  function cancelMeal(m: MealWithId) {
    if (!window.confirm('이 기록을 취소할까요?')) return
    setActionError(null)
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다). 목록은 로컬 캐시로 바로 바뀐다.
    deleteMeal(uid, m.id).catch(() => setActionError('기록을 취소하지 못했어요. 잠시 뒤 다시 해 주세요.'))
    beforePhotoStore.remove(m.id).catch((e: unknown) => console.warn('[home] 먹기 전 사진 삭제 실패', e))
  }

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-2">
      <header className="flex items-center justify-between gap-2 text-sm text-gray-600">
        <span className="truncate">{user.displayName ?? user.email ?? '로그인됨'}</span>
        <div className="flex shrink-0 items-center">
          {import.meta.env.DEV && (
            <Link to="/dev" className="flex min-h-11 items-center px-2 text-xs text-gray-400">
              개발
            </Link>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="min-h-11 rounded px-3 text-gray-600 disabled:opacity-50"
          >
            로그아웃
          </button>
        </div>
      </header>

      <h1 className="mt-2 text-2xl font-bold">{todayFmt.format(new Date())}</h1>

      {saved && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          저장했어요 · {Math.round(saved.consumedKcal).toLocaleString('ko-KR')}kcal
          {saved.dateKey !== today && ` (${shortDate(saved.dateKey)})`}
        </p>
      )}
      {!online && (
        <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
          오프라인이에요. 기록은 연결되면 저장돼요.
        </p>
      )}
      {listError && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          이어 할 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
        </p>
      )}
      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

      <section className="mt-4 flex-1">
        {pending && pending.length > 0 ? (
          <ul className="space-y-3">
            {pending.map((m) => (
              <li key={m.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-600">
                      {MEAL_TYPE_LABEL[m.mealType] ?? '식사'} · {whenText(m, today)}
                    </p>
                    <p className="truncate font-medium">{namesText(m)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelMeal(m)}
                    className="min-h-11 shrink-0 px-2 text-sm text-gray-500 underline"
                  >
                    기록 취소
                  </button>
                </div>
                <Link
                  to={m.status === 'awaiting_after' ? `/meal/${m.id}/after` : `/meal/${m.id}/review`}
                  className="mt-2 flex min-h-12 items-center justify-center rounded-lg bg-amber-500 px-4 font-semibold text-white"
                >
                  {m.status === 'awaiting_after' ? '다 드셨나요? 남은 음식 찍기' : '확인하고 저장하기'}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          pending && (
            <p className="text-sm text-gray-600">먹기 전에 한 장, 다 먹고 한 장 찍으면 먹은 양을 계산해 드려요.</p>
          )
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          to="/capture/before"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white"
        >
          식사 기록
        </Link>
        <Link
          to={`/meal/new/review?date=${today}`}
          className="mt-1 flex min-h-11 items-center justify-center text-sm text-gray-600 underline"
        >
          사진 없이 직접 입력
        </Link>
      </div>
    </main>
  )
}
