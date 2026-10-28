// 식사 사진 보관(디자인 조각 D9, 스펙 4.12, 2026-10-28 사용자 확인 _workspace/design/mock/d9_*). AI 호출 없음.
// users/{uid}/mealPhotos/{mealId} { before?: Bytes, after?: Bytes, w, h, createdAt, updatedAt } — 식사 기록 문서와 분리(목록 조회 때 사진을 읽지 않는다).
// 썸네일(긴 변 약 360px, 5:4 가운데 자름, JPEG)은 photos/thumbnail.ts가 만든다. 규칙 v8이 장당 100KB·w·h 1~1000을 막는다.
// 시그니처는 리더가 먼저 정했다(D9 병렬 작업 계약).
// 쓰기는 한 쪽씩 setDoc(merge). createdAt은 먹기 전 사진을 쓸 때만 넣는다(먹은 후 사진만 있는 기록은 없을 수 있다,
// 오프라인 대기열이라 문서 유무를 미리 읽지 않는다. 규칙 v8이 수정 때 createdAt을 그대로 또는 이번 시각만 허용).

import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export type PhotoSide = 'before' | 'after'
export type Thumb = { bytes: Uint8Array; w: number; h: number }
/** 화면에 바로 쓰는 사진(data:image/jpeg;base64,… URL). 없는 쪽은 null */
export type MealPhotos = { mealId: string; before: string | null; after: string | null }

/** 한 배치 쓰기 상한(500)보다 여유 있게(records.ts와 같은 값) */
const BATCH = 400

const photosCol = (uid: string) => collection(db, 'users', uid, 'mealPhotos')
const photoRef = (uid: string, mealId: string) => doc(db, 'users', uid, 'mealPhotos', mealId)

function toUrl(v: unknown): string | null {
  return v instanceof Bytes ? `data:image/jpeg;base64,${v.toBase64()}` : null
}

function toPhotos(s: DocumentSnapshot): MealPhotos | null {
  if (!s.exists()) return null
  const d = s.data()
  const p: MealPhotos = { mealId: s.id, before: toUrl(d.before), after: toUrl(d.after) }
  return p.before || p.after ? p : null
}

/** 한 쪽 사진 저장(merge). 기다리지 않아도 된다(오프라인이면 대기열) */
export async function saveMealPhoto(uid: string, mealId: string, side: PhotoSide, thumb: Thumb): Promise<void> {
  await setDoc(
    photoRef(uid, mealId),
    {
      [side]: Bytes.fromUint8Array(thumb.bytes),
      w: thumb.w,
      h: thumb.h,
      ...(side === 'before' ? { createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/** 여러 기록의 사진을 한 번에 읽는다(앨범 하루치). 사진 문서가 없는 기록은 결과에 없다 */
export async function getMealPhotos(uid: string, mealIds: readonly string[]): Promise<Map<string, MealPhotos>> {
  const ids = [...new Set(mealIds)]
  const snaps = await Promise.all(ids.map((id) => getDoc(photoRef(uid, id))))
  const out = new Map<string, MealPhotos>()
  for (const s of snaps) {
    const p = toPhotos(s)
    if (p) out.set(p.mealId, p)
  }
  return out
}

/** 한 기록의 사진 구독(수정 화면) */
export function subscribeMealPhotos(uid: string, mealId: string, cb: (p: MealPhotos | null) => void): () => void {
  return onSnapshot(
    photoRef(uid, mealId),
    (s) => cb(toPhotos(s)),
    (e) => {
      // 사진은 부가 기능이라 오류면 사진 없이 보인다
      console.warn('[mealPhotos] subscribeMealPhotos 오류', e)
      cb(null)
    },
  )
}

/** 한 기록의 사진 문서 삭제(기록 삭제·대기 기록 취소 때. deleteMeal은 같은 배치로 지운다) */
export async function deleteMealPhotos(uid: string, mealId: string): Promise<void> {
  await deleteDoc(photoRef(uid, mealId))
}

/** 그 사용자의 사진 문서 모두 삭제(설정 [사진 전체 삭제]·보관 끄기 [모두 지우기], 여러 배치). 지운 문서 수 */
export async function deleteAllMealPhotos(uid: string): Promise<number> {
  const snap = await getDocs(photosCol(uid))
  const docs = snap.docs
  const commits: Promise<void>[] = []
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + BATCH)) batch.delete(d.ref)
    commits.push(batch.commit())
  }
  await Promise.all(commits)
  return docs.length
}
