// 시안 .tab(알약 탭, 고른 것은 진한 바탕)과 .segment(회색 바탕 안 흰 칸). 둘 다 role="tab" + aria-selected, 좌우 화살표로 옮긴다.
import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'

export type ChoiceItem<T extends string> = { value: T; label: ReactNode; disabled?: boolean }

type Props<T extends string> = {
  items: readonly ChoiceItem<T>[]
  value: T
  onChange: (value: T) => void
  /** 묶음의 읽는 이름(예: "기간") */
  label: string
  className?: string
}

function ChoiceGroup<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  itemClass,
}: Props<T> & { itemClass: string }) {
  const anySelected = items.some((it) => it.value === value)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const enabled = items.filter((it) => !it.disabled)
    if (enabled.length === 0) return
    const at = enabled.findIndex((it) => it.value === value)
    const next = enabled[(at + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
    e.preventDefault()
    onChange(next.value)
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {items.map((it, i) => {
        const selected = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            data-value={it.value}
            aria-selected={selected}
            tabIndex={selected || (!anySelected && i === 0) ? 0 : -1}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={itemClass}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

export function Tabs<T extends string>({ className, ...props }: Props<T>) {
  return (
    <ChoiceGroup
      {...props}
      className={cx('flex gap-2 pt-1.5 pb-[18px]', className)}
      itemClass="focus-ring inline-flex min-h-[42px] items-center gap-1 whitespace-nowrap rounded-full bg-ground px-4 text-ink-2 disabled:opacity-35 aria-selected:bg-ink aria-selected:text-white"
    />
  )
}

export function Segment<T extends string>({ className, ...props }: Props<T>) {
  return (
    <ChoiceGroup
      {...props}
      className={cx('grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-ground p-[5px]', className)}
      itemClass="focus-ring flex min-h-11 items-center justify-center gap-1 whitespace-nowrap rounded-full text-ink-2 disabled:opacity-35 aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-[0_1px_3px_rgba(31,42,46,.12)]"
    />
  )
}
