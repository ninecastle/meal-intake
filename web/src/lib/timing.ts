// 단계별 시간 표시(2026-10-29 사용자 요청, 실기기에서 어디가 느린지 재기). 주소에 ?timing=1을 붙여 연 탭에서만 켜진다
// (sessionStorage에 남아 그 탭에서는 계속). 심사위원 화면에는 보이지 않는다. 화면은 components/TimingOverlay.
/** endAt = 측정 시작부터 이 단계가 끝난 때까지(ms, timingMark 'last' 계산용) */
type Step = { label: string; ms: number; endAt?: number }
export type TimingRun = { title: string; steps: Step[]; totalMs: number; done: boolean }

let enabledCache: boolean | null = null
export function timingOn(): boolean {
  if (enabledCache !== null) return enabledCache
  try {
    if (new URLSearchParams(location.search).get('timing') === '1') sessionStorage.setItem('timing', '1')
    if (new URLSearchParams(location.search).get('timing') === '0') sessionStorage.removeItem('timing')
    enabledCache = sessionStorage.getItem('timing') === '1'
  } catch {
    enabledCache = false
  }
  return enabledCache
}

let run: (TimingRun & { t0: number }) | null = null
const listeners = new Set<(r: TimingRun | null) => void>()
const emit = () => listeners.forEach((l) => l(run && { title: run.title, steps: [...run.steps], totalMs: run.totalMs, done: run.done }))

export function subscribeTiming(l: (r: TimingRun | null) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 새 측정 시작(이전 것은 버림) */
export function timingStart(title: string): void {
  if (!timingOn()) return
  run = { title, steps: [], totalMs: 0, done: false, t0: performance.now() }
  emit()
}

/** 한 단계를 재서 기록한다. 측정이 꺼져 있으면 그냥 실행만 */
export async function timed<T>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (!timingOn() || !run) return typeof work === 'function' ? work() : work
  const t = performance.now()
  try {
    return await (typeof work === 'function' ? work() : work)
  } finally {
    if (run) {
      run.steps.push({ label, ms: performance.now() - t, endAt: performance.now() - run.t0 })
      run.totalMs = performance.now() - run.t0
      emit()
    }
  }
}

export function timingEnd(): void {
  if (!run) return
  run.totalMs = performance.now() - run.t0
  run.done = true
  emit()
}

/**
 * 구독처럼 promise가 없는 단계를 기록한다(2026-10-29, AI 리포트 기록 불러오기 등).
 * from 'start' = 측정 시작부터 지금까지, 'last' = 직전 단계가 끝난 때(없으면 시작)부터 지금까지. 측정이 꺼져 있으면 아무 일 없음.
 */
export function timingMark(label: string, from: 'start' | 'last' = 'last'): void {
  if (!timingOn() || !run) return
  const now = performance.now()
  const last = run.steps.length > 0 ? run.t0 + run.steps.reduce((a, s) => Math.max(a, s.endAt ?? 0), 0) : run.t0
  const since = from === 'start' ? run.t0 : Math.max(run.t0, last)
  run.steps.push({ label, ms: now - since, endAt: now - run.t0 })
  run.totalMs = now - run.t0
  emit()
}
