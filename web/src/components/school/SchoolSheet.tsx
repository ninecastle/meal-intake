// 설정 "학교 등록" 시트(D13, 사용자 확인 모양 d13_1_settings_search·d13_1b_settings_registered).
// 등록 전: 설명 → 학교 찾기 → 고르면 저장하고 닫음. 등록 뒤: 지금 학교(.school 상자) → "다른 학교 찾기" → 주황 [학교 삭제](가운데 확인 창).
// 저장은 users/{uid}.school {atpt, code, name}만(규칙 v12). 기다리지 않는다(오프라인이면 캐시에 먼저 들어간다).
import { deleteSchool, setSchool, type School } from '../../data/school'
import { askConfirm, BottomSheet } from '../ui'
import SchoolSearch from './SchoolSearch'

export const SCHOOL_HELP = '급식 메뉴를 불러와 인식을 정확하게 해요. 학교 이름만 저장돼요'

export default function SchoolSheet({
  open,
  onClose,
  uid,
  school,
  onSaid,
}: {
  open: boolean
  onClose: () => void
  uid: string
  school: School | null
  /** 토스트 */
  onSaid: (text: string) => void
}) {
  function pick(h: School) {
    const s: School = { atpt: h.atpt, code: h.code, name: h.name }
    setSchool(uid, s).catch((e: unknown) => {
      console.warn('[school] 저장 실패', e)
      onSaid('학교를 저장하지 못했어요')
    })
    onClose()
    onSaid('학교를 등록했어요')
  }

  async function remove() {
    if (!(await askConfirm({ title: '학교를 삭제할까요?', body: '급식 메뉴를 더 불러오지 않아요.', ok: '삭제' }))) return
    deleteSchool(uid).catch((e: unknown) => {
      console.warn('[school] 삭제 실패', e)
      onSaid('학교를 삭제하지 못했어요')
    })
    onClose()
    onSaid('학교를 삭제했어요')
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="학교 등록">
      {open && (
        <>
          <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>{SCHOOL_HELP}</p>
          {school && (
            <div className="school" style={{ marginTop: 14 }}>
              <p>{school.name}</p>
            </div>
          )}
          <SchoolSearch placeholder={school ? '다른 학교 찾기' : '학교 이름 검색'} picked={school} onPick={pick} />
          {school && (
            <button
              type="button"
              className="danger"
              onClick={() => void remove()}
              style={{ display: 'block', margin: '14px auto 0', minHeight: 44, padding: '0 12px', fontFamily: 'var(--f-head)', fontSize: 15 }}
            >
              학교 삭제
            </button>
          )}
        </>
      )}
    </BottomSheet>
  )
}
