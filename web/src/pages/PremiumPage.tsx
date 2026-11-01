// 설정 → 프리미엄(/premium, 2026-11-01 사용자 결정, 사용자 확인 모양 _workspace/design/mock/premium_1_top·2_bottom·B_modal.png).
// 시안에 없는 화면이라 시안 부품(.topbar, .crown, .btn, .bottom, 색 토큰)으로 그린 결제 안내 화면. 실제 결제는 없다(기능 잠금도 없음).
// 위에서 아래로: 어두운 첫 상자 → 지난주 기록 3일 이상이면 내 기록 한 줄 → 프리미엄 기능 세 가지(미리보기는 "예시") →
// 무료와 비교 표 → 요금제(연간 39,000원 = 월 3,250원 · 34% 할인, 월간 4,900원, 연간 미리 고름) → 7일 무료·해지 안내 →
// 아래 고정 [7일 무료로 시작하기](누르면 "결제는 아직 준비 중이에요" 가운데 창). 가짜 후기·사용자 수·마감 시계는 넣지 않는다.
// 방문 기록: 설정에서 push(state.fromSettings). ‹ = 설정에서 왔으면 navigate(-1), 아니면 설정으로 replace.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { askConfirm, Crown, IconButton } from '../components/ui'
import { subscribeMealsInRange } from '../data/meals'
import { toDateKey } from '../lib/time'
import { mondayOf, shiftWeek, weekDays } from '../lib/week'

/** 요금(2026-11-01 사용자 결정) */
const MONTHLY = 4900
const YEARLY = 39000
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const YEARLY_PER_MONTH = Math.round(YEARLY / 12 / 10) * 10
const YEARLY_OFF = Math.round((1 - YEARLY / (MONTHLY * 12)) * 100)
const YEARLY_PER_DAY = Math.round(YEARLY / 365)
/** 내 기록 한 줄을 보이는 지난주 기록일 수(AI 주간 리포트를 만들 수 있는 최소 기록일과 같다) */
const HOOK_MIN_DAYS = 3

type Plan = 'year' | 'month'

/** 월간 그래프 미리보기 막대 높이(예시) */
const BARS = [34, 40, 38, 52, 30, 42, 44, 36, 39, 41, 50, 33, 37, 40, 43, 38, 35, 46, 39, 41, 37, 44, 40, 36, 42, 38, 45, 39]

function Feature({ bg, title, desc, children }: { bg: string; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="pm-feat" style={{ background: bg }}>
      <h3>
        <Crown /> {title}
      </h3>
      <p>{desc}</p>
      <div className="pm-prev">
        <span className="pm-ex">예시</span>
        {children}
      </div>
    </section>
  )
}

function PlanButton({ on, title, tag, sub, price, onPick }: { on: boolean; title: string; tag?: string; sub: string; price: string; onPick: () => void }) {
  return (
    <button type="button" className={on ? 'pm-plan on' : 'pm-plan'} role="radio" aria-checked={on} onClick={onPick}>
      <span className="pm-radio" aria-hidden="true" />
      <span>
        <span className="t">
          {title}
          {tag && <span className="pm-tag">{tag}</span>}
        </span>
        <small>{sub}</small>
      </span>
      <span className="pr">{price}</span>
    </button>
  )
}

export default function PremiumPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [fromSettings] = useState(() => (location.state as { fromSettings?: unknown } | null)?.fromSettings === true)
  const leaving = useRef(false)
  const [plan, setPlan] = useState<Plan>('year')
  const [lastWeekDays, setLastWeekDays] = useState<number | null>(null)

  // 지난주(월~일) 기록한 날 수: 끝난 기록이 있는 날
  useEffect(() => {
    const days = weekDays(shiftWeek(mondayOf(toDateKey(new Date())), -1))
    return subscribeMealsInRange(
      uid,
      days[0],
      days[6],
      (meals) => setLastWeekDays(new Set(meals.filter((m) => m.status === 'done').map((m) => m.dateKey)).size),
      () => setLastWeekDays(null),
    )
  }, [uid])

  function goBack() {
    if (leaving.current) return
    leaving.current = true
    if (fromSettings) void navigate(-1)
    else void navigate('/settings', { replace: true })
  }

  function start() {
    // 결제는 아직 없다(2026-11-01 사용자 결정: 준비 중 안내)
    void askConfirm({ title: '결제는 아직 준비 중이에요', body: '지금은 프리미엄 기능을 모두 무료로 써 볼 수 있어요', ok: '둘러보기', cancel: null })
  }

  return (
    <main className="screen enter" style={{ paddingBottom: 150 }}>
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={goBack} />
        </div>
        <h1>프리미엄</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad">
        <div className="pm-hero">
          <Crown />
          <h2>
            기록만 하던 식단,
            <br />
            이제 AI가 코치해요
          </h2>
          <p>
            먹은 기록을 바탕으로 한 주를 돌아보고
            <br />
            오늘 뭘 먹을지까지 알려 드려요
          </p>
        </div>

        {lastWeekDays !== null && lastWeekDays >= HOOK_MIN_DAYS && (
          <div className="pm-hook">
            <span aria-hidden="true">📊</span>
            <span>
              {`지난주 ${lastWeekDays}일 기록했어요.`}
              <br />
              <span style={{ color: 'var(--lime-deep)' }}>AI 주간 리포트로 한 주를 분석해 보세요</span>
            </span>
          </div>
        )}

        <h2 className="pm-h2">프리미엄으로 할 수 있는 것</h2>
        <Feature bg="var(--sky-soft)" title="AI 주간 리포트" desc="한 주 점수, 잘한 점·아쉬운 점, 바꿔 보면 좋은 음식, 다음 주 하루 식단 예시까지">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 34 }}>82</b>
            <span style={{ color: 'var(--ink-2)' }}>점 · 균형 잡힌 한 주였어요</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7 }}>
            👍 단백질을 꾸준히 챙겼어요
            <br />
            🔁 라면 대신 <b>잔치국수</b>를 골라 보세요
          </div>
        </Feature>
        <Feature bg="var(--lime-soft)" title="남은 영양소 맞춤 음식 추천" desc="오늘 남은 칼로리·탄단지에 맞는 음식을 끼니별로 골라 드려요">
          <b style={{ color: 'var(--lime-deep)' }}>단백질이 가장 많이 남았어요</b>
          <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.8 }}>
            🥗 닭가슴살 샐러드 <span style={{ color: 'var(--ink-3)' }}>320kcal</span>
            <br />
            🍳 달걀말이 <span style={{ color: 'var(--ink-3)' }}>180kcal</span>
          </div>
        </Feature>
        <Feature bg="var(--peach-soft)" title="월간 그래프" desc="한 달 칼로리 흐름과 목표 범위 안에 든 날을 한눈에">
          <svg viewBox="0 0 282 64" style={{ width: '100%', height: 'auto', display: 'block' }} aria-hidden="true">
            <line x1="0" y1="20" x2="282" y2="20" stroke="var(--ink-3)" strokeDasharray="4 4" />
            {BARS.map((h, i) => (
              <rect key={i} x={i * 10 + 2} y={60 - h} width="6" height={h} rx="2" fill={h > 48 ? 'var(--peach)' : 'var(--lime)'} />
            ))}
          </svg>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>
            목표 범위 안에 든 날 <b style={{ color: 'var(--ink)' }}>18일</b>
          </div>
        </Feature>

        <h2 className="pm-h2">무료와 비교</h2>
        <table className="pm-cmp">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">기능</span>
              </th>
              <th scope="col">무료</th>
              <th scope="col">프리미엄</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['사진으로 칼로리 기록', true],
                ['하루 요약·달력·주간 그래프', true],
                ['AI 주간 리포트', false],
                ['맞춤 음식 추천', false],
                ['월간 그래프', false],
              ] as const
            ).map(([name, free]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{free ? <b className="pm-yes">✓</b> : <span className="pm-no" aria-label="없음">–</span>}</td>
                <td>
                  <b className="pm-yes">✓</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="pm-h2">요금제</h2>
        <div role="radiogroup" aria-label="요금제">
          <PlanButton
            on={plan === 'year'}
            title="연간"
            tag={`${YEARLY_OFF}% 할인`}
            sub={`연 ${won(YEARLY)} · 하루 약 ${won(YEARLY_PER_DAY)}`}
            price={`월 ${won(YEARLY_PER_MONTH)}`}
            onPick={() => setPlan('year')}
          />
          <PlanButton on={plan === 'month'} title="월간" sub="매달 결제" price={`월 ${won(MONTHLY)}`} onPick={() => setPlan('month')} />
        </div>
        <p className="pm-trust">
          처음 7일은 무료예요 · 체험 중에 해지하면 결제되지 않아요
          <br />
          언제든 설정에서 해지할 수 있어요
        </p>
      </div>

      <div className="bottom">
        <div className="inner pad" style={{ flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn ink" style={{ pointerEvents: 'auto', width: '100%' }} onClick={start}>
            7일 무료로 시작하기
          </button>
          <small style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
            {plan === 'year' ? `체험이 끝나면 연 ${won(YEARLY)}이 결제돼요` : `체험이 끝나면 매달 ${won(MONTHLY)}이 결제돼요`}
          </small>
        </div>
      </div>
    </main>
  )
}
