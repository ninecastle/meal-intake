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

export { checkEstimate, checkServingG, createNutritionResolver, mockEstimate, MOCK_ESTIMATE, MOCK_SERVING_G } from './resolve.ts'
export type { Estimate, EstimateCache, ResolveOptions, ResolverDeps } from './resolve.ts'
export { HIGH_VARIANCE_EXCLUDE, HIGH_VARIANCE_KEYWORDS, isHighVarianceFood } from './highVariance.ts'
export { findBestMatch, listFoodVariants, loadNutritionDb, searchFoodNames, searchFoods, servingOf, servingOfRep, loadServing } from './db.ts'
export type { ServingTable } from './db.ts'
// 프랜차이즈 보충표(2026-10-29). 화면은 표 없이 부르는 비동기 래퍼, 표 인자 버전은 …In
export {
  applyMenuPick, brandMenus, brandMenusIn, brandOfDbCode, brandOfDbCodeIn, categoryOfName, findBrandMenu, franchiseBrands,
  franchiseBrandsIn, franchiseRef, loadFranchise, matchBrand, pickToNutrition, pickToNutritionIn,
} from './franchise.ts'
export type { BrandId, FranchiseBrand, FranchiseMenu, FranchiseTable, FranchiseUnit, MenuPick, PickExtras, PickNutrition } from './franchise.ts'
// D4-a 세부 영양소(당류·나트륨·포화지방·식이섬유) 100g당 값. 앱 DB와 따로 처음 쓸 때 받는다
export { detailFor, loadDetailDb } from './detail.ts'
export type { MfdsDetailDb } from './detail.ts'
export { FOOD_ALIASES, FOOD_WORD_ALIASES, applyWordAliases } from './aliases.ts'
export type { WordAlias } from './aliases.ts'
export type { FoodHit, FoodSuggestion, MfdsFood } from './db.ts'
export { normalizeFoodName } from './normalize.ts'
export { PROMPT_VERSION_D } from './estimate.ts'
// 국물 요리 나누기(2026-10-29). 화면은 nutrition/broth.ts를 직접 불러도 된다
export { brothKindOf, brothShareOf, isSoupDish, loadBroth, mergeSoupItems, soupBaseName, soupPartNames, soupPartOf, splitSoupItem, splitSoupItemWith } from './broth.ts'
export type { BrothShare, BrothTable } from './broth.ts'
