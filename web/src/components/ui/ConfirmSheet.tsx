// 앱 안 확인 창(2026-10-28 사용자 요청: 브라우저 확인 창 대신). 모양은 설정 "보관한 사진을 모두 지울까요?" 시트와 같다
// (시안 시트 + 제목 질문 + 설명 한 줄 + [취소]·[확인] 두 버튼). askConfirm()은 어디서든 부르고, ConfirmHost는 앱 틀(App Root)에 한 번 둔다.
// X·바깥 누르기·Esc는 취소.
import { useEffect, useState } from 'react'
import { BottomSheet } from './BottomSheet'

export type ConfirmOptions = { title: string; body?: string; ok?: string; cancel?: string }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((p: Pending) => void) | null = null

/** 확인 시트를 열고 누른 버튼을 돌려준다(확인 true, 취소·닫기 false). 틀이 없으면(시험 등) 바로 false */
export function askConfirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(false)
    show({ ...o, resolve })
  })
}

export function ConfirmHost() {
  const [cur, setCur] = useState<Pending | null>(null)
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
    cur?.resolve(ok)
    setCur(null)
  }
  return (
    <BottomSheet open={cur !== null} onClose={() => done(false)} title={cur?.title ?? ''}>
      {cur?.body && <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>{cur.body}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => done(false)}>
          {cur?.cancel ?? '취소'}
        </button>
        <button type="button" className="btn ink" style={{ flex: 1 }} onClick={() => done(true)}>
          {cur?.ok ?? '확인'}
        </button>
      </div>
    </BottomSheet>
  )
}
