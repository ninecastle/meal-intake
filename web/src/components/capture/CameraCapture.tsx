// 앱 안 카메라 화면(스펙 4.8, M19 조각 1). 전체 화면 미리보기 + 가운데 셔터 + 왼쪽 아래 사진첩 + 전환.
// 세로면 셔터 줄이 아래, 가로(태블릿·PC)면 오른쪽 세로 줄. 셔터를 누르면 지금 프레임을 원래 해상도 canvas로 떠서
// JPEG File로 넘긴다(EXIF 없음, 날짜·끼니는 지금 시각 그대로). 카메라는 셔터 직후·화면을 떠날 때·백그라운드일 때 끈다.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  classifyCameraError,
  countVideoInputs,
  openCameraStream,
  stopStream,
  type CameraFailReason,
  type Facing,
} from '../../lib/cameraSupport'
import { PHOTO_NOTICE } from './captureText'

export type CameraCaptureProps = {
  title: string
  hint: string
  /** 셔터로 찍은 사진(image/jpeg, lastModified = 찍은 시각) */
  onShot: (file: File) => void
  /** 왼쪽 아래 사진첩 버튼(capture 없는 file input을 연다) */
  onAlbum: () => void
  onClose: () => void
  /** 카메라를 켜지 못함 → 부모가 버튼 방식으로 바꾼다 */
  onFail: (reason: CameraFailReason) => void
  /** 조각 2 자리: 먹은 후 촬영 때 먹기 전 사진을 반투명하게 겹칠 주소. 아직 그리지 않는다. */
  overlaySrc?: string | null
}

/** 스트림을 붙인 뒤 첫 프레임이 나올 때까지 기다린다(시간 초과면 시작 실패). */
function waitForFrame(v: HTMLVideoElement, ms: number): Promise<boolean> {
  if (v.readyState >= 2 && v.videoWidth > 0) return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(t)
      v.removeEventListener('loadeddata', onData)
      resolve(ok)
    }
    const onData = () => done(v.videoWidth > 0)
    const t = setTimeout(() => done(v.videoWidth > 0), ms)
    v.addEventListener('loadeddata', onData)
  })
}

const SLOT = 'flex h-14 w-14 items-center justify-center'
const ROUND =
  'flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/40 active:bg-black/70 disabled:opacity-40'

export default function CameraCapture({ title, hint, onShot, onAlbum, onClose, onFail }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // 켜기 요청마다 1씩 올린다. 늦게 끝난 요청의 스트림은 바로 끈다(전환·백그라운드·StrictMode 이중 실행).
  const genRef = useRef(0)
  const shotRef = useRef(false)
  const onFailRef = useRef(onFail)
  const [facing, setFacing] = useState<Facing>('environment')
  const [live, setLive] = useState(false)
  const [mirrored, setMirrored] = useState(false)
  const [canSwitch, setCanSwitch] = useState(false)

  useEffect(() => {
    onFailRef.current = onFail
  })

  // 트랙을 끄기만 한다(상태는 바꾸지 않음). 화면 상태까지 바꿀 때는 halt.
  const stop = useCallback(() => {
    genRef.current++
    stopStream(streamRef.current)
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
  }, [])
  const halt = useCallback(() => {
    stop()
    setLive(false)
  }, [stop])

  const start = useCallback(
    async (f: Facing) => {
      stop()
      const gen = genRef.current
      let stream: MediaStream
      try {
        stream = await openCameraStream(f)
      } catch (e) {
        if (gen === genRef.current) onFailRef.current(classifyCameraError(e))
        return
      }
      const v = videoRef.current
      if (gen !== genRef.current || !v || document.visibilityState === 'hidden') {
        stopStream(stream)
        return
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      // 다른 앱이 카메라를 가져가는 등 저절로 끊기면: 보이는 중이면 버튼 방식으로, 숨겨진 중이면 돌아올 때 다시 켠다.
      track?.addEventListener('ended', () => {
        if (gen !== genRef.current) return
        halt()
        if (document.visibilityState === 'visible' && !shotRef.current) onFailRef.current('failed')
      })
      setMirrored(f === 'user' || track?.getSettings().facingMode === 'user')
      v.srcObject = stream
      v.play().catch(() => {
        // autoPlay 속성이 다시 시도한다. 첫 프레임이 안 나오면 아래 시간 초과로 시작 실패 처리.
      })
      const ok = await waitForFrame(v, 10_000)
      if (gen !== genRef.current) return
      if (!ok) {
        halt()
        onFailRef.current('failed')
        return
      }
      setLive(true)
      // 권한을 받은 뒤라야 카메라 개수가 정확하다. 하나뿐이면 전환 버튼을 숨긴다.
      countVideoInputs().then((n) => {
        if (gen === genRef.current) setCanSwitch(n > 1)
      })
    },
    [stop, halt],
  )

  // 켜기·전환. 화면을 떠나면 끈다.
  useEffect(() => {
    void start(facing)
    return halt
  }, [facing, start, halt])

  // 백그라운드로 가면 끄고, 돌아오면 다시 켠다(카메라 표시등이 켜진 채 남지 않게).
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') halt()
      else if (!shotRef.current && !streamRef.current) void start(facing)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', halt)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', halt)
    }
  }, [facing, start, halt])

  function shoot() {
    const v = videoRef.current
    if (!v || !live || shotRef.current) return
    const w = v.videoWidth
    const h = v.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!w || !h || !ctx) return
    shotRef.current = true
    // 미리보기 좌우 반전(전면)은 화면에만. 사진은 원래 방향 그대로 뜬다.
    ctx.drawImage(v, 0, 0, w, h)
    halt() // 분석 동안 카메라를 끈다
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          shotRef.current = false
          void start(facing)
          return
        }
        const now = Date.now()
        onShot(new File([blob], `camera-${now}.jpg`, { type: 'image/jpeg', lastModified: now }))
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${title} 카메라`} className="fixed inset-0 z-30 bg-black text-white">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
      />
      {!live && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">카메라를 켜는 중…</p>
      )}

      {/* 위: 닫기 + 제목 + 안내. 가로면 오른쪽 셔터 줄 자리를 비운다. */}
      <div className="absolute top-0 right-0 left-0 bg-linear-to-b from-black/70 to-transparent pt-[max(0.5rem,env(safe-area-inset-top))] pr-3 pb-6 pl-[max(0.75rem,env(safe-area-inset-left))] landscape:right-28">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-white/20">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <p className="text-base font-semibold">{title}</p>
        </div>
        <p className="mx-auto mt-1 w-fit max-w-full rounded-full bg-black/50 px-3 py-1 text-center text-sm font-medium">{hint}</p>
        {/* 사진 전송 고지(스펙 7.1 U4)는 촬영 화면에 늘 보인다 */}
        <p className="mx-auto mt-1.5 max-w-md px-1 text-center text-[11px] leading-snug text-white/75">{PHOTO_NOTICE}</p>
      </div>

      {/* 셔터 줄: 세로 = 아래 가로줄(사진첩 · 셔터 · 전환), 가로 = 오른쪽 세로줄(위 전환 · 셔터 · 아래 사진첩) */}
      <div className="absolute right-0 bottom-0 left-0 flex items-center justify-between bg-linear-to-t from-black/70 to-transparent pt-8 pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] landscape:top-0 landscape:left-auto landscape:w-28 landscape:flex-col-reverse landscape:bg-linear-to-l landscape:pt-[max(1.5rem,env(safe-area-inset-top))] landscape:pr-[env(safe-area-inset-right)] landscape:pl-0">
        <div className={SLOT}>
          <button type="button" onClick={onAlbum} aria-label="앨범에서 고르기" className={ROUND}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="M4 17l5-5 4 4 2.5-2.5L20 18" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={shoot}
          disabled={!live}
          aria-label="사진 찍기"
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white disabled:opacity-40"
        >
          <span className="h-[60px] w-[60px] rounded-full bg-white active:scale-90" />
        </button>
        <div className={SLOT}>
          {canSwitch && (
            <button
              type="button"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              disabled={!live}
              aria-label="카메라 전환"
              className={ROUND}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9a8 8 0 0 1 14.3-3.3L20 7.5M20 3.5v4h-4M20 15a8 8 0 0 1-14.3 3.3L4 16.5M4 20.5v-4h4" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
