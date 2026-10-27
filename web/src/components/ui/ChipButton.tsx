// 시안 .chipbtn: 높이 40px 작은 알약(띠 머리 줄의 동작 등). 기본은 흰 바탕, dark는 진한 바탕.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { dark?: boolean }

export function ChipButton({ dark = false, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        'focus-ring inline-flex min-h-10 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm max-[380px]:px-[11px]',
        'disabled:cursor-not-allowed disabled:opacity-35',
        dark ? 'bg-ink text-white' : 'bg-surface text-ink',
        className,
      )}
      {...rest}
    />
  )
}
