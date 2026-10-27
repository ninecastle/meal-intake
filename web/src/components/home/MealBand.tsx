// 홈 연두 띠 "식사"(디자인 조각 D2). 계약만 둔 임시 파일: 끼니 카드 4개·공복 표시·이어 할 기록은 D2 담당 에이전트가 채운다.
import type { DaySummary } from '../../data/summary'
import type { MealWithId } from '../../data/meals'

export interface MealBandProps {
  uid: string
  /** 홈에서 보고 있는 날짜(YYYY-MM-DD). 카드로 기록을 시작하면 이 날짜로 들어간다 */
  dateKey: string
  /** 그날 done 기록 요약. 불러오는 중이면 null */
  day: DaySummary | null
  /** 날짜와 무관한 이어 할 기록(awaiting_after·needs_review). 불러오는 중이면 null */
  pending: MealWithId[] | null
}

export default function MealBand(_props: MealBandProps) {
  return null
}
