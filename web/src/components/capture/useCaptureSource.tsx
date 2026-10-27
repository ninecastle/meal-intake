// 끼니 화면(D3, 예전 S2·S3)의 사진을 얻는 방법만 맡는다(스펙 4.8, M19 조각 1). 얻은 사진은 화면의 기존 onPick(file) 경로로 넘긴다.
// 방식: camera(앱 안 카메라 화면) / pc(사진 파일 고르기 + 웹캠이 있으면 카메라로 찍기) / fallback(버튼 방식 자동 대체).
// 카메라 화면은 방문 기록 한 칸이다(조각 3): 열 때 같은 주소를 location.state[CAMERA_STATE_KEY]=true로 push하고,
// 닫을 때(X·셔터·카메라 안 사진첩·실패) navigate(-1)로 그 칸을 뺀다. 기기·브라우저 뒤로 가기도 같은 칸을 빼므로 카메라만 닫힌다.
// 셔터·사진첩 사진과 실패 처리는 칸이 실제로 빠진 뒤(location이 바뀐 effect)에 이어서 한다. 바로 넘기면 분석 뒤
// navigate(replace)가 아직 남은 카메라 칸을 바꿔 버리고, 늦게 온 popstate가 이 화면으로 되돌리는 경쟁이 생긴다.
// 새로고침·앞으로 가기로 키만 남은 칸은 열지 않고 replace로 키를 지운다(카메라는 저절로 켜지지 않음).
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
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

/** 카메라 화면이 열린 방문 기록 칸 표시(location.state 안 키) */
const CAMERA_STATE_KEY = 'captureCamera'

function stateRecord(s: unknown): Record<string, unknown> | null {
  return s && typeof s === 'object' && !Array.isArray(s) ? (s as Record<string, unknown>) : null
}
function hasCameraKey(s: unknown): boolean {
  return stateRecord(s)?.[CAMERA_STATE_KEY] === true
}

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
  /** 먹은 후 겹쳐 보기용 먹기 전 사진 주소(조각 2). 카메라 화면(PC 웹캠 포함)에만 그리고, 파일 고르기·대체 방식에는 없다. */
  overlaySrc?: string | null
}): CaptureSource {
  const { title, hint, onPick, overlaySrc } = opts
  const [base] = useState<CaptureBase>(() => (typeof window === 'undefined' ? 'pc' : detectCaptureMode(window)))
  const [failReason, setFailReason] = useState<CameraFailReason | null>(() => (base === 'unsupported' ? 'unsupported' : null))
  const location = useLocation()
  const navigate = useNavigate()
  // 이 화면 인스턴스가 카메라 칸을 직접 넣었음. 처음에는 항상 닫혀 있다(조각 2-1: S2도 [카메라로 찍기]를 눌러야 연다).
  const openedRef = useRef(false)
  // navigate(-1)을 보냈고 칸이 아직 빠지지 않음(두 번 닫기 방지)
  const closingRef = useRef(false)
  // 칸이 빠진 뒤 이어서 할 일(사진 넘기기·실패 표시)
  const afterCloseRef = useRef<(() => void) | null>(null)
  const seenKeyRef = useRef<string | null>(null)
  const onPickRef = useRef(onPick)
  const cameraOpen = hasCameraKey(location.state) && openedRef.current
  const [hasWebcam, setHasWebcam] = useState(false)
  const albumRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onPickRef.current = onPick
  })

  // 위치가 바뀔 때마다: 카메라 칸이 빠졌으면 남은 일을 잇고, 직접 열지 않은 카메라 칸이면 키를 지운다.
  useEffect(() => {
    if (seenKeyRef.current === location.key) return
    seenKeyRef.current = location.key
    if (hasCameraKey(location.state)) {
      if (openedRef.current) return
      const rest = { ...stateRecord(location.state) }
      delete rest[CAMERA_STATE_KEY]
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: Object.keys(rest).length > 0 ? rest : null },
      )
      return
    }
    openedRef.current = false
    closingRef.current = false
    const next = afterCloseRef.current
    afterCloseRef.current = null
    next?.()
  }, [location, navigate])

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
    if (cameraOpen || closingRef.current) return
    openedRef.current = true
    // S3는 location.state(AfterPageState)를 쓰므로 기존 state에 키만 더한다. S2의 ?date=도 유지한다.
    navigate(
      { pathname: location.pathname, search: location.search },
      { state: { ...stateRecord(location.state), [CAMERA_STATE_KEY]: true } },
    )
  }

  /** 카메라가 열려 있으면 그 칸을 빼고, 빠진 뒤 then을 한다. 열려 있지 않으면(PC 파일·대체 방식) 바로 한다. */
  function closeCamera(then?: () => void) {
    if (!cameraOpen) {
      then?.()
      return
    }
    if (closingRef.current) return
    closingRef.current = true
    afterCloseRef.current = then ?? null
    navigate(-1)
  }
  const pickAlbum = () => albumRef.current?.click()
  const pickCameraInput = () => cameraInputRef.current?.click()

  function take() {
    if (mode === 'camera') openCamera()
    else if (mode === 'pc') pickAlbum()
    else pickCameraInput()
  }

  function picked(file: File, source: PickSource) {
    closeCamera(() => onPickRef.current(file, { source }))
  }

  function failed(reason: CameraFailReason) {
    closeCamera(() => setFailReason(reason))
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
          onClose={() => closeCamera()}
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

