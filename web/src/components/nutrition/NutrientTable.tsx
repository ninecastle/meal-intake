// 시안 nutrientTable(영양정보 표). 끼니 화면 [자세히] 시트(D3)와 영양소 상세 [영양정보] 탭(D5)이 함께 쓴다.
// 행 순서는 시안 그대로, 대체감미료만 뺀다(2026-10-28 사용자 결정). 글자 크기는 index.css(사용자가 고른 변경 10).
import type { DetailSummary } from '../../data/summary'
import type { DetailKey } from '../../types/analysis'
import { formatDetail } from '../mealText'

const r1 = (n: number) => Math.round(n * 10) / 10

/** 표 위쪽 탄단지·열량(먹은 양 합) */
export type NutrientTotals = { kcal: number; carbs_g: number; protein_g: number; fat_g: number }

/** 세부 영양소 한 줄(D4): 값이 있는 음식만 더한 합, 일부 음식만 값이 있으면 "음식 ○개 중 ○개 기준". "추정" 배지는 붙이지 않는다(2026-10-28 사용자 결정) */
function DetailRow({ label, k, detail, sub }: { label: string; k: DetailKey; detail: DetailSummary; sub: boolean }) {
  const t = detail.totals[k]
  return (
    <div className={sub ? 'nrow sub' : 'nrow'}>
      <span>
        {label}
        {t && t.count < detail.items && (
          <small style={{ marginLeft: 6, fontSize: 13, color: 'var(--ink-3)' }}>{`음식 ${detail.items}개 중 ${t.count}개 기준`}</small>
        )}
      </span>
      {t ? (
        <span className="num">{formatDetail(k, t.value, true)}</span>
      ) : (
        <span className="num">–</span>
      )}
    </div>
  )
}

/** 시안 nutrientTable(t, true)의 행 순서 그대로, 대체감미료만 뺀다(2026-10-28 사용자 결정). 세부 아홉 가지는 D4 합계(값 있는 음식만, 없으면 "–") */
export function NutrientTable({ t, detail }: { t: NutrientTotals; detail: DetailSummary }) {
  return (
    <div className="ntable">
      <div className="nrow total">
        <span>총 열량</span>
        <span className="num">{`${Math.round(t.kcal)} kcal`}</span>
      </div>
      <div className="nrow">
        <span>탄수화물</span>
        <span className="num">{`${r1(t.carbs_g)} g`}</span>
      </div>
      <DetailRow label="당류" k="sugar_g" detail={detail} sub />
      <DetailRow label="식이섬유" k="fiber_g" detail={detail} sub />
      <div className="nrow">
        <span>단백질</span>
        <span className="num">{`${r1(t.protein_g)} g`}</span>
      </div>
      <div className="nrow">
        <span>지방</span>
        <span className="num">{`${r1(t.fat_g)} g`}</span>
      </div>
      <DetailRow label="포화지방" k="satfat_g" detail={detail} sub />
      <DetailRow label="트랜스지방" k="transfat_g" detail={detail} sub />
      <DetailRow label="다불포화지방" k="polyunsat_g" detail={detail} sub />
      <DetailRow label="단일불포화지방" k="monounsat_g" detail={detail} sub />
      <DetailRow label="콜레스테롤" k="cholesterol_mg" detail={detail} sub={false} />
      <DetailRow label="나트륨" k="sodium_mg" detail={detail} sub={false} />
      <DetailRow label="칼륨" k="potassium_mg" detail={detail} sub={false} />
    </div>
  )
}
