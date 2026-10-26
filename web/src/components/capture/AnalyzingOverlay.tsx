// 분석 중 덮개(S2·S3 위). 10초가 지나면 "조금 더 걸려요"와 직접 입력 링크를 보인다(스펙 5.1 F9).
import { useEffect, useState } from 'react'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-4"
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-emerald-600" />
        <p className="text-base font-medium text-gray-800">{label}</p>
        {slow && <p className="text-sm text-gray-600">조금 더 걸려요</p>}
        {slow && onManual && (
          <button type="button" onClick={onManual} className="min-h-11 px-4 text-sm text-emerald-700 underline">
            {manualLabel ?? '직접 입력'}
          </button>
        )}
      </div>
    </div>
  )
}
