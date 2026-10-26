// 영양값 출처 배지(DB·DB(환산)·검색 기반·AI 추정·직접 입력). 결과 수정 편집기(FoodCard)와 기록 상세(S7)가 함께 쓴다.
import type { MealItem } from '../../types/analysis'
import { SOURCE_BADGE_CLASS, sourceLabel } from '../mealText'

export default function SourceBadge({ item }: { item: Pick<MealItem, 'nutrition_source' | 'db_ml_converted'> }) {
  return (
    <span className={`rounded px-2 py-0.5 font-medium ${SOURCE_BADGE_CLASS[item.nutrition_source]}`}>{sourceLabel(item)}</span>
  )
}
