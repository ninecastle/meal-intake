// S2·S3 촬영 버튼(방식별)과 카메라 대체 안내(스펙 4.8, M19 조각 1).
import type { CaptureSource } from './useCaptureSource'

const PRIMARY =
  'flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-50'
const SECONDARY =
  'mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-emerald-600 text-base font-semibold text-emerald-700 disabled:opacity-50'

/** 평소(오류 없음) 아래 버튼. gate는 S2의 사진 전송 고지 확인처럼 누르기 전에 끼울 동작. */
export function CaptureButtons({
  cap,
  cameraLabel,
  disabled,
  gate = (fn) => fn(),
}: {
  cap: CaptureSource
  /** camera 방식 주 버튼 글자(카메라 화면을 연다) */
  cameraLabel: string
  disabled?: boolean
  gate?: (fn: () => void) => void
}) {
  const run = (fn: () => void) => () => gate(fn)
  if (cap.mode === 'camera') {
    return (
      <button type="button" onClick={run(cap.openCamera)} disabled={disabled} className={PRIMARY}>
        {cameraLabel}
      </button>
    )
  }
  if (cap.mode === 'pc') {
    return (
      <>
        <button type="button" onClick={run(cap.pickAlbum)} disabled={disabled} className={PRIMARY}>
          사진 파일 고르기
        </button>
        {cap.hasWebcam && (
          <button type="button" onClick={run(cap.openCamera)} disabled={disabled} className={SECONDARY}>
            카메라로 찍기
          </button>
        )}
      </>
    )
  }
  return (
    <>
      <button type="button" onClick={run(cap.pickCameraInput)} disabled={disabled} className={PRIMARY}>
        카메라로 찍기
      </button>
      <button type="button" onClick={run(cap.pickAlbum)} disabled={disabled} className={SECONDARY}>
        앨범에서 고르기
      </button>
    </>
  )
}

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
      <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
        이 브라우저에서는 앱 안 카메라를 쓸 수 없어요. 아래 버튼으로 찍거나 골라 주세요.
      </p>
    )
  }
  return (
    <div role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">{TITLE[reason]}</p>
      {reason === 'denied' ? (
        <>
          <p className="mt-1">아래 버튼으로 찍을 수 있어요. 앱 안 카메라를 쓰려면 권한을 켠 뒤 [다시 시도]를 눌러 주세요.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
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
        className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border border-amber-400 bg-white font-semibold text-amber-900 disabled:opacity-50"
      >
        다시 시도
      </button>
    </div>
  )
}
