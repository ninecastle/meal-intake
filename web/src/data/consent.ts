// 처음 동의(디자인 조각 D10, 2026-10-28 사용자 결정, 스펙 4.10절). 사용자 문서 users/{uid}의 consent 필드. AI 호출 없음.
// - 로그인 전 [동의하고 계속]: 동의 내용을 기기(localStorage)에 잠깐 두고 구글 로그인 → 로그인 뒤 계정에 저장하고 지운다.
// - 기존 계정: consent가 없거나 version이 CONSENT_VERSION과 다르면 로그인 뒤 한 번 동의 화면을 보인다.
// - 선택 "식사 사진 보관"은 prefs.keepPhotos에 같이 쓴다(체크 안 하면 false → 첫 촬영 때 다시 묻지 않음, 사용자 결정).
// 보안 규칙 v9(firestore.rules validConsent)가 키·형식을 막는다.
import { doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

/** 약관 버전. 약관 문구를 크게 바꾸면 올린다(올리면 모든 계정이 다음에 한 번 다시 동의한다). */
export const CONSENT_VERSION = '2026-10-28'

/** 동의 항목 키(시안 AGREE 순서). 필수 4개, 선택 2개 */
export type ConsentKey = 'svc' | 'priv' | 'ai' | 'age' | 'keep' | 'school'
export const REQUIRED_KEYS: ConsentKey[] = ['svc', 'priv', 'ai', 'age']

export type Consent = { version: string; agreedAt: Date | null; photoKeep: boolean; school: boolean }

/** 선택 항목만(필수는 모두 동의해야 저장할 수 있다) */
export type ConsentChoice = { photoKeep: boolean; school: boolean }

const userRef = (uid: string) => doc(db, 'users', uid)

/** 지금 버전에 동의했는지 */
export function hasCurrentConsent(c: Consent | null): boolean {
  return c !== null && c.version === CONSENT_VERSION
}

/**
 * 동의 구독. 호출 쪽은 첫 값이 오기 전까지 "불러오는 중"으로 둔다.
 * 문서·필드가 없거나 형식이 틀리면 null. 구독 오류면 null을 한 번 알린다(오프라인 첫 실행 등 — 동의 화면이 다시 보일 수 있다).
 */
export function subscribeConsent(uid: string, onData: (c: Consent | null) => void): () => void {
  return onSnapshot(
    userRef(uid),
    (s) => {
      const c = s.exists() ? (s.data() as { consent?: Record<string, unknown> }).consent : undefined
      if (!c || typeof c.version !== 'string' || c.required !== true) return onData(null)
      const at = c.agreedAt as Timestamp | null | undefined
      onData({
        version: c.version,
        // 서버 시각이 아직 안 왔으면(쓰기 직후 캐시) null
        agreedAt: at && typeof at.toDate === 'function' ? at.toDate() : null,
        photoKeep: c.photoKeep === true,
        school: c.school === true,
      })
    },
    (e) => {
      console.warn('[consent] 구독 오류', e)
      onData(null)
    },
  )
}

/** 동의 저장(필수 모두 동의한 뒤에만 부른다). prefs.keepPhotos도 같은 쓰기에서 바꾼다. 오프라인이면 서버 확인까지 끝나지 않는다. */
export async function saveConsent(uid: string, choice: ConsentChoice): Promise<void> {
  await setDoc(
    userRef(uid),
    {
      consent: {
        version: CONSENT_VERSION,
        agreedAt: serverTimestamp(),
        required: true,
        photoKeep: choice.photoKeep,
        school: choice.school,
      },
      prefs: { keepPhotos: choice.photoKeep },
    },
    { merge: true },
  )
}

// ── 로그인 전 임시 보관(기기에만, 로그인 뒤 saveConsent 하고 지운다) ──
const DRAFT_KEY = 'consentDraft.v1'

export function readConsentDraft(): ConsentChoice | null {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as unknown
    if (v && typeof v === 'object' && 'photoKeep' in v && 'school' in v) {
      const o = v as Record<string, unknown>
      return { photoKeep: o.photoKeep === true, school: o.school === true }
    }
  } catch {
    // 읽지 못하면 없는 것으로(로그인 뒤 동의 화면을 한 번 더 본다)
  }
  return null
}

export function writeConsentDraft(c: ConsentChoice): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(c))
  } catch {
    // 저장하지 못하면 로그인 뒤 동의 화면을 한 번 더 본다
  }
}

export function clearConsentDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 무시
  }
}
