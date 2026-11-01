// 앱 안 확인 창(2026-10-28 사용자 요청: 브라우저 확인 창 대신, 같은 날 가운데 창으로 결정, 모양 _workspace/design/mock/confirm_B_center.png).
// 시안 .overlay 바탕 위 가운데 흰 상자(.sheet.pad 모서리 사방 26px, 최대 342px): 가운데 정렬 제목 질문 + 설명 한 줄 + [취소]·[확인 동작].
// askConfirm()은 어디서든 부르고, ConfirmHost는 앱 틀(App Root)에 한 번 둔다. 바깥 누르기·Esc는 취소.
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** cancel: null이면 [취소] 없이 확인 버튼 하나(알림 창, 프리미엄 결제 준비 중 안내) */
export type ConfirmOptions = { title: string; body?: string; ok?: string; cancel?: string | null }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null

/** 확인 창을 열고 누른 버튼을 돌려준다(확인 true, 취소·닫기 false). 틀이 없으면(시험 등) 바로 false */
export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false)
    show({ ...o, resolve })
  })
}

export function ConfirmHost() {
  const [cur, setCur] = useState<Pending | null>(null)
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const curRef = useRef<Pending | null>(null)
  curRef.current = cur

  useEffect(() => {
    show = (p) =>
      setCur((prev) => {
        prev?.resolve(false) // 겹쳐 열리면 앞의 것은 취소로
        return p
      })
    return () => {
      show = null
    }
  }, [])

  const done = (ok: boolean) => {
    curRef.current?.resolve(ok)
    setCur(null)
  }

  const open = cur !== null
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 아래 시트(BottomSheet)도 Esc를 듣는다 — 이 창만 닫히게 막는다
      e.stopImmediatePropagation()
      curRef.current?.resolve(false)
      setCur(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      opener?.focus()
    }
  }, [open])

  if (!cur) return null
  return createPortal(
    <div
      className="overlay"
      style={{ alignItems: 'center', padding: '0 24px', zIndex: 60 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) done(false)
      }}
    >
      <div
        className="sheet pad"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ borderRadius: 26, maxWidth: 342, paddingBlock: '26px 20px', textAlign: 'center' }}
      >
        <h2 id={titleId} ref={titleRef} tabIndex={-1} style={{ outline: 'none' }}>
          {cur.title}
        </h2>
        {cur.body && <p style={{ color: 'var(--ink-2)', margin: '8px 0 0' }}>{cur.body}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {cur.cancel !== null && (
            <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => done(false)}>
              {cur.cancel ?? '취소'}
            </button>
          )}
          <button type="button" className="btn ink" style={{ flex: 1 }} onClick={() => done(true)}>
            {cur.ok ?? '확인'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
