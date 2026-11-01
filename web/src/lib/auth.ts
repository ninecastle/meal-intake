// 구글 로그인·로그아웃과 로그인 상태 훅(스펙 4.3절 signInWithGoogle·signOutAndClear·AuthErrorCode, F14).
// 팝업이 기본이고 auth/popup-blocked면 리디렉션으로 바꾼다. 인앱 브라우저는 Google이 OAuth를 막으므로 호출 전에 거른다.
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from './firebase'
import { clearDeviceDataAfterSignOut } from './logoutCleanup'
import { isStandalone } from './pwa'

export type AuthErrorCode = 'AUTH_CANCELLED' | 'AUTH_INAPP_BROWSER' | 'AUTH_FAILED'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  /** Firebase 원래 오류 코드(예: auth/network-request-failed). 없으면 null */
  readonly originalCode: string | null

  constructor(code: AuthErrorCode, originalCode: string | null = null) {
    super(originalCode ? `${code} (${originalCode})` : code)
    this.name = 'AuthError'
    this.code = code
    this.originalCode = originalCode
  }
}

// 카카오톡·인스타그램·페이스북·네이버·라인·다음·밴드·에브리타임 앱 안 브라우저, 안드로이드 WebView(; wv)).
const IN_APP_UA =
  /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|\bLine\/|DaumApps|BAND\/|everytimeApp|; wv\)/i

export function isInAppBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return IN_APP_UA.test(ua)
}

const CANCEL_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
  'auth/redirect-cancelled-by-user',
])

function firebaseCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e
  const code = firebaseCode(e)
  if (code && CANCEL_CODES.has(code)) return new AuthError('AUTH_CANCELLED', code)
  console.warn('[auth] 로그인 실패', e)
  return new AuthError('AUTH_FAILED', code)
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

/** 팝업 로그인. 팝업이 막히면 리디렉션으로 바꾼다(이때는 페이지가 떠나므로 돌아오지 않는다). 실패는 AuthError.
 *  홈 화면에 추가한 앱(PWA)에서는 처음부터 리디렉션: 아이폰 홈 화면 앱은 팝업 창이 앱과 따로 열려 결과를 돌려받지 못할 수 있다.
 *  authDomain이 앱과 같은 주소라(lib/firebase) 리디렉션도 사파리 저장소 분리에 걸리지 않는다. */
export async function signInWithGoogle(): Promise<void> {
  if (isInAppBrowser()) throw new AuthError('AUTH_INAPP_BROWSER')
  const provider = googleProvider()
  if (isStandalone()) {
    try {
      await signInWithRedirect(auth, provider)
    } catch (e) {
      throw toAuthError(e)
    }
    return
  }
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    if (firebaseCode(e) !== 'auth/popup-blocked') throw toAuthError(e)
    try {
      await signInWithRedirect(auth, provider)
    } catch (e2) {
      throw toAuthError(e2)
    }
  }
}

let redirectResult: Promise<AuthError | null> | null = null

/** 리디렉션 로그인 결과를 한 번만 처리한다. 앱 시작 때(useAuthUser) 시작되고, 로그인 화면은 오류 표시용으로 받는다. */
export function consumeRedirectResult(): Promise<AuthError | null> {
  redirectResult ??= getRedirectResult(auth).then(
    () => null,
    (e: unknown) => toAuthError(e),
  )
  return redirectResult
}

/**
 * 로그아웃하고 이 기기의 계정 자료(먹기 전 사진 IndexedDB, Firestore 영구 캐시, 계정 localStorage·sessionStorage 키)를
 * 지운 뒤 /welcome을 새로 불러온다(lib/logoutCleanup). signOut이 실패하면 던진다(지우지 않음).
 * 지우기는 실패해도 로그아웃·새로 불러오기는 하고, 못 지운 것은 다음 시작 때 다시 지운다.
 * 분석 결과 캐시(IndexedDB meal-analysis-cache)는 지우지 않는다: 사진이 없고 결과만 있으며,
 * before·after는 사진 해시 키라 같은 사진 없이는 꺼낼 수 없고, nutrition은 음식 이름 키라 개인 정보가 아니다.
 * 7일이면 만료되고, 남겨 두면 다시 로그인했을 때 같은 사진·이름의 AI 호출을 아낀다.
 */
export async function signOutAndClear(): Promise<void> {
  await signOut(auth)
  try {
    await clearDeviceDataAfterSignOut()
  } catch (e) {
    console.warn('[logout] 기기 자료 지우기 실패', e)
  }
  location.replace('/welcome')
}

/** 로그인 상태. 첫 판정 전에는 loading=true. */
export function useAuthUser(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>(() => ({
    user: auth.currentUser,
    loading: auth.currentUser === null,
  }))

  useEffect(() => {
    void consumeRedirectResult()
    return onAuthStateChanged(auth, (user) => setState({ user, loading: false }))
  }, [])

  return state
}
