// (e) 날짜 줄의 오늘이 아닌 날 [오늘로]와 내일 막기 표시(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다).
// 시안 부품 클래스(.todaypill·.dside.r)로 그린다. 내일 이후로는 갈 수 없다(2026-10-27 사용자 결정).
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { homeHref } from '../mealText'

/** 오늘이 아닌 날: 가운데 "오늘" 알약 자리에 [오늘로](하늘 진한 알약, 누르는 높이 44px) */
export function BackToToday({ today }: { today: string }) {
  return (
    <Link to={homeHref(today, today)} replace style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
      <span className="todaypill" style={{ background: 'var(--sky-deep)' }}>
        오늘로
      </span>
    </Link>
  )
}

/** 다음 날이 오늘보다 뒤: 오른쪽 날짜를 흐리게 막는다 */
export function NextDayBlocked({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" className="dside r" disabled aria-label={label} style={{ opacity: 0.35, cursor: 'not-allowed' }}>
      {children}
    </button>
  )
}
