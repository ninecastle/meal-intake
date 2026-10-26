// 목표 설정 저장소(3단계 조각 2, 스펙 4.7절 "저장"). 리더가 시그니처만 먼저 둔 자리표시 파일이다.
// 구현은 firebase-engineer가 채운다(시그니처는 바꾸지 않는다). 화면(frontend-dev)은 이 시그니처에 맞춰 만든다.
// 규칙(firestore.rules)이 users/{uid}는 키 goal 하나, goal·input·targets 하위 키를 허용 목록으로 막으므로 여기서도 그 키만 쓴다.
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import {
  applyOverride,
  computeGoal,
  validateGoalInput,
  type GoalInput,
  type GoalOverride,
  type GoalResult,
  type GoalTargets,
} from '../analysis/goal'
import { db } from '../lib/firebase'
import { toDateKey } from '../lib/time'

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

const OVERRIDE_KEYS = ['target_kcal', 'carbs_g', 'protein_g', 'fat_g'] as const

const userRef = (uid: string) => doc(db, 'users', uid)
const goalsCol = (uid: string) => collection(db, 'users', uid, 'goals')

/** undefined 키와 허용 밖 키를 뺀다. 남는 키가 없으면 null(규칙: override는 null이거나 허용 키만 든 map). */
function cleanOverride(o: GoalOverride | null): GoalOverride | null {
  if (!o) return null
  const out: GoalOverride = {}
  for (const k of OVERRIDE_KEYS) if (o[k] !== undefined) out[k] = o[k]
  return Object.keys(out).length > 0 ? out : null
}

/** 규칙의 targets 키 목록(정확히 5개)에 맞춰 다시 만든다. */
function pickTargets(t: GoalTargets): GoalTargets {
  return { target_kcal: t.target_kcal, carbs_g: t.carbs_g, protein_g: t.protein_g, fat_g: t.fat_g, source: t.source }
}

function errCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
}

function writeError(e: unknown): GoalStoreError {
  if (e instanceof GoalStoreError) return e
  const c = errCode(e)
  if (c === 'permission-denied') return new GoalStoreError('GOAL_SAVE_REJECTED', '저장이 거부됐습니다(보안 규칙)', { cause: e })
  return new GoalStoreError('GOAL_STORE_UNAVAILABLE', `저장소 오류: ${c || String(e)}`, { cause: e })
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
  const v = validateGoalInput(input)
  if (!v.ok) throw new GoalStoreError('GOAL_INVALID', v.errors.join('; '))
  const result = computeGoal(v.value)
  const o = cleanOverride(override)
  const applied = applyOverride(result, o)
  if (applied.errors.length > 0) throw new GoalStoreError('GOAL_INVALID', applied.errors.join('; '))
  const targets = pickTargets(applied.targets)
  const dateKey = toDateKey(now)

  const batch = writeBatch(db)
  // mergeFields: goal 필드를 통째로 바꾼다(merge: true는 지도 깊은 병합이라 지난 override 키가 남는다).
  batch.set(
    userRef(uid),
    { goal: { input: v.value, override: o, result, targets, updatedAt: serverTimestamp() } },
    { mergeFields: ['goal'] },
  )
  // 같은 날 여러 번 바꾸면 그날 문서를 덮어쓴다. 신체 정보(input)는 넣지 않는다.
  batch.set(doc(goalsCol(uid), dateKey), { dateKey, targets, updatedAt: serverTimestamp() })
  try {
    await batch.commit()
  } catch (e) {
    throw writeError(e)
  }
  return targets
}

/** 현재 목표(users/{uid}.goal). 문서나 goal 필드가 없으면 null. 반환값은 구독 해제 함수. */
export function subscribeGoal(
  uid: string,
  cb: (g: StoredGoal | null) => void,
  onError?: (code: GoalStoreErrorCode) => void,
): () => void {
  return onSnapshot(
    userRef(uid),
    (s) => {
      const g = s.exists()
        ? ((s.data({ serverTimestamps: 'estimate' }) as { goal?: StoredGoal }).goal ?? null)
        : null
      if (!g) return cb(null)
      cb({
        input: g.input,
        override: g.override ?? null,
        result: g.result,
        targets: g.targets,
        updatedAt: g.updatedAt ?? null,
      })
    },
    (e) => {
      console.warn('[goals] subscribeGoal 오류', e)
      onError?.('GOAL_STORE_UNAVAILABLE')
    },
  )
}

/** 날짜 D의 비교 목표: goals에서 dateKey <= D 가운데 가장 늦은 것. 없으면 null(목표를 처음 정하기 전의 날). */
export function subscribeGoalForDate(
  uid: string,
  dateKey: string,
  cb: (g: DatedGoal | null) => void,
  onError?: (code: GoalStoreErrorCode) => void,
): () => void {
  // 범위 조건과 정렬이 같은 필드라 단일 필드 인덱스로 동작한다(firestore.indexes.json 추가 없음).
  const q = query(goalsCol(uid), where('dateKey', '<=', dateKey), orderBy('dateKey', 'desc'), limit(1))
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0]
      if (!d) return cb(null)
      const x = d.data() as DatedGoal
      cb({ dateKey: x.dateKey, targets: x.targets })
    },
    (e) => {
      console.warn('[goals] subscribeGoalForDate 오류', e)
      onError?.('GOAL_STORE_UNAVAILABLE')
    },
  )
}
