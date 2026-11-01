// 앱 시작 "불러오는 중…"(App 로그인 확인·동의 불러오기·화면 파일). 끝나지 않는 로딩을 막는다(2026-11-01 사용자 보고:
// 로그인 도중 나갔다가 앱을 다시 여니 "불러오는 중…"에서 멈춤).
// - 로그인 확인(auth)은 기기 저장소만 읽어 보통 1초 안에 끝난다. AUTH_RELOAD_MS가 지나도 그대로면 한 번 자동으로 새로 불러온다(1분 안에 또 하지 않음).
// - SLOW_MS가 지나면 어느 단계에서 멈췄는지(로그인 확인·계정 정보·화면 파일, 홈 화면 앱/브라우저, 온라인/오프라인)와
//   [다시 시도](새로 불러오기)·[처음 화면으로](로그인 진행 표시·로그인을 지우고 소개로)를 보인다.
import { useEffect, useState } from 'react'
import { signOutAndClear } from '../lib/auth'
import { isStandalone } from '../lib/pwa'

export type StartStage = 'auth' | 'consent' | 'screen'

const STAGE_LABEL: Record<StartStage, string> = { auth: '로그인 확인', consent: '계정 정보 불러오기', screen: '화면 불러오기' }
const AUTH_RELOAD_MS = 8000
const SLOW_MS = 10000
const RELOAD_KEY = 'startLoading.reloadAt'
const RELOAD_GUARD_MS = 60_000

/** 최근 1분 안에 자동으로 새로 불러오지 않았으면 새로 불러오고 true */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  location.reload()
  return true
}

/** 처음 화면으로: Firebase 리디렉션 로그인 진행 표시를 지우고, 로그아웃(기기 자료 정리 포함)을 3초까지 기다린 뒤 소개로 */
async function restart() {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('firebase:pendingRedirect')) sessionStorage.removeItem(k)
  } catch {
    // 무시
  }
  await Promise.race([signOutAndClear().catch(() => undefined), new Promise((r) => setTimeout(r, 3000))])
  location.replace('/welcome')
}

export default function StartLoading({ stage }: { stage: StartStage }) {
  const [slow, setSlow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const auto = stage === 'auth' ? setTimeout(reloadOnce, AUTH_RELOAD_MS) : null
    const t = setTimeout(() => setSlow(true), SLOW_MS)
    return () => {
      if (auto) clearTimeout(auto)
      clearTimeout(t)
    }
  }, [stage])

  if (!slow) return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">불러오는 중…</main>
  const where = `${STAGE_LABEL[stage]} · ${isStandalone() ? '홈 화면 앱' : '브라우저'} · ${navigator.onLine ? '온라인' : '오프라인'}`
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <b style={{ fontSize: 18 }}>시작이 오래 걸리고 있어요</b>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>인터넷 연결을 확인하고 다시 시도해 주세요</p>
      <small style={{ color: 'var(--ink-3)' }}>{where}</small>
      <button type="button" className="btn ink" style={{ width: '100%', maxWidth: 320, marginTop: 8 }} onClick={() => location.reload()}>
        다시 시도
      </button>
      <button
        type="button"
        className="btn ghost"
        style={{ width: '100%', maxWidth: 320 }}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void restart()
        }}
      >
        {busy ? '처음 화면으로 가는 중…' : '처음 화면으로(다시 로그인)'}
      </button>
    </main>
  )
}
