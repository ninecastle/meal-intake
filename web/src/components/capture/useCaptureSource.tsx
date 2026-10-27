// S2·S3 공용: 사진을 얻는 방법만 맡는다(스펙 4.8, M19 조각 1). 얻은 사진은 화면의 기존 onPick(file) 경로로 넘긴다.
// 방식: camera(앱 안 카메라 화면) / pc(사진 파일 고르기 + 웹캠이 있으면 카메라로 찍기) / fallback(버튼 방식 자동 대체).
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  countVideoInputs,
  detectCaptureMode,
  type CameraFailReason,
  type CaptureBase,
} from '../../lib/cameraSupport'
import CameraCapture from './CameraCapture'

export type CaptureMode = 'camera' | 'pc' | 'fallback'
/** camera: 앱 안 셔터, album: capture 없는 file input, camera-input: capture=environment file input */
export type PickSource = 'camera' | 'album' | 'camera-input'
export type PickMeta = { source: PickSource }

export type CaptureSource = {
  mode: CaptureMode
  base: CaptureBase
  /** 카메라를 못 켠 이유(대체 화면 안내용). 없으면 null */
  failReason: CameraFailReason | null
  /** PC에 웹캠(videoinput)이 있음 */
  hasWebcam: boolean
  cameraOpen: boolean
  /** 방식별 기본 동작: camera → 카메라 화면, pc → 파일 고르기, fallback → 기기 카메라(capture) */
  take: () => void
  openCamera: () => void
  pickAlbum: () => void
  pickCameraInput: () => void
  /** 권한을 다시 켠 뒤 [다시 시도] */
  retryCamera: () => void
  /** 숨은 file input 두 개 + 열려 있으면 카메라 화면. 화면 아무 곳에 한 번 넣는다. */
  elements: ReactNode
}

export function useCaptureSource(opts: {
  title: string
  hint: string
  onPick: (file: File, meta: PickMeta) => void
  /** 처음 열 때 바로 카메라 화면을 띄운다(camera 방식일 때만) */
  autoOpen?: boolean
  /** 조각 2 자리(먹은 후 겹쳐 보기). 지금은 카메라 화면에 넘기기만 한다. */
  overlaySrc?: string | null
}): CaptureSource {
  const { title, hint, onPick, overlaySrc } = opts
  const [base] = useState<CaptureBase>(() => (typeof window === 'undefined' ? 'pc' : detectCaptureMode(window)))
  const [failReason, setFailReason] = useState<CameraFailReason | null>(() => (base === 'unsupported' ? 'unsupported' : null))
  const [cameraOpen, setCameraOpen] = useState(() => opts.autoOpen === true && base === 'camera')
  const [hasWebcam, setHasWebcam] = useState(false)
  const albumRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (base !== 'pc') return
    let alive = true
    countVideoInputs().then((n) => {
      if (alive) setHasWebcam(n > 0)
    })
    return () => {
      alive = false
    }
  }, [base])

  const mode: CaptureMode = base === 'pc' ? 'pc' : failReason ? 'fallback' : 'camera'

  function openCamera() {
    setFailReason(null)
    setCameraOpen(true)
  }
  const pickAlbum = () => albumRef.current?.click()
  const pickCameraInput = () => cameraInputRef.current?.click()

  function take() {
    if (mode === 'camera') openCamera()
    else if (mode === 'pc') pickAlbum()
    else pickCameraInput()
  }

  function picked(file: File, source: PickSource) {
    setCameraOpen(false)
    onPick(file, { source })
  }

  function failed(reason: CameraFailReason) {
    setCameraOpen(false)
    setFailReason(reason)
  }

  function inputChange(source: PickSource) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (f) picked(f, source)
    }
  }

  const elements = (
    <>
      <input ref={albumRef} type="file" accept="image/*" className="hidden" onChange={inputChange('album')} />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={inputChange('camera-input')}
      />
      {cameraOpen && (
        <CameraCapture
          title={title}
          hint={hint}
          overlaySrc={overlaySrc}
          onShot={(f) => picked(f, 'camera')}
          onAlbum={pickAlbum}
          onClose={() => setCameraOpen(false)}
          onFail={failed}
        />
      )}
    </>
  )

  return {
    mode,
    base,
    failReason,
    hasWebcam,
    cameraOpen,
    take,
    openCamera,
    pickAlbum,
    pickCameraInput,
    retryCamera: openCamera,
    elements,
  }
}

/** 화면 위쪽 안내 한 줄(방식별) */
export function captureSourceHint(cap: CaptureSource): string {
  if (cap.mode === 'camera') return '카메라 화면 왼쪽 아래에서 앨범 사진도 고를 수 있어요.'
  if (cap.mode === 'pc') return cap.hasWebcam ? '사진 파일을 고르거나 카메라로 찍어 주세요.' : '음식 사진 파일을 골라 주세요.'
  return '카메라로 찍거나 앨범에서 골라 주세요.'
}
