// 종류에 따라 칼로리 차이가 큰 음식 판별(CLAUDE.md "칼로리 계산 순서", 2026-10-26 사용자 결정).
// 이런 음식이 DB 대표값(group)이나 뒤쪽 일치(partial)에만 맞으면 DB 값을 쓰지 않고 AI 추정을 쓴다(resolve.ts).
// Node 시험 스크립트가 그대로 불러오므로 상대 import에 .ts를 붙이고 import.meta.env를 쓰지 않는다.
import type { MfdsFood } from './db.ts'
import { normalizeFoodName } from './normalize.ts'

/**
 * 정규화한 이름(공백 없음)에 들어 있으면 해당하는 키워드. DB 대표식품명(r)을 출력해 정했다
 * (버거 242·햄버거 105, 샌드위치 196, 닭튀김 199, 피자 2,412, 떡볶이 39, 라면 20, 마라탕 2, 샐러드 47,
 * 커피 710, 라떼 435, 에이드 122, 스무디 685, 밀크티/버블티 165, 케이크 527, 마카롱 148, 빙수 135, 도넛 244, 와플 168 …).
 */
export const HIGH_VARIANCE_KEYWORDS: readonly string[] = [
  // 햄버거·샌드위치
  '버거', '샌드위치',
  // 치킨. DB 대표식품명은 '닭튀김'·'닭강정'이다
  '치킨', '닭튀김', '닭강정',
  // 피자
  '피자',
  // 떡볶이·라면
  '떡볶이', '라면',
  // 마라탕·샐러드
  '마라', '샐러드',
  // 카페 음료
  '커피', '라떼', '카페', '카푸치노', '마키아토', '마끼아또', '프라푸치노', '프라페', '에이드', '스무디',
  '버블티', '밀크티', '쉐이크', '셰이크',
  // 케이크·디저트
  '케이크', '케익', '마카롱', '빙수', '와플', '크로플', '도넛', '도너츠', '머핀', '타르트', '브라우니',
  '티라미수', '쿠키', '아이스크림', '젤라또', '파르페',
]

/**
 * 키워드가 이 말 안에 들어 있을 때는 세지 않는다(오탐 방지).
 * 예: 치킨무(반찬), 치킨스톡(재료), 치킨가스(돈가스류), 고구마라떼의 '마라'.
 * 닭볶음탕·닭갈비·닭죽처럼 키워드가 없는 닭 요리는 처음부터 해당하지 않는다.
 */
export const HIGH_VARIANCE_EXCLUDE: readonly string[] = [
  '치킨무', '치킨스톡', '치킨파우더', '치킨가스', '치킨까스', '고구마라', '마라톤',
]

/** 정규화한 문자열 t에 키워드가 제외어 밖에서 한 번이라도 나오면 true */
function hasKeyword(t: string): boolean {
  if (!t) return false
  for (const kw of HIGH_VARIANCE_KEYWORDS) {
    for (let at = t.indexOf(kw); at !== -1; at = t.indexOf(kw, at + 1)) {
      const excluded = HIGH_VARIANCE_EXCLUDE.some((ex) => {
        const off = ex.indexOf(kw)
        return off !== -1 && at - off >= 0 && t.startsWith(ex, at - off)
      })
      if (!excluded) return true
    }
  }
  return false
}

/** 이름(모델·사용자가 낸 것) 또는 매칭된 DB 행의 대표식품명(r)이 종류별 차이가 큰 음식이면 true */
export function isHighVarianceFood(name: string, matchedDbRow?: Pick<MfdsFood, 'r'> | null): boolean {
  if (hasKeyword(normalizeFoodName(name))) return true
  return matchedDbRow ? hasKeyword(normalizeFoodName(matchedDbRow.r)) : false
}
