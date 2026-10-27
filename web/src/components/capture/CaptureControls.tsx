// 앱 안 카메라를 못 켰을 때의 안내(스펙 4.8, M19 조각 1). 끼니 화면(D3)의 식사 기록·먹은 후 시트 위쪽에 둔다.
// 사진 버튼은 시트(components/meal/MealSheets.tsx)가 그린다.
import type { CaptureSource } from './useCaptureSource'

const TITLE: Record<string, string> = {
  denied: '카메라 권한이 꺼져 있어요',
  notfound: '카메라를 찾지 못했어요',
  failed: '카메라를 켜지 못했어요',
}

/** 앱 안 카메라를 못 켰을 때 안내 + [다시 시도]. 지원하지 않는 브라우저는 짧은 안내만(다시 시도해도 같다). */
export function CameraHelp({ cap, disabled }: { cap: CaptureSource; disabled?: boolean }) {
  const reason = cap.failReason
  if (!reason) return null
  if (reason === 'unsupported') {
    return (
      <p className="mt-3 rounded-tile bg-surface px-3 py-2 text-sm text-ink">
        이 브라우저에서는 앱 안 카메라를 쓸 수 없어요. 아래 버튼으로 찍거나 골라 주세요.
      </p>
    )
  }
  return (
    <div role="status" className="mt-3 rounded-tile border border-butter bg-butter-soft p-3 text-sm text-ink">
      <p className="font-semibold">{TITLE[reason]}</p>
      {reason === 'denied' ? (
        <>
          <p className="mt-1">아래 버튼으로 찍을 수 있어요. 앱 안 카메라를 쓰려면 권한을 켠 뒤 [다시 시도]를 눌러 주세요.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
            <li>아이폰·아이패드(사파리): 주소창 "aA" → 웹사이트 설정 → 카메라 → 허용. 또는 설정 → 앱 → Safari → 카메라</li>
            <li>안드로이드(크롬): 주소창 왼쪽 아이콘 → 권한 → 카메라 → 허용</li>
            {cap.base === 'pc' && <li>PC(크롬·엣지): 주소창 왼쪽 아이콘 → 카메라 → 허용</li>}
          </ul>
        </>
      ) : (
        <p className="mt-1">
          {reason === 'notfound'
            ? '아래 버튼으로 찍거나 골라 주세요.'
            : '다른 앱이 카메라를 쓰고 있으면 닫고 [다시 시도]를 눌러 주세요. 아래 버튼으로 찍을 수도 있어요.'}
        </p>
      )}
      <button
        type="button"
        onClick={cap.retryCamera}
        disabled={disabled}
        className="focus-ring mt-2 flex min-h-11 w-full items-center justify-center rounded-full border border-butter bg-surface font-semibold text-ink disabled:opacity-50"
      >
        다시 시도
      </button>
    </div>
  )
}
