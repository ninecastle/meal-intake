// 시안 .band: 홈의 파스텔 띠(하늘 → 연두 → 복숭아). 위아래 28/32px, 머리 줄은 제목 22px + 오른쪽 동작(칩 버튼 등).
import { useId, type ReactNode } from 'react'
import { cx } from './cx'

export type BandTone = 'sky' | 'lime' | 'peach'

const TONE: Record<BandTone, string> = { sky: 'bg-sky-soft', lime: 'bg-lime-soft', peach: 'bg-peach-soft' }

type Props = {
  tone: BandTone
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
}

export function Band({ tone, title, action, children, className, id }: Props) {
  const headingId = useId()
  const hasTitle = title != null && title !== ''
  return (
    <section id={id} aria-labelledby={hasTitle ? headingId : undefined} className={cx('pad pt-7 pb-8', TONE[tone], className)}>
      {(hasTitle || action != null) && (
        <div className="mb-[18px] flex items-center justify-between gap-3">
          {hasTitle && (
            <h2 id={headingId} className="m-0 whitespace-nowrap text-[22px] tracking-[-0.02em]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
