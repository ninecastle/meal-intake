// 섭취량 계산 순수 함수(스펙 4.3·4.6절). 프런트 결과 수정 화면도 이 함수만 쓴다.
// 공식(CLAUDE.md): 섭취량 = 100g당 값 × 중량 ÷ 100 × (1 − 남긴 비율) ÷ 같이 먹은 인원수
// 계산은 원래 정밀도로 하고, 저장용 결과를 만드는 buildAnalysis(와 computeTotals)에서만 소수 첫째 자리로 반올림한다.
// 세부 영양소(D4-a, D4-c부터 9가지)도 같은 공식이다. mg 키(콜레스테롤·나트륨·칼륨)만 정수로 반올림한다.
import type {
  DbReference,
  DetailKey,
  DetailNutrients,
  DetailSource,
  MealIntakeAnalysis,
  MealItem,
  Nutrients,
  NutritionResult,
} from '../types/analysis.ts'

export const NUTRIENT_KEYS = ['kcal', 'carbs_g', 'protein_g', 'fat_g'] as const
export const LOW_CONFIDENCE = 0.6
export const MAX_EATERS = 20
/** 사용자가 추가한 음식의 중량 기본값(g) */
export const DEFAULT_USER_GRAMS = 100
/** 세부 영양소 키(D4-c 9가지). 화면 순서(시안 표): 당류·식이섬유·포화지방·트랜스지방·다불포화지방·단일불포화지방·콜레스테롤·나트륨·칼륨 */
export const DETAIL_KEYS: readonly DetailKey[] = [
  'sugar_g',
  'fiber_g',
  'satfat_g',
  'transfat_g',
  'polyunsat_g',
  'monounsat_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
]
/** 세부 영양소 100g당 상한(검사 범위 0~상한): g 키는 100g, 콜레스테롤 5000mg, 나트륨 40000mg, 칼륨 10000mg */
export const DETAIL_MAX_PER_100G: Readonly<Record<DetailKey, number>> = {
  sugar_g: 100,
  fiber_g: 100,
  satfat_g: 100,
  transfat_g: 100,
  polyunsat_g: 100,
  monounsat_g: 100,
  cholesterol_mg: 5000,
  sodium_mg: 40000,
  potassium_mg: 10000,
}

const zero = (): Nutrients => ({ kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 })
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** 소수 첫째 자리 반올림(-0은 0으로) */
export function round1(v: number): number {
  const r = Math.round(num(v, 0) * 10) / 10
  return r === 0 ? 0 : r
}

/** 세부 영양소 저장 반올림: g 키는 소수 첫째 자리, mg 키(콜레스테롤·나트륨·칼륨)는 정수(-0은 0으로) */
export function roundDetail(k: DetailKey, v: number): number {
  if (!k.endsWith('_mg')) return round1(v)
  const r = Math.round(num(v, 0))
  return r === 0 ? 0 : r
}

const isDetailSource = (v: unknown): v is DetailSource => v === 'db' || v === 'ai_estimate'
const detailOk = (k: DetailKey, v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= DETAIL_MAX_PER_100G[k]

/** 세부 영양소 100g당 값과 출처를 짝 맞춘다: 허용 키 중 값이 0~상한이고 출처(db·ai_estimate)가 있는 키만. 하나도 없으면 null */
function pairedDetail(item: MealItem): { per: DetailNutrients; src: Partial<Record<DetailKey, DetailSource>> } | null {
  const per: DetailNutrients = {}
  const src: Partial<Record<DetailKey, DetailSource>> = {}
  for (const k of DETAIL_KEYS) {
    const v = item.detail_per_100g?.[k]
    const from = item.detail_source?.[k]
    if (!detailOk(k, v) || !isDetailSource(from)) continue
    per[k] = v
    src[k] = from
  }
  return Object.keys(per).length > 0 ? { per, src } : null
}

/** 100g당 세부 값 × 섭취 중량 ÷ 100(반올림 없음, round를 주면 키마다 반올림) */
function detailConsumed(per: DetailNutrients, grams: number, round = false): DetailNutrients {
  const c: DetailNutrients = {}
  for (const k of DETAIL_KEYS) {
    const v = per[k]
    if (v === undefined) continue
    const x = (v * grams) / 100
    c[k] = round ? roundDetail(k, x) : x
  }
  return c
}

function roundNutrients(n: Nutrients): Nutrients {
  return { kcal: round1(n.kcal), carbs_g: round1(n.carbs_g), protein_g: round1(n.protein_g), fat_g: round1(n.fat_g) }
}

const normEaters = (v: unknown): number => clamp(Math.round(num(v, 1)), 1, MAX_EATERS)
const normRatio = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : null

/** 4.6절 공식으로 consumed_grams·consumed·detail_consumed·needs_review를 다시 계산한다.
 *  남긴 비율 null은 0(다 먹음)으로 계산하고 needs_review=true. kcal_overridden이면 consumed.kcal을 유지한다(세부 영양소는 상관없다).
 *  세부 영양소는 100g당 값·출처가 짝이 맞는 키만 남기고, 하나도 없으면 세 필드를 지운다.
 *  per_100g=null(직접 입력)은 kcal_overridden=true로 보고 탄·단·지는 0. 인원수는 1~20 정수, 비율은 0~1로 맞춘다. */
export function recomputeItem(item: MealItem): MealItem {
  const eaters = normEaters(item.eaters)
  const before_grams = Math.max(0, num(item.before_grams, 0))
  const remaining_ratio = normRatio(item.remaining_ratio)
  const confidence = clamp(num(item.confidence, 0), 0, 1)
  const consumed_grams = (before_grams * (1 - (remaining_ratio ?? 0))) / eaters
  const p = item.per_100g
  const consumed = zero()
  if (p) for (const k of NUTRIENT_KEYS) consumed[k] = (Math.max(0, num(p[k], 0)) * consumed_grams) / 100
  const kcal_overridden = p === null || item.kcal_overridden === true
  if (kcal_overridden) consumed.kcal = Math.max(0, num(item.consumed?.kcal, 0))
  const out: MealItem = {
    ...item,
    eaters,
    before_grams,
    remaining_ratio,
    confidence,
    consumed_grams,
    consumed,
    kcal_overridden,
    needs_review: confidence < LOW_CONFIDENCE || remaining_ratio === null,
  }
  // D4-a 세부 영양소: 탄단지와 같은 공식·같은 섭취 중량(남긴 비율 null은 0)
  const d = pairedDetail(item)
  if (d) {
    out.detail_per_100g = d.per
    out.detail_source = d.src
    out.detail_consumed = detailConsumed(d.per, consumed_grams)
  } else {
    delete out.detail_per_100g
    delete out.detail_source
    delete out.detail_consumed
  }
  // b3: 그릇이 안 보여 0으로 둔 표시(ratio_assumed)는 남긴 비율이 0일 때만 남긴다(setRemainingRatio를 거치지 않고 비율이 바뀐 경우 대비)
  if ('ratio_assumed' in out && !(out.ratio_assumed === 'not_visible' && remaining_ratio === 0)) delete out.ratio_assumed
  return out
}

function copyReference(r: DbReference): DbReference {
  return {
    db_food_code: r.db_food_code,
    db_name: r.db_name,
    db_match: r.db_match,
    kcal_per_100g: r.kcal_per_100g,
    ...(r.ml_converted === true ? { ml_converted: true } : {}),
  }
}

/** 출처에 딸린 필드를 모두 비운다(출처가 바뀌면 이전 출처의 필드를 남기지 않는다).
 *  세부 영양소(detail_*)도 이전 음식의 값이라 지운다. 새 음식의 세부 값은 applyDetail로 넣는다. */
function clearSourceFields(item: MealItem): MealItem {
  const next: MealItem = { ...item, db_food_code: null }
  delete next.db_name
  delete next.db_match
  delete next.db_ml_converted
  delete next.db_reference
  delete next.per_100g_fill
  delete next.detail_per_100g
  delete next.detail_source
  delete next.detail_consumed
  return next
}

/** resolveNutrition 결과로 영양값·출처를 바꾸고 다시 계산한다. kcal_overridden=false(user_input이면 true).
 *  db: db_food_code·db_name·db_match·per_100g_fill(missing인 영양소는 0)·db_ml_converted
 *  ai_estimate: reference가 있을 때만 db_reference. search: 출처 필드 없음.
 *  user_input: per_100g=null, consumed.kcal은 지금 값을 초안으로 남기고 사용자가 고친다. */
export function applyNutrition(item: MealItem, r: NutritionResult): MealItem {
  const next = clearSourceFields(item)
  next.nutrition_source = r.source
  switch (r.source) {
    case 'db': {
      const per: Nutrients = { ...r.per_100g }
      const fill: NonNullable<MealItem['per_100g_fill']> = {}
      for (const k of ['carbs_g', 'fat_g'] as const) {
        const f = r.fill?.[k]
        if (f !== 'ai_estimate' && f !== 'missing') continue
        fill[k] = f
        if (f === 'missing') per[k] = 0
      }
      next.per_100g = per
      next.db_food_code = r.db_food_code
      next.db_name = r.db_name
      next.db_match = r.db_match
      if (Object.keys(fill).length > 0) next.per_100g_fill = fill
      if (r.ml_converted === true) next.db_ml_converted = true
      next.kcal_overridden = false
      break
    }
    case 'search':
      next.per_100g = { ...r.per_100g }
      next.kcal_overridden = false
      break
    case 'ai_estimate':
      next.per_100g = { ...r.per_100g }
      if (r.reference) next.db_reference = copyReference(r.reference)
      next.kcal_overridden = false
      break
    case 'user_input':
      next.per_100g = null
      next.kcal_overridden = true
      break
  }
  return recomputeItem(next)
}

/** 세부 영양소를 넣고 다시 계산한다(D4-a). 영양소마다 식약처 DB 값(db) → 없으면 호출 A의 100g당 추정(guess, ai_estimate)
 *  → 없으면 그 키를 뺀다. 범위(0~상한)를 벗어난 값은 없는 값으로 본다. 둘 다 없으면 세부 필드를 모두 지운다.
 *  applyNutrition이 세부 필드를 지우므로 그 뒤에 부른다. */
export function applyDetail(item: MealItem, db: DetailNutrients | null | undefined, guess?: DetailNutrients | null): MealItem {
  const per: DetailNutrients = {}
  const src: Partial<Record<DetailKey, DetailSource>> = {}
  for (const k of DETAIL_KEYS) {
    const a = db?.[k]
    const b = guess?.[k]
    if (detailOk(k, a)) {
      per[k] = a
      src[k] = 'db'
    } else if (detailOk(k, b)) {
      per[k] = b
      src[k] = 'ai_estimate'
    }
  }
  return recomputeItem({ ...item, detail_per_100g: per, detail_source: src })
}

/** 먹기 전 무게를 사용자 값으로 바꾼다. 공개 중량 표시(grams_source·published_g·unit_count, 4.5.5)를 지우고 다시 계산한다 */
export function setBeforeGrams(item: MealItem, g: number): MealItem {
  const next: MealItem = { ...item, before_grams: Math.max(0, num(g, 0)) }
  delete next.grams_source
  delete next.published_g
  delete next.unit_count
  return recomputeItem(next)
}

/** 사용자가 남긴 비율을 골랐다: 값을 넣고 "그릇이 안 보여 다 먹음으로 둠" 표시(ratio_assumed)를 지운 뒤 다시 계산한다. */
export function setRemainingRatio(item: MealItem, r: number): MealItem {
  const next: MealItem = { ...item, remaining_ratio: r, user_edited: true }
  delete next.ratio_assumed
  return recomputeItem(next)
}

/** 숫자면 칼로리 직접 입력(kcal_overridden=true), null이면 해제 후 공식대로 다시 계산.
 *  per_100g=null(직접 입력 출처)은 해제할 수 없어 그대로 둔다. */
export function setKcalOverride(item: MealItem, kcal: number | null): MealItem {
  if (kcal === null) {
    if (item.per_100g === null) return recomputeItem(item)
    return recomputeItem({ ...item, kcal_overridden: false })
  }
  return recomputeItem({ ...item, kcal_overridden: true, consumed: { ...item.consumed, kcal: Math.max(0, num(kcal, 0)) } })
}

/** 사용자 추가 항목 초안: id uN(기존 u 번호의 최댓값 + 1), 이름 "", 100g, 비율 0, 인원 1, confidence 1, user_input */
export function newUserItem(existing: MealItem[]): MealItem {
  let max = 0
  for (const it of existing) {
    const m = /^u(\d+)$/.exec(it.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return recomputeItem({
    id: `u${max + 1}`,
    name: '',
    db_food_code: null,
    eaters: 1,
    before_grams: DEFAULT_USER_GRAMS,
    remaining_ratio: 0,
    consumed_grams: 0,
    per_100g: null,
    nutrition_source: 'user_input',
    consumed: zero(),
    kcal_overridden: true,
    confidence: 1,
    needs_review: false,
  })
}

/** 합계: 반올림 전 항목 값을 더한 뒤 반올림한다. before_kcal은 인원수로 나누지 않는다.
 *  detail(D4-a): 영양소마다 값이 있는 음식만 더한 합과 그 음식 수. 값 있는 음식이 0개인 키는 빼고, 하나도 없으면 필드를 뺀다. */
export function computeTotals(items: MealItem[]): MealIntakeAnalysis['totals'] {
  let before = 0
  const sum = zero()
  const detail: NonNullable<MealIntakeAnalysis['totals']['detail']> = {}
  for (const it of items) {
    before += (Math.max(0, num(it.before_grams, 0)) * Math.max(0, num(it.per_100g?.kcal, 0))) / 100
    for (const k of NUTRIENT_KEYS) sum[k] += Math.max(0, num(it.consumed?.[k], 0))
    for (const k of DETAIL_KEYS) {
      const v = it.detail_consumed?.[k]
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue
      const t = (detail[k] ??= { value: 0, count: 0 })
      t.value += v
      t.count++
    }
  }
  const out: MealIntakeAnalysis['totals'] = { before_kcal: round1(before), consumed: roundNutrients(sum) }
  for (const k of DETAIL_KEYS) {
    const t = detail[k]
    if (t) t.value = roundDetail(k, t.value)
  }
  if (Object.keys(detail).length > 0) out.detail = detail
  return out
}

/** 공개 중량 표시 세 필드(4.5.5). 함께 있고 before_grams ≈ published_g × unit_count(±1g)일 때만 남긴다 */
function publishedFields(it: MealItem): Pick<MealItem, 'grams_source' | 'published_g' | 'unit_count'> {
  const w = it.published_g
  const n = it.unit_count
  if (it.grams_source !== 'published' || typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return {}
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10) return {}
  if (Math.abs(num(it.before_grams, 0) - w * n) > 1) return {}
  return { grams_source: 'published', published_g: w, unit_count: n }
}

/** 저장용 세부 영양소 세 필드(D4-a): 허용 키만, 100g당 값·출처가 짝이 맞는 키만, 먹은 양은 반올림. 값이 없으면 필드를 뺀다 */
function storedDetail(it: MealItem): Pick<MealItem, 'detail_per_100g' | 'detail_source' | 'detail_consumed'> {
  const d = pairedDetail(it)
  if (!d) return {}
  return { detail_per_100g: d.per, detail_source: d.src, detail_consumed: detailConsumed(d.per, Math.max(0, num(it.consumed_grams, 0)), true) }
}

/** 저장용 항목: 스키마에 있는 키만, 출처에 맞는 필드만, undefined 없이(Firestore가 undefined를 거부한다). */
function toStoredItem(it: MealItem): MealItem {
  const src = it.nutrition_source
  const fill = src === 'db' && it.per_100g_fill && Object.keys(it.per_100g_fill).length > 0 ? { ...it.per_100g_fill } : null
  return {
    id: it.id,
    name: it.name,
    ...(typeof it.location === 'string' ? { location: it.location } : {}),
    db_food_code: src === 'db' ? it.db_food_code : null,
    ...(src === 'db' && typeof it.db_name === 'string' ? { db_name: it.db_name } : {}),
    ...(src === 'db' && it.db_match ? { db_match: it.db_match } : {}),
    ...(src === 'db' && it.db_ml_converted === true ? { db_ml_converted: true } : {}),
    ...(src === 'ai_estimate' && it.db_reference ? { db_reference: copyReference(it.db_reference) } : {}),
    eaters: it.eaters,
    before_grams: round1(it.before_grams),
    ...publishedFields(it),
    remaining_ratio: it.remaining_ratio,
    ...(it.ratio_assumed === 'not_visible' && it.remaining_ratio === 0 ? { ratio_assumed: 'not_visible' as const } : {}),
    consumed_grams: round1(it.consumed_grams),
    per_100g: it.per_100g ? { ...it.per_100g } : null,
    ...(fill ? { per_100g_fill: fill } : {}),
    nutrition_source: src,
    consumed: roundNutrients(it.consumed),
    kcal_overridden: it.kcal_overridden,
    confidence: it.confidence,
    needs_review: it.needs_review,
    ...(typeof it.user_edited === 'boolean' ? { user_edited: it.user_edited } : {}),
    ...storedDetail(it),
  }
}

/** 저장용 v2 결과: 항목마다 다시 계산 → 합계(반올림 전 값의 합) → 반올림. 경고는 중복을 뺀다. */
export function buildAnalysis(
  items: MealItem[],
  warnings: string[],
  meta?: { model?: string; prompt_version?: string },
): MealIntakeAnalysis {
  const computed = items.map(recomputeItem)
  const out: MealIntakeAnalysis = {
    items: computed.map(toStoredItem),
    totals: computeTotals(computed),
    warnings: [...new Set(warnings.filter((w) => typeof w === 'string' && w.trim() !== ''))],
  }
  if (meta?.model) out.model = meta.model
  if (meta?.prompt_version) out.prompt_version = meta.prompt_version
  return out
}
