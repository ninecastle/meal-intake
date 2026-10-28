// 학교 찾기(D13, 사용자 확인 모양 d13_1_settings_search·d13_2_onboarding_school): 시안 .field 큰 칸(22px) → 잠깐 멈추면(400ms) 나이스 학교 검색
// → 결과 .choice 줄(학교 이름 + "시도 · 학교 종류"). 설정 학교 등록 시트와 시작(목표 질문) 학교 단계가 함께 쓴다.
import { useEffect, useState, type CSSProperties } from 'react'
import { searchSchools, type SchoolHit } from '../../lib/neis'

const DEBOUNCE_MS = 400

export function schoolSub(h: { region?: string; kind?: string }): string {
  return [h.region, h.kind].filter(Boolean).join(' · ')
}

type State = { q: string; kind: 'idle' | 'loading' | 'done' | 'error'; hits: SchoolHit[] }

export default function SchoolSearch({
  placeholder = '학교 이름 검색',
  picked,
  onPick,
  initial = '',
  fieldStyle,
}: {
  placeholder?: string
  /** 고른 학교(테두리로 표시) */
  picked?: { atpt: string; code: string } | null
  onPick: (h: SchoolHit) => void
  initial?: string
  /** 큰 칸 모양 덧쓰기(시작 단계는 시안 quiz처럼 회색 선) */
  fieldStyle?: CSSProperties
}) {
  const [q, setQ] = useState(initial)
  const [st, setSt] = useState<State>({ q: '', kind: 'idle', hits: [] })

  useEffect(() => {
    const term = q.trim()
    if (!term) return
    const ac = new AbortController()
    const t = window.setTimeout(() => {
      setSt({ q: term, kind: 'loading', hits: [] })
      searchSchools(term, ac.signal)
        .then((hits) => !ac.signal.aborted && setSt({ q: term, kind: 'done', hits }))
        .catch(() => !ac.signal.aborted && setSt({ q: term, kind: 'error', hits: [] }))
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
      ac.abort()
    }
  }, [q])

  const term = q.trim()
  const shown = term && st.q === term ? st : null
  const note = (text: string, alert = false) => (
    <p role={alert ? 'alert' : 'status'} style={{ margin: '12px 0 0', fontSize: 14, color: alert ? 'var(--peach-deep)' : 'var(--ink-2)' }}>
      {text}
    </p>
  )

  return (
    <>
      <div className="field" style={{ marginTop: 14, ...fieldStyle }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="학교 이름"
          autoComplete="off"
          enterKeyHint="search"
          style={{ fontSize: 22 }}
        />
      </div>
      {term && !shown && note('찾는 중…')}
      {shown?.kind === 'loading' && note('찾는 중…')}
      {shown?.kind === 'error' && note('학교를 찾지 못했어요. 인터넷 연결을 확인하고 다시 적어 주세요.', true)}
      {shown?.kind === 'done' && shown.hits.length === 0 && note(`'${term}'(으)로 찾은 학교가 없어요. 이름을 다르게 적어 보세요.`)}
      {shown?.kind === 'done' && shown.hits.length > 0 && (
        <div className="choice" style={{ marginTop: 12 }}>
          {shown.hits.map((h) => {
            const on = picked?.atpt === h.atpt && picked?.code === h.code
            return (
              <button
                key={`${h.atpt}-${h.code}`}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(h)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, ...(on ? { outline: '2px solid var(--ink)' } : null) }}
              >
                <span>{h.name}</span>
                <small style={{ fontFamily: 'var(--f-body)', fontSize: 13, color: 'var(--ink-2)' }}>{schoolSub(h)}</small>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
