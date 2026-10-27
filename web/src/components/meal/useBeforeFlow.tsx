// 끼니 화면(D3)의 먹기 전 기록 흐름. 예전 S2(CaptureBeforePage)의 분석 경로를 그대로 옮겼다(화면은 끼니 화면이 그린다).
// 사진을 고르면: 압축 → newMealId → IndexedDB 임시 보관 → 먹기 전 분석(호출 A) → awaiting_after 기록(기다리지 않음)
// → 그 끼니 먹은 시간이 비어 있으면 채움 → onDone. 사진 선택 1회 = 분석 1회, 자동 재호출 없음.
// 날짜·끼니는 끼니 화면의 것으로 고정(2026-10-27 사용자 결정: 끼니 카드로 들어오면 카메라 사진도 그 날짜·끼니, EXIF로 끼니를 채우지 않음).
// 먹은 시간(D3): 카메라는 찍은 시각(지금), 앨범 사진은 사진의 찍은 시각(EXIF, 없거나 미래면 지금). EXIF는 이 계산에만 쓰고 저장하지 않는다.
// 사진 전송 고지(스펙 7.1 U4)를 아직 확인하지 않았으면 사진 버튼 전에 한 번 보인다(gate).
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
  PHOTO_NOTICE,
  readNoticeAck,
  writeNoticeAck,
  type ErrorView,
} from '../capture/captureText'
import type { PickSource } from '../capture/useCaptureSource'
import { Button } from '../ui'

export type BeforeFlow = {
  busy: boolean
  error: ErrorView | null
  /** 분당 한도 뒤 같은 사진으로 [다시 시도]할 수 있음 */
  canRetry: boolean
  onPick: (file: File, source: PickSource) => void
  retry: () => void
  /** 사진 버튼을 누르기 전에 끼운다(고지 확인 창) */
  gate: (fn: () => void) => void
  clearError: () => void
  /** 고지 확인 창·분석 중 덮개. 화면 아무 곳에 한 번 넣는다 */
  elements: ReactNode
}

export function useBeforeFlow(opts: {
  uid: string
  dateKey: string
  mealType: MealType
  /** 분석이 끝나 awaiting_after 기록을 만들었다 */
  onDone: (mealId: string) => void
  /** 분석 중 덮개의 [직접 입력] */
  onManual: () => void
}): BeforeFlow {
  const { uid, dateKey, mealType } = opts
  const onDoneRef = useRef(opts.onDone)
  const onManualRef = useRef(opts.onManual)
  useEffect(() => {
    onDoneRef.current = opts.onDone
    onManualRef.current = opts.onManual
  })
  const pendingRef = useRef<(() => void) | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용 압축본과 그 사진의 먹은 시각. 이 화면 메모리에만 둔다(누를 때만 다시 호출).
  const last = useRef<{ photo: Blob; takenAt: Date } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const [error, setError] = useState<ErrorView | null>(null)
  const [hasLast, setHasLast] = useState(false)

  // 결과 화면에서 쓸 식약처 DB JSON을 미리 받아 둔다(실패해도 결과 화면이 다시 시도한다).
  useEffect(() => {
    loadNutritionDb().catch(() => {})
  }, [])
  useEffect(() => () => abortRef.current?.abort(), [])

  function gate(fn: () => void) {
    if (busyRef.current) return
    if (!readNoticeAck()) {
      pendingRef.current = fn
      setShowNotice(true)
      return
    }
    fn()
  }

  function acceptNotice() {
    writeNoticeAck()
    setShowNotice(false)
    const fn = pendingRef.current
    pendingRef.current = null
    fn?.()
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
      {showNotice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4">
          <div className="w-full max-w-[430px] rounded-card bg-surface p-4">
            <p>사진을 보내기 전에 알려 드려요</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{PHOTO_NOTICE}</p>
            <Button full type="button" onClick={acceptNotice} className="mt-4">
              확인하고 찍기
            </Button>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="focus-ring mt-1 flex min-h-11 w-full items-center justify-center text-sm text-ink-2"
            >
              닫기
            </button>
          </div>
        </div>
      )}
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
