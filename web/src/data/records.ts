// 설정 "내 기록 전체 삭제"(디자인 조각 D8, 2026-10-28 사용자 결정: 기록만). AI 호출 없음.
// 지우는 것: users/{uid}/meals(식사 기록, 먹은 후 사진을 기다리는 기록 포함), days(먹은 시간·공복 표시), weights(체중 기록),
// mealPhotos(보관한 식사 사진, D9), reports(AI 주간 리포트, D14), 기기 IndexedDB의 먹기 전 사진. 남기는 것: users/{uid} 문서(목표·목표 몸무게·설정)와 goals(날짜별 목표 기록).
// 규칙(firestore.rules v13)은 다섯 컬렉션 모두 본인 삭제를 허용한다.
import { collection, getDocs, writeBatch, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { beforePhotoStore } from '../photos/beforePhotoStore'

/** 지우는 하위 컬렉션 */
export const RECORD_COLLECTIONS = ['meals', 'days', 'weights', 'mealPhotos', 'reports'] as const
/** 한 배치 쓰기 상한(500)보다 여유 있게 */
const BATCH = 400

/**
 * 문서 목록을 읽어(오프라인이면 기기 캐시) 배치로 지운다. 목록을 읽고 삭제를 걸면 돌려준다 — 구독 화면에는 바로 사라진다.
 * committed는 서버 확인까지 기다리는 Promise(오프라인이면 연결될 때까지 끝나지 않는다).
 */
export async function deleteAllRecords(uid: string): Promise<{ count: number; committed: Promise<void> }> {
  const snaps = await Promise.all(RECORD_COLLECTIONS.map((c) => getDocs(collection(db, 'users', uid, c))))
  const docs: QueryDocumentSnapshot[] = snaps.flatMap((s) => s.docs)
  const commits: Promise<void>[] = []
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + BATCH)) batch.delete(d.ref)
    commits.push(batch.commit())
  }
  // 먹기 전 사진은 기록이 모두 없어졌으니 남길 것이 없다
  beforePhotoStore.cleanup([]).catch((e: unknown) => console.warn('[records] 먹기 전 사진 정리 실패', e))
  return { count: docs.length, committed: Promise.all(commits).then(() => undefined) }
}
