// 분석 결과 타입(스펙 4.3절, analysis-schema.json v2와 1:1). 타입만 둔다. 구현은 web/src/analysis/.
// 사용자 결정으로 추가한 필드: MealItem.db_ml_converted, NutritionResult db 분기의 ml_converted(화면 출처 "DB(환산)").
// MealItem.db_reference, NutritionResult ai_estimate 분기의 reference: 종류별 차이가 큰 음식이 DB 대표값·일반 이름에만
// 맞았을 때 값은 AI 추정을 쓰고, 그 DB 값은 화면에 참고로만 보인다(2026-10-26 사용자 결정).
// MealItem.grams_source·published_g·unit_count, BeforeItem.whole_count, NutritionResult db 분기의 published_g: 공개 중량(스펙 4.5.5).

export type Nutrients = { kcal: number; carbs_g: number; protein_g: number; fat_g: number }
/** 화면: DB / 검색 기반 / AI 추정 / 직접 입력 */
export type NutritionSource = 'db' | 'search' | 'ai_estimate' | 'user_input'
export type FillSource = 'ai_estimate' | 'missing'
export type DbMatch = 'name' | 'group' | 'partial'
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
  /** true면 100ml 기준 DB 값을 1ml=1g으로 환산해 썼다. 화면 출처 "DB(환산)" */
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
  /** 0~1, null = 매칭 실패 */
  remaining_ratio: number | null
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
}

export interface MealIntakeAnalysis {
  items: MealItem[]
  totals: { before_kcal: number; consumed: Nutrients }
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
}
export interface BeforeAnalysis { items: BeforeItem[]; warnings: string[]; model: string; prompt_version: string }
export interface AfterItem { id: string; remaining_ratio: number | null; confidence: number }
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
      /** 화면 출처 "DB(환산)" */
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
  | { source: 'ai_estimate'; per_100g: Nutrients; via: 'guess' | 'call_d'; reference?: DbReference }
  /** 3단계가 모두 실패 */
  | { source: 'user_input'; per_100g: null }
