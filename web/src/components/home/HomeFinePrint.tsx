// (a) 하늘 띠 아래 작은 안내(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다):
// 목표 고지("의학적 조언이 아니에요", 스펙 4.7절, GoalPage와 같은 문구)와 영양 정보 출처 문구. 동의 화면이 들어가면 설정 → 약관으로 옮긴다.
// 시안 부품 클래스(.kinfo)로 그린다.
import { NUTRITION_SOURCE_NOTE } from '../mealText'

const GOAL_DISCLAIMER =
  '이 목표는 일반 공식(Mifflin-St Jeor)으로 계산한 참고값이며 의학적 조언이 아니에요. 질환이 있거나 임신·수유 중이면 전문가와 상의하세요.'

export function HomeFinePrint({ goal, source }: { goal: boolean; source: boolean }) {
  if (!goal && !source) return null
  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
      {goal && <p className="kinfo">{GOAL_DISCLAIMER}</p>}
      {source && <p className="kinfo">{NUTRITION_SOURCE_NOTE}. DB에 없는 음식은 AI 추정값이에요.</p>}
    </div>
  )
}
