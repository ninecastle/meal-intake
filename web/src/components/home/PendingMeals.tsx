// (c) 이어 할 기록(조각 D2-S, 시안에 없음 — 리더가 사용자에게 묻는 중이라 따로 뗐다):
// 다른 날짜의 것은 끼니 카드 위 줄(열기·기록 취소), 이 날짜·이 끼니의 것은 카드 안 알약. 시안 부품 클래스(.school·.chipbtn·.link)로 그린다.
import { Link } from 'react-router'
import type { MealWithId } from '../../data/meals'
import { clockFmt, MEAL_TYPE_LABEL } from '../mealText'

function shortDate(dateKey: string): string {
  const [, mm, dd] = dateKey.split('-')
  return `${Number(mm)}월 ${Number(dd)}일`
}

function whenText(m: MealWithId, today: string): string {
  const d = m.createdAt?.toDate()
  const t = d ? clockFmt.format(d) : '방금'
  return m.dateKey === today ? t : `${shortDate(m.dateKey)} ${t}`
}

function namesText(m: MealWithId): string {
  const items: { name: string }[] = m.analysis?.items ?? m.beforeAnalysis?.items ?? []
  const names = items.map((i) => i.name).filter(Boolean)
  if (names.length === 0) return '음식 정보 없음'
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}개` : names.join(', ')
}

const openHref = (m: MealWithId) => (m.status === 'awaiting_after' ? `/meal/${m.id}/after` : `/meal/${m.id}/review`)

/** 끼니 카드 위: 다른 날짜(또는 끼니를 모르는) 이어 할 기록 */
export function PendingOtherDays({
  meals,
  today,
  onCancel,
}: {
  meals: MealWithId[]
  today: string
  onCancel: (m: MealWithId) => void
}) {
  if (meals.length === 0) return null
  return (
    <ul aria-label="이어 할 기록" style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 8 }}>
      {meals.map((m) => (
        <li key={m.id} className="school" style={{ marginTop: 0, paddingBlock: 8, paddingRight: 4 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p>
              {MEAL_TYPE_LABEL[m.mealType] ?? '식사'} · {whenText(m, today)}
            </p>
            <span
              style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {namesText(m)}
            </span>
          </div>
          <Link to={openHref(m)} className="chipbtn dark" style={{ display: 'inline-flex', alignItems: 'center', flex: 'none' }}>
            {m.status === 'awaiting_after' ? '남은 음식 찍기' : '확인하기'}
          </Link>
          <button type="button" className="link" style={{ fontSize: 13, flex: 'none' }} onClick={() => onCancel(m)}>
            기록 취소
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 끼니 카드 안: 이 날짜·이 끼니의 이어 할 기록. 카드(.meal>*)는 누르기를 통과시키므로 알약만 다시 받는다 */
export function PendingPills({ meals }: { meals: MealWithId[] }) {
  if (meals.length === 0) return null
  return (
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      {meals.map((m) => (
        <Link
          key={m.id}
          to={openHref(m)}
          className="chipbtn"
          style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', maxWidth: '100%' }}
        >
          {m.status === 'awaiting_after' ? '먹은 후 사진 기다림' : '결과 확인 기다림'}
        </Link>
      ))}
    </div>
  )
}
