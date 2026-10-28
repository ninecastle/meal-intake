// 설정 → 약관·개인정보(/terms, 디자인 조각 D10, 사용자 확인 모양 _workspace/design/mock/d10_2_terms_page.png):
// 시안 설정 부품(.topbar, .sgroup, .srow)으로 — 필수 세 줄 "동의함 ›"·만 14세 "확인함", 선택 식사 사진 보관(지금 사진 보관 설정)·
// 학교 등록(동의 기록), 동의한 날짜, "영양 정보 출처" 묶음. 줄을 누르면 시안 약관 시트(버튼 [확인]).
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import TermsSheet from '../components/terms/TermsSheet'
import { useConsent } from '../components/terms/consentState'
import { IconButton } from '../components/ui'
import { subscribePrefs, type Prefs } from '../data/prefs'
import type { TermsKey } from '../lib/terms'

function Row({ k, label, value, onOpen }: { k: TermsKey; label: string; value: string; onOpen: (k: TermsKey) => void }) {
  return (
    <button type="button" className="srow" onClick={() => onOpen(k)}>
      <span>{label}</span>
      <small>{value} ›</small>
    </button>
  )
}

export default function TermsPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [fromSettings] = useState(() => (location.state as { fromSettings?: unknown } | null)?.fromSettings === true)
  const leaving = useRef(false)
  const consent = useConsent()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [termsKey, setTermsKey] = useState<TermsKey | null>(null)

  useEffect(() => subscribePrefs(uid, setPrefs), [uid])

  function goBack() {
    if (leaving.current) return
    leaving.current = true
    if (fromSettings) void navigate(-1)
    else void navigate('/settings', { replace: true })
  }

  // 경로 가드가 지금 버전 동의가 있는 계정만 들여보낸다. 서버 시각이 아직 안 왔으면(저장 직후) 오늘
  const at = consent?.agreedAt ?? new Date()
  const keep = prefs ? (prefs.keepPhotos === true ? '동의함' : '동의 안 함') : '–'

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={goBack} />
        </div>
        <h1>약관·개인정보</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad">
        <div className="sgroup">필수</div>
        <Row k="svc" label="서비스 이용 안내" value="동의함" onOpen={setTermsKey} />
        <Row k="priv" label="개인정보 수집·이용" value="동의함" onOpen={setTermsKey} />
        <Row k="ai" label="사진 AI 분석" value="동의함" onOpen={setTermsKey} />
        {/* 누를 것이 없는 줄. 시안 줄 버튼과 같은 자리(버튼 안쪽 여백 1px 6px) */}
        <div className="srow" style={{ padding: '1px 6px' }}>
          <span>만 14세 이상</span>
          <small>확인함</small>
        </div>
        <div className="sgroup">선택</div>
        <Row k="keep" label="식사 사진 보관" value={keep} onOpen={setTermsKey} />
        <p style={{ fontSize: 14, color: 'var(--ink-3)', margin: '14px 0 0' }}>
          {at.getFullYear()}년 {at.getMonth() + 1}월 {at.getDate()}일에 동의했어요. 선택 항목은 설정의 각 스위치로 바꿀 수 있어요.
        </p>
        <div className="sgroup">영양 정보 출처</div>
        <p style={{ color: 'var(--ink-2)', margin: '6px 0 0', fontSize: 15, lineHeight: 1.5 }}>
          식품의약품안전처 식품영양성분 DB(2026-10-06 갱신본)를 기준으로 계산해요. 이 DB에 없는 음식은 AI가 추정해요.
        </p>
      </div>
      <TermsSheet termKey={termsKey} agreed confirmOnly onClose={() => setTermsKey(null)} />
    </main>
  )
}
