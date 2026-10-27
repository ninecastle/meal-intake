// S2·S3 촬영 버튼(방식별)과 카메라 대체 안내(스펙 4.8, M19 조각 1). S2 선택 화면 버튼(조각 2-1).
import type { ReactNode } from 'react'
import type { CaptureSource } from './useCaptureSource'

const PRIMARY =
  'flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 text-lg font-semibold text-white disabled:opacity-50'
const SECONDARY =
  'mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-emerald-600 text-base font-semibold text-emerald-700 disabled:opacity-50'

const MANUAL =
  'mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-gray-300 bg-white text-base font-semibold text-gray-700'

/**
 * S2 처음 선택 화면(2026-10-27 사용자 결정, 카메라 조각 2-1): 방식별 사진 버튼 + [직접 입력].
 * - camera: [카메라로 찍기](앱 안 카메라 화면) / [앨범에서 고르기](capture 없는 input)
 * - pc: [사진 파일 고르기] / 웹캠이 있으면 [카메라로 찍기](같은 카메라 화면)
 * - fallback: [카메라로 찍기](capture=environment) / [앨범에서 고르기]
 * top: 버튼 바로 위 카드 자리. 급식 연동(스펙 4.9) "오늘 ○○ 점심 급식인가요?"가 여기에 들어간다. 비우면 그리지 않는다.
 * gate는 사진 버튼에만 끼운다([직접 입력]은 사진을 보내지 않는다).
 */
export function CaptureChoice({
  cap,
  cameraLabel = '카메라로 찍기',
  disabled,
  gate = (fn) => fn(),
  onManual,
  top,
}: {
  cap: CaptureSource
  /** camera·fallback 방식 주 버튼 글자 */
  cameraLabel?: string
  disabled?: boolean
  gate?: (fn: () => void) => void
  onManual: () => void
  top?: ReactNode
}) {
  const run = (fn: () => void) => () => gate(fn)
  return (
    <section aria-label="기록 방법">
      {top != null && top !== false && <div className="mb-3 space-y-2">{top}</div>}
      {cap.mode === 'pc' ? (
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
      ) : (
        <>
          <button
            type="button"
            onClick={run(cap.mode === 'camera' ? cap.openCamera : cap.pickCameraInput)}
            disabled={disabled}
            className={PRIMARY}
          >
            {cameraLabel}
          </button>
          <button type="button" onClick={run(cap.pickAlbum)} disabled={disabled} className={SECONDARY}>
            앨범에서 고르기
          </button>
        </>
      )}
      <button type="button" onClick={onManual} className={MANUAL}>
        직접 입력
      </button>
    </section>
  )
}

/** S3 평소(오류 없음) 아래 버튼. gate는 S2의 사진 전송 고지 확인처럼 누르기 전에 끼울 동작. */
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
