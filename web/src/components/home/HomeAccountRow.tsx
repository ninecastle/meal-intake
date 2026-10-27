// (b) 홈 맨 아래 계정 줄과 톱니 이동처(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다).
// 설정 화면(D8)이 생기면 로그아웃·개발 링크는 설정으로 옮기고 이 부품을 지운다. 시안 부품 클래스(.link)로 그린다.
import { Link } from 'react-router'

/** 톱니(설정) 아이콘 이동처. 설정(D8) 전까지 S6 목표 설정 */
export const SETTINGS_PATH = '/goal'

type Props = { name: string; loggingOut: boolean; onLogout: () => void }

export function HomeAccountRow({ name, loggingOut, onLogout }: Props) {
  return (
    <div
      className="pad"
      style={{
        marginTop: 24,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
        fontSize: 13,
        color: 'var(--ink-3)',
      }}
    >
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {import.meta.env.DEV && (
        <Link to="/dev" className="link" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', color: 'inherit' }}>
          개발
        </Link>
      )}
      <button type="button" className="link" style={{ color: 'inherit' }} disabled={loggingOut} onClick={onLogout}>
        로그아웃
      </button>
    </div>
  )
}
