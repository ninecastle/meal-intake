// 하루 요약(S1)의 목표 대비 막대(3단계 조각 3, 스펙 4.7절 "하루 요약(S1) 목표 비교").
// 칼로리·탄수화물·단백질·지방 네 줄: "먹은 양 / 목표", 막대 길이 min(ratio, 1), "남은 양 ○○" 또는 "○○ 초과"(막대 주황).
// 계산은 analysis/goal.ts의 compareToGoal을 그대로 쓴다(남은 양 = 그날 목표 − 합계). AI 호출 없음.
import { compareToGoal, type GoalCompareKey, type GoalCompareRow, type GoalTargets } from '../analysis/goal'
import type { Nutrients } from '../types/analysis'
import { formatKcal, formatMacro } from './mealText'

const ROWS: { k: GoalCompareKey; label: string; fmt: (n: number) => string; unit: string }[] = [
  { k: 'kcal', label: '칼로리', fmt: formatKcal, unit: 'kcal' },
  { k: 'carbs_g', label: '탄수화물', fmt: formatMacro, unit: 'g' },
  { k: 'protein_g', label: '단백질', fmt: formatMacro, unit: 'g' },
  { k: 'fat_g', label: '지방', fmt: formatMacro, unit: 'g' },
]

function Row({ label, row, fmt, unit }: { label: string; row: GoalCompareRow; fmt: (n: number) => string; unit: string }) {
  // 보이는 자리에서 0이 되는 초과(예: 0.3kcal)는 초과로 치지 않는다.
  const overText = row.remaining < 0 ? fmt(-row.remaining) : '0'
  const over = overText !== '0'
  const status = over ? `${overText}${unit} 초과` : `남은 양 ${fmt(Math.max(row.remaining, 0))}${unit}`
  // 목표가 0인데 먹었으면 ratio가 0이라도 넘은 것으로 꽉 채운다.
  const filled = over ? 1 : Math.min(Math.max(row.ratio, 0), 1)
  const pct = Math.round(filled * 100)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-600">
          <span className="font-semibold text-gray-900">{fmt(row.eaten)}</span> / {fmt(row.target)}
          {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${fmt(row.eaten)} / ${fmt(row.target)}${unit}, ${status}`}
        className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100"
      >
        <div className={`h-full rounded-full ${over ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-0.5 text-right text-xs ${over ? 'font-semibold text-orange-700' : 'text-gray-600'}`}>{status}</p>
    </li>
  )
}

export default function GoalBars({ consumed, targets }: { consumed: Nutrients; targets: GoalTargets }) {
  const rows = compareToGoal(consumed, targets)
  return (
    <ul className="mt-2 space-y-3">
      {ROWS.map(({ k, label, fmt, unit }) => (
        <Row key={k} label={label} row={rows[k]} fmt={fmt} unit={unit} />
      ))}
    </ul>
  )
}
