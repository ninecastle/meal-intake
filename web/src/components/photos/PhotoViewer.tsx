// 식사 사진 크게 보기(디자인 조각 D9, 2026-10-28 사용자 확인 _workspace/design/mock/d9_2_photo_view.png).
// 화면 가득 어두운 바탕(rgba(31,42,46,.94)) → 위 오른쪽 흰 닫기 → 가운데 사진(폭 가득) → 아래 "점심 · 먹기 전 12:40"(Jua 16px, 시각은 흐린 흰색).
// 닫기 버튼·Esc·바탕 누르기로 닫는다. 기기 뒤로 가기는 시트들(BottomSheet)과 같이 쓰지 않는다(라우터 기록·결과 화면 나가기 확인과 엉키지 않게).
// 그리기만 한다(사진은 data URL, AI 호출 없음).
import { useEffect } from 'react'
import { IconButton } from '../ui'

export interface PhotoView {
  src: string
  /** "점심 · 먹기 전" */
  caption: string
  /** 그 끼니 먹은 시간 "12:40"(없으면 null) */
  time: string | null
}

export function PhotoViewer({ view, onClose }: { view: PhotoView | null; onClose: () => void }) {
  useEffect(() => {
    if (!view) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [view, onClose])

  if (!view) return null
  return (
    <div className="photoview" role="dialog" aria-modal="true" aria-label={`${view.caption} 사진`} onClick={onClose}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
        <IconButton icon="close" label="닫기" onClick={onClose} autoFocus />
      </div>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <img src={view.src} alt={view.caption} onClick={(e) => e.stopPropagation()} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ textAlign: 'center', padding: '14px 0 calc(28px + env(safe-area-inset-bottom,0px))', fontFamily: 'var(--f-head)', fontSize: 16 }}>
        {view.caption}
        {view.time && (
          <>
            {' '}
            <span className="num" style={{ color: 'rgba(255,255,255,.7)' }}>
              {view.time}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/** 시안 .shot 한 칸: 사진(5:4 채움) + 왼쪽 위 "먹기 전/먹은 후" 이름표. 사진이 없으면 회색 "사진 없음" 칸(눌러지지 않음) */
export function Shot({ src, label, onOpen }: { src: string | null; label: string; onOpen: () => void }) {
  if (!src) {
    return (
      <div
        className="shot"
        style={{ background: 'var(--ground)', aspectRatio: '200/160', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 14 }}
      >
        사진 없음<span>{label}</span>
      </div>
    )
  }
  return (
    <button type="button" className="shot" aria-label={`${label} 사진 크게 보기`} onClick={onOpen} style={{ display: 'block', width: '100%', padding: 0 }}>
      <img src={src} alt="" style={{ display: 'block', width: '100%', aspectRatio: '5/4', objectFit: 'cover' }} />
      <span>{label}</span>
    </button>
  )
}
