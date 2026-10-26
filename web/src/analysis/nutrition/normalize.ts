// 식품명 정규화 (스펙 4.5.4). 변환 스크립트(web/scripts/build-mfds-db.mjs)와 앱이 같은 함수를 쓴다.
// Node 스크립트가 타입 제거 방식으로 이 파일을 바로 불러오므로, 지울 수 있는 TS 문법만 쓴다.

const BRACKETED = /\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/g
const NON_WORD = /[^\p{L}\p{N}_]/gu

/**
 * NFKC → 괄호류 `()[]{}`와 그 안 내용 삭제(중첩 포함) → 글자·숫자·`_`가 아닌 문자 삭제
 * (공백·가운뎃점·쉼표·마침표·하이픈·남은 괄호 등) → 영문 소문자.
 */
export function normalizeFoodName(s: string): string {
  let t = (s ?? '').normalize('NFKC')
  for (let prev = ''; prev !== t; ) {
    prev = t
    t = t.replace(BRACKETED, '')
  }
  return t.replace(NON_WORD, '').toLowerCase()
}

/** 작업 지시서의 이름. normalizeFoodName과 같다. */
export const normalizeName = normalizeFoodName

/**
 * 세부명 키 (4.5.4). 정규화한 이름이 "A_…_B"면 마지막 조각 B에 A가 들어 있을 때 B, 아니면 B+A.
 * 예: "피자_치즈피자" → "치즈피자", "김치찌개_햄" → "햄김치찌개". `_`가 없으면 null.
 */
export function detailKey(normalized: string): string | null {
  const parts = normalized.split('_').filter(Boolean)
  if (parts.length < 2) return null
  const a = parts[0]
  const b = parts[parts.length - 1]
  return b.includes(a) ? b : b + a
}
