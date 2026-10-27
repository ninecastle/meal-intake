// 홈 위쪽 고정 줄(디자인 조각 D2-H1, 시안 home() .sticky > .topbar + .datestrip).
// 오른쪽 아이콘: cal = 그 날짜가 든 달의 S10 기록 보기(/calendar?month=YYYY-MM), gear = 설정(D8 전까지 S6 목표 /goal). 둘 다 push + state.fromHome.
// 날짜 줄: 양옆 전날·다음 날("10.26" + 요일 동그라미, replace 이동), 가운데 날짜(누르면 기록 보기) + "오늘" 알약, 오늘이 아니면 그 자리에 [오늘로].
// 내일 이후로는 갈 수 없다: 다음 날이 오늘보다 뒤면 버튼을 막는다(2026-10-27 사용자 결정).
import { Link } from 'react-router'
import { dateKeyLabel, homeHref, shiftDateKey } from '../mealText'
import { Icon } from '../ui'

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

function dayParts(dateKey: string): { md: string; dow: string } {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number)
  return { md: `${m}.${String(d).padStart(2, '0')}`, dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

/** 시안 .iconbtn(44px, 둥근 12px, 누를 때 ground) — 이동이라 링크로 둔다 */
const ICON_LINK = 'focus-ring grid size-11 flex-none place-items-center rounded-xl text-ink hover:bg-ground'
/** 시안 .dside: ink-3, 18px, 높이 44px 이상, 간격 6px */
const SIDE = 'focus-ring flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-chip text-[18px] text-ink-3'

function SideDay({ dateKey }: { dateKey: string }) {
  const { md, dow } = dayParts(dateKey)
  return (
    <>
      <span className="num text-[20px] max-[380px]:text-[17px]">{md}</span>
      <span className="grid size-[26px] place-items-center rounded-full bg-line text-[12px] text-ink-2">{dow}</span>
    </>
  )
}

export default function HomeDateBar({ dateKey, today }: { dateKey: string; today: string }) {
  const isToday = dateKey === today
  const prev = shiftDateKey(dateKey, -1)
  const next = shiftDateKey(dateKey, 1)
  const calendarHref = `/calendar?month=${dateKey.slice(0, 7)}`
  const { md } = dayParts(dateKey)
  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-5 bg-surface">
      <div className="pad flex h-14 items-center justify-end gap-1 py-1.5">
        <Link to={calendarHref} state={{ fromHome: true }} aria-label="기록 보기" className={ICON_LINK}>
          <Icon name="cal" />
        </Link>
        <Link to="/goal" state={{ fromHome: true }} aria-label="설정" className={ICON_LINK}>
          <Icon name="gear" />
        </Link>
      </div>
      <nav
        aria-label="날짜 이동"
        className="pad grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-1 pb-3.5 max-[380px]:gap-1"
      >
        <Link to={homeHref(prev, today)} replace aria-label={`전날, ${dateKeyLabel(prev)}`} className={`${SIDE} justify-self-start`}>
          <SideDay dateKey={prev} />
        </Link>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Link to={calendarHref} state={{ fromHome: true }} className="focus-ring rounded-chip">
            <h1 className="num text-[24px]">
              <span aria-hidden="true">{md}</span>
              <span className="sr-only">{dateKeyLabel(dateKey)}</span>
            </h1>
            <span className="sr-only">{isToday ? ', 오늘' : ''}, 기록 보기</span>
          </Link>
          {isToday ? (
            <span aria-hidden="true" className="rounded-full bg-ink px-[11px] py-1 text-[13px] leading-[1.5] text-white">
              오늘
            </span>
          ) : (
            <Link to={homeHref(today, today)} replace className="focus-ring flex min-h-11 items-center rounded-full">
              <span className="rounded-full bg-sky-deep px-[11px] py-1 text-[13px] leading-[1.5] text-white">오늘로</span>
            </Link>
          )}
        </div>
        {next > today ? (
          <button
            type="button"
            disabled
            aria-label={`다음 날, ${dateKeyLabel(next)}`}
            className={`${SIDE} cursor-not-allowed justify-self-end opacity-35`}
          >
            <SideDay dateKey={next} />
          </button>
        ) : (
          <Link
            to={homeHref(next, today)}
            replace
            aria-label={`다음 날, ${dateKeyLabel(next)}`}
            className={`${SIDE} justify-self-end`}
          >
            <SideDay dateKey={next} />
          </Link>
        )}
      </nav>
    </div>
  )
}
