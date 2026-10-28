// 홈 연두 띠 "식사"(조각 D2-S, 시안 home() section.band.lime > .pad > .bandhead + .meals + .linkrow 마크업·클래스 그대로).
// - 카드 내용은 props day(그날 done 기록 요약)에서만 온다(가짜 숫자 없음). 기록 없는 끼니는 "공복했어요" 토글(data/fasting.ts).
// - (c) 이어 할 기록은 그 날짜·그 끼니 카드에만 보인다(.mfood 자리 글, 2026-10-27 사용자 결정). 다른 날짜의 것은 그 날짜로 가야 보이고,
//   기록 취소는 홈에 없다(먹은 후 촬영 화면의 [기록 취소]).
// - 카드 누르기(D3, 2026-10-27 사용자가 고른 변경): 카드는 늘 그 날짜·끼니의 끼니 화면(/day/:dateKey/:mealType, push + state.fromHome),
//   [+]는 끼니 화면 + 식사 기록 시트(state.openRecord). 기다리는 기록이 있어도 그대로 두고, 먹은 후 시트는 끼니 화면에서 그 묶음을 누를 때만.
// - .linkrow [음식 추천 왕관]은 음식 추천 화면(D12, /recommend, 왕관은 표시만·결제 없음). 추천은 늘 오늘 기준이라 오늘이 아닌 날짜를 볼 때는
//   숨긴다. [식단 앨범](D9)은 식사 사진 보관을 켰을 때만(시안 photoKeep). 버튼이 하나면 시안 photoKeep=false 모양(grid-template-columns:1fr),
//   둘 다 없으면(지난 날짜 + 보관 꺼짐) 줄 자체를 그리지 않는다.
// - (f) 계속 보이는 알림(이어 할 기록 불러오기 오류, 공복 표시 저장 실패)은 띠 맨 위 .callout.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { setFasted, subscribeFasted } from '../../data/fasting'
import type { MealType, MealWithId } from '../../data/meals'
import type { DaySummary } from '../../data/summary'
import { foodName } from '../../lib/foodName'
import { MEAL_TYPES } from '../mealText'
import { Band, Crown } from '../ui'
import { BandNotices } from './HomeNotices'
import { MealCard } from './MealCard'

export interface MealBandProps {
  uid: string
  /** 홈에서 보고 있는 날짜(YYYY-MM-DD). 카드로 기록을 시작하면 이 날짜로 들어간다 */
  dateKey: string
  /** 그날 done 기록 요약. 불러오는 중이면 null */
  day: DaySummary | null
  /** 날짜와 무관한 이어 할 기록(awaiting_after·needs_review). 불러오는 중이면 null */
  pending: MealWithId[] | null
  /** 이어 할 기록 구독 오류 */
  listError: boolean
  /** 오늘을 보고 있는지. 오늘일 때만 [음식 추천] */
  isToday: boolean
  /** [음식 추천] → /recommend */
  onRecommend: () => void
  /** 식사 사진 보관을 켰는지(users/{uid}.prefs.keepPhotos === true). 켰을 때만 [식단 앨범] */
  keepPhotos: boolean
  onAlbum: () => void
}

export default function MealBand({ uid, dateKey, day, pending, listError, isToday, onRecommend, keepPhotos, onAlbum }: MealBandProps) {
  const navigate = useNavigate()
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
  const pendingOf = (meal: MealType) => (pending ?? []).filter((m) => m.dateKey === dateKey && m.mealType === meal)

  function openMeal(meal: MealType, add = false) {
    navigate(`/day/${dateKey}/${meal}`, { state: { fromHome: true, ...(add ? { openRecord: true } : {}) } })
  }

  function toggleFasted(meal: MealType) {
    if (!fasted) return
    setActionError(null)
    // 기다리지 않는다(오프라인이면 끝나지 않는다). 구독은 로컬 캐시로 바로 바뀐다.
    setFasted(uid, dateKey, meal, !fasted.includes(meal)).catch(() =>
      setActionError('공복 표시를 저장하지 못했어요. 잠시 뒤 다시 해 주세요.'),
    )
  }

  return (
    <Band
      tone="lime"
      label="식사"
      title="식사"
      notice={
        <BandNotices items={[listError && '이어 할 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', actionError]} />
      }
    >
      {/* 사용자가 고른 변경 (15): 띠가 늘어난 만큼 구성 사이 빈 칸(.bgap)에 나눈다 */}
      <div className="bgap" aria-hidden="true"></div>
      <div className="meals">
        {MEAL_TYPES.map((meal) => (
          <MealCard
            key={meal}
            meal={meal}
            total={d ? d.byMealType[meal] : null}
            foods={d ? d.meals.filter((m) => m.mealType === meal).flatMap((m) => m.itemNames.map(foodName).filter(Boolean)) : []}
            pending={pendingOf(meal)}
            fasted={fasted ? fasted.includes(meal) : null}
            onToggleFasted={() => toggleFasted(meal)}
            onOpen={() => openMeal(meal)}
            onAdd={() => openMeal(meal, true)}
          />
        ))}
      </div>
      <div className="bgap" aria-hidden="true"></div>
      {(isToday || keepPhotos) && (
        <div className="linkrow" style={isToday && keepPhotos ? undefined : { gridTemplateColumns: '1fr' }}>
          {isToday && (
            <button type="button" onClick={onRecommend}>
              음식 추천 <Crown />
            </button>
          )}
          {keepPhotos && (
            <button type="button" onClick={onAlbum}>
              식단 앨범
            </button>
          )}
        </div>
      )}
    </Band>
  )
}
