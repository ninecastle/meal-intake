// 홈 하늘 띠 "나의 하루"(디자인 조각 D2-H1, 시안 home() .band.sky).
// 링(진행 sky-deep, 바탕 ink/8, 가운데 "목표 N"·먹은 kcal), 탄·단·지 점과 g, 막대 3개(먹은 g / 그날 목표 g),
// 작은 줄 당류·나트륨·식이섬유(값은 D4에서 들어온다. 지금은 "–"), 남은 양 상자("N kcal 더 먹을 수 있어요" / "N kcal 넘었어요").
// 그날 목표가 없으면 막대·남은 양 대신 목표 설정 안내(지금 홈 규칙 그대로). 계산은 analysis/goal.ts의 compareToGoal(AI 호출 없음).
// [한눈에]·[자세히]는 D5 화면이 생길 때까지 부르는 화면이 "준비 중이에요" 토스트를 띄운다(onSoon).
import { Link } from 'react-router'
import { compareToGoal, type GoalTargets } from '../../analysis/goal'
import type { DaySummary } from '../../data/summary'
import { NUTRITION_SOURCE_NOTE, formatKcal, formatMacro } from '../mealText'
import { Band, ChipButton } from '../ui'

/** 그날 비교 목표 상태(HomePage가 subscribeGoalForDate·subscribeGoal로 정한다) */
export type DayGoalView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'targets'; targets: GoalTargets }
  /** 목표를 아직 정하지 않았다 */
  | { kind: 'none' }
  /** 지금 목표는 있지만 이 날은 목표를 정하기 전이다 */
  | { kind: 'before' }

type Props = {
  summary: DaySummary | null
  dayError: boolean
  isToday: boolean
  goal: DayGoalView
  onSoon: () => void
}

// 스펙 4.7절 고지(GoalPage와 같은 문구)
const GOAL_DISCLAIMER =
  '이 목표는 일반 공식(Mifflin-St Jeor)으로 계산한 참고값이며 의학적 조언이 아니에요. 질환이 있거나 임신·수유 중이면 전문가와 상의하세요.'

const MACROS = [
  { k: 'carbs_g', label: '탄수화물', color: 'bg-carb' },
  { k: 'protein_g', label: '단백질', color: 'bg-prot' },
  { k: 'fat_g', label: '지방', color: 'bg-fat' },
] as const

// 시안 링: viewBox 170, 반지름 72, 두께 16
const R = 72
const L = 2 * Math.PI * R

function Ring({ kcal, target }: { kcal: number; target: number | null }) {
  const frac = target != null && target > 0 ? Math.min(Math.max(kcal / target, 0), 1) : 0
  const label = `먹은 양 ${formatKcal(kcal)}kcal${target != null ? `, 목표 ${formatKcal(target)}kcal` : ''}`
  return (
    <div role="img" aria-label={label} className="relative size-[170px] max-[380px]:size-[150px]">
      <svg viewBox="0 0 170 170" aria-hidden="true" className="size-full -rotate-90">
        <circle cx="85" cy="85" r={R} strokeWidth="16" fill="none" className="stroke-ink/8" />
        {frac > 0 && (
          <circle
            cx="85"
            cy="85"
            r={R}
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${L * frac} ${L}`}
            className="stroke-sky-deep"
          />
        )}
      </svg>
      <div aria-hidden="true" className="absolute inset-0 grid place-content-center pt-2 text-center">
        <span className="num mb-3 text-[14px] text-ink-2">{target != null ? `목표 ${formatKcal(target)}` : '먹은 양'}</span>
        <span className="num text-[46px] leading-none max-[380px]:text-[38px]">{formatKcal(kcal)}</span>
        <span className="text-[18px] text-ink-2">kcal</span>
      </div>
    </div>
  )
}

function Bars({ summary, targets }: { summary: DaySummary; targets: GoalTargets }) {
  const rows = compareToGoal(summary.totals, targets)
  return (
    <div className="mt-6 grid grid-cols-3 gap-3.5">
      {MACROS.map(({ k, label, color }) => {
        const row = rows[k]
        const overText = row.remaining < 0 ? formatMacro(-row.remaining) : '0'
        const over = overText !== '0'
        // 목표가 0인데 먹었으면 넘은 것으로 꽉 채운다.
        const pct = Math.round((over ? 1 : Math.min(Math.max(row.ratio, 0), 1)) * 100)
        const status = over ? `${overText}g 초과` : `남은 양 ${formatMacro(Math.max(row.remaining, 0))}g`
        return (
          <div key={k} className="min-w-0">
            <div className="mb-1.5 text-[15px] text-ink-2">{label}</div>
            <div
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${formatMacro(row.eaten)} / ${formatMacro(row.target)}g, ${status}`}
              className="h-2 overflow-hidden rounded-full bg-ink/8"
            >
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="num mt-1.5 block text-[19px]">
              {formatMacro(row.eaten)} <span className="text-ink-3">/ {formatMacro(row.target)}g</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Remain({ summary, targets }: { summary: DaySummary; targets: GoalTargets }) {
  const left = targets.target_kcal - summary.totals.kcal
  // 보이는 자리에서 0이 되는 초과(예: 0.3kcal)는 초과로 치지 않는다.
  const overText = left < 0 ? formatKcal(-left) : '0'
  const over = overText !== '0'
  return (
    <p className="mt-[22px] rounded-tile bg-surface px-4 py-3.5 text-center text-[17px]">
      {over ? (
        <>
          <span className="num text-[24px] text-peach-deep">{overText} kcal</span> 넘었어요
        </>
      ) : (
        <>
          <span className="num text-[24px] text-lime-deep">{formatKcal(Math.max(left, 0))} kcal</span> 더 먹을 수 있어요
        </>
      )}
    </p>
  )
}

/** 세부 영양소 작은 줄. 값은 D4(식약처 실제 값·호출 A 추정값)에서 들어온다. 그전에는 "–"(가짜 숫자 금지) */
function Minor() {
  return (
    <p className="mt-3 flex flex-wrap justify-center gap-x-[18px] text-[15px] text-ink-2">
      {['당류', '나트륨', '식이섬유'].map((n) => (
        <span key={n} className="whitespace-nowrap">
          {n} <span aria-hidden="true" className="num">–</span>
          <span className="sr-only">값 없음</span>
        </span>
      ))}
    </p>
  )
}

function GoalGuide({ goal }: { goal: DayGoalView }) {
  if (goal.kind === 'error') {
    return (
      <Link
        to="/goal"
        state={{ fromHome: true }}
        className="focus-ring mt-[22px] flex min-h-11 items-center justify-center rounded-tile bg-butter-soft px-4 text-[15px] text-ink"
      >
        목표를 불러오지 못했어요 ·<span className="ml-1 underline">목표 설정</span>
      </Link>
    )
  }
  if (goal.kind === 'none') {
    return (
      <Link to="/goal" state={{ fromHome: true }} className="focus-ring mt-[22px] block rounded-tile bg-surface px-4 py-3.5">
        <span className="block text-[17px] text-ink">목표 설정하기 ›</span>
        <span className="mt-1 block text-[13px] text-ink-2">
          키·몸무게·활동량을 넣으면 하루 목표 칼로리와 탄·단·지를 추천해 드려요.
        </span>
      </Link>
    )
  }
  if (goal.kind === 'before') {
    return <p className="mt-3 text-center text-[13px] text-ink-2">이 날은 목표를 정하기 전이라 합계만 보여요</p>
  }
  return null
}

export default function DayBand({ summary, dayError, isToday, goal, onSoon }: Props) {
  const targets = goal.kind === 'targets' ? goal.targets : null
  return (
    <Band
      tone="sky"
      title="나의 하루"
      action={
        <div className="flex gap-1.5">
          <ChipButton onClick={onSoon}>한눈에</ChipButton>
          <ChipButton dark onClick={onSoon}>
            자세히
          </ChipButton>
        </div>
      }
    >
      {dayError && (
        <p className="mb-3 rounded-tile bg-butter-soft px-4 py-2.5 text-[15px] text-ink">
          요약을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
        </p>
      )}
      {summary ? (
        <>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 max-[380px]:gap-4">
            <Ring kcal={summary.totals.kcal} target={targets ? targets.target_kcal : null} />
            <dl aria-label={`${isToday ? '오늘' : '이 날'} 먹은 탄·단·지`} className="grid gap-2.5">
              {MACROS.map(({ k, label, color }) => (
                <div key={k} className="flex items-center gap-2 text-[17px]">
                  <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${color}`} />
                  <dt className="whitespace-nowrap">{label}</dt>
                  <dd className="num ml-auto whitespace-nowrap text-[28px]">
                    {formatMacro(summary.totals[k])}
                    <small className="text-[15px] text-ink-2">g</small>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {targets && <Bars summary={summary} targets={targets} />}
          <Minor />
          {targets ? <Remain summary={summary} targets={targets} /> : <GoalGuide goal={goal} />}
          <div className="mt-4 space-y-1.5 text-[13px] text-ink-2">
            {summary.incompleteMacros && (
              <p className="inline-block rounded-chip bg-butter-soft px-2.5 py-1 text-ink">일부 음식의 탄·단·지가 빠져 있어요</p>
            )}
            {summary.hasPendingWrites && <p>저장 대기 중(연결되면 올라가요)</p>}
            {targets && <p>{GOAL_DISCLAIMER}</p>}
            {summary.meals.length > 0 && <p>{NUTRITION_SOURCE_NOTE}. DB에 없는 음식은 AI 추정값이에요.</p>}
          </div>
        </>
      ) : (
        !dayError && <p className="py-16 text-center text-ink-2">불러오는 중…</p>
      )}
    </Band>
  )
}
