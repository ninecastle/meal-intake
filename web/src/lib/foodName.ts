// 화면에 보이는 음식 이름(2026-10-27 사용자가 고른 변경). 런타임 import가 없는 순수 모듈이다(node가 .ts를 바로 불러 시험: spike/tests/food_name_test.mjs).
// 식약처 DB 표기 "분류_세부"(예: "버거_빅맥 버거")를 그대로 보이지 않는다. 밑줄 앞 분류는 앞에서 빼고, 세부 이름에 분류 말이 이미 있으면
// 다시 붙이지 않는다(겹치는 말 없이). 없으면 뜻이 바뀌지 않게 뒤에 한 번 붙인다("김밥_김치" → "김치김밥", 그냥 빼면 "김치"가 된다).
// 저장된 이름은 바꾸지 않는다(DB 조회·자동완성은 원래 표기로 한다). 화면에 이름을 그리는 곳은 모두 이 함수를 거친다.

const key = (s: string) => s.replace(/[\s()[\]{}]/g, '')

/** 이어서 같은 낱말이 두 번 나오면 하나만 남긴다("버거 버거" → "버거") */
function dedupeWords(s: string): string {
  const out: string[] = []
  for (const w of s.split(' ')) if (w && out[out.length - 1] !== w) out.push(w)
  return out.join(' ')
}

/**
 * "버거_빅맥 버거" → "빅맥 버거", "국밥_순대국밥" → "순대국밥", "김밥_김치" → "김치김밥",
 * "덮밥_돼지고기(제육)" → "돼지고기(제육) 덮밥", "샌드위치_햄_달걀" → "햄 달걀 샌드위치". 밑줄이 없으면 빈칸만 정리한다.
 */
export function foodName(raw: string): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim()
  const parts = s
    .split('_')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return dedupeWords(parts[0] ?? s)
  const [cat, ...rest] = parts
  const body = rest.join(' ')
  if (rest.some((p) => key(p).includes(key(cat)))) return dedupeWords(body)
  // 세부가 한 낱말이고 괄호로 끝나지 않으면 한국어 이름처럼 붙여 쓴다("김치김밥"), 아니면 띄운다("돼지고기(제육) 덮밥")
  const glue = rest.length === 1 && !body.includes(' ') && !/[)\]}]$/.test(body) ? '' : ' '
  return dedupeWords(body + glue + cat)
}
