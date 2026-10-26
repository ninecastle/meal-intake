import { lazy, Suspense, useRef, useState } from 'react'
import type { FoodHit } from './analysis/nutrition/db'
import { usingEmulators } from './lib/firebase'

// 개발 빌드에서만 흐름 시험 패널을 불러온다(배포 번들에는 들어가지 않는다).
const FlowTest = import.meta.env.DEV ? lazy(() => import('./dev/FlowTest')) : null

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

const fmt = (v: number | null) => (v == null ? '–' : String(Math.round(v * 10) / 10))

// 개발용: 식약처 DB 검색 시험. AI 호출 없음. DB JSON은 처음 입력할 때 받는다.
function DbSearchTest() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FoodHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  async function onChange(value: string) {
    setQuery(value)
    const mine = ++seq.current
    try {
      const { searchFoods } = await import('./analysis/nutrition/db')
      const res = await searchFoods(value, 10)
      if (mine === seq.current) {
        setHits(res)
        setError(null)
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-2 w-full rounded border border-dashed border-gray-300 p-3 text-left">
      <label className="text-xs text-gray-600">
        DB 검색 시험 (DEV, AI 호출 없음)
        <input
          value={query}
          onChange={(e) => void onChange(e.target.value)}
          placeholder="예: 김치찌개"
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hits.length > 0 && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-normal">이름 (100g당)</th>
              <th className="text-right font-normal">kcal</th>
              <th className="text-right font-normal">탄</th>
              <th className="text-right font-normal">단</th>
              <th className="text-right font-normal">지</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((h) => (
              <tr key={h.index} className="border-t border-gray-100">
                <td className="py-0.5">
                  {h.label}
                  {h.food.ml ? ' · DB(환산)' : ''}
                </td>
                <td className="text-right">{fmt(h.food.k)}</td>
                <td className="text-right">{fmt(h.food.cb)}</td>
                <td className="text-right">{fmt(h.food.p)}</td>
                <td className="text-right">{fmt(h.food.f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
      {import.meta.env.DEV && <DbSearchTest />}
      {FlowTest && (
        <Suspense fallback={null}>
          <FlowTest />
        </Suspense>
      )}
    </main>
  )
}
