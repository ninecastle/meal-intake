// 결과 수정 화면(S4)의 음식 카드 한 장(스펙 2.3절). 계산은 하지 않고 바뀐 값만 상위(ReviewEditor)로 올린다.
// 필드: 이름(자동완성·세부 종류), 중량, 남긴 비율, 같이 먹은 인원수, 섭취 kcal(직접 수정), 탄·단·지(읽기 전용), 출처 배지.
// 모양(디자인 조각 D3-2, 사용자 확인 2026-10-27 _workspace/design/mock/d32_4_review·d32_5_manual): 시안 부품으로만 그린다.
// 카드(선 1px·모서리 r-lg, 확인할 음식은 butter 2px) → 이름 .fn + .srcb(+ 확인 필요) · X → 먹기 전 무게·먹은 kcal 칸(시안 먹은 시간 칸 모양)
// → 남긴 양 .segment [다 먹음|반 남김|그대로|직접 %](밀어서 고르는 막대 대신) → 같이 먹은 사람 .segment [1명~5명+] → 먹은 양·탄단지 줄.
// 이름 고치기·직접 입력은 FoodSearch(이름 칸 + DB 후보 .rec 줄 + [그대로 쓰기]).
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type Ref } from 'react'
import { MAX_EATERS } from '../../analysis/compute'
import { listFoodVariants, searchFoodNames, type FoodSuggestion } from '../../analysis/nutrition'
import { foodName } from '../../lib/foodName'
import type { MealItem } from '../../types/analysis'
import { sourceLabel } from '../mealText'
import { Icon, IconButton } from '../ui'

const AUTOCOMPLETE_DEBOUNCE_MS = 200
const VARIANT_LIMIT = 50
const MAX_GRAMS = 5000
const MAX_KCAL = 20000

const LABEL: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', marginTop: 14 }
/** 시안 먹은 시간 칸(min-height 52·모서리 14·선 line) 모양의 입력 상자 */
const BOX: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 52,
  borderRadius: 14,
  border: '1px solid var(--line)',
  padding: '0 14px',
  marginTop: 6,
}
const NUM_INPUT: CSSProperties = {
  flex: '1 1 0',
  width: 0,
  minWidth: 0,
  border: 0,
  background: 'none',
  font: '600 20px var(--f-num)',
  color: 'var(--ink)',
  padding: 0,
}
const UNIT: CSSProperties = { color: 'var(--ink-2)' }

const MATCH_NOTE = { name: null, group: '대표값', partial: '부분 일치' } as const

const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/** 남긴 비율이 null(불확실)일 때 안내. 고르기 전에는 저장하지 않는다(2026-10-27). */
export type RatioHint = 'mismatch' | 'manual'
const RATIO_HINT: Record<RatioHint, string> = {
  mismatch: '사진이 먹기 전과 달라 보여요. 다시 찍거나 남긴 양을 직접 골라 주세요',
  manual: '남긴 양을 직접 골라 주세요',
}
/** ratio_assumed === 'not_visible': 같은 장면인데 그릇이 안 보여 다 먹음(0)으로 미리 골라 둔 경우. 저장은 막지 않는다(2026-10-27). */
const ASSUMED_HINT = '그릇이 안 보여서 다 드신 걸로 했어요. 아니면 바꿔 주세요'
/** 남긴 양 빠른 선택: 다 먹음(0)·반 남김(0.5)·그대로(1), 그 밖은 직접 % */
const RATIO_PICKS = ['다 먹음', '반 남김', '그대로', '직접 %'] as const
const RATIO_VALUES = [0, 0.5, 1] as const
const EATER_PICKS = ['1명', '2명', '3명', '4명', '5명+'] as const

export interface FoodCardProps {
  item: MealItem
  /** needs_review, AI 추정, 그릇이 안 보여 다 먹음으로 둠(ratio_assumed): 노란 테두리 */
  flagged: boolean
  /** 영양값 조회 중이면 새 이름(카드를 잠근다) */
  pendingName: string | null
  editing: boolean
  /** "다시 계산할까요?"를 묻는 중이면 새 이름 */
  askName: string | null
  focusKcal: boolean
  /** remaining_ratio가 null일 때 보일 안내(먹은 후 분석이 있었으면 mismatch, 직접 고르기·수정 모드면 manual) */
  ratioHint: RatioHint
  /** 검색 기반일 때 Gemini 검색 추천 HTML(저장하지 않음) */
  suggestionHtml: string | null
  onStartEdit: () => void
  onCancelEdit: () => void
  onConfirmName: (name: string, dbCode?: string) => void
  onAnswerAsk: (yes: boolean) => void
  onGrams: (g: number) => void
  onRatio: (r: number) => void
  onEaters: (n: number) => void
  onKcal: (kcal: number | null) => void
  onDelete: () => void
  onKcalFocused: () => void
}

/** 시안 .segment(role tablist·tab, aria-selected) */
function Segment({ items, sel, label, onPick }: { items: readonly string[]; sel: number; label: string; onPick: (i: number) => void }) {
  return (
    <div className="segment" role="tablist" aria-label={label} style={{ marginTop: 6 }}>
      {items.map((l, i) => (
        <button key={l} type="button" role="tab" aria-selected={sel === i} onClick={() => onPick(i)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export default function FoodCard(p: FoodCardProps) {
  const { item, focusKcal, onKcalFocused } = p
  const pending = p.pendingName !== null
  const kcalRef = useRef<HTMLInputElement>(null)
  // [직접 %]를 눌렀으면 다른 빠른 선택을 누르기 전까지 숫자 칸을 연다(50을 적어도 [반 남김]으로 바뀌지 않게)
  const [customPct, setCustomPct] = useState(false)

  useEffect(() => {
    if (!focusKcal || pending) return
    kcalRef.current?.focus()
    onKcalFocused()
  }, [focusKcal, pending, onKcalFocused])

  const name = p.pendingName ?? item.name
  const ratio = item.remaining_ratio
  const ratioPct = ratio == null ? 0 : Math.round(ratio * 100)
  // 미리 고른 0%(다 먹음). 사용자가 빠른 선택이나 직접 %로 고르면(같은 0%라도) setRemainingRatio가 표시를 지운다.
  const assumed = item.ratio_assumed === 'not_visible' && ratio !== null
  const ratioOpen = ratio == null || assumed
  const quick = ratio == null ? -1 : RATIO_VALUES.indexOf(ratio as (typeof RATIO_VALUES)[number])
  const ratioSel = customPct ? 3 : quick >= 0 ? quick : ratio == null ? -1 : 3
  const canAuto = item.kcal_overridden && item.per_100g !== null
  const dbNote = item.db_match ? MATCH_NOTE[item.db_match] : null
  const ref = item.db_reference
  const shownName = foodName(name)
  const sub = [
    '눌러서 이름 고치기',
    item.nutrition_source === 'db' && item.db_name ? `DB 이름: ${foodName(item.db_name)}${dbNote ? ` (${dbNote})` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li
      style={{
        listStyle: 'none',
        border: p.flagged ? '2px solid var(--butter)' : '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        padding: 16,
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <button type="button" onClick={p.onStartEdit} style={{ flex: 1, minWidth: 0, minHeight: 44, padding: 0, textAlign: 'left' }}>
            <div className="fn" style={{ fontFamily: 'var(--f-head)', fontSize: 17, overflowWrap: 'anywhere' }}>
              {shownName || <span style={{ color: 'var(--ink-3)' }}>이름을 입력하세요</span>}
              <span className="srcb">{sourceLabel(item)}</span>
              {item.needs_review && (
                <span
                  className="state"
                  style={{ marginLeft: 6, fontSize: 12, padding: '2px 9px', background: 'var(--butter-soft)', color: 'var(--ink)' }}
                >
                  확인 필요
                </span>
              )}
              {pending && <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--sky-deep)' }}>계산 중…</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{sub}</div>
          </button>
          <IconButton icon="close" label={`${shownName || '이 음식'} 삭제`} onClick={p.onDelete} style={{ width: 36, height: 36 }} />
        </div>
        {ref && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>
            참고 DB 대표값 {Math.round(ref.kcal_per_100g)}kcal/100g ({foodName(ref.db_name)}
            {ref.db_match === 'partial' ? ', 부분 일치' : ''}
            {ref.ml_converted ? ', 환산' : ''})
          </p>
        )}

        {p.editing && <NameEditor item={item} onConfirm={p.onConfirmName} onCancel={p.onCancelEdit} />}

        {p.askName !== null && (
          <div className="callout" style={{ background: 'var(--butter-soft)' }}>
            칼로리를 직접 고친 음식이에요. ‘{foodName(p.askName)}’ 기준으로 다시 계산할까요?
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="chipbtn dark" onClick={() => p.onAnswerAsk(true)}>
                예, 다시 계산
              </button>
              <button type="button" className="chipbtn" onClick={() => p.onAnswerAsk(false)}>
                아니요, 이름만
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
          <div>
            <div style={LABEL}>먹기 전 무게</div>
            <label className="fbox" style={BOX}>
              <NumField value={item.before_grams} min={0} max={MAX_GRAMS} onCommit={p.onGrams} label="먹기 전 무게(g)" style={NUM_INPUT} />
              <span style={UNIT}>g</span>
            </label>
            {item.grams_source === 'published' && item.published_g != null && (
              <div style={{ fontSize: 12, color: 'var(--lime-deep)', marginTop: 4 }}>
                공개 중량 {Math.round(item.published_g)}g × {item.unit_count ?? 1}
              </div>
            )}
          </div>
          <div>
            <div style={LABEL}>
              먹은 kcal{canAuto && <span style={{ marginLeft: 4, color: 'var(--peach-deep)' }}>직접 입력</span>}
            </div>
            <label className="fbox" style={BOX}>
              <NumField
                inputRef={kcalRef}
                live={false}
                value={Math.round(item.consumed.kcal)}
                min={0}
                max={MAX_KCAL}
                onCommit={(k) => p.onKcal(k)}
                label="먹은 kcal"
                style={NUM_INPUT}
              />
              <span style={UNIT}>kcal</span>
            </label>
            {canAuto && (
              <button type="button" className="link" onClick={() => p.onKcal(null)} style={{ marginTop: 4, padding: 0, fontSize: 13 }}>
                자동 계산으로
              </button>
            )}
          </div>
        </div>

        <div style={LABEL}>남긴 양</div>
        <Segment
          items={RATIO_PICKS}
          sel={ratioSel}
          label={`${shownName || '음식'} 남긴 양`}
          onPick={(i) => {
            if (i === 3) {
              setCustomPct(true)
              return
            }
            setCustomPct(false)
            p.onRatio(RATIO_VALUES[i])
          }}
        />
        {ratioSel === 3 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <NumField
              live={false}
              value={ratioPct}
              min={0}
              max={100}
              onCommit={(n) => p.onRatio(Math.round(n) / 100)}
              label={`${shownName || '음식'} 남긴 비율(%)`}
              style={{ width: 110, minHeight: 52, borderRadius: 14, border: '1px solid var(--line)', padding: '0 14px', font: '600 20px var(--f-num)' }}
            />
            <span style={UNIT}>% 남겼어요</span>
          </div>
        )}
        {ratioOpen && (
          <div role="status" className="callout" style={{ background: 'var(--butter-soft)' }}>
            {assumed ? ASSUMED_HINT : RATIO_HINT[p.ratioHint]}
          </div>
        )}

        <div style={LABEL}>같이 먹은 사람</div>
        <Segment
          items={EATER_PICKS}
          sel={item.eaters >= 5 ? 4 : item.eaters - 1}
          label={`${shownName || '음식'} 같이 먹은 사람`}
          onPick={(i) => {
            if (i < 4) p.onEaters(i + 1)
            else if (item.eaters < 5) p.onEaters(5)
          }}
        />
        {item.eaters >= 5 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <NumField
              live={false}
              value={item.eaters}
              min={5}
              max={MAX_EATERS}
              onCommit={(n) => p.onEaters(Math.round(n))}
              label={`같이 먹은 사람(5~${MAX_EATERS}명)`}
              style={{ width: 110, minHeight: 52, borderRadius: 14, border: '1px solid var(--line)', padding: '0 14px', font: '600 20px var(--f-num)' }}
            />
            <span style={UNIT}>명</span>
          </div>
        )}

        <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
          먹은 양 <b className="num">{`${item.consumed_grams.toFixed(0)}g`}</b> · 탄 <Macro item={item} k="carbs_g" /> · 단{' '}
          <Macro item={item} k="protein_g" /> · 지 <Macro item={item} k="fat_g" />
        </p>

        {item.nutrition_source === 'search' && p.suggestionHtml && <SearchSuggestion html={p.suggestionHtml} />}
      </fieldset>
    </li>
  )
}

const MACRO_COLOR = { carbs_g: 'var(--carb)', protein_g: 'var(--prot)', fat_g: 'var(--fat)' } as const

// 탄·단·지(읽기 전용). 값이 없으면 –, DB에 없어 AI 추정으로 채웠으면 시안 "추정" 배지(.est)
function Macro({ item, k }: { item: MealItem; k: 'carbs_g' | 'protein_g' | 'fat_g' }) {
  if (!item.per_100g) return <>–</>
  const fill = k === 'protein_g' ? undefined : item.per_100g_fill?.[k]
  if (fill === 'missing') return <>–</>
  return (
    <>
      <b className="num" style={{ color: MACRO_COLOR[k] }}>{`${item.consumed[k].toFixed(1)}g`}</b>
      {fill === 'ai_estimate' && (
        <span className="est" style={{ marginLeft: 3, marginRight: 0 }}>
          추정
        </span>
      )}
    </>
  )
}

// 입력 중에는 문자열 그대로 두고, 숫자가 되면 올린다(live) 또는 포커스가 빠질 때 올린다.
function NumField(props: {
  value: number
  onCommit: (n: number) => void
  label: string
  live?: boolean
  min?: number
  max?: number
  inputRef?: Ref<HTMLInputElement>
  style?: CSSProperties
}) {
  const { value, onCommit, live = true, min = 0, max = Number.POSITIVE_INFINITY } = props
  const [draft, setDraft] = useState<string | null>(null)
  const parse = (s: string): number | null => {
    if (s.trim() === '') return null
    const n = Number(s)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
  }
  return (
    <input
      ref={props.inputRef}
      type="number"
      inputMode="decimal"
      aria-label={props.label}
      min={min}
      max={Number.isFinite(max) ? max : undefined}
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value))
        e.currentTarget.select()
      }}
      onChange={(e) => {
        const s = e.target.value
        setDraft(s)
        if (!live) return
        const n = parse(s)
        if (n !== null) onCommit(n)
      }}
      onBlur={(e) => {
        if (!live) {
          const n = parse(e.currentTarget.value)
          if (n !== null && n !== value) onCommit(n)
        }
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      style={props.style}
    />
  )
}

/**
 * 음식 이름 찾기(디자인 조각 D3-2, 사용자 확인 모양 d32_5_manual): 이름 칸(연필) → 입력 중 DB 후보(.rec 줄: 화면 이름·kcal/100g)
 * → [‘입력한 이름’ 그대로 쓰기]. 고르면 onConfirm(정리한 이름, DB 코드). 직접 입력(새 기록, 음식 없음)과 카드 이름 고치기가 함께 쓴다.
 * baseName이 있으면(이름 고치기) 같은 음식의 세부 종류 목록(listFoodVariants)과 걸러 보기를 더 보인다.
 */
export function FoodSearch(props: {
  initial: string
  onConfirm: (name: string, dbCode?: string) => void
  onCancel?: () => void
  baseName?: string
  baseCode?: string
  autoFocus?: boolean
  /** 목록에 없는 이름을 그대로 넣는 버튼 말: 직접 입력(새 음식)은 "추가", 카드 이름 고치기는 "쓰기" */
  verb?: '추가' | '쓰기'
}) {
  const { initial, onConfirm, onCancel, baseName, baseCode, verb = '쓰기' } = props
  const [draft, setDraft] = useState(initial)
  const [sugs, setSugs] = useState<FoodSuggestion[]>([])
  const [variants, setVariants] = useState<FoodSuggestion[] | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const q = draft.trim()
    let alive = true
    const t = setTimeout(() => {
      if (!q) {
        setSugs([])
        return
      }
      searchFoodNames(q)
        .then((r) => alive && setSugs(r))
        .catch(() => alive && setSugs([]))
    }, AUTOCOMPLETE_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [draft])

  useEffect(() => {
    if (!baseName) return
    let alive = true
    listFoodVariants(baseName, { dbCode: baseCode, limit: VARIANT_LIMIT })
      .then((r: FoodSuggestion[]) => alive && setVariants(r))
      .catch(() => alive && setVariants([]))
    return () => {
      alive = false
    }
  }, [baseName, baseCode])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const nm = draft.trim()
    if (nm && nm === initial.trim() && onCancel) onCancel()
    else if (nm) onConfirm(nm)
  }

  const f = compact(filter)
  const shown = (variants ?? []).filter((v) => !f || compact(v.label).includes(f) || compact(v.dbName).includes(f))
  const typed = draft.trim()

  return (
    <div style={{ marginTop: 12 }}>
      <form onSubmit={submit}>
        <label className="fbox" style={{ ...BOX, gap: 10, marginTop: 0 }}>
          <Icon name="pen" size={22} className="text-ink-3" />
          <input
            autoFocus={props.autoFocus ?? true}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="음식 이름"
            enterKeyHint="done"
            aria-label="음식 이름"
            style={{ ...NUM_INPUT, font: '20px var(--f-body)' }}
          />
        </label>
      </form>

      {sugs.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {sugs.map((s, i) => (
            <SuggestionRow key={`${s.dbCode}-${i}`} s={s} onPick={() => onConfirm(foodName(s.label), s.dbCode)} />
          ))}
        </div>
      )}

      {typed && (
        <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => submit()}>
          {`'${typed}' 그대로 ${verb}`}
        </button>
      )}
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '10px 0 0' }}>
        {`목록에 없으면 그대로 ${verb === '추가' ? '추가하고' : '쓰고'} 칼로리를 직접 넣어요.`}
        {onCancel && (
          <button type="button" className="link" onClick={onCancel} style={{ marginLeft: 8, padding: 0, fontSize: 13 }}>
            취소
          </button>
        )}
      </p>

      {baseName && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>‘{foodName(baseName)}’ 세부 종류</div>
          <label className="fbox" style={BOX}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="걸러 보기 (예: 양념, 순살)"
              aria-label="세부 종류 걸러 보기"
              style={{ ...NUM_INPUT, font: '16px var(--f-body)' }}
            />
          </label>
          {variants === null ? (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0' }}>불러오는 중…</p>
          ) : shown.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0' }}>맞는 종류가 없어요. 위에 이름을 쓰고 [그대로 {verb}]를 눌러 주세요.</p>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
              {shown.map((s, i) => (
                <SuggestionRow key={`${s.dbCode}-${i}`} s={s} onPick={() => onConfirm(foodName(s.label), s.dbCode)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 카드 안 이름 고치기: 화면 이름으로 열고(DB 표기 "분류_세부"를 보이지 않는다), 그대로 [그대로 쓰기]하면 바뀐 것이 없으므로 닫기만 한다.
function NameEditor(props: { item: MealItem; onConfirm: (name: string, dbCode?: string) => void; onCancel: () => void }) {
  const { item, onConfirm, onCancel } = props
  const baseName = item.name.trim()
  return (
    <FoodSearch
      initial={foodName(item.name)}
      onConfirm={onConfirm}
      onCancel={onCancel}
      baseName={baseName || undefined}
      baseCode={item.db_food_code ?? item.db_reference?.db_food_code ?? undefined}
    />
  )
}

/** DB 후보 한 줄(시안 .rec 줄 모양): 화면 이름(대표값·환산 작은 글자) · kcal/100g */
function SuggestionRow({ s, onPick }: { s: FoodSuggestion; onPick: () => void }) {
  return (
    <button
      type="button"
      className="rec"
      onClick={onPick}
      style={{ width: '100%', textAlign: 'left', gridTemplateColumns: '1fr auto', padding: '14px 0' }}
    >
      <span>
        <b style={{ fontFamily: 'var(--f-head)' }}>{foodName(s.label)}</b>
        {(s.kind === 'group' || s.mlConverted) && (
          <small>{[s.kind === 'group' && '대표값', s.mlConverted && '환산'].filter(Boolean).join(' · ')}</small>
        )}
      </span>
      <span className="num" style={{ fontSize: 14, color: 'var(--ink-2)' }}>{`${Math.round(s.kcalPer100g)}kcal/100g`}</span>
    </button>
  )
}

// 검색 추천(Search Suggestions)은 Shadow DOM에 원문 그대로 넣는다. 스타일 변경·숨김·끼워 넣기 금지(스펙 2.3절)
function SearchSuggestion({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = ref.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    root.innerHTML = html
  }, [html])
  return <div ref={ref} />
}
