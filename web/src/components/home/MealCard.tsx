// 홈 연두 띠의 끼니 카드 하나(디자인 조각 D2). 모양·색·글자 크기는 시안 mealCard와 CSS .meal·.mtop·.micowrap·.plus·.mk·
// .mfood·.skip·.ck·.mealhit 그대로. 카드 전체가 버튼(.mealhit, aria-label "아침 기록하기" 등)이고, 그 위의 글·그림은 누르기를 통과시킨다.
// 위에 따로 누르는 것: 공복 토글(.skip, 기록 없는 끼니만)과 이어 할 기록 알약(이 날짜·이 끼니, 시안에 없어 .chipbtn 모양).
import { Link } from 'react-router'
import type { MealType, MealWithId } from '../../data/meals'
import { formatKcal, MEAL_TYPE_LABEL } from '../mealText'
import { MealArt } from '../ui'

/** 시안 meals[k].card */
const CARD_BG: Record<MealType, string> = {
  breakfast: 'bg-sky',
  lunch: 'bg-lime',
  dinner: 'bg-peach',
  snack: 'bg-butter',
}

/** 카드 안 글·그림: 시안 `.meal>*:not(.mealhit){position:relative;z-index:1;pointer-events:none}` */
const LAYER = 'pointer-events-none relative z-1'

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
  const foodText = foods.length > 0 ? `${foods[0]}${foods.length > 1 ? ` 외 ${foods.length - 1}개` : ''}` : ''

  return (
    <div
      className={`relative flex min-h-[150px] flex-col gap-2.5 rounded-card p-4 text-left hover:ring-3 hover:ring-ink/15 ${CARD_BG[meal]}`}
    >
      <button
        type="button"
        aria-label={`${label} 기록하기`}
        onClick={onOpen}
        className="focus-ring absolute inset-0 z-0 rounded-[inherit]"
      />
      <div className={`${LAYER} flex items-start justify-between`}>
        <MealArt meal={meal} framed />
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-surface">
          <svg viewBox="0 0 24 24" className="block size-6 fill-none stroke-ink" strokeWidth={2.6} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </div>
      <h3 className={`${LAYER} m-0 whitespace-nowrap text-[17px]`}>{label}</h3>
      {hasDone && (
        <>
          <span className={`${LAYER} num text-xl`}>{formatKcal(total.kcal)} kcal</span>
          {foodText && <span className={`${LAYER} -mt-1.5 truncate text-[13px] text-ink opacity-75`}>{foodText}</span>}
        </>
      )}
      {pending.length > 0 && (
        <div className={`${LAYER} mt-auto flex flex-col items-start gap-1.5`}>
          {pending.map((m) => {
            const after = m.status === 'awaiting_after'
            return (
              <Link
                key={m.id}
                to={after ? `/meal/${m.id}/after` : `/meal/${m.id}/review`}
                className="focus-ring pointer-events-auto inline-flex min-h-10 max-w-full items-center whitespace-nowrap rounded-full bg-surface px-3.5 text-sm text-ink"
              >
                {after ? '먹은 후 사진 기다림' : '결과 확인 기다림'}
              </Link>
            )
          })}
        </div>
      )}
      {showSkip && (
        <button
          type="button"
          aria-pressed={fasted}
          onClick={onToggleFasted}
          className={`focus-ring relative z-1 mt-auto flex min-h-11 items-center gap-2 self-start text-[15px] text-ink ${fasted ? '' : 'opacity-55'}`}
        >
          <span aria-hidden="true" className={`grid size-[26px] place-items-center rounded-full ${fasted ? 'bg-ink' : 'bg-surface/70'}`}>
            <svg
              viewBox="0 0 16 16"
              className={`size-4 fill-none ${fasted ? 'stroke-surface' : 'stroke-ink-3'}`}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8.5l2.5 2.5L12 5.5" />
            </svg>
          </span>
          공복했어요
        </button>
      )}
    </div>
  )
}
