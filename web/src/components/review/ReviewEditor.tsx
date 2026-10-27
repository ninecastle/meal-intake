// 결과 확인·수정 화면(S4) 편집기. 제어형: 바뀔 때마다 buildAnalysis로 만든 새 분석을 onChange로 올린다.
// 계산은 모두 analysis/compute.ts 함수로 한다(화면에서 공식을 다시 구현하지 않는다). 사진은 다시 분석하지 않는다.
// 규칙: 스펙 2.3절 표, CLAUDE.md "결과 수정 규칙".
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { WARN_NO_AFTER } from '../../analysis/assemble'
import {
  applyNutrition,
  buildAnalysis,
  newUserItem,
  recomputeItem,
  setBeforeGrams,
  setKcalOverride,
  setRemainingRatio,
} from '../../analysis/compute'
import { resolveNutrition } from '../../analysis/nutrition'
import type { MealIntakeAnalysis, MealItem, NutritionResult } from '../../types/analysis'
import FoodCard, { type RatioHint } from './FoodCard'

export interface ReviewEditorProps {
  analysis: MealIntakeAnalysis
  onChange: (a: MealIntakeAnalysis) => void
  /** 이름을 바꾼 뒤 영양값을 다시 찾는 중이거나 "다시 계산할까요?"를 묻는 중이면 true. 그동안 저장을 잠근다. */
  onBusyChange?: (busy: boolean) => void
  /** 수정 모드(S8)면 남긴 비율을 모르는 음식에 "직접 골라 주세요"만 보인다(사진 비교 안내 없음) */
  mode?: 'review' | 'edit'
}

const UNDO_MS = 3000
const LATER = 1_000_000

/** 이름이 바뀌면 다른 메뉴이므로 "공개 중량" 표시만 지운다(무게는 그대로, 스펙 4.5.5) */
const dropPublished = (it: MealItem) => (it.grams_source ? setBeforeGrams(it, it.before_grams) : it)

/** needs_review, AI 추정, 그릇이 안 보여 다 먹음으로 둔 항목(ratio_assumed): 먼저, 노란 테두리로 */
const isFlagged = (it: MealItem) =>
  it.needs_review || it.nutrition_source === 'ai_estimate' || it.ratio_assumed === 'not_visible'

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec
  const next = { ...rec }
  delete next[key]
  return next
}

type Ask = { id: string; name: string; dbCode?: string }
type Undo = { item: MealItem; index: number }

export default function ReviewEditor({ analysis, onChange, onBusyChange, mode = 'review' }: ReviewEditorProps) {
  // 비동기 조회가 끝났을 때 최신 분석 위에 고치도록 ref로 들고 있는다
  const latest = useRef(analysis)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    latest.current = analysis
  }, [analysis])
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const [focusKcalId, setFocusKcalId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const controllers = useRef(new Map<string, AbortController>())
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ctrls = controllers.current
    return () => {
      for (const c of ctrls.values()) c.abort()
      ctrls.clear()
      if (undoTimer.current) clearTimeout(undoTimer.current)
    }
  }, [])

  const busy = Object.keys(pending).length > 0 || ask !== null
  const onBusyChangeRef = useRef(onBusyChange)
  useLayoutEffect(() => {
    onBusyChangeRef.current = onBusyChange
  }, [onBusyChange])
  useEffect(() => {
    onBusyChangeRef.current?.(busy)
  }, [busy])

  const onKcalFocused = useCallback(() => setFocusKcalId(null), [])

  function emit(items: MealItem[]) {
    const a = latest.current
    const next = buildAnalysis(items, a.warnings, { model: a.model, prompt_version: a.prompt_version })
    latest.current = next
    onChangeRef.current(next)
  }
  const find = (id: string) => latest.current.items.find((it) => it.id === id)
  const update = (id: string, f: (it: MealItem) => MealItem) =>
    emit(latest.current.items.map((it) => (it.id === id ? f(it) : it)))

  // 이름 확정 → DB → (검색) → AI 추정. guess는 넘기지 않는다. 중량·남긴 비율·인원수는 그대로 둔다.
  async function resolveFor(id: string, name: string, dbCode?: string) {
    controllers.current.get(id)?.abort()
    const ac = new AbortController()
    controllers.current.set(id, ac)
    setPending((p) => ({ ...p, [id]: name }))
    let r: NutritionResult
    try {
      r = await resolveNutrition(name, dbCode ? { dbCode, signal: ac.signal } : { signal: ac.signal })
    } catch {
      r = { source: 'user_input', per_100g: null }
    }
    if (controllers.current.get(id) !== ac || ac.signal.aborted) return // 삭제됐거나 화면을 떠남
    controllers.current.delete(id)
    setPending((p) => omit(p, id))
    if (!find(id)) return
    update(id, (it) => dropPublished(applyNutrition({ ...it, name, user_edited: true }, r)))
    const html = r.source === 'search' ? r.searchSuggestionHtml : null
    setSuggestions((s) => (html ? { ...s, [id]: html } : omit(s, id)))
    if (r.source === 'user_input') setFocusKcalId(id)
  }

  function confirmName(id: string, name: string, dbCode?: string) {
    const it = find(id)
    if (!it) return
    setEditingId(null)
    if (name === it.name && dbCode === undefined) return
    // 직접 고친 kcal이 있으면 묻는다(공식 값을 덮어쓴 경우, 또는 직접 입력 항목에 kcal을 적어 둔 경우)
    if (it.kcal_overridden && (it.per_100g !== null || it.consumed.kcal > 0)) {
      setAsk({ id, name, dbCode })
      return
    }
    void resolveFor(id, name, dbCode)
  }

  function answer(yes: boolean) {
    const a = ask
    setAsk(null)
    if (!a || !find(a.id)) return
    if (yes) void resolveFor(a.id, a.name, a.dbCode)
    else update(a.id, (it) => dropPublished({ ...it, name: a.name, user_edited: true }))
  }

  function cancelEdit(id: string) {
    setEditingId(null)
    // 이름을 하나도 안 쓴 새 항목은 취소하면 없앤다
    const it = find(id)
    if (it && it.name === '') emit(latest.current.items.filter((x) => x.id !== id))
  }

  function remove(id: string) {
    const items = latest.current.items
    const index = items.findIndex((it) => it.id === id)
    if (index < 0) return
    controllers.current.get(id)?.abort()
    controllers.current.delete(id)
    setPending((p) => omit(p, id))
    if (editingId === id) setEditingId(null)
    if (ask?.id === id) setAsk(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ item: items[index], index })
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null
      setUndo(null)
    }, UNDO_MS)
    emit(items.filter((it) => it.id !== id))
  }

  function restore() {
    const u = undo
    if (!u) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
    setUndo(null)
    const items = [...latest.current.items]
    items.splice(Math.min(u.index, items.length), 0, u.item)
    emit(items)
  }

  function add() {
    const items = latest.current.items
    // 되돌리기 대기 중인 항목의 id와 겹치지 않게 함께 넘긴다
    const it = newUserItem(undo ? [...items, undo.item] : items)
    emit([...items, it])
    setEditingId(it.id)
  }

  // 보이는 순서는 처음 본 순간에 정하고 고정한다(고치는 중에 카드가 움직이지 않게).
  // 처음 받은 항목 중 확인 필요·AI 추정·그릇 안 보임을 먼저, 나머지와 나중에 추가한 항목은 받은 순서대로.
  const order = useRef(new Map<string, number>())
  const seq = useRef(0)
  const ord = order.current
  const initial = ord.size === 0
  for (const it of analysis.items) {
    if (!ord.has(it.id)) ord.set(it.id, (initial && isFlagged(it) ? 0 : LATER) + seq.current++)
  }
  const shown = [...analysis.items].sort((a, b) => (ord.get(a.id) ?? 0) - (ord.get(b.id) ?? 0))
  const t = analysis.totals
  // 먹은 후 분석이 있었는데 비율을 모르면 사진이 달라 보인 경우. 직접 고르기 경로(WARN_NO_AFTER)·수정 모드는 고르기만 안내.
  const ratioHint: RatioHint = mode === 'edit' || analysis.warnings.includes(WARN_NO_AFTER) ? 'manual' : 'mismatch'
  const unpicked = analysis.items.filter((it) => it.remaining_ratio === null).length

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-card bg-ink p-4 text-white">
        <p className="text-xs text-white/70">섭취 합계 (먹기 전 {Math.round(t.before_kcal)} kcal)</p>
        <p className="num text-3xl">{Math.round(t.consumed.kcal)} kcal</p>
        <p>
          탄 <span className="num text-carb">{t.consumed.carbs_g.toFixed(1)}g</span> · 단{' '}
          <span className="num text-prot">{t.consumed.protein_g.toFixed(1)}g</span> · 지{' '}
          <span className="num text-fat">{t.consumed.fat_g.toFixed(1)}g</span>
        </p>
        {unpicked > 0 && <p className="mt-1 text-xs text-butter">남긴 양을 고르면 합계가 바뀌어요({unpicked}개 남음)</p>}
      </div>

      {shown.length === 0 && <p className="text-ink-2">음식이 없어요. 아래 버튼으로 추가하세요.</p>}

      <ul className="space-y-3">
        {shown.map((it) => (
          <FoodCard
            key={it.id}
            item={it}
            flagged={isFlagged(it)}
            pendingName={pending[it.id] ?? null}
            editing={editingId === it.id}
            askName={ask?.id === it.id ? ask.name : null}
            focusKcal={focusKcalId === it.id}
            ratioHint={ratioHint}
            suggestionHtml={suggestions[it.id] ?? null}
            onStartEdit={() => setEditingId(it.id)}
            onCancelEdit={() => cancelEdit(it.id)}
            onConfirmName={(name, dbCode) => confirmName(it.id, name, dbCode)}
            onAnswerAsk={answer}
            onGrams={(g) => update(it.id, (x) => setBeforeGrams({ ...x, user_edited: true }, g))}
            onRatio={(r) => update(it.id, (x) => setRemainingRatio(x, r))}
            onEaters={(n) => update(it.id, (x) => recomputeItem({ ...x, eaters: n }))}
            onKcal={(k) => update(it.id, (x) => setKcalOverride(x, k))}
            onDelete={() => remove(it.id)}
            onKcalFocused={onKcalFocused}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={add}
        className="focus-ring min-h-11 w-full rounded-tile border-2 border-dashed border-ink-3 bg-surface text-ink"
      >
        + 음식 추가
      </button>

      {undo && (
        <div className="sticky bottom-2 flex items-center justify-between gap-2 rounded-tile bg-ink px-3 py-1 text-white shadow-[0_1px_3px_rgba(31,42,46,.12)]">
          <span className="min-w-0 truncate">‘{undo.item.name || '이름 없음'}’ 삭제함</span>
          <button type="button" onClick={restore} className="focus-ring min-h-11 shrink-0 px-2 font-semibold text-butter">
            되돌리기
          </button>
        </div>
      )}

      <p className="text-xs text-ink-2">영양 정보: 식품의약품안전처 식품영양성분 DB(2026-10-06 갱신본)</p>
    </div>
  )
}
