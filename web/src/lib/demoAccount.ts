// 심사위원용 테스트 계정(2026-11-01 사용자 결정): 이 계정으로 소개 화면에서 새로 로그인하면, 그 기기에서만 처음 가입한 것처럼
// 동의 → 목표 질문 → 학교 → 결과 → 튜토리얼을 보인다. 서버의 동의·목표·튜토리얼 기록과 두 달 식단은 건드리지 않는다
// (같은 계정을 동시에 쓰는 다른 심사위원 화면이 튀지 않게). 단계를 마칠 때마다 다음 단계로 넘기고, 튜토리얼이 끝나면 지운다.
// - 'consent': 동의가 없는 것처럼(components/terms/consentState) → 동의하면 'goal'(pages/ConsentPage)
// - 'goal': 목표가 없는 것처럼(ConsentPage·OnboardingPage) → 목표를 저장하면 'tutorial'(OnboardingPage)
// - 'tutorial': 튜토리얼을 안 본 것처럼(components/tutorial/HomeTutorial) → 끝내거나 건너뛰면 지움
// 표시는 기기 localStorage(계정별 키). 로그아웃 때 지우고(lib/logoutCleanup), 다음 새 로그인 때 다시 처음부터.
import { useSyncExternalStore } from 'react'

/** 심사위원용 테스트 계정(소문자) */
const DEMO_EMAILS = ['mealapp.test2026@gmail.com']

export type DemoStage = 'consent' | 'goal' | 'tutorial'

export const DEMO_STAGE_PREFIX = 'demoFresh.v1:'
const keyOf = (uid: string) => DEMO_STAGE_PREFIX + uid

export function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && DEMO_EMAILS.includes(email.trim().toLowerCase())
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export function getDemoStage(uid: string | null | undefined): DemoStage | null {
  if (!uid) return null
  try {
    const v = localStorage.getItem(keyOf(uid))
    return v === 'consent' || v === 'goal' || v === 'tutorial' ? v : null
  } catch {
    return null
  }
}

export function setDemoStage(uid: string, stage: DemoStage | null): void {
  try {
    if (stage) localStorage.setItem(keyOf(uid), stage)
    else localStorage.removeItem(keyOf(uid))
  } catch {
    // 저장소를 못 쓰면 처음처럼 보이기를 건너뛴다
  }
  emit()
}

/** 지금 단계가 from일 때만 to로 넘긴다(다른 단계에서 잘못 넘기지 않게) */
export function advanceDemoStage(uid: string, from: DemoStage, to: DemoStage | null): void {
  if (getDemoStage(uid) === from) setDemoStage(uid, to)
}

function subscribe(f: () => void): () => void {
  listeners.add(f)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(DEMO_STAGE_PREFIX)) f()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(f)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDemoStage(uid: string | null | undefined): DemoStage | null {
  return useSyncExternalStore(
    subscribe,
    () => getDemoStage(uid),
    () => null,
  )
}
