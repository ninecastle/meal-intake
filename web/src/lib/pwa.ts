// PWA(2026-11-01 사용자 요청): 서비스 워커 등록과 새 버전 받기. 서비스 워커 내용은 pwa/sw.template.js.
// - 배포본에서만 등록한다(개발 서버·헤드리스 시험에는 sw.js가 없다).
// - 홈 화면 앱은 며칠씩 켜 둔 채 쓰기도 해서, 다시 볼 때(visibilitychange)마다 새 버전을 확인한다.
// - 새 버전 서비스 워커가 활성화되면 다음에 화면을 열 때 새 화면을 받는다(화면 열기는 늘 네트워크 먼저).
//   이미 열려 있던 화면은 고르던 결과·고친 내용을 잃지 않게 그대로 두고, 홈(/)을 보던 중에 앱으로 돌아왔을 때만 새로 불러온다.

/** 홈 화면에 추가해 앱으로 열었는지(안드로이드·PC는 display-mode, 아이폰 사파리는 navigator.standalone) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  // 처음 설치 때도 clients.claim으로 controllerchange가 나므로, 이미 서비스 워커가 있던 때만 "새 버전"으로 본다
  const hadController = !!navigator.serviceWorker.controller
  let updated = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) updated = true
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return
          if (updated && location.pathname === '/') {
            location.reload()
            return
          }
          reg.update().catch(() => undefined)
        })
      })
      .catch((e: unknown) => console.warn('[pwa] 서비스 워커 등록 실패', e))
  })
}
