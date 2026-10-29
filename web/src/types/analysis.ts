// 분석 결과 타입(스펙 4.3절, analysis-schema.json v2와 1:1). 타입만 둔다. 구현은 web/src/analysis/.
// 사용자 결정으로 추가한 필드: MealItem.db_ml_converted, NutritionResult db 분기의 ml_converted(화면 출처 "DB 환산").
// MealItem.db_reference, NutritionResult ai_estimate 분기의 reference: 종류별 차이가 큰 음식이 DB 대표값·일반 이름에만
// 맞았을 때 값은 AI 추정을 쓰고, 그 DB 값은 화면에 참고로만 보인다(2026-10-26 사용자 결정).
// MealItem.grams_source·published_g·unit_count, BeforeItem.whole_count, NutritionResult db 분기의 published_g: 공개 중량(스펙 4.5.5).
// D4-a 세부 영양소(D4-c부터 9가지: 당류·식이섬유·포화지방·트랜스지방·다불포화지방·단일불포화지방·콜레스테롤·나트륨·칼륨, 2026-10-28 사용자 결정): MealItem.detail_per_100g·detail_source·detail_consumed,
// BeforeItem.detail_guess, totals.detail. 영양소마다 식약처 DB 값 → 없으면 호출 A의 100g당 추정("추정" 배지) → 없으면 키를 뺀다(화면 "–").

export type Nutrients = { kcal: number; carbs_g: number; protein_g: number; fat_g: number }
/** 화면: DB / 공식 정보(프랜차이즈 보충표, 2026-10-29) / 검색 기반 / AI 추정 / 직접 입력 */
export type NutritionSource = 'db' | 'official' | 'search' | 'ai_estimate' | 'user_input'
/** official: DB 빈 값을 프랜차이즈 보충표 공식 값으로 채움(2026-10-29) */
export type FillSource = 'ai_estimate' | 'missing' | 'official'
export type DbMatch = 'name' | 'group' | 'partial'

/** 프랜차이즈 보충표(nutrition/franchise.ts) 브랜드 id·단위. franchise.ts의 BrandId·FranchiseUnit과 같다 */
export type FranchiseBrandId = string
export type FranchiseUnitName = '개' | '마리' | '판' | '조각' | '잔' | '인분'
/** 세부 영양소 키. 단위: _g는 g, _mg는 mg. 다불포화·단일불포화는 식약처 원본에 열이 없어 호출 A 추정만 있다.
 *  D4-a(4가지)로 저장된 기록·캐시도 그대로 맞는다(키는 모두 선택) */
export type DetailKey =
  | 'sugar_g'
  | 'fiber_g'
  | 'satfat_g'
  | 'transfat_g'
  | 'polyunsat_g'
  | 'monounsat_g'
  | 'cholesterol_mg'
  | 'sodium_mg'
  | 'potassium_mg'
/** 100g당 값 또는 먹은 양. 값이 없는 키는 뺀다 */
export type DetailNutrients = Partial<Record<DetailKey, number>>
/** 화면: db → 출처 없음(DB), ai_estimate → "추정" 배지 */
export type DetailSource = 'db' | 'official' | 'ai_estimate'
/** 값으로 쓰지 않고 화면에 참고로만 보이는 DB 행 */
export type DbReference = {
  db_food_code: string
  db_name: string
  db_match: 'group' | 'partial'
  kcal_per_100g: number
  ml_converted?: boolean
}

export interface MealItem {
  /** 모델 항목 "i1"…, 사용자 추가 "u1"… */
  id: string
  name: string
  location?: string
  db_food_code: string | null
  /** v2 */
  db_name?: string | null
  /** v2 */
  db_match?: DbMatch
  /** true면 100ml 기준 DB 값을 1ml=1g으로 환산해 썼다. 화면 출처 "DB 환산" */
  db_ml_converted?: boolean
  /** nutrition_source가 ai_estimate일 때만. 참고로 보이는 DB 대표값(값 계산에는 쓰지 않음) */
  db_reference?: DbReference
  /** 같이 먹은 인원수. 정수 1~20, 기본 1 */
  eaters: number
  before_grams: number
  /** 공개 중량(4.5.5)으로 before_grams = published_g × unit_count를 정했을 때만. 세 필드는 함께 있거나 함께 없다.
   *  사용자가 무게를 고치면 setBeforeGrams가 지운다. 이름을 바꿔도 유지한다. 화면: "공개 중량 223g × 1" */
  grams_source?: 'published'
  /** 공개 중량(g, 식약처 DB 식품중량) */
  published_g?: number
  /** 통째로 보인 개수(호출 A whole_count, 정수 1~10) */
  unit_count?: number
  /** 'typical': published_g가 공식 값이 아니라 치킨 1마리 조사표 무게(2026-10-29, chickenWeight.ts). 화면 "1마리 · 약 ○○g".
   *  공개 중량 세 필드가 있을 때만 둔다(없어지면 함께 지운다) */
  grams_basis?: 'typical'
  /** 0~1, null = 매칭 실패·판단 불확실(다른 음식·장면처럼 보임). null이면 사용자가 고르기 전에는 저장하지 않는다 */
  remaining_ratio: number | null
  /** 같은 장면인데 먹은 후 사진에 그 그릇이 안 보여 remaining_ratio=0(다 먹음)으로 미리 골라 둔 경우만(2026-10-27 사용자 결정).
   *  화면: "그릇이 안 보여서 다 드신 걸로 했어요. 아니면 바꿔 주세요"(노란 표시, 저장 허용). 사용자가 남긴 비율을 고치면 setRemainingRatio가 지운다 */
  ratio_assumed?: 'not_visible'
  consumed_grams: number
  /** user_input일 때만 null */
  per_100g: Nutrients | null
  /** v2 */
  per_100g_fill?: Partial<Record<'carbs_g' | 'fat_g', FillSource>>
  nutrition_source: NutritionSource
  consumed: Nutrients
  kcal_overridden: boolean
  /** 0~1, 사용자 추가 항목은 1 */
  confidence: number
  /** confidence < 0.6 또는 remaining_ratio === null */
  needs_review: boolean
  user_edited?: boolean
  /** 프랜차이즈(2026-10-29): 보충표 브랜드 id. null = 프랜차이즈로 보이지만 가게를 모름(화면 "어느 가게" 칩) */
  brand?: FranchiseBrandId | null
  /** 사진에서 프랜차이즈 메뉴로 보였거나 메뉴를 골랐다 */
  franchise?: boolean
  /** 메뉴 단위(개·마리·판·조각·잔·인분). 개수 표시에 쓴다 */
  unit?: FranchiseUnitName
  /** 연결된 메뉴: 보충표 메뉴 id 그리고/또는 식약처 DB 행 코드 */
  menu_pick?: { menuId?: string; dbCode?: string }
  /** 보충표·DB 어디에도 없는 프랜차이즈 메뉴일 때 같은 브랜드 같은 분류 1개 kcal 평균(참고 표시, 예 "버거킹 버거 평균") */
  franchise_ref?: { label: string; kcal: number }
  /** D4-a. 세부 영양소 100g당 값(값이 있는 키만, 하나도 없으면 필드를 뺀다) */
  detail_per_100g?: DetailNutrients
  /** D4-a. detail_per_100g와 같은 키마다 그 값의 출처 */
  detail_source?: Partial<Record<DetailKey, DetailSource>>
  /** D4-a. 먹은 양 기준 = detail_per_100g × consumed_grams ÷ 100(탄단지와 같은 공식). g 키는 소수 첫째 자리, mg 키는 정수로 저장 */
  detail_consumed?: DetailNutrients
  /** 국물 요리 나누기(2026-10-29): 한 그릇을 "○○ 면·건더기"/"○○ 국물" 두 항목으로 나눴을 때 두 항목에 같은 요리 이름(예: "짬뽕").
   *  화면은 이 값으로 두 항목을 한 묶음·대표 이름으로 보인다. 나누지 않은 항목에는 없다 */
  soup_of?: string
}

export interface MealIntakeAnalysis {
  items: MealItem[]
  totals: {
    before_kcal: number
    consumed: Nutrients
    /** D4-a. 그 영양소 값이 있는 음식만 더한 합(value)과 그 음식 수(count). 값 있는 음식이 0개인 키는 뺀다(하나도 없으면 필드를 뺀다) */
    detail?: Partial<Record<DetailKey, { value: number; count: number }>>
  }
  warnings: string[]
  model?: string
  prompt_version?: string
}

// 호출 A·B 결과(응답 스키마 A·B + 메타). Firestore에는 BeforeAnalysis만 저장한다.
export interface BeforeItem {
  id: string
  name: string
  location: string
  before_grams: number
  confidence: number
  /** 범위 검사에 실패하면 null */
  per_100g_guess: Nutrients | null
  /** a3: 한 개·한 마리·한 판·1인분이 통째로 보이는 개수(정수 1~10). 일부·조각·나눠 담김·정해진 크기 없음이면 null.
   *  a2 이전에 저장된 먹기 전 결과에는 없을 수 있어 선택 필드로 둔다(없으면 null과 같다) */
  whole_count?: number | null
  /** D4-b에서 채움: 호출 A가 함께 준 세부 영양소 100g당 추정(범위 검사에 실패한 키는 뺀다). 없거나 null이면 추정 없음 */
  detail_guess?: DetailNutrients | null
  /** a10: 프랜차이즈(체인점) 메뉴로 보이면 true. 예전 결과에는 없다 */
  franchise?: boolean
  /** a10: 포장지·로고·컵에 보이는 브랜드 이름(모델 표기 그대로, 한글). 보이지 않으면 null. BrandId 맞추기는 assembleAnalysis가 한다 */
  brand?: string | null
  /** a11: 국물 요리를 면·건더기/국물 두 항목으로 나눴을 때 두 항목에 같은 요리 이름(짧은 칸 ds, 예: "짬뽕"). 나누지 않은 음식은 null·없음 */
  dish?: string | null
}
export interface BeforeAnalysis { items: BeforeItem[]; warnings: string[]; model: string; prompt_version: string }
export interface AfterItem {
  id: string
  remaining_ratio: number | null
  confidence: number
  /** 같은 장면인데 그 그릇이 안 보여 remaining_ratio=0으로 둔 경우(MealItem.ratio_assumed로 옮긴다) */
  ratio_assumed?: 'not_visible'
}
export interface AfterAnalysis {
  items: AfterItem[]
  warnings: string[]
  used_before_photo: boolean
  model: string
  prompt_version: string
}

// resolveNutrition 결과(스펙 4.3절 nutrition/index.ts)
export type NutritionResult =
  | {
      source: 'db'
      per_100g: Nutrients
      fill?: Partial<Record<'carbs_g' | 'fat_g', FillSource>>
      db_food_code: string
      db_name: string
      db_match: DbMatch
      /** 화면 출처 "DB 환산" */
      ml_converted?: true
      /** 매칭된 행의 공개 중량(g, 4.5.5). assembleAnalysis가 db_match === 'name'이고 whole_count가 있을 때만 쓴다 */
      published_g?: number
    }
  | {
      source: 'search'
      per_100g: Nutrients
      /** 화면 표시용. 저장하지 않는다 */
      searchSuggestionHtml: string | null
      groundingSources: { title?: string; uri: string }[]
    }
  | {
      /** 프랜차이즈 메뉴 칼로리가 보충표 공식 값(2026-10-29). 화면 배지 "공식 정보". 다른 영양소는 fill에 출처(DB 값은 표시 없음) */
      source: 'official'
      per_100g: Nutrients
      fill?: Partial<Record<'carbs_g' | 'fat_g', FillSource>>
    }
  | {
      source: 'ai_estimate'
      per_100g: Nutrients
      via: 'guess' | 'call_d'
      reference?: DbReference
      /** 호출 D(d2)가 함께 준 보통 1인분 무게(g, 5~1500). 직접 입력 새 음식의 무게로 쓴다(2026-10-29, 표시 없음) */
      serving_g?: number
    }
  /** 3단계가 모두 실패 */
  | { source: 'user_input'; per_100g: null }
