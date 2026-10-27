// 끼니 화면(D3)의 아래 시트들. 시안 sheets.record·time·mealinfo 마크업·클래스·인라인 style·문구 그대로, 시안에 없는 두 시트는
// 사용자가 확인한 모양(2026-10-27, _workspace/design/mock/1_after_sheet·2_ratio_sheet)대로 시안 부품(.choice·.segment·.btn)으로 그린다.
// - 식사 기록: 급식 카드(.school)는 D13(급식 연동) 전까지 그리지 않는다. PC는 [사진 파일 고르기], 웹캠이 있을 때만 [카메라로 찍기](CLAUDE.md 촬영 화면).
// - 끼니 영양정보: 시안 nutrientTable에서 정한 행만(총 열량·탄수화물(당류·식이섬유)·단백질·지방(포화지방)·나트륨). 세부 4가지는 D4 전까지 "–".
// - 오류·같은 사진·카메라 권한 안내는 D3-2(분석 중·카메라 화면 다시 그리기) 전까지 예전 촬영 화면의 상자 모양 그대로 시트 맨 위에 둔다.
import { useState, type ReactNode } from 'react'
import type { MealType } from '../../data/meals'
import type { ErrorView } from '../capture/captureText'
import { CameraHelp } from '../capture/CaptureControls'
import type { CaptureSource } from '../capture/useCaptureSource'
import { MEAL_TYPE_LABEL } from '../mealText'
import { BottomSheet, Icon } from '../ui'

const r1 = (n: number) => Math.round(n * 10) / 10

export type MealTotals = { kcal: number; carbs_g: number; protein_g: number; fat_g: number }

/** 시안 ✓(다 먹었어요). 시안 ico에 없어 시안 선 아이콘과 같은 24×24 선으로 새로 그렸다(모양 확인 2026-10-27) */
const CHECK = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/** 예전 촬영 화면의 오류 상자(D3-2에서 다시 그린다) */
function ErrorBox({ error, onRetry }: { error: ErrorView; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-3 rounded-tile border border-peach-deep bg-peach-soft p-3">
      <p className="font-semibold text-peach-deep">{error.title}</p>
      <p className="mt-1 text-sm text-ink">{error.detail}</p>
      {import.meta.env.DEV && error.devCode && <p className="mt-1 text-xs text-ink-2">{error.devCode}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-peach-deep bg-surface font-semibold text-ink"
        >
          다시 시도
        </button>
      )}
    </div>
  )
}

/** 사진 버튼 둘(방식별). camera: 앱 안 카메라, fallback: 기기 카메라(capture), pc: 파일 + 웹캠 */
function PhotoChoices({ cap, gate, onPicked }: { cap: CaptureSource; gate: (fn: () => void) => void; onPicked: () => void }) {
  const run = (fn: () => void) => () => {
    onPicked()
    gate(fn)
  }
  const showCamera = cap.mode !== 'pc' || cap.hasWebcam
  return (
    <>
      {showCamera && (
        <button type="button" onClick={run(cap.mode === 'fallback' ? cap.pickCameraInput : cap.openCamera)}>
          <Icon name="camera" bare />
          카메라로 찍기
        </button>
      )}
      <button type="button" onClick={run(cap.pickAlbum)}>
        <Icon name="image" bare />
        {cap.mode === 'pc' ? '사진 파일 고르기' : '앨범에서 고르기'}
      </button>
    </>
  )
}

export function RecordSheet(props: {
  open: boolean
  onClose: () => void
  cap: CaptureSource
  gate: (fn: () => void) => void
  error: ErrorView | null
  onRetry?: () => void
  onManual: () => void
}) {
  const { open, onClose, cap, gate, error, onRetry, onManual } = props
  return (
    <BottomSheet open={open} onClose={onClose} title="식사 기록">
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      <CameraHelp cap={cap} />
      {/* .school "오늘 점심 급식인가요?"는 D13(급식 연동)에서 이 자리에 */}
      <div className="choice">
        <PhotoChoices cap={cap} gate={gate} onPicked={onClose} />
        <button
          type="button"
          onClick={() => {
            onClose()
            onManual()
          }}
        >
          <Icon name="pen" bare />
          직접 입력
        </button>
      </div>
    </BottomSheet>
  )
}

export function TimeSheet({
  open,
  onClose,
  meal,
  value,
  onSave,
}: {
  open: boolean
  onClose: () => void
  meal: MealType
  /** 처음 보일 시각 "HH:MM" */
  value: string
  onSave: (hm: string) => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="먹은 시간">
      {open && <TimeForm meal={meal} value={value} onSave={onSave} />}
    </BottomSheet>
  )
}

function TimeForm({ meal, value, onSave }: { meal: MealType; value: string; onSave: (hm: string) => void }) {
  const [v, setV] = useState(value)
  return (
    <>
      <label htmlFor="mtime" style={{ display: 'block', margin: '12px 0 6px', color: 'var(--ink-2)', fontSize: 14 }}>
        {`${MEAL_TYPE_LABEL[meal]} 시간`}
      </label>
      <input
        id="mtime"
        type="time"
        value={v}
        onChange={(e) => setV(e.target.value)}
        style={{
          width: '100%',
          minHeight: 52,
          borderRadius: 14,
          border: '1px solid var(--line)',
          padding: '0 14px',
          font: '600 20px var(--f-num)',
        }}
      />
      <button
        type="button"
        className="btn ink"
        style={{ width: '100%', marginTop: 16 }}
        disabled={!/^\d{2}:\d{2}$/.test(v)}
        onClick={() => onSave(v)}
      >
        저장
      </button>
    </>
  )
}

/** 시안 nutrientTable(t, true)에서 정한 행만. 세부 4가지(당류·식이섬유·포화지방·나트륨)는 D4(식약처 실제 값) 전까지 "–" */
function NutrientTable({ t }: { t: MealTotals }) {
  const dash = <span className="num">–</span>
  return (
    <div className="ntable">
      <div className="nrow total">
        <span>총 열량</span>
        <span className="num">{`${Math.round(t.kcal)} kcal`}</span>
      </div>
      <div className="nrow">
        <span>탄수화물</span>
        <span className="num">{`${r1(t.carbs_g)} g`}</span>
      </div>
      <div className="nrow sub">
        <span>당류</span>
        {dash}
      </div>
      <div className="nrow sub">
        <span>식이섬유</span>
        {dash}
      </div>
      <div className="nrow">
        <span>단백질</span>
        <span className="num">{`${r1(t.protein_g)} g`}</span>
      </div>
      <div className="nrow">
        <span>지방</span>
        <span className="num">{`${r1(t.fat_g)} g`}</span>
      </div>
      <div className="nrow sub">
        <span>포화지방</span>
        {dash}
      </div>
      <div className="nrow">
        <span>나트륨</span>
        {dash}
      </div>
    </div>
  )
}

export function MealInfoSheet({ open, onClose, meal, totals }: { open: boolean; onClose: () => void; meal: MealType; totals: MealTotals }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={`${MEAL_TYPE_LABEL[meal]} 영양정보`}>
      <NutrientTable t={totals} />
    </BottomSheet>
  )
}

/** "남은 음식을 알려 주세요"(사용자 확인 모양 1). 부제는 "점심 · 첫 음식 외 n개" */
export function AfterSheet(props: {
  open: boolean
  onClose: () => void
  subtitle: string
  cap: CaptureSource
  notices: ReactNode
  onAllEaten: () => void
  onRatio: () => void
  onCancelMeal: () => void
}) {
  const { open, onClose, subtitle, cap, notices, onAllEaten, onRatio, onCancelMeal } = props
  return (
    <BottomSheet open={open} onClose={onClose} title="남은 음식을 알려 주세요">
      <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>{subtitle}</p>
      {notices}
      <div className="choice">
        <PhotoChoices cap={cap} gate={(fn) => fn()} onPicked={onClose} />
        <button type="button" onClick={onAllEaten}>
          {CHECK}다 먹었어요
        </button>
        <button type="button" onClick={onRatio}>
          <Icon name="pen" bare />
          남긴 양 직접 고르기
        </button>
      </div>
      <button
        type="button"
        className="danger"
        style={{ display: 'block', margin: '14px auto 0', minHeight: 44, padding: '0 12px', fontFamily: 'var(--f-head)', fontSize: 15 }}
        onClick={onCancelMeal}
      >
        기록 취소
      </button>
    </BottomSheet>
  )
}

/** 먹은 후 흐름 시트 위쪽 안내(오류·같은 사진·먹기 전 사진 없음·카메라 권한). D3-2 전까지 예전 촬영 화면 상자 모양 */
export function AfterNotices(props: {
  cap: CaptureSource
  error: ErrorView | null
  onRetry?: () => void
  samePending: boolean
  onAnalyzeSame: () => void
  hasBeforePhoto: boolean | null
}) {
  const { cap, error, onRetry, samePending, onAnalyzeSame, hasBeforePhoto } = props
  return (
    <>
      {hasBeforePhoto === false && (
        <p className="mt-3 rounded-tile bg-ground px-3 py-2 text-sm text-ink">
          먹기 전 사진이 이 기기에 없어 음식 목록만으로 분석해요. 정확도가 낮을 수 있어요.
        </p>
      )}
      {samePending && (
        <div role="alert" className="mt-3 rounded-tile border border-butter bg-butter-soft p-3">
          <p className="font-semibold text-ink">먹기 전과 같은 사진이에요</p>
          <p className="mt-1 text-sm text-ink">
            다 먹은 뒤의 사진을 골라 주세요.
          </p>
          <button
            type="button"
            onClick={onAnalyzeSame}
            className="focus-ring mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-butter bg-surface text-ink"
          >
            그대로 분석
          </button>
        </div>
      )}
      {error && <ErrorBox error={error} onRetry={onRetry} />}
      <CameraHelp cap={cap} />
    </>
  )
}

export type RatioFood = { id: string; name: string; beforeGrams: number }
type RatioPick = 0 | 1 | 2 | 3
const PICKS = ['다 먹음', '반 남김', '그대로', '직접 %'] as const
const PICK_RATIO = [0, 0.5, 1] as const

/** 남긴 양 고르기(사용자 확인 모양 2): 음식마다 [다 먹음|반 남김|그대로|직접 %], 기본은 다 먹음. [결과 보기]로 비율(0~1)을 넘긴다 */
export function RatioSheet({
  open,
  onClose,
  foods,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  foods: RatioFood[]
  onSubmit: (ratios: Record<string, number>) => void
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="남긴 양 고르기">
      {open && <RatioForm foods={foods} onSubmit={onSubmit} />}
    </BottomSheet>
  )
}

function RatioForm({ foods, onSubmit }: { foods: RatioFood[]; onSubmit: (ratios: Record<string, number>) => void }) {
  const [picks, setPicks] = useState<Record<string, { pick: RatioPick; pct: string }>>({})
  const get = (id: string) => picks[id] ?? { pick: 0 as RatioPick, pct: '' }
  const pctOk = (s: string) => /^\d{1,3}$/.test(s) && Number(s) <= 100
  const ready = foods.every((f) => get(f.id).pick !== 3 || pctOk(get(f.id).pct))

  function submit() {
    const out: Record<string, number> = {}
    for (const f of foods) {
      const p = get(f.id)
      out[f.id] = p.pick === 3 ? Number(p.pct) / 100 : PICK_RATIO[p.pick]
    }
    onSubmit(out)
  }

  return (
    <>
      <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>음식마다 남긴 양을 골라 주세요</p>
      <div style={{ marginTop: 4 }}>
        {foods.map((f) => {
          const p = get(f.id)
          return (
            <div key={f.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <span className="fn" style={{ fontFamily: 'var(--f-head)', fontSize: 16 }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  먹기 전 <span className="num">{`${Math.round(f.beforeGrams)}g`}</span>
                </span>
              </div>
              <div className="segment" role="tablist" aria-label={`${f.name} 남긴 양`} style={{ marginTop: 10 }}>
                {PICKS.map((l, i) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={p.pick === i}
                    onClick={() => setPicks((s) => ({ ...s, [f.id]: { pick: i as RatioPick, pct: get(f.id).pct } }))}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {p.pick === 3 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={p.pct}
                    aria-label={`${f.name} 남긴 비율`}
                    onChange={(e) => setPicks((s) => ({ ...s, [f.id]: { pick: 3, pct: e.target.value } }))}
                    style={{
                      width: 110,
                      minHeight: 52,
                      borderRadius: 14,
                      border: '1px solid var(--line)',
                      padding: '0 14px',
                      font: '600 20px var(--f-num)',
                    }}
                  />
                  <span style={{ color: 'var(--ink-2)' }}>% 남겼어요</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button type="button" className="btn ink" style={{ width: '100%', marginTop: 16 }} disabled={!ready} onClick={submit}>
        결과 보기
      </button>
    </>
  )
}
