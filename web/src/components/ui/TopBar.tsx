// 시안 .topbar: 높이 56px, 제목 17px. 왼쪽·오른쪽은 보통 IconButton. 제목이 가운데에 오도록 세 칸 격자로 둔다.
import type { ReactNode } from 'react'
import { cx } from './cx'

type Props = { title?: ReactNode; left?: ReactNode; right?: ReactNode; sticky?: boolean; className?: string }

export function TopBar({ title, left, right, sticky = false, className }: Props) {
  return (
    <header
      className={cx(
        'pad grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5',
        sticky && 'sticky top-[env(safe-area-inset-top,0px)] z-5 bg-surface',
        className,
      )}
    >
      <div className="flex justify-start">{left}</div>
      <h1 className="m-0 truncate text-[17px]">{title}</h1>
      <div className="flex justify-end gap-1">{right}</div>
    </header>
  )
}
