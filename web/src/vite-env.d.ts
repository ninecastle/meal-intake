/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gemini 모델 ID (스펙 5절 AI_MODEL_ID) */
  readonly VITE_AI_MODEL?: string
  /** '1'이면 분석 모듈이 __fixtures__ 목업 응답을 돌려준다 */
  readonly VITE_AI_MOCK?: string
  /** 'on' | 'off' — Google 검색 그라운딩 단계 스위치 */
  readonly VITE_SEARCH_GROUNDING?: 'on' | 'off'
  /** 'on'이면 개발 서버에서 Auth·Firestore 에뮬레이터에 연결 */
  readonly VITE_USE_EMULATORS?: 'on' | 'off'
  /** App Check reCAPTCHA Enterprise 사이트 키(공개 값, web/.env.local에 넣는다) */
  readonly VITE_RECAPTCHA_SITE_KEY?: string
  /** 나이스 교육정보 개방 포털 인증키(무료, 학교 급식 D13). 없으면 키 없이(샘플 5건) 부른다 */
  readonly VITE_NEIS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// App Check 디버그 제공자: 개발 빌드에서 true로 두면 콘솔에 디버그 토큰을 찍는다.
// eslint-disable-next-line no-var
declare var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
