// 체중 기록·목표 몸무게 저장소(디자인 조각 D6, 2026-10-28 사용자 확인). AI 호출 없음. 보안 규칙 v7(firestore.rules)이 키·범위를 막는다.
// - 체중: users/{uid}/weights/{dateKey} { dateKey, kg, updatedAt }. 날짜마다 하나, 같은 날은 덮어쓴다. 하루 문서(days)와 따로 둬서
//   "지난 기록"(그 날짜 앞 가장 최근)·"최근 기록"(오늘까지 가장 최근)을 dateKey 한 필드 범위 + 정렬 + limit(1)로 찾는다(복합 인덱스 없음).
// - 목표 몸무게: users/{uid}.targetWeightKg(없으면 정하지 않음). 목표(goal)·설정(prefs)과 같은 문서라 setDoc merge로 이 키만 쓴다.
// - 목표 다시 계산 [나중에]: users/{uid}.prefs.weightAskSkipKg = 그때 최근 체중(lib/weight shouldAskRecalc).
// 쓰기는 오프라인이면 서버 확인까지 끝나지 않는다(구독에는 바로 들어간다). 화면은 기다리지 않는다.
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isKg, roundKg } from '../lib/weight'

export type WeightEntry = { dateKey: string; kg: number }
export type WeightProfile = { targetKg: number | null; skipKg: number | null }

const userRef = (uid: string) => doc(db, 'users', uid)
const weightsCol = (uid: string) => collection(db, 'users', uid, 'weights')
const weightRef = (uid: string, dateKey: string) => doc(db, 'users', uid, 'weights', dateKey)

function readEntry(d: DocumentData | undefined): WeightEntry | null {
  return d && typeof d.dateKey === 'string' && isKg(d.kg) ? { dateKey: d.dateKey, kg: d.kg } : null
}

/** 그날 체중(없으면 null) */
export function subscribeWeight(uid: string, dateKey: string, onData: (e: WeightEntry | null) => void, onError?: () => void): () => void {
  return onSnapshot(
    weightRef(uid, dateKey),
    (s) => onData(readEntry(s.exists() ? s.data() : undefined)),
    (e) => {
      console.warn('[weights] 구독 오류', e)
      onError?.()
    },
  )
}

/** 가장 최근 한 건: before면 dateKey보다 앞, 아니면 dateKey까지(그날 포함). 없으면 null */
function subscribeNearest(uid: string, dateKey: string, before: boolean, onData: (e: WeightEntry | null) => void): () => void {
  const q = query(weightsCol(uid), where('dateKey', before ? '<' : '<=', dateKey), orderBy('dateKey', 'desc'), limit(1))
  return onSnapshot(
    q,
    (s) => onData(readEntry(s.docs[0]?.data())),
    (e) => console.warn('[weights] 최근 기록 구독 오류', e),
  )
}

/** "지난 기록": 그 날짜 앞 가장 최근 체중 */
export const subscribeWeightBefore = (uid: string, dateKey: string, onData: (e: WeightEntry | null) => void) =>
  subscribeNearest(uid, dateKey, true, onData)

/** 그 날짜 뒤 가장 가까운 체중(하루 3kg 검사, 지난 날짜에 끼워 넣을 때). 없으면 null */
export function subscribeWeightAfter(uid: string, dateKey: string, onData: (e: WeightEntry | null) => void): () => void {
  const q = query(weightsCol(uid), where('dateKey', '>', dateKey), orderBy('dateKey', 'asc'), limit(1))
  return onSnapshot(
    q,
    (s) => onData(readEntry(s.docs[0]?.data())),
    (e) => console.warn('[weights] 다음 기록 구독 오류', e),
  )
}

/** "최근 기록": 그 날짜(오늘)까지 가장 최근 체중 */
export const subscribeLatestWeight = (uid: string, upToKey: string, onData: (e: WeightEntry | null) => void) =>
  subscribeNearest(uid, upToKey, false, onData)

/** 기록 보기 달력 [몸무게] 칩(D7): start~end(둘 다 포함) 날짜별 체중. dateKey 한 필드 범위라 복합 인덱스 없음 */
export function subscribeWeightsInRange(
  uid: string,
  start: string,
  end: string,
  onData: (m: Map<string, number>) => void,
  onError?: () => void,
): () => void {
  const q = query(weightsCol(uid), where('dateKey', '>=', start), where('dateKey', '<=', end), orderBy('dateKey'))
  return onSnapshot(
    q,
    (s) => {
      const m = new Map<string, number>()
      for (const d of s.docs) {
        const e = readEntry(d.data())
        if (e) m.set(e.dateKey, e.kg)
      }
      onData(m)
    },
    (e) => {
      console.warn('[weights] 달 체중 구독 오류', e)
      onError?.()
    },
  )
}

export async function setWeight(uid: string, dateKey: string, kg: number): Promise<void> {
  const v = roundKg(kg)
  if (!isKg(v)) throw new Error(`체중 범위 오류: ${kg}`)
  await setDoc(weightRef(uid, dateKey), { dateKey, kg: v, updatedAt: serverTimestamp() })
}

export async function deleteWeight(uid: string, dateKey: string): Promise<void> {
  await deleteDoc(weightRef(uid, dateKey))
}

/** 목표 몸무게와 [나중에] 체중(users/{uid}). 문서·값이 없거나 틀리면 null */
export function subscribeWeightProfile(uid: string, onData: (p: WeightProfile) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (s) => {
      const d = s.exists() ? (s.data() as { targetWeightKg?: unknown; prefs?: { weightAskSkipKg?: unknown } }) : undefined
      onData({
        targetKg: isKg(d?.targetWeightKg) ? d.targetWeightKg : null,
        skipKg: isKg(d?.prefs?.weightAskSkipKg) ? d.prefs.weightAskSkipKg : null,
      })
    },
    (e) => {
      console.warn('[weights] 목표 몸무게 구독 오류', e)
      onData({ targetKg: null, skipKg: null })
    },
  )
}

/** 목표 몸무게 정하기(null이면 지우기) */
export async function setTargetWeight(uid: string, kg: number | null): Promise<void> {
  if (kg !== null && !isKg(roundKg(kg))) throw new Error(`목표 몸무게 범위 오류: ${kg}`)
  await setDoc(userRef(uid), { targetWeightKg: kg === null ? deleteField() : roundKg(kg) }, { merge: true })
}

/** 목표 다시 계산 [나중에]: 그때 최근 체중을 적는다(null이면 지우기 — [다시 계산]한 뒤) */
export async function setRecalcSkip(uid: string, kg: number | null): Promise<void> {
  await setDoc(userRef(uid), { prefs: { weightAskSkipKg: kg === null ? deleteField() : roundKg(kg) } }, { merge: true })
}
