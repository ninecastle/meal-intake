// 홈 위쪽 고정 줄(조각 D2-S, 시안 home() .sticky > .topbar.pad + .datestrip.pad 마크업·클래스 그대로).
// 오른쪽 아이콘: cal = 그 날짜가 든 달의 S10 기록 보기(/calendar?month=YYYY-MM), gear = SETTINGS_PATH((b) 부품). 둘 다 push + state.fromHome.
// 날짜 줄: 양옆 .dside 전날·다음 날(replace 이동), 가운데 .dcenter 날짜(누르면 기록 보기, CLAUDE.md "홈에서 날짜나 달력 아이콘으로 연다") + "오늘" 알약.
// 오늘이 아닌 날의 [오늘로]와 내일 막기는 (e) 부품(DateLimits).
import { Link, useNavigate } from 'react-router'
import { dateKeyLabel, homeHref, shiftDateKey } from '../mealText'
import { IconButton } from '../ui'
import { BackToToday, NextDayBlocked } from './DateLimits'
import { SETTINGS_PATH } from './HomeAccountRow'

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

function dayParts(dateKey: string): { md: string; dow: string } {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number)
  return { md: `${m}.${String(d).padStart(2, '0')}`, dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

/** 시안 .dside 안: <span class="num">10.26</span><span class="dow">월</span> */
function SideDay({ dateKey }: { dateKey: string }) {
  const { md, dow } = dayParts(dateKey)
  return (
    <>
      <span className="num">{md}</span>
      <span className="dow">{dow}</span>
    </>
  )
}

export default function HomeDateBar({ dateKey, today }: { dateKey: string; today: string }) {
  const navigate = useNavigate()
  const isToday = dateKey === today
  const prev = shiftDateKey(dateKey, -1)
  const next = shiftDateKey(dateKey, 1)
  const calendarHref = `/calendar?month=${dateKey.slice(0, 7)}`
  const nextLabel = `다음 날, ${dateKeyLabel(next)}`
  return (
    <div className="sticky">
      <div className="topbar pad">
        <div></div>
        <div style={{ display: 'flex', gap: 4 }}>
          <IconButton icon="cal" label="달력과 통계" onClick={() => navigate(calendarHref, { state: { fromHome: true } })} />
          <IconButton icon="gear" label="설정" onClick={() => navigate(SETTINGS_PATH, { state: { fromHome: true } })} />
        </div>
      </div>
      <nav className="datestrip pad" aria-label="날짜 이동">
        <button
          type="button"
          className="dside"
          aria-label={`전날, ${dateKeyLabel(prev)}`}
          onClick={() => navigate(homeHref(prev, today), { replace: true })}
        >
          <SideDay dateKey={prev} />
        </button>
        <div className="dcenter">
          <Link
            to={calendarHref}
            state={{ fromHome: true }}
            className="num"
            aria-label={`${dateKeyLabel(dateKey)}${isToday ? ', 오늘' : ''}, 기록 보기`}
          >
            {dayParts(dateKey).md}
          </Link>
          {isToday ? (
            <span className="todaypill" aria-hidden="true">
              오늘
            </span>
          ) : (
            <BackToToday today={today} />
          )}
        </div>
        {next > today ? (
          <NextDayBlocked label={nextLabel}>
            <SideDay dateKey={next} />
          </NextDayBlocked>
        ) : (
          <button
            type="button"
            className="dside r"
            aria-label={nextLabel}
            onClick={() => navigate(homeHref(next, today), { replace: true })}
          >
            <SideDay dateKey={next} />
          </button>
        )}
      </nav>
    </div>
  )
}
