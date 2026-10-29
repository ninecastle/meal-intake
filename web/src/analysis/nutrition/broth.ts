// 국물 요리 나누기(2026-10-29 사용자 결정, CLAUDE.md 프랜차이즈 보충표 절 끝 "국물 요리 나누기").
// 한 그릇(라면·짬뽕·국밥·찌개 등)을 "○○ 면·건더기"(면이 없으면 "○○ 건더기")와 "○○ 국물" 두 항목으로 나눈다.
// 두 항목의 칼로리·영양소는 한 그릇 값을 요리 종류별 국물 몫 표(broth-20261029.json)로 나눠, 둘 다 먹으면 한 그릇 합계와 같다.
// 표는 spike/broth/build.mjs가 한 번 만든다(Gemini 한 번 묶음 + 기준 예시). 앱 실행 중 AI 호출은 없다.
// 요리 종류 맞추기(키워드)는 이 파일에 있어 isSoupDish는 표 없이 동기로 동작한다.
// 상대 import에 .ts 확장자를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러오기 때문이다.
import type { DetailKey, DetailNutrients, MealItem, Nutrients } from '../../types/analysis.ts'
import { DETAIL_KEYS, recomputeItem } from '../compute.ts'
import { foodName } from '../../lib/foodName.ts'

/** 국물 몫(0~1): 한 그릇에서 국물 쪽이 차지하는 비율. 무게·열량·탄·단·지·나트륨·당류 */
export interface BrothShare {
  weight: number
  kcal: number
  carbs: number
  protein: number
  fat: number
  sodium: number
  sugar: number
}
export const SHARE_KEYS = ['weight', 'kcal', 'carbs', 'protein', 'fat', 'sodium', 'sugar'] as const

export interface BrothTable {
  version: string
  /** 요리 종류 키(BROTH_KINDS.key) → 국물 몫 */
  kinds: Record<string, BrothShare>
  /** 근거: anchor = 기준 예시(사람이 정함), ai = Gemini 묶음 조회 */
  source: Record<string, 'anchor' | 'ai'>
}

export interface BrothKind {
  key: string
  /** 이름(빈칸 뺀 것)에 들어 있으면 이 종류. end면 이름이 그 말로 끝날 때만 */
  kw: string[]
  end?: boolean
  /** 면이 든 요리면 "면·건더기", 아니면 "건더기" */
  noodle: boolean
  /** 표 만들기 때 Gemini에 보이는 설명 */
  desc: string
}

/** 요리 종류(표 키). 긴 키워드가 먼저 맞고, 길이가 같으면 앞에 있는 종류 */
export const BROTH_KINDS: readonly BrothKind[] = [
  // 면·국물 요리
  { key: '라면', kw: ['라면'], noodle: true, desc: '봉지 라면을 끓인 한 그릇(면·스프·건더기)' },
  { key: '라멘', kw: ['라멘'], noodle: true, desc: '일본식 라멘(돈코츠·쇼유 등)' },
  { key: '짬뽕', kw: ['짬뽕'], noodle: true, desc: '중식 짬뽕(면·해물·채소·기름진 매운 국물)' },
  { key: '짬뽕밥', kw: ['짬뽕밥'], noodle: false, desc: '짬뽕 국물에 밥(밥은 건더기 쪽)' },
  { key: '칼국수', kw: ['칼국수', '칼국시'], noodle: true, desc: '칼국수(바지락·닭·멸치 국물)' },
  { key: '우동', kw: ['우동'], noodle: true, desc: '우동(가쓰오 국물)' },
  { key: '쌀국수', kw: ['쌀국수'], noodle: true, desc: '베트남 쌀국수(소고기 육수)' },
  { key: '물냉면', kw: ['냉면', '물냉면', '평양냉면', '함흥냉면'], noodle: true, desc: '물냉면(차가운 육수·동치미 국물)' },
  { key: '밀면', kw: ['밀면'], noodle: true, desc: '부산 밀면(물밀면)' },
  { key: '막국수', kw: ['막국수'], noodle: true, desc: '물막국수' },
  { key: '잔치국수', kw: ['국수', '잔치국수', '온면', '장국국수', '멸치국수'], noodle: true, desc: '잔치국수(멸치 육수 소면)' },
  { key: '콩국수', kw: ['콩국수'], noodle: true, desc: '콩국수(진한 콩물)' },
  { key: '메밀소바', kw: ['소바', '모밀', '메밀국수'], noodle: true, desc: '냉메밀·소바(찍어 먹는 장국)' },
  { key: '기스면', kw: ['기스면'], noodle: true, desc: '중식 기스면(닭 육수)' },
  { key: '울면', kw: ['울면'], noodle: true, desc: '중식 울면(걸쭉한 국물)' },
  { key: '탄탄면', kw: ['탄탄면'], noodle: true, desc: '탄탄면(참깨 국물)' },
  { key: '마라탕', kw: ['마라탕'], noodle: false, desc: '마라탕(여러 건더기·면, 기름진 마라 국물)' },
  { key: '떡국', kw: ['떡국', '떡만두국'], noodle: false, desc: '떡국' },
  { key: '만두국', kw: ['만두국', '만둣국'], noodle: false, desc: '만두국' },
  { key: '수제비', kw: ['수제비'], noodle: false, desc: '수제비' },
  // 국밥·탕
  { key: '국밥', kw: ['국밥'], noodle: false, desc: '국밥(밥이 말아진 상태, 밥은 건더기 쪽)' },
  { key: '순대국밥', kw: ['순대국밥', '순대국', '순댓국'], noodle: false, desc: '순대국밥(순대·내장, 밥은 따로 또는 말아서 건더기 쪽)' },
  { key: '돼지국밥', kw: ['돼지국밥'], noodle: false, desc: '돼지국밥(뽀얀 돼지뼈 육수)' },
  { key: '콩나물국밥', kw: ['콩나물국밥'], noodle: false, desc: '콩나물국밥' },
  { key: '설렁탕', kw: ['설렁탕'], noodle: false, desc: '설렁탕(소뼈 육수, 소면·고기)' },
  { key: '곰탕', kw: ['곰탕', '꼬리곰탕', '도가니탕'], noodle: false, desc: '곰탕·꼬리곰탕' },
  { key: '갈비탕', kw: ['갈비탕'], noodle: false, desc: '갈비탕' },
  { key: '삼계탕', kw: ['삼계탕', '백숙'], noodle: false, desc: '삼계탕(닭 한 마리·찹쌀)' },
  { key: '감자탕', kw: ['감자탕', '뼈해장국', '뼈다귀해장국'], noodle: false, desc: '감자탕·뼈해장국' },
  { key: '해장국', kw: ['해장국', '선지해장국', '선짓국', '선지국'], noodle: false, desc: '해장국(선지·우거지)' },
  { key: '육개장', kw: ['육개장'], noodle: false, desc: '육개장(기름진 매운 국물)' },
  { key: '추어탕', kw: ['추어탕'], noodle: false, desc: '추어탕(갈아 넣은 걸쭉한 국물)' },
  { key: '매운탕', kw: ['매운탕', '지리', '지리탕', '대구탕'], noodle: false, desc: '생선 매운탕·지리' },
  { key: '알탕', kw: ['알탕'], noodle: false, desc: '알탕' },
  { key: '해물탕', kw: ['해물탕', '꽃게탕', '연포탕'], noodle: false, desc: '해물탕·꽃게탕' },
  { key: '내장탕', kw: ['내장탕', '곱창탕'], noodle: false, desc: '내장탕' },
  { key: '닭곰탕', kw: ['닭곰탕', '닭개장'], noodle: false, desc: '닭곰탕' },
  { key: '어묵탕', kw: ['어묵탕', '어묵국', '오뎅탕', '오뎅국'], noodle: false, desc: '어묵탕' },
  { key: '탕', kw: ['탕'], end: true, noodle: false, desc: '그 밖의 탕(일반)' },
  // 찌개·전골
  { key: '김치찌개', kw: ['김치찌개'], noodle: false, desc: '김치찌개(돼지고기·두부)' },
  { key: '된장찌개', kw: ['된장찌개'], noodle: false, desc: '된장찌개' },
  { key: '순두부찌개', kw: ['순두부찌개', '순두부'], noodle: false, desc: '순두부찌개' },
  { key: '부대찌개', kw: ['부대찌개'], noodle: false, desc: '부대찌개(햄·소시지·라면사리)' },
  { key: '청국장찌개', kw: ['청국장'], noodle: false, desc: '청국장찌개' },
  { key: '동태찌개', kw: ['동태찌개', '생태찌개', '동태탕', '생태탕'], noodle: false, desc: '동태찌개' },
  { key: '찌개', kw: ['찌개'], end: true, noodle: false, desc: '그 밖의 찌개(일반)' },
  { key: '곱창전골', kw: ['곱창전골'], noodle: false, desc: '곱창전골' },
  { key: '전골', kw: ['전골'], end: true, noodle: false, desc: '그 밖의 전골(일반)' },
  // 국
  { key: '미역국', kw: ['미역국'], noodle: false, desc: '미역국(소고기)' },
  { key: '된장국', kw: ['된장국'], noodle: false, desc: '된장국(배추·시금치 등)' },
  { key: '콩나물국', kw: ['콩나물국'], noodle: false, desc: '콩나물국' },
  { key: '북어국', kw: ['북어국', '북엇국', '황태국', '황태해장국'], noodle: false, desc: '북어국·황태국' },
  { key: '무국', kw: ['무국', '뭇국', '소고기무국'], noodle: false, desc: '소고기 무국' },
  { key: '김치국', kw: ['김치국', '김칫국'], noodle: false, desc: '김칫국' },
  { key: '냉국', kw: ['냉국'], noodle: false, desc: '오이냉국·미역냉국' },
  { key: '국', kw: ['국'], end: true, noodle: false, desc: '그 밖의 국(일반)' },
]

/** 국물이 거의 없거나 국물 요리가 아닌 이름(키워드가 들어 있어도 나누지 않는다) */
const NOT_SOUP = /비빔|볶음|볶이|짜장|자장|쟁반|탕수|맛탕|탕평채|그라탕|스프|수프|도리탕|라면땅|스낵|과자|국간장|냉채|쫄면|국수나물|회냉면|국자|약과|사탕|설탕|탕후루/

const PART_SUFFIX = /\s*(?:면\s*·\s*건더기|면건더기|건더기|국물)$/
const SOLID_SUFFIX = /\s*(?:면\s*·\s*건더기|면건더기|건더기)$/
const BROTH_SUFFIX = /\s*국물$/

/** "짬뽕 면·건더기" → "짬뽕". 꼬리가 없으면 그대로(빈칸 정리) */
export function soupBaseName(name: string): string {
  return foodName(name ?? '').replace(PART_SUFFIX, '').trim()
}
/** 이름이 나뉜 한쪽이면 그쪽. "○○ 면·건더기"/"○○ 건더기" → solid, "○○ 국물" → broth */
export function soupPartOf(name: string): 'solid' | 'broth' | null {
  const n = foodName(name ?? '')
  if (SOLID_SUFFIX.test(n)) return 'solid'
  if (BROTH_SUFFIX.test(n)) return 'broth'
  return null
}

const compact = (s: string) => s.replace(/[\s()[\]{}·_,.]/g, '')

/** 요리 이름(꼬리 "면·건더기"/"국물"은 떼고 본다) → 요리 종류. 국물 요리가 아니면 null */
export function brothKindOf(name: string): BrothKind | null {
  const base = compact(soupBaseName(name))
  if (!base || NOT_SOUP.test(base)) return null
  let best: BrothKind | null = null
  let bestLen = 0
  for (const k of BROTH_KINDS) {
    for (const w of k.kw) {
      const hit = k.end ? base.endsWith(w) : base.includes(w)
      if (hit && w.length > bestLen) {
        best = k
        bestLen = w.length
      }
    }
  }
  return best
}

/** 국물 요리(표의 요리 종류에 맞는 이름)인지. 표 없이 동기로 판단한다 */
export function isSoupDish(name: string): boolean {
  return brothKindOf(name) !== null
}

/** 나뉜 두 항목의 이름. 면이 든 요리는 "○○ 면·건더기", 아니면 "○○ 건더기" */
export function soupPartNames(dish: string): { solid: string; broth: string } {
  const d = soupBaseName(dish)
  const k = brothKindOf(d)
  return { solid: `${d} ${k?.noodle ? '면·건더기' : '건더기'}`, broth: `${d} 국물` }
}

// ── 표 받기 ──
export const BROTH_URL = `${import.meta.env?.BASE_URL ?? '/'}data/broth-20261029.json`

/** 국물 몫 검사: 모든 키가 0~1, 무게 몫 0.1~0.95. 아니면 null */
export function checkShare(v: unknown): BrothShare | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const out = {} as BrothShare
  for (const k of SHARE_KEYS) {
    const x = o[k]
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1) return null
    out[k] = x
  }
  if (out.weight < 0.1 || out.weight > 0.95) return null
  return out
}

async function fetchDefault(): Promise<BrothTable> {
  const res = await fetch(BROTH_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as BrothTable
}

let loading: Promise<BrothTable> | null = null

/** 국물 몫 표를 한 번만 받는다. 실패하면 1회 재시도 후 reject하고 다음 호출에서 다시 시도한다. fetchTable은 Node 시험용(첫 호출의 것만 쓴다) */
export function loadBroth(fetchTable: () => Promise<BrothTable> = fetchDefault): Promise<BrothTable> {
  loading ??= fetchTable()
    .catch(() => fetchTable())
    .catch((e: unknown) => {
      loading = null
      throw e
    })
  return loading
}

/** 표에서 이름의 국물 몫. 국물 요리가 아니거나 표에 없거나 형식이 틀리면 null */
export function brothShareOf(t: BrothTable | null | undefined, name: string): BrothShare | null {
  const k = brothKindOf(name)
  if (!k || !t?.kinds) return null
  return checkShare(t.kinds[k.key])
}

// ── 나누기 계산 ──
/** 세부 영양소마다 따르는 국물 몫 */
const DETAIL_SHARE: Record<DetailKey, keyof BrothShare> = {
  sugar_g: 'sugar',
  fiber_g: 'carbs',
  satfat_g: 'fat',
  transfat_g: 'fat',
  polyunsat_g: 'fat',
  monounsat_g: 'fat',
  cholesterol_mg: 'protein',
  sodium_mg: 'sodium',
  potassium_mg: 'weight',
}
const NUT_SHARE: Record<keyof Nutrients, keyof BrothShare> = { kcal: 'kcal', carbs_g: 'carbs', protein_g: 'protein', fat_g: 'fat' }
const r2 = (v: number) => Math.round(v * 100) / 100

function per100Ok(p: Nutrients): boolean {
  if (![p.kcal, p.carbs_g, p.protein_g, p.fat_g].every((x) => Number.isFinite(x) && x >= 0)) return false
  return p.kcal <= 900 && p.carbs_g <= 100 && p.protein_g <= 100 && p.fat_g <= 100 && p.carbs_g + p.protein_g + p.fat_g <= 100
}

/**
 * 한 그릇 값(100g당 per·세부 detail, 무게 total)을 국물 몫으로 두 부분에 나눈 100g당 값.
 * 두 부분 무게는 solidG + brothG(= total). 몫 s인 영양소: 국물 쪽 총량 = 한 그릇 총량 × s → 국물 100g당 = 총량 × s ÷ brothG × 100.
 * 범위(kcal 900, 탄단지 100, 합 100)를 벗어나면 null.
 */
export function splitPer100(
  per: Nutrients,
  detail: DetailNutrients | undefined,
  share: BrothShare,
  solidG: number,
  brothG: number,
): { solid: { per: Nutrients; detail?: DetailNutrients }; broth: { per: Nutrients; detail?: DetailNutrients } } | null {
  if (!(solidG > 0) || !(brothG > 0)) return null
  const total = solidG + brothG
  const sp = {} as Nutrients
  const bp = {} as Nutrients
  for (const k of Object.keys(NUT_SHARE) as (keyof Nutrients)[]) {
    const amount = (Math.max(0, per[k]) * total) / 100
    const s = share[NUT_SHARE[k]]
    bp[k] = r2(((amount * s) / brothG) * 100)
    sp[k] = r2(((amount * (1 - s)) / solidG) * 100)
  }
  if (!per100Ok(sp) || !per100Ok(bp)) return null
  let sd: DetailNutrients | undefined
  let bd: DetailNutrients | undefined
  if (detail) {
    sd = {}
    bd = {}
    for (const k of DETAIL_KEYS) {
      const v = detail[k]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      const amount = (v * total) / 100
      const s = share[DETAIL_SHARE[k]]
      bd[k] = r2(((amount * s) / brothG) * 100)
      sd[k] = r2(((amount * (1 - s)) / solidG) * 100)
    }
  }
  return { solid: { per: sp, ...(sd ? { detail: sd } : {}) }, broth: { per: bp, ...(bd ? { detail: bd } : {}) } }
}

/** 나눌 때 원래 무게에 맞지 않게 되는 표시는 뺀다(공개 중량·프랜차이즈 1개 참고값) */
function stripWhole(item: MealItem): MealItem {
  const next: MealItem = { ...item }
  delete next.grams_source
  delete next.published_g
  delete next.unit_count
  delete next.grams_basis
  delete next.franchise_ref
  return next
}

/**
 * 표가 주어졌을 때의 동기 버전. 한 항목(요리 한 그릇)을 국물 몫으로 "○○ 면·건더기"/"○○ 국물" 두 항목으로 나눈다.
 * - 무게: 국물 = round(before_grams × 무게 몫), 면·건더기 = 나머지(합 = 원래). brothGrams를 주면 그 값(사진 경로).
 * - 100g당 값: 두 항목을 다 먹으면 원래 합계와 같게 몫으로 다시 계산(splitPer100). 세부 영양소도 같은 방식(출처는 이어받음).
 * - 출처 배지·DB 필드·남긴 비율·eaters·confidence·브랜드는 이어받고, 두 항목에 soup_of(요리 이름)를 둔다.
 * - id: 면·건더기는 원래 id, 국물은 원래 id + "b".
 * 나눌 수 없으면 null: 국물 요리가 아님·표에 없음·이미 나뉨(soup_of 또는 이름 꼬리)·per_100g 없음(직접 입력)·칼로리 직접 고침·무게 2g 미만·범위 초과.
 */
export function splitSoupItemWith(t: BrothTable | null | undefined, item: MealItem, brothGrams?: number): [MealItem, MealItem] | null {
  if (!item || item.soup_of || soupPartOf(item.name) !== null) return null
  if (!item.per_100g || item.kcal_overridden) return null
  const share = brothShareOf(t, item.name)
  if (!share) return null
  const total = Math.round(Number(item.before_grams))
  if (!(total >= 2)) return null
  const bg = brothGrams !== undefined ? Math.round(brothGrams) : Math.round(total * share.weight)
  const brothG = Math.min(total - 1, Math.max(1, bg))
  const solidG = total - brothG
  const parts = splitPer100(item.per_100g, item.detail_per_100g, share, solidG, brothG)
  if (!parts) return null
  const dish = soupBaseName(item.name)
  const names = soupPartNames(dish)
  const base = stripWhole(item)
  const make = (id: string, name: string, g: number, p: { per: Nutrients; detail?: DetailNutrients }): MealItem => {
    const next: MealItem = { ...base, id, name, before_grams: g, per_100g: p.per, soup_of: dish }
    if (p.detail && item.detail_source) next.detail_per_100g = p.detail
    else {
      delete next.detail_per_100g
      delete next.detail_source
      delete next.detail_consumed
    }
    return recomputeItem(next)
  }
  return [make(item.id, names.solid, solidG, parts.solid), make(`${item.id}b`, names.broth, brothG, parts.broth)]
}

/** 표를 받아 splitSoupItemWith. 표를 못 받으면 null */
export async function splitSoupItem(item: MealItem): Promise<[MealItem, MealItem] | null> {
  let t: BrothTable
  try {
    t = await loadBroth()
  } catch {
    return null
  }
  return splitSoupItemWith(t, item)
}

/**
 * 나뉜 두 항목을 한 항목(요리 한 그릇)으로 다시 합친다. 같은 soup_of이고 한쪽은 면·건더기, 한쪽은 국물일 때만(순서 상관없음).
 * 무게는 합, 100g당 값은 무게 가중 평균(두 항목 총량의 합 그대로), 세부 영양소는 두 항목에 모두 있는 키만.
 * 남긴 비율: 같으면 그대로, 다르면 무게 가중 평균(먹은 무게 보존. 이때 kcal 합계는 조금 달라질 수 있다), 한쪽이 null이면 null.
 * id는 면·건더기 쪽, 이름은 요리 이름, confidence는 낮은 쪽, eaters·출처는 면·건더기 쪽. 칼로리를 직접 고친 항목이 있으면 null.
 */
export function mergeSoupItems(a: MealItem, b: MealItem): MealItem | null {
  if (!a || !b || !a.soup_of || a.soup_of !== b.soup_of || a.id === b.id) return null
  const pa = soupPartOf(a.name)
  const pb = soupPartOf(b.name)
  if (!pa || !pb || pa === pb) return null
  const [s, br] = pa === 'solid' ? [a, b] : [b, a]
  if (!s.per_100g || !br.per_100g || s.kcal_overridden || br.kcal_overridden) return null
  const gs = Math.max(0, Number(s.before_grams) || 0)
  const gb = Math.max(0, Number(br.before_grams) || 0)
  const g = gs + gb
  if (!(g > 0)) return null
  const per = {} as Nutrients
  for (const k of Object.keys(NUT_SHARE) as (keyof Nutrients)[]) per[k] = r2((s.per_100g[k] * gs + br.per_100g[k] * gb) / g)
  const next: MealItem = { ...s, name: s.soup_of!, before_grams: g, per_100g: per, confidence: Math.min(s.confidence, br.confidence) }
  delete next.soup_of
  const rs = s.remaining_ratio
  const rb = br.remaining_ratio
  next.remaining_ratio = rs === null || rb === null ? null : rs === rb ? rs : Math.round(((rs * gs + rb * gb) / g) * 1000) / 1000
  if (next.ratio_assumed && !(br.ratio_assumed === 'not_visible' && next.remaining_ratio === 0)) delete next.ratio_assumed
  if (s.detail_per_100g && br.detail_per_100g) {
    const d: DetailNutrients = {}
    for (const k of DETAIL_KEYS) {
      const x = s.detail_per_100g[k]
      const y = br.detail_per_100g[k]
      if (typeof x === 'number' && typeof y === 'number') d[k] = r2((x * gs + y * gb) / g)
    }
    next.detail_per_100g = d
  } else delete next.detail_per_100g
  return recomputeItem(next)
}
