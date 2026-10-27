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
  // 자동완성 "대표값" 후보 꼬리표(" · 대표값")는 이름이 아니다(예전에 그대로 저장된 이름도 화면에서 뺀다)
  const s = (raw ?? '').replace(/\s*·\s*대표값\s*$/, '').replace(/\s+/g, ' ').trim()
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

// 맨밥(쌀밥·공기밥·현미밥·잡곡밥, "보리 흑미 잡곡밥"처럼 곡물 이름이 여럿 붙은 것도). 곡물이 아닌 말이 붙은
// 컵밥·덮밥·볶음밥·비빔밥·김밥·국밥·초밥·콩나물밥·"비빔 잡곡밥"은 요리라 맨밥이 아니다(2026-10-28 사용자 요청).
const PLAIN_RICE = /^(?:흰|쌀|백미|백|현미|발아|잡곡|혼합|흑미|보리|콩|서리태|찹쌀|오곡|기장|귀리|수수|조|팥|순|공기|공깃)*밥$/

/** 맨밥인지. 괄호 안 설명("쌀밥(1공기)")과 빈칸은 빼고 본다 */
export function isPlainRice(name: string): boolean {
  return PLAIN_RICE.test(foodName(name).replace(/\([^)]*\)/g, '').replace(/\s+/g, ''))
}

/**
 * 대표 음식 글자("첫 음식 외 n개", 홈 끼니 카드·먹은 후 시트 부제). 맨밥은 대표로 쓰지 않고 다음 음식을 쓴다(맨밥뿐이면 그 밥).
 * 개수는 전체에서 하나를 뺀 수. 이름은 화면 이름(foodName)으로 정리한다. 음식이 없으면 빈 문자열.
 */
export function representativeFood(names: string[]): string {
  const shown = names.map(foodName).filter(Boolean)
  if (shown.length === 0) return ''
  const main = shown.find((n) => !isPlainRice(n)) ?? shown[0]
  return `${main}${shown.length > 1 ? ` 외 ${shown.length - 1}개` : ''}`
}
