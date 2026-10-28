// 로그인한 계정의 처음 동의(users/{uid}.consent) 구독을 앱 전체에 한 번만 두고 나눠 쓴다(디자인 조각 D10).
// undefined = 아직 불러오는 중(또는 로그인 안 함), null = 동의 없음.
import { createContext, useContext, useEffect, useState } from 'react'
import { subscribeConsent, type Consent } from '../../data/consent'

export type ConsentState = Consent | null | undefined

export const ConsentContext = createContext<ConsentState>(undefined)

export const useConsent = (): ConsentState => useContext(ConsentContext)

export function useConsentSubscription(uid: string | null): ConsentState {
  const [s, setS] = useState<{ uid: string | null; c: ConsentState }>({ uid: null, c: undefined })
  useEffect(() => {
    if (!uid) return
    return subscribeConsent(uid, (c) => setS({ uid, c }))
  }, [uid])
  return uid && s.uid === uid ? s.c : undefined
}

// 소개 [이미 계정이 있어요]로 로그인을 시작했다는 표시. 팝업이 막혀 리디렉션 로그인으로 페이지가 다시 열려도 홈으로 보내려고
// sessionStorage에 둔다(탭을 닫으면 사라진다).
const EXISTING_KEY = 'welcome.loginExisting'
export function markExistingLogin(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(EXISTING_KEY, '1')
    else sessionStorage.removeItem(EXISTING_KEY)
  } catch {
    // 저장소를 못 쓰면 팝업 로그인만 이어진다
  }
}
export function isExistingLogin(): boolean {
  try {
    return sessionStorage.getItem(EXISTING_KEY) === '1'
  } catch {
    return false
  }
}

/** 로그인 뒤 돌아갈 경로(state.from). 소개·동의·로그인 화면 자체는 빼고 기본 홈 */
export function safeFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !/^\/(login|welcome|consent)\b/.test(from) ? from : '/'
}
