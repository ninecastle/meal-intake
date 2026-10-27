// 시안 .overlay + .sheet: 아래에서 올라오는 시트(최대 폭 430px, 위 모서리 26px, 아래 safe-area 여백).
// 배경 막을 누르거나 Esc로 닫는다. 열릴 때 제목에 포커스, 닫히면 연 버튼으로 포커스를 돌려준다. 열려 있는 동안 뒤 화면 스크롤을 막는다.
// 브라우저 뒤로 가기로 닫기는 아직 없다(다음 조각에서).
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'

type Props = { open: boolean; onClose: () => void; title: ReactNode; children?: ReactNode }

export function BottomSheet({ open, onClose, title, children }: Props) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pad max-h-[86%] w-full max-w-[430px] overflow-auto rounded-t-[26px] bg-surface pt-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
      >
        <header className="mb-1.5 flex items-center justify-between gap-2">
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className="m-0 text-[19px] outline-none">
            {title}
          </h2>
          <IconButton icon="close" label="닫기" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}
