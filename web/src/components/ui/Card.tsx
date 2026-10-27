// 시안 카드(.meal·.leftcard·.chartcard): 둥근 24px(rounded-card). tone은 바탕색(soft 계열). 여백이 다르면 padded={false} + className.
import type { HTMLAttributes } from 'react'
import { cx } from './cx'

export type CardTone = 'surface' | 'ground' | 'sky' | 'lime' | 'peach' | 'butter'

const TONE: Record<CardTone, string> = {
  surface: 'bg-surface',
  ground: 'bg-ground',
  sky: 'bg-sky-soft',
  lime: 'bg-lime-soft',
  peach: 'bg-peach-soft',
  butter: 'bg-butter-soft',
}

type Props = HTMLAttributes<HTMLDivElement> & { tone?: CardTone; padded?: boolean }

export function Card({ tone = 'surface', padded = true, className, ...rest }: Props) {
  return <div className={cx('rounded-card', padded && 'p-4', TONE[tone], className)} {...rest} />
}
