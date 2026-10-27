// 시안 crown(조각 D2-S): span.crown(연노랑 원 24px) 안 왕관 14px. 프리미엄 표시만(결제·잠금 없음). 모양은 styles/prototype.css 그대로.
import { cx } from './cx'

export function Crown({ className }: { className?: string }) {
  return (
    <span className={cx('crown', className)} role="img" aria-label="프리미엄">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 12 L1 4 L5 7 L8 2 L11 7 L15 4 L14 12 Z" />
      </svg>
    </span>
  )
}
