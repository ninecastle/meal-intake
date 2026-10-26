// 라우터(2단계 조각 4-A). 로그인 전이면 어느 경로든 /login으로 보내고, 로그인 뒤에는 원래 가려던 경로로 돌려보낸다.
// 데이터 라우터(createBrowserRouter)를 쓴다: 결과 화면의 useBlocker(브라우저 뒤로 가기 때 "저장하지 않고 나갈까요?")가
// 데이터 라우터에서만 동작한다. 라우터는 한 번만 만들고, 로그인 상태는 컨텍스트로 넘겨 경로 가드에서 본다.
import type { User } from 'firebase/auth'
import { createContext, lazy, Suspense, useContext } from 'react'
import { createBrowserRouter, Navigate, Outlet, useLocation, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { useAuthUser } from './lib/auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

// 촬영·결과 화면은 분석 모듈(Firebase AI)을 끌어오므로 첫 화면 번들에서 뺀다.
const CaptureBeforePage = lazy(() => import('./pages/CaptureBeforePage'))
const CaptureAfterPage = lazy(() => import('./pages/CaptureAfterPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const MealDetailPage = lazy(() => import('./pages/MealDetailPage'))
// 개발 빌드에서만 등록한다. 배포 빌드에서는 import.meta.env.DEV가 false로 바뀌어 이 import가 번들에서 빠진다.
const DevPage = import.meta.env.DEV ? lazy(() => import('./pages/DevPage')) : null

const UserContext = createContext<User | null>(null)

/** RequireUser 아래에서만 쓴다(로그인이 보장된다). */
function useUser(): User {
  const user = useContext(UserContext)
  if (!user) throw new Error('로그인이 필요한 화면입니다')
  return user
}

function Loading() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-gray-500">불러오는 중…</main>
}

function Root() {
  return (
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
  )
}

function RequireUser() {
  const user = useContext(UserContext)
  const loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <Outlet />
}

function LoginRoute() {
  const user = useContext(UserContext)
  const from = (useLocation().state as { from?: unknown } | null)?.from
  if (!user) return <LoginPage />
  const to = typeof from === 'string' && from.startsWith('/') && !from.startsWith('/login') ? from : '/'
  return <Navigate to={to} replace />
}

const HomeRoute = () => <HomePage user={useUser()} />
const CaptureBeforeRoute = () => <CaptureBeforePage uid={useUser().uid} />
const CaptureAfterRoute = () => <CaptureAfterPage uid={useUser().uid} />
const MealDetailRoute = () => <MealDetailPage uid={useUser().uid} />

const userRoutes: RouteObject[] = [
  { path: '/', element: <HomeRoute /> },
  { path: '/capture/before', element: <CaptureBeforeRoute /> },
  { path: '/meal/:mealId/after', element: <CaptureAfterRoute /> },
  { path: '/meal/new/review', element: <ReviewPage /> },
  { path: '/meal/:mealId/review', element: <ReviewPage /> },
  // S8 기록 수정(3단계 조각 1-2): 결과 확인 화면(편집기·저장·나가기 확인)을 수정 모드로 다시 쓴다
  { path: '/meal/:mealId/edit', element: <ReviewPage mode="edit" /> },
  { path: '/meal/:mealId', element: <MealDetailRoute /> },
  ...(DevPage ? [{ path: '/dev', element: <DevPage /> }] : []),
  { path: '*', element: <Navigate to="/" replace /> },
]

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginRoute /> },
      { element: <RequireUser />, children: userRoutes },
    ],
  },
])

export default function App() {
  const { user, loading } = useAuthUser()
  if (loading) return <Loading />
  return (
    <UserContext.Provider value={user}>
      <RouterProvider router={router} />
    </UserContext.Provider>
  )
}
