// 시안 crown: 프리미엄 표시(결제·잠금 없이 표시만). 연노랑 원 24px 안 왕관 14px.
import { cx } from './cx'

export function Crown({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="프리미엄"
      className={cx('inline-flex size-6 flex-none items-center justify-center rounded-full bg-[#FBF0CF]', className)}
    >
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false" className="fill-crown">
        <path d="M2 12 L1 4 L5 7 L8 2 L11 7 L15 4 L14 12 Z" />
      </svg>
    </span>
  )
}
