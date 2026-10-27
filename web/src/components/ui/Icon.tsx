// web/scripts/gen-ui-art.mjs로 디자인 시안(_workspace/design/diet-app-prototype.html)에서 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다.
// 시안 `ico`의 선 아이콘(24×24, 선 굵기 2, 둥근 끝). 색은 글자색(currentColor)을 따른다. 장식이라 읽지 않는다(버튼 이름은 IconButton의 label).
import type { ReactNode } from 'react'

export type IconName = 'back' | 'close' | 'cal' | 'gear' | 'camera' | 'image' | 'pen' | 'share' | 'plus'

const PATHS: Record<IconName, ReactNode> = {
  back: <><path d="M15 5l-7 7 7 7"/></>,
  close: <><path d="M6 6l12 12M18 6L6 18"/></>,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M20 16l-5-5-8 8"/></>,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z"/></>,
  share: <><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
}

type Props = { name: IconName; size?: number; strokeWidth?: number; className?: string; bare?: boolean }

/** bare: 시안 마크업처럼 viewBox만 둔 svg(크기·선은 시안 CSS .choice svg·.cam svg 등이 정한다. 시안 그 자리에는 둥근 끝이 없다) */
export function Icon({ name, size = 24, strokeWidth = 2, className, bare = false }: Props) {
  if (bare)
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
        {PATHS[name]}
      </svg>
    )
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
