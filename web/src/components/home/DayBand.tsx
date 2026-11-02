// 홈 하늘 띠 "나의 하루"(조각 D2-S, 시안 home() section.band.sky 마크업·클래스 그대로):
// (알림 .callout) → .bandhead(h2 + .seg-mini [한눈에][자세히]) → .summary(.ring 링 R=72 두께 16 + .center, .ratio 탄·단·지) → .bars → .minor → .remain.
// 숫자만 실제 데이터(그날 done 합산, 그날 목표). 시안처럼 링 가운데 큰 숫자·막대 숫자는 쉼표 없이, "목표 N"·남은 양은 쉼표.
// 글자는 시안처럼 한 텍스트 노드로 만든다(노드가 나뉘면 글자 사이 간격이 미세하게 달라진다). 링 진행은 시안과 같이 화면에 보이는 정수 kcal / 목표로 계산한다(stroke-dasharray `${L*frac} ${L}`).
// 세부 영양소(.minor)는 D4 전이라 "–"(가짜 숫자 금지). 계산은 analysis/goal.ts의 compareToGoal(AI 호출 없음).
// 목표 없음·정하기 전·초과는 (d) GoalStates, 계속 보이는 알림은 (f) BandNotices(띠 맨 위 .callout, 2026-10-27 사용자 결정).
// [한눈에]·[자세히]는 D5 화면(/glance·/detail)으로 간다(onGlance·onDetail, 부르는 화면이 그 날짜로 push).
import { useLayoutEffect, useRef, useState } from 'react'
import { compareToGoal, type GoalTargets } from '../../analysis/goal'
import type { DaySummary, DetailSummary } from '../../data/summary'
import { formatDetail, formatKcal } from '../mealText'
import { Band, ChipButton } from '../ui'
import { GoalOverRemain, NoGoalRemain } from './GoalStates'
import { BandNotices } from './HomeNotices'

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
  online: boolean
  onGlance: () => void
  onDetail: () => void
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
  const k = Math.round(kcal)
  // 시안 frac=Math.min(t.k/goal.kcal,1)
  const frac = target != null && target > 0 ? Math.min(Math.max(k / target, 0), 1) : 0
  const label = `먹은 양 ${formatKcal(k)}kcal${target != null ? `, 목표 ${formatKcal(target)}kcal` : ''}`
  return (
    <div className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 170 170" aria-hidden="true">
        <circle cx="85" cy="85" r={R} stroke="rgba(31,42,46,.08)" strokeWidth="16" fill="none" />
        {/* 목표가 없거나 0kcal이면 바탕 원만(둥근 끝이 점으로 남지 않게) */}
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
        <span className="sub num">{`목표 ${target != null ? formatKcal(target) : '–'}`}</span>
        <span className="big num">{k}</span>
        <span className="unit">kcal</span>
      </div>
    </div>
  )
}

function Bars({ summary, targets }: { summary: DaySummary; targets: GoalTargets | null }) {
  const rows = targets ? compareToGoal(summary.totals, targets) : null
  return (
    <div className="bars">
      {MACROS.map(({ k, label, color }) => {
        const eaten = summary.totals[k]
        const row = rows?.[k]
        // 시안 Math.min(v/g*100,100). 목표가 0인데 먹었으면 넘은 것으로 꽉 채운다. 목표가 없으면 채움 없음.
        const pct = row ? (row.remaining < 0 ? 100 : Math.min(Math.max(row.ratio, 0), 1) * 100) : 0
        const goalText = row ? String(Math.round(row.target)) : '–'
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
              aria-valuetext={`${Math.round(eaten)} / ${goalText}g`}
            >
              {row && <div className="fill" style={{ width: `${pct}%`, background: color }}></div>}
            </div>
            <span className="num">
              {`${Math.round(eaten)} `}
              <span>{`/ ${goalText}g`}</span>
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
      <span className="num">{`${formatKcal(Math.max(left, 0))} kcal`}</span> 더 먹을 수 있어요
    </div>
  )
}

/** 글자 폭(px). Range로 재므로 줄바꿈·flex 늘림과 상관없이 내용 폭이다 */
function textWidth(n: Node): number {
  const r = document.createRange()
  r.selectNodeContents(n)
  return r.getBoundingClientRect().width
}

/**
 * 사용자가 고른 변경 (8): .ratio 세 줄(점·이름·숫자) 가운데 하나라도 한 줄에 안 들어가면 true.
 * 그때는 세 줄 모두 숫자를 아래 줄 오른쪽에 둔다(index.css .ratio.stacked). 폭이 바뀌거나 글꼴(Pretendard)이 늦게 들어와도 다시 잰다.
 */
function useStackedRatio(dep: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => {
      const need = [...el.children].some((row) => {
        const dot = row.querySelector('.dot')
        const num = row.querySelector('.num')
        const label = [...row.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
        if (!dot || !num || !label) return false
        const gap = parseFloat(getComputedStyle(row).columnGap) || 0
        const total = dot.getBoundingClientRect().width + gap + textWidth(label) + gap + textWidth(num)
        // 줄(div)은 한 줄 글자 폭만큼 늘어날 수 있으므로 바깥 칸(.ratio) 폭과 비교한다
        return total > el.clientWidth + 0.5
      })
      setStacked(need)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    let alive = true
    document.fonts?.ready.then(() => alive && check())
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [dep])
  return { ref, stacked }
}

const MINOR = [
  ['당류', 'sugar_g'],
  ['식이섬유', 'fiber_g'],
  ['나트륨', 'sodium_mg'],
] as const

/** 시안 .minor(당류·식이섬유·나트륨, D4): 그날 값이 있는 음식만 더한 합. 값 있는 음식이 없으면 "–"(가짜 숫자 금지).
 *  "음식 ○개 중 ○개 기준"과 "추정"은 자리가 없어 끼니 화면 [자세히]·영양소 상세에서 보인다 */
function Minor({ detail }: { detail: DetailSummary }) {
  return (
    <div className="minor">
      {MINOR.map(([n, k]) => {
        const t = detail.totals[k]
        return (
          <span key={k}>
            {n} <b className="num">{t ? formatDetail(k, t.value) : '–'}</b>
          </span>
        )
      })}
    </div>
  )
}

export default function DayBand({ summary, dayError, isToday, goal, online, onGlance, onDetail }: Props) {
  const targets = goal.kind === 'targets' ? goal.targets : null
  const { ref: ratioRef, stacked } = useStackedRatio(summary ? MACROS.map(({ k }) => summary.totals[k]).join('|') : '')
  const notices = [
    !online && '오프라인이에요. 기록은 연결되면 저장돼요.',
    dayError && '요약을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.',
    goal.kind === 'error' && '목표를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.',
    summary?.hasPendingWrites && '저장 대기 중이에요. 연결되면 올라가요.',
    summary?.incompleteMacros && '일부 음식의 탄·단·지가 빠져 있어요.',
  ]
  return (
    <Band
      tone="sky"
      label={isToday ? '오늘 요약' : '그날 요약'}
      title="나의 하루"
      notice={<BandNotices items={notices} />}
      action={
        <div className="seg-mini">
          <ChipButton onClick={onGlance}>한눈에</ChipButton>
          <ChipButton dark onClick={onDetail}>
            자세히
          </ChipButton>
        </div>
      }
    >
      {summary ? (
        <>
          {/* 사용자가 고른 변경 (15): 띠가 늘어난 만큼 구성 사이 빈 칸(.bgap)에 나눈다(막대↔당류 줄은 반 몫) */}
          <div className="bgap" aria-hidden="true"></div>
          <div className="summary">
            <Ring kcal={summary.totals.kcal} target={targets ? targets.target_kcal : null} />
            <div ref={ratioRef} className={stacked ? 'ratio stacked' : 'ratio'}>
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
          <div className="bgap" aria-hidden="true"></div>
          <Bars summary={summary} targets={targets} />
          <div className="bgap half" aria-hidden="true"></div>
          <Minor detail={summary.detail} />
          <div className="bgap" aria-hidden="true"></div>
          {targets ? (
            <Remain summary={summary} targets={targets} />
          ) : (
            <NoGoalRemain kind={goal.kind === 'targets' ? 'loading' : goal.kind} />
          )}
        </>
      ) : (
        !dayError && <p style={{ margin: 0, padding: '64px 0', textAlign: 'center', color: 'var(--ink-2)' }}>불러오는 중…</p>
      )}
    </Band>
  )
}
