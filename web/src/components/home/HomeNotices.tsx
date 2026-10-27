// (f) 띠 맨 위 계속 보이는 알림(2026-10-27 사용자 결정): 오프라인·불러오기 오류·저장 대기·탄단지 빠짐·동작 실패.
// 띠 .pad 첫 줄(.bandhead 위)에 시안 .callout 상자 한 줄씩. 문제가 없으면 아무것도 그리지 않는다(시안과 같은 높이).
// "저장했어요" 같은 짧은 알림은 여기가 아니라 시안 토스트(1.6초, HomePage toastText).
export function BandNotices({ items }: { items: (string | false | null | undefined)[] }) {
  const list = items.filter((t): t is string => typeof t === 'string' && t !== '')
  if (list.length === 0) return null
  return (
    <div role="status" style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
      {list.map((t) => (
        <p key={t} className="callout" style={{ margin: 0 }}>
          {t}
        </p>
      ))}
    </div>
  )
}
