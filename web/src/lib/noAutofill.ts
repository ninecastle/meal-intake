// 모든 입력 칸에서 브라우저 자동 완성·기기 자판 오타 고침·맞춤법 검사를 끈다(2026-10-28 사용자 요청, 사용자가 고른 변경 28).
// 칸마다 속성을 적는 대신 문서에 새로 생기는 input·textarea에 한 번에 붙인다.
// 안드로이드 크롬 자판 위 "열쇠·카드·위치" 줄은 브라우저가 정하는 것이라 이 속성으로도 사라지지 않을 수 있다.
const ATTRS: [string, string][] = [
  ['autocomplete', 'off'],
  ['autocorrect', 'off'],
  ['autocapitalize', 'off'],
  ['spellcheck', 'false'],
  ['data-gramm', 'false'],
]

function apply(el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  for (const [k, v] of ATTRS) if (el.getAttribute(k) !== v) el.setAttribute(k, v)
}

export function disableAutofillEverywhere(root: Document = document) {
  root.querySelectorAll('input, textarea').forEach(apply)
  new MutationObserver((list) => {
    for (const m of list)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return
        apply(n)
        n.querySelectorAll('input, textarea').forEach(apply)
      })
  }).observe(root.documentElement, { childList: true, subtree: true })
}
