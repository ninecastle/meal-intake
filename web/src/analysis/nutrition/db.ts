// 식약처 DB 로드·이름 검색·매칭 (스펙 3.5절, 4.5.4). resolveNutrition과 AI 추정은 여기 없다(조각 4).
// 상대 import에 .ts 확장자를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러오기 때문이다.
import { FOOD_ALIASES } from './aliases.ts'
import { normalizeFoodName } from './normalize.ts'

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
}

export interface MfdsDb {
  v: string // 원본 갱신일
  src: string
  foods: MfdsFood[]
  groups: Record<string, number> // 정규화한 대표식품명 → foods 인덱스
  d: Record<string, number> // 세부명 키 → foods 인덱스 (스펙 3.5 확장, 변환 때 4.5.3 (c)로 고름)
}

export type DbMatch = 'name' | 'group' | 'partial'

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
  return { db, byName, byDetail, byGroup, byCode, suffixGroups, entries }
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
  const alias = FOOD_ALIASES[q] ? normalizeFoodName(FOOD_ALIASES[q]) : null
  const best = new Map<number, FoodHit>()
  for (const e of idx.entries) {
    const match: SearchMatch | null =
      e.key === q || e.key === alias
        ? 'exact'
        : e.key.startsWith(q)
          ? 'prefix'
          : !prefixOnly && e.key.includes(q)
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
}

/** 스펙 4.3 자동완성 계약: 앞부분 일치만, 그룹 먼저, 최대 limit개(기본 8). */
export async function searchFoodNames(query: string, limit = 8): Promise<FoodSuggestion[]> {
  return rank(await loadDb(), query, limit, true).map((h) => ({
    dbCode: h.food.c,
    label: h.label,
    dbName: h.food.n,
    kcalPer100g: h.food.k,
    kind: h.kind,
  }))
}

// ── 매칭 (4.5.4 0~5단계) ─────────────────────────────

export interface DbMatchResult {
  index: number
  food: MfdsFood
  match: DbMatch
  key: string // 실제로 맞은 키
}

function exactKey(idx: NutritionDbIndex, q: string): { i: number; match: DbMatch } | null {
  const i = idx.byName.get(q) ?? idx.byDetail.get(q)
  if (i !== undefined) return { i, match: 'name' }
  const g = idx.byGroup.get(q)
  return g !== undefined ? { i: g, match: 'group' } : null
}

/** 색인이 이미 있을 때 쓰는 동기 버전. */
export function matchFood(idx: NutritionDbIndex, name: string, dbCode?: string): DbMatchResult | null {
  const hit = (i: number, match: DbMatch, key: string): DbMatchResult => ({ index: i, food: idx.db.foods[i], match, key })
  if (dbCode) {
    const i = idx.byCode.get(dbCode)
    if (i !== undefined) return hit(i, 'name', dbCode)
  }
  const q = normalizeFoodName(name)
  if (!q) return null
  const direct = exactKey(idx, q)
  if (direct) return hit(direct.i, direct.match, q)
  if (FOOD_ALIASES[q]) {
    const a = normalizeFoodName(FOOD_ALIASES[q])
    const viaAlias = exactKey(idx, a)
    if (viaAlias) return hit(viaAlias.i, viaAlias.match, a)
  }
  // 국물·건더기는 완성 음식 값을 부분 일치로 붙이지 않는다
  if (q.endsWith('국물') || q.endsWith('건더기')) return null
  const g = idx.suffixGroups.find((k) => k !== q && q.endsWith(k))
  return g ? hit(idx.byGroup.get(g)!, 'partial', g) : null
}

/** 정확 일치(이름·세부명·그룹·별칭) 또는 뒤쪽 일치 1건. 없으면 null. */
export async function findBestMatch(name: string, opts?: { dbCode?: string }): Promise<DbMatchResult | null> {
  return matchFood(await loadDb(), name, opts?.dbCode)
}
