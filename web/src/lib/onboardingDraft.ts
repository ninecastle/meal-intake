// 목표 질문(디자인 조각 D11) 입력 초안. 질문 중 새로고침해도 이어지게 이 기기 localStorage에 두고, 목표를 저장하면 지운다.
// 입력 중 문자열을 그대로 둔다(계산할 때만 숫자로). 시작 순서 바꿈(2026-10-28) 뒤로는 로그인한 뒤에만 쓴다.
import type { Activity, GoalOverride, GoalType, Sex } from '../analysis/goal'

const KEY = 'onboardingDraft.v1'

export interface OnboardingDraft {
  sex: Sex | null
  age: string
  height: string
  weight: string
  activity: Activity | null
  goal: GoalType | null
  /** 결과 화면 목표 칼로리·탄단지 직접 조정(없으면 추천값) */
  override: GoalOverride | null
  /** 학교 단계에서 고른 학교(D13, 선택). 로그인·목표 저장 때 users/{uid}.school로 저장한다 */
  school?: { atpt: string; code: string; name: string } | null
}

export const EMPTY_DRAFT: OnboardingDraft = { sex: null, age: '', height: '', weight: '', activity: null, goal: null, override: null }

export function readOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<OnboardingDraft> | null
    if (!v || typeof v !== 'object') return null
    const str = (x: unknown) => (typeof x === 'string' ? x : '')
    return {
      sex: v.sex === 'male' || v.sex === 'female' ? v.sex : null,
      age: str(v.age),
      height: str(v.height),
      weight: str(v.weight),
      activity: typeof v.activity === 'string' ? v.activity : null,
      goal: typeof v.goal === 'string' ? v.goal : null,
      override: v.override && typeof v.override === 'object' ? v.override : null,
      school: readSchool(v.school),
    }
  } catch {
    return null
  }
}

function readSchool(x: unknown): OnboardingDraft['school'] {
  if (!x || typeof x !== 'object') return null
  const { atpt, code, name } = x as Record<string, unknown>
  return typeof atpt === 'string' && typeof code === 'string' && typeof name === 'string' ? { atpt, code, name } : null
}

export function writeOnboardingDraft(d: OnboardingDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    // 저장하지 못해도 이번 화면에서는 메모리 값으로 이어 간다
  }
}

export function clearOnboardingDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 무시
  }
}
