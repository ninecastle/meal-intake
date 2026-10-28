// 처음 동의(/consent, 디자인 조각 D10): 시안 consent() 마크업·클래스 그대로 — .topbar + .pad.q(제목·부제) + .allagree(전체 동의)
// + 항목 줄(.arow: .lbl 체크 + 필수/선택 꼬리표, [보기] → 약관 시트) + .bottom [동의하고 계속](필수 4개를 모두 체크해야 켜짐).
// 시작 순서 바꿈(2026-10-28 사용자 결정): 로그인한 계정만 온다(로그인 전이면 소개로). 지금 약관 버전 동의가 없는 계정이 한 번 보고,
// 뒤로 버튼은 없다. [동의하고 계속]은 바로 계정에 저장하고 목표가 없는 계정(새 계정)은 목표 질문(/start), 있으면 홈 맨 위로.
// "식사 사진 보관"은 지금 사진 보관이 켜져 있으면 미리 체크. 체크하지 않으면 사진 보관은 꺼짐으로 저장된다(data/consent.saveConsent).
import type { User } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import TermsSheet from '../components/terms/TermsSheet'
import { useConsent } from '../components/terms/consentState'
import { Toast } from '../components/ui'
import { hasCurrentConsent, REQUIRED_KEYS, saveConsent, type ConsentKey } from '../data/consent'
import { subscribeGoal } from '../data/goals'
import { subscribePrefs, type Prefs } from '../data/prefs'
import { AGREE, type TermsKey } from '../lib/terms'

type Agree = Partial<Record<ConsentKey, boolean>>

function Loading() {
  return <main className="flex min-h-dvh items-center justify-center p-4 text-sm text-ink-2">불러오는 중…</main>
}

const Cbox = ({ on }: { on: boolean }) => (
  <span className={on ? 'cbox on' : 'cbox'} aria-hidden="true">
    <svg viewBox="0 0 16 16">
      <path d="M4 8.5l2.5 2.5L12 5.5" />
    </svg>
  </span>
)

export default function ConsentPage({ user }: { user: User | null }) {
  const uid = user?.uid ?? null
  const consent = useConsent()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<{ uid: string; p: Prefs } | null>(null)
  const [agree, setAgree] = useState<Agree | null>(null)
  const [goal, setGoal] = useState<{ uid: string; has: boolean } | null>(null)
  const [termsKey, setTermsKey] = useState<TermsKey | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null)
  const leaving = useRef(false)

  useEffect(() => {
    if (!uid) return
    return subscribePrefs(uid, (p) => setPrefs({ uid, p }))
  }, [uid])

  // 목표가 있는지(동의 뒤 새 계정은 목표 질문, 가입한 계정은 홈). 읽지 못하면 가입한 계정으로 본다
  useEffect(() => {
    if (!uid) return
    return subscribeGoal(
      uid,
      (g) => setGoal({ uid, has: g !== null }),
      () => setGoal((p) => p ?? { uid, has: true }),
    )
  }, [uid])

  // 로그인 상태: 동의·설정을 다 불러오면 한 번 체크 상태를 채운다
  const ready = !!uid && consent !== undefined && prefs?.uid === uid && goal?.uid === uid
  useEffect(() => {
    if (!uid || agree !== null || !ready || !prefs) return
    const keep = prefs.p.keepPhotos === true
    if (hasCurrentConsent(consent ?? null)) setAgree({ svc: true, priv: true, ai: true, age: true, keep })
    else setAgree({ keep })
  }, [uid, agree, ready, prefs, consent])

  // 저장했으면 구독에 보인 뒤(경로 가드가 다시 소개로 보내지 않게) 새 계정은 목표 질문, 가입한 계정은 홈 맨 위로
  const hasGoal = goal?.has === true
  useEffect(() => {
    if (!submitted || !hasCurrentConsent(consent ?? null) || leaving.current) return
    leaving.current = true
    if (hasGoal) void navigate('/', { replace: true })
    else void navigate('/start', { replace: true, state: { depth: 0 } })
  }, [submitted, consent, navigate, hasGoal])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  if (!uid) return <Navigate to="/welcome" replace />
  if (!ready || agree === null) return <Loading />

  const a = agree
  const all = AGREE.every(([k]) => a[k])
  const ok = REQUIRED_KEYS.every((k) => a[k])
  async function submit() {
    if (!uid || !ok || submitted) return
    // 학교 등록은 동의 항목에서 뺐다(D13). 규칙이 요구하는 school 칸은 false로 계속 저장한다
    const choice = { photoKeep: a.keep === true, school: false }
    setSubmitted(true)
    saveConsent(uid, choice).catch((e: unknown) => {
      console.warn('[consent] 저장 실패', e)
      setSubmitted(false)
      setToast({ text: '저장하지 못했어요. 다시 시도해 주세요', at: Date.now() })
    })
  }

  return (
    <div className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}></div>
        <h1></h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad q">
        <h2>
          서비스 이용에
          <br />
          동의해 주세요
        </h2>
        <p className="help">처음 한 번만 확인하면 돼요</p>
        <div className="allagree">
          <div className="arow">
            <button
              type="button"
              className="lbl"
              aria-pressed={all}
              onClick={() => setAgree(Object.fromEntries(AGREE.map(([k]) => [k, !all])) as Agree)}
            >
              <Cbox on={all} />
              전체 동의
            </button>
          </div>
        </div>
        {AGREE.map(([k, l, r]) => (
          <div className="arow" key={k}>
            <button type="button" className="lbl" aria-pressed={!!a[k]} onClick={() => setAgree({ ...a, [k]: !a[k] })}>
              <Cbox on={!!a[k]} />
              <span className={r ? 'tagreq' : 'tagopt'}>{r ? '필수' : '선택'}</span>
              <span>{l}</span>
            </button>
            {k !== 'age' && (
              <button type="button" className="view" onClick={() => setTermsKey(k)}>
                보기
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="bottom">
        <div className="inner pad">
          <button type="button" className="btn ink" disabled={!ok || submitted} onClick={() => void submit()}>
            동의하고 계속
          </button>
        </div>
      </div>
      <TermsSheet
        termKey={termsKey}
        agreed={termsKey ? !!a[termsKey] : false}
        onAgree={(k) => setAgree({ ...a, [k]: true })}
        onClose={() => setTermsKey(null)}
      />
      <Toast message={toast?.text ?? null} />
    </div>
  )
}
