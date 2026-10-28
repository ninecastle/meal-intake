// 시안 sheets.terms(디자인 조각 D10): 시트 제목 + .terms(h4 소제목, ul 줄) + 아래 넓은 .btn.ink.
// 처음 동의 화면: 아직 체크 안 했으면 [동의하기](그 항목을 체크하고 닫음), 체크했으면 [확인].
// 설정 → 약관·개인정보: 늘 [확인](confirmOnly).
import { TERMS, type TermsKey } from '../../lib/terms'
import { BottomSheet } from '../ui'

type Props = {
  termKey: TermsKey | null
  agreed: boolean
  confirmOnly?: boolean
  onAgree?: (k: TermsKey) => void
  onClose: () => void
}

export default function TermsSheet({ termKey, agreed, confirmOnly = false, onAgree, onClose }: Props) {
  const t = termKey ? TERMS[termKey] : null
  const showAgree = !confirmOnly && !agreed
  return (
    <BottomSheet open={t !== null} onClose={onClose} title={t?.[0] ?? ''}>
      {t && termKey && (
        <>
          <div className="terms">
            {t[1].map(([h, items]) => (
              <div key={h} style={{ display: 'contents' }}>
                <h4>{h}</h4>
                {/* Tailwind 기본 스타일이 목록 점을 지워서 시안(브라우저 기본 disc)처럼 되돌린다 */}
                <ul style={{ listStyle: 'disc' }}>
                  {items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn ink"
            style={{ width: '100%', marginTop: 18 }}
            onClick={() => {
              if (showAgree) onAgree?.(termKey)
              onClose()
            }}
          >
            {showAgree ? '동의하기' : '확인'}
          </button>
        </>
      )}
    </BottomSheet>
  )
}
