import { useState } from 'react'
import { usingEmulators } from './lib/firebase'

// 개발용: AI Logic + App Check 연결 시험. 누를 때만 1회 호출, 자동 재시도 없음.
function AiConnectionTest() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const { getModel } = await import('./lib/ai')
      const res = await getModel().generateContent('한 단어로 답해: 사과는 무슨 색?')
      setResult(`성공: ${res.response.text()}`)
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex w-full flex-col items-center gap-2 rounded border border-dashed border-gray-300 p-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? '호출 중…' : 'AI 연결 시험 (DEV, 1회 호출)'}
      </button>
      {result && <p className="break-all text-xs text-gray-700">{result}</p>}
    </div>
  )
}

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-2xl font-bold">식단 기록</h1>
      <p className="text-sm text-gray-500">저장소 골격 — 화면은 다음 단계에서 구현</p>
      {usingEmulators && <p className="text-xs text-amber-600">에뮬레이터 연결됨</p>}
      {import.meta.env.DEV && <AiConnectionTest />}
    </main>
  )
}
