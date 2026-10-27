// 홈 하늘 띠 "나의 하루"(조각 D2-S, 시안 home() section.band.sky 마크업·클래스 그대로):
// .bandhead(h2 + .seg-mini [한눈에][자세히]) → .summary(.ring 링 R=72 두께 16 + .center, .ratio 탄·단·지) → .bars → .minor → .remain.
// 숫자만 실제 데이터(그날 done 합산, 그날 목표). 시안처럼 링 가운데 큰 숫자·끼니 kcal·막대 숫자는 쉼표 없이, "목표 N"·남은 양은 쉼표.
// 세부 영양소(.minor)는 D4 전이라 "–"(가짜 숫자 금지). 계산은 analysis/goal.ts의 compareToGoal(AI 호출 없음).
// 목표 없음·정하기 전·초과는 (d) GoalStates, 고지·출처 문구는 (a) HomeFinePrint, 오류·저장 대기는 (f) HomeNotices.
// [한눈에]·[자세히]는 D5 화면이 생길 때까지 부르는 화면이 "준비 중이에요" 토스트를 띄운다(onSoon).
import { compareToGoal, type GoalTargets } from '../../analysis/goal'
import type { DaySummary } from '../../data/summary'
import { formatKcal } from '../mealText'
import { Band, ChipButton } from '../ui'
import { GoalGuide, GoalOverRemain, NoGoalRingLabel } from './GoalStates'
import { HomeFinePrint } from './HomeFinePrint'
import { DayDataNotes, DayLoadError } from './HomeNotices'

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

const MACROS = [
  { k: 'carbs_g', label: '탄수화물', color: 'var(--carb)' },
  { k: 'protein_g', label: '단백질', color: 'var(--prot)' },
  { k: 'fat_g', label: '지방', color: 'var(--fat)' },
] as const

// 시안 링: viewBox 170, 반지름 72, 두께 16
const R = 72
const L = 2 * Math.PI * R

/** 시안 r1: 소수 한 자리 */
const r1 = (n: number) => Math.round(n * 10) / 10

function Ring({ kcal, target }: { kcal: number; target: number | null }) {
  const frac = target != null && target > 0 ? Math.min(Math.max(kcal / target, 0), 1) : 0
  const label = `먹은 양 ${formatKcal(kcal)}kcal${target != null ? `, 목표 ${formatKcal(target)}kcal` : ''}`
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 170 170" aria-hidden="true">
        <circle cx="85" cy="85" r={R} stroke="rgba(31,42,46,.08)" strokeWidth="16" fill="none" />
        {/* 0kcal이면 둥근 끝이 점으로 남아 그리지 않는다 */}
        {frac > 0 && (
          <circle
            cx="85"
            cy="85"
            r={R}
            stroke="var(--sky-deep)"
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${L * frac} ${L}`}
          />
        )}
      </svg>
      <div className="center" aria-hidden="true">
        <span className="sub num">{target != null ? `목표 ${formatKcal(target)}` : <NoGoalRingLabel />}</span>
        <span className="big num">{Math.round(kcal)}</span>
        <span className="unit">kcal</span>
      </div>
    </div>
  )
}

function Bars({ summary, targets }: { summary: DaySummary; targets: GoalTargets }) {
  const rows = compareToGoal(summary.totals, targets)
  return (
    <div className="bars">
      {MACROS.map(({ k, label, color }) => {
        const row = rows[k]
        const over = row.remaining < 0
        // 시안 Math.min(v/g*100,100). 목표가 0인데 먹었으면 넘은 것으로 꽉 채운다.
        const pct = over ? 100 : Math.min(Math.max(row.ratio, 0), 1) * 100
        return (
          <div className="bar" key={k}>
            <label>{label}</label>
            <div
              className="track"
              role="progressbar"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              aria-valuetext={`${Math.round(row.eaten)} / ${Math.round(row.target)}g`}
            >
              <div className="fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="num">
              {Math.round(row.eaten)} <span>/ {Math.round(row.target)}g</span>
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
  if (overText !== '0') return <GoalOverRemain overText={overText} />
  return (
    <div className="remain">
      <span className="num">{formatKcal(Math.max(left, 0))} kcal</span> 더 먹을 수 있어요
    </div>
  )
}

/** 시안 .minor(당류·식이섬유·나트륨). 값은 D4(식약처 실제 값)에서 들어온다. 그전에는 "–"(가짜 숫자 금지) */
function Minor() {
  return (
    <div className="minor">
      {['당류', '식이섬유', '나트륨'].map((n) => (
        <span key={n}>
          {n} <b className="num">–</b>
        </span>
      ))}
    </div>
  )
}

export default function DayBand({ summary, dayError, isToday, goal, onSoon }: Props) {
  const targets = goal.kind === 'targets' ? goal.targets : null
  return (
    <Band
      tone="sky"
      label={isToday ? '오늘 요약' : '그날 요약'}
      title="나의 하루"
      action={
        <div className="seg-mini">
          <ChipButton onClick={onSoon}>한눈에</ChipButton>
          <ChipButton dark onClick={onSoon}>
            자세히
          </ChipButton>
        </div>
      }
    >
      {dayError && <DayLoadError />}
      {summary ? (
        <>
          <div className="summary">
            <Ring kcal={summary.totals.kcal} target={targets ? targets.target_kcal : null} />
            <div className="ratio">
              {MACROS.map(({ k, label, color }) => (
                <div key={k}>
                  <span className="dot" style={{ background: color }}></span>
                  {label}
                  <span className="num">
                    {r1(summary.totals[k])}
                    <small>g</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {targets && <Bars summary={summary} targets={targets} />}
          <Minor />
          {targets ? <Remain summary={summary} targets={targets} /> : <GoalGuide goal={goal} />}
          <DayDataNotes incompleteMacros={summary.incompleteMacros} hasPendingWrites={summary.hasPendingWrites} />
          <HomeFinePrint goal={targets != null} source={summary.meals.length > 0} />
        </>
      ) : (
        !dayError && <p style={{ padding: '64px 0', textAlign: 'center', color: 'var(--ink-2)' }}>불러오는 중…</p>
      )}
    </Band>
  )
}
