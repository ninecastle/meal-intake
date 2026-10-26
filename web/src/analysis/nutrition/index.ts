// 영양값 모듈 공개 계약(스펙 4.3절 web/src/analysis/nutrition/index.ts).
// resolveNutrition: 1 DB → 2 검색(VITE_SEARCH_GROUNDING=on일 때 자리만, 미구현) → 3 AI 추정(guess, 없으면 호출 D) → user_input.
// 목업(VITE_AI_MOCK=1)에서는 호출 D가 고정 값(MOCK_ESTIMATE)을 돌려주고 영구 캐시를 쓰지 않는다.
import { loadDb } from './db.ts'
import { estimateCache, estimateWithCallD } from './estimate.ts'
import { createNutritionResolver, mockEstimate } from './resolve.ts'

const MOCK = import.meta.env.VITE_AI_MOCK === '1'
const SEARCH_GROUNDING = import.meta.env.VITE_SEARCH_GROUNDING === 'on'

const resolver = createNutritionResolver({
  loadIndex: () => loadDb(),
  estimate: MOCK ? mockEstimate : estimateWithCallD,
  searchGrounding: SEARCH_GROUNDING,
  cache: MOCK ? undefined : estimateCache,
})

/** 오류를 던지지 않는다(AbortError만 예외). guess는 그 이름에 대해 호출 A가 낸 값일 때만 넘긴다 */
export const resolveNutrition = resolver.resolveNutrition

export { createNutritionResolver, mockEstimate, MOCK_ESTIMATE } from './resolve.ts'
export type { EstimateCache, ResolveOptions, ResolverDeps } from './resolve.ts'
export { HIGH_VARIANCE_EXCLUDE, HIGH_VARIANCE_KEYWORDS, isHighVarianceFood } from './highVariance.ts'
export { findBestMatch, listFoodVariants, loadNutritionDb, searchFoodNames, searchFoods } from './db.ts'
export { FOOD_ALIASES, FOOD_WORD_ALIASES, applyWordAliases } from './aliases.ts'
export type { WordAlias } from './aliases.ts'
export type { FoodHit, FoodSuggestion, MfdsFood } from './db.ts'
export { normalizeFoodName } from './normalize.ts'
export { PROMPT_VERSION_D } from './estimate.ts'
