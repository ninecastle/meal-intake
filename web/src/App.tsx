// 라우터(2단계 조각 4-A). 로그인 전이면 어느 경로든 /login으로 보내고, 로그인 뒤에는 원래 가려던 경로로 돌려보낸다.
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuthUser } from './lib/auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

// 촬영·결과 화면은 분석 모듈(Firebase AI)을 끌어오므로 첫 화면 번들에서 뺀다.
const CaptureBeforePage = lazy(() => import('./pages/CaptureBeforePage'))
const CaptureAfterPage = lazy(() => import('./pages/CaptureAfterPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
// 개발 빌드에서만 등록한다. 배포 빌드에서는 import.meta.env.DEV가 false로 바뀌어 이 import가 번들에서 빠진다.
const DevPage = import.meta.env.DEV ? lazy(() => import('./pages/DevPage')) : null

function Loading() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-gray-500">불러오는 중…</main>
}

function ToLogin() {
  const loc = useLocation()
  return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
}

function AfterLogin() {
  const from = (useLocation().state as { from?: unknown } | null)?.from
  const to = typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/'
  return <Navigate to={to} replace />
}

export default function App() {
  const { user, loading } = useAuthUser()
  if (loading) return <Loading />

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={user ? <AfterLogin /> : <LoginPage />} />
          {user ? (
            <>
              <Route path="/" element={<HomePage user={user} />} />
              <Route path="/capture/before" element={<CaptureBeforePage uid={user.uid} />} />
              <Route path="/meal/:mealId/after" element={<CaptureAfterPage uid={user.uid} />} />
              <Route path="/meal/new/review" element={<ReviewPage />} />
              <Route path="/meal/:mealId/review" element={<ReviewPage />} />
              {DevPage && <Route path="/dev" element={<DevPage />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route path="*" element={<ToLogin />} />
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
