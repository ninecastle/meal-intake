// S1 홈 = 하루 요약(3단계 조각 1). 위에서부터 사용자 줄, 날짜 이동(◀ 어제 · 날짜 · 내일 ▶, ?date=YYYY-MM-DD), 저장·오프라인 안내,
// 이어 할 기록 카드(awaiting_after·needs_review, 날짜와 무관하게 전부), 그날 합계 kcal·탄·단·지(subscribeDay, 클라이언트 합산),
// 끼니별 기록 목록(누르면 S7 /meal/:mealId), 영양 정보 출처, 아래 고정 [식사 기록]·[직접 입력](보고 있는 날짜로).
// 목표 비교 막대·목표 설정 카드는 3단계 조각 4에서 더한다.
import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  MEAL_TYPE_LABEL,
  MEAL_TYPES,
  NUTRITION_SOURCE_NOTE,
  clockFmt,
  dateKeyLabel,
  formatKcal,
  formatMacro,
  homeHref,
  isDateKey,
  shiftDateKey,
} from '../components/mealText'
import { deleteMeal, subscribeDay, subscribePending, type MealWithId } from '../data/meals'
import type { DaySummary } from '../data/summary'
import { signOutAndClear } from '../lib/auth'
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

function whenText(m: MealWithId, today: string): string {
  const d = m.createdAt?.toDate()
  const t = d ? clockFmt.format(d) : '방금'
  return m.dateKey === today ? t : `${shortDate(m.dateKey)} ${t}`
}

function namesText(m: MealWithId): string {
  const items: { name: string }[] = m.analysis?.items ?? m.beforeAnalysis?.items ?? []
  const names = items.map((i) => i.name).filter(Boolean)
  if (names.length === 0) return '음식 정보 없음'
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개` : names.join(', ')
}

/** 하루 요약 기록 줄: 2개까지 + "외 N개" */
function itemsText(itemNames: string[]): string {
  const names = itemNames.filter(Boolean)
  if (names.length === 0) return '음식 정보 없음'
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}개` : names.join(', ')
}

const MACRO_CELLS = [
  { k: 'carbs_g', label: '탄수화물' },
  { k: 'protein_g', label: '단백질' },
  { k: 'fat_g', label: '지방' },
] as const

const navBtn = 'flex min-h-11 min-w-20 items-center rounded-lg px-3 text-sm'

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

      <nav aria-label="날짜 이동" className="mt-1 flex items-center justify-between gap-1">
        <Link to={homeHref(shiftDateKey(dateKey, -1), today)} replace className={`${navBtn} text-gray-700`}>
          ◀ 어제
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="text-xl font-bold">{isToday ? '오늘' : dateKeyLabel(dateKey)}</h1>
          {isToday && <p className="text-xs text-gray-500">{dateKeyLabel(dateKey)}</p>}
        </div>
        {isToday ? (
          <button type="button" disabled className={`${navBtn} justify-end text-gray-300`}>
            내일 ▶
          </button>
        ) : (
          <Link to={homeHref(shiftDateKey(dateKey, 1), today)} replace className={`${navBtn} justify-end text-gray-700`}>
            내일 ▶
          </Link>
        )}
      </nav>

      {saved && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          저장했어요 · {formatKcal(saved.consumedKcal)}kcal
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

      <div className="flex-1 pb-4">
        {pending && pending.length > 0 && (
          <ul className="mt-4 space-y-3">
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
        )}

        <section aria-label="하루 합계" className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          {dayError && (
            <p className="mb-2 text-sm text-amber-800">요약을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          )}
          {summary ? (
            <>
              <p className="text-sm text-gray-600">{isToday ? '오늘' : '이 날'} 먹은 양</p>
              <p className="text-3xl font-bold">
                {formatKcal(summary.totals.kcal)}
                <span className="ml-1 text-base font-medium text-gray-600">kcal</span>
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                {MACRO_CELLS.map(({ k, label }) => (
                  <div key={k} className="rounded-lg bg-gray-50 py-2">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="font-semibold">{formatMacro(summary.totals[k])}g</dd>
                  </div>
                ))}
              </dl>
              {summary.incompleteMacros && (
                <p className="mt-2 text-xs text-amber-700">일부 음식의 탄·단·지가 빠져 있어요</p>
              )}
              {summary.hasPendingWrites && (
                <p className="mt-1 text-xs text-gray-600">저장 대기 중(연결되면 올라가요)</p>
              )}
            </>
          ) : (
            !dayError && <p className="text-sm text-gray-500">불러오는 중…</p>
          )}
        </section>

        {summary &&
          (summary.meals.length === 0 ? (
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-center">
              <p className="font-medium text-gray-700">이 날은 기록이 없어요</p>
              {isToday && (
                <p className="mt-1 text-sm text-gray-600">
                  먹기 전에 한 장, 다 먹고 한 장 찍으면 먹은 양을 계산해 드려요. 아래 [식사 기록]을 눌러 시작하세요.
                </p>
              )}
            </div>
          ) : (
            <>
              {MEAL_TYPES.map((t) => {
                const rows = summary.meals.filter((m) => m.mealType === t)
                if (rows.length === 0) return null
                return (
                  <section key={t} aria-label={MEAL_TYPE_LABEL[t]} className="mt-4">
                    <div className="flex items-baseline justify-between px-1">
                      <h2 className="font-semibold">{MEAL_TYPE_LABEL[t]}</h2>
                      <span className="text-sm text-gray-600">{formatKcal(summary.byMealType[t].kcal)}kcal</span>
                    </div>
                    <ul className="mt-1 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                      {rows.map((m) => (
                        <li key={m.id}>
                          <Link to={`/meal/${m.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{itemsText(m.itemNames)}</p>
                              <p className="text-xs text-gray-500">
                                {m.createdAt ? clockFmt.format(m.createdAt) : '방금'}
                                {m.editedAt && <span className="ml-1 text-gray-400">· 수정됨</span>}
                              </p>
                            </div>
                            <span className="shrink-0 font-semibold">{formatKcal(m.consumed.kcal)}kcal</span>
                            <span aria-hidden="true" className="text-gray-400">
                              ›
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
              <p className="mt-4 text-xs text-gray-500">{NUTRITION_SOURCE_NOTE}. DB에 없는 음식은 AI 추정값이에요.</p>
            </>
          ))}
      </div>

      <div className="sticky bottom-0 -mx-4 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          to="/capture/before"
          className="flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white"
        >
          식사 기록
        </Link>
        <Link
          to={`/meal/new/review?date=${dateKey}`}
          className="mt-1 flex min-h-11 items-center justify-center text-sm text-gray-600 underline"
        >
          {isToday ? '사진 없이 직접 입력' : `${dateKeyLabel(dateKey)} 기록 직접 입력`}
        </Link>
      </div>
    </main>
  )
}
