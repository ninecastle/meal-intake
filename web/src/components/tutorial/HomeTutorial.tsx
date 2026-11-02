// 디자인 조각 D11: 첫 홈 튜토리얼 8단계(사용자 확인 2026-10-28, _workspace/design/mock/tut_1~8*.png).
// 시안 drawCoach() 부품 그대로: 말풍선 단계는 .coach-block + .coach-hole(대상 둘레 8px 구멍) + .coach-tip, 가운데 창 단계는 .coach-modal.
// 아래 줄은 시안 .crow: [건너뛰기] · "n / 8" · [다음](마지막은 [시작하기]).
// 언제(계약): 홈에서 prefs.tutorialDone !== true이고 그날 홈이 다 그려졌을 때(ready) 한 번 자동 시작. 홈에 location.state.tutorial === true로 오면
// tutorialDone과 상관없이 시작(설정 [사용방법]). 다른 시트(.overlay)가 열려 있으면 닫힌 뒤 시작. 끝까지 보거나 건너뛰면 setTutorialDone(uid).
// 튜토리얼 중에는 뒤 화면(#root)을 inert로 막는다. Esc·기기 뒤로 가기는 건너뛰기와 같다(시작할 때 같은 주소 기록을 하나 더 쌓는다).
// 말풍선 단계는 대상이 화면 가운데(아이콘 줄·나의 하루 단계는 맨 위)에 오게 스크롤하고, 스크롤·크기 변화 때 다시 잰다. AI 호출 없음.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router'
import { subscribePrefs, setTutorialDone } from '../../data/prefs'
import { advanceDemoStage, useDemoStage } from '../../lib/demoAccount'
import { Icon, type IconName } from '../ui'
import { TrayPhoto } from './TrayPhoto'

const N = 8

type Spot = { kind: 'spot'; sel: string; top: boolean; text: ReactNode }
type Modal = { kind: 'modal'; title: string; body: ReactNode }

const CK = (
  <span className="tck" aria-hidden="true">
    <svg viewBox="0 0 16 16">
      <path d="M4 8.5l2.5 2.5L12 5.5" />
    </svg>
  </span>
)

function Tips({ items }: { items: string[] }) {
  return (
    <ul className="tips">
      {items.map((t) => (
        <li key={t}>
          {CK}
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

function WayRow({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--ground)', borderRadius: 16, padding: '12px 14px' }}>
      <span style={{ display: 'grid', placeItems: 'center', color: 'var(--ink)', flex: 'none' }}>
        <Icon name={icon} size={24} />
      </span>
      <div>
        <b style={{ fontFamily: 'var(--f-head)', fontSize: 17 }}>{title}</b>
        <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{sub}</div>
      </div>
    </div>
  )
}

const STEPS: (Spot | Modal)[] = [
  {
    kind: 'spot',
    sel: '.meals',
    top: false,
    text: (
      <>
        <b>1. 식사 기록은 끼니 카드에서</b>
        <br />
        먹기 전에 카드의 <b>+</b>를 눌러 기록을 시작해요. 카드를 누르면 그 끼니에 먹은 음식이 보여요.
      </>
    ),
  },
  {
    kind: 'modal',
    title: '2. 기록 방법은 세 가지예요',
    body: (
      <>
        <div style={{ display: 'grid', gap: 8, marginBottom: 6 }}>
          <WayRow icon="camera" title="카메라로 찍기" sub="먹기 전 음식을 바로 찍어요" />
          <WayRow icon="image" title="앨범에서 고르기" sub="이미 찍어 둔 사진을 골라요" />
          <WayRow icon="pen" title="직접 입력" sub="음식 이름을 찾아 넣어요" />
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '10px 0 14px' }}>사진을 고르면 AI가 음식과 양을 찾아 줘요</p>
      </>
    ),
  },
  {
    kind: 'modal',
    title: '3. 사진은 이렇게 찍어요',
    body: (
      <>
        <div className="shots">
          <TrayPhoto label="먹기 전" />
          <TrayPhoto after label="먹은 후" />
        </div>
        <Tips
          items={[
            '위에서 내려다보듯 수직으로 찍어요',
            '먹기 전·후는 같은 각도·거리에서. 먹은 후엔 먹기 전 사진이 반투명하게 겹쳐 보여요',
            '그릇이 모두 화면 안에 들어오게 해요',
            '밝은 곳에서, 손이나 폰 그림자가 가리지 않게 해요',
          ]}
        />
      </>
    ),
  },
  {
    kind: 'modal',
    title: '4. 다 먹은 뒤 남은 음식을 알려 주세요',
    body: (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
          <TrayPhoto after label="먹은 후" />
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>
            끼니 카드에서 <b style={{ color: 'var(--ink)' }}>"먹은 후 사진 기다림"</b>을 누르면 고를 수 있어요
          </p>
        </div>
        {/* 보기용(눌러도 아무 일 없음) */}
        <div className="choice" style={{ margin: '12px 0 14px' }} aria-hidden="true">
          {['카메라로 찍기', '앨범에서 고르기', '다 먹었어요', '남긴 양 직접 고르기'].map((t) => (
            <button key={t} type="button" tabIndex={-1}>
              {t}
            </button>
          ))}
        </div>
      </>
    ),
  },
  {
    kind: 'modal',
    title: '5. 결과를 확인하고 저장해요',
    body: (
      <>
        {/* 보기용 음식 카드 */}
        <div style={{ background: 'var(--ground)', borderRadius: 18, padding: 14 }} aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="fn" style={{ fontSize: 17 }}>
              제육볶음 <span className="srcb">DB</span>
            </span>
            <span className="num" style={{ fontFamily: 'var(--f-head)', fontSize: 18 }}>
              412kcal
            </span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', margin: '4px 0 8px' }}>먹기 전 280g</div>
          <div className="segment">
            {['다 먹음', '반 남김', '그대로', '직접 %'].map((t) => (
              <button key={t} type="button" tabIndex={-1} aria-selected={t === '반 남김'}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <Tips
          items={[
            '남긴 만큼 빼고 실제로 먹은 양만 계산해요',
            '이름·무게·남긴 양이 틀리면 눌러서 고쳐요',
            'DB는 식약처 영양 정보, AI 추정은 AI가 계산한 값이에요',
          ]}
        />
      </>
    ),
  },
  {
    kind: 'spot',
    sel: '.ring',
    top: true,
    text: (
      <>
        <b>6. 오늘 먹은 양을 한눈에</b>
        <br />
        목표 칼로리와 탄·단·지를 비교해요. [한눈에]·[자세히]로 더 볼 수 있어요.
      </>
    ),
  },
  {
    kind: 'spot',
    sel: '.topbar [aria-label="달력과 통계"]',
    top: true,
    text: (
      <>
        <b>7. 지난 기록은 달력에서</b>
        <br />
        날짜별 칼로리와 주간·월간 그래프를 봐요.
      </>
    ),
  },
  {
    kind: 'spot',
    sel: '.topbar [aria-label="설정"]',
    top: true,
    text: (
      <>
        <b>8. 목표와 설정</b>
        <br />
        목표 칼로리, 사진 보관 등은 설정에서 바꿔요. 이 안내는 <b>설정 → 사용방법</b>에서 다시 볼 수 있어요.
      </>
    ),
  },
]

type Rect = { left: number; top: number; width: number; height: number; bottom: number }

// 자동 시작은 계정마다 한 세션에 한 번(저장이 오프라인으로 늦어도 다시 뜨지 않게)
const autoStarted = new Set<string>()

/** 아래 시트(.overlay)가 열려 있는지 */
const sheetOpen = () => !!document.querySelector('.overlay:not([hidden])')

export default function HomeTutorial({ uid, ready }: { uid: string; ready: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [done, setDone] = useState<boolean | undefined>(undefined)
  const [step, setStep] = useState<number | null>(null)
  const [forced, setForced] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const pushedRef = useRef(false)
  // 테스트 계정 처음처럼(lib/demoAccount, 'tutorial' 단계)은 이미 봤어도 한 번 더
  const demo = useDemoStage(uid)

  useEffect(() => subscribePrefs(uid, (p) => setDone(p.tutorialDone && demo !== 'tutorial')), [uid, demo])

  // 설정 [사용방법] → 홈(state.tutorial === true). 새로고침 때 다시 뜨지 않게 state를 비운다.
  useEffect(() => {
    if ((location.state as { tutorial?: unknown } | null)?.tutorial !== true) return
    setForced(true)
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // 시작: 홈이 다 그려지고 시트가 닫혀 있을 때(시트가 열려 있으면 닫힐 때까지 기다린다)
  useEffect(() => {
    if (step !== null || !ready) return
    const auto = done === false && !autoStarted.has(uid)
    if (!forced && !auto) return
    let t = 0
    const tryStart = () => {
      if (sheetOpen()) {
        t = window.setTimeout(tryStart, 300)
        return
      }
      if (auto) autoStarted.add(uid)
      setForced(false)
      setStep(0)
    }
    t = window.setTimeout(tryStart, 400)
    return () => window.clearTimeout(t)
  }, [ready, done, forced, step, uid])

  const finish = useCallback(
    (byBack: boolean) => {
      setStep(null)
      setRect(null)
      setDone(true)
      advanceDemoStage(uid, 'tutorial', null)
      setTutorialDone(uid).catch((e: unknown) => console.warn('[tutorial] 저장 실패', e))
      if (!byBack && pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
      pushedRef.current = false
    },
    [uid],
  )

  const active = step !== null
  // 뒤 화면 막기 + 기기 뒤로 가기·Esc = 건너뛰기
  useEffect(() => {
    if (!active) return
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    // 같은 주소 기록을 하나만 더 쌓는다(개발 모드 StrictMode가 효과를 두 번 돌려도 한 번)
    if (!pushedRef.current) {
      window.history.pushState(window.history.state, '')
      pushedRef.current = true
    }
    const onPop = () => {
      pushedRef.current = false
      finish(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }
    // 바탕을 끌거나 휠을 굴려도 뒤 화면이 움직이지 않게(가운데 창 안 스크롤은 그대로). React 이벤트는 passive라 직접 단다.
    const stopScroll = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest('.coach-modal'))) e.preventDefault()
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    document.addEventListener('wheel', stopScroll, { passive: false })
    document.addEventListener('touchmove', stopScroll, { passive: false })
    return () => {
      root?.removeAttribute('inert')
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('wheel', stopScroll)
      document.removeEventListener('touchmove', stopScroll)
    }
  }, [active, finish])

  const cur = step === null ? null : STEPS[step]
  const spotSel = cur?.kind === 'spot' ? cur.sel : null
  const spotTop = cur?.kind === 'spot' ? cur.top : false

  // 말풍선 대상 잴 때: 스크롤(가운데 또는 맨 위) 뒤 위치를 재고, 스크롤·크기 변화·아이콘 줄 움직임 뒤에 다시 잰다
  useLayoutEffect(() => {
    if (!spotSel) {
      setRect(null)
      return
    }
    const el = document.querySelector<HTMLElement>(spotSel)
    if (!el) return
    if (spotTop) window.scrollTo(0, 0)
    else el.scrollIntoView({ block: 'center' })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        setRect({ left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom })
      })
    }
    measure()
    const late = [150, 400].map((ms) => window.setTimeout(measure, ms))
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(document.documentElement)
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    el.closest('.sticky')?.addEventListener('transitionend', measure)
    return () => {
      cancelAnimationFrame(frame)
      late.forEach((x) => window.clearTimeout(x))
      ro.disconnect()
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      el.closest('.sticky')?.removeEventListener('transitionend', measure)
    }
  }, [spotSel, spotTop])

  // 단계가 바뀌면 창(말풍선·가운데 창)에 초점(읽기 프로그램이 새 안내를 읽게, 버튼 초점 테두리는 안 보이게), Tab은 창 안에서만 돈다
  const hasRect = rect !== null
  useEffect(() => {
    if (step === null) return
    boxRef.current?.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true })
  }, [step, hasRect])

  if (step === null || !cur) return null
  const last = step === N - 1
  const next = () => (last ? finish(false) : setStep(step + 1))

  const crow = (
    <div className="crow">
      <button type="button" className="link" onClick={() => finish(false)}>
        건너뛰기
      </button>
      <span className="num" style={{ color: 'var(--ink-3)' }}>
        {step + 1} / {N}
      </span>
      <button type="button" className="btn lime" style={{ minHeight: 44 }} data-coachnext onClick={next}>
        {last ? '시작하기' : '다음'}
      </button>
    </div>
  )

  const onTab = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])'))
    if (!f.length) return
    const i = f.indexOf(document.activeElement as HTMLElement)
    e.preventDefault()
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus()
  }

  let content: ReactNode
  if (cur.kind === 'modal') {
    content = (
      <>
        <div className="coach-block" style={{ background: 'rgba(31,42,46,.58)' }} />
        <div className="coach-modal" role="dialog" aria-modal="true" aria-label={cur.title} tabIndex={-1} style={{ outline: 'none' }}>
          <h3>{cur.title}</h3>
          {cur.body}
          {crow}
        </div>
      </>
    )
  } else {
    if (!rect) {
      content = <div className="coach-block" style={{ background: 'rgba(31,42,46,.58)' }} />
    } else {
      const p = 8
      const below = rect.bottom + 230 < window.innerHeight
      const top = below ? rect.bottom + p + 12 : Math.max(12, rect.top - p - 12 - 190)
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - 316)
      content = (
        <>
          <div className="coach-block" />
          <div
            className="coach-hole"
            style={{ left: rect.left - p, top: rect.top - p, width: rect.width + 2 * p, height: rect.height + 2 * p }}
          />
          <div
            className="coach-tip"
            role="dialog"
            aria-modal="true"
            aria-label="사용방법"
            tabIndex={-1}
            style={{ top, left: Math.max(16, left), outline: 'none' }}
          >
            <p>{cur.text}</p>
            {crow}
          </div>
        </>
      )
    }
  }

  return createPortal(
    <div ref={boxRef} onKeyDown={onTab}>
      {content}
    </div>,
    document.body,
  )
}
