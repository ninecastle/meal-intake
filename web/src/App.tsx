import { usingEmulators } from './lib/firebase'

export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-4 text-center">
      <h1 className="text-2xl font-bold">식단 기록</h1>
      <p className="text-sm text-gray-500">저장소 골격 — 화면은 다음 단계에서 구현</p>
      {usingEmulators && <p className="text-xs text-amber-600">에뮬레이터 연결됨</p>}
    </main>
  )
}
