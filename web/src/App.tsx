// 라우터(2단계 조각 4-A). 로그인 전이면 어느 경로든 /login으로 보내고, 로그인 뒤에는 원래 가려던 경로로 돌려보낸다.
// 데이터 라우터(createBrowserRouter)를 쓴다: 결과 화면의 useBlocker(브라우저 뒤로 가기 때 "저장하지 않고 나갈까요?")가
// 데이터 라우터에서만 동작한다. 라우터는 한 번만 만들고, 로그인 상태는 컨텍스트로 넘겨 경로 가드에서 본다.
import type { User } from 'firebase/auth'
import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet, useLocation, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import RouteErrorScreen from './components/RouteErrorScreen'
import ScrollMemory from './components/ScrollMemory'
import { useAuthUser } from './lib/auth'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'

// 촬영·결과 화면은 분석 모듈(Firebase AI)을 끌어오므로 첫 화면 번들에서 뺀다.
// 끼니 화면(D3)이 먹기 전·후 촬영과 분석을 맡는다(예전 촬영 화면 S2·S3과 기록 상세 S7은 없애고 주소만 끼니 화면으로 보낸다).
const MealPage = lazy(() => import('./pages/MealPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const MealIdRedirect = lazy(() => import('./pages/MealRedirects').then((m) => ({ default: m.MealIdRedirect })))
const CaptureBeforeRedirect = lazy(() => import('./pages/MealRedirects').then((m) => ({ default: m.CaptureBeforeRedirect })))
const GoalPage = lazy(() => import('./pages/GoalPage'))
// 한눈에·영양소 상세(디자인 조각 D5)
const GlancePage = lazy(() => import('./pages/GlancePage'))
const NutritionDetailPage = lazy(() => import('./pages/NutritionDetailPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
// 식단 앨범(디자인 조각 D9). 홈 식사 띠 [식단 앨범](사진 보관을 켰을 때)에서 push(state.fromHome)
const AlbumPage = lazy(() => import('./pages/AlbumPage'))
// 개발 빌드에서만 등록한다. 배포 빌드에서는 import.meta.env.DEV가 false로 바뀌어 이 import가 번들에서 빠진다.
const DevPage = import.meta.env.DEV ? lazy(() => import('./pages/DevPage')) : null
// 공통 부품 모음(조각 D1-a, /dev/ui). 개발 빌드에서만 등록하고, 사용자 데이터를 쓰지 않아 로그인 없이 연다.
const UiGalleryPage = import.meta.env.DEV ? lazy(() => import('./dev/UiGalleryPage')) : null

const UserContext = createContext<User | null>(null)

/** RequireUser 아래에서만 쓴다(로그인이 보장된다). */
function useUser(): User {
  const user = useContext(UserContext)
  if (!user) throw new Error('로그인이 필요한 화면입니다')
  return user
}

/** 앱 틀(시안 .app#app, 조각 D2-S): 모든 화면을 가운데 430px 흰(surface) 기둥에 넣는다. 모양은 styles/prototype.css의 .app 그대로. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="app">{children}</div>
}

function Loading() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">불러오는 중…</main>
}

function Root() {
  return (
    <Frame>
      {/* 뒤로 가기로 돌아오면 보던 위치, 새 화면·홈 날짜 바꾸기는 맨 위(2026-10-27 사용자가 고른 변경) */}
      <ScrollMemory />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </Frame>
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
const MealRoute = () => <MealPage uid={useUser().uid} />
const MealIdRoute = () => <MealIdRedirect uid={useUser().uid} />
const MealAfterRoute = () => <MealIdRedirect uid={useUser().uid} after />
const GoalRoute = () => <GoalPage uid={useUser().uid} />
const GlanceRoute = () => <GlancePage uid={useUser().uid} />
const DetailRoute = () => <NutritionDetailPage uid={useUser().uid} />
const CalendarRoute = () => <CalendarPage uid={useUser().uid} />
const AlbumRoute = () => <AlbumPage uid={useUser().uid} />
const SettingsRoute = () => <SettingsPage user={useUser()} />

const userRoutes: RouteObject[] = [
  { path: '/', element: <HomeRoute /> },
  // 끼니 화면(디자인 조각 D3). 홈 끼니 카드에서 push(state.fromHome)로 들어온다
  { path: '/day/:dateKey/:mealType', element: <MealRoute /> },
  { path: '/capture/before', element: <CaptureBeforeRedirect /> },
  { path: '/meal/:mealId/after', element: <MealAfterRoute /> },
  { path: '/meal/new/review', element: <ReviewPage /> },
  { path: '/meal/:mealId/review', element: <ReviewPage /> },
  // S8 기록 수정(3단계 조각 1-2): 결과 확인 화면(편집기·저장·나가기 확인)을 수정 모드로 다시 쓴다
  { path: '/meal/:mealId/edit', element: <ReviewPage mode="edit" /> },
  { path: '/meal/:mealId', element: <MealIdRoute /> },
  // S6 목표 설정(3단계 조각 2). 홈에서는 push(state.fromHome)로 들어온다
  { path: '/goal', element: <GoalRoute /> },
  // 한눈에·영양소 상세(D5, ?date=YYYY-MM-DD). 홈 나의 하루 [한눈에]·[자세히]에서 push(state.fromHome)
  { path: '/glance', element: <GlanceRoute /> },
  { path: '/detail', element: <DetailRoute /> },
  // S10 달력(3단계 조각 3-1). 홈에서는 push(state.fromHome)로 들어온다. ?month=YYYY-MM
  { path: '/calendar', element: <CalendarRoute /> },
  { path: '/settings', element: <SettingsRoute /> },
  // ?month=YYYY-MM&date=YYYY-MM-DD
  { path: '/album', element: <AlbumRoute /> },
  ...(DevPage ? [{ path: '/dev', element: <DevPage /> }] : []),
  { path: '*', element: <Navigate to="/" replace /> },
]

const router = createBrowserRouter([
  {
    element: <Root />,
    // 화면 파일 불러오기 실패·화면 예외: 영어 기본 오류 화면 대신 한국어 안내(배포본은 청크 실패 때 한 번 자동 새로고침)
    errorElement: (
      <Frame>
        <RouteErrorScreen />
      </Frame>
    ),
    children: [
      { path: '/login', element: <LoginRoute /> },
      ...(UiGalleryPage ? [{ path: '/dev/ui', element: <UiGalleryPage /> }] : []),
      { element: <RequireUser />, children: userRoutes },
    ],
  },
])

export default function App() {
  const { user, loading } = useAuthUser()
  if (loading)
    return (
      <Frame>
        <Loading />
      </Frame>
    )
  return (
    <UserContext.Provider value={user}>
      <RouterProvider router={router} />
    </UserContext.Provider>
  )
}
