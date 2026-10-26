// 분석 결과 타입(스펙 4.3절, analysis-schema.json v2와 1:1). 타입만 둔다. 구현은 web/src/analysis/.
// 사용자 결정으로 추가한 필드: MealItem.db_ml_converted, NutritionResult db 분기의 ml_converted(화면 출처 "DB(환산)").

export type Nutrients = { kcal: number; carbs_g: number; protein_g: number; fat_g: number }
/** 화면: DB / 검색 기반 / AI 추정 / 직접 입력 */
export type NutritionSource = 'db' | 'search' | 'ai_estimate' | 'user_input'
export type FillSource = 'ai_estimate' | 'missing'
export type DbMatch = 'name' | 'group' | 'partial'

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
  /** 같이 먹은 인원수. 정수 1~20, 기본 1 */
  eaters: number
  before_grams: number
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
    }
  | {
      source: 'search'
      per_100g: Nutrients
      /** 화면 표시용. 저장하지 않는다 */
      searchSuggestionHtml: string | null
      groundingSources: { title?: string; uri: string }[]
    }
  | { source: 'ai_estimate'; per_100g: Nutrients; via: 'guess' | 'call_d' }
  /** 3단계가 모두 실패 */
  | { source: 'user_input'; per_100g: null }
