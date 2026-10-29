// 치킨 1마리 무게(2026-10-29 사용자 결정, CLAUDE.md "프랜차이즈 보충표" bullet 끝 "치킨 1마리 무게").
// 출처: 사용자 제공 조사표(완제품 무게 − 포장 무게, 두 번 잰 평균), 2026-10-29. 원본 그림 _workspace/00_input/franchise/chicken_weights_table.webp
// 공식 값이 아니므로 화면은 "공개 중량"이 아니라 "1마리 · 약 ○○g"(MealItem.grams_basis 'typical')로 보인다.
// 상대 import에 .ts를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러온다.
import { normalizeFoodName } from './normalize.ts'

/** 뼈 있는 치킨의 먹는 부분 비율(뼈 무게를 뺀다). 0.73의 근거:
 *  - USDA SR Legacy(미국 농무부 식품성분표)의 튀긴 닭 "broilers or fryers, meat and skin, cooked, fried, batter"(튀김옷 입힌 통닭)
 *    폐기율(뼈)이 약 27%다(부위별로 가슴 ≈13%, 넓적다리 ≈23%, 북채 ≈34%, 날개 ≈39%).
 *  - 한국 프라이드치킨은 한 마리(보통 10호, 생닭 약 950~1,050g)를 뼈째 토막 내 튀김옷을 두껍게 입혀 튀기므로 튀김옷 무게가 커서
 *    뼈 비율이 위 값과 비슷하거나 조금 낮다 → 먹는 부분 0.73(대략 0.70~0.75 범위의 가운데).
 *  순살은 뼈가 없으니 표 무게 그대로 쓴다. */
export const EDIBLE_BONE_IN = 0.73

export const CHICKEN_WEIGHT_SOURCE = '사용자 제공 조사표(완제품 − 포장, 두 번 잰 평균), 2026-10-29'

export interface ChickenBrand {
  /** 보충표 BrandId와 같게(bbq·kyochon·goobne). 보충표에 없는 브랜드는 자체 id */
  id: string
  name: string
  /** 이름 비교용(정규화 전) */
  words: string[]
}
export interface ChickenRow {
  brand: string
  menu: string
  boneless: boolean
  /** 1마리 완제품 무게(g, 포장 뺌, 뼈 포함) */
  grams: number
  /** 메뉴 이름 판단(정규화한 이름에 대해) */
  re: RegExp
}

export const CHICKEN_BRANDS: ChickenBrand[] = [
  { id: 'kyochon', name: '교촌치킨', words: ['교촌', 'kyochon'] },
  { id: 'pelicana', name: '페리카나', words: ['페리카나', 'pelicana'] },
  { id: 'bbq', name: 'BBQ', words: ['bbq', '비비큐'] },
  { id: 'cheogajip', name: '처갓집양념치킨', words: ['처갓집'] },
  { id: 'nene', name: '네네치킨', words: ['네네', 'nene'] },
  { id: 'bhc', name: 'bhc', words: ['bhc', '비에이치씨'] },
  { id: 'goobne', name: '굽네치킨', words: ['굽네', 'goobne'] },
]

/** 조사표 그대로(브랜드·메뉴별, 뼈 있음 6 / 순살 7) */
export const CHICKEN_TABLE: ChickenRow[] = [
  { brand: 'kyochon', menu: '교촌 후라이드', boneless: false, grams: 684.5, re: /후라이드|오리지날|오리지널/ },
  { brand: 'pelicana', menu: '페리카나 후라이드', boneless: false, grams: 707.4, re: /후라이드|프라이드/ },
  { brand: 'bbq', menu: 'BBQ 황금올리브', boneless: false, grams: 762.8, re: /황금올리브|황올/ },
  { brand: 'cheogajip', menu: '처갓집 후라이드', boneless: false, grams: 836.8, re: /후라이드|프라이드/ },
  { brand: 'nene', menu: '네네 후라이드', boneless: false, grams: 841.5, re: /후라이드|프라이드/ },
  { brand: 'bhc', menu: 'bhc 후라이드', boneless: false, grams: 852.5, re: /후라이드|프라이드/ },
  { brand: 'bhc', menu: 'bhc 뿌링클 순살', boneless: true, grams: 527.4, re: /뿌링클/ },
  { brand: 'kyochon', menu: '교촌 허니순살', boneless: true, grams: 528.1, re: /허니/ },
  { brand: 'goobne', menu: '굽네 고추바사삭 순살', boneless: true, grams: 706.4, re: /고추바사삭/ },
  { brand: 'pelicana', menu: '페리카나 순살 파닭', boneless: true, grams: 901.8, re: /파닭/ },
  { brand: 'bbq', menu: 'BBQ 황금올리브 양념 순살', boneless: true, grams: 918.4, re: /황금올리브|황올/ },
  { brand: 'cheogajip', menu: '처갓집 슈프림 양념 순살', boneless: true, grams: 959.0, re: /슈프림/ },
  { brand: 'nene', menu: '네네 오리엔탈파닭 순살', boneless: true, grams: 1102.9, re: /오리엔탈|파닭/ },
]

const avg = (xs: number[]) => Math.round((xs.reduce((a, v) => a + v, 0) / xs.length) * 10) / 10
/** 표 평균(완제품 무게): 뼈 있음 6개 780.9g, 순살 7개 806.3g */
export const CHICKEN_AVG = {
  bone: avg(CHICKEN_TABLE.filter((r) => !r.boneless).map((r) => r.grams)),
  boneless: avg(CHICKEN_TABLE.filter((r) => r.boneless).map((r) => r.grams)),
}

export interface ChickenWeight {
  /** 1마리 먹는 무게(g, 뼈 있음은 × EDIBLE_BONE_IN, 0.1g 반올림) */
  unit_g: number
  /** 표의 1마리 완제품 무게(뼈 포함) */
  table_g: number
  boneless: boolean
  /** menu: 표의 그 메뉴 / brand: 같은 브랜드 같은 종류(뼈·순살) / average: 표 평균 */
  basis: 'menu' | 'brand' | 'average'
  brand: string | null
  /** 반마리·하프 메뉴: 개수를 0.5로 */
  half: boolean
}

const BONE_WORDS = /윙|콤보|콤비|스틱|한마리|뼈/
const BONELESS_WORDS = /순살|살살|속안심|안심|텐더|휠레|필레|너겟|강정/
/** "하프윙"(날개 부위)은 반마리가 아니다. "반반"(두 맛)도 아니다 */
const HALF_WORDS = /반마리|하프(?!윙)|half/

/** 이름(정규화)으로 뼈 있음/순살. 윙·콤보·스틱은 뼈 있음으로(사용자 결정) */
export function isBoneless(name: string): boolean {
  const n = normalizeFoodName(name)
  if (BONE_WORDS.test(n)) return false
  return BONELESS_WORDS.test(n)
}

/** 브랜드 이름(사진·보충표 BrandId·메뉴 이름) → 조사표 브랜드 id. 못 찾으면 null */
export function chickenBrandOf(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const q = normalizeFoodName(t ?? '')
    if (!q) continue
    for (const b of CHICKEN_BRANDS) if (b.id === q || b.words.some((w) => q.includes(normalizeFoodName(w)))) return b.id
  }
  return null
}

/** 치킨 1마리 무게. 순서: 표의 그 브랜드·메뉴 → 같은 브랜드의 같은 종류(뼈/순살) → 표 평균(뼈/순살). 던지지 않는다 */
export function chickenWeight(name: string, brand?: string | null): ChickenWeight {
  const n = normalizeFoodName(name ?? '')
  const boneless = isBoneless(name ?? '')
  const half = HALF_WORDS.test(n) && !/반반/.test(n.replace(/반마리/g, ''))
  const b = chickenBrandOf(brand, name)
  const rows = b ? CHICKEN_TABLE.filter((r) => r.brand === b && r.boneless === boneless) : []
  const hit = rows.find((r) => r.re.test(n))
  const row = hit ?? rows[0]
  const table_g = row ? row.grams : boneless ? CHICKEN_AVG.boneless : CHICKEN_AVG.bone
  const unit_g = Math.round(table_g * (boneless ? 1 : EDIBLE_BONE_IN) * 10) / 10
  return { unit_g, table_g, boneless, basis: hit ? 'menu' : row ? 'brand' : 'average', brand: b, half }
}

/** 한 마리 단위로 세는 치킨 이름인지(사진·직접 입력에서 보충표 메뉴가 아닐 때). 조각·윙·다리·너겟·강정·버거 등은 아니다.
 *  rep: 식약처 DB 대표식품명("닭튀김"이면 이름에 치킨이 없어도 치킨) */
const WHOLE_NAME = /치킨|닭튀김|통닭|후라이드|프라이드/
const NOT_WHOLE =
  /너겟|텐더|강정|가라아게|까스|카츠|커틀릿|버거|샐러드|랩|샌드|다리|팝콘|마요|덮밥|볶음밥|치킨무|무절임|스테이크|브리또|부리또|피자|파스타|도시락|가슴살|조각|pcs|스틱|윙|날개|데리야끼|카레|커리|수프|스프|죽|면|감자|모래집|똥집|껍데기|닭발|꿔바로우|탕수|탕슈|꼬치|쌈|볶음|찜|탕$|국$/i
export function isWholeChicken(name: string, rep?: string | null): boolean {
  const n = normalizeFoodName(name ?? '')
  if (!n || NOT_WHOLE.test(n)) return false
  return rep === '닭튀김' || WHOLE_NAME.test(n)
}
