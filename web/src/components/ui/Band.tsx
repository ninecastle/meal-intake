// 시안 .band(조각 D2-S): section.band.{tone} > .pad > .bandhead(h2 + 오른쪽 동작) + 내용. 모양은 styles/prototype.css 그대로.
// 시안처럼 띠 이름을 label(aria-label, 예: "오늘 요약")로 줄 수 있다. 없으면 제목(h2)이 띠 이름이 된다.
import { useId, type ReactNode } from 'react'
import { cx } from './cx'

export type BandTone = 'sky' | 'lime' | 'peach'

type Props = {
  tone: BandTone
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** 시안 section aria-label */
  label?: string
}

export function Band({ tone, title, action, children, className, id, label }: Props) {
  const headingId = useId()
  const hasTitle = title != null && title !== ''
  return (
    <section
      id={id}
      aria-label={label}
      aria-labelledby={label == null && hasTitle ? headingId : undefined}
      className={cx('band', tone, className)}
    >
      <div className="pad">
        {(hasTitle || action != null) && (
          <div className="bandhead">
            {hasTitle && <h2 id={headingId}>{title}</h2>}
            {action}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
