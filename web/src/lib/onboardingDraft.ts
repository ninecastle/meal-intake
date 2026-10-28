// 목표 질문(디자인 조각 D11) 입력 초안. 로그인 전 입력값은 이 기기 localStorage에만 두고, 목표를 저장하면 지운다(2026-10-28 사용자 결정).
// 입력 중 문자열을 그대로 둔다(계산할 때만 숫자로). loginPending: 결과 화면에서 [구글로 저장하고 시작하기]를 눌러 로그인하는 중
// (리디렉션 로그인으로 페이지가 다시 열려도 결과 화면이 이어서 저장한다. 로그인 뒤 동의 초안 저장(App Root)은 이때 화면을 옮기지 않는다).
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
  loginPending?: boolean
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
      loginPending: v.loginPending === true,
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
