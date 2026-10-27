// 시안 .btn: 높이 52px 알약 모양, 16px. peach가 화면의 주 버튼(시안은 폭 100%: full). 꺼지면 흐리게.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'peach' | 'ink' | 'lime' | 'sky' | 'ghost'

const VARIANT: Record<ButtonVariant, string> = {
  peach: 'bg-peach text-ink',
  ink: 'bg-ink text-white',
  lime: 'bg-lime text-ink',
  sky: 'bg-sky text-ink',
  ghost: 'bg-ground text-ink',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }

export function Button({ variant = 'peach', full = false, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        'focus-ring inline-flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-[22px] text-base',
        'disabled:cursor-not-allowed disabled:opacity-35',
        full && 'w-full',
        VARIANT[variant],
        className,
      )}
      {...rest}
    />
  )
}
