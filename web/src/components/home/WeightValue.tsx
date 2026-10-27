// (g) 나의 변화 띠의 체중 줄(조각 D2-S). 체중 기록(D6) 전이라 데이터가 없어 시안 .kg 자리에 "–"만 두고,
// 시안의 .delta("지난 기록보다 …")·.goalw("목표 …kg / 목표까지 …kg") 줄은 그리지 않는다(리더가 사용자에게 묻는 중).
export function WeightValue() {
  return (
    <div className="kg num">
      –<span> kg</span>
      <span className="sr-only">기록 없음</span>
    </div>
  )
}
