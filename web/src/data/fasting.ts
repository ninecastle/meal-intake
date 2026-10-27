// 공복 표시 저장소(디자인 조각 D2, 시안 홈 끼니 카드 "공복했어요"). AI 호출 없음.
// 문서 users/{uid}/days/{dateKey}, 필드는 정확히 dateKey(문자열, 경로와 같음)·fasted(MealType 배열)·updatedAt(serverTimestamp).
// 보안 규칙(firestore.rules)이 이 키 목록대로 막으므로 여기서도 이 세 키만 쓴다. 에뮬레이터 연결은 lib/firebase가 한다.
import { arrayRemove, arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
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
