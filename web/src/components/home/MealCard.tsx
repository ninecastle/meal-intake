// 홈 연두 띠의 끼니 카드 하나(조각 D2-S, 시안 home() mealCard 마크업·클래스 그대로):
// div.meal(style background:var(--sky) 등) > button.mealhit + .mtop(span.micowrap > svg.mico, span.plus > svg) + h3
// + (기록 있음) span.mk.num "N kcal" + span.mfood "첫 음식 외 n개" / (기록 없음) button.skip(.on) > span.ck > svg + "공복했어요".
// 카드 전체가 버튼(.mealhit, "아침 기록하기" 등)이고, 그 위의 글·그림은 시안 CSS가 누르기를 통과시킨다(.skip만 받는다).
// 이 날짜·이 끼니의 이어 할 기록 알약은 (c) PendingMeals 부품.
import type { MealType, MealWithId } from '../../data/meals'
import { MEAL_TYPE_LABEL } from '../mealText'
import { MealArt } from '../ui'
import { PendingPills } from './PendingMeals'

/** 시안 meals[k].card */
const CARD_BG: Record<MealType, string> = {
  breakfast: 'var(--sky)',
  lunch: 'var(--lime)',
  dinner: 'var(--peach)',
  snack: 'var(--butter)',
}

export interface MealCardProps {
  meal: MealType
  /** 그 끼니 done 기록 합계·개수. 불러오는 중이면 null */
  total: { kcal: number; count: number } | null
  /** 그 끼니 done 기록들의 음식 이름(기록 순서) */
  foods: string[]
  /** 이 날짜·이 끼니의 이어 할 기록(awaiting_after·needs_review) */
  pending: MealWithId[]
  /** 공복 표시. 불러오는 중이면 null(토글을 그리지 않는다) */
  fasted: boolean | null
  onToggleFasted: () => void
  onOpen: () => void
}

export function MealCard({ meal, total, foods, pending, fasted, onToggleFasted, onOpen }: MealCardProps) {
  const label = MEAL_TYPE_LABEL[meal]
  const hasDone = total != null && total.count > 0
  // 기록이 있거나 이어 할 기록이 있는 끼니에는 공복 토글을 보이지 않는다.
  const showSkip = total != null && !hasDone && pending.length === 0 && fasted != null

  return (
    <div className="meal" style={{ background: CARD_BG[meal] }}>
      <button type="button" className="mealhit" aria-label={`${label} 기록하기`} onClick={onOpen}></button>
      <div className="mtop">
        <span className="micowrap">
          <MealArt meal={meal} className="mico" />
        </span>
        <span className="plus" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>
      <h3>{label}</h3>
      {hasDone && (
        <>
          <span className="mk num">{Math.round(total.kcal)} kcal</span>
          {foods.length > 0 && (
            <span className="mfood">
              {foods[0]}
              {foods.length > 1 ? ` 외 ${foods.length - 1}개` : ''}
            </span>
          )}
        </>
      )}
      <PendingPills meals={pending} />
      {showSkip && (
        <button type="button" className={fasted ? 'skip on' : 'skip'} aria-pressed={fasted} onClick={onToggleFasted}>
          <span className="ck" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M4 8.5l2.5 2.5L12 5.5" />
            </svg>
          </span>
          공복했어요
        </button>
      )}
    </div>
  )
}
