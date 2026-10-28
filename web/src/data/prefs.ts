// 사용자 설정(2026-10-27 사용자가 고른 변경). 사용자 문서 users/{uid}의 prefs 필드(계정에 저장, 여러 기기에서 같다). AI 호출 없음.
// - shareEaters: "같이 먹은 사람 고르기". 켜면 결과 확인·수정 화면 음식마다 [1명~5명+]가 보인다. 기본 꺼짐(값이 없으면 꺼짐).
// - keepPhotos: 식사 사진 보관(D9). null = 아직 묻지 않음(첫 촬영 때 묻는다), 기본 꺼짐.
// 목표(goals.ts)와 같은 문서다. 목표 저장은 mergeFields ['goal']이라 prefs를 지우지 않고, 여기서는 setDoc merge로 prefs만 쓴다.
// 보안 규칙 v6(firestore.rules validPrefs)이 키·형식을 막는다.
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type Prefs = { shareEaters: boolean; keepPhotos: boolean | null }

export const DEFAULT_PREFS: Prefs = { shareEaters: false, keepPhotos: null }

const userRef = (uid: string) => doc(db, 'users', uid)

/** 설정 구독. 문서·필드가 없거나 값이 틀리면 기본값. 구독 오류면 기본값을 한 번 알린다. */
export function subscribePrefs(uid: string, onData: (p: Prefs) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (s) => {
      const p = s.exists() ? (s.data() as { prefs?: { shareEaters?: unknown; keepPhotos?: unknown } }).prefs : undefined
      onData({ shareEaters: p?.shareEaters === true, keepPhotos: typeof p?.keepPhotos === 'boolean' ? p.keepPhotos : null })
    },
    (e) => {
      console.warn('[prefs] 구독 오류', e)
      onData(DEFAULT_PREFS)
    },
  )
}

/** "같이 먹은 사람 고르기" 켜기/끄기. 오프라인이면 서버 확인까지 끝나지 않는다(구독에는 바로 들어간다). */
export async function setShareEaters(uid: string, on: boolean): Promise<void> {
  await setDoc(userRef(uid), { prefs: { shareEaters: on } }, { merge: true })
}

/** 식사 사진 보관 켜기/끄기(D9). 규칙 v8(prefs.keepPhotos bool) */
export async function setKeepPhotos(uid: string, on: boolean): Promise<void> {
  await setDoc(userRef(uid), { prefs: { keepPhotos: on } }, { merge: true })
}
