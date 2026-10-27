// 시안 .btn(조각 D2-S): button.btn.{variant}. 모양은 styles/prototype.css 그대로(높이 52px 알약, 16px, 꺼지면 .btn:disabled 흐리게).
// 시안 .btn.peach는 폭 100%·위 여백 18px(홈 체중 [기록하기] 자리)이다. 아직 Tailwind로 그린 다른 화면이 예전처럼 보이도록
// peach에 full이 없으면 w-auto, 여백 클래스(mt-·my-·m-)를 주지 않았으면 mt-0을 더한다(유틸리티가 시안 레이어를 이긴다).
// 홈처럼 시안과 똑같이 그릴 화면은 <button className="btn peach">를 그대로 쓴다.
import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'peach' | 'ink' | 'lime' | 'sky' | 'ghost'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; full?: boolean }

const HAS_MARGIN_Y = /(^|\s)([\w-]+:)*-?m[ty]?-/

export function Button({ variant = 'peach', full = false, className, type = 'button', ...rest }: Props) {
  const peach = variant === 'peach'
  return (
    <button
      type={type}
      className={cx(
        'btn',
        variant,
        full ? !peach && 'w-full' : peach && 'w-auto',
        peach && !HAS_MARGIN_Y.test(className ?? '') && 'mt-0',
        className,
      )}
      {...rest}
    />
  )
}
