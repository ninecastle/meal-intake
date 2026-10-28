// (d) 남은 양 상자(.remain) 자리의 목표 없음·목표 정하기 전 날·목표 초과(2026-10-27 사용자 결정, 시안에 없는 상태라 시안 .remain 모양 그대로).
// 목표가 없으면 링은 바탕 원만, 링 가운데는 "목표 –", 막대는 "62 / –g"(채움 없음) — 그 부분은 DayBand가 그린다.
import { Link, useLocation } from 'react-router'
import type { DayGoalView } from './DayBand'

/** 목표를 넘었을 때: 시안 .remain 그대로, 숫자 색만 peach-deep */
export function GoalOverRemain({ overText }: { overText: string }) {
  return (
    <div className="remain">
      <span className="num" style={{ color: 'var(--peach-deep)' }}>
        {`${overText} kcal`}
      </span>{' '}
      넘었어요
    </div>
  )
}

/** 그날 목표가 없을 때(목표 없음 → 목표 설정, 정하기 전 날, 불러오는 중·오류는 빈 상자로 높이만) */
export function NoGoalRemain({ kind }: { kind: Exclude<DayGoalView['kind'], 'targets'> }) {
  const loc = useLocation()
  if (kind === 'none') {
    // 목표 질문(D11). 저장하면 이 칸으로 돌아와 맨 위(backKey)
    return (
      <Link to="/start" state={{ from: 'home', backKey: loc.key }} className="remain" style={{ display: 'block' }}>
        목표를 정하면 남은 양을 알려 드려요 ›
      </Link>
    )
  }
  if (kind === 'before') return <div className="remain">이 날은 목표를 정하기 전이에요</div>
  return <div className="remain">{' '}</div>
}
