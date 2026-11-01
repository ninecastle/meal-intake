import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForNewVersion } from './lib/chunkReload'
import { retryPendingCleanup } from './lib/logoutCleanup'
import { disableAutofillEverywhere } from './lib/noAutofill'
import { registerServiceWorker } from './lib/pwa'

disableAutofillEverywhere()

// 배포본: 새 버전 배포 뒤 옛 청크의 미리 불러오기가 실패하면 Vite가 이 이벤트를 낸다. 한 번 새로고침해 새 파일을 받는다.
// 이미 최근에 새로고침했으면 그대로 두어 lazy 오류 → RouteErrorScreen 안내로 간다.
if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnceForNewVersion()) e.preventDefault()
  })
  // PWA(2026-11-01 사용자 요청): 화면 파일만 캐시해 빠르게 열고, 새 배포는 다음에 열 때 받는다(lib/pwa)
  registerServiceWorker()
}

// 지난 로그아웃 때 다 못 지운 기기 자료가 있으면(표시 키) Firestore를 쓰기 전에 한 번 더 지운다(최대 약 1.5초씩).
void retryPendingCleanup()
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
