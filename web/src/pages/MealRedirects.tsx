// 예전 주소를 끼니 화면(디자인 조각 D3, /day/:dateKey/:mealType)으로 보낸다. 촬영·먹은 후·기록 상세는 끼니 화면과 그 시트가 맡는다.
// - /meal/:mealId(기록 상세는 없앰): 그 기록의 끼니 화면. awaiting_after면 "남은 음식을 알려 주세요" 시트를 연다.
// - /meal/:mealId/after(먹은 후 촬영): awaiting_after면 그 끼니 화면 + 시트, needs_review면 결과 화면, 그 밖은 끼니 화면.
// - /capture/before?date&meal(먹기 전 촬영): 그 날짜(없거나 미래면 오늘)·끼니(없으면 지금 시각 끼니) 화면 + 식사 기록 시트.
// 기록이 없거나 불러오지 못하면 홈으로.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { isDateKey, MEAL_TYPES } from '../components/mealText'
import { getMeal, type MealType } from '../data/meals'
import { guessMealType, toDateKey } from '../lib/time'

function Waiting() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">불러오는 중…</main>
}

export function MealIdRedirect({ uid, after = false }: { uid: string; after?: boolean }) {
  const { mealId = '' } = useParams()
  const navigate = useNavigate()
  useEffect(() => {
    let alive = true
    getMeal(uid, mealId).then(
      (m) => {
        if (!alive) return
        if (!m) navigate('/', { replace: true })
        else if (after && m.status === 'needs_review') navigate(`/meal/${m.id}/review`, { replace: true })
        else
          navigate(`/day/${m.dateKey}/${m.mealType}`, {
            replace: true,
            state: m.status === 'awaiting_after' ? { openAfter: m.id } : null,
          })
      },
      () => alive && navigate('/', { replace: true }),
    )
    return () => {
      alive = false
    }
  }, [uid, mealId, after, navigate])
  return <Waiting />
}

export function CaptureBeforeRedirect() {
  const [params] = useSearchParams()
  const [now] = useState(() => new Date())
  const today = toDateKey(now)
  const rawDate = params.get('date')
  const dateKey = isDateKey(rawDate) && rawDate <= today ? rawDate : today
  const rawMeal = params.get('meal')
  const meal = (MEAL_TYPES as readonly (string | null)[]).includes(rawMeal) ? (rawMeal as MealType) : guessMealType(now)
  return <Navigate to={`/day/${dateKey}/${meal}`} replace state={{ openRecord: true }} />
}
