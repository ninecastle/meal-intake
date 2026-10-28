// 목표 질문·추천 결과(디자인 조각 D11, 2026-10-28 사용자 결정). 시안 quiz()·result()·kcalEditor() 마크업·클래스 그대로.
// - /start?step=0~5: 성별 → 나이 → 키 → 몸무게 → 활동량 → 목표. 단계마다 push(state.depth+1)라 기기 뒤로 가기·[이전]은 이전 단계.
//   진행 막대(.progress/.pfill)는 숫자 없이 단계마다 초록으로 약 300ms 차오른다(움직임 줄이기면 바로). 목표 다음에 누구에게나 학교 등록 단계(D13, 선택, [건너뛰기]). 사진 보관 단계는 없다(동의 화면).
// - /start/result: 추천 목표(설정 목표 칼로리 시트와 같은 부품 useKcalEditor) + 아래 버튼.
//   시작 순서 바꿈(2026-10-28 사용자 결정): 로그인·동의한 목표 없는 계정만 온다(새 계정은 소개 → 구글 로그인 → 동의 → 여기).
//   [저장하고 시작하기] → 목표·학교 저장 → 들어온 곳(설정이면 설정 + "목표를 저장했어요", 홈이면 홈 맨 위, 새 계정은 홈 맨 위·알림 없음).
//   목표가 이미 있는 계정은 홈으로 보낸다(기존 목표 유지/바꾸기 시트는 없앰).
// - 입력 중 값은 새로고침해도 이어지게 기기 localStorage(lib/onboardingDraft)에 두고 목표를 저장하면 지운다. 계산·검사는 analysis/goal.ts(AI 호출 없음).
import type { User } from 'firebase/auth'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  ADULT_AGE,
  INPUT_RANGE,
  computeGoal,
  validateGoalInput,
  type Activity,
  type GoalInput,
  type GoalResult,
  type GoalType,
} from '../analysis/goal'
import { resetScroll } from '../components/ScrollMemory'
import { ACTIVITY_LABEL, GOAL_LABEL, MINOR_MSG, SEX_LABEL, useKcalEditor } from '../components/settings/GoalSheets'
import { useConsent } from '../components/terms/consentState'
import { IconButton, Mascot } from '../components/ui'
import { hasCurrentConsent } from '../data/consent'
import { GoalStoreError, saveGoal, subscribeGoal, type GoalStoreErrorCode, type StoredGoal } from '../data/goals'
import { setFlash } from '../lib/flash'
import SchoolSearch from '../components/school/SchoolSearch'
import { setSchool } from '../data/school'
import { clearOnboardingDraft, EMPTY_DRAFT, readOnboardingDraft, writeOnboardingDraft, type OnboardingDraft } from '../lib/onboardingDraft'

const STEPS = ['sex', 'age', 'height', 'weight', 'act', 'goal', 'school'] as const
type StepKey = (typeof STEPS)[number]

/** 들어온 곳(홈·설정에서 push로) + 그 뒤 쌓은 방문 기록 칸 수 */
// from: 들어온 화면(저장하면 그 화면으로 돌아간다). recommend = 음식 추천(D12) 남은 양 상자의 목표 안내
type NavState = { from?: 'home' | 'settings' | 'recommend'; backKey?: string; depth?: number }

const SLOW_MS = 10_000
const OFFLINE_HINT_MS = 1_500
const SAVE_ERRORS: Record<GoalStoreErrorCode, string> = {
  GOAL_INVALID: '저장할 수 없는 값이 있어요. 입력을 확인해 주세요.',
  GOAL_SAVE_REJECTED: '저장이 거부됐어요. 값을 확인하고 다시 시도해 주세요.',
  GOAL_STORE_UNAVAILABLE: '지금 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
}
const ERROR_STYLE = { fontSize: 14, color: 'var(--peach-deep)', margin: '10px 0 0' } as const
const NOTE = '목표 계산에만 쓰고 언제든 수정·삭제할 수 있어요'

const toNum = (s: string) => {
  const t = s.trim().replace(',', '.')
  return t === '' ? NaN : Number(t)
}
const digits = (s: string, max: number) => s.replace(/[^0-9]/g, '').slice(0, max)
const decimal = (s: string) => s.replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 5)

type NumKey = 'age' | 'height' | 'weight'
const RANGE_KEY = { age: 'age', height: 'height_cm', weight: 'weight_kg' } as const

/** 칸 아래 이유. 빈 칸은 아직 안 넣은 것이라 null(다음으로는 못 감) */
function fieldError(k: NumKey, raw: string): string | null {
  if (raw.trim() === '') return null
  const v = toNum(raw)
  const { min, max } = INPUT_RANGE[RANGE_KEY[k]]
  if (k === 'age') return Number.isInteger(v) && v >= min && v <= max ? null : `${min}~${max}세 정수로 넣어 주세요`
  const ok = Number.isFinite(v) && v >= min && v <= max
  return ok ? null : k === 'height' ? `${min}~${max}cm로 넣어 주세요` : `${min}~${max}kg으로 넣어 주세요`
}

const isMinor = (d: OnboardingDraft) => d.age.trim() !== '' && fieldError('age', d.age) === null && toNum(d.age) < ADULT_AGE

function stepDone(k: StepKey, d: OnboardingDraft): boolean {
  switch (k) {
    case 'sex':
      return d.sex !== null
    case 'age':
    case 'height':
    case 'weight':
      return d[k].trim() !== '' && fieldError(k, d[k]) === null
    case 'act':
      return d.activity !== null
    case 'goal':
      return d.goal !== null || isMinor(d)
    case 'school':
      return true
  }
}

/** 아직 안 끝낸 첫 단계(모두 끝났으면 STEPS.length) */
function firstOpen(d: OnboardingDraft): number {
  const i = STEPS.findIndex((k) => !stepDone(k, d))
  return i < 0 ? STEPS.length : i
}

function toInput(d: OnboardingDraft): GoalInput | null {
  const v = validateGoalInput({
    sex: d.sex,
    age: toNum(d.age),
    height_cm: toNum(d.height),
    weight_kg: Math.round(toNum(d.weight) * 10) / 10,
    activity: d.activity,
    goal: isMinor(d) ? 'maintain' : d.goal,
  })
  return v.ok ? v.value : null
}

function Loading() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">불러오는 중…</main>
}

export default function OnboardingPage({ user }: { user: User | null }) {
  const uid = user?.uid ?? null
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const consent = useConsent()
  const nav = (location.state as NavState | null) ?? {}
  const depth = typeof nav.depth === 'number' ? nav.depth : 0
  const isResult = location.pathname === '/start/result'
  const [draft, setDraft] = useState<OnboardingDraft>(() => readOnboardingDraft() ?? EMPTY_DRAFT)
  const [goal, setGoal] = useState<{ uid: string; g: StoredGoal | null } | undefined>(undefined)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!uid) return
    return subscribeGoal(
      uid,
      (g) => setGoal({ uid, g }),
      () => setGoal((p) => p ?? { uid, g: null }),
    )
  }, [uid])

  function update(patch: Partial<OnboardingDraft>) {
    // 입력이 바뀌면 결과 화면의 직접 조정은 버린다(추천값이 달라진다)
    // 학교만 바꾼 것은 추천값과 무관하니 직접 조정을 남긴다
    const onlySchool = Object.keys(patch).every((k) => k === 'school')
    const next = { ...draft, ...patch, override: onlySchool ? draft.override : null }
    setDraft(next)
    writeOnboardingDraft(next)
  }

  // ── 들어올 수 있는지 ──
  if (!uid) return <Navigate to="/welcome" replace />
  if (consent === undefined) return <Loading />
  if (!hasCurrentConsent(consent)) return <Navigate to="/welcome" replace />
  if (goal?.uid !== uid) return <Loading />
  // 목표가 이미 있는 계정은 목표 질문을 다시 하지 않는다(저장 중·직후 구독이 먼저 와도 결과 화면이 마무리하고 옮긴다)
  if (goal.g && !leaving) return <Navigate to="/" replace />

  const open = firstOpen(draft)
  const stepParam = Number(params.get('step') ?? '0')
  const step = Number.isInteger(stepParam) && stepParam >= 0 && stepParam < STEPS.length ? stepParam : 0
  if (isResult ? open < STEPS.length : step > open) return <Navigate to={`/start?step=${open}`} replace state={nav} />

  /** [이전]·‹: 이 화면에서 쌓은 칸이면 뒤로, 아니면(주소로 바로 열었음) 앞 단계로 바꾼다 */
  function prev(to: number) {
    if (depth > 0) void navigate(-1)
    else void navigate(`/start?step=${to}`, { replace: true, state: nav })
  }
  function next(to: string) {
    void navigate(to, { state: { ...nav, depth: depth + 1 } })
  }
  /** 저장 뒤: 설정·홈에서 왔으면 들어온 칸으로(홈은 맨 위), 그 밖은 홈 맨 위 */
  function leave(flash: 'goal:saved' | 'goal:pending') {
    setLeaving(true)
    clearOnboardingDraft()
    // 추천 화면은 토스트가 없어 플래시를 남기지 않는다(나중에 홈에서 뜨지 않게). 새 계정(들어온 곳 없음)도 홈에 알림 없이
    if (nav.from && nav.from !== 'recommend') setFlash(flash)
    if (nav.from) {
      if (nav.from === 'home' && nav.backKey) resetScroll(nav.backKey)
      void navigate(-(depth + 1))
    } else void navigate('/', { replace: true })
  }

  if (isResult) {
    const input = toInput(draft)
    if (!input) return <Navigate to="/start?step=0" replace state={nav} />
    return (
      <ResultView
        key={JSON.stringify(input)}
        uid={uid}
        draft={draft}
        input={input}
        result={computeGoal(input)}
        onDraft={(d) => {
          setDraft(d)
          writeOnboardingDraft(d)
        }}
        onBack={() => prev(STEPS.length - 1)}
        onSaving={setLeaving}
        onLeave={leave}
      />
    )
  }

  return (
    <QuizView
      step={step}
      draft={draft}
      onBack={step > 0 || depth > 0 || nav.from ? () => (step > 0 ? prev(step - 1) : void navigate(-1)) : null}
      onUpdate={update}
      onNext={() => next(step === STEPS.length - 1 ? '/start/result' : `/start?step=${step + 1}`)}
    />
  )
}

// ───────────────────────── 진행 막대 ─────────────────────────

/** 지난 단계에서 보인 채움(%) — 다음 단계에서 그 자리부터 차오른다(시안 state.progFrom) */
let lastPct = 0

function Progress({ i, n }: { i: number; n: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const pct = ((i + 1) / n) * 100
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.style.transition = 'none'
    el.style.width = `${reduce ? pct : lastPct}%`
    void el.offsetWidth
    el.style.transition = reduce ? 'none' : 'width .3s cubic-bezier(.3,.7,.2,1)'
    el.style.width = `${pct}%`
    lastPct = pct
  }, [pct])
  return (
    <div className="progress" role="progressbar" aria-label="목표 질문 진행" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1}>
      <div className="pfill" ref={ref}></div>
      <div className="pticks">
        {Array.from({ length: n - 1 }, (_, j) => (
          <i key={j} style={{ left: `${((j + 1) / n) * 100}%` }}></i>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────── 질문 ─────────────────────────

function QuizView({
  step,
  draft: d,
  onBack,
  onUpdate,
  onNext,
}: {
  step: number
  draft: OnboardingDraft
  onBack: (() => void) | null
  onUpdate: (p: Partial<OnboardingDraft>) => void
  onNext: () => void
}) {
  const k = STEPS[step]
  const last = step === STEPS.length - 1
  const done = stepDone(k, d)
  const minor = isMinor(d)

  const opt = (pressed: boolean, onClick: () => void, label: string, sub?: string, disabled?: boolean) => (
    <button
      key={label}
      type="button"
      className="opt"
      aria-pressed={pressed}
      disabled={disabled}
      style={disabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
      onClick={onClick}
    >
      <span>
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
  const num = (key: NumKey, unit: string, ph: string) => {
    const err = fieldError(key, d[key])
    return (
      <>
        <div className="field">
          <input
            type="text"
            inputMode={key === 'age' ? 'numeric' : 'decimal'}
            enterKeyHint="next"
            autoComplete="off"
            className="num"
            placeholder={ph}
            aria-label={unit}
            aria-invalid={!!err}
            value={d[key]}
            onChange={(e) => onUpdate({ [key]: key === 'age' ? digits(e.target.value, 3) : decimal(e.target.value) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && done) onNext()
            }}
          />
          <span>{unit}</span>
        </div>
        {err && (
          <p role="alert" style={ERROR_STYLE}>
            {err}
          </p>
        )}
      </>
    )
  }

  const B: Record<StepKey, [ReactNode, string, ReactNode]> = {
    sex: [
      '성별을 알려주세요',
      '하루에 필요한 칼로리를 계산할 때 써요',
      <div className="opts two">
        {(['female', 'male'] as const).map((s) => opt(d.sex === s, () => onUpdate({ sex: s }), SEX_LABEL[s]))}
      </div>,
    ],
    age: ['나이를 알려주세요', '만 나이로 적어 주세요', num('age', '세', '24')],
    height: [
      '키를 알려주세요',
      '',
      <>
        {num('height', 'cm', '165')}
        <div className="note">{NOTE}</div>
      </>,
    ],
    weight: [
      '몸무게를 알려주세요',
      '',
      <>
        {num('weight', 'kg', '58.0')}
        <div className="note">{NOTE}</div>
      </>,
    ],
    act: [
      '평소 얼마나 움직이나요?',
      '가장 가까운 것을 골라 주세요',
      <div className="opts">
        {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) =>
          opt(d.activity === a, () => onUpdate({ activity: a }), ACTIVITY_LABEL[a][0], ACTIVITY_LABEL[a][1]),
        )}
      </div>,
    ],
    goal: [
      '목표가 무엇인가요?',
      '',
      <>
        <div className="opts">
          {(['lose', 'maintain', 'gain'] as GoalType[]).map((g) =>
            opt((minor ? 'maintain' : d.goal) === g, () => onUpdate({ goal: g }), GOAL_LABEL[g], undefined, minor && g !== 'maintain'),
          )}
        </div>
        {minor && <div className="note">{MINOR_MSG}</div>}
      </>,
    ],
    // D13: 시안 quiz 'school' 단계(누구에게나, 부제는 2026-10-28 사용자 결정 문구)
    school: [
      '학교를 등록할까요?',
      '학생·선생님이라면 급식 메뉴로 더 쉽고 정확하게 기록할 수 있어요. 설정에서 언제든 바꾸거나 해제할 수 있어요 (선택)',
      <SchoolSearch
        initial={d.school?.name ?? ''}
        picked={d.school ?? null}
        fieldStyle={{ borderColor: 'var(--line)', marginTop: 0 }}
        onPick={(h) => onUpdate({ school: { atpt: h.atpt, code: h.code, name: h.name } })}
      />,
    ],
  }
  const [title, help, body] = B[k]

  return (
    <div className="screen">
      <div className="pad">
        <div className="topbar">
          <div style={{ display: 'flex', minWidth: 44 }}>
            {onBack && <IconButton icon="back" label={step > 0 ? '이전' : '뒤로'} onClick={onBack} />}
          </div>
          <div></div>
          <div style={{ width: 44 }}></div>
        </div>
        <Progress i={step} n={STEPS.length} />
        <div className="q">
          <h2>{title}</h2>
          <p className="help">{help}</p>
          {body}
        </div>
      </div>
      <div className="bottom">
        <div className="inner pad">
          {step > 0 && onBack && (
            <button type="button" className="btn ghost narrow" onClick={onBack}>
              이전
            </button>
          )}
          {k === 'school' && (
            <button
              type="button"
              className="btn ghost narrow"
              onClick={() => {
                onUpdate({ school: null })
                onNext()
              }}
            >
              건너뛰기
            </button>
          )}
          <button type="button" className="btn ink" disabled={!done} onClick={onNext}>
            {last ? '결과 보기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── 추천 결과 ─────────────────────────

function ResultView({
  uid,
  draft,
  input,
  result,
  onDraft,
  onBack,
  onSaving,
  onLeave,
}: {
  uid: string
  draft: OnboardingDraft
  input: GoalInput
  result: GoalResult
  onDraft: (d: OnboardingDraft) => void
  onBack: () => void
  /** 저장 중 표시(저장 직후 목표 구독이 먼저 와도 홈으로 튕기지 않고 이 화면이 초안을 지우고 옮긴다) */
  onSaving: (on: boolean) => void
  onLeave: (flash: 'goal:saved' | 'goal:pending') => void
}) {
  const ed = useKcalEditor(result, draft.override)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<GoalStoreErrorCode | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 직접 조정도 초안에 둔다(새로고침해도 그대로)
  const ovrJson = JSON.stringify(ed.override)
  useEffect(() => {
    // 저장하고 초안을 지운 뒤에는 다시 쓰지 않는다
    if (ovrJson !== JSON.stringify(draft.override) && readOnboardingDraft()) onDraft({ ...draft, override: ed.override })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ovrJson])

  async function save() {
    if (saving || ed.errors.length > 0) return
    setSaving(true)
    onSaving(true)
    setSaveError(null)
    // 시작 단계에서 고른 학교(D13): 목표와 함께 등록한다(기다리지 않음)
    if (draft.school) setSchool(uid, draft.school).catch((e: unknown) => console.warn('[onboarding] 학교 저장 실패', e))
    let timer = 0
    const slow = new Promise<'slow'>((r) => {
      timer = window.setTimeout(() => r('slow'), navigator.onLine === false ? OFFLINE_HINT_MS : SLOW_MS)
    })
    try {
      const r = await Promise.race([saveGoal(uid, input, ed.override).then(() => 'ok' as const), slow])
      if (alive.current) onLeave(r === 'ok' ? 'goal:saved' : 'goal:pending')
    } catch (e) {
      console.warn('[onboarding] 목표 저장 실패', e)
      if (!alive.current) return
      setSaveError(e instanceof GoalStoreError ? e.code : 'GOAL_STORE_UNAVAILABLE')
      setSaving(false)
      onSaving(false)
    } finally {
      window.clearTimeout(timer)
    }
  }

  return (
    <div className="screen">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="이전" onClick={onBack} />
        </div>
        <h1></h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad">
        <div className="q">
          <h2>
            이렇게 먹는 걸
            <br />
            추천해요
          </h2>
          <p className="help">입력한 정보로 계산했어요. 설정에서 언제든 바꿀 수 있어요</p>
        </div>
        <div className="rec-res">
          <div>
            <Mascot decorative />
          </div>
          <div style={{ color: 'var(--ink-2)' }}>하루 목표</div>
          {ed.node}
        </div>
        {saveError && (
          <p role="alert" style={{ ...ERROR_STYLE, textAlign: 'center' }}>
            {SAVE_ERRORS[saveError]}
          </p>
        )}
      </div>
      <div className="bottom">
        <div className="inner pad">
          <button type="button" className="btn gbtn" disabled={ed.errors.length > 0 || saving} onClick={() => void save()}>
            {saving ? '저장 중…' : '저장하고 시작하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
