// 처음 동의(/consent, 디자인 조각 D10): 시안 consent() 마크업·클래스 그대로 — .topbar(‹) + .pad.q(제목·부제) + .allagree(전체 동의)
// + 항목 줄(.arow: .lbl 체크 + 필수/선택 꼬리표, [보기] → 약관 시트) + .bottom [동의하고 계속](필수 4개를 모두 체크해야 켜짐).
// - 로그인 전(소개 [시작하기]): ‹ 소개. [동의하고 계속] → 동의 초안을 기기에 두고 구글 로그인 → App의 Root가 계정에 저장하고
//   목표가 없으면 목표 화면, 있으면 홈으로 보낸다.
// - 로그인했는데 지금 버전 동의가 없는 계정(경로 가드가 보냄): ‹ 없음. "식사 사진 보관"은 지금 사진 보관이 켜져 있으면 미리 체크.
//   동의하면 계정에 저장하고 원래 가려던 곳(기본 홈).
// - 로그인 상태에서 소개 [시작하기](설정 "처음 화면 다시 보기"): ‹ 소개. 저장된 동의대로 체크된 채, [동의하고 계속] → 저장 → 홈.
// 선택 "식사 사진 보관"을 체크하지 않으면 사진 보관은 꺼짐으로 저장된다(첫 촬영 질문이 다시 나오지 않음, data/consent.saveConsent).
import type { User } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import TermsSheet from '../components/terms/TermsSheet'
import { safeFrom, useConsent } from '../components/terms/consentState'
import { LoginNotice, useGoogleLogin } from '../components/terms/googleLogin'
import { IconButton, Toast } from '../components/ui'
import { clearConsentDraft, hasCurrentConsent, readConsentDraft, REQUIRED_KEYS, saveConsent, writeConsentDraft, type ConsentKey } from '../data/consent'
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
  const location = useLocation()
  const [nav] = useState(() => location.state as { fromWelcome?: unknown; from?: unknown } | null)
  const fromWelcome = nav?.fromWelcome === true
  const { inApp, busy, error, login } = useGoogleLogin()
  const [prefs, setPrefs] = useState<{ uid: string; p: Prefs } | null>(null)
  const [agree, setAgree] = useState<Agree | null>(() => (uid ? null : {}))
  const [termsKey, setTermsKey] = useState<TermsKey | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null)
  const leaving = useRef(false)

  useEffect(() => {
    if (!uid) return
    return subscribePrefs(uid, (p) => setPrefs({ uid, p }))
  }, [uid])

  // 로그인 상태: 동의·설정을 다 불러오면 한 번 체크 상태를 채운다
  const ready = !uid || (consent !== undefined && prefs?.uid === uid)
  useEffect(() => {
    if (!uid || agree !== null || !ready || !prefs) return
    const keep = prefs.p.keepPhotos === true
    if (hasCurrentConsent(consent ?? null)) setAgree({ svc: true, priv: true, ai: true, age: true, keep, school: consent?.school === true })
    else setAgree({ keep })
  }, [uid, agree, ready, prefs, consent])

  // 로그인 상태에서 저장했으면 구독에 보인 뒤(경로 가드가 다시 이 화면으로 보내지 않게) 원래 가려던 곳으로
  useEffect(() => {
    if (!submitted || !hasCurrentConsent(consent ?? null) || leaving.current) return
    leaving.current = true
    void navigate(safeFrom(nav), { replace: true })
  }, [submitted, consent, navigate, fromWelcome, nav])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  // 로그인 전 동의 초안을 계정에 저장하는 중(App Root가 다음 화면으로 보낸다)
  if (uid && readConsentDraft() && !hasCurrentConsent(consent ?? null)) return <Loading />
  if (!ready || agree === null) return <Loading />

  const a = agree
  const all = AGREE.every(([k]) => a[k])
  const ok = REQUIRED_KEYS.every((k) => a[k])
  // ‹: 로그인 전이거나 소개에서 왔을 때만(기존 계정이 처음 보는 동의에는 없음)
  const showBack = !uid || fromWelcome || hasCurrentConsent(consent ?? null)

  function goBack() {
    // 로그인 전에 동의하고 로그인 창을 닫았다가 뒤로 나가면 남은 초안을 버린다
    if (!uid) clearConsentDraft()
    if (fromWelcome) void navigate(-1)
    else void navigate('/welcome', { replace: true })
  }

  async function submit() {
    if (!ok || busy || submitted) return
    const choice = { photoKeep: a.keep === true, school: a.school === true }
    if (!uid) {
      writeConsentDraft(choice)
      await login()
      return
    }
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
        <div style={{ display: 'flex' }}>{showBack && <IconButton icon="back" label="뒤로" onClick={goBack} />}</div>
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
        <LoginNotice inApp={inApp} error={error} />
      </div>
      <div className="bottom">
        <div className="inner pad">
          <button type="button" className="btn ink" disabled={!ok || busy || submitted} onClick={() => void submit()}>
            {busy ? '로그인 중…' : '동의하고 계속'}
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
