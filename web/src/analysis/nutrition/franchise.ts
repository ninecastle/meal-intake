// 프랜차이즈 보충표(2026-10-29 사용자 결정, CLAUDE.md "프랜차이즈 보충표" bullet). 리더가 정한 계약 — 이름·시그니처를 바꾸지 않는다.
// 데이터: web/public/data/franchise-<YYYYMMDD>.json(공식 홈페이지 영양정보, 행마다 출처·확인 날짜). 처음 쓸 때 받는다(식약처 DB JSON처럼).
// 값마다 찾는 순서(사용자 결정):
//   칼로리(1개) — DB에 100g당 kcal과 1개 중량이 둘 다 있으면 DB(곱해서) → 아니면 보충표 공식 kcal → 아니면 AI 추정
//   영양소별 — DB 값 → 보충표 → AI 추정(탄·지는 대부분 브랜드가 공개하지 않아 DB·AI로 채워진다)
//   1개 중량 — DB 중량 → 보충표 → 사진 AI 추정(통째로 보일 때만 중량 × 개수 = "공개 중량")
// 구현은 vision-ai-engineer가 채운다. 아래 선언은 화면(frontend-dev)이 동시에 쓰는 계약이다.

/** 브랜드 id: mcdonalds, burgerking, starbucks, ediya, dominos, kyochon (+ 추가로 모은 브랜드) */
export type BrandId = string

export interface FranchiseBrand {
  id: BrandId
  /** 화면 이름, 예: "맥도날드" */
  name: string
  /** 사진·검색 매칭용 다른 이름(영문·줄임) */
  aliases: string[]
}

/** 단위: 버거 1개, 치킨 1마리, 피자 1판·1조각, 음료 1잔(사이즈별), 세트 1인분 */
export type FranchiseUnit = '개' | '마리' | '판' | '조각' | '잔' | '인분'

/** 100g당이 아니라 "1단위당" 공식 값(있는 것만). 교촌처럼 100g당만 공개하면 per100에 둔다 */
export interface FranchiseNutrients {
  kcal?: number
  carbs_g?: number
  protein_g?: number
  fat_g?: number
  sugar_g?: number
  sodium_mg?: number
  sat_fat_g?: number
}

export interface FranchiseMenu {
  /** 보충표 안에서 고유한 id */
  id: string
  brand: BrandId
  /** 화면 이름(브랜드 이름은 빼고), 예: "빅맥", "카페 라떼 (Tall)" */
  name: string
  aliases?: string[]
  unit: FranchiseUnit
  /** 사이즈·도우 등(있으면), 예: "Tall", "L · 오리지널 도우" */
  size?: string
  /** 1단위 공식 중량(g, ml은 1ml=1g). 공식 페이지에 없으면 없음 */
  unitWeight_g?: number
  /** 1단위당 공식 값 */
  perUnit?: FranchiseNutrients
  /** 100g당 공식 값(공식이 100g당으로만 줄 때) */
  per100?: FranchiseNutrients
  /** 같은 메뉴가 식약처 DB에도 있으면 그 행 코드(빈 칸 채우기·브랜드 이름표) */
  dbCode?: string
  /** 분류: burger·chicken·pizza·side·drink·dessert·set·etc */
  category: string
  sourceUrl: string
  /** 확인 날짜 YYYY-MM-DD */
  checkedAt: string
}

export interface FranchiseTable {
  version: string
  brands: FranchiseBrand[]
  menus: FranchiseMenu[]
  /** 식약처 DB 행 코드 → 브랜드(보충표에 행이 없어도 DB 메뉴에 브랜드 이름표를 붙인다) */
  dbBrand: Record<string, BrandId>
}

/** 화면이 쓰는 해석 결과: 메뉴 하나를 단위 기준으로 */
export interface MenuPick {
  brand: BrandId
  brandName: string
  /** 화면 이름(정리됨), 예: "불고기 버거" */
  name: string
  unit: FranchiseUnit
  /** 1단위 중량(g). DB 중량 → 보충표 순서로 정한 것, 둘 다 없으면 없음 */
  unitWeight_g?: number
  /** 연결된 출처: 보충표 메뉴 id 그리고/또는 DB 행 코드 */
  menuId?: string
  dbCode?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 구현(vision-ai-engineer, 2026-10-29). 상대 import에 .ts를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러온다.
import type { DetailNutrients, FillSource, MealItem, Nutrients, NutritionResult } from '../../types/analysis.ts'
import { applyDetail, applyNutrition, unitCountOk } from '../compute.ts'
import { foodName } from '../../lib/foodName.ts'
import { loadDb, loadedDbIndex, loadServing, servingOf, servingOfRep, type MfdsFood, type NutritionDbIndex } from './db.ts'
import { chickenWeight, isWholeChicken } from './chickenWeight.ts'
import { detailFor } from './detail.ts'
import { normalizeFoodName } from './normalize.ts'

export { servingOf }

export const FRANCHISE_URL = `${import.meta.env?.BASE_URL ?? '/'}data/franchise-20261029.json`

const emptyTable = (): FranchiseTable => ({ version: '', brands: [], menus: [], dbBrand: {} })

async function fetchDefault(): Promise<FranchiseTable> {
  const res = await fetch(FRANCHISE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as FranchiseTable
}

let loadingTable: Promise<FranchiseTable> | null = null

/** 보충표를 한 번만 받아 캐시한다(식약처 DB도 함께 받아 둔다: 브랜드 DB 메뉴·1개 중량에 쓴다).
 *  실패하면 던지지 않고 빈 표를 돌려주며 다음 호출에서 다시 받는다. fetchTable은 Node 시험용(받기를 시작하는 호출의 것만 쓴다) */
export function loadFranchise(fetchTable: () => Promise<FranchiseTable> = fetchDefault): Promise<FranchiseTable> {
  loadingTable ??= Promise.all([fetchTable(), loadDb().catch(() => null)])
    .then(([t]) => {
      if (!t || typeof t !== 'object' || !Array.isArray(t.brands) || !Array.isArray(t.menus)) throw new Error('형식 오류')
      return { ...t, dbBrand: t.dbBrand && typeof t.dbBrand === 'object' ? t.dbBrand : {} }
    })
    .catch(() => {
      loadingTable = null
      return emptyTable()
    })
  return loadingTable
}

// ── 분류 ──
const CATEGORY_LABEL: Record<string, string> = {
  burger: '버거', chicken: '치킨', pizza: '피자', side: '사이드', drink: '음료', dessert: '디저트', set: '세트', etc: '메뉴',
}
const CATEGORY_UNIT: Record<string, FranchiseUnit> = {
  burger: '개', chicken: '마리', pizza: '판', side: '개', drink: '잔', dessert: '개', set: '인분', etc: '개',
}
const CATEGORY_WORDS: [string, RegExp][] = [
  ['set', /세트|콤보/],
  ['burger', /버거|와퍼|빅맥|맥모닝|머핀/],
  ['pizza', /피자/],
  ['chicken', /치킨|닭튀김|닭강정|순살|윙|텐더|너겟|후라이드|양념/],
  ['drink', /커피|라떼|아메리카노|에스프레소|카푸치노|마키아토|모카|프라푸치노|음료|에이드|스무디|주스|셰이크|쉐이크|콜라|사이다|블렌디드|콜드브루|티$|차$/],
  ['side', /감자튀김|프렌치프라이|후렌치|포테이토|치즈스틱|코울슬로|샐러드/],
  ['dessert', /케이크|아이스크림|선데이|쿠키|도넛|빵|마카롱|와플|파이|플로트|맥플러리/],
]
/** 음식 이름 → 분류(burger·chicken·pizza·side·drink·dessert·set) 또는 null */
export function categoryOfName(name: string): string | null {
  const n = (name ?? '').normalize('NFKC').replace(/\s+/g, '')
  for (const [c, re] of CATEGORY_WORDS) if (re.test(n)) return c
  return null
}
function categoryOfFood(f: MfdsFood): string {
  return categoryOfName(`${f.r} ${f.n}`) ?? 'etc'
}

// ── 표 색인(표마다 한 번, DB 색인이 생기면 다시) ──
interface Entry {
  pick: MenuPick
  category: string
  menu?: FranchiseMenu
  food?: MfdsFood
  keys: Set<string>
}
interface TableIndex {
  brands: Map<BrandId, FranchiseBrand>
  entries: Map<BrandId, Entry[]>
  builtWithDb: boolean
}
const tableIdx = new WeakMap<FranchiseTable, TableIndex>()

function dbFood(idx: NutritionDbIndex | null, code?: string): MfdsFood | undefined {
  if (!idx || !code) return undefined
  const i = idx.byCode.get(code)
  return i === undefined ? undefined : idx.db.foods[i]
}
const posNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

function brandWords(b: FranchiseBrand | undefined): string[] {
  if (!b) return []
  return [b.name, b.id, ...(b.aliases ?? [])]
    .map(normalizeFoodName)
    .filter((k) => k.length >= 2)
    .sort((x, y) => y.length - x.length)
}
/** 이름 비교 키: 정규화(괄호 속 사이즈 제거) + 브랜드 말 제거, 그리고 뒤 "버거"를 뺀 것 */
function nameKeys(name: string, bw: string[]): string[] {
  let k = normalizeFoodName(foodName(name))
  for (const w of bw) if (k.length > w.length && k.includes(w)) k = k.replace(w, '')
  const out = [k]
  const s = k.replace(/(햄버거|버거)$/, '')
  if (s && s !== k) out.push(s)
  return out.filter(Boolean)
}

function buildTableIndex(t: FranchiseTable): TableIndex {
  const idx = loadedDbIndex()
  const brands = new Map(t.brands.map((b) => [b.id, b]))
  const entries = new Map<BrandId, Entry[]>()
  const linked = new Set<string>()
  const push = (b: BrandId, e: Entry) => {
    const l = entries.get(b)
    if (l) l.push(e)
    else entries.set(b, [e])
  }
  for (const m of t.menus) {
    if (!m || !brands.has(m.brand)) continue
    const food = dbFood(idx, m.dbCode)
    if (m.dbCode) linked.add(m.dbCode)
    const w = posNum(food?.w) ? food.w : posNum(m.unitWeight_g) ? m.unitWeight_g : undefined
    const bw = brandWords(brands.get(m.brand))
    const keys = new Set([m.name, ...(m.aliases ?? []), ...(food ? [food.n] : [])].flatMap((x) => nameKeys(x, bw)))
    push(m.brand, {
      pick: {
        brand: m.brand,
        brandName: brands.get(m.brand)!.name,
        name: m.name,
        unit: m.unit,
        ...(w ? { unitWeight_g: w } : {}),
        menuId: m.id,
        ...(m.dbCode ? { dbCode: m.dbCode } : {}),
      },
      category: m.category || 'etc',
      menu: m,
      food,
      keys,
    })
  }
  if (idx) {
    for (const [code, b] of Object.entries(t.dbBrand ?? {})) {
      if (linked.has(code) || !brands.has(b)) continue
      const food = dbFood(idx, code)
      if (!food) continue
      const keys = new Set(nameKeys(food.n, brandWords(brands.get(b))))
      // 보충표 메뉴와 이름이 같으면 하나로(보충표 쪽을 남긴다)
      if ((entries.get(b) ?? []).some((e) => e.menu && [...keys].some((k) => e.keys.has(k)))) continue
      const category = categoryOfFood(food)
      push(b, {
        pick: {
          brand: b,
          brandName: brands.get(b)!.name,
          name: foodName(food.n),
          unit: CATEGORY_UNIT[category] ?? '개',
          ...(posNum(food.w) ? { unitWeight_g: food.w } : {}),
          dbCode: code,
        },
        category,
        food,
        keys,
      })
    }
  }
  return { brands, entries, builtWithDb: idx !== null }
}
function tidx(t: FranchiseTable): TableIndex {
  let x = tableIdx.get(t)
  if (!x || (!x.builtWithDb && loadedDbIndex())) {
    x = buildTableIndex(t)
    tableIdx.set(t, x)
  }
  return x
}

/** 메뉴가 실제로 있는 브랜드(보충표 + dbBrand). category를 주면 그 분류 메뉴가 있는 브랜드만. 표의 브랜드 순서 */
export function franchiseBrandsIn(t: FranchiseTable, category?: string): FranchiseBrand[] {
  const x = tidx(t)
  return t.brands.filter((b) => (x.entries.get(b.id) ?? []).some((e) => !category || e.category === category))
}

/** 그 브랜드 메뉴(보충표 + dbBrand DB 메뉴, 같은 메뉴는 하나). query가 있으면 이름·다른 이름으로 거른다(같음 → 앞부분 → 포함 순) */
export function brandMenusIn(t: FranchiseTable, brand: BrandId, query?: string): MenuPick[] {
  const list = tidx(t).entries.get(brand) ?? []
  const q = normalizeFoodName(query ?? '')
  if (!q) return list.map((e) => ({ ...e.pick }))
  const scored: [number, number, Entry][] = []
  list.forEach((e, i) => {
    let best = 9
    for (const k of [normalizeFoodName(e.pick.name), ...e.keys]) {
      if (k === q) best = Math.min(best, 0)
      else if (k.startsWith(q)) best = Math.min(best, 1)
      else if (k.includes(q)) best = Math.min(best, 2)
    }
    if (best < 9) scored.push([best, i, e])
  })
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , e]) => ({ ...e.pick }))
}

/** 식약처 DB 행 코드의 브랜드(dbBrand, 없으면 그 코드와 연결된 보충표 메뉴의 브랜드). 없으면 null */
export function brandOfDbCodeIn(t: FranchiseTable, dbCode: string): FranchiseBrand | null {
  const brands = tidx(t).brands
  const b = t.dbBrand?.[dbCode] ?? t.menus.find((m) => m.dbCode === dbCode)?.brand
  return (b && brands.get(b)) || null
}

/** 사진·검색의 브랜드 이름 → BrandId(이름·id·aliases. 정확히 같음 → 포함, 긴 말 우선). 못 맞추면 null */
export function matchBrand(t: FranchiseTable, raw: string | null | undefined): BrandId | null {
  const q = normalizeFoodName(raw ?? '')
  if (q.length < 2) return null
  let best: [number, BrandId] | null = null
  for (const b of t.brands) {
    for (const w of brandWords(b)) {
      const score = w === q ? 1000 : q.includes(w) || w.includes(q) ? Math.min(w.length, q.length) : 0
      if (score > 0 && (!best || score > best[0])) best = [score, b.id]
    }
  }
  return best ? best[1] : null
}

const SIZE_PREF = /^(tall|톨|r|레귤러|regular|m|미디움|medium)$/i
/** 그 브랜드 메뉴에서 이름으로 찾기(같은 키만. 브랜드 말·괄호 속 사이즈·뒤 "버거"는 무시). 사이즈가 여럿이면 Tall·R·M 우선 */
export function findBrandMenu(t: FranchiseTable, brand: BrandId, name: string): MenuPick | null {
  const x = tidx(t)
  const keys = nameKeys(name, brandWords(x.brands.get(brand)))
  const hits = (x.entries.get(brand) ?? []).filter((e) => keys.some((k) => e.keys.has(k)))
  if (hits.length === 0) return null
  const exact = hits.filter((e) => e.keys.has(keys[0]))
  const pool = exact.length ? exact : hits
  const sized = pool.find((e) => e.menu?.size && SIZE_PREF.test(e.menu.size.split(/[·\s]/)[0]))
  return { ...(sized ?? pool[0]).pick }
}

// ── 값 계산 ──
type PartSource = 'db' | 'official' | 'ai_estimate' | 'missing'
const MACROS = ['carbs_g', 'protein_g', 'fat_g'] as const
const DB_COL = { carbs_g: 'cb', protein_g: 'p', fat_g: 'f' } as const
const round1 = (n: number) => Math.round(n * 10) / 10

export interface PickExtras {
  /** 1개 중량(g): DB 식품중량 → 보충표 unitWeight_g. 둘 다 없으면 없음(사진 AI 추정 무게를 쓴다).
   *  nominal: 공식 값이 1단위당뿐이고 중량을 모른다 → 1단위를 100g으로 두어 per_100g이 곧 1단위 값(화면은 무게를 숨기는 편이 낫다)
   *  typical: 1마리 무게가 공식·DB에 없는 치킨 → 조사표 1마리 먹는 무게(chickenWeight.ts, 화면 "1마리 · 약 ○○g", grams_basis 'typical')
   *  serving: 1개 무게가 없는 다른 메뉴 → 대표식품명 1인분 표(unit '인분', 화면 "1인분 ○g 기준") */
  unitWeight_g?: number
  unitWeight_source?: 'db' | 'official' | 'nominal' | 'typical' | 'serving'
  /** 단위를 바꿔 쓸 때만(serving → '인분'). 없으면 pick.unit */
  unit?: FranchiseUnit
  /** 기본 개수가 1이 아닐 때만(반마리·하프 치킨 0.5) */
  defaultCount?: number
  /** 영양소별 출처. 배지는 칼로리 출처(source) */
  parts: Record<'kcal' | 'carbs_g' | 'protein_g' | 'fat_g', PartSource>
  /** 보충표 세부 영양소 100g당(당류·나트륨·포화지방). applyDetail의 official 칸에 넘긴다 */
  official_detail?: DetailNutrients
  menuId?: string
  dbCode?: string
}
export type PickNutrition = NutritionResult & PickExtras

export interface PickOptions {
  /** 호출 A의 per_100g_guess(그 음식 사진 추정). 없으면 estimate로, 그것도 없으면 빈 값 */
  guess?: Nutrients | null
  /** AI 추정을 따로 받을 함수(예: resolveNutrition 결과의 per_100g). 실패하면 null. 필요할 때만 한 번 부른다 */
  estimate?: (name: string) => Promise<Nutrients | null>
}

/** 메뉴 하나 → 100g당 값·출처. 값마다 순서(2026-10-29 사용자 결정):
 *  칼로리 — DB에 100g당 kcal과 1개 중량이 둘 다 있으면 DB → 보충표 공식 kcal(1단위 값은 공식 중량(없으면 DB 중량)으로 100g당 환산,
 *           중량이 전혀 없으면 1단위 = 100g으로 둠) → DB 100g당 kcal만 있으면 DB(1개 중량은 사진 추정) → AI 추정(guess → estimate) → 직접 입력.
 *  탄·단·지 — 하나씩 DB → 보충표 → AI 추정 → 빈 값(0, fill missing). 합은 100g을 넘지 않게 자른다.
 *  세부 영양소 — official_detail로 넘긴다(applyDetail이 DB → 보충표 → 추정). 1개 중량 — DB → 보충표 → 치킨 조사표(typical)·1인분 표(serving) → 없음. 던지지 않는다 */
export async function pickToNutritionIn(t: FranchiseTable, pick: MenuPick, opts: PickOptions = {}): Promise<PickNutrition> {
  const idx = loadedDbIndex() ?? (await loadDb().catch(() => null))
  const food = dbFood(idx, pick.dbCode)
  const menu = pick.menuId ? t.menus.find((m) => m.id === pick.menuId) : undefined
  const dbW = posNum(food?.w) ? food.w : undefined
  const offW = posNum(menu?.unitWeight_g) ? menu.unitWeight_g : undefined
  const W = dbW ?? offW
  const convW = offW ?? dbW // 공식 1단위 값 → 100g당 환산 중량
  const nominal = !W && posNum(menu?.perUnit?.kcal) && !posNum(menu?.per100?.kcal)
  const off = (k: keyof FranchiseNutrients): number | undefined => {
    const p = menu?.per100?.[k]
    if (typeof p === 'number' && Number.isFinite(p) && p >= 0) return p
    const u = menu?.perUnit?.[k]
    if (typeof u !== 'number' || !Number.isFinite(u) || u < 0) return undefined
    if (convW) return (u / convW) * 100
    return nominal ? u : undefined
  }
  const okK = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 900
  const okM = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100

  let guess: Nutrients | null = opts.guess ?? null
  let asked = false
  const ai = async (): Promise<Nutrients | null> => {
    if (!guess && !asked && opts.estimate) {
      asked = true
      guess = await opts.estimate(pick.name).catch(() => null)
    }
    return guess
  }
  const parts: PickExtras['parts'] = { kcal: 'missing', carbs_g: 'missing', protein_g: 'missing', fat_g: 'missing' }
  const per: Nutrients = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }

  const offK = off('kcal')
  if (food && okK(food.k) && dbW) [per.kcal, parts.kcal] = [food.k, 'db']
  else if (okK(offK)) [per.kcal, parts.kcal] = [round1(offK), 'official']
  else if (food && okK(food.k)) [per.kcal, parts.kcal] = [food.k, 'db']
  else {
    const g = await ai()
    if (okK(g?.kcal)) [per.kcal, parts.kcal] = [g.kcal, 'ai_estimate']
  }

  let room = 100
  for (const k of MACROS) {
    const d = food ? food[DB_COL[k]] : undefined
    const o = off(k)
    let v: number | undefined
    let s: PartSource = 'missing'
    if (okM(d)) [v, s] = [d, 'db']
    else if (okM(o)) [v, s] = [o, 'official']
    else {
      const g = await ai()
      if (okM(g?.[k])) [v, s] = [g[k], 'ai_estimate']
    }
    if (v !== undefined) {
      v = Math.min(v, room)
      if (s !== 'db') v = round1(v)
      room = Math.max(0, room - v)
      per[k] = v
      parts[k] = s
    }
  }

  const official_detail: DetailNutrients = {}
  const sug = off('sugar_g')
  const na = off('sodium_mg')
  const sf = off('sat_fat_g')
  if (okM(sug)) official_detail.sugar_g = round1(sug)
  if (typeof na === 'number' && na <= 40000) official_detail.sodium_mg = Math.round(na)
  if (okM(sf)) official_detail.satfat_g = round1(sf)

  const extras: PickExtras = {
    parts,
    ...(W
      ? { unitWeight_g: W, unitWeight_source: dbW ? ('db' as const) : ('official' as const) }
      : nominal
        ? { unitWeight_g: 100, unitWeight_source: 'nominal' as const }
        : await fallbackUnit(pick, menu, food)),
    ...(Object.keys(official_detail).length ? { official_detail } : {}),
    ...(pick.menuId ? { menuId: pick.menuId } : {}),
    ...(pick.dbCode ? { dbCode: pick.dbCode } : {}),
  }
  const fill: Partial<Record<'carbs_g' | 'fat_g', FillSource>> = {}
  for (const k of ['carbs_g', 'fat_g'] as const) {
    const p = parts[k]
    if (p !== 'db') fill[k] = p
  }
  const fillPart = Object.keys(fill).length > 0 ? { fill } : {}

  if (parts.kcal === 'db' && food) {
    return {
      source: 'db',
      per_100g: per,
      ...fillPart,
      db_food_code: food.c,
      db_name: food.n,
      db_match: 'name',
      ...(food.ml === 1 ? { ml_converted: true as const } : {}),
      ...(dbW ? { published_g: dbW } : {}),
      ...extras,
    }
  }
  if (parts.kcal === 'official') return { source: 'official', per_100g: per, ...fillPart, ...extras }
  if (parts.kcal === 'ai_estimate') return { source: 'ai_estimate', per_100g: per, via: 'guess', ...extras }
  return { source: 'user_input', per_100g: null, ...extras }
}

const CATEGORY_REP: Record<string, string> = { burger: '햄버거', pizza: '피자', drink: '커피', dessert: '케이크', side: '감자튀김' }

/** 공식·DB 1개 무게가 없을 때(2026-10-29 사용자 결정): 한 마리 치킨 → 조사표 1마리 무게(typical),
 *  다른 메뉴 → 그 메뉴 DB 행(없으면 이름 분류)의 대표식품명 1인분(serving, unit '인분'). 못 정하면 빈 값(사진 AI 무게) */
async function fallbackUnit(pick: MenuPick, menu: FranchiseMenu | undefined, food: MfdsFood | undefined): Promise<Partial<PickExtras>> {
  const category = menu?.category ?? categoryOfName(`${food?.r ?? ''} ${pick.name}`)
  const piece = /통다리|\d+\s*조각/.test(pick.name)
  if (!piece && ((pick.unit === '마리' && category === 'chicken') || (food?.r === '닭튀김' && isWholeChicken(food.n, food.r)))) {
    const c = chickenWeight(pick.name, pick.brand)
    return { unitWeight_g: c.unit_g, unitWeight_source: 'typical', unit: '마리', ...(c.half ? { defaultCount: 0.5 } : {}) }
  }
  await loadServing().catch(() => null)
  const g = (pick.dbCode ? servingOf(pick.dbCode) : null) ?? (category && CATEGORY_REP[category] ? servingOfRep(CATEGORY_REP[category]) : null)
  return g ? { unitWeight_g: g, unitWeight_source: 'serving', unit: '인분' } : {}
}

/** 메뉴 고르기 결과를 항목에 넣는다: 영양값(pickToNutrition) → 세부 영양소(DB → 보충표 → 추정) → brand·franchise·unit·menu_pick.
 *  count(개수)를 주고 1개 중량이 있으면 무게 = 1개 중량 × count, count가 정수 1~10이면 "공개 중량"(grams_source·published_g·unit_count).
 *  count가 없으면 무게는 그대로. franchise_ref는 지운다(메뉴를 골랐으므로). 던지지 않는다 */
export async function applyMenuPick(
  item: MealItem,
  t: FranchiseTable,
  pick: MenuPick,
  opts: PickOptions & { count?: number | null; detailGuess?: DetailNutrients | null } = {},
): Promise<MealItem> {
  const r = await pickToNutritionIn(t, pick, opts)
  let next: MealItem = { ...item }
  delete next.grams_source
  delete next.published_g
  delete next.unit_count
  delete next.grams_basis
  delete next.franchise_ref
  const n = opts.count
  if (r.unitWeight_g && typeof n === 'number' && Number.isFinite(n) && n > 0) {
    next.before_grams = round1(r.unitWeight_g * n)
    if (unitCountOk(n, r.unit ?? pick.unit) && r.unitWeight_source !== 'nominal')
      Object.assign(next, {
        grams_source: 'published' as const,
        published_g: r.unitWeight_g,
        unit_count: n,
        ...(r.unitWeight_source === 'typical' ? { grams_basis: 'typical' as const } : {}),
      })
  }
  next = applyNutrition(next, r)
  let db: DetailNutrients | null = null
  if (r.dbCode && r.source !== 'ai_estimate') db = await detailFor(r.dbCode).catch(() => null)
  next = applyDetail(next, db, opts.detailGuess ?? null, r.official_detail ?? null)
  return {
    ...next,
    brand: pick.brand,
    franchise: true,
    unit: r.unit ?? pick.unit,
    menu_pick: { ...(pick.menuId ? { menuId: pick.menuId } : {}), ...(pick.dbCode ? { dbCode: pick.dbCode } : {}) },
  }
}

/** 1개 kcal(보충표 1단위 → 보충표 100g당 × 중량 → DB 100g당 × 식품중량) */
function unitKcal(e: Entry): number | null {
  const m = e.menu
  if (posNum(m?.perUnit?.kcal)) return m.perUnit.kcal
  const w = posNum(e.food?.w) ? e.food.w : posNum(m?.unitWeight_g) ? m.unitWeight_g : null
  if (w && posNum(m?.per100?.kcal)) return (m.per100.kcal * w) / 100
  if (w && e.food && posNum(e.food.k)) return (e.food.k * w) / 100
  return null
}

/** 같은 브랜드 같은 분류 메뉴의 1개 kcal 평균(참고 표시, 예 "버거킹 버거 평균"). 이름으로 분류를 모르거나 값이 없으면 null */
export function franchiseRef(t: FranchiseTable, brand: BrandId, name: string): { label: string; kcal: number } | null {
  const category = categoryOfName(name)
  if (!category) return null
  const x = tidx(t)
  const ks = (x.entries.get(brand) ?? [])
    .filter((e) => e.category === category)
    .map(unitKcal)
    .filter((v): v is number => v !== null)
  if (ks.length === 0) return null
  const b = x.brands.get(brand)
  return { label: `${b?.name ?? brand} ${CATEGORY_LABEL[category] ?? '메뉴'} 평균`, kcal: Math.round(ks.reduce((a, v) => a + v, 0) / ks.length) }
}

// ── 화면용(표를 안에서 불러오는 비동기 래퍼, 2026-10-29 리더 결정). 표 인자 버전은 …In ──

/** 메뉴가 실제로 있는 브랜드. category: burger·chicken·pizza·drink·dessert·side·etc(없으면 모두) */
export async function franchiseBrands(category?: string): Promise<FranchiseBrand[]> {
  return franchiseBrandsIn(await loadFranchise(), category)
}
/** 그 브랜드 메뉴(보충표 + dbBrand DB 메뉴) */
export async function brandMenus(brand: BrandId, query?: string): Promise<MenuPick[]> {
  return brandMenusIn(await loadFranchise(), brand, query)
}
/** DB 행 코드의 브랜드 id. 없으면 null */
export async function brandOfDbCode(code: string): Promise<BrandId | null> {
  return brandOfDbCodeIn(await loadFranchise(), code)?.id ?? null
}
/** 메뉴 → 100g당 값·출처(pickToNutritionIn). opts가 없으면 AI 칸은 resolveNutrition(이름)의 AI 추정으로 채운다(필요할 때만 한 번) */
export async function pickToNutrition(pick: MenuPick, opts?: PickOptions): Promise<PickNutrition> {
  return pickToNutritionIn(await loadFranchise(), pick, opts ?? { estimate: estimateByResolve })
}
async function estimateByResolve(name: string): Promise<Nutrients | null> {
  try {
    const { resolveNutrition } = await import('./index.ts')
    const r = await resolveNutrition(name)
    if (r.source === 'ai_estimate' || r.source === 'search') return r.per_100g
    // 이름이 DB에 맞으면 resolve가 DB 행을 주고, 빈 탄·지는 호출 D로 채워 fill에 적어 둔다(2026-10-29 사용자 화면: 고추바사삭 지방 0).
    // 그 채운 값을 AI 추정으로 넘긴다(못 채운 칸은 NaN이라 쓰지 않는다)
    // 빈 칸이 없는 DB 행이면 그 값을 그대로(공식 표에 탄·지가 없는 메뉴의 빈 칸 채우기)
    if (r.source === 'db') {
      const p: Nutrients = { ...r.per_100g }
      for (const k of ['carbs_g', 'fat_g'] as const) if (r.fill && r.fill[k] !== undefined && r.fill[k] !== 'ai_estimate') p[k] = Number.NaN
      return p
    }
    return null
  } catch {
    return null
  }
}

/** AI 1개 kcal이 평균의 0.5배 미만·2배 초과면 true("확인 필요") */
export function outsideRef(aiUnitKcal: number, ref: { kcal: number }): boolean {
  return ref.kcal > 0 && (aiUnitKcal < ref.kcal * 0.5 || aiUnitKcal > ref.kcal * 2)
}
