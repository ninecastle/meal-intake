// S4 결과 확인·수정 화면(/meal/:mealId/review, 직접 입력 /meal/new/review?date=YYYY-MM-DD). 스펙 2.2·2.3절.
// 화면 사이 계약: 들어올 때 state { analysis, dateKey, mealType }(없으면 getMeal), 저장 뒤 '/'에 state { saved: { dateKey, consumedKcal } }.
// 계산·합계·출처 문구는 ReviewEditor가 보여 준다(여기서 다시 만들지 않는다). AI 호출은 이 화면에서 하지 않는다.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  UNSAFE_DataRouterContext,
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { buildAnalysis } from '../analysis/compute'
import { validateAnalysis } from '../analysis/validate'
import ReviewEditor from '../components/review/ReviewEditor'
import { getMeal, MealStoreError, newMealId, saveMeal, type MealStoreErrorCode, type MealType } from '../data/meals'
import { useAuthUser } from '../lib/auth'
import { APP_TIMEZONE, guessMealType, toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import type { MealIntakeAnalysis } from '../types/analysis'

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '아침' },
  { value: 'lunch', label: '점심' },
  { value: 'dinner', label: '저녁' },
  { value: 'snack', label: '간식' },
]
const LEAVE_MSG = '저장하지 않고 나갈까요?'
/** 오프라인이면 쓰기 Promise가 서버 확인까지 끝나지 않는다. 이 시간이 지나면 "연결되면 자동으로 저장돼요"를 보인다. */
const SLOW_MS = 10_000
const OFFLINE_HINT_MS = 1_500
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const SAVE_ERRORS: Record<MealStoreErrorCode, string> = {
  MEAL_SAVE_REJECTED: '저장이 거부됐어요. 음식 이름과 숫자를 확인하고 다시 시도해 주세요.',
  MEAL_STORE_UNAVAILABLE: '지금 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  MEAL_NOT_FOUND: '기록을 찾지 못했어요. 다시 시도하면 새 기록으로 저장해요.',
}

type Loaded = { mealId: string; dateKey: string; mealType: MealType; analysis: MealIntakeAnalysis; isNew: boolean }
type Phase =
  | { kind: 'loading' }
  | { kind: 'awaiting'; mealId: string }
  | { kind: 'load_error' }
  | { kind: 'ready'; initial: Loaded; initialJson: string }
type Draft = { analysis: MealIntakeAnalysis; mealType: MealType }
type SaveError = { code: MealStoreErrorCode; detail: string }

const isMealType = (v: unknown): v is MealType => MEAL_TYPES.some((m) => m.value === v)

/** 실제로 있는 날짜인지까지 본다(2026-02-30 같은 값은 버린다). */
function parseDateKey(v: unknown): string | null {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return null
  const d = new Date(`${v}T12:00:00+09:00`)
  return !Number.isNaN(d.getTime()) && toDateKey(d) === v ? v : null
}

/** S3에서 넘긴 state. 모양이 맞지 않으면 null(그때는 getMeal로 불러온다). */
function readEntryState(s: unknown): Omit<Loaded, 'mealId' | 'isNew'> | null {
  if (!s || typeof s !== 'object') return null
  const { analysis, dateKey, mealType } = s as Record<string, unknown>
  const a = analysis as MealIntakeAnalysis | undefined
  const dk = parseDateKey(dateKey)
  if (!a || typeof a !== 'object' || !Array.isArray(a.items) || !a.totals || !dk || !isMealType(mealType)) return null
  return { analysis: a, dateKey: dk, mealType }
}

function dateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00+09:00`)
  const s = new Intl.DateTimeFormat('ko-KR', { timeZone: APP_TIMEZONE, month: 'long', day: 'numeric', weekday: 'short' }).format(d)
  return dateKey === toDateKey(new Date()) ? `오늘 · ${s}` : s
}

/** 브라우저 뒤로 가기 막기. useBlocker는 데이터 라우터(createBrowserRouter)에서만 동작하므로 그때만 렌더링한다. */
function LeaveGuard({ shouldBlock }: { shouldBlock: () => boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && shouldBlock())
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(LEAVE_MSG)) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  return null
}

export default function ReviewPage() {
  const params = useParams()
  const routeId = params.mealId && params.mealId !== 'new' ? params.mealId : null
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading } = useAuthUser()
  const uid = user?.uid ?? null
  const dataRouter = useContext(UNSAFE_DataRouterContext)

  // 처음 들어올 때의 state·date만 쓴다(그 뒤 주소가 바뀌어도 편집 내용을 다시 덮지 않는다)
  const entryState = useRef<unknown>(location.state)
  const entryDate = useRef(searchParams.get('date'))
  const navRef = useRef(navigate)
  useEffect(() => {
    navRef.current = navigate
  }, [navigate])

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reloadSeq, setReloadSeq] = useState(0)
  const [saving, setSaving] = useState(false)
  // 편집기가 이름을 다시 계산하거나 "다시 계산할까요?"를 묻는 중이면 저장을 잠근다(바뀌기 전 값이 저장되지 않게)
  const [editorBusy, setEditorBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [saveError, setSaveError] = useState<SaveError | null>(null)

  const alive = useRef(true)
  const allowLeave = useRef(false)
  const dirtyRef = useRef(false)
  const pendingSave = useRef<{ mealId: string; dateKey: string; consumedKcal: number } | null>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!uid) {
      navRef.current('/login', { replace: true })
      return
    }
    let live = true
    const ready = (m: Loaded) => {
      setPhase({ kind: 'ready', initial: m, initialJson: JSON.stringify(m.analysis) })
      setDraft({ analysis: m.analysis, mealType: m.mealType })
    }
    const fromState = readEntryState(entryState.current)

    if (routeId === null) {
      // 직접 입력: 빈 분석, 날짜는 ?date(틀리면 오늘), 끼니는 지금 시각
      const now = new Date()
      ready({
        mealId: newMealId(uid),
        dateKey: fromState?.dateKey ?? parseDateKey(entryDate.current) ?? toDateKey(now),
        mealType: fromState?.mealType ?? guessMealType(now),
        analysis: fromState?.analysis ?? buildAnalysis([], []),
        isNew: true,
      })
      return
    }
    if (fromState) {
      ready({ mealId: routeId, ...fromState, isNew: false })
      return
    }
    // 앱을 다시 열었을 때: 저장된 문서로 이어서 한다
    setPhase({ kind: 'loading' })
    getMeal(uid, routeId).then(
      (m) => {
        if (!live) return
        if (m?.status === 'needs_review' && m.analysis) {
          ready({ mealId: routeId, dateKey: m.dateKey, mealType: m.mealType, analysis: m.analysis, isNew: false })
        } else if (m?.status === 'awaiting_after') {
          setPhase({ kind: 'awaiting', mealId: routeId })
        } else {
          navRef.current('/', { replace: true })
        }
      },
      (e: unknown) => {
        console.warn('[review] 불러오기 실패', e)
        if (live) setPhase({ kind: 'load_error' })
      },
    )
    return () => {
      live = false
    }
  }, [loading, uid, routeId, reloadSeq])

  const analysis = draft?.analysis ?? null
  const analysisJson = useMemo(() => (analysis ? JSON.stringify(analysis) : ''), [analysis])
  const check = useMemo(() => (analysis ? validateAnalysis(analysis) : null), [analysis])
  const dirty =
    phase.kind === 'ready' && draft !== null && (draft.mealType !== phase.initial.mealType || analysisJson !== phase.initialJson)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const shouldBlock = useCallback(() => dirtyRef.current && !allowLeave.current, [])
  useBeforeUnload(
    useCallback((e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allowLeave.current) e.preventDefault()
    }, []),
  )

  const onAnalysis = useCallback((a: MealIntakeAnalysis) => setDraft((d) => (d ? { ...d, analysis: a } : d)), [])

  function goHome(state?: { saved: { dateKey: string; consumedKcal: number } }) {
    allowLeave.current = true
    navigate('/', { replace: true, state })
  }

  function onBack() {
    if (dirty && !window.confirm(LEAVE_MSG)) return
    goHome()
  }

  const itemCount = analysis?.items.length ?? 0
  const canSave = !!uid && phase.kind === 'ready' && !!check?.ok && itemCount > 0 && !saving && !editorBusy

  async function onSave() {
    if (!canSave || !uid || phase.kind !== 'ready' || !draft) return
    const { mealId, dateKey } = phase.initial
    const { analysis: a, mealType } = draft
    const consumedKcal = a.totals.consumed.kcal
    pendingSave.current = { mealId, dateKey, consumedKcal }
    setSaving(true)
    setSaveError(null)
    setSlow(false)
    const timer = window.setTimeout(
      () => {
        if (alive.current) setSlow(true)
      },
      navigator.onLine === false ? OFFLINE_HINT_MS : SLOW_MS,
    )
    try {
      await saveMeal(uid, mealId, { dateKey, mealType, analysis: a })
      await beforePhotoStore.remove(mealId) // 먹은 후 분석이 실패했던 식사면 남아 있을 수 있다
      if (alive.current) goHome({ saved: { dateKey, consumedKcal } })
    } catch (e) {
      console.warn('[review] 저장 실패', e)
      if (!alive.current) return // 연결 대기 중 홈으로 나간 뒤 거부된 경우(화면에 알릴 곳이 없다)
      const code: MealStoreErrorCode = e instanceof MealStoreError ? e.code : 'MEAL_STORE_UNAVAILABLE'
      setSaveError({ code, detail: e instanceof Error ? e.message : String(e) })
      setSlow(false)
      setSaving(false)
    } finally {
      window.clearTimeout(timer)
    }
  }

  /** 오프라인: 쓰기는 기기에 남아 연결되면 자동으로 올라간다(persistentLocalCache). 기다리지 않고 홈으로. */
  function leaveWhilePending() {
    const p = pendingSave.current
    if (!p) return
    void beforePhotoStore.remove(p.mealId)
    goHome({ saved: { dateKey: p.dateKey, consumedKcal: p.consumedKcal } })
  }

  const title = phase.kind === 'ready' && phase.initial.isNew ? '직접 입력' : '결과 확인'

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-white text-gray-900">
      {dataRouter && <LeaveGuard shouldBlock={shouldBlock} />}
      <header className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-2">
        <button type="button" onClick={onBack} aria-label="홈으로" className="min-h-11 min-w-11 px-2 text-lg">
          ‹
        </button>
        <h1 className="text-base font-semibold">{title}</h1>
      </header>

      {(loading || phase.kind === 'loading') && (
        <main className="flex flex-1 items-center justify-center text-gray-500">불러오는 중…</main>
      )}

      {phase.kind === 'awaiting' && (
        <main className="flex flex-1 flex-col justify-center gap-3 px-4">
          <p className="text-center">먹은 후 사진을 아직 안 찍었어요.</p>
          <button
            type="button"
            onClick={() => navigate(`/meal/${phase.mealId}/after`, { replace: true })}
            className="min-h-12 rounded-xl bg-emerald-600 font-semibold text-white"
          >
            남은 음식 찍기
          </button>
          <button type="button" onClick={() => goHome()} className="min-h-11 text-gray-600">
            홈으로
          </button>
        </main>
      )}

      {phase.kind === 'load_error' && (
        <main className="flex flex-1 flex-col justify-center gap-3 px-4">
          <p className="text-center">기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          <button
            type="button"
            onClick={() => setReloadSeq((n) => n + 1)}
            className="min-h-12 rounded-xl bg-gray-900 font-semibold text-white"
          >
            다시 시도
          </button>
          <button type="button" onClick={() => goHome()} className="min-h-11 text-gray-600">
            홈으로
          </button>
        </main>
      )}

      {!loading && phase.kind === 'ready' && draft && (
        <>
          <main className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <section aria-label="날짜와 끼니" className="space-y-2">
              <p className="text-sm font-medium text-gray-600">{dateLabel(phase.initial.dateKey)}</p>
              <div className="grid grid-cols-4 gap-2">
                {MEAL_TYPES.map((m) => {
                  const on = draft.mealType === m.value
                  return (
                    <button
                      key={m.value}
                      type="button"
                      aria-pressed={on}
                      disabled={saving}
                      onClick={() => setDraft((d) => (d ? { ...d, mealType: m.value } : d))}
                      className={`min-h-11 rounded-full border text-sm font-medium ${
                        on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </section>

            {draft.analysis.warnings.length > 0 && (
              <section aria-label="확인할 점" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-900">확인해 주세요</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
                  {draft.analysis.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* 저장 중에는 편집을 잠근다(저장하는 값과 화면 값이 달라지지 않게) */}
            <fieldset disabled={saving} className="min-w-0">
              <ReviewEditor analysis={draft.analysis} onChange={onAnalysis} onBusyChange={setEditorBusy} />
            </fieldset>
          </main>

          <footer className="shrink-0 space-y-2 border-t border-gray-200 bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {slow && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-900">
                <span>연결이 느려요. 연결되면 자동으로 저장돼요.</span>
                <button type="button" onClick={leaveWhilePending} className="min-h-11 shrink-0 px-2 font-semibold">
                  홈으로
                </button>
              </div>
            )}
            {saveError && (
              <div role="alert" className="text-sm text-red-700">
                <p>{SAVE_ERRORS[saveError.code]}</p>
                {saveError.code === 'MEAL_SAVE_REJECTED' && <p className="text-xs text-red-500">{saveError.detail}</p>}
              </div>
            )}
            {!saving && editorBusy && <p className="text-sm text-gray-500">음식 정보를 다시 계산하는 중이에요. 끝나면 저장할 수 있어요.</p>}
            {!saving && itemCount === 0 && <p className="text-sm text-gray-500">음식을 하나 이상 넣어 주세요.</p>}
            {!saving && itemCount > 0 && check && !check.ok && (
              <p className="text-sm text-amber-700">저장 전에 고칠 값이 있어요: {check.errors[0]}</p>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="min-h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:bg-gray-300 disabled:text-gray-500"
            >
              {saving ? '저장 중…' : saveError ? '다시 시도' : '저장'}
            </button>
          </footer>
        </>
      )}
    </div>
  )
}
