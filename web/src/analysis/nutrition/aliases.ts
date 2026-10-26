// 별칭표 (스펙 4.5.4 4단계). Node 변환·시험 스크립트와 Vite가 같은 파일을 읽도록 TS로 두고,
// 지울 수 있는 TS 문법만 쓴다(스펙은 aliases.json).
// 모든 항목은 DB 이름을 출력해 근거를 확인한 것만 넣는다(_workspace/03_vision_eval.md "별칭·세부 종류").

/** 통째 별칭: 정규화한 조회어 → DB 식품명(원문). 바꾼 이름으로 이름 키 → 세부명 키 → 그룹 키 순서로 다시 찾는다 */
export const FOOD_ALIASES: Readonly<Record<string, string>> = {
  공기밥: '쌀밥',
  공깃밥: '쌀밥',
  흰쌀밥: '쌀밥',
  흰밥: '쌀밥',
  밥: '쌀밥',
  김치: '배추김치',
  계란말이: '달걀말이',
  계란후라이: '달걀후라이',
  // DB 식품명이 "무초절임(치킨무)"라 괄호를 지우면 "무초절임"만 남는다
  치킨무: '무초절임(치킨무)',
  // DB 대표식품명이 "닭볶음(닭갈비)" → 정규화 "닭볶음"
  닭갈비: '닭볶음(닭갈비)',
  // DB에는 "불고기" 그룹이 없고 소불고기·돼지불고기·오리불고기로 나뉜다. 그냥 "불고기"는 소불고기로 본다
  불고기: '소불고기',
  카레: '카레라이스',
  짜장: '짜장면',
  // DB는 "용기면"
  컵라면: '라면_용기면',
  // DB에는 아메리카노 그룹이 없고 "커피_…아메리카노…" 상품 행만 있다(브랜드 없는 기본 행, 3kcal/100g)
  아메리카노: '커피_아메리카노 핫(HOT) (R)',
  핫아메리카노: '커피_아메리카노 핫(HOT) (R)',
  아이스아메리카노: '커피_아메리카노 아이스(ICED) (R)',
  삶은달걀: '달걀_삶은것',
  프렌치프라이: '감자튀김_프렌치 프라이',
  순댓국: '순대국',
  떡볶기: '떡볶이',
}

/** 단어 단위 치환. except 안에 든 from은 바꾸지 않는다(오탐 방지) */
export interface WordAlias {
  readonly from: string
  readonly to: string
  readonly except?: readonly string[]
  /**
   * true: 일반 이름 → 대표식품명(치킨 → 닭튀김). 이 치환으로 대표식품명에 맞으면 db_match를 group으로 본다.
   * 없으면 표기 차이(까스/가스 등)라 직접 일치와 같은 순서(이름 → 세부명 → 그룹)로 본다.
   */
  readonly group?: true
}

/**
 * 정규화한 이름 안의 단어를 DB 표기로 바꾼다. 위에서부터 차례로 적용한다(까스→가스가 치킨→닭튀김보다 먼저).
 * 조회어와 DB 이름 양쪽에 같은 치환을 적용해 비교한다(db.ts의 치환 키).
 */
export const FOOD_WORD_ALIASES: readonly WordAlias[] = [
  // DB 대표식품명은 "돈가스"(돈까스는 상품명 1건), 생선까스·동태까스는 "까스" → 양쪽 치환으로 둘 다 맞춘다
  { from: '까스', to: '가스' },
  // DB 대표식품명은 "닭튀김"(199행, "닭튀김_양념 치킨" 등). "치킨" 그룹은 없다
  {
    from: '치킨',
    to: '닭튀김',
    group: true,
    except: ['치킨무', '치킨스톡', '치킨파우더', '치킨가스', '치킨데리야끼', '먼치킨'],
  },
  // DB 달걀* 그룹 12개(달걀찜·달걀국·달걀말이…). "계란"은 계란빵·계란덮밥 등 8행뿐이고 그 행들은 직접 일치가 먼저다
  { from: '계란', to: '달걀' },
  // DB는 "달걀후라이"·"후라이드" 표기
  { from: '프라이', to: '후라이' },
  // DB는 자장면·간자장·자장밥과 짜장면·짜장밥이 둘 다 있다. 간짜장·삼선짜장면은 자장 쪽에만 있다
  { from: '짜장', to: '자장' },
  // DB "라테" 0건, "라떼" 741건
  { from: '라테', to: '라떼' },
  // DB는 "채소"(김밥_채소, 볶음밥_채소 …). "야채"는 야채빵 그룹 등 22행이고 직접 일치가 먼저다
  { from: '야채', to: '채소' },
  // DB "쇠고기" 0건, "소고기" 다수
  { from: '쇠고기', to: '소고기' },
  // DB는 "어묵"(어묵볶음·어묵국(어묵탕) …). "오뎅"은 상품명 "오뎅식당" 1건
  { from: '오뎅', to: '어묵', except: ['오뎅식당'] },
]

/** at 위치의 from이 except 낱말 안에 들어 있으면 true */
function inException(s: string, at: number, from: string, except?: readonly string[]): boolean {
  if (!except) return false
  return except.some((ex) => {
    const off = ex.indexOf(from)
    return off !== -1 && at - off >= 0 && s.startsWith(ex, at - off)
  })
}

/** 정규화한 이름 t에 단어 치환을 적용한다. withGeneric=false면 표기 차이만 바꾼다. 바뀐 것이 없으면 t 그대로 */
export function applyWordAliases(t: string, withGeneric = true): string {
  let s = t
  for (const { from, to, except, group } of FOOD_WORD_ALIASES) {
    if (group && !withGeneric) continue
    let out = ''
    let pos = 0
    for (let at = s.indexOf(from); at !== -1; at = s.indexOf(from, at + from.length)) {
      if (inException(s, at, from, except)) continue
      out += s.slice(pos, at) + to
      pos = at + from.length
    }
    if (pos > 0) s = out + s.slice(pos)
  }
  return s
}
