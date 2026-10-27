import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForNewVersion } from './lib/chunkReload'

// 배포본: 새 버전 배포 뒤 옛 청크의 미리 불러오기가 실패하면 Vite가 이 이벤트를 낸다. 한 번 새로고침해 새 파일을 받는다.
// 이미 최근에 새로고침했으면 그대로 두어 lazy 오류 → RouteErrorScreen 안내로 간다.
if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnceForNewVersion()) e.preventDefault()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
