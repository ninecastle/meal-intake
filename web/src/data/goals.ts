// 목표 설정 저장소(3단계 조각 2, 스펙 4.7절 "저장"). 리더가 시그니처만 먼저 둔 자리표시 파일이다.
// 구현은 firebase-engineer가 채운다(시그니처는 바꾸지 않는다). 화면(frontend-dev)은 이 시그니처에 맞춰 만든다.
import type { Timestamp } from 'firebase/firestore'
import type { GoalInput, GoalOverride, GoalResult, GoalTargets } from '../analysis/goal'

/** users/{uid}.goal */
export interface StoredGoal {
  input: GoalInput
  override: GoalOverride | null
  result: GoalResult
  targets: GoalTargets
  /** 서버 확인 전(오프라인 대기)에는 추정값, 읽을 수 없으면 null */
  updatedAt: Timestamp | null
}
/** users/{uid}/goals/{dateKey}: 그날부터 쓰는 목표값 */
export interface DatedGoal {
  dateKey: string
  targets: GoalTargets
}

export type GoalStoreErrorCode = 'GOAL_INVALID' | 'GOAL_SAVE_REJECTED' | 'GOAL_STORE_UNAVAILABLE'

export class GoalStoreError extends Error {
  readonly code: GoalStoreErrorCode
  constructor(code: GoalStoreErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options)
    this.name = 'GoalStoreError'
    this.code = code
  }
}

/**
 * 입력과 직접 조정값을 검사·계산해(validateGoalInput → computeGoal → applyOverride) users/{uid}.goal과
 * users/{uid}/goals/{오늘 dateKey}를 같은 배치로 쓴다. 쓴 targets를 돌려준다.
 * 검사 실패: GOAL_INVALID(메시지에 이유). 규칙 거부: GOAL_SAVE_REJECTED. 그 밖: GOAL_STORE_UNAVAILABLE.
 * 오프라인이면 서버 확인까지 끝나지 않는다(meals와 같다. 쓰기는 기기에 남아 연결되면 올라간다).
 */
export async function saveGoal(
  uid: string,
  input: GoalInput,
  override: GoalOverride | null,
  now: Date = new Date(),
): Promise<GoalTargets> {
  void uid
  void input
  void override
  void now
  throw new GoalStoreError('GOAL_STORE_UNAVAILABLE', '아직 구현 전(firebase-engineer)')
}

/** 현재 목표(users/{uid}.goal). 문서나 goal 필드가 없으면 null. 반환값은 구독 해제 함수. */
export function subscribeGoal(
  uid: string,
  cb: (g: StoredGoal | null) => void,
  onError?: (code: GoalStoreErrorCode) => void,
): () => void {
  void uid
  void cb
  void onError
  return () => {}
}

/** 날짜 D의 비교 목표: goals에서 dateKey <= D 가운데 가장 늦은 것. 없으면 null(목표를 처음 정하기 전의 날). */
export function subscribeGoalForDate(
  uid: string,
  dateKey: string,
  cb: (g: DatedGoal | null) => void,
  onError?: (code: GoalStoreErrorCode) => void,
): () => void {
  void uid
  void dateKey
  void cb
  void onError
  return () => {}
}
