// 기록 보기(S10) 왼쪽 위 월 이동 "◀ 10월 ▶". 보고 있는 달은 페이지가 ?month로 갖고, 여기서는 그리기와 누르기만 한다.
// 올해가 아닌 달은 연도를 위 작은 글자로 얹는다("2025년" / "12월", 폭 360px에서 오른쪽 월 요약과 한 줄에 들어가게).
const arrowBtn =
  'focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base text-ink disabled:text-ink-3'

export default function MonthNav({
  month,
  today,
  onMove,
}: {
  /** 'YYYY-MM' */
  month: string
  /** 오늘 dateKey */
  today: string
  onMove: (delta: number) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const thisYear = month.slice(0, 4) === today.slice(0, 4)
  const isThisMonth = month === today.slice(0, 7)
  return (
    <nav aria-label="달 이동" className="flex min-w-0 items-center">
      {/* 달력 카드 안(좌우 여백 6px)이라 왼쪽으로 내밀지 않는다(예전 -ml-2는 카드 테두리에 닿았다) */}
      <button type="button" onClick={() => onMove(-1)} aria-label="지난달" className={arrowBtn}>
        ◀
      </button>
      <h2 className="min-w-10 text-center leading-tight whitespace-nowrap">
        {!thisYear && <span className="block text-[11px] font-medium text-ink-2">{y}년 </span>}
        <span className="text-lg font-bold">{m}월</span>
      </h2>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={isThisMonth}
        aria-label="다음 달"
        className={arrowBtn}
      >
        ▶
      </button>
    </nav>
  )
}
