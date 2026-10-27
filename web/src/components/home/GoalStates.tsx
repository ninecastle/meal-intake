// (d) 목표 없음·목표 정하기 전 날·목표 초과 표시(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다).
// 시안에는 늘 목표가 있고 "더 먹을 수 있어요"만 있다. 시안 부품 클래스(.remain·.minor)로 그린다.
import { Link } from 'react-router'
import type { DayGoalView } from './DayBand'

/** 링 가운데 위 작은 글: 그날 목표가 없을 때("목표 N" 자리) */
export function NoGoalRingLabel() {
  return <>먹은 양</>
}

/** 남은 양 상자 자리: 목표를 넘었을 때 */
export function GoalOverRemain({ overText }: { overText: string }) {
  return (
    <div className="remain">
      <span className="num" style={{ color: 'var(--peach-deep)' }}>
        {overText} kcal
      </span>{' '}
      넘었어요
    </div>
  )
}

/** 남은 양 상자 자리: 그날 목표가 없을 때(목표 없음·정하기 전 날·불러오기 오류) */
export function GoalGuide({ goal }: { goal: DayGoalView }) {
  if (goal.kind === 'error') {
    return (
      <Link to="/goal" state={{ fromHome: true }} className="remain" style={{ display: 'block', background: 'var(--butter-soft)' }}>
        목표를 불러오지 못했어요 · <span style={{ textDecoration: 'underline' }}>목표 설정</span>
      </Link>
    )
  }
  if (goal.kind === 'none') {
    return (
      <Link to="/goal" state={{ fromHome: true }} className="remain" style={{ display: 'block' }}>
        목표 설정하기 ›
        <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--ink-2)' }}>
          키·몸무게·활동량을 넣으면 하루 목표 칼로리와 탄·단·지를 추천해 드려요.
        </span>
      </Link>
    )
  }
  if (goal.kind === 'before') return <div className="minor">이 날은 목표를 정하기 전이라 합계만 보여요</div>
  return null
}
