// 기록 보기 [AI 리포트 👑] 탭 자리(디자인 조각 D7, 사용자 확인 2026-10-28 `_workspace/design/mock/d7_1_ai_placeholder.png`).
// 실제 AI 주간 리포트(D14, 스펙 4.11절)가 들어오기 전까지 시안 .chartcard.report 머리(제목·왕관) 아래 마스코트와 "준비 중이에요"만. AI 호출 없음.
import { Crown, Mascot } from '../ui'

export default function AiReportPane() {
  return (
    <div className="chartcard report">
      <header>
        <h3>AI 주간 리포트</h3>
        <Crown />
      </header>
      <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 8, padding: '10px 0 6px' }}>
        {/* .chartcard svg{width:100%}가 그림 크기를 덮어써서 88px 상자에 넣는다 */}
        <div style={{ width: 88 }}>
          <Mascot size={88} decorative />
        </div>
        <b style={{ fontSize: 17 }}>준비 중이에요</b>
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          한 주 기록을 살펴보고 잘한 점·아쉬운 점·
          <br />
          다음 주 제안을 알려 드릴게요
        </span>
      </div>
    </div>
  )
}
