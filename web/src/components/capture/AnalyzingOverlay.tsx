// 분석 중 덮개(S2·S3 위). 10초가 지나면 "조금 더 걸려요"와 직접 입력 링크를 보인다(스펙 5.1 F9).
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

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10_000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface p-4"
    >
      <div className="mx-auto flex w-full max-w-[430px] flex-col items-center gap-3 text-center">
        <Mascot size={104} decorative />
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-lime-deep" />
        <p className="text-lg text-ink">{label}</p>
        {slow && <p className="text-sm text-ink-2">조금 더 걸려요</p>}
        {slow && onManual && (
          <button type="button" onClick={onManual} className="focus-ring min-h-11 px-4 text-sm text-lime-deep underline">
            {manualLabel ?? '직접 입력'}
          </button>
        )}
      </div>
    </div>
  )
}
