// 촬영 방식 고르기(스펙 4.8, M19). 기기 이름(User-Agent)은 보지 않고 터치 화면·카메라 지원·보안 출처만 본다.
// 아이패드 사파리는 Mac UA를 보내지만 maxTouchPoints > 1이라 터치로 잡힌다.

/** 검사에 쓰는 전역값. 시험할 때는 가짜 객체를 넣는다(기본은 window). */
export type CameraGlobals = {
  matchMedia?: (query: string) => { matches: boolean }
  navigator?: { maxTouchPoints?: number; mediaDevices?: { getUserMedia?: unknown } }
  isSecureContext?: boolean
}

/**
 * camera: 앱 안 카메라 화면(터치 + getUserMedia + 보안 출처)
 * pc: 마우스 환경(터치 없음). [사진 파일 고르기]가 기본, 웹캠이 있으면 [카메라로 찍기]도
 * unsupported: 터치 기기인데 getUserMedia가 없거나 보안 출처가 아님 → 버튼 방식으로 대체
 */
export type CaptureBase = 'camera' | 'pc' | 'unsupported'

export function isTouchScreen(g: CameraGlobals): boolean {
  let coarse = false
  try {
    coarse = g.matchMedia?.('(pointer: coarse)').matches === true
  } catch {
    coarse = false
  }
  return coarse || (g.navigator?.maxTouchPoints ?? 0) > 0
}

export function canUseCamera(g: CameraGlobals): boolean {
  return typeof g.navigator?.mediaDevices?.getUserMedia === 'function' && g.isSecureContext === true
}

/** 순수 함수: 같은 전역값이면 늘 같은 답. */
export function detectCaptureMode(g: CameraGlobals): CaptureBase {
  if (!isTouchScreen(g)) return 'pc'
  return canUseCamera(g) ? 'camera' : 'unsupported'
}

export type Facing = 'environment' | 'user'

/** 자동 대체 이유. denied: 권한 거부, notfound: 카메라 없음, unsupported: 지원 안 함, failed: 시작 실패 */
export type CameraFailReason = 'denied' | 'notfound' | 'unsupported' | 'failed'

export function classifyCameraError(e: unknown): CameraFailReason {
  const name = typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'notfound'
    case 'NotSupportedError':
    case 'TypeError':
      return 'unsupported'
    default:
      return 'failed'
  }
}

/** 후면 기본, 해상도 ideal 1920×1080(압축이 긴 변 1280px로 줄인다). ideal이라 웹캠처럼 방향이 없는 카메라도 열린다. */
export function openCameraStream(facing: Facing): Promise<MediaStream> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  if (!md?.getUserMedia || !isSecureContext) {
    return Promise.reject(Object.assign(new Error('getUserMedia 없음'), { name: 'NotSupportedError' }))
  }
  return md.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  })
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}

/** 카메라(videoinput) 개수. 권한 전에는 브라우저에 따라 1개로만 보일 수 있다. */
export async function countVideoInputs(): Promise<number> {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  if (!md?.enumerateDevices || !md.getUserMedia || !isSecureContext) return 0
  try {
    return (await md.enumerateDevices()).filter((d) => d.kind === 'videoinput').length
  } catch {
    return 0
  }
}
