// 별칭표 (스펙 4.5.4 4단계): 정규화한 조회어 → DB 식품명.
// 평가에서 자주 어긋난 이름만 최소한으로 둔다(10개 이내).
// 스펙은 aliases.json이지만, Node 변환·시험 스크립트와 Vite가 import 속성 없이 같은 파일을 읽도록 TS로 둔다.
export const FOOD_ALIASES: Readonly<Record<string, string>> = {
  공기밥: '쌀밥',
  흰쌀밥: '쌀밥',
  흰밥: '쌀밥',
  밥: '쌀밥',
  김치: '배추김치',
  계란말이: '달걀말이',
}
