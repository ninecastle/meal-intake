// 끼니 화면에서 음식을 눌러 고친 내용(2026-10-28 사용자 결정): 수정 화면 [확인]은 저장하지 않고 여기에 두고,
// 끼니 화면이 목록·합계에 바로 보인 뒤 [수정 완료]를 누를 때 저장한다. [수정 완료] 없이 나가면 물어보고 버린다.
// 기기 메모리에만 둔다(새로고침하면 사라진다 — 저장하지 않은 수정이므로). AI 호출 없음.
import type { MealType } from '../data/meals'
import type { MealIntakeAnalysis } from '../types/analysis'

export type PendingEdit = { dateKey: string; mealType: MealType; analysis: MealIntakeAnalysis }

const edits = new Map<string, PendingEdit>()
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  listeners.forEach((f) => f())
}

export function getPendingEdit(mealId: string): PendingEdit | null {
  return edits.get(mealId) ?? null
}

export function setPendingEdit(mealId: string, e: PendingEdit): void {
  edits.set(mealId, e)
  changed()
}

export function dropPendingEdit(mealId: string): void {
  if (edits.delete(mealId)) changed()
}

export function allPendingEdits(): [string, PendingEdit][] {
  return [...edits]
}

export function clearPendingEdits(): void {
  if (edits.size === 0) return
  edits.clear()
  changed()
}

/** useSyncExternalStore용 */
export function subscribePendingEdits(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const pendingEditsVersion = () => version
