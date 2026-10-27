// 기록 보기(S10) 달력 아래 줄 오른쪽 항목 선택 [칼로리 | 탄 | 단 | 지](2026-10-27 위쪽에서 옮김, 버튼 높이 44px). 고른 항목은 페이지가 갖고(localStorage 기억도 페이지),
// 달력·아래 섹션(주간 추이·PREMIUM)에 같이 넘긴다. AI 호출 없음.
import { METRICS, METRIC_LABEL, type Metric } from '../../lib/calendar'

/** 화면 읽기·설명 글에 쓰는 항목 이름(버튼 글자 METRIC_LABEL의 긴 이름) */
export const METRIC_NAME: Record<Metric, string> = {
  kcal: '칼로리',
  carbs_g: '탄수화물',
  protein_g: '단백질',
  fat_g: '지방',
}

export default function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  return (
    <div role="group" aria-label="항목 선택" className="ml-auto flex shrink-0 rounded-lg border border-gray-200 p-0.5">
      {METRICS.map((m) => {
        const on = m === value
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            aria-label={METRIC_NAME[m]}
            onClick={() => onChange(m)}
            className={`flex min-h-11 min-w-11 items-center justify-center rounded-md px-1.5 text-sm whitespace-nowrap ${
              on ? 'bg-emerald-600 font-semibold text-white' : 'text-gray-700'
            }`}
          >
            {METRIC_LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}
