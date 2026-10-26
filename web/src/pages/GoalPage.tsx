// S6 목표 설정(3단계 조각 2, 스펙 4.7절). AI 호출 없음.
// 입력(성별·나이·키·몸무게·활동량·목표)을 바꾸면 저장 전에도 validateGoalInput → computeGoal → applyOverride로 바로 다시 계산한다.
// 숫자 칸은 입력 중 문자열을 그대로 들고 있다가 계산할 때만 파싱한다. 직접 조정(목표 kcal·탄·단·지)도 문자열로 든다
// (키가 있으면 직접 조정, 없으면 추천값을 보인다).
// 처음 열 때 subscribeGoal의 첫 값으로만 폼을 채운다(그 뒤 스냅샷은 편집 중인 폼을 덮지 않는다).
// 방문 기록: 홈에서 push(state.fromHome)로 들어왔으면 저장·‹ 모두 navigate(-1)로 한 칸 돌아가고(같은 화면이 두 번 쌓이지 않게),
// 주소로 바로 열었으면 홈으로 replace. 저장 안내는 lib/flash로 넘긴다(키 'goal:saved'·'goal:pending'은 HomePage와 같다).
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  ADULT_AGE,
  INPUT_RANGE,
  applyOverride,
  computeGoal,
  targetKcalFloor,
  validateGoalInput,
  type Activity,
  type GoalOverride,
  type GoalType,
  type Sex,
} from '../analysis/goal'
import { formatKcal } from '../components/mealText'
import { GoalStoreError, saveGoal, subscribeGoal, type GoalStoreErrorCode, type StoredGoal } from '../data/goals'
import { setFlash } from '../lib/flash'

/** 오프라인이면 쓰기 Promise가 서버 확인까지 끝나지 않는다(ReviewPage와 같은 값). */
const SLOW_MS = 10_000
const OFFLINE_HINT_MS = 1_500

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
]
const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: 'sedentary', label: '거의 안 움직임' },
  { value: 'light', label: '주 1~3회 가벼운 운동' },
  { value: 'moderate', label: '주 3~5회 운동' },
  { value: 'active', label: '주 6~7회 운동' },
  { value: 'very_active', label: '매일 고강도 운동·육체노동' },
]
const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lose', label: '감량' },
  { value: 'maintain', label: '유지' },
  { value: 'gain', label: '증량' },
]

type OverrideKey = keyof GoalOverride
const TARGET_FIELDS: { k: OverrideKey; label: string; unit: string }[] = [
  { k: 'target_kcal', label: '목표 칼로리', unit: 'kcal' },
  { k: 'carbs_g', label: '탄수화물', unit: 'g' },
  { k: 'protein_g', label: '단백질', unit: 'g' },
  { k: 'fat_g', label: '지방', unit: 'g' },
]
const OVERRIDE_KEYS = TARGET_FIELDS.map((f) => f.k)

const MINOR_MSG = '성장기에는 감량·증량보다 고르게 잘 먹는 것이 중요해요. 목표는 유지 기준으로 보여 드려요.'
const CLAMPED_MSG = '목표 칼로리가 기초대사량보다 낮아지지 않게 맞췄어요.'
const DISCLAIMER =
  '이 목표는 일반 공식(Mifflin-St Jeor)으로 계산한 참고값이며 의학적 조언이 아니에요. 질환이 있거나 임신·수유 중이면 전문가와 상의하세요.'

const SAVE_ERRORS: Record<GoalStoreErrorCode, string> = {
  GOAL_INVALID: '저장할 수 없는 값이 있어요. 입력을 확인해 주세요.',
  GOAL_SAVE_REJECTED: '저장이 거부됐어요. 값을 확인하고 다시 시도해 주세요.',
  GOAL_STORE_UNAVAILABLE: '지금 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
}

interface Form {
  sex: Sex | null
  age: string
  height: string
  weight: string
  activity: Activity
  goal: GoalType
}
type OverrideText = Partial<Record<OverrideKey, string>>

const EMPTY_FORM: Form = { sex: null, age: '', height: '', weight: '', activity: 'light', goal: 'maintain' }

/** 빈 칸은 NaN(검사에서 걸린다). 소수점 쉼표(일부 키패드)는 점으로. */
function toNum(s: string): number {
  const t = s.trim().replace(',', '.')
  return t === '' ? NaN : Number(t)
}

type NumField = keyof typeof INPUT_RANGE
/** 칸 아래에 보일 이유. 빈 칸은 아직 안 넣은 것이라 이유를 보이지 않는다. 범위는 goal.ts의 INPUT_RANGE. */
function fieldError(f: NumField, raw: string): string | null {
  if (raw.trim() === '') return null
  const v = toNum(raw)
  const { min, max } = INPUT_RANGE[f]
  if (f === 'age') return Number.isInteger(v) && v >= min && v <= max ? null : `${min}~${max}세 정수로 넣어 주세요`
  const ok = Number.isFinite(v) && v >= min && v <= max
  return ok ? null : f === 'height_cm' ? `${min}~${max}cm로 넣어 주세요` : `${min}~${max}kg으로 넣어 주세요`
}

function fromStored(g: StoredGoal): { form: Form; ovr: OverrideText } {
  const { input, override } = g
  const ovr: OverrideText = {}
  for (const k of OVERRIDE_KEYS) {
    const v = override?.[k]
    if (v !== undefined && v !== null) ovr[k] = String(v)
  }
  return {
    form: {
      sex: input.sex,
      age: String(input.age),
      height: String(input.height_cm),
      weight: String(input.weight_kg),
      activity: input.activity,
      goal: input.goal,
    },
    ovr,
  }
}

function toOverride(ovr: OverrideText): GoalOverride | null {
  const o: GoalOverride = {}
  for (const k of OVERRIDE_KEYS) {
    const s = ovr[k]
    if (s !== undefined) o[k] = toNum(s)
  }
  return Object.keys(o).length > 0 ? o : null
}

const seg = (on: boolean) =>
  `min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium disabled:opacity-40 ${
    on ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-white text-gray-700'
  }`
const numInput = (bad: boolean) =>
  `min-h-11 w-24 rounded-lg border px-3 text-right text-base ${bad ? 'border-red-400' : 'border-gray-300'}`

export default function GoalPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [fromHome] = useState(() => (location.state as { fromHome?: unknown } | null)?.fromHome === true)
  /** null = 첫 값을 기다리는 중 */
  const [form, setForm] = useState<Form | null>(null)
  const [ovr, setOvr] = useState<OverrideText>({})
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slow, setSlow] = useState(false)
  const [saveError, setSaveError] = useState<{ code: GoalStoreErrorCode; detail: string } | null>(null)
  const filled = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(
    () =>
      subscribeGoal(
        uid,
        (g) => {
          if (filled.current) return
          filled.current = true
          if (g) {
            const s = fromStored(g)
            setForm(s.form)
            setOvr(s.ovr)
          } else setForm(EMPTY_FORM)
        },
        () => {
          setLoadError(true)
          if (!filled.current) {
            filled.current = true
            setForm(EMPTY_FORM)
          }
        },
      ),
    [uid],
  )

  const f = form ?? EMPTY_FORM
  const ageErr = fieldError('age', f.age)
  const heightErr = fieldError('height_cm', f.height)
  const weightErr = fieldError('weight_kg', f.weight)
  // 나이만 맞게 넣어도 감량·증량을 막는다(다른 칸이 비어 있어도)
  const minor = f.age.trim() !== '' && !ageErr && toNum(f.age) < ADULT_AGE
  const parsed = validateGoalInput({
    sex: f.sex,
    age: toNum(f.age),
    height_cm: toNum(f.height),
    weight_kg: toNum(f.weight),
    activity: f.activity,
    goal: f.goal,
  })
  const result = parsed.ok ? computeGoal(parsed.value) : null
  const override = toOverride(ovr)
  const applied = result ? applyOverride(result, override) : null
  const hasOverride = override !== null
  const canSave = parsed.ok && !!applied && applied.errors.length === 0 && !saving

  function update<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((p) => ({ ...(p ?? EMPTY_FORM), [k]: v }))
    setSaveError(null)
  }
  function updateOverride(k: OverrideKey, v: string) {
    setOvr((p) => ({ ...p, [k]: v }))
    setSaveError(null)
  }

  function leave(flash?: 'goal:saved' | 'goal:pending') {
    if (flash) setFlash(flash)
    if (fromHome) navigate(-1)
    else navigate('/', { replace: true })
  }

  async function onSave() {
    if (!canSave || !parsed.ok) return
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
      await saveGoal(uid, parsed.value, override)
      if (alive.current) leave('goal:saved')
    } catch (e) {
      console.warn('[goal] 저장 실패', e)
      if (!alive.current) return
      const code: GoalStoreErrorCode = e instanceof GoalStoreError ? e.code : 'GOAL_STORE_UNAVAILABLE'
      setSaveError({ code, detail: e instanceof Error ? e.message : String(e) })
      setSlow(false)
      setSaving(false)
    } finally {
      window.clearTimeout(timer)
    }
  }

  const numFields: { key: 'age' | 'height' | 'weight'; label: string; unit: string; mode: 'numeric' | 'decimal'; err: string | null }[] = [
    { key: 'age', label: '나이(만)', unit: '세', mode: 'numeric', err: ageErr },
    { key: 'height', label: '키', unit: 'cm', mode: 'decimal', err: heightErr },
    { key: 'weight', label: '몸무게', unit: 'kg', mode: 'decimal', err: weightErr },
  ]

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-white text-gray-900">
      <header className="flex shrink-0 items-center gap-1 border-b border-gray-200 px-2">
        <button type="button" onClick={() => leave()} aria-label="홈으로" className="min-h-11 min-w-11 px-2 text-lg">
          ‹
        </button>
        <h1 className="text-base font-semibold">목표 설정</h1>
      </header>

      {form === null ? (
        <main className="flex flex-1 items-center justify-center text-gray-500">불러오는 중…</main>
      ) : (
        <>
          <main className="flex-1 space-y-5 overflow-y-auto px-4 py-3">
            {loadError && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                저장된 목표를 불러오지 못했어요. 새로 넣어도 돼요.
              </p>
            )}
            <fieldset disabled={saving} className="min-w-0 space-y-5">
              <section aria-label="내 정보" className="space-y-3">
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">성별</p>
                  <div className="flex gap-2">
                    {SEXES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={f.sex === s.value}
                        onClick={() => update('sex', s.value)}
                        className={seg(f.sex === s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {numFields.map(({ key, label, unit, mode, err }) => (
                  <div key={key}>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      <span className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode={mode}
                          autoComplete="off"
                          value={f[key]}
                          onChange={(e) => update(key, e.target.value)}
                          aria-invalid={!!err}
                          aria-describedby={err ? `goal-${key}-err` : undefined}
                          className={numInput(!!err)}
                        />
                        <span className="w-8 text-sm text-gray-600">{unit}</span>
                      </span>
                    </label>
                    {err && (
                      <p id={`goal-${key}-err`} className="mt-1 text-right text-sm text-red-600">
                        {err}
                      </p>
                    )}
                  </div>
                ))}

                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">활동량</p>
                  <div className="flex flex-col gap-2">
                    {ACTIVITIES.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        aria-pressed={f.activity === a.value}
                        onClick={() => update('activity', a.value)}
                        className={`${seg(f.activity === a.value)} text-left`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">목표</p>
                  <div className="flex gap-2">
                    {GOALS.map((g) => {
                      const on = (minor ? 'maintain' : f.goal) === g.value
                      return (
                        <button
                          key={g.value}
                          type="button"
                          aria-pressed={on}
                          disabled={minor && g.value !== 'maintain'}
                          onClick={() => update('goal', g.value)}
                          className={seg(on)}
                        >
                          {g.label}
                        </button>
                      )
                    })}
                  </div>
                  {minor && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{MINOR_MSG}</p>}
                </div>
              </section>

              <section aria-label="추천 목표" aria-live="polite" className="rounded-xl border border-gray-200 p-4">
                {!result || !applied ? (
                  <p className="text-sm text-gray-600">성별·나이·키·몸무게를 넣으면 바로 계산해 드려요.</p>
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-gray-50 py-2">
                        <dt className="text-xs text-gray-500">기초대사량</dt>
                        <dd className="font-semibold">{formatKcal(result.bmr)}kcal</dd>
                      </div>
                      <div className="rounded-lg bg-gray-50 py-2">
                        <dt className="text-xs text-gray-500">하루 소모량</dt>
                        <dd className="font-semibold">{formatKcal(result.tdee)}kcal</dd>
                      </div>
                    </dl>
                    {result.clamped && (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{CLAMPED_MSG}</p>
                    )}

                    <div className="mt-3 flex items-center justify-between">
                      <h2 className="font-semibold">하루 목표</h2>
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={() => setOvr({})}
                          className="min-h-11 rounded-lg px-2 text-sm font-medium text-emerald-700 underline"
                        >
                          추천값으로
                        </button>
                      )}
                    </div>
                    <ul className="mt-1 space-y-2">
                      {TARGET_FIELDS.map(({ k, label, unit }) => {
                        const custom = ovr[k] !== undefined
                        const rec = k === 'target_kcal' ? result.target_kcal : result.macros[k]
                        return (
                          <li key={k}>
                            <label className="flex items-center justify-between gap-3">
                              <span className="min-w-0 text-sm">
                                <span className="font-medium text-gray-700">{label}</span>
                                {custom && (
                                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                    직접 조정
                                  </span>
                                )}
                                {custom && (
                                  <span className="block text-xs text-gray-500">
                                    추천 {formatKcal(rec)}
                                    {unit}
                                  </span>
                                )}
                                {k === 'target_kcal' && (
                                  <span className="block text-xs text-gray-500">
                                    최소 {formatKcal(targetKcalFloor(result))}kcal({result.minor ? '하루 소모량' : '기초대사량'})
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  value={ovr[k] ?? String(applied.targets[k])}
                                  onChange={(e) => updateOverride(k, e.target.value)}
                                  className={numInput(false)}
                                />
                                <span className="w-8 text-sm text-gray-600">{unit}</span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                    {applied.errors.length > 0 && (
                      <div role="alert" className="mt-2 space-y-1 text-sm text-red-600">
                        {applied.errors.map((e) => (
                          <p key={e}>{e}</p>
                        ))}
                      </div>
                    )}
                    {ovr.target_kcal !== undefined &&
                      ovr.carbs_g === undefined &&
                      ovr.protein_g === undefined &&
                      ovr.fat_g === undefined && (
                      <p className="mt-2 text-xs text-gray-500">탄·단·지는 목표 칼로리를 55:20:25로 나눠요.</p>
                    )}
                  </>
                )}
              </section>
            </fieldset>

            <p className="text-xs leading-relaxed text-gray-500">{DISCLAIMER}</p>
          </main>

          <footer className="shrink-0 space-y-2 border-t border-gray-200 bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {slow && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-900">
                <span>연결이 느려요. 연결되면 자동으로 저장돼요.</span>
                <button
                  type="button"
                  onClick={() => leave('goal:pending')}
                  className="min-h-11 shrink-0 px-2 font-semibold"
                >
                  홈으로
                </button>
              </div>
            )}
            {saveError && (
              <div role="alert" className="text-sm text-red-700">
                <p>{SAVE_ERRORS[saveError.code]}</p>
                {saveError.code === 'GOAL_INVALID' && <p className="text-xs text-red-500">{saveError.detail}</p>}
              </div>
            )}
            <button
              type="button"
              onClick={() => void onSave()}
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
