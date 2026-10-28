// 소개(/welcome, 디자인 조각 D10): 시안 intro() 마크업·클래스 그대로 — .screen.ob.pad > .slides(슬라이드 3장) + .dots,
// 아래 .bottom에 [시작하기](.btn.ink)와 [이미 계정이 있어요](.link). 시안처럼 화면에 있는 동안 html.lock(스크롤 잠금), 떠나면 해제.
// 로그인 전: [시작하기] → 처음 동의, [이미 계정이 있어요] → 구글 로그인 → 원래 가려던 곳(기본 홈. 동의가 없는 계정은 경로 가드가 동의 화면으로).
// 로그인 상태(설정 "처음 화면 다시 보기"): [시작하기] → 처음 동의(저장된 동의대로 체크), [이미 계정이 있어요] → 홈.
// 슬라이드 3의 "1,124 / 1,900kcal"는 그림 속 예시라 시안 그대로 둔다.
import type { User } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import FoodPhoto from '../components/terms/FoodPhoto'
import { clearConsentDraft } from '../data/consent'
import { isExistingLogin, markExistingLogin, safeFrom } from '../components/terms/consentState'
import { LoginNotice, useGoogleLogin } from '../components/terms/googleLogin'
import { Crown, MealArt, Mascot } from '../components/ui'

const chip = { background: 'var(--surface)', display: 'inline-flex', alignItems: 'center' } as const

const SLIDES = [
  {
    h: ['먹기 전·후 사진', '두 장이면 끝'],
    p: '찍기만 하면 음식과 양을 알아서 찾아요',
    art: (
      <div className="art" style={{ background: 'var(--sky-soft)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'center', width: '100%', padding: '0 14px' }}>
          <div className="shot">
            <FoodPhoto />
            <span>먹기 전</span>
          </div>
          <span style={{ fontSize: 22, color: 'var(--ink-3)' }}>→</span>
          <div className="shot">
            <FoodPhoto after />
            <span>먹은 후</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    h: ['남긴 양까지 빼고', '실제로 먹은 만큼만'],
    p: '반찬을 남겨도 먹은 만큼만 계산해요',
    art: (
      <div className="art" style={{ background: 'var(--lime-soft)' }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <span className="micowrap" style={{ width: 150, height: 150 }}>
            <MealArt meal="snack" className="mico" style={{ width: 110, height: 110 }} />
          </span>
          <span className="chipbtn" style={chip}>
            남긴 20%는 빼고 계산해요
          </span>
        </div>
      </div>
    ),
  },
  {
    h: ['목표 대비', '한눈에'],
    p: '하루 칼로리와 탄·단·지를 바로 확인해요',
    art: (
      <div className="art" style={{ background: 'var(--peach-soft)' }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
          <Mascot />
          <span className="chipbtn" style={chip}>
            <span className="num">1,124 / 1,900kcal</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-2)' }}>
            AI 주간 리포트 <Crown />
          </span>
        </div>
      </div>
    ),
  },
]

export default function WelcomePage({ user }: { user: User | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { inApp, busy, error, login } = useGoogleLogin()
  const slidesRef = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState(0)

  // 시안 render(): 소개 화면에서만 html.lock
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('lock')
    return () => root.classList.remove('lock')
  }, [])

  // [이미 계정이 있어요]로 로그인했으면(팝업이든 리디렉션이든) 원래 가려던 곳으로
  useEffect(() => {
    if (user && isExistingLogin()) {
      markExistingLogin(false)
      void navigate(safeFrom(location.state), { replace: true })
    }
  }, [user, navigate, location.state])

  function onScroll() {
    const s = slidesRef.current
    if (s) setCur(Math.round(s.scrollLeft / s.clientWidth))
  }

  function start() {
    void navigate('/consent', { state: { fromWelcome: true, from: (location.state as { from?: unknown } | null)?.from } })
  }

  async function existing() {
    if (user) {
      void navigate('/', { replace: true })
      return
    }
    // 동의 화면에서 [동의하고 계속] 뒤 로그인 창을 닫고 남은 초안이 이 계정에 동의 화면 없이 적용되지 않게(QA 결함)
    clearConsentDraft()
    markExistingLogin(true)
    if (!(await login())) markExistingLogin(false)
  }

  return (
    <>
      <div className="screen ob pad enter">
        <div className="slides" id="slides" ref={slidesRef} onScroll={onScroll}>
          {SLIDES.map((s) => (
            <section className="slide" key={s.p}>
              {s.art}
              <h2>
                {s.h[0]}
                <br />
                {s.h[1]}
              </h2>
              <p>{s.p}</p>
            </section>
          ))}
        </div>
        <div className="dots">
          <div>
            {SLIDES.map((_, i) => (
              <button
                type="button"
                key={i}
                aria-label={`${i + 1}번째 소개`}
                aria-current={cur === i}
                onClick={() => {
                  const s = slidesRef.current
                  s?.scrollTo({ left: i * s.clientWidth, behavior: 'smooth' })
                }}
              ></button>
            ))}
          </div>
        </div>
      </div>
      <div className="bottom">
        <div className="inner pad" style={{ flexDirection: 'column', gap: 2 }}>
          <button type="button" className="btn ink" onClick={start}>
            시작하기
          </button>
          <button type="button" className="link" disabled={busy} onClick={() => void existing()}>
            {busy ? '로그인 중…' : '이미 계정이 있어요'}
          </button>
          <LoginNotice inApp={inApp} error={error} />
        </div>
      </div>
    </>
  )
}
