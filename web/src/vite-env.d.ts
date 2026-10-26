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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
