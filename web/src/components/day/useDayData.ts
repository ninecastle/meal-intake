// 한눈에·영양소 상세(디자인 조각 D5)가 함께 쓰는 그날 데이터: 날짜(?date, 없거나 미래면 오늘), done 기록 문서, 합계, 그날 비교 목표.
// 합계는 summarizeDay(탄단지·끼니별)·sumDetail(세부 영양소) — 서버 집계 없이 클라이언트에서. 목표는 홈과 같은 규칙
// (그날 목표 기록 → 오늘이고 기록이 없으면 현재 목표). AI 호출 없음.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { subscribeGoal, subscribeGoalForDate, type DatedGoal, type StoredGoal } from '../../data/goals'
import { subscribeDayMeals, type MealWithId } from '../../data/meals'
import { summarizeDay, type DaySummary } from '../../data/summary'
import { toDateKey } from '../../lib/time'
import type { GoalTargets } from '../../analysis/goal'
import { isDateKey } from '../mealText'

export type DayData = {
  dateKey: string
  today: string
  /** 그날 done 기록(불러오는 중이면 null) */
  meals: MealWithId[] | null
  summary: DaySummary | null
  /** 그날 비교 목표. 없으면 null, 불러오는 중이면 undefined */
  targets: GoalTargets | null | undefined
  loadError: boolean
}

export function useDayData(uid: string): DayData {
  const [params] = useSearchParams()
  const [today] = useState(() => toDateKey(new Date()))
  const raw = params.get('date')
  const dateKey = isDateKey(raw) && raw <= today ? raw : today
  const [state, setState] = useState<{ key: string; meals: MealWithId[] } | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [dated, setDated] = useState<{ key: string; goal: DatedGoal | null } | null>(null)
  const [goal, setGoal] = useState<StoredGoal | null | undefined>(undefined)

  useEffect(
    () =>
      subscribeDayMeals(
        uid,
        dateKey,
        (meals) => setState({ key: dateKey, meals }),
        () => setErrorKey(dateKey),
      ),
    [uid, dateKey],
  )
  useEffect(() => subscribeGoalForDate(uid, dateKey, (g) => setDated({ key: dateKey, goal: g }), () => setDated({ key: dateKey, goal: null })), [uid, dateKey])
  useEffect(() => subscribeGoal(uid, setGoal, () => setGoal(null)), [uid])

  const meals = state && state.key === dateKey ? state.meals : null
  const summary = meals ? summarizeDay(dateKey, meals) : null
  const datedGoal = dated && dated.key === dateKey ? dated.goal : undefined
  const targets =
    datedGoal === undefined ? undefined : (datedGoal?.targets ?? (dateKey === today ? (goal === undefined ? undefined : (goal?.targets ?? null)) : null))
  return { dateKey, today, meals, summary, targets, loadError: errorKey === dateKey }
}

/** 시안 제목 "10.27 (화)" */
export function shortDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dow = '일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}.${String(d).padStart(2, '0')} (${dow})`
}
