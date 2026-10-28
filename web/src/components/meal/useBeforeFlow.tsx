// 끼니 화면(D3)의 먹기 전 기록 흐름. 예전 S2(CaptureBeforePage)의 분석 경로를 그대로 옮겼다(화면은 끼니 화면이 그린다).
// 사진을 고르면: 압축 → newMealId → IndexedDB 임시 보관 → 먹기 전 분석(호출 A) → awaiting_after 기록(기다리지 않음)
// → 그 끼니 먹은 시간이 비어 있으면 채움 → onDone. 사진 선택 1회 = 분석 1회, 자동 재호출 없음.
// 날짜·끼니는 끼니 화면의 것으로 고정(2026-10-27 사용자 결정: 끼니 카드로 들어오면 카메라 사진도 그 날짜·끼니, EXIF로 끼니를 채우지 않음).
// 먹은 시간(D3): 카메라는 찍은 시각(지금), 앨범 사진은 사진의 찍은 시각(EXIF, 없거나 미래면 지금). EXIF는 이 계산에만 쓰고 저장하지 않는다.
// 사진 전송 고지는 처음 동의 화면으로 옮겨 여기서는 묻지 않는다(D10, 반복 안내 줄이기). gate는 분석 중 잠금만 한다.
// 식사 사진 보관(D9): keepPhotos가 true면 awaiting_after 기록을 만든 뒤 같은 압축본으로 'before' 썸네일을 저장한다(기다리지 않음).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { analyzeBefore } from '../../analysis/analyze'
import { loadNutritionDb } from '../../analysis/nutrition/db'
import { createAwaitingMeal, newMealId, type MealType } from '../../data/meals'
import { fillMealTime } from '../../data/mealTimes'
import { beforePhotoStore } from '../../photos/beforePhotoStore'
import { compressPhoto } from '../../photos/compress'
import { readTakenAt } from '../../photos/exif'
import AnalyzingOverlay from '../capture/AnalyzingOverlay'
import {
  describeAnalysisError,
  isAbortError,
  type ErrorView,
} from '../capture/captureText'
import type { PickSource } from '../capture/useCaptureSource'
import { keepMealPhoto } from './KeepPhotosAsk'

export type BeforeFlow = {
  busy: boolean
  error: ErrorView | null
  /** 분당 한도 뒤 같은 사진으로 [다시 시도]할 수 있음 */
  canRetry: boolean
  onPick: (file: File, source: PickSource) => void
  retry: () => void
  /** 사진 버튼을 누르기 전에 끼운다(분석 중이면 무시) */
  gate: (fn: () => void) => void
  clearError: () => void
  /** 분석 중 덮개. 화면 아무 곳에 한 번 넣는다 */
  elements: ReactNode
}

export function useBeforeFlow(opts: {
  uid: string
  dateKey: string
  mealType: MealType
  /** 식사 사진 보관 설정(D9). true일 때만 먹기 전 썸네일을 저장한다 */
  keepPhotos: boolean | null
  /** 분석이 끝나 awaiting_after 기록을 만들었다 */
  onDone: (mealId: string) => void
  /** 분석 중 덮개의 [직접 입력] */
  onManual: () => void
}): BeforeFlow {
  const { uid, dateKey, mealType } = opts
  const onDoneRef = useRef(opts.onDone)
  const onManualRef = useRef(opts.onManual)
  const keepRef = useRef(opts.keepPhotos)
  useEffect(() => {
    onDoneRef.current = opts.onDone
    onManualRef.current = opts.onManual
    keepRef.current = opts.keepPhotos
  })
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용 압축본과 그 사진의 먹은 시각. 이 화면 메모리에만 둔다(누를 때만 다시 호출).
  const last = useRef<{ photo: Blob; takenAt: Date } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorView | null>(null)
  const [hasLast, setHasLast] = useState(false)

  // 결과 화면에서 쓸 식약처 DB JSON을 미리 받아 둔다(실패해도 결과 화면이 다시 시도한다).
  useEffect(() => {
    loadNutritionDb().catch(() => {})
  }, [])
  useEffect(() => () => abortRef.current?.abort(), [])

  function gate(fn: () => void) {
    if (busyRef.current) return
    fn()
  }

  async function run(getPhoto: () => Promise<Blob>, getTakenAt: () => Promise<Date>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    let id: string | null = null
    try {
      const takenAt = await getTakenAt()
      const photo = await getPhoto()
      last.current = { photo, takenAt }
      setHasLast(true)
      id = newMealId(uid)
      await beforePhotoStore.put(id, photo)
      const beforeAnalysis = await analyzeBefore(photo, { signal: ac.signal })
      // 기다리지 않는다: 오프라인이면 서버 확인이 끝나지 않는다(로컬 캐시와 끼니 화면 구독에는 바로 들어간다).
      createAwaitingMeal(uid, id, { dateKey, mealType, beforeAnalysis }).catch((e: unknown) =>
        console.warn('[meal] awaiting_after 저장 실패', e),
      )
      if (keepRef.current === true) keepMealPhoto(uid, id, 'before', photo)
      void fillMealTime(uid, dateKey, mealType, takenAt)
      abortRef.current = null
      last.current = null
      setHasLast(false)
      busyRef.current = false
      setBusy(false)
      onDoneRef.current(id)
    } catch (e) {
      // 문서를 만들지 않았으니 보관한 사진도 남기지 않는다.
      if (id) beforePhotoStore.remove(id).catch(() => {})
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
      if (!isAbortError(e)) setError(describeAnalysisError(e))
    }
  }

  function onPick(file: File, source: PickSource) {
    const now = new Date()
    void run(
      () => compressPhoto(file),
      async () => (source === 'album' ? ((await readTakenAt(file)) ?? now) : now),
    )
  }

  function retry() {
    const l = last.current
    if (l) void run(async () => l.photo, async () => l.takenAt)
  }

  function manualFromOverlay() {
    abortRef.current?.abort()
    onManualRef.current()
  }

  const elements = (
    <>
      {busy && <AnalyzingOverlay label="음식을 알아보고 있어요" manualLabel="직접 입력" onManual={manualFromOverlay} />}
    </>
  )

  return {
    busy,
    error,
    canRetry: !!error?.retry && hasLast,
    onPick,
    retry,
    gate,
    clearError: () => setError(null),
    elements,
  }
}
