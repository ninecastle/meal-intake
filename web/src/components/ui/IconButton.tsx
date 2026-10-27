// 시안 .iconbtn(조각 D2-S): 44px 정사각, 둥근 12px, 누를 때 ground, 아이콘 24px ink 선. 모양은 styles/prototype.css 그대로.
// 아이콘만 있으므로 label(읽는 이름, 시안 aria-label)은 꼭 준다.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }

export function IconButton({ icon, label, className, type = 'button', ...rest }: Props) {
  return (
    <button type={type} aria-label={label} className={cx('iconbtn', 'flex-none disabled:opacity-35', className)} {...rest}>
      <Icon name={icon} />
    </button>
  )
}
