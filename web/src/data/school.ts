// 학교 등록(디자인 조각 D13, 2026-10-28 사용자 결정, 스펙 4.9절). 사용자 문서 users/{uid}의 school 필드(계정에 저장). AI 호출 없음.
// - atpt: 나이스 교육청 코드(ATPT_OFCDC_SC_CODE, 예 "B10"), code: 학교 코드(SD_SCHUL_CODE, 숫자 7자리), name: 학교 이름(1~50자).
// - 학교 코드와 이름만 저장한다(주소·학년 등은 저장하지 않음). 언제든 지울 수 있다(deleteField).
// 목표(goal)·설정(prefs)·동의(consent)와 같은 문서라 setDoc merge로 이 키만 쓴다. consent.school(bool)은 건드리지 않는다.
// 보안 규칙 v12(firestore.rules validSchool)가 키·형식을 막는다.
// 쓰기는 오프라인이면 서버 확인까지 끝나지 않는다(구독에는 바로 들어간다).
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export type School = { atpt: string; code: string; name: string }

const userRef = (uid: string) => doc(db, 'users', uid)

/** 규칙 v12 validSchool과 같은 검사. 맞으면 세 키만 골라 돌려준다. */
function readSchool(v: unknown): School | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  if (typeof s.atpt !== 'string' || !/^[A-Z][0-9]{2}$/.test(s.atpt)) return null
  if (typeof s.code !== 'string' || !/^[0-9]{7}$/.test(s.code)) return null
  if (typeof s.name !== 'string' || s.name.length < 1 || s.name.length > 50) return null
  return { atpt: s.atpt, code: s.code, name: s.name }
}

/** 등록한 학교 구독. 문서·필드가 없거나 형식이 틀리면 null. 구독 오류면 null을 한 번 알린다. */
export function subscribeSchool(uid: string, cb: (s: School | null) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (s) => cb(readSchool(s.exists() ? (s.data() as { school?: unknown }).school : undefined)),
    (e) => {
      console.warn('[school] 구독 오류', e)
      cb(null)
    },
  )
}

/** 학교 등록·바꾸기. 세 키만 보낸다(다른 키가 섞이면 규칙이 거부). */
export async function setSchool(uid: string, s: School): Promise<void> {
  await setDoc(userRef(uid), { school: { atpt: s.atpt, code: s.code, name: s.name } }, { merge: true })
}

/** 학교 지우기. 사용자 문서가 없으면 updateDoc이 not-found로 실패하므로 그 경우는 지울 것이 없는 것으로 본다. */
export async function deleteSchool(uid: string): Promise<void> {
  try {
    await updateDoc(userRef(uid), { school: deleteField() })
  } catch (e) {
    if ((e as { code?: string }).code === 'not-found') return
    throw e
  }
}
