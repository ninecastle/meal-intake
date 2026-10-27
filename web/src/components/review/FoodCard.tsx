// 결과 수정 화면(S4)의 음식 카드 한 장(스펙 2.3절). 계산은 하지 않고 바뀐 값만 상위(ReviewEditor)로 올린다.
// 필드: 이름(자동완성·세부 종류), 중량, 남긴 비율, 같이 먹은 인원수, 섭취 kcal(직접 수정), 탄·단·지(읽기 전용), 출처 배지.
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { MAX_EATERS } from '../../analysis/compute'
import { listFoodVariants, searchFoodNames, type FoodSuggestion } from '../../analysis/nutrition'
import type { MealItem } from '../../types/analysis'
import SourceBadge from './SourceBadge'

const AUTOCOMPLETE_DEBOUNCE_MS = 200
const VARIANT_LIMIT = 50
const MAX_GRAMS = 5000
const MAX_KCAL = 20000

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
/** 빠른 선택: 남긴 비율 0(다 먹음)·0.5(반)·1(그대로 남김) */
const QUICK_RATIOS = [
  { r: 0, label: '다 먹음' },
  { r: 0.5, label: '반 남김' },
  { r: 1, label: '그대로' },
] as const

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

export default function FoodCard(p: FoodCardProps) {
  const { item, focusKcal, onKcalFocused } = p
  const pending = p.pendingName !== null
  const kcalRef = useRef<HTMLInputElement>(null)

  // 3단계 조회가 모두 실패(user_input)하면 kcal 입력란에 포커스
  useEffect(() => {
    if (!focusKcal || pending) return
    kcalRef.current?.focus()
    onKcalFocused()
  }, [focusKcal, pending, onKcalFocused])

  const name = p.pendingName ?? item.name
  const ratioPct = item.remaining_ratio == null ? 0 : Math.round(item.remaining_ratio * 100)
  // 미리 고른 0%(다 먹음). 사용자가 슬라이더·빠른 선택으로 고르면(같은 0%라도) setRemainingRatio가 표시를 지운다.
  const assumed = item.ratio_assumed === 'not_visible' && item.remaining_ratio !== null
  const ratioOpen = item.remaining_ratio == null || assumed
  const canAuto = item.kcal_overridden && item.per_100g !== null
  const dbNote = item.db_match ? MATCH_NOTE[item.db_match] : null
  const ref = item.db_reference

  return (
    <li className={`rounded-lg bg-white p-3 shadow-sm ${p.flagged ? 'border-2 border-amber-400' : 'border border-gray-200'}`}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <div className="flex items-start gap-2">
          <button type="button" onClick={p.onStartEdit} className="min-h-11 min-w-0 flex-1 text-left">
            <span className="block break-words text-base font-semibold">
              {name || <span className="text-gray-400">이름을 입력하세요</span>}
            </span>
            <span className="text-xs text-gray-500">눌러서 이름·종류 고치기</span>
          </button>
          <button
            type="button"
            onClick={p.onDelete}
            className="min-h-11 min-w-11 rounded border border-gray-300 px-2 text-gray-600"
          >
            삭제
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <SourceBadge item={item} />
          {item.needs_review && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">확인 필요</span>}
          {pending && <span className="font-medium text-blue-700">계산 중…</span>}
        </div>
        {item.nutrition_source === 'db' && item.db_name && (
          <p className="text-xs text-gray-600">
            DB 이름: {item.db_name}
            {dbNote && ` (${dbNote})`}
          </p>
        )}
        {ref && (
          <p className="text-xs text-gray-600">
            참고 DB 대표값 {Math.round(ref.kcal_per_100g)}kcal/100g ({ref.db_name}
            {ref.db_match === 'partial' ? ', 부분 일치' : ''}
            {ref.ml_converted ? ', 환산' : ''})
          </p>
        )}

        {p.editing && <NameEditor item={item} onConfirm={p.onConfirmName} onCancel={p.onCancelEdit} />}

        {p.askName !== null && (
          <div className="rounded bg-amber-50 p-2">
            <p>칼로리를 직접 고친 음식이에요. ‘{p.askName}’ 기준으로 다시 계산할까요?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => p.onAnswerAsk(true)}
                className="min-h-11 flex-1 rounded bg-gray-900 px-2 text-white"
              >
                예, 다시 계산
              </button>
              <button
                type="button"
                onClick={() => p.onAnswerAsk(false)}
                className="min-h-11 flex-1 rounded border border-gray-400 px-2"
              >
                아니요, 이름만
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-gray-600">중량(g, 먹기 전)</span>
            <NumField value={item.before_grams} min={0} max={MAX_GRAMS} onCommit={p.onGrams} label="중량(g)" />
            {item.grams_source === 'published' && item.published_g != null && (
              <span className="mt-0.5 block text-xs text-emerald-700">
                공개 중량 {Math.round(item.published_g)}g × {item.unit_count ?? 1}
              </span>
            )}
          </label>
          <div>
            <label className="block">
              <span className="text-xs text-gray-600">
                섭취 kcal{canAuto && <span className="ml-1 font-medium text-purple-700">직접 입력</span>}
              </span>
              <NumField
                inputRef={kcalRef}
                live={false}
                value={Math.round(item.consumed.kcal)}
                min={0}
                max={MAX_KCAL}
                onCommit={(k) => p.onKcal(k)}
                label="섭취 kcal"
              />
            </label>
            {canAuto && (
              <button
                type="button"
                onClick={() => p.onKcal(null)}
                className="mt-1 min-h-11 w-full rounded border border-gray-300 text-xs"
              >
                자동 계산
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>남긴 비율</span>
            <span className={`font-medium ${ratioOpen ? 'text-amber-700' : 'text-gray-900'}`}>
              {item.remaining_ratio == null ? '아직 안 고름' : `${ratioPct}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={ratioPct}
            onChange={(e) => p.onRatio(Number(e.target.value) / 100)}
            // 값이 그대로(0%)면 onChange가 없으므로, 미리 고른 상태에서 슬라이더를 누르고 떼도 확인한 것으로 본다
            onPointerUp={(e) => {
              if (assumed) p.onRatio(Number(e.currentTarget.value) / 100)
            }}
            aria-label="남긴 비율"
            className="h-11 w-full accent-amber-500"
          />
          {ratioOpen && (
            <div role="status" className="rounded bg-amber-50 p-2 text-amber-900">
              <p className="text-sm font-medium">{assumed ? ASSUMED_HINT : RATIO_HINT[p.ratioHint]}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {QUICK_RATIOS.map((q) => {
                  const sel = assumed && q.r === item.remaining_ratio
                  return (
                    <button
                      key={q.r}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => p.onRatio(q.r)}
                      className={`min-h-11 rounded border px-2 text-sm ${sel ? 'border-amber-600 bg-amber-500 font-medium text-white' : 'border-amber-400 bg-white'}`}
                    >
                      {q.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-600">같이 먹은 인원수</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const sel = n < 5 ? item.eaters === n : item.eaters >= 5
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => {
                    if (n === 5 && item.eaters >= 5) return
                    p.onEaters(n)
                  }}
                  className={`min-h-11 min-w-11 rounded border px-2 ${sel ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'}`}
                >
                  {n === 5 ? '5+' : n}
                </button>
              )
            })}
            {item.eaters >= 5 && (
              <label className="flex items-center gap-1">
                <NumField
                  live={false}
                  value={item.eaters}
                  min={5}
                  max={MAX_EATERS}
                  onCommit={(n) => p.onEaters(Math.round(n))}
                  label={`같이 먹은 인원수(5~${MAX_EATERS})`}
                  className="min-h-11 w-16 rounded border border-gray-300 px-2 text-base"
                />
                명
              </label>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-700">
          섭취 {item.consumed_grams.toFixed(0)}g · 탄 <Macro item={item} k="carbs_g" /> · 단 <Macro item={item} k="protein_g" /> · 지{' '}
          <Macro item={item} k="fat_g" />
        </p>

        {item.nutrition_source === 'search' && p.suggestionHtml && <SearchSuggestion html={p.suggestionHtml} />}
      </fieldset>
    </li>
  )
}

// 탄·단·지(읽기 전용). 값이 없으면 –, DB에 없어 AI 추정으로 채웠으면 작은 표시
function Macro({ item, k }: { item: MealItem; k: 'carbs_g' | 'protein_g' | 'fat_g' }) {
  if (!item.per_100g) return <>–</>
  const fill = k === 'protein_g' ? undefined : item.per_100g_fill?.[k]
  if (fill === 'missing') return <>–</>
  return (
    <>
      {item.consumed[k].toFixed(1)}g{fill === 'ai_estimate' && <span className="ml-0.5 text-[10px] text-amber-700">AI 추정</span>}
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
  className?: string
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
      className={props.className ?? 'mt-1 min-h-11 w-full rounded border border-gray-300 px-2 text-base'}
    />
  )
}

// 이름 고치기: 입력 중 자동완성(searchFoodNames) + 같은 음식의 세부 종류 목록(listFoodVariants)과 걸러 보기
function NameEditor(props: { item: MealItem; onConfirm: (name: string, dbCode?: string) => void; onCancel: () => void }) {
  const { item, onConfirm, onCancel } = props
  const [draft, setDraft] = useState(item.name)
  const [sugs, setSugs] = useState<FoodSuggestion[]>([])
  const [variants, setVariants] = useState<FoodSuggestion[] | null>(null)
  const [filter, setFilter] = useState('')
  const baseName = item.name.trim()
  const baseCode = item.db_food_code ?? item.db_reference?.db_food_code ?? undefined

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

  function submit(e: FormEvent) {
    e.preventDefault()
    const nm = draft.trim()
    if (nm) onConfirm(nm)
  }

  const f = compact(filter)
  const shown = (variants ?? []).filter((v) => !f || compact(v.label).includes(f) || compact(v.dbName).includes(f))

  return (
    <div className="rounded border border-gray-300 bg-gray-50 p-2">
      <form onSubmit={submit} className="flex gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="음식 이름"
          enterKeyHint="done"
          aria-label="음식 이름"
          className="min-h-11 min-w-0 flex-1 rounded border border-gray-300 px-2 text-base"
        />
        <button type="submit" disabled={!draft.trim()} className="min-h-11 rounded bg-gray-900 px-3 text-white disabled:opacity-40">
          확인
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded border border-gray-400 px-3">
          취소
        </button>
      </form>

      {sugs.length > 0 && (
        <ul className="mt-1 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {sugs.map((s, i) => (
            <li key={`${s.dbCode}-${i}`}>
              <SuggestionButton s={s} onPick={() => onConfirm(s.label, s.dbCode)} />
            </li>
          ))}
        </ul>
      )}

      {baseName && (
        <div className="mt-3">
          <p className="text-xs text-gray-600">‘{baseName}’ 세부 종류</p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="걸러 보기 (예: 양념, 순살)"
            aria-label="세부 종류 걸러 보기"
            className="mt-1 min-h-11 w-full rounded border border-gray-300 px-2 text-base"
          />
          {variants === null ? (
            <p className="mt-1 text-xs text-gray-500">불러오는 중…</p>
          ) : shown.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">맞는 종류가 없어요. 이름을 직접 쓰고 확인을 누르세요.</p>
          ) : (
            <ul className="mt-1 max-h-60 divide-y divide-gray-200 overflow-y-auto rounded border border-gray-200 bg-white">
              {shown.map((s, i) => (
                <li key={`${s.dbCode}-${i}`}>
                  <SuggestionButton s={s} onPick={() => onConfirm(s.label, s.dbCode)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function SuggestionButton({ s, onPick }: { s: FoodSuggestion; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex min-h-11 w-full items-center justify-between gap-2 px-2 text-left">
      <span className="min-w-0 break-words">
        {s.label}
        {s.kind === 'group' && <span className="ml-1 text-xs text-gray-500">대표값</span>}
        {s.mlConverted && <span className="ml-1 text-xs text-gray-500">환산</span>}
      </span>
      <span className="shrink-0 text-xs text-gray-600">{Math.round(s.kcalPer100g)}kcal/100g</span>
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
