// 홈 연두 띠 "식사"의 내용(조각 D2-S, 시안 home() section.band.lime 안 .meals + .linkrow 마크업·클래스 그대로). 띠·머리(h2)는 홈이 Band로 그린다.
// - 카드 내용은 props day(그날 done 기록 요약)에서만 온다(가짜 숫자 없음). 기록 없는 끼니는 "공복했어요" 토글(data/fasting.ts).
// - 다른 날짜의 이어 할 기록 줄과 카드 안 알약은 (c) PendingMeals 부품.
// - 카드 누르기(D3 끼니 화면 전까지 임시): 그 끼니에 저장된 기록이 있으면 가장 늦은 기록 상세, 없으면 그 날짜·끼니로 먹기 전 촬영.
// - .linkrow [음식 추천 왕관]은 프리미엄 표시만(결제 없음, D12 전까지 onSoon "준비 중이에요"). 식단 앨범은 사진 보관(D9) 전이라
//   시안 photoKeep=false 모양(grid-template-columns:1fr, 버튼 하나)으로 둔다.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { setFasted, subscribeFasted } from '../../data/fasting'
import { deleteMeal, type MealType, type MealWithId } from '../../data/meals'
import type { DaySummary } from '../../data/summary'
import { toDateKey } from '../../lib/time'
import { beforePhotoStore } from '../../photos/beforePhotoStore'
import { MEAL_TYPES } from '../mealText'
import { Crown } from '../ui'
import { InlineError } from './HomeNotices'
import { MealCard } from './MealCard'
import { PendingOtherDays } from './PendingMeals'

export interface MealBandProps {
  uid: string
  /** 홈에서 보고 있는 날짜(YYYY-MM-DD). 카드로 기록을 시작하면 이 날짜로 들어간다 */
  dateKey: string
  /** 그날 done 기록 요약. 불러오는 중이면 null */
  day: DaySummary | null
  /** 날짜와 무관한 이어 할 기록(awaiting_after·needs_review). 불러오는 중이면 null */
  pending: MealWithId[] | null
  /** 아직 없는 화면([음식 추천]): 홈이 "준비 중이에요" 토스트를 띄운다 */
  onSoon: () => void
}

const isMealType = (t: unknown): t is MealType => (MEAL_TYPES as readonly unknown[]).includes(t)

export default function MealBand({ uid, dateKey, day, pending, onSoon }: MealBandProps) {
  const navigate = useNavigate()
  // 들어온 때의 오늘(렌더마다 시계를 읽지 않는다). 이어 할 기록 줄의 시각 표시에만 쓴다.
  const [today] = useState(() => toDateKey(new Date()))
  const subKey = `${uid}/${dateKey}`
  // 날짜를 옮기면 예전 날짜 값을 쓰지 않도록 키와 함께 둔다(효과 안에서 바로 비우지 않는다).
  const [fastState, setFastState] = useState<{ key: string; list: MealType[] } | null>(null)
  const fasted = fastState?.key === subKey ? fastState.list : null
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const key = `${uid}/${dateKey}`
    // 구독 오류면 토글을 그리지 않는다(fasted가 null로 남는다). 오류 기록은 fasting.ts가 남긴다.
    return subscribeFasted(uid, dateKey, (list) => setFastState({ key, list }))
  }, [uid, dateKey])

  // 날짜를 옮긴 직후 홈이 아직 예전 날짜 요약을 넘기면 불러오는 중으로 본다.
  const d = day && day.dateKey === dateKey ? day : null
  const here = (pending ?? []).filter((m) => m.dateKey === dateKey && isMealType(m.mealType))
  const others = (pending ?? []).filter((m) => !here.includes(m))

  function openMeal(meal: MealType) {
    const saved = d ? d.meals.filter((m) => m.mealType === meal) : []
    // meals는 createdAt 오름차순(서버 시각이 아직 없는 방금 저장한 기록은 맨 뒤)이라 마지막이 가장 늦은 기록이다.
    const last = saved[saved.length - 1]
    navigate(last ? `/meal/${last.id}` : `/capture/before?date=${dateKey}&meal=${meal}`)
  }

  function toggleFasted(meal: MealType) {
    if (!fasted) return
    setActionError(null)
    // 기다리지 않는다(오프라인이면 끝나지 않는다). 구독은 로컬 캐시로 바로 바뀐다.
    setFasted(uid, dateKey, meal, !fasted.includes(meal)).catch(() =>
      setActionError('공복 표시를 저장하지 못했어요. 잠시 뒤 다시 해 주세요.'),
    )
  }

  function cancelMeal(m: MealWithId) {
    if (!window.confirm('이 기록을 취소할까요?')) return
    setActionError(null)
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다). 목록은 로컬 캐시로 바로 바뀐다.
    deleteMeal(uid, m.id).catch(() => setActionError('기록을 취소하지 못했어요. 잠시 뒤 다시 해 주세요.'))
    beforePhotoStore.remove(m.id).catch((e: unknown) => console.warn('[home] 먹기 전 사진 삭제 실패', e))
  }

  return (
    <>
      <PendingOtherDays meals={others} today={today} onCancel={cancelMeal} />
      {actionError && <InlineError message={actionError} />}
      <div className="meals">
        {MEAL_TYPES.map((meal) => (
          <MealCard
            key={meal}
            meal={meal}
            total={d ? d.byMealType[meal] : null}
            foods={d ? d.meals.filter((m) => m.mealType === meal).flatMap((m) => m.itemNames.filter(Boolean)) : []}
            pending={here.filter((m) => m.mealType === meal)}
            fasted={fasted ? fasted.includes(meal) : null}
            onToggleFasted={() => toggleFasted(meal)}
            onOpen={() => openMeal(meal)}
          />
        ))}
      </div>
      <div className="linkrow" style={{ gridTemplateColumns: '1fr' }}>
        <button type="button" onClick={onSoon}>
          음식 추천 <Crown />
        </button>
      </div>
    </>
  )
}
