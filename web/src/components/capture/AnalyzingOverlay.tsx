// 분석 중 덮개(끼니 화면 위). 10초가 지나면 "조금 더 걸려요"와 직접 입력 버튼을 보인다(스펙 5.1 F9).
// 모양(디자인 조각 D3-2, 사용자 확인 d32_3_analyzing): sky-soft 바탕 · 마스코트 · 제목(시안 시트 제목 19px) · 시안 진행 막대(.progress/.pfill,
// 끝을 모르므로 천천히 차오르다 멈춘다) · 10초 뒤 안내와 [직접 입력](.btn ghost, 흰 바탕).
import { useEffect, useState } from 'react'
import { Mascot } from '../ui'

export default function AnalyzingOverlay({
  label,
  manualLabel,
  onManual,
}: {
  label: string
  manualLabel?: string
  onManual?: () => void
}) {
  const [slow, setSlow] = useState(false)
  // 진행 막대: 처음 그린 뒤 다음 프레임에 목표 폭으로 바꿔 시안 .pfill transition으로 차오르게 한다(실제 진행률이 아니다)
  const [fill, setFill] = useState(0)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setFill(62))
    const t = setTimeout(() => {
      setSlow(true)
      setFill(86)
    }, 10_000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [])

  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--sky-soft)', display: 'grid', placeItems: 'center', padding: 20 }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 14, textAlign: 'center', width: '100%', maxWidth: 430 }}>
        <Mascot decorative />
        <h2 style={{ margin: 0, fontSize: 19 }}>{label}</h2>
        <div className="progress" style={{ width: 200, background: 'rgba(255,255,255,.7)' }}>
          <div className="pfill" style={{ width: `${fill}%`, transitionDuration: slow ? '6s' : '9s' }}></div>
        </div>
        {slow && <p style={{ margin: 0, color: 'var(--ink-2)' }}>조금 더 걸려요</p>}
        {slow && onManual && (
          <button type="button" className="btn ghost" onClick={onManual} style={{ marginTop: 6, background: 'var(--surface)' }}>
            {manualLabel ?? '직접 입력'}
          </button>
        )}
      </div>
    </div>
  )
}
