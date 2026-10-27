// 시안 .chipbtn(조각 D2-S): 높이 40px 작은 알약(띠 머리 줄의 동작 등). 기본은 흰 바탕, dark는 진한 바탕(.chipbtn.dark). 모양은 styles/prototype.css 그대로.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { dark?: boolean }

export function ChipButton({ dark = false, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx('chipbtn', dark && 'dark', 'disabled:cursor-not-allowed disabled:opacity-35', className)}
      {...rest}
    />
  )
}
