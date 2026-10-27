// (e) 날짜 줄의 오늘이 아닌 날 [오늘로]와 내일 막기(2026-10-27 사용자 결정).
// [오늘로]는 가운데 "오늘" 알약 자리에 같은 모양(같은 .todaypill 클래스) 버튼. 내일은 시안 .dside.r 모양 그대로 흐리게(.35) 막는다.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { homeHref } from '../mealText'

export function BackToToday({ today }: { today: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" className="todaypill" onClick={() => navigate(homeHref(today, today), { replace: true })}>
      오늘로
    </button>
  )
}

export function NextDayBlocked({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" className="dside r" disabled aria-label={label} style={{ opacity: 0.35, cursor: 'not-allowed' }}>
      {children}
    </button>
  )
}
