// 경로 오류 화면(2026-10-27 사용자 결정). 라우터 기본 오류 화면(영어 개발자 화면) 대신 한국어 안내와 [다시 시도]를 보인다.
// 화면 파일 불러오기 실패면 "화면을 불러오지 못했어요". 배포본에서는 먼저 한 번 자동 새로고침한다(lib/chunkReload.ts).
import { useEffect, useState } from 'react'
import { useRouteError } from 'react-router'
import { isChunkLoadError, reloadOnceForNewVersion } from '../lib/chunkReload'
import { Button } from './ui'

export default function RouteErrorScreen() {
  const error = useRouteError()
  const chunk = isChunkLoadError(error)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    console.error('[route] 화면 오류', error)
    if (chunk && import.meta.env.PROD && reloadOnceForNewVersion()) setReloading(true)
  }, [chunk, error])

  if (reloading) {
    return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">새 버전을 불러오는 중…</main>
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-lg font-semibold text-ink">{chunk ? '화면을 불러오지 못했어요' : '화면에 문제가 생겼어요'}</p>
      <p className="text-sm text-ink-2">
        {chunk ? '인터넷 연결을 확인하고 다시 시도해 주세요.' : '다시 시도해도 계속되면 홈으로 돌아가 주세요.'}
      </p>
      <Button full onClick={() => window.location.reload()}>
        다시 시도
      </Button>
      <Button variant="ghost" full onClick={() => window.location.assign('/')}>
        홈으로
      </Button>
    </main>
  )
}
