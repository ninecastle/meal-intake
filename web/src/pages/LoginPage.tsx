// S0 로그인 화면: 앱 이름, Google 버튼 하나, 인앱 브라우저 안내(주소 복사), 오류 코드별 안내.
import { useEffect, useState } from 'react'
import { AuthError, consumeRedirectResult, isInAppBrowser, signInWithGoogle, type AuthErrorCode } from '../lib/auth'

const MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_CANCELLED: '로그인을 취소했어요. 다시 하려면 버튼을 눌러 주세요.',
  AUTH_INAPP_BROWSER: '앱 안의 브라우저에서는 구글 로그인이 막혀 있어요. Chrome·Safari로 열어 주세요.',
  AUTH_FAILED: '로그인하지 못했어요. 인터넷 연결을 확인하고 잠시 뒤 다시 시도해 주세요.',
}

export default function LoginPage() {
  const inApp = isInAppBrowser()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  useEffect(() => {
    let alive = true
    void consumeRedirectResult().then((e) => {
      if (alive && e) setError(e)
    })
    return () => {
      alive = false
    }
  }, [])

  async function onLogin() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(e instanceof AuthError ? e : new AuthError('AUTH_FAILED'))
    } finally {
      setBusy(false)
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  const showError = error && !(inApp && error.code === 'AUTH_INAPP_BROWSER')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">식단 기록</h1>

      {inApp && (
        <div className="w-full rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>앱 안의 브라우저에서는 구글 로그인이 되지 않아요. Chrome·Safari로 열어 주세요.</p>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-white"
          >
            주소 복사
          </button>
          {copied === 'ok' && <p className="mt-1 text-xs">복사했어요. Chrome·Safari 주소창에 붙여 넣어 주세요.</p>}
          {copied === 'fail' && (
            <p className="mt-1 break-all text-xs select-all">복사하지 못했어요. 이 주소를 길게 눌러 복사해 주세요: {location.href}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void onLogin()}
        disabled={busy}
        className="w-full rounded border border-gray-300 bg-white px-4 py-3 text-base font-medium shadow-sm disabled:opacity-50"
      >
        {busy ? '로그인 중…' : 'Google로 로그인'}
      </button>

      {showError && (
        <p className="text-sm text-red-600">
          {MESSAGES[error.code]}
          {error.code === 'AUTH_FAILED' && error.originalCode && (
            <span className="block text-xs text-gray-500">오류 코드: {error.originalCode}</span>
          )}
        </p>
      )}
    </main>
  )
}
