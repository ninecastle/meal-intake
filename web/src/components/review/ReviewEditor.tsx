// 결과 확인·수정 화면(S4) 편집기. 제어형: 바뀔 때마다 buildAnalysis로 만든 새 분석을 onChange로 올린다.
// 계산은 모두 analysis/compute.ts 함수로 한다(화면에서 공식을 다시 구현하지 않는다). 사진은 다시 분석하지 않는다.
// 규칙: 스펙 2.3절 표, CLAUDE.md "결과 수정 규칙".
// 모양(디자인 조각 D3-2, 사용자 확인 d32_4_review·d32_5_manual): 시안 .mtotal(총 kcal · 먹기 전 kcal) → .stack·.legend 탄단지 →
// notice(확인할 점, 부르는 화면이 줌) → 음식 카드 → [+ 음식 추가](.btn ghost). 식약처 출처 한 줄은 설정 약관으로 옮겼다(D10). 음식이 없으면 "어떤 음식을 먹었나요?" + 이름 찾기.
// 지운 음식 되돌리기는 시안 토스트 모양(.toast) 알약에 [되돌리기].
import { foodName } from '../../lib/foodName'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { WARN_NO_AFTER } from '../../analysis/assemble'
import {
  applyDetail,
  applyNutrition,
  buildAnalysis,
  newUserItem,
  recomputeItem,
  setBeforeGrams,
  setKcalOverride,
  setRemainingRatio,
} from '../../analysis/compute'
import { detailFor, resolveNutrition } from '../../analysis/nutrition'
import { isSoupDish, loadBroth, mergeSoupItems, splitSoupItem } from '../../analysis/nutrition/broth'
import { brandOfDbCode, pickToNutrition, type PickNutrition } from '../../analysis/nutrition/franchise'
import type { MealIntakeAnalysis, MealItem, NutritionResult } from '../../types/analysis'
import { macroPct } from '../mealText'
import { askConfirm } from '../ui'
import FoodCard, { FoodSearch, type RatioHint } from './FoodCard'
import { menuRef, menusOf, servingGrams, withUnits, type MenuPick } from './franchiseUi'

export interface ReviewEditorProps {
  analysis: MealIntakeAnalysis
  onChange: (a: MealIntakeAnalysis) => void
  /** 이름을 바꾼 뒤 영양값을 다시 찾는 중이거나 "다시 계산할까요?"를 묻는 중이면 true. 그동안 저장을 잠근다. */
  onBusyChange?: (busy: boolean) => void
  /** 수정 모드(S8)면 남긴 비율을 모르는 음식에 "직접 골라 주세요"만 보인다(사진 비교 안내 없음) */
  mode?: 'review' | 'edit'
  /** 합계와 음식 카드 사이에 둘 안내(확인할 점) */
  notice?: ReactNode
  /** 설정 "같이 먹은 사람 고르기"(기본 꺼짐, 2026-10-27 사용자가 고른 변경) */
  showEaters?: boolean
  /** 총 kcal 아래 작은 참고 줄(D13 "학교 기준 1인분 ○○kcal", 양 보정 없음) */
  refLine?: string | null
}

const UNDO_MS = 3000

/** 나뉜 두 항목을 다시 합칠 수 있는지(칼로리를 직접 고쳤거나 영양값이 없으면 broth가 합치지 않으므로 [하나로 보기]를 숨긴다) */
function canMerge(items: MealItem[], soupOf: string): boolean {
  const pair = items.filter((x) => x.soup_of === soupOf)
  return pair.length === 2 && mergeSoupItems(pair[0], pair[1]) !== null
}
const LATER = 1_000_000

/** 이름이 바뀌면 다른 메뉴이므로 "공개 중량" 표시만 지운다(무게는 그대로, 스펙 4.5.5) */
const dropPublished = (it: MealItem) => (it.grams_source ? setBeforeGrams(it, it.before_grams) : it)

/** 이름을 직접 바꿔 다른 음식이 되면 고른 메뉴·브랜드 표시를 지운다(사용자가 이름을 골랐으니 [메뉴 고르기] 줄도 닫는다) */
function clearFranchise(it: MealItem): MealItem {
  if (!it.menu_pick && !it.franchise_ref && !it.unit && !it.franchise && !it.brand) return it
  const next: MealItem = { ...it, franchise: false, brand: null }
  delete next.menu_pick
  delete next.franchise_ref
  delete next.unit
  return next
}

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

export default function ReviewEditor({ analysis, onChange, onBusyChange, mode = 'review', notice, showEaters = false, refLine = null }: ReviewEditorProps) {
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
  // 이 화면에서 무게를 직접 고친 음식(프랜차이즈 메뉴를 고르면 1개 중량으로 덮어쓰기 전에 묻는다)
  const gramsEdited = useRef(new Set<string>())
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

  // 국물 요리 나누기(2026-10-29 사용자 결정): 요리별 국물 비율 표를 미리 불러 둔다(다 불러오면 [국물 따로 보기]가 보인다)
  const [brothReady, setBrothReady] = useState(false)
  useEffect(() => {
    let alive = true
    loadBroth()
      .then(() => alive && setBrothReady(true))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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
  // 세부 영양소(D4): applyNutrition이 예전 음식의 값을 지우고, 새 이름이 DB에 있으면 그 행의 식약처 값을 넣는다
  // (새 이름에는 먹기 전 분석의 추정이 없으므로 DB에 없는 키는 "–").
  async function resolveFor(id: string, name: string, dbCode?: string, fresh = false) {
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
    const detail = r.source === 'db' ? await detailFor(r.db_food_code).catch(() => null) : null
    // 직접 입력한 새 음식(프랜차이즈가 아닌 음식)은 보통 1인분 무게로 "1인분 · ○○g"을 미리 채운다(2026-10-29 사용자 결정, 표시 없음).
    // DB 음식: 1개 중량(w) → 대표식품명별 1인분 표(servingOf). DB에 없는 음식: 호출 D가 함께 준 serving_g. 못 정하면 무게 그대로(100g)
    const serving = !fresh
      ? null
      : r.source === 'db'
        ? await servingGrams(r.db_food_code)
        : r.source === 'ai_estimate' && r.via === 'call_d'
          ? (r.serving_g ?? null)
          : null
    if (controllers.current.get(id) !== ac || ac.signal.aborted) return // 삭제됐거나 화면을 떠남
    controllers.current.delete(id)
    setPending((p) => omit(p, id))
    if (!find(id)) return
    update(id, (it) => {
      const next = dropPublished(applyDetail(applyNutrition(clearFranchise({ ...it, name, user_edited: true }), r), detail, null))
      return serving && !gramsEdited.current.has(id) ? withUnits(next, serving, 1, '인분') : next
    })
    const html = r.source === 'search' ? r.searchSuggestionHtml : null
    setSuggestions((s) => (html ? { ...s, [id]: html } : omit(s, id)))
    if (r.source === 'user_input') setFocusKcalId(id)
    // 국물 요리는 자동으로 면·건더기/국물 두 카드로(2026-10-29 사용자 결정, 나눌 수 없으면 한 카드 그대로)
    else if (isSoupDish(name)) void splitSoup(id)
  }

  async function confirmName(id: string, name: string, dbCode?: string) {
    const it = find(id)
    if (!it) return
    setEditingId(null)
    if (name === it.name && dbCode === undefined) return
    const fresh = it.name === '' && !gramsEdited.current.has(id)
    // 브랜드 이름표가 붙은 DB 메뉴는 그 브랜드 메뉴로 고른 것과 같다(1개 중량 → 공개 중량)
    if (dbCode) {
      const b = await brandOfDbCode(dbCode).catch(() => null)
      if (b) {
        const m = (await menusOf(b).catch(() => [])).find((r) => r.pick.dbCode === dbCode)
        if (m) return applyPick(id, m.pick)
      }
      if (!find(id)) return
    }
    // 직접 고친 kcal이 있으면 묻는다(공식 값을 덮어쓴 경우, 또는 직접 입력 항목에 kcal을 적어 둔 경우)
    if (it.kcal_overridden && (it.per_100g !== null || it.consumed.kcal > 0)) {
      setAsk({ id, name, dbCode })
      return
    }
    void resolveFor(id, name, dbCode, fresh)
  }

  /** 프랜차이즈 메뉴를 골랐다: 공식 값으로 다시 계산하고, 1개 중량이 있으면 무게 = 1개 중량 × 개수("공개 중량").
   *  무게를 직접 고쳐 둔 카드는 덮어쓰기 전에 묻는다. 1개 중량이 없으면 무게는 그대로(이름 바꾸기 규칙) */
  async function applyPick(id: string, pick: MenuPick) {
    const it = find(id)
    if (!it) return
    setEditingId(null)
    if (it.kcal_overridden && (it.per_100g !== null || it.consumed.kcal > 0)) {
      const again = await askConfirm({
        title: '다시 계산할까요?',
        body: `칼로리를 직접 고친 음식이에요. ‘${pick.name}’ 기준으로 다시 계산해요.`,
        ok: '다시 계산',
        cancel: '이름만',
      })
      if (!again) {
        update(id, (x) => dropPublished({ ...x, name: pick.name, user_edited: true, brand: pick.brand, franchise: true, unit: pick.unit, menu_pick: menuRef(pick) }))
        return
      }
    }
    controllers.current.get(id)?.abort()
    const ac = new AbortController()
    controllers.current.set(id, ac)
    setPending((p) => ({ ...p, [id]: pick.name }))
    let r: PickNutrition
    try {
      r = await pickToNutrition(pick)
    } catch {
      r = { source: 'user_input', per_100g: null, parts: { kcal: 'missing', carbs_g: 'missing', protein_g: 'missing', fat_g: 'missing' } }
    }
    // 세부 영양소: DB → 보충표 → 없음(applyDetail 순서)
    const detail = r.dbCode && r.source !== 'ai_estimate' ? await detailFor(r.dbCode).catch(() => null) : null
    if (controllers.current.get(id) !== ac || ac.signal.aborted) return
    controllers.current.delete(id)
    setPending((p) => omit(p, id))
    const cur = find(id)
    if (!cur) return
    // 1개 중량: DB → 보충표(pickToNutrition이 정함). 1단위 값만 있고 중량을 모르면(nominal) per_100g이 곧 1단위 값이라
    // 무게를 1단위 = 100g으로 맞춰야 칼로리가 맞는다(묻지 않고, 화면은 무게를 숨기고 개수만)
    const nominal = r.unitWeight_source === 'nominal'
    const unitG = r.unitWeight_g && r.unitWeight_g > 0 ? r.unitWeight_g : null
    let useUnit = unitG !== null
    if (unitG !== null && !nominal && gramsEdited.current.has(id) && cur.before_grams > 0) {
      useUnit = await askConfirm({
        title: `공개 중량 ${Math.round(unitG)}g으로 바꿀까요?`,
        body: `직접 고친 무게 ${Math.round(cur.before_grams)}g 대신 1${pick.unit} 무게를 써요.`,
        ok: '바꾸기',
        cancel: '지금 무게 그대로',
      })
      if (!find(id)) return
    }
    if (useUnit) gramsEdited.current.delete(id)
    update(id, (x) => {
      const base = applyDetail(applyNutrition({ ...x, name: pick.name, user_edited: true }, r), detail, null, r.official_detail ?? null)
      const next: MealItem = { ...base, brand: pick.brand, franchise: true, unit: pick.unit, menu_pick: menuRef(pick) }
      delete next.franchise_ref
      if (!useUnit || unitG === null) return dropPublished(next)
      const count = x.grams_source === 'published' && x.unit_count && x.unit === pick.unit ? x.unit_count : 1
      return withUnits(next, unitG, count, pick.unit)
    })
    if (r.source === 'user_input') setFocusKcalId(id)
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

  /** [국물 따로 보기]: 국물 요리 한 카드를 "○○ 면·건더기"/"○○ 국물" 두 카드로(같은 자리, 무게·남긴 양은 broth가 나눈다) */
  async function splitSoup(id: string) {
    const it = find(id)
    if (!it || pending[id] !== undefined) return
    setPending((p) => ({ ...p, [id]: it.name }))
    const pair = await splitSoupItem(it).catch(() => null)
    setPending((p) => omit(p, id))
    if (!pair || !find(id)) return
    const base = order.current.get(id) ?? 0
    order.current.set(pair[0].id, base)
    order.current.set(pair[1].id, base + 0.5)
    emit(latest.current.items.flatMap((x) => (x.id === id ? pair : [x])))
  }

  /** [하나로 보기]: 나뉜 두 카드를 다시 한 카드로. 남긴 양이 다르면 먼저 묻는다 */
  async function mergeSoup(id: string) {
    const a = find(id)
    if (!a?.soup_of) return
    const pair = latest.current.items.filter((x) => x.soup_of === a.soup_of)
    if (pair.length !== 2) return
    const [x, y] = pair
    if (x.remaining_ratio !== y.remaining_ratio) {
      const ok = await askConfirm({
        title: '하나로 합칠까요?',
        body: '면·건더기와 국물의 남긴 양이 달라요. 합치면 먹은 양 기준으로 다시 계산돼요.',
        ok: '하나로 보기',
        cancel: '취소',
      })
      if (!ok || !find(x.id) || !find(y.id)) return
    }
    const merged = mergeSoupItems(find(x.id)!, find(y.id)!)
    if (!merged) return
    order.current.set(merged.id, order.current.get(x.id) ?? 0)
    emit(latest.current.items.flatMap((it) => (it.id === x.id ? [merged] : it.id === y.id ? [] : [it])))
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

  /** 음식이 없을 때 이름 찾기에서 고른 이름으로 바로 새 항목을 만든다(직접 입력) */
  function addNamed(name: string, dbCode?: string) {
    const items = latest.current.items
    const it = newUserItem(undo ? [...items, undo.item] : items)
    emit([...items, it])
    void confirmName(it.id, name, dbCode)
  }

  function addPicked(pick: MenuPick) {
    const items = latest.current.items
    const it = newUserItem(undo ? [...items, undo.item] : items)
    emit([...items, it])
    void applyPick(it.id, pick)
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

  const pct = macroPct(t.consumed.carbs_g, t.consumed.protein_g, t.consumed.fat_g)

  return (
    <>
      {shown.length > 0 && (
        <>
          <div className="mtotal" style={{ marginTop: 22 }}>
            <span>
              {'총 '}
              <span className="num">{`${Math.round(t.consumed.kcal)}kcal`}</span>
            </span>
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              {'먹기 전 '}
              <span className="num">{`${Math.round(t.before_kcal)}kcal`}</span>
            </span>
          </div>
          {refLine && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>{refLine}</p>}
          <div className="stack">
            <div style={{ flex: pct.c, background: 'var(--carb)' }} className="num">{`${pct.c}%`}</div>
            <div style={{ flex: pct.p, background: 'var(--prot)' }} className="num">{`${pct.p}%`}</div>
            <div style={{ flex: pct.f, background: 'var(--fat)' }} className="num">{`${pct.f}%`}</div>
          </div>
          <div className="legend">
            <span>
              <i className="dot" style={{ background: 'var(--carb)' }}></i>
              {'탄수화물 '}
              <b className="num">{`${t.consumed.carbs_g.toFixed(1)}g`}</b>
            </span>
            <span>
              <i className="dot" style={{ background: 'var(--prot)' }}></i>
              {'단백질 '}
              <b className="num">{`${t.consumed.protein_g.toFixed(1)}g`}</b>
            </span>
            <span>
              <i className="dot" style={{ background: 'var(--fat)' }}></i>
              {'지방 '}
              <b className="num">{`${t.consumed.fat_g.toFixed(1)}g`}</b>
            </span>
          </div>
        </>
      )}

      {notice}

      {shown.length === 0 ? (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontFamily: 'var(--f-head)', fontSize: 16 }}>어떤 음식을 먹었나요?</div>
          <FoodSearch initial="" onConfirm={addNamed} onPickMenu={addPicked} autoFocus={false} verb="추가" />
        </div>
      ) : (
        <>
          <ul style={{ display: 'grid', gap: 12, margin: '16px 0 0', padding: 0 }}>
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
                showEaters={showEaters}
                onStartEdit={() => setEditingId(it.id)}
                onCancelEdit={() => cancelEdit(it.id)}
                onConfirmName={(name, dbCode) => void confirmName(it.id, name, dbCode)}
                onPickMenu={(pick) => void applyPick(it.id, pick)}
                onCount={(n) =>
                  update(it.id, (x) => (x.published_g ? withUnits({ ...x, user_edited: true }, x.published_g, n) : x))
                }
                onAnswerAsk={answer}
                onGrams={(g) => {
                  gramsEdited.current.add(it.id)
                  update(it.id, (x) => setBeforeGrams({ ...x, user_edited: true }, g))
                }}
                onRatio={(r) => update(it.id, (x) => setRemainingRatio(x, r))}
                onEaters={(n) => update(it.id, (x) => recomputeItem({ ...x, eaters: n }))}
                onKcal={(k) => update(it.id, (x) => setKcalOverride(x, k))}
                onDelete={() => remove(it.id)}
                onKcalFocused={onKcalFocused}
                soupAction={
                  it.soup_of
                    ? canMerge(analysis.items, it.soup_of)
                      ? 'merge'
                      : null
                    : brothReady && it.name !== '' && isSoupDish(it.name)
                      ? 'split'
                      : null
                }
                onSoup={() => void (it.soup_of ? mergeSoup(it.id) : splitSoup(it.id))}
              />
            ))}
          </ul>
          <button type="button" className="btn ghost" onClick={add} style={{ width: '100%', marginTop: 14 }}>
            + 음식 추가
          </button>
        </>
      )}

      {undo && (
        <div className="toast" role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100% - 40px)' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ‘{foodName(undo.item.name) || '이름 없음'}’ 지웠어요
          </span>
          <button type="button" onClick={restore} style={{ flex: 'none', padding: 0, minHeight: 32, color: 'var(--butter)' }}>
            되돌리기
          </button>
        </div>
      )}
    </>
  )
}
