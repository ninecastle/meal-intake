// 설정 "내 목표" 아래 시트들(디자인 조각 D8, 2026-10-28 사용자 확인, _workspace/design/mock/d8_2~6).
// - 목표 칼로리·탄단지: 시안 sheets.kcal + kcalEditor 그대로(.kedit·.krow·.kstep·.kval·.kmeta·.kcust·.kinfo·.macro3·.kwhy).
//   사용자가 고른 변경: 탄·단·지 g도 눌러 직접 바꾸고 그때 칼로리는 세 값의 합(lib/goalEdit). 시안처럼 X도 [저장]과 같다(바꾼 값이 맞으면 저장).
//   "의학적 조언이 아니에요"는 처음 동의 화면·설정 약관으로 옮겨 시트에는 두지 않는다(D10, 반복 안내 줄이기).
// - 목표: 시안 sheets.goaltype 그대로(고르면 바로 저장). 활동량: 같은 모양에 시안 온보딩 질문의 활동량 .opt 5개.
// - 키·몸무게, 성별·나이: 시안 온보딩 질문 부품(.field 큰 숫자 칸, .opts.two)에 [저장], 하루 목표 전 → 후 미리보기(체중 다시 계산 안내와 같은 .callout).
// 신체 정보·목표를 바꾸면 추천값으로 다시 계산한다(직접 정한 값이 있으면 "추천값으로 바뀌어요" 안내). 저장은 부르는 화면(SettingsPage)이 한다.
import { useState, type ReactNode } from 'react'
import {
  computeGoal,
  validateGoalInput,
  type Activity,
  type GoalInput,
  type GoalOverride,
  type GoalType,
  type Sex,
} from '../../analysis/goal'
import type { StoredGoal } from '../../data/goals'
import {
  KCAL_PER_G,
  MACRO_KEYS,
  kcalOfMacros,
  kcalOverride,
  macroOverride,
  macroShares,
  previewTargets,
  stepKcal,
  type MacroKey,
  type Macros,
} from '../../lib/goalEdit'
import { formatKg } from '../../lib/weight'
import { formatKcal } from '../mealText'
import { BottomSheet } from '../ui'

export const GOAL_LABEL: Record<GoalType, string> = { lose: '체중 감량', maintain: '체중 유지', gain: '체중 증량' }
export const SEX_LABEL: Record<Sex, string> = { female: '여성', male: '남성' }
/** 시안 온보딩 질문 활동량(이름, 설명) */
export const ACTIVITY_LABEL: Record<Activity, [string, string]> = {
  sedentary: ['거의 안 움직여요', '주로 앉아서 지내요'],
  light: ['가볍게 움직여요', '주 1~3회 가벼운 운동'],
  moderate: ['보통이에요', '주 3~5회 운동'],
  active: ['활발해요', '주 6~7회 운동'],
  very_active: ['매우 활발해요', '운동선수 수준'],
}
/** 시안 kcalEditor why(유지 문구의 "나눠어요"는 맞춤법만 고침) */
const WHY: Record<GoalType, string> = {
  lose: '감량 목표라 근육을 지키도록 단백질 비율을 높였어요',
  maintain: '유지 목표라 탄·단·지를 고르게 나눴어요',
  gain: '증량 목표라 탄수화물을 넉넉하게 잡았어요',
}
const MINOR_MSG = '성장기에는 감량·증량보다 고르게 잘 먹는 것이 중요해요. 목표는 유지 기준으로 보여 드려요.'
const RECALC_HELP = '바꾸면 하루 추천 칼로리와 탄·단·지도 다시 계산해요'
const CUSTOM_NOTE = '직접 정한 목표 칼로리·탄단지는 추천값으로 바뀌어요'

const SUB_STYLE = { color: 'var(--ink-2)', margin: '6px 0 0' } as const
const ERROR_STYLE = { fontSize: 14, color: 'var(--peach-deep)', margin: '10px 0 0' } as const

/** 숫자만(쉼표 소수점은 점으로) */
const digits = (s: string, max: number) => s.replace(/[^0-9]/g, '').slice(0, max)
const decimal = (s: string) => s.replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 5)
const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s))

// ───────────────────────── 목표 칼로리·탄단지 ─────────────────────────

type Mode = 'init' | 'rec' | 'kcal' | 'macro'

export function KcalSheet({ open, goal, onSave, onClose }: { open: boolean; goal: StoredGoal; onSave: (o: GoalOverride | null) => void; onClose: () => void }) {
  return open ? <KcalForm goal={goal} onSave={onSave} onClose={onClose} /> : null
}

function KcalForm({ goal, onSave, onClose }: { goal: StoredGoal; onSave: (o: GoalOverride | null) => void; onClose: () => void }) {
  const result = goal.result
  const [mode, setMode] = useState<Mode>('init')
  const [kcalText, setKcalText] = useState('')
  const [macroText, setMacroText] = useState<Record<MacroKey, string>>({ carbs_g: '', protein_g: '', fat_g: '' })

  const macroNums: Macros = { carbs_g: toNum(macroText.carbs_g), protein_g: toNum(macroText.protein_g), fat_g: toNum(macroText.fat_g) }
  const override =
    mode === 'init' ? goal.override : mode === 'rec' ? null : mode === 'kcal' ? kcalOverride(result, toNum(kcalText)) : macroOverride(result, macroNums)
  const { targets, errors, custom } = previewTargets(result, override)
  const sum = kcalOfMacros(macroNums)
  const kcalShown = mode === 'kcal' ? kcalText : mode === 'macro' ? (Number.isFinite(sum) ? String(sum) : '') : String(targets.target_kcal)
  const macrosShown: Record<MacroKey, string> =
    mode === 'macro' ? macroText : { carbs_g: String(targets.carbs_g), protein_g: String(targets.protein_g), fat_g: String(targets.fat_g) }
  const shares = macroShares({
    carbs_g: toNum(macrosShown.carbs_g) || 0,
    protein_g: toNum(macrosShown.protein_g) || 0,
    fat_g: toNum(macrosShown.fat_g) || 0,
  })
  const changed = mode !== 'init'

  /** 시안: X와 [저장] 모두 저장하고 닫는다. 바꾼 값이 틀리면 저장하지 않고 닫는다 */
  function close() {
    if (changed && errors.length === 0) onSave(override)
    else onClose()
  }
  function step(dir: 1 | -1) {
    const cur = toNum(kcalShown)
    setKcalText(String(stepKcal(result, Number.isFinite(cur) ? cur : targets.target_kcal, dir)))
    setMode('kcal')
  }
  function editMacro(k: MacroKey, v: string) {
    setMacroText({ ...macrosShown, [k]: digits(v, 4) })
    setMode('macro')
  }

  return (
    <BottomSheet open onClose={close} title="하루 목표 칼로리">
      <div style={{ marginTop: 10 }}>
        <div className="kedit">
          <div className="krow">
            <button type="button" className="kstep" aria-label="50kcal 줄이기" onClick={() => step(-1)}>
              −
            </button>
            <label className="kval">
              <input
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                aria-label="하루 목표 칼로리"
                value={kcalShown}
                onChange={(e) => {
                  setKcalText(digits(e.target.value, 4))
                  setMode('kcal')
                }}
              />
              <span>kcal</span>
            </label>
            <button type="button" className="kstep" aria-label="50kcal 늘리기" onClick={() => step(1)}>
              +
            </button>
          </div>
          <div className="kmeta">
            {custom ? (
              <>
                <span className="kcust">직접 조정</span>
                <button type="button" className="link" onClick={() => setMode('rec')}>
                  {`추천값으로 (${formatKcal(result.target_kcal)}kcal)`}
                </button>
              </>
            ) : (
              <span>추천값이에요 · 숫자를 눌러 직접 바꿀 수 있어요</span>
            )}
          </div>
          <div className="kinfo">
            {'기초대사량 '}
            <b className="num">{formatKcal(result.bmr)}</b>
            {' · 하루 소모량 '}
            <b className="num">{formatKcal(result.tdee)}</b>
            {`kcal · ${GOAL_LABEL[result.goal_applied]}`}
          </div>
          {errors.length > 0 && (
            <p role="alert" style={{ ...ERROR_STYLE, margin: 0, textAlign: 'center' }}>
              {errors[0]}
            </p>
          )}
          <div className="macro3">
            {MACRO_KEYS.map((k) => (
              <MacroBox key={k} k={k} value={macrosShown[k]} share={shares[k]} onChange={(v) => editMacro(k, v)} />
            ))}
          </div>
          <p className="kwhy">{WHY[result.goal_applied]}</p>
        </div>
      </div>
      <button type="button" className="btn ink" style={{ width: '100%', marginTop: 16 }} disabled={errors.length > 0} onClick={close}>
        저장
      </button>
    </BottomSheet>
  )
}

const MACRO_META: Record<MacroKey, { label: string; color: string }> = {
  carbs_g: { label: '탄수화물', color: 'var(--carb)' },
  protein_g: { label: '단백질', color: 'var(--prot)' },
  fat_g: { label: '지방', color: 'var(--fat)' },
}

/** 시안 m3: 점·이름, 큰 g 숫자, 작은 %. 숫자는 그대로 입력 칸(누르면 밑줄 — 시안 .kval과 같은 lime-deep 3px) */
function MacroBox({ k, value, share, onChange }: { k: MacroKey; value: string; share: number; onChange: (v: string) => void }) {
  const { label, color } = MACRO_META[k]
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <span className="dot" style={{ background: color, display: 'inline-block', marginRight: 4 }}></span>
      {label}
      <div className="num">
        {/* 칸 너비 = 숫자 글자 너비(숨긴 같은 글자와 한 격자 칸에 겹쳐 둔다) → 시안 "160g"처럼 숫자와 g 사이 틈이 없다 */}
        <span style={{ display: 'inline-grid' }}>
          <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'pre' }}>
            {value || ' '}
          </span>
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            size={1}
            aria-label={`${label} g (${KCAL_PER_G[k]}kcal/g)`}
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            style={{
              gridArea: '1 / 1',
              width: '100%',
              minWidth: 0,
              border: 0,
              borderBottom: `3px solid ${focused ? 'var(--lime-deep)' : 'transparent'}`,
              background: 'none',
              font: 'inherit',
              letterSpacing: 'inherit',
              lineHeight: 'normal',
              // 시안 input:focus-visible의 모서리 8px가 밑줄을 휘게 한다(칸 밑줄이 포커스 표시)
              borderRadius: 0,
              color: 'var(--ink)',
              textAlign: 'center',
              padding: 0,
              outline: 'none',
            }}
          />
        </span>
        g
      </div>
      <small className="num">{`${share}%`}</small>
    </div>
  )
}

// ───────────────────────── 고르면 바로 저장: 목표·활동량 ─────────────────────────

function PickSheet<T extends string>({
  open,
  title,
  goal,
  options,
  value,
  disabled,
  extra,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  goal: StoredGoal
  options: { value: T; label: string; sub?: string }[]
  value: T
  disabled?: (v: T) => boolean
  extra?: ReactNode
  onPick: (v: T) => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <p style={SUB_STYLE}>{RECALC_HELP}</p>
      {extra}
      {goal.override !== null && (
        <div className="note" style={{ marginTop: 14 }}>
          {CUSTOM_NOTE}
        </div>
      )}
      <div className="opts" style={{ marginTop: 14 }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="opt"
            aria-pressed={o.value === value}
            disabled={disabled?.(o.value)}
            style={disabled?.(o.value) ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
            onClick={() => (o.value === value ? onClose() : onPick(o.value))}
          >
            {o.sub ? (
              <span>
                {o.label}
                <small>{o.sub}</small>
              </span>
            ) : (
              o.label
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

export function GoalTypeSheet({ open, goal, onPick, onClose }: { open: boolean; goal: StoredGoal; onPick: (g: GoalType) => void; onClose: () => void }) {
  const minor = goal.result.minor
  return (
    <PickSheet<GoalType>
      open={open}
      title="목표"
      goal={goal}
      options={(['lose', 'maintain', 'gain'] as const).map((v) => ({ value: v, label: GOAL_LABEL[v] }))}
      value={goal.result.goal_applied}
      disabled={minor ? (v) => v !== 'maintain' : undefined}
      extra={
        minor && (
          <div className="note" style={{ marginTop: 14 }}>
            {MINOR_MSG}
          </div>
        )
      }
      onPick={onPick}
      onClose={onClose}
    />
  )
}

export function ActivitySheet({ open, goal, onPick, onClose }: { open: boolean; goal: StoredGoal; onPick: (a: Activity) => void; onClose: () => void }) {
  return (
    <PickSheet<Activity>
      open={open}
      title="활동량"
      goal={goal}
      options={(Object.keys(ACTIVITY_LABEL) as Activity[]).map((v) => ({ value: v, label: ACTIVITY_LABEL[v][0], sub: ACTIVITY_LABEL[v][1] }))}
      value={goal.input.activity}
      onPick={onPick}
      onClose={onClose}
    />
  )
}

// ───────────────────────── 입력 + [저장]: 키·몸무게, 성별·나이 ─────────────────────────

/** 바꾼 입력을 검사하고 추천 칼로리를 다시 낸다(직접 조정은 버린다) */
function recalc(goal: StoredGoal, patch: Partial<GoalInput>): { ok: true; input: GoalInput; kcal: number } | { ok: false; error: string } {
  const v = validateGoalInput({ ...goal.input, ...patch })
  return v.ok ? { ok: true, input: v.value, kcal: computeGoal(v.value).target_kcal } : { ok: false, error: v.errors[0] }
}

function NumField({ value, unit, placeholder, decimals, onChange }: { value: string; unit: string; placeholder: string; decimals?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <input
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        enterKeyHint="done"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={unit}
        className="num"
        value={value}
        onChange={(e) => onChange(decimals ? decimal(e.target.value) : digits(e.target.value, 3))}
      />
      <span>{unit}</span>
    </div>
  )
}

/** 하루 목표 전 → 후(바뀌었을 때) + 직접 조정 안내 + 오류 + [저장] */
function RecalcFooter({ goal, r, changed, onSave }: { goal: StoredGoal; r: ReturnType<typeof recalc>; changed: boolean; onSave: (input: GoalInput) => void }) {
  return (
    <>
      {!r.ok ? (
        <p role="alert" style={ERROR_STYLE}>
          {r.error}
        </p>
      ) : (
        changed && (
          <>
            <div className="callout" style={{ background: 'var(--ground)', marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>하루 목표</span>
              <b className="num" style={{ fontSize: 17 }}>{`${formatKcal(goal.targets.target_kcal)} → ${formatKcal(r.kcal)}kcal`}</b>
            </div>
            {goal.override !== null && (
              <div className="note" style={{ marginTop: 10 }}>
                {CUSTOM_NOTE}
              </div>
            )}
          </>
        )
      )}
      <button type="button" className="btn ink" style={{ width: '100%', marginTop: 18 }} disabled={!r.ok} onClick={() => r.ok && onSave(r.input)}>
        저장
      </button>
    </>
  )
}

/** 저장: 바뀌지 않았으면 닫기만 */
type InputSheetProps = { open: boolean; goal: StoredGoal; onSave: (input: GoalInput) => void; onClose: () => void }

export function HeightWeightSheet(props: InputSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="키·몸무게">
      {props.open && <HeightWeightForm {...props} />}
    </BottomSheet>
  )
}

function HeightWeightForm({ goal, onSave, onClose }: InputSheetProps) {
  const [height, setHeight] = useState(String(goal.input.height_cm))
  const [weight, setWeight] = useState(formatKg(goal.input.weight_kg))
  const h = toNum(height)
  const w = Math.round(toNum(weight) * 10) / 10
  const r = recalc(goal, { height_cm: h, weight_kg: w })
  const changed = h !== goal.input.height_cm || w !== goal.input.weight_kg
  return (
    <>
      <p style={SUB_STYLE}>{RECALC_HELP}</p>
      <NumField value={height} unit="cm" placeholder="165" decimals onChange={setHeight} />
      <NumField value={weight} unit="kg" placeholder="58.0" decimals onChange={setWeight} />
      <div className="note">목표 계산에만 쓰고 언제든 수정·삭제할 수 있어요</div>
      <RecalcFooter goal={goal} r={r} changed={changed} onSave={(input) => (changed ? onSave(input) : onClose())} />
    </>
  )
}

export function SexAgeSheet(props: InputSheetProps) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title="성별·나이">
      {props.open && <SexAgeForm {...props} />}
    </BottomSheet>
  )
}

function SexAgeForm({ goal, onSave, onClose }: InputSheetProps) {
  const [sex, setSex] = useState<Sex>(goal.input.sex)
  const [age, setAge] = useState(String(goal.input.age))
  const a = toNum(age)
  const r = recalc(goal, { sex, age: a })
  const changed = sex !== goal.input.sex || a !== goal.input.age
  return (
    <>
      <p style={SUB_STYLE}>{RECALC_HELP}</p>
      <div className="opts two" style={{ marginTop: 14 }}>
        {(['female', 'male'] as const).map((s) => (
          <button key={s} type="button" className="opt" aria-pressed={sex === s} onClick={() => setSex(s)}>
            {SEX_LABEL[s]}
          </button>
        ))}
      </div>
      <NumField value={age} unit="세" placeholder="24" onChange={setAge} />
      <RecalcFooter goal={goal} r={r} changed={changed} onSave={(input) => (changed ? onSave(input) : onClose())} />
    </>
  )
}
