import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// 웹 앱 설정 값은 공개 값이다(_workspace/02_firebase_notes.md).
// Cloud Storage를 쓰지 않으므로 storageBucket은 넣지 않는다.
const firebaseConfig = {
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain: 'meal-intake-2026.firebaseapp.com',
  projectId: 'meal-intake-2026',
  messagingSenderId: '686292653830',
  appId: '1:686292653830:web:87f810922b0016e244f087',
}

// 초기화 순서(스펙 5절): initializeApp → initializeAppCheck → getAuth·getFirestore·getAI(ai.ts).
export const app = initializeApp(firebaseConfig)

// 개발 빌드에서만: App Check 초기화 전에 디버그 토큰 모드를 켠다.
// 브라우저 콘솔에 찍힌 토큰을 App Check 콘솔 '디버그 토큰 관리'에 등록해야 AI 호출이 통과한다.
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

function initAppCheck(): AppCheck | null {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
  if (!siteKey) {
    console.warn(
      '[App Check] VITE_RECAPTCHA_SITE_KEY가 비어 있어 App Check를 초기화하지 않았습니다. AI 호출이 거부될 수 있습니다.',
    )
    return null
  }
  try {
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (e) {
    console.warn('[App Check] 초기화 실패', e)
    return null
  }
}

export const appCheck = initAppCheck()
export const auth = getAuth(app)
export const db = getFirestore(app)

export const usingEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'on'

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
