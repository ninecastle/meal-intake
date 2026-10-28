// 소개·처음 동의 화면의 구글 로그인(디자인 조각 D10). 예전 로그인 화면(LoginPage)의 처리를 그대로 옮겼다:
// signInWithGoogle(팝업, 막히면 리디렉션), consumeRedirectResult 오류 표시, 인앱 브라우저 안내(주소 복사), 오류 코드별 문구.
import { useEffect, useState } from 'react'
import { AuthError, consumeRedirectResult, isInAppBrowser, signInWithGoogle, type AuthErrorCode } from '../../lib/auth'
import { ChipButton } from '../ui'

const MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_CANCELLED: '로그인을 취소했어요. 다시 하려면 버튼을 눌러 주세요.',
  AUTH_INAPP_BROWSER: '앱 안의 브라우저에서는 구글 로그인이 막혀 있어요. Chrome·Safari로 열어 주세요.',
  AUTH_FAILED: '로그인하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요.',
}

export function useGoogleLogin() {
  const inApp = isInAppBrowser()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  useEffect(() => {
    let alive = true
    void consumeRedirectResult().then((e) => {
      if (alive && e) setError(e)
    })
    return () => {
      alive = false
    }
  }, [])

  /** 로그인에 성공하면 true(리디렉션으로 바뀌면 페이지가 떠난다) */
  async function login(): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
      return true
    } catch (e) {
      setError(e instanceof AuthError ? e : new AuthError('AUTH_FAILED'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { inApp, busy, error, login }
}

/** 인앱 브라우저 안내와 로그인 오류 문구. 둘 다 없으면 아무것도 그리지 않는다. */
export function LoginNotice({ inApp, error }: { inApp: boolean; error: AuthError | null }) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }
  const showError = error && !(inApp && error.code === 'AUTH_INAPP_BROWSER')
  if (!inApp && !showError) return null
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 14, textAlign: 'left' }}>
      {inApp && (
        <div className="callout" style={{ background: 'var(--butter-soft)', marginTop: 0 }}>
          <p style={{ margin: 0 }}>앱 안의 브라우저에서는 구글 로그인이 되지 않아요. Chrome·Safari로 열어 주세요.</p>
          <ChipButton dark onClick={() => void copyUrl()} className="mt-2">
            주소 복사
          </ChipButton>
          {copied === 'ok' && <p style={{ margin: '6px 0 0', fontSize: 12 }}>복사했어요. Chrome·Safari 주소창에 붙여 넣어 주세요.</p>}
          {copied === 'fail' && (
            <p style={{ margin: '6px 0 0', fontSize: 12, wordBreak: 'break-all', userSelect: 'all' }}>
              복사하지 못했어요. 이 주소를 길게 눌러 복사해 주세요: {location.href}
            </p>
          )}
        </div>
      )}
      {showError && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--peach-deep)' }}>
          {MESSAGES[error.code]}
          {error.code === 'AUTH_FAILED' && error.originalCode && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)' }}>오류 코드: {error.originalCode}</span>
          )}
        </p>
      )}
    </div>
  )
}
