// 식약처 DB 로드·이름 검색·매칭 (스펙 3.5절, 4.5.4). resolveNutrition과 AI 추정은 여기 없다(조각 4).
// 상대 import에 .ts 확장자를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러오기 때문이다.
import { FOOD_ALIASES, FOOD_WORD_ALIASES, applyWordAliases } from './aliases.ts'
import { detailKey, normalizeFoodName } from './normalize.ts'

export interface MfdsFood {
  c: string // 식품코드 → db_food_code
  n: string // 식품명 원문 → db_name, 자동완성 표시
  r: string // 대표식품명
  k: number // 에너지 kcal/100g
  p: number // 단백질 g/100g
  cb: number | null // 탄수화물 g/100g, 원본이 비어 있으면 null
  f: number | null // 지방 g/100g, 원본이 비어 있으면 null
  ml?: 1 // 원본 기준량 100ml를 밀도 1.0으로 환산한 행
  s?: number // 1인(회)분량 참고량(g)
  w?: number // 공개 중량(g, 스펙 4.5.5). 업체 제공 행의 식품중량이 100g·100ml가 아닐 때만, ml은 1ml=1g
}

export interface MfdsDb {
  v: string // 원본 갱신일
  src: string
  foods: MfdsFood[]
  groups: Record<string, number> // 정규화한 대표식품명 → foods 인덱스
  d: Record<string, number> // 세부명 키 → foods 인덱스 (스펙 3.5 확장, 변환 때 4.5.3 (c)로 고름)
}

export type DbMatch = 'name' | 'group' | 'partial'

const MEAL_KIT = '간편조리세트'

export const MFDS_DB_URL = `${import.meta.env?.BASE_URL ?? '/'}data/mfds-foods-20261006.json`

interface Entry {
  key: string
  idx: number
  kind: 'group' | 'name'
  label: string
}

export interface NutritionDbIndex {
  db: MfdsDb
  byName: Map<string, number>
  byDetail: Map<string, number>
  byGroup: Map<string, number>
  byCode: Map<string, number>
  byAlt: Map<string, number> // 단어 치환(aliases.ts)한 DB 이름의 이름 키·세부명 키. 이름 키·그룹 키와 겹치는 것은 뺀다
  byRep: Map<string, number[]> // 정규화한 대표식품명 → 그 그룹의 모든 행(세부 종류 목록)
  suffixGroups: string[] // 길이 2 이상 그룹 키, 긴 것부터
  entries: Entry[] // 검색용: 이름 키 + 세부명 키 + 그룹 키
}

function buildIndex(db: MfdsDb): NutritionDbIndex {
  const byName = new Map<string, number>()
  const byCode = new Map<string, number>()
  const entries: Entry[] = []
  db.foods.forEach((f, i) => {
    const key = normalizeFoodName(f.n)
    if (!byName.has(key)) byName.set(key, i)
    byCode.set(f.c, i)
    entries.push({ key, idx: i, kind: 'name', label: f.n })
  })
  const byDetail = new Map(Object.entries(db.d ?? {}))
  for (const [key, i] of byDetail) entries.push({ key, idx: i, kind: 'name', label: db.foods[i].n })
  const byGroup = new Map(Object.entries(db.groups))
  for (const [key, i] of byGroup) entries.push({ key, idx: i, kind: 'group', label: `${db.foods[i].r} · 대표값` })
  const suffixGroups = [...byGroup.keys()].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length)

  // 치환 키: "닭튀김_양념 치킨" → "닭튀김_양념닭튀김" → 세부명 키 "양념닭튀김". 조회어도 같은 치환을 거쳐 비교한다.
  // 치환으로 세부명 키가 그대로인 행(가운데 조각만 바뀐 행)은 넣지 않는다. 치환 키끼리 겹치면 pickMedianRow로 고른다.
  // 단어 치환 조회는 치환 키를 원래 세부명 키보다 먼저 본다(wordKey).
  const altRows = new Map<string, number[]>()
  const byRep = new Map<string, number[]>()
  db.foods.forEach((f, i) => {
    const r = normalizeFoodName(f.r)
    const list = byRep.get(r)
    if (list) list.push(i)
    else byRep.set(r, [i])
    const n = normalizeFoodName(f.n)
    const dk = detailKey(n)
    const keys = new Set<string>()
    for (const w of [applyWordAliases(n, false), applyWordAliases(n)]) {
      if (w === n) continue
      keys.add(w)
      const wk = detailKey(w)
      if (wk && wk !== dk) keys.add(wk)
    }
    for (const k of keys) {
      if (byName.has(k) || byGroup.has(k)) continue
      const rows = altRows.get(k)
      if (rows) rows.push(i)
      else altRows.set(k, [i])
    }
  })
  const byAlt = new Map<string, number>()
  for (const [k, rows] of altRows) {
    const i = pickMedianRow(db.foods, rows)
    byAlt.set(k, i)
    entries.push({ key: k, idx: i, kind: 'name', label: db.foods[i].n })
  }
  return { db, byName, byDetail, byGroup, byCode, byAlt, byRep, suffixGroups, entries }
}

/**
 * 간편조리세트(밀키트)가 아닌 행이 있으면 그 행들 가운데, kcal이 중앙값에 가장 가까운 행. 같으면 식품코드 사전순
 * (4.5.3 (c)의 앞부분만, 식품기원·기준일자는 JSON에 없다)
 */
function pickMedianRow(foods: MfdsFood[], all: number[]): number {
  const plain = all.filter((i) => !foods[i].n.includes(MEAL_KIT))
  const rows = plain.length > 0 ? plain : all
  if (rows.length === 1) return rows[0]
  const ks = rows.map((i) => foods[i].k).sort((a, b) => a - b)
  const mid = ks.length % 2 ? ks[(ks.length - 1) / 2] : (ks[ks.length / 2 - 1] + ks[ks.length / 2]) / 2
  return [...rows].sort(
    (a, b) => Math.abs(foods[a].k - mid) - Math.abs(foods[b].k - mid) || foods[a].c.localeCompare(foods[b].c),
  )[0]
}

async function fetchDefault(): Promise<MfdsDb> {
  const res = await fetch(MFDS_DB_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as MfdsDb
}

let loading: Promise<NutritionDbIndex> | null = null

/**
 * DB JSON을 한 번만 받아 색인까지 만들어 캐시한다. 실패하면 1회 재시도 후 NUTRITION_DB_UNAVAILABLE로 reject하고,
 * 다음 호출에서 다시 시도한다. fetchDb는 Node 시험용(파일에서 읽기)이며 첫 호출의 것만 쓴다.
 */
export function loadDb(fetchDb: () => Promise<MfdsDb> = fetchDefault): Promise<NutritionDbIndex> {
  loading ??= fetchDb()
    .catch(() => fetchDb())
    .then(buildIndex)
    .catch((e: unknown) => {
      loading = null
      throw new Error('NUTRITION_DB_UNAVAILABLE', { cause: e })
    })
  return loading
}

/** 스펙 4.3 계약 이름. S2 진입 때 미리 불러 둔다. */
export async function loadNutritionDb(): Promise<void> {
  await loadDb()
}

// ── 검색 ──────────────────────────────────────────────

export type SearchMatch = 'exact' | 'prefix' | 'contains'

export interface FoodHit {
  index: number
  food: MfdsFood
  kind: 'group' | 'name'
  label: string
  match: SearchMatch
  score: number // exact 3, prefix 2, contains 1
}

const MATCH_SCORE: Record<SearchMatch, number> = { exact: 3, prefix: 2, contains: 1 }

function rank(idx: NutritionDbIndex, query: string, limit: number, prefixOnly: boolean): FoodHit[] {
  const q = normalizeFoodName(query)
  if (!q) return []
  const heads = [...new Set([q, applyWordAliases(q, false), applyWordAliases(q)])]
  const exacts = new Set(heads.flatMap((h) => [h, aliasOf(h)]).filter((k): k is string => !!k))
  const best = new Map<number, FoodHit>()
  for (const e of idx.entries) {
    const match: SearchMatch | null = exacts.has(e.key)
      ? 'exact'
      : heads.some((h) => e.key.startsWith(h))
        ? 'prefix'
        : !prefixOnly && heads.some((h) => e.key.includes(h))
          ? 'contains'
          : null
    if (!match) continue
    const score = MATCH_SCORE[match]
    const prev = best.get(e.idx)
    // 같은 행은 한 번만: 점수가 높은 쪽, 같으면 그룹(대표값) 쪽을 남긴다
    if (prev && (prev.score > score || (prev.score === score && (prev.kind === 'group' || e.kind !== 'group')))) continue
    best.set(e.idx, { index: e.idx, food: idx.db.foods[e.idx], kind: e.kind, label: e.label, match, score })
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.kind === b.kind ? 0 : a.kind === 'group' ? -1 : 1) ||
        a.label.length - b.label.length ||
        a.label.localeCompare(b.label, 'ko'),
    )
    .slice(0, limit)
}

/** 정확 일치 → 앞부분 일치 → 포함 순(같은 단계는 그룹 먼저, 짧은 이름 먼저). 별칭 대상은 정확 일치로 본다. */
export async function searchFoods(query: string, limit = 10): Promise<FoodHit[]> {
  return rank(await loadDb(), query, limit, false)
}

export interface FoodSuggestion {
  dbCode: string
  label: string
  dbName: string
  kcalPer100g: number
  kind: 'group' | 'name'
  /** 원본 기준량 100ml를 밀도 1.0으로 100g 환산한 행. 화면은 "DB(환산)"으로 표시한다 */
  mlConverted?: boolean
}

function toSuggestion(food: MfdsFood, label: string, kind: 'group' | 'name'): FoodSuggestion {
  return {
    dbCode: food.c,
    label,
    dbName: food.n,
    kcalPer100g: food.k,
    kind,
    ...(food.ml === 1 ? { mlConverted: true } : {}),
  }
}

/** 스펙 4.3 자동완성 계약: 앞부분 일치만, 그룹 먼저, 최대 limit개(기본 8). */
export async function searchFoodNames(query: string, limit = 8): Promise<FoodSuggestion[]> {
  return rank(await loadDb(), query, limit, true).map((h) => toSuggestion(h.food, h.label, h.kind))
}

// ── 매칭 (4.5.4 0~5단계) ─────────────────────────────

export interface DbMatchResult {
  index: number
  food: MfdsFood
  match: DbMatch
  key: string // 실제로 맞은 키
  w?: number // 매칭된 행의 공개 중량(food.w, 스펙 4.5.5)
}

function exactKey(idx: NutritionDbIndex, q: string): { i: number; match: DbMatch } | null {
  const i = idx.byName.get(q) ?? idx.byDetail.get(q)
  if (i !== undefined) return { i, match: 'name' }
  const g = idx.byGroup.get(q)
  return g !== undefined ? { i: g, match: 'group' } : null
}

/** 색인이 이미 있을 때 쓰는 동기 버전. */
export function matchFood(idx: NutritionDbIndex, name: string, dbCode?: string): DbMatchResult | null {
  const hit = (i: number, match: DbMatch, key: string): DbMatchResult => {
    const food = idx.db.foods[i]
    return { index: i, food, match, key, ...(food.w != null ? { w: food.w } : {}) }
  }
  if (dbCode) {
    const i = idx.byCode.get(dbCode)
    if (i !== undefined) return hit(i, 'name', dbCode)
  }
  const q = normalizeFoodName(name)
  if (!q) return null
  const direct = exactKey(idx, q)
  if (direct) return hit(direct.i, direct.match, q)
  const a = aliasOf(q)
  const viaAlias = a ? exactKey(idx, a) : null
  if (a && viaAlias) return hit(viaAlias.i, viaAlias.match, a)
  // 단어 치환: 조회어와 DB 이름에 같은 치환을 적용해 비교한다. 표기 차이(까스→가스 등)만 바꾼 것 → 일반 이름(치킨→닭튀김)까지
  // 바꾼 것 순서. 표기만 바꾼 것이 q와 같아도 치환 키는 본다(생선가스 ↔ DB "생선까스").
  const ws = applyWordAliases(q, false)
  const wg = applyWordAliases(q)
  const tries: [string, boolean][] = [[ws, false]]
  if (wg !== ws) tries.push([wg, true])
  for (const [w, generic] of tries) {
    const viaWord = wordKey(idx, w, generic)
    if (viaWord) return hit(viaWord.i, viaWord.match, w)
    const wa = w !== q ? aliasOf(w) : null
    const viaWordAlias = wa ? exactKey(idx, wa) : null
    if (wa && viaWordAlias) return hit(viaWordAlias.i, viaWordAlias.match, wa)
  }
  // 국물·건더기는 완성 음식 값을 부분 일치로 붙이지 않는다
  if (q.endsWith('국물') || q.endsWith('건더기')) return null
  for (const s of new Set([q, ws, wg])) {
    const g = idx.suffixGroups.find((k) => k !== s && s.endsWith(k))
    if (g) return hit(idx.byGroup.get(g)!, 'partial', g)
  }
  return null
}

function aliasOf(q: string): string | null {
  return FOOD_ALIASES[q] ? normalizeFoodName(FOOD_ALIASES[q]) : null
}

/**
 * 단어 치환한 조회어 w의 정확 일치. 일반 이름 치환(generic, 치킨 → 닭튀김)으로 대표식품명에 맞으면 group으로 본다
 * (이름이 같은 행이 있으면 그 행, 없으면 대표 행). 세부 종류 행까지 맞으면(양념치킨 → 닭튀김_양념 치킨) name.
 * 순서: 그룹(generic일 때) → 이름 키 → 치환 키 → 세부명 키(간편조리세트 행 제외) → 그룹(표기 차이일 때).
 * 간편조리세트를 빼는 이유: 3조각 이름의 세부명 키(첫·마지막 조각)가 일반 이름을 가로챈다(반반치킨 → …간장양념치킨_매운맛_반반).
 */
function wordKey(idx: NutritionDbIndex, w: string, generic: boolean): { i: number; match: DbMatch } | null {
  const g = idx.byGroup.get(w)
  if (generic && g !== undefined) return { i: idx.byName.get(w) ?? g, match: 'group' }
  const d = idx.byDetail.get(w)
  const i =
    idx.byName.get(w) ??
    idx.byAlt.get(w) ??
    (d !== undefined && !idx.db.foods[d].n.includes(MEAL_KIT) ? d : undefined)
  if (i !== undefined) return { i, match: 'name' }
  return g !== undefined ? { i: g, match: 'group' } : null
}

/** 정확 일치(이름·세부명·그룹·별칭) 또는 뒤쪽 일치 1건. 없으면 null. */
export async function findBestMatch(name: string, opts?: { dbCode?: string }): Promise<DbMatchResult | null> {
  return matchFood(await loadDb(), name, opts?.dbCode)
}

// ── 세부 종류 목록 (2단계 결과 수정 화면) ─────────────

let genericWords: Set<string> | null = null

/** 이름을 `_`·공백으로 나눈 낱말(정규화) */
function words(name: string): string[] {
  return name
    .split(/[_\s]+/)
    .map((x) => normalizeFoodName(x))
    .filter(Boolean)
}

/**
 * 외식 업체 상품 행(식품코드 D2…)이 아닌 행의 낱말 모음. 업체 행 이름이 이 낱말로만 되어 있으면
 * "양념 치킨"·"간장 치킨"처럼 브랜드 없는 일반 맛 이름으로 본다("꿀잼 치킨"은 아니다).
 */
function genericVocab(foods: MfdsFood[]): Set<string> {
  if (genericWords) return genericWords
  const set = new Set<string>()
  for (const f of foods) if (!f.c.startsWith('D2')) for (const x of words(f.n)) set.add(x)
  genericWords = set
  return set
}

/**
 * 같은 대표식품명 그룹의 세부 행 목록. 이름(별칭·단어 치환 포함)으로 맞는 행을 찾거나 dbCode의 행을 보고,
 * 그 행의 대표식품명 그룹 전체를 돌려준다. 예: "치킨"·"양념치킨" → 닭튀김_* 행들. 그룹이 없으면 빈 배열.
 * 정렬: 그룹 이름과 같은 기본 행 → 브랜드 없는 일반 이름(업체 상품이 아니거나 일반 낱말만) → 간편조리세트 → 나머지,
 * 같은 단계는 그룹 이름을 뺀 세부 이름이 짧은 순. 고르면 dbCode로 resolveNutrition을 다시 부른다.
 */
export async function listFoodVariants(
  name: string,
  opts?: { dbCode?: string; limit?: number },
): Promise<FoodSuggestion[]> {
  const idx = await loadDb()
  const foods = idx.db.foods
  let row: number | undefined = opts?.dbCode ? idx.byCode.get(opts.dbCode) : undefined
  if (row === undefined) row = matchFood(idx, name)?.index
  if (row === undefined) return []
  const r = normalizeFoodName(foods[row].r)
  const rows = idx.byRep.get(r) ?? []
  // 세부 이름에서 뺄 말: 대표식품명과, 단어 치환으로 대표식품명이 되는 말(닭튀김 ← 치킨)
  const strip = [r, ...FOOD_WORD_ALIASES.filter((a) => a.to === r).map((a) => a.from)]
  const vocab = genericVocab(foods)
  const keyed = rows.map((i) => {
    const f = foods[i]
    const n = normalizeFoodName(f.n)
    const rest = words(f.n.slice(f.n.indexOf('_') + 1))
      .map((x) => strip.reduce((t, s) => t.split(s).join(''), x))
      .filter(Boolean)
    const brand = f.c.startsWith('D2')
    const tier = n === r ? 0 : f.n.includes(MEAL_KIT) ? 2 : !brand || rest.every((x) => vocab.has(x)) ? 1 : 3
    return { i, n, tier, len: rest.join('').length, brand }
  })
  keyed.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.len - b.len ||
      Number(a.brand) - Number(b.brand) ||
      foods[a.i].n.localeCompare(foods[b.i].n, 'ko'),
  )
  const limit = opts?.limit ?? 30
  const seen = new Set<string>()
  const out: FoodSuggestion[] = []
  for (const k of keyed) {
    if (out.length >= limit) break
    if (seen.has(k.n)) continue
    seen.add(k.n)
    out.push(toSuggestion(foods[k.i], foods[k.i].n, 'name'))
  }
  return out
}
