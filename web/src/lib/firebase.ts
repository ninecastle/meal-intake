import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

// authDomain: Hosting 기본 도메인에서 열렸으면 지금 주소와 같은 도메인을 쓴다.
// 로그인(팝업·리디렉션)은 authDomain의 /__/auth/handler를 거치는데, 앱 출처와 다르면
// 서드 파티 저장소 차단(Chrome 115+, Safari 16.1+, Firefox 109+) 때문에 리디렉션 결과를 못 읽는다.
// Hosting은 web.app·firebaseapp.com 모두에서 /__/auth/*를 제공한다(공식 문서 redirect-best-practices 옵션 1).
// 전제: Google OAuth 클라이언트 승인된 리디렉션 URI에 https://meal-intake-2026.web.app/__/auth/handler가 있어야 한다.
// localhost(Vite)는 /__/auth/*가 없으므로 기본값을 쓴다(개발은 팝업 위주).
const DEFAULT_AUTH_DOMAIN = 'meal-intake-2026.firebaseapp.com'
const HOSTING_DOMAINS = ['meal-intake-2026.web.app', DEFAULT_AUTH_DOMAIN]
const authDomain =
  typeof location !== 'undefined' && HOSTING_DOMAINS.includes(location.hostname)
    ? location.hostname
    : DEFAULT_AUTH_DOMAIN

// 웹 앱 설정 값은 공개 값이다(_workspace/02_firebase_notes.md).
// Cloud Storage를 쓰지 않으므로 storageBucket은 넣지 않는다.
const firebaseConfig = {
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain,
  projectId: 'meal-intake-2026',
  messagingSenderId: '686292653830',
  appId: '1:686292653830:web:87f810922b0016e244f087',
}

// 초기화 순서(스펙 5절): initializeApp → initializeAppCheck → getAuth·initializeFirestore·getAI(ai.ts).
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
// Firestore 영구 캐시(IndexedDB): 오프라인에서도 기록을 보여 주고, 쓰기는 대기했다가 다시 연결되면 보낸다.
// 여러 탭을 열어도 캐시를 함께 쓰도록 multi-tab 관리자를 쓴다. IndexedDB를 못 쓰는 브라우저는 SDK가 메모리 캐시로 바꾼다.
// 캐시에는 분석 결과만 들어간다(사진 필드 없음, data/meals.ts).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const usingEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'on'

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
