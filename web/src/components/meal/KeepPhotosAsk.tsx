// 식사 사진 보관(디자인 조각 D9, 스펙 4.12, 2026-10-28 사용자 확인 _workspace/design/mock/d9_3_keep_ask).
// - 처음 묻기: prefs.keepPhotos가 null(아직 묻지 않음)이면 식사 기록·먹은 후 시트의 [카메라로 찍기]·[앨범에서 고르기]를 처음 누를 때
//   "식사 사진도 보관할까요?" 시트를 보인다. 고르면 계정에 저장(setKeepPhotos)하고 누른 일을 이어 한다.
//   앨범 파일 고르기는 사용자 손짓이 있어야 열리므로 답 버튼의 click 처리 안에서 바로 이어 부른다.
//   X·바깥 누르기는 고르지 않고 닫는다(다음에 다시 묻는다).
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

export type KeepPhotosAsk = {
  /** null = 아직 묻지 않음(또는 불러오는 중) */
  keepPhotos: boolean | null
  /** 사진 버튼을 누를 때 끼운다(처음이면 묻는 시트) */
  gate: (fn: () => void) => void
  elements: ReactNode
}

export function useKeepPhotosAsk(uid: string): KeepPhotosAsk {
  const [pref, setPref] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  // 방금 고른 답(구독이 바뀌기 전에 사진이 골라져도 이 값을 쓴다)
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)

  useEffect(
    () =>
      subscribePrefs(uid, (p) => {
        setPref(p.keepPhotos)
        setLoaded(true)
      }),
    [uid],
  )

  const keepPhotos = pref ?? answered

  function gate(fn: () => void) {
    // 설정을 아직 못 불러왔으면 묻지 않고 진행한다(보관은 하지 않는다, 다음에 묻는다)
    if (!loaded || keepPhotos !== null) {
      fn()
      return
    }
    pendingRef.current = fn
    setOpen(true)
  }

  function answer(on: boolean) {
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
