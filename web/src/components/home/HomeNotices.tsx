// (f) 홈 알림(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다): 오프라인·불러오기 오류·저장 대기·탄단지 빠짐·동작 실패.
// "저장했어요"·"목표를 저장했어요" 알림은 공통 토스트(HomePage의 toastText)로 보인다. 시안 부품 클래스(.note·.kinfo)로 그린다.
const BOX = { marginTop: 0, color: 'var(--ink)' } as const
const WARN = { ...BOX, background: 'var(--butter-soft)' } as const

/** 날짜 줄 아래: 오프라인, 이어 할 기록 불러오기 오류, 로그아웃 실패 */
export function HomeStatusNotes({ online, listError, actionError }: { online: boolean; listError: boolean; actionError: string | null }) {
  if (online && !listError && actionError == null) return null
  return (
    <div className="pad" style={{ display: 'grid', gap: 8, paddingBottom: 12 }}>
      {!online && (
        <p className="note" style={{ ...BOX, background: 'var(--ground)' }}>
          오프라인이에요. 기록은 연결되면 저장돼요.
        </p>
      )}
      {listError && (
        <p className="note" style={WARN}>
          이어 할 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
        </p>
      )}
      {actionError && <InlineError message={actionError} />}
    </div>
  )
}

/** 하늘 띠 안: 그날 요약 불러오기 오류 */
export function DayLoadError() {
  return (
    <p className="note" style={{ ...WARN, marginBottom: 12 }}>
      요약을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
    </p>
  )
}

/** 하늘 띠 아래: 탄단지가 빠진 음식, 저장 대기(오프라인 캐시) */
export function DayDataNotes({ incompleteMacros, hasPendingWrites }: { incompleteMacros: boolean; hasPendingWrites: boolean }) {
  if (!incompleteMacros && !hasPendingWrites) return null
  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
      {incompleteMacros && (
        <p
          className="kinfo"
          style={{ justifySelf: 'center', background: 'var(--butter-soft)', color: 'var(--ink)', borderRadius: 'var(--r-sm)', padding: '4px 10px' }}
        >
          일부 음식의 탄·단·지가 빠져 있어요
        </p>
      )}
      {hasPendingWrites && <p className="kinfo">저장 대기 중(연결되면 올라가요)</p>}
    </div>
  )
}

/** 동작 실패 한 줄(공복 표시·기록 취소·로그아웃) */
export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--peach-deep)' }}>
      {message}
    </p>
  )
}
