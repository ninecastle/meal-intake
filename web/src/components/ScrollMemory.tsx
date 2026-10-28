// 스크롤 위치 기억(2026-10-27 사용자가 고른 변경). 라우터 틀(App Root)에 한 번 둔다. 창(window) 스크롤만 다룬다.
// - 뒤로 가기(기기 뒤로 가기, 화면의 ‹·X가 부르는 navigate(-1))로 돌아온 칸은 그 칸에서 마지막으로 보던 위치로 돌아간다.
//   홈처럼 기록을 비동기로 불러오는 화면은 처음에 짧아 위치가 잘리고, 그 뒤 위쪽 내용이 늘면 브라우저 스크롤 고정(overflow-anchor)이
//   보던 곳을 더 아래로 밀어 버린다(새로고침 때는 불러오기가 1초 넘게 걸리기도 한다). 그래서 돌아온 뒤 RESTORE_MS 동안 스크롤 고정을 끄고
//   프레임마다 그 위치로 다시 맞춘다. 사용자가 화면을 만지거나 휠·키를 쓰면 바로 멈춘다.
// - 새 화면으로 갈 때(push)와 다른 화면으로 바꿀 때(replace, 경로가 바뀜)는 맨 위(시안 go()의 scrollTo(0,0)).
//   홈에서 날짜를 바꾸는 replace(?date)도 맨 위. 같은 화면 안에서 주소만 바꾸는 replace(기록 보기 ?month·?week 등)는 위치를 그대로 둔다.
// - state.scrollY(숫자)를 달고 오면 그 위치로 돌아간다(끼니 화면에서 음식을 추가하고 결과 화면을 거쳐 돌아올 때, 2026-10-28 사용자 요청).
// 위치는 방문 기록 칸 키(location.key)로 sessionStorage에 둔다(새로고침해도 같은 칸이면 그 위치, 새 탭·새 방문은 맨 위).
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType, type Location } from 'react-router'

const STORE_KEY = 'scrollMemory.v1'
const MAX_KEYS = 100
const RESTORE_MS = 2500
const STOP_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

function load(): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    const arr = raw ? (JSON.parse(raw) as [string, number][]) : []
    return new Map(Array.isArray(arr) ? arr.filter((e) => typeof e[0] === 'string' && typeof e[1] === 'number') : [])
  } catch {
    return new Map()
  }
}

function persist(m: Map<string, number>) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify([...m].slice(-MAX_KEYS)))
  } catch {
    // 저장하지 못해도 이번 방문 동안은 메모리로 기억한다
  }
}

const saved = typeof window === 'undefined' ? new Map<string, number>() : load()

/** replace인데 위치를 그대로 둘지: 같은 화면 안의 주소 바꾸기만(홈 날짜 바꾸기는 맨 위) */
function keepOnReplace(prev: Location | null, next: Location): boolean {
  if (!prev || prev.pathname !== next.pathname) return false
  return !(next.pathname === '/' && prev.search !== next.search)
}

export default function ScrollMemory() {
  const location = useLocation()
  const type = useNavigationType()
  const activeKey = useRef(location.key)
  const prevLoc = useRef<Location | null>(null)
  const restoring = useRef(false)

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const onScroll = () => {
      if (!restoring.current) saved.set(activeKey.current, window.scrollY)
    }
    const onHide = () => persist(saved)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onHide)
      persist(saved)
    }
  }, [])

  useLayoutEffect(() => {
    const prev = prevLoc.current
    prevLoc.current = location
    activeKey.current = location.key
    // 화면이 다른 화면을 거쳐 같은 화면으로 replace로 돌아올 때(끼니 화면 → 결과 화면 → 끼니 화면) 떠날 때 위치를 state.scrollY로 넘긴다
    const stateY = (location.state as { scrollY?: unknown } | null)?.scrollY
    if (type !== 'POP' && typeof stateY !== 'number') {
      if (!(type === 'REPLACE' && keepOnReplace(prev, location))) window.scrollTo(0, 0)
      return
    }
    const y = typeof stateY === 'number' && type !== 'POP' ? stateY : (saved.get(location.key) ?? 0)
    window.scrollTo(0, y)
    if (y === 0) return
    const roots = [document.documentElement, document.body]
    const prevAnchor = roots.map((el) => el.style.overflowAnchor)
    roots.forEach((el) => (el.style.overflowAnchor = 'none'))
    restoring.current = true
    const start = performance.now()
    let raf = 0
    let done = false
    const stop = () => {
      if (done) return
      done = true
      restoring.current = false
      cancelAnimationFrame(raf)
      roots.forEach((el, i) => (el.style.overflowAnchor = prevAnchor[i]))
      STOP_EVENTS.forEach((t) => window.removeEventListener(t, stop))
    }
    const step = () => {
      window.scrollTo(0, y)
      if (performance.now() - start > RESTORE_MS) stop()
      else raf = requestAnimationFrame(step)
    }
    STOP_EVENTS.forEach((t) => window.addEventListener(t, stop, { passive: true }))
    raf = requestAnimationFrame(step)
    return stop
  }, [location, type])

  return null
}
