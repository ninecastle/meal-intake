// 시안 .iconbtn: 44px 정사각, 둥근 12px, 누를 때 바탕색. 아이콘만 있으므로 label(읽는 이름)은 꼭 준다.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }

export function IconButton({ icon, label, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(
        'focus-ring grid size-11 flex-none place-items-center rounded-xl text-ink hover:bg-ground disabled:opacity-35',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
