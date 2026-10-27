// web/scripts/gen-ui-art.mjs로 디자인 시안(_workspace/design/diet-app-prototype.html)에서 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다.
// 시안 `icons`의 끼니 그림 4개(아침 해, 점심 해와 언덕, 저녁 달, 간식 케이크). 장식이라 읽지 않는다.
// style: 시안 끼니 화면 큰 그림(class="mico" style="width:110px;height:110px")처럼 시안 CSS .mico 크기를 덮을 때.
import type { CSSProperties, ReactNode } from 'react'
import type { MealType } from '../../data/meals'

const ART: Record<MealType, ReactNode> = {
  breakfast: (
    <>
      <g fill="#FFCF4D"><rect x="29.5" y="2" width="5" height="10" rx="2.5"/><rect x="29.5" y="52" width="5" height="10" rx="2.5"/><rect x="2" y="29.5" width="10" height="5" rx="2.5"/><rect x="52" y="29.5" width="10" height="5" rx="2.5"/><rect x="29.5" y="2" width="5" height="10" rx="2.5" transform="rotate(45 32 32)"/><rect x="29.5" y="2" width="5" height="10" rx="2.5" transform="rotate(135 32 32)"/><rect x="29.5" y="2" width="5" height="10" rx="2.5" transform="rotate(225 32 32)"/><rect x="29.5" y="2" width="5" height="10" rx="2.5" transform="rotate(315 32 32)"/></g><circle cx="32" cy="32" r="16" fill="#FFC93C"/><circle cx="32" cy="32" r="16" fill="none" stroke="#F5B323" strokeWidth="2"/><path d="M22 26a11 11 0 0 1 8-7" stroke="#FFE9A3" strokeWidth="3" fill="none" strokeLinecap="round"/><circle cx="27" cy="32" r="1.8" fill="#3B2F2A"/><circle cx="37" cy="32" r="1.8" fill="#3B2F2A"/><path d="M29.5 36.5q2.5 2 5 0" stroke="#3B2F2A" strokeWidth="1.8" fill="none" strokeLinecap="round"/><circle cx="23.5" cy="35.5" r="2.3" fill="#F7A27A" opacity=".7"/><circle cx="40.5" cy="35.5" r="2.3" fill="#F7A27A" opacity=".7"/>
    </>
  ),
  lunch: (
    <>
      <g fill="#FFCF4D"><circle cx="22" cy="6" r="2.6"/><circle cx="8" cy="14" r="2.6"/><circle cx="5" cy="28" r="2.6"/><circle cx="36" cy="12" r="2.6"/></g><circle cx="23" cy="25" r="12" fill="#FFC93C"/><path d="M16 22a8 8 0 0 1 5-5" stroke="#FFE9A3" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d="M40 18c3-4 10-4 12 0 4-1 7 2 6 5H38c-1-3 0-5 2-5z" fill="#FFFFFF" stroke="#D9EAF5" strokeWidth="1.5"/><path d="M2 54 C12 36 22 34 30 44 C38 30 50 28 62 46 V58 H2 Z" fill="#A9D884"/><path d="M8 58 C18 42 30 40 42 50 C48 44 56 44 62 50 V58 Z" fill="#7CBF4E"/><path d="M16 48 c4-4 8-5 12-3" stroke="#C6E8A6" strokeWidth="2.5" fill="none" strokeLinecap="round"/><rect x="2" y="56" width="60" height="4" rx="2" fill="#5E9F38"/>
    </>
  ),
  dinner: (
    <>
      <path d="M34 6a24 24 0 1 0 24 30A19 19 0 0 1 34 6z" fill="#FFD45C"/><path d="M34 6a24 24 0 1 0 24 30A19 19 0 0 1 34 6z" fill="none" stroke="#F2B92E" strokeWidth="2" strokeLinejoin="round"/><path d="M17 22a18 18 0 0 1 7-9" stroke="#FFF0B8" strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M18 36q3 2.4 6 0M29 38q3 2.4 6 0" stroke="#3B2F2A" strokeWidth="1.8" fill="none" strokeLinecap="round"/><circle cx="18" cy="42" r="2.4" fill="#F7A27A" opacity=".7"/><circle cx="36" cy="44" r="2.4" fill="#F7A27A" opacity=".7"/><path d="M26 44q1.5 1.2 3 0" stroke="#3B2F2A" strokeWidth="1.6" fill="none" strokeLinecap="round"/><text x="44" y="20" fontFamily="Jua,sans-serif" fontSize="9" fontWeight="600" fill="#5B7DB8">z</text><text x="50" y="13" fontFamily="Jua,sans-serif" fontSize="7" fontWeight="600" fill="#5B7DB8">z</text><path d="M38 54c0-4 4-6 7-4 1-4 7-5 9-1 4 0 6 4 4 6H39c-1 0-1-1-1-1z" fill="#FFFFFF" stroke="#C9DCEE" strokeWidth="1.5"/><path d="M8 10l1.2 2.8 2.8 1.2-2.8 1.2L8 18l-1.2-2.8L4 14l2.8-1.2z" fill="#8DB3E0"/>
    </>
  ),
  snack: (
    <>
      <ellipse cx="32" cy="56" rx="26" ry="4" fill="rgba(31,42,46,.1)"/><path d="M6 40 L50 22 L58 40 Z" fill="#FFF4E2"/><path d="M6 40h52v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#E9A867"/><rect x="6" y="45" width="52" height="4" fill="#FFF4E2"/><rect x="50" y="40" width="8" height="16" rx="2" fill="#D38E4E"/><path d="M6 40 L50 22 L58 40" fill="none" stroke="#F7D7B3" strokeWidth="2" strokeLinejoin="round"/><path d="M16 36c4-2 8-3 12-3" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d="M46 18c0-6 4-10 8-11" stroke="#5E9F38" strokeWidth="2" fill="none" strokeLinecap="round"/><circle cx="46" cy="20" r="6" fill="#E8574A"/><circle cx="44" cy="18" r="1.8" fill="#F7A39A"/>
    </>
  ),
}

type Props = { meal: MealType; size?: number; framed?: boolean; className?: string; style?: CSSProperties }

/** framed: 시안 .micowrap(흰 원 안에 그림, 그림 42 : 원 58 비율). size는 그림 크기(px). */
export function MealArt({ meal, framed = false, size = framed ? 42 : 40, className, style }: Props) {
  const art = (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={framed ? undefined : className} style={framed ? undefined : style}>
      {ART[meal]}
    </svg>
  )
  if (!framed) return art
  const wrap = Math.round((size * 58) / 42)
  return (
    <span
      className={`grid flex-none place-items-center rounded-full bg-surface shadow-[0_2px_6px_rgba(31,42,46,.08)] ${className ?? ''}`}
      style={{ width: wrap, height: wrap }}
    >
      {art}
    </span>
  )
}
