// 식사 사진 보관(디자인 조각 D9, 스펙 4.12, 2026-10-28 사용자 확인 _workspace/design/mock/d9_3_keep_ask).
// - 처음 묻기: prefs.keepPhotos가 null(아직 묻지 않음)이면 식사 기록·먹은 후 시트의 [카메라로 찍기]·[앨범에서 고르기]를 처음 누를 때
//   "식사 사진도 보관할까요?" 시트를 보인다. 고르면 계정에 저장(setKeepPhotos)하고 누른 일을 이어 한다.
//   앨범 파일 고르기는 사용자 손짓이 있어야 열리므로 답 버튼의 click 처리 안에서 바로 이어 부른다.
//   X·바깥 누르기는 고르지 않고 닫는다(다음에 다시 묻는다).
//   설정을 아직 받기 전에 누르면 구독 첫 값을 최대 2초 기다렸다가 판단하고, 그래도 없으면 묻는다(건너뛰지 않는다).
// - 보관: keepPhotos가 true일 때만 분석에 쓴 압축본으로 썸네일을 만들어 저장한다. 기다리지 않는다(실패는 console.warn).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { saveMealPhoto, type PhotoSide } from '../../data/mealPhotos'
import { setKeepPhotos, subscribePrefs } from '../../data/prefs'
import { makeThumbnail } from '../../photos/thumbnail'
import { BottomSheet } from '../ui'

/** 썸네일을 만들어 저장한다(기다리지 않아도 된다, 실패는 경고만) */
export function keepMealPhoto(uid: string, mealId: string, side: PhotoSide, photo: Blob): void {
  makeThumbnail(photo)
    .then((thumb) => saveMealPhoto(uid, mealId, side, thumb))
    .catch((e: unknown) => console.warn(`[mealPhotos] ${side} 사진 보관 실패`, e))
}

/** 설정 구독 첫 값을 기다리는 최대 시간 */
const PREFS_WAIT_MS = 2000

export type KeepPhotosAsk = {
  /** null = 아직 묻지 않음(또는 불러오는 중) */
  keepPhotos: boolean | null
  /** 사진 버튼을 누를 때 끼운다(처음이면 묻는 시트) */
  gate: (fn: () => void) => void
  elements: ReactNode
}

export function useKeepPhotosAsk(uid: string): KeepPhotosAsk {
  const [pref, setPref] = useState<boolean | null>(null)
  // 방금 고른 답(구독이 바뀌기 전에 사진이 골라져도 이 값을 쓴다)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)

  // 구독 첫 값 전에 누른 버튼(최대 PREFS_WAIT_MS 기다린 뒤 판단). 같은 값을 클로저 밖에서 보도록 ref로도 둔다.
  const waitRef = useRef<{ fn: () => void; timer: ReturnType<typeof setTimeout> } | null>(null)
  const loadedRef = useRef(false)
  const prefRef = useRef<boolean | null>(null)
  const answeredRef = useRef<boolean | null>(null)

  useEffect(() => {
    loadedRef.current = false
    const unsub = subscribePrefs(uid, (p) => {
      prefRef.current = p.keepPhotos
      loadedRef.current = true
      setPref(p.keepPhotos)
      // 기다리던 버튼이 있으면 지금 판단한다
      const w = waitRef.current
      if (w) {
        waitRef.current = null
        clearTimeout(w.timer)
        decide(w.fn)
      }
    })
    return () => {
      unsub()
      if (waitRef.current) clearTimeout(waitRef.current.timer)
      waitRef.current = null
    }
    // decide는 ref와 setState만 쓴다
  }, [uid])

  const keepPhotos = pref ?? answered

  /** 이미 정했으면(true/false) 바로 진행, 아직 묻지 않았으면(null) 묻는 시트 */
  function decide(fn: () => void) {
    if ((prefRef.current ?? answeredRef.current) !== null) {
      fn()
      return
    }
    pendingRef.current = fn
    setOpen(true)
  }

  function gate(fn: () => void) {
    if (loadedRef.current) {
      decide(fn)
      return
    }
    // 설정을 아직 못 받았으면 구독 첫 값을 잠깐(최대 2초) 기다렸다가 판단한다.
    // 그래도 안 오면(오프라인 등) 묻는다(기본 꺼짐이라 물어도 안전). 연타는 마지막 것만.
    if (waitRef.current) clearTimeout(waitRef.current.timer)
    const timer = setTimeout(() => {
      const w = waitRef.current
      waitRef.current = null
      if (!w) return
      pendingRef.current = w.fn
      setOpen(true)
    }, PREFS_WAIT_MS)
    waitRef.current = { fn, timer }
  }

  function answer(on: boolean) {
    answeredRef.current = on
    setAnswered(on)
    setOpen(false)
    setKeepPhotos(uid, on).catch((e: unknown) => console.warn('[prefs] 사진 보관 설정 저장 실패', e))
    const fn = pendingRef.current
    pendingRef.current = null
    fn?.()
  }

  function close() {
    pendingRef.current = null
    setOpen(false)
  }

  const elements = (
    <BottomSheet open={open} onClose={close} title="식사 사진도 보관할까요?">
      <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>
        작은 사진만 기록과 함께 저장하고, 식단 앨범에서 다시 볼 수 있어요. 언제든 지울 수 있어요.
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '14px 0 0' }}>
        설정에서 언제든 바꿀 수 있어요
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={() => answer(false)}>
          보관 안 함
        </button>
        <button type="button" className="btn ink" style={{ flex: 1 }} onClick={() => answer(true)}>
          보관하기
        </button>
      </div>
    </BottomSheet>
  )

  return { keepPhotos, gate, elements }
}
