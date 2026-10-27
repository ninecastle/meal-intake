// S4 결과 확인·수정 화면(/meal/:mealId/review, 직접 입력 /meal/new/review?date=YYYY-MM-DD). 스펙 2.2·2.3절.
// 화면 사이 계약: 들어올 때 state { analysis, dateKey, mealType }(없으면 getMeal), 저장 뒤 '/'에 state { saved: { dateKey, consumedKcal } }.
// 계산·합계·출처 문구는 ReviewEditor가 보여 준다(여기서 다시 만들지 않는다). AI 호출은 이 화면에서 하지 않는다.
// 수정 모드(mode="edit", S8 /meal/:mealId/edit, 3단계 조각 1-2): 저장한(done) 기록을 getMeal로 1회 읽어 같은 편집기로 연다.
// 끼니와 날짜(오늘과 지난 날짜만)도 바꿀 수 있다. 사진 재분석 없음. 저장 뒤·‹·브라우저 뒤로 가기는 끼니 화면(D3, 기록 상세 화면은 없앰)으로.
// 끼니 화면에서 state { fromMeal: true }로 들어왔으면 방문 기록 한 칸 뒤(그 끼니 화면)로 돌아가 두 번 쌓이지 않게 하고,
// 주소로 바로 열었으면 그 기록의 끼니 화면으로 replace한다. 저장했으면 끼니 화면이 "저장했어요" 토스트를 보인다(flash meal:saved).
// [기록 취소](D3, 사용자 확인 모양 4): 결과 확인(사진 분석 기록)에서만 내용 맨 끝 주황 글자 줄. 확인 뒤 기록·먹기 전 사진을 지우고 홈으로.
// 먹은 시간(D3): 결과 확인·직접 입력을 저장할 때 그 끼니 시각이 비어 있으면 저장 시각으로 채운다(사진 기록은 먹기 전 단계에서 이미 채움).
// 남긴 비율을 모르는(null) 음식이 하나라도 있으면 저장을 막는다(2026-10-27). S3이 state { retake: true }를 넘기면
// (먹은 후 사진이 달라 보임, 문서는 awaiting_after 그대로) [먹은 후 사진 다시 찍기]를 보인다. state는 새로고침해도 남는다.
import { Button, IconButton, TopBar } from '../components/ui'
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
import { koreanWarnings } from '../analysis/koreanText'
import { validateAnalysis } from '../analysis/validate'
import ReviewEditor from '../components/review/ReviewEditor'
import { deleteMeal, getMeal, MealStoreError, newMealId, saveMeal, type MealStoreErrorCode, type MealType } from '../data/meals'
import { fillMealTime } from '../data/mealTimes'
import { useAuthUser } from '../lib/auth'
import { APP_TIMEZONE, guessMealType, toDateKey } from '../lib/time'
import { setFlash } from '../lib/flash'
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
type Draft = { analysis: MealIntakeAnalysis; mealType: MealType; dateKey: string }
type Saved = { dateKey: string; consumedKcal: number }
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

/** 이 탭 방문 기록에서 지금 칸의 순서(react-router가 history.state.idx에 둔다). 주소로 바로 열었으면 0 */
function historyIdx(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : 0
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

export default function ReviewPage({ mode = 'review' }: { mode?: 'review' | 'edit' }) {
  const isEdit = mode === 'edit'
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
  const entryRetake = (entryState.current as { retake?: unknown } | null)?.retake === true
  const entryDate = useRef(searchParams.get('date'))
  // 홈 끼니 카드에서 [직접 입력]으로 오면 ?meal(디자인 조각 D2, 끼니는 누른 카드)
  const entryMeal = useRef(searchParams.get('meal'))
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
  const pendingSave = useRef<({ mealId: string } & Saved) | null>(null)

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
      setDraft({ analysis: m.analysis, mealType: m.mealType, dateKey: m.dateKey })
    }
    // 수정 모드는 넘겨받은 state를 쓰지 않고 항상 저장된 문서를 읽는다
    const fromState = isEdit ? null : readEntryState(entryState.current)

    if (routeId === null && isEdit) {
      navRef.current('/', { replace: true })
      return
    }
    if (routeId === null) {
      // 직접 입력: 빈 분석, 날짜는 ?date(틀리면 오늘), 끼니는 ?meal(카드로 들어온 경우) 아니면 지금 시각
      const now = new Date()
      ready({
        mealId: newMealId(uid),
        dateKey: fromState?.dateKey ?? parseDateKey(entryDate.current) ?? toDateKey(now),
        mealType: fromState?.mealType ?? (isMealType(entryMeal.current) ? entryMeal.current : guessMealType(now)),
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
        if (isEdit) {
          // 수정은 저장한(done) 기록만. 아니면 /meal/:id(끼니 화면으로 보내는 경로)가 이어 할 단계를 연다.
          if (m?.status === 'done' && m.analysis) {
            ready({ mealId: routeId, dateKey: m.dateKey, mealType: m.mealType, analysis: m.analysis, isNew: false })
          } else {
            navRef.current(`/meal/${routeId}`, { replace: true })
          }
        } else if (m?.status === 'needs_review' && m.analysis) {
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
  }, [loading, uid, routeId, reloadSeq, isEdit])

  const analysis = draft?.analysis ?? null
  const analysisJson = useMemo(() => (analysis ? JSON.stringify(analysis) : ''), [analysis])
  const check = useMemo(() => (analysis ? validateAnalysis(analysis) : null), [analysis])
  // Gemini 경고가 영어면 일반 안내로 바꾼다(예전에 저장·캐시된 분석도 여기서 걸러진다)
  const warnings = useMemo(() => (analysis ? koreanWarnings(analysis.warnings) : []), [analysis])
  const unpicked = analysis ? analysis.items.filter((it) => it.remaining_ratio === null).length : 0
  const dirty =
    phase.kind === 'ready' &&
    draft !== null &&
    (draft.mealType !== phase.initial.mealType || draft.dateKey !== phase.initial.dateKey || analysisJson !== phase.initialJson)
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

  /** 화면을 떠난다. 결과 확인·직접 입력은 홈(저장했으면 state.saved), 수정 모드는 끼니 화면(저장했으면 "저장했어요" 토스트). */
  function leave(saved?: Saved) {
    allowLeave.current = true
    if (isEdit && routeId) {
      if (saved) setFlash('meal:saved')
      if ((entryState.current as { fromMeal?: unknown } | null)?.fromMeal === true) navigate(-1)
      else if (phase.kind === 'ready') {
        const { dateKey, mealType } = phase.initial
        navigate(`/day/${dateKey}/${mealType}`, { replace: true })
      } else navigate(`/meal/${routeId}`, { replace: true })
    } else if (!saved && historyIdx() > 0) {
      // 저장하지 않고 나가기(‹)는 뒤로 가기: 이 화면은 끼니 화면 칸을 바꿔 들어오므로 한 칸 뒤가 그 앞 화면(보통 홈)이고,
      // 그 화면은 내렸던 위치 그대로 돌아온다(ScrollMemory, 2026-10-27 사용자가 고른 변경)
      navigate(-1)
    } else navigate('/', { replace: true, state: saved ? { saved } : undefined })
  }

  function onBack() {
    if (dirty && !window.confirm(LEAVE_MSG)) return
    leave()
  }

  const today = toDateKey(new Date())
  const itemCount = analysis?.items.length ?? 0
  const dateOk = !!draft && draft.dateKey <= today
  const canSave =
    !!uid && phase.kind === 'ready' && !!check?.ok && itemCount > 0 && unpicked === 0 && dateOk && !saving && !editorBusy
  // 결과 확인에서 S3이 다시 찍기를 허락한 경우만(수정 모드·직접 입력·다시 불러온 needs_review는 아님)
  const canRetake = !isEdit && entryRetake && routeId !== null && phase.kind === 'ready' && !phase.initial.isNew && unpicked > 0

  // 결과 확인(사진 분석 기록)에서만. 직접 입력(새 기록)은 저장 전이라 나가면 그만이고, 수정 모드는 끼니 화면 X로 지운다.
  const canCancel = !isEdit && routeId !== null && phase.kind === 'ready' && !phase.initial.isNew

  function onCancelMeal() {
    if (!uid || !routeId || saving || !window.confirm('이 기록을 취소할까요? 먹기 전 분석 결과도 지워져요.')) return
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다).
    deleteMeal(uid, routeId).catch((e: unknown) => console.warn('[review] 기록 취소 실패', e))
    beforePhotoStore.remove(routeId).catch(() => {})
    leave()
  }

  function onRetake() {
    if (!routeId || saving) return
    if (dirty && !window.confirm(LEAVE_MSG)) return
    allowLeave.current = true
    navigate(`/meal/${routeId}/after`, { replace: true })
  }

  async function onSave() {
    if (!canSave || !uid || phase.kind !== 'ready' || !draft) return
    const { mealId } = phase.initial
    const { analysis: a, mealType, dateKey } = draft
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
      const savedAt = new Date()
      await saveMeal(uid, mealId, { dateKey, mealType, analysis: a })
      if (!isEdit) {
        void fillMealTime(uid, dateKey, mealType, savedAt)
        await beforePhotoStore.remove(mealId) // 먹은 후 분석이 실패했던 식사면 남아 있을 수 있다
      }
      if (alive.current) leave({ dateKey, consumedKcal })
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
    if (!isEdit) void beforePhotoStore.remove(p.mealId)
    leave({ dateKey: p.dateKey, consumedKcal: p.consumedKcal })
  }

  const title = isEdit ? '기록 수정' : phase.kind === 'ready' && phase.initial.isNew ? '직접 입력' : '결과 확인'
  const exitLabel = isEdit ? '기록으로' : '홈으로'

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col bg-surface text-ink">
      {dataRouter && <LeaveGuard shouldBlock={shouldBlock} />}
      <TopBar
        className="shrink-0 border-b border-line bg-surface"
        left={<IconButton icon="back" label={exitLabel} onClick={onBack} />}
        title={title}
      />

      {(loading || phase.kind === 'loading') && (
        <main className="flex flex-1 items-center justify-center text-ink-2">불러오는 중…</main>
      )}

      {phase.kind === 'awaiting' && (
        <main className="flex flex-1 flex-col justify-center gap-3 px-4">
          <p className="text-center">먹은 후 사진을 아직 안 찍었어요.</p>
          <Button
            full
            type="button"
            onClick={() => navigate(`/meal/${phase.mealId}/after`, { replace: true })}
          >
            남은 음식 찍기
          </Button>
          <button type="button" onClick={() => leave()} className="focus-ring min-h-11 text-ink-2">
            홈으로
          </button>
        </main>
      )}

      {phase.kind === 'load_error' && (
        <main className="flex flex-1 flex-col justify-center gap-3 px-4">
          <p className="text-center">기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
          <Button
            variant="ink"
            full
            type="button"
            onClick={() => setReloadSeq((n) => n + 1)}
          >
            다시 시도
          </Button>
          <button type="button" onClick={() => leave()} className="focus-ring min-h-11 text-ink-2">
            {exitLabel}
          </button>
        </main>
      )}

      {!loading && phase.kind === 'ready' && draft && (
        <>
          <main className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <section aria-label="날짜와 끼니" className="space-y-2">
              {/* 날짜는 새 기록(사진 결과·직접 입력)과 수정 모두 바꿀 수 있다(앨범 사진의 찍은 시각으로 미리 채워진 날짜도 고치게).
                  오늘과 지난 날짜만(max=오늘, 직접 타이핑한 미래 날짜도 받지 않는다) */}
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-2">{dateLabel(draft.dateKey)}</span>
                <input
                  type="date"
                  required
                  value={draft.dateKey}
                  max={today}
                  disabled={saving}
                  onChange={(e) => {
                    const v = parseDateKey(e.target.value)
                    if (v && v <= today) setDraft((d) => (d ? { ...d, dateKey: v } : d))
                  }}
                  className="min-h-11 rounded-tile border border-line bg-surface px-3 text-base"
                />
              </label>
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
                      className={`focus-ring min-h-11 rounded-full border text-sm font-medium ${
                        on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'
                      }`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </section>

            {warnings.length > 0 && (
              <section aria-label="확인할 점" className="rounded-tile border border-butter bg-butter-soft p-3 text-sm">
                <p className="font-semibold text-ink">확인해 주세요</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* 저장 중에는 편집을 잠근다(저장하는 값과 화면 값이 달라지지 않게) */}
            <fieldset disabled={saving} className="min-w-0">
              <ReviewEditor analysis={draft.analysis} onChange={onAnalysis} onBusyChange={setEditorBusy} mode={mode} />
            </fieldset>

            {canCancel && (
              <div style={{ marginTop: 24 }}>
                <button type="button" className="srow danger" style={{ borderTop: '1px solid var(--line)' }} onClick={onCancelMeal} disabled={saving}>
                  <span>기록 취소</span>
                  <small>›</small>
                </button>
              </div>
            )}
          </main>

          <footer className="shrink-0 space-y-2 border-t border-line bg-surface px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {slow && (
              <div className="flex items-center justify-between gap-2 rounded-tile bg-sky-soft p-2 text-sm text-ink">
                <span>연결이 느려요. 연결되면 자동으로 저장돼요.</span>
                <button type="button" onClick={leaveWhilePending} className="focus-ring min-h-11 shrink-0 px-2 font-semibold">
                  {exitLabel}
                </button>
              </div>
            )}
            {saveError && (
              <div role="alert" className="text-sm text-peach-deep">
                <p>{SAVE_ERRORS[saveError.code]}</p>
                {saveError.code === 'MEAL_SAVE_REJECTED' && <p className="text-xs text-peach-deep">{saveError.detail}</p>}
              </div>
            )}
            {!saving && editorBusy && <p className="text-sm text-ink-2">음식 정보를 다시 계산하는 중이에요. 끝나면 저장할 수 있어요.</p>}
            {!saving && itemCount === 0 && (
              <p className="text-sm text-ink-2">
                {isEdit ? '음식을 모두 지우려면 끼니 화면에서 X를 눌러 주세요.' : '음식을 하나 이상 넣어 주세요.'}
              </p>
            )}
            {!saving && unpicked > 0 && (
              <p className="rounded-tile border border-butter bg-butter-soft px-3 py-2 text-sm text-ink">
                남긴 양을 고르지 않은 음식이 {unpicked}개 있어요. 카드에서 남긴 양을 고르면 저장할 수 있어요.
              </p>
            )}
            {canRetake && (
              <Button
                variant="ghost"
                full
                type="button"
                onClick={onRetake}
                disabled={saving}
              >
                먹은 후 사진 다시 찍기
              </Button>
            )}
            {!saving && itemCount > 0 && unpicked === 0 && check && !check.ok && (
              <p className="rounded-tile border border-butter bg-butter-soft px-3 py-2 text-sm text-ink">저장 전에 고칠 값이 있어요: {check.errors[0]}</p>
            )}
            <Button
              full
              type="button"
              onClick={onSave}
              disabled={!canSave}
            >
              {saving ? '저장 중…' : saveError ? '다시 시도' : isEdit ? '수정 저장' : '저장'}
            </Button>
          </footer>
        </>
      )}
    </div>
  )
}
