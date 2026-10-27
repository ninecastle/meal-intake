// 끼니별 먹은 시간(디자인 조각 D3, 2026-10-27 사용자 결정). AI 호출 없음.
// 하루 문서 users/{uid}/days/{dateKey}의 mealTimes: { [MealType]: "HH:MM" }(24시간, 서울 시각). 공복 표시(fasting.ts)와 같은 문서라
// setDoc merge로 끼니 하나만 쓴다(다른 끼니 시각·fasted는 그대로). 규칙 v5(firestore.rules validMealTimes)가 형식을 막는다.
// 그 끼니의 첫 기록 때 비어 있으면 채운다(fillMealTime): 카메라는 찍은 시각, 앨범 사진은 사진의 찍은 시각, 직접 입력은 저장 시각.
import { doc, getDoc, getDocFromCache, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { APP_TIMEZONE } from '../lib/time'
import type { MealType } from './meals'

export type MealTimes = Partial<Record<MealType, string>>

const HM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const dayRef = (uid: string, dateKey: string) => doc(db, 'users', uid, 'days', dateKey)

const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 서울 시각 "HH:MM" */
export function toHm(d: Date): string {
  const parts = hmFmt.formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('hour')}:${get('minute')}`
}

export function isHm(v: unknown): v is string {
  return typeof v === 'string' && HM_RE.test(v)
}

function readTimes(v: unknown): MealTimes {
  const out: MealTimes = {}
  if (!v || typeof v !== 'object') return out
  for (const m of MEAL_TYPES) {
    const t = (v as Record<string, unknown>)[m]
    if (isHm(t)) out[m] = t
  }
  return out
}

/** 그날 끼니별 먹은 시간. 문서가 없거나 값이 틀리면 빈 객체. */
export function subscribeMealTimes(
  uid: string,
  dateKey: string,
  onData: (times: MealTimes) => void,
  onError?: () => void,
): () => void {
  return onSnapshot(
    dayRef(uid, dateKey),
    (s) => onData(readTimes(s.exists() ? (s.data() as { mealTimes?: unknown }).mealTimes : undefined)),
    (e) => {
      console.warn('[mealTimes] 구독 오류', e)
      onError?.()
    },
  )
}

/** 그 끼니 시각을 바꾼다. 오프라인이면 서버 확인까지 끝나지 않는다(구독에는 바로 들어간다). */
export async function setMealTime(uid: string, dateKey: string, meal: MealType, hm: string): Promise<void> {
  if (!isHm(hm)) throw new Error(`시각 형식 오류: ${hm}`)
  await setDoc(dayRef(uid, dateKey), { dateKey, mealTimes: { [meal]: hm }, updatedAt: serverTimestamp() }, { merge: true })
}

/** 그 끼니 시각이 비어 있을 때만 at으로 채운다(캐시 → 서버 순으로 확인). 실패해도 던지지 않는다(기록 저장을 막지 않는다). */
export async function fillMealTime(uid: string, dateKey: string, meal: MealType, at: Date): Promise<void> {
  try {
    const ref = dayRef(uid, dateKey)
    let data: unknown
    try {
      const c = await getDocFromCache(ref)
      data = c.exists() ? c.data() : undefined
    } catch {
      const s = await getDoc(ref)
      data = s.exists() ? s.data() : undefined
    }
    if (readTimes((data as { mealTimes?: unknown } | undefined)?.mealTimes)[meal]) return
    await setMealTime(uid, dateKey, meal, toHm(at))
  } catch (e) {
    console.warn('[mealTimes] 자동 채우기 실패', e)
  }
}
