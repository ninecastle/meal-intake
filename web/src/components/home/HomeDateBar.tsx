// 홈 위쪽 고정 줄(조각 D2-S, 시안 home() .sticky > .topbar.pad + .datestrip.pad 마크업·클래스 그대로).
// 오른쪽 아이콘: cal = 그 날짜가 든 달의 S10 기록 보기(/calendar?month=YYYY-MM), gear = SETTINGS_PATH. 둘 다 push + state.fromHome.
// 날짜 줄: 양옆 .dside 전날·다음 날(replace 이동), 가운데 .dcenter 날짜(누르면 기록 보기, CLAUDE.md "홈에서 날짜나 달력 아이콘으로 연다") + "오늘" 알약.
// 오늘이 아닌 날의 [오늘로]와 내일 막기는 (e) 부품(DateLimits).
// 사용자가 고른 변경 (14, 2026-10-28): 아래로 스크롤하면 이 흰 줄 전체가 위로 숨고(멈춰도 숨은 채), 위로 스크롤하면 다시 내려온다(useAutoHide, 모양은 index.css .sticky.autohide).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import { dateKeyLabel, homeHref, shiftDateKey } from '../mealText'
import { IconButton } from '../ui'
import { BackToToday, NextDayBlocked } from './DateLimits'

/** 톱니(설정) 이동처. 설정 화면(D8)이 생길 때까지 S6 목표 설정(2026-10-27 사용자 결정) */
const SETTINGS_PATH = '/goal'

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

/** 이만큼(px) 한 방향으로 움직여야 숨기기·보이기를 바꾼다(손가락 떨림·관성 끝의 작은 되튐에 깜빡이지 않게) */
const MOVE_PX = 6

/**
 * 창 스크롤 방향으로 줄을 숨기고 보인다: 아래로 MOVE_PX 넘게 가면 숨김, 위로 MOVE_PX 넘게 가면 보임, 줄 높이보다 위(맨 위 근처)면 늘 보임.
 * 위치는 0~맨 아래로 자른다(아이폰에서 맨 아래 고무줄 되튐이 위로 스크롤로 읽히지 않게). 키보드로 줄 안에 들어오면(포커스) 보인다.
 */
function useAutoHide(ref: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const pos = () => Math.min(Math.max(window.scrollY, 0), Math.max(document.documentElement.scrollHeight - window.innerHeight, 0))
    let last = pos()
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = pos()
        if (y <= (ref.current?.offsetHeight ?? 0)) {
          setHidden(false)
          last = y
          return
        }
        if (Math.abs(y - last) < MOVE_PX) return
        setHidden(y > last)
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [ref])
  return [hidden, () => setHidden(false)]
}

export default function HomeDateBar({ dateKey, today }: { dateKey: string; today: string }) {
  const navigate = useNavigate()
  const barRef = useRef<HTMLDivElement>(null)
  const [hidden, show] = useAutoHide(barRef)
  const isToday = dateKey === today
  const prev = shiftDateKey(dateKey, -1)
  const next = shiftDateKey(dateKey, 1)
  const calendarHref = `/calendar?month=${dateKey.slice(0, 7)}`
  const nextLabel = `다음 날, ${dateKeyLabel(next)}`
  return (
    <div ref={barRef} className={hidden ? 'sticky autohide hide' : 'sticky autohide'} onFocusCapture={show}>
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
