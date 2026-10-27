// 홈 연두 띠 "식사"(디자인 조각 D2-H2). 띠 머리(제목)는 홈이 그리고, 이 부품은 띠 안 내용만 그린다:
// 다른 날짜의 이어 할 기록 줄 → 끼니 카드 4개(시안 .meals 2열, MealCard) → 아랫줄 [음식 추천 👑](시안 .linkrow).
// - 카드 내용은 props day(그날 done 기록 요약)에서만 온다(가짜 숫자 없음). 기록 없는 끼니는 "공복했어요" 토글(data/fasting.ts).
// - 이 날짜·이 끼니의 이어 할 기록은 그 카드 안 알약, 다른 날짜의 것은 카드 위 작은 줄(예전 홈 이어 할 기록 카드의 열기·기록 취소).
// - 카드 누르기(D3 끼니 화면 전까지 임시): 그 끼니에 저장된 기록이 있으면 가장 늦은 기록 상세, 없으면 그 날짜·끼니로 먹기 전 촬영.
// - [음식 추천]은 프리미엄 표시만(결제 없음, D12 전까지 "준비 중이에요"). 식단 앨범 버튼은 D9까지 숨긴다.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { setFasted, subscribeFasted } from '../../data/fasting'
import { deleteMeal, type MealType, type MealWithId } from '../../data/meals'
import type { DaySummary } from '../../data/summary'
import { toDateKey } from '../../lib/time'
import { beforePhotoStore } from '../../photos/beforePhotoStore'
import { clockFmt, MEAL_TYPE_LABEL, MEAL_TYPES } from '../mealText'
import { Crown, Toast } from '../ui'
import { MealCard } from './MealCard'

export interface MealBandProps {
  uid: string
  /** 홈에서 보고 있는 날짜(YYYY-MM-DD). 카드로 기록을 시작하면 이 날짜로 들어간다 */
  dateKey: string
  /** 그날 done 기록 요약. 불러오는 중이면 null */
  day: DaySummary | null
  /** 날짜와 무관한 이어 할 기록(awaiting_after·needs_review). 불러오는 중이면 null */
  pending: MealWithId[] | null
}

function shortDate(dateKey: string): string {
  const [, mm, dd] = dateKey.split('-')
  return `${Number(mm)}월 ${Number(dd)}일`
}

function whenText(m: MealWithId, today: string): string {
  const d = m.createdAt?.toDate()
  const t = d ? clockFmt.format(d) : '방금'
  return m.dateKey === today ? t : `${shortDate(m.dateKey)} ${t}`
}

function namesText(m: MealWithId): string {
  const items: { name: string }[] = m.analysis?.items ?? m.beforeAnalysis?.items ?? []
  const names = items.map((i) => i.name).filter(Boolean)
  if (names.length === 0) return '음식 정보 없음'
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개` : names.join(', ')
}

const isMealType = (t: unknown): t is MealType => (MEAL_TYPES as readonly unknown[]).includes(t)

export default function MealBand({ uid, dateKey, day, pending }: MealBandProps) {
  const navigate = useNavigate()
  // 들어온 때의 오늘(렌더마다 시계를 읽지 않는다). 이어 할 기록 줄의 시각 표시에만 쓴다.
  const [today] = useState(() => toDateKey(new Date()))
  const subKey = `${uid}/${dateKey}`
  // 날짜를 옮기면 예전 날짜 값을 쓰지 않도록 키와 함께 둔다(효과 안에서 바로 비우지 않는다).
  const [fastState, setFastState] = useState<{ key: string; list: MealType[] } | null>(null)
  const fasted = fastState?.key === subKey ? fastState.list : null
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const key = `${uid}/${dateKey}`
    // 구독 오류면 토글을 그리지 않는다(fasted가 null로 남는다). 오류 기록은 fasting.ts가 남긴다.
    return subscribeFasted(uid, dateKey, (list) => setFastState({ key, list }))
  }, [uid, dateKey])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // 날짜를 옮긴 직후 홈이 아직 예전 날짜 요약을 넘기면 불러오는 중으로 본다.
  const d = day && day.dateKey === dateKey ? day : null
  const here = (pending ?? []).filter((m) => m.dateKey === dateKey && isMealType(m.mealType))
  const others = (pending ?? []).filter((m) => !here.includes(m))

  function showToast(msg: string) {
    window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => setToast(null), 1600)
  }

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
    <div>
      {others.length > 0 && (
        <ul aria-label="이어 할 기록" className="mb-3 space-y-2">
          {others.map((m) => {
            const after = m.status === 'awaiting_after'
            return (
              <li key={m.id} className="flex items-center gap-2 rounded-tile bg-surface py-1.5 pr-1 pl-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink-2">
                    {MEAL_TYPE_LABEL[m.mealType] ?? '식사'} · {whenText(m, today)}
                  </p>
                  <p className="truncate text-sm text-ink">{namesText(m)}</p>
                </div>
                <Link
                  to={after ? `/meal/${m.id}/after` : `/meal/${m.id}/review`}
                  className="focus-ring inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-peach px-3.5 text-sm text-ink"
                >
                  {after ? '남은 음식 찍기' : '확인하기'}
                </Link>
                <button
                  type="button"
                  onClick={() => cancelMeal(m)}
                  className="focus-ring min-h-11 shrink-0 rounded-chip px-2 text-xs text-ink-2 underline"
                >
                  기록 취소
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {actionError && (
        <p role="alert" className="mb-2 text-sm text-peach-deep">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
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

      <div className="mt-3.5 grid grid-cols-1 overflow-hidden rounded-tile bg-surface">
        <button
          type="button"
          onClick={() => showToast('준비 중이에요')}
          className="focus-ring flex min-h-14 items-center justify-center gap-2 whitespace-nowrap text-ink"
        >
          음식 추천 <Crown />
        </button>
      </div>

      <Toast message={toast} />
    </div>
  )
}
