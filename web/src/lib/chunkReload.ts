// 화면 파일(lazy 청크) 불러오기 실패 처리(2026-10-27 사용자 결정).
// 새 버전을 배포하면 열려 있던 탭이 지워진 옛 청크를 요청해 "Failed to fetch dynamically imported module"이 난다.
// 배포본에서는 한 번만 자동으로 새로고침해 새 index.html·청크를 받게 하고, 그래도 실패하면 안내 화면의 [다시 시도]에 맡긴다.

const KEY = 'chunk-reload-at'
/** 이 시간 안에 이미 자동 새로고침했으면 또 하지 않는다(새로고침이 계속 도는 것을 막는다). */
const GUARD_MS = 60_000

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed/i

export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return CHUNK_ERROR.test(msg)
}

/** 최근에 자동 새로고침하지 않았으면 새로고침하고 true. sessionStorage를 못 쓰면 새로고침하지 않는다(무한 반복 방지). */
export function reloadOnceForNewVersion(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Number.isFinite(last) && now - last < GUARD_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
