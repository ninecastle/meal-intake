// 홈 연두 띠의 끼니 카드 하나(조각 D2-S, 시안 home() mealCard 마크업·클래스 그대로):
// div.meal(style background:var(--sky) 등) > button.mealhit + .mtop(span.micowrap > svg.mico, span.plus > svg) + h3
// + (기록 있음) span.mk.num "N kcal" + span.mfood "첫 음식 외 n개" / (기록 없음) button.skip(.on) > span.ck > svg + "공복했어요".
// 카드 전체가 버튼(.mealhit, "아침 기록하기" 등)이고, 그 위의 글·그림은 시안 CSS가 누르기를 통과시킨다(.skip만 받는다).
// (c) 이 날짜·이 끼니의 이어 할 기록이 있으면 .mfood 자리에 같은 글자 모양으로 "먹은 후 사진 기다림"/"결과 확인 기다림"을 쓴다.
// 누르기(2026-10-27 사용자가 고른 변경): [+](.plus, 시안은 그림이지만 버튼으로)는 새 음식 기록(끼니 화면 + 식사 기록 시트),
// 카드의 나머지는 늘 그 끼니 화면(기다리는 기록이 있어도 시트를 바로 열지 않는다).
import type { MealType, MealWithId } from '../../data/meals'
import { representativeFood } from '../../lib/foodName'
import { MEAL_TYPE_LABEL } from '../mealText'
import { MealArt } from '../ui'

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
  /** 이 날짜·이 끼니의 이어 할 기록(awaiting_after·needs_review). 카드를 누르면 첫 기록으로 간다 */
  pending: MealWithId[]
  /** 공복 표시. 불러오는 중이면 null(토글을 그리지 않는다) */
  fasted: boolean | null
  onToggleFasted: () => void
  /** 카드(나머지 부분): 그 끼니 화면 */
  onOpen: () => void
  /** [+]: 새 음식 기록 */
  onAdd: () => void
}

export function MealCard({ meal, total, foods, pending, fasted, onToggleFasted, onOpen, onAdd }: MealCardProps) {
  const label = MEAL_TYPE_LABEL[meal]
  const hasDone = total != null && total.count > 0
  const next = pending[0]
  const pendingText = next ? (next.status === 'awaiting_after' ? '먹은 후 사진 기다림' : '결과 확인 기다림') : null
  // 기록이 있거나 이어 할 기록이 있는 끼니에는 공복 토글을 보이지 않는다.
  const showSkip = total != null && !hasDone && !next && fasted != null
  // 대표 음식: 맨밥(쌀밥 등)은 건너뛰고 다음 음식(2026-10-28 사용자 요청), "외 n개"는 전체에서 하나 뺀 수
  const foodText = foods.length > 0 ? representativeFood(foods) : null
  const mfood = pendingText ?? (hasDone ? foodText : null)

  return (
    <div className="meal" style={{ background: CARD_BG[meal] }}>
      <button
        type="button"
        className="mealhit"
        aria-label={pendingText ? `${label} ${pendingText}` : `${label} 기록하기`}
        onClick={onOpen}
      ></button>
      <div className="mtop">
        <span className="micowrap">
          <MealArt meal={meal} className="mico" />
        </span>
        {/* 시안 .meal>* 는 누르기를 통과시킨다(pointer-events:none). [+]만 받게 되살린다 */}
        <button type="button" className="plus" aria-label={`${label} 새 음식 기록`} style={{ pointerEvents: 'auto', padding: 0 }} onClick={onAdd}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <h3>{label}</h3>
      {hasDone && <span className="mk num">{`${Math.round(total.kcal)} kcal`}</span>}
      {mfood && <span className="mfood">{mfood}</span>}
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
