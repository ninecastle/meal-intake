// 나의 변화(D6)의 아래 시트들. 시안에 없는 시트라 사용자가 확인한 모양(2026-10-28, _workspace/design/mock/d6_1~3·d6_5~6)대로
// 시안 부품으로 그린다: 큰 숫자 칸은 시안 온보딩 "몸무게를 알려주세요"의 .field, [저장]은 .btn.ink, 지우기는 주황 글자(.danger),
// 목표 다시 계산은 시안 goalpick 시트처럼 h2 + 설명 p, 하루 목표 전→후 .callout, 직접 조정 안내 .note, [나중에](.btn.ghost)·[다시 계산](.btn.ink).
import { useState, type ReactNode } from 'react'
import { formatKcal } from '../mealText'
import { formatKg, kgInputLooksWrong, parseKg, WEIGHT_MAX, WEIGHT_MIN } from '../../lib/weight'
import { BottomSheet } from '../ui'

/** 시안 [기록 취소]와 같은 주황 글자 버튼(D3) */
const DANGER_BTN = { display: 'block', margin: '14px auto 0', minHeight: 44, padding: '0 12px', fontFamily: 'var(--f-head)', fontSize: 15 } as const

/** 체중 기록·목표 몸무게 공용 시트: 제목, 부제, 큰 kg 칸, 아래 한 줄(지난 기록), [저장], 값이 있으면 주황 글자 지우기 */
export function KgSheet(props: {
  open: boolean
  onClose: () => void
  title: string
  sub: string
  /** 처음 보일 값(없으면 빈 칸) */
  value: number | null
  hint?: ReactNode
  /** 있으면 주황 글자 버튼(기록 지우기·목표 지우기) */
  deleteLabel?: string
  /** 있으면 저장 전 검사: 문구를 돌려주면 주황 글자로 보이고 [저장]을 막는다(체중 기록 하루 3kg) */
  check?: (kg: number) => string | null
  onSave: (kg: number) => void
  onDelete?: () => void
}) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose} title={props.title}>
      {props.open && <KgForm {...props} />}
    </BottomSheet>
  )
}

function KgForm({ sub, value, hint, deleteLabel, check, onSave, onDelete }: Parameters<typeof KgSheet>[0]) {
  const [raw, setRaw] = useState(value === null ? '' : formatKg(value))
  const kg = parseKg(raw)
  const wrong = kgInputLooksWrong(raw)
  const problem = kg !== null && check ? check(kg) : null
  const save = () => kg !== null && !problem && onSave(kg)
  return (
    <>
      <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>{sub}</p>
      <div className="field" style={{ marginTop: 18 }}>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder="58.0"
          aria-label="kg"
          aria-invalid={wrong || !!problem || undefined}
          className="num"
          value={raw}
          onChange={(e) => setRaw(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            // 저장하면 시트가 닫히며 포커스가 [기록하기]로 돌아간다. 막지 않으면 같은 Enter가 그 버튼을 눌러 시트가 빈 칸으로 다시 열린다
            // (폰 자판 완료 키, 2026-10-28 사용자 보고)
            e.preventDefault()
            save()
          }}
        />
        <span>kg</span>
      </div>
      {wrong ? (
        <p role="alert" style={{ fontSize: 14, color: 'var(--peach-deep)', margin: '10px 0 0' }}>
          {`${WEIGHT_MIN}~${WEIGHT_MAX}kg 사이로 적어 주세요`}
        </p>
      ) : problem ? (
        <p role="alert" style={{ fontSize: 14, color: 'var(--peach-deep)', margin: '10px 0 0' }}>
          {problem}
        </p>
      ) : (
        hint && <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '10px 0 0' }}>{hint}</p>
      )}
      <button type="button" className="btn ink" style={{ width: '100%', marginTop: 18 }} disabled={kg === null || !!problem} onClick={save}>
        저장
      </button>
      {deleteLabel && onDelete && (
        <button type="button" className="danger" style={DANGER_BTN} onClick={onDelete}>
          {deleteLabel}
        </button>
      )}
    </>
  )
}

export type RecalcView = {
  /** 목표 계산에 쓴 몸무게 */
  goalKg: number
  /** 최근 체중 기록 */
  latestKg: number
  fromKcal: number
  toKcal: number
  /** 목표 칼로리·탄단지를 직접 조정해 둔 상태(다시 계산하면 추천값으로 바뀐다) */
  custom: boolean
}

/** 체중 기록 직후 "목표를 다시 계산할까요?"(2026-10-28 사용자 결정). X·바깥 누르기·Esc는 [나중에]와 같다. */
export function RecalcSheet({ view, onRecalc, onLater }: { view: RecalcView | null; onRecalc: () => void; onLater: () => void }) {
  const diff = view ? Math.abs(Math.round(view.latestKg * 10) - Math.round(view.goalKg * 10)) / 10 : 0
  return (
    <BottomSheet open={view !== null} onClose={onLater} title={`몸무게가 ${formatKg(diff)}kg 바뀌었어요`}>
      {view && (
        <>
          <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>
            {'목표는 '}
            <span className="num">{`${formatKg(view.goalKg)}kg`}</span>
            {'으로 계산했어요. 최근 기록 '}
            <span className="num">{`${formatKg(view.latestKg)}kg`}</span>
            {'으로 목표를 다시 계산할까요?'}
          </p>
          <div className="callout" style={{ background: 'var(--ground)', marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>하루 목표</span>
            <b className="num" style={{ fontSize: 17 }}>{`${formatKcal(view.fromKcal)} → ${formatKcal(view.toKcal)}kcal`}</b>
          </div>
          {view.custom && (
            <div className="note" style={{ marginTop: 10 }}>
              직접 정한 목표 칼로리·탄단지는 추천값으로 바뀌어요
            </div>
          )}
          <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '10px 0 0' }}>새 목표는 오늘부터 적용돼요. 지난 날짜는 그때 목표 그대로예요</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onLater}>
              나중에
            </button>
            <button type="button" className="btn ink" style={{ flex: 1 }} onClick={onRecalc}>
              다시 계산
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
