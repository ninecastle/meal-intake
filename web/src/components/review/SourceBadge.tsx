// 영양값 출처 배지(DB·DB(환산)·검색 기반·AI 추정·직접 입력). 결과 수정 편집기(FoodCard)와 기록 상세(S7)가 함께 쓴다.
// 색(디자인 조각 D1-b2): DB 하늘(환산은 점선 테두리 더함), 검색 기반 복숭아, AI 추정 버터(테두리로 눈에 띄게), 직접 입력 회색.
import type { MealItem } from '../../types/analysis'
import { sourceLabel } from '../mealText'

const BADGE_CLASS: Record<MealItem['nutrition_source'], string> = {
  db: 'bg-sky-soft text-sky-deep',
  search: 'bg-peach-soft text-peach-deep',
  ai_estimate: 'border border-butter bg-butter-soft text-ink',
  user_input: 'border border-line bg-ground text-ink-2',
}

export default function SourceBadge({ item }: { item: Pick<MealItem, 'nutrition_source' | 'db_ml_converted'> }) {
  const converted = item.nutrition_source === 'db' && item.db_ml_converted ? ' border border-dashed border-sky-deep' : ''
  return (
    <span className={`rounded-md px-2 py-0.5 ${BADGE_CLASS[item.nutrition_source]}${converted}`}>{sourceLabel(item)}</span>
  )
}
