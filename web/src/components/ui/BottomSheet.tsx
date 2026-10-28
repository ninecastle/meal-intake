// 시안 .overlay > .sheet.pad(디자인 조각 D3, 시안 openSheet() 마크업·클래스 그대로): 아래에서 올라오는 시트(최대 폭 430px, 위 모서리 26px,
// 아래 safe-area 여백), header > h2 + .iconbtn 닫기. 모양은 styles/prototype.css 그대로.
// 배경 막을 누르거나 Esc로 닫는다. 열릴 때 제목에 포커스, 닫히면 연 버튼으로 포커스를 돌려준다. 열려 있는 동안 뒤 화면 스크롤을 막는다.
// 브라우저 뒤로 가기로 닫기는 아직 없다.
// 화면 자판이 열리면(visualViewport가 줄어듦) 막을 보이는 영역에 맞춰 시트를 자판 바로 위로 올리고 [저장] 같은 버튼이 보이게 한다
// (2026-10-28 사용자 요청, 사용자가 고른 변경 25 — 안드로이드 크롬 기본은 자판이 화면을 덮기만 한다).
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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

  const kb = useKeyboardBox(open)
  const sheetRef = useRef<HTMLDivElement>(null)
  // 자판이 열리면 시트 안의 주 버튼(.btn)이 보이게 시트를 스크롤한다(키가 작은 화면)
  useEffect(() => {
    if (!kb) return
    const btns = sheetRef.current?.querySelectorAll<HTMLElement>('.btn')
    btns?.[btns.length - 1]?.scrollIntoView({ block: 'nearest' })
  }, [kb])

  if (!open) return null
  return createPortal(
    <div
      className="overlay"
      style={kb ?? undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={sheetRef} className="sheet pad" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} style={{ outline: 'none' }}>
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

/** 자판이 열려 보이는 영역(visualViewport)이 창보다 많이 작으면 막을 그 영역에 맞출 위치. 아니면 null */
function useKeyboardBox(open: boolean): CSSProperties | null {
  const [box, setBox] = useState<CSSProperties | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!open || !vv) return
    const update = () => {
      // 확대(pinch)로 줄어든 것은 자판이 아니다
      const hidden = window.innerHeight - vv.height * vv.scale
      setBox(hidden > 80 && vv.scale <= 1.01 ? { top: vv.offsetTop, height: vv.height, bottom: 'auto' } : null)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setBox(null)
    }
  }, [open])
  return box
}
