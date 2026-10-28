// ?timing=1일 때만 화면 위쪽 구석에 단계별 시간(lib/timing). 누르면 닫힌다.
import { useEffect, useState } from 'react'
import { subscribeTiming, timingOn, type TimingRun } from '../lib/timing'

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`

export default function TimingOverlay() {
  const [r, setR] = useState<TimingRun | null>(null)
  useEffect(() => (timingOn() ? subscribeTiming(setR) : undefined), [])
  if (!r) return null
  return (
    <button
      type="button"
      onClick={() => setR(null)}
      aria-label="시간 표시 닫기"
      style={{ position: 'fixed', top: 8, right: 8, zIndex: 9999, maxWidth: 240, textAlign: 'left', padding: '8px 10px', borderRadius: 12, border: 0, background: 'rgba(31,42,46,.88)', color: '#fff', fontSize: 12, lineHeight: 1.5, minHeight: 0 }}
    >
      <b>{r.title}</b> {r.done ? `· 합계 ${sec(r.totalMs)}` : '· 재는 중…'}
      {r.steps.map((s, i) => (
        <div key={i}>{`${s.label} ${sec(s.ms)}`}</div>
      ))}
    </button>
  )
}
