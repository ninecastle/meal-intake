// 공복 표시 저장소(디자인 조각 D2, 시안 홈 끼니 카드 "공복했어요"). AI 호출 없음.
// 문서 users/{uid}/days/{dateKey}, 필드는 dateKey(문자열, 경로와 같음)·fasted(MealType 배열)·updatedAt(serverTimestamp)
// (+ 먹은 시간 mealTimes, 자동 공복을 한 번 채운 날 fastAuto: true — 규칙 v11).
// 자동 공복(2026-10-28 사용자 결정): 자정이 지난 날 가운데 기록이 하나라도 있는 날의 빈 아침·점심·저녁을 공복으로 저장한다
// (기록이 하나도 없는 날·간식은 빼고, 서버가 없어 앱을 열 때 최근 7일을 확인). 그 끼니에 기록을 저장하면 공복 저장을 지운다.
// 보안 규칙(firestore.rules)이 이 키 목록대로 막으므로 여기서도 이 세 키만 쓴다. 에뮬레이터 연결은 lib/firebase가 한다.
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { MealType } from './meals'

export type FastingStoreErrorCode = 'FASTED_SAVE_REJECTED' | 'FASTED_STORE_UNAVAILABLE'

export class FastingStoreError extends Error {
  readonly code: FastingStoreErrorCode
  constructor(code: FastingStoreErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options)
    this.name = 'FastingStoreError'
    this.code = code
  }
}

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const dayRef = (uid: string, dateKey: string) => doc(db, 'users', uid, 'days', dateKey)

function errCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
}

function writeError(e: unknown): FastingStoreError {
  if (e instanceof FastingStoreError) return e
  const c = errCode(e)
  if (c === 'permission-denied') return new FastingStoreError('FASTED_SAVE_REJECTED', '저장이 거부됐습니다(보안 규칙)', { cause: e })
  return new FastingStoreError('FASTED_STORE_UNAVAILABLE', `저장소 오류: ${c || String(e)}`, { cause: e })
}

/** 그날 공복으로 표시한 끼니(끼니 순서). 문서가 없거나 값이 틀리면 []. */
export function subscribeFasted(
  uid: string,
  dateKey: string,
  onData: (fasted: MealType[]) => void,
  onError?: (code: FastingStoreErrorCode) => void,
): () => void {
  return onSnapshot(
    dayRef(uid, dateKey),
    (s) => {
      const v = s.exists() ? (s.data() as { fasted?: unknown }).fasted : undefined
      onData(Array.isArray(v) ? MEAL_TYPES.filter((m) => v.includes(m)) : [])
    },
    (e) => {
      console.warn('[fasting] subscribeFasted 오류', e)
      onError?.('FASTED_STORE_UNAVAILABLE')
    },
  )
}

/**
 * 그날 그 끼니의 공복 표시를 켜거나 끈다(setDoc merge + arrayUnion/arrayRemove). 문서가 없으면 만든다.
 * 오프라인이면 서버 확인까지 끝나지 않는다(로컬 캐시와 구독에는 바로 들어간다). 화면은 기다리지 않는다.
 * 규칙 거부: FASTED_SAVE_REJECTED. 그 밖: FASTED_STORE_UNAVAILABLE.
 */
export async function setFasted(uid: string, dateKey: string, meal: MealType, on: boolean): Promise<void> {
  try {
    await setDoc(
      dayRef(uid, dateKey),
      { dateKey, fasted: on ? arrayUnion(meal) : arrayRemove(meal), updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch (e) {
    throw writeError(e)
  }
}

/**
 * 그 날짜·끼니에 기록을 저장하면 공복 저장을 지운다(직접 누른 것·자동 모두). 식사 쓰기가 끝난 뒤 부른다.
 * 하루 문서에 그 끼니 공복이 있을 때만 쓴다(없는 문서에 쓰면 규칙이 거부하고, 같은 쓰기 줄의 식사 저장까지 거부될 수 있다).
 */
export async function clearFastedOnRecord(uid: string, dateKey: string, meal: MealType): Promise<void> {
  try {
    const s = await getDoc(dayRef(uid, dateKey))
    const f = s.exists() ? (s.data() as { fasted?: unknown }).fasted : undefined
    if (!Array.isArray(f) || !f.includes(meal)) return
    await setDoc(dayRef(uid, dateKey), { dateKey, fasted: arrayRemove(meal), updatedAt: serverTimestamp() }, { merge: true })
  } catch (e) {
    console.warn('[fasting] 공복 지우기 실패', e)
  }
}

/** 자동 공복으로 채우는 끼니(간식은 안 먹는 날이 많아 뺀다) */
export const AUTO_FAST_MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner']
/** 앱을 열 때 확인하는 지난 날수(처음 켤 때 아주 옛날 기록까지 바꾸지 않게) */
export const AUTO_FAST_DAYS = 7

/** dateKey("YYYY-MM-DD")에서 n일 앞 날짜 */
export function shiftDateKey(dateKey: string, n: number): string {
  const d = new Date(Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)) + n))
  return d.toISOString().slice(0, 10)
}

/**
 * 하루치 자동 공복 계산(순수 함수): 그날 기록한 끼니(상태 상관없이)와 이미 공복인 끼니를 받아, 새로 공복으로 저장할 끼니.
 * 기록이 하나도 없으면 null(그날은 건드리지 않고 표시도 남기지 않는다).
 */
export function autoFastFor(recorded: readonly MealType[], fasted: readonly MealType[]): MealType[] | null {
  if (recorded.length === 0) return null
  return AUTO_FAST_MEALS.filter((m) => !recorded.includes(m) && !fasted.includes(m))
}

/**
 * 앱을 열 때 한 번: 어제부터 7일 전까지, 아직 자동 공복을 채우지 않았고(fastAuto 없음) 기록이 하나라도 있는 날의
 * 빈 아침·점심·저녁을 공복으로 저장하고 fastAuto: true를 남긴다(사용자가 나중에 끈 공복을 다시 켜지 않게).
 * 같은 기기에서 같은 날 두 번 확인하지 않도록 마지막으로 확인한 오늘 날짜를 기기에 둔다.
 */
export async function autoFillFasting(uid: string, todayKey: string): Promise<void> {
  const memo = `fastAuto.v1:${uid}`
  try {
    if (localStorage.getItem(memo) === todayKey) return
  } catch {
    // 저장소를 못 쓰면 매번 확인한다
  }
  for (let n = 1; n <= AUTO_FAST_DAYS; n++) {
    const key = shiftDateKey(todayKey, -n)
    const day = await getDoc(dayRef(uid, key))
    const data = day.exists() ? (day.data() as { fasted?: unknown; fastAuto?: unknown }) : null
    if (data?.fastAuto === true) continue
    const meals = await getDocs(query(collection(db, 'users', uid, 'meals'), where('dateKey', '==', key)))
    const recorded = meals.docs.map((d) => (d.data() as { mealType: MealType }).mealType)
    const fasted = Array.isArray(data?.fasted) ? (data.fasted as MealType[]) : []
    const add = autoFastFor(recorded, fasted)
    if (add === null) continue
    await setDoc(
      dayRef(uid, key),
      { dateKey: key, fastAuto: true, updatedAt: serverTimestamp(), ...(add.length > 0 ? { fasted: arrayUnion(...add) } : {}) },
      { merge: true },
    )
  }
  try {
    localStorage.setItem(memo, todayKey)
  } catch {
    // 무시
  }
}
