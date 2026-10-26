// 다음 화면에서 한 번만 보이는 안내(예: 기록 수정 저장 뒤 상세의 "수정했어요").
// 뒤로 가기(navigate(-1))는 location.state를 넘길 수 없어서 메모리에 잠깐 둔다. 새로고침하면 사라진다(안내라서 괜찮다).
let pending: string | null = null

export function setFlash(key: string): void {
  pending = key
}

/** 렌더링 중에 불러도 된다(지우지 않는다). 지우는 것은 clearFlash로 effect에서. */
export function peekFlash(key: string): boolean {
  return pending === key
}

export function clearFlash(key: string): void {
  if (pending === key) pending = null
}
