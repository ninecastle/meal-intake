// S2 먹기 전 촬영. 사진을 고르면: 끼니·dateKey(촬영 시각) → 압축 → newMealId → IndexedDB 임시 보관
// → 먹기 전 분석(호출 A) → awaiting_after 기록(기다리지 않음) → S3. 사진 선택 1회 = 분석 1회, 자동 재호출 없음.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { analyzeBefore } from '../analysis/analyze'
import { loadNutritionDb } from '../analysis/nutrition/db'
import AnalyzingOverlay from '../components/capture/AnalyzingOverlay'
import {
  describeAnalysisError,
  isAbortError,
  PHOTO_NOTICE,
  readNoticeAck,
  writeNoticeAck,
  type ErrorView,
} from '../components/capture/captureText'
import { createAwaitingMeal, newMealId } from '../data/meals'
import { guessMealType, toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { compressPhoto } from '../photos/compress'
import type { AfterPageState } from './CaptureAfterPage'

export default function CaptureBeforePage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용 압축본. 이 화면 메모리에만 둔다(누를 때만 다시 호출, 자동 재시도 없음).
  const lastPhoto = useRef<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const [error, setError] = useState<ErrorView | null>(null)

  // 결과 화면에서 쓸 식약처 DB JSON을 미리 받아 둔다(실패해도 결과 화면이 다시 시도한다).
  useEffect(() => {
    loadNutritionDb().catch(() => {})
  }, [])
  // 화면을 떠나면 진행 중 분석을 끊는다.
  useEffect(() => () => abortRef.current?.abort(), [])

  function startCapture() {
    if (busyRef.current) return
    if (!readNoticeAck()) {
      setShowNotice(true)
      return
    }
    inputRef.current?.click()
  }

  function acceptNotice() {
    writeNoticeAck()
    setShowNotice(false)
    inputRef.current?.click()
  }

  function goManual() {
    abortRef.current?.abort()
    navigate(`/meal/new/review?date=${toDateKey(new Date())}`)
  }

  async function onPick(file: File) {
    await run(() => compressPhoto(file))
  }

  async function retryLast() {
    const photo = lastPhoto.current
    if (!photo) {
      startCapture()
      return
    }
    await run(async () => photo)
  }

  async function run(getPhoto: () => Promise<Blob>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    // 끼니·dateKey는 먹기 전 촬영 시각 기준(스펙 2.2절)
    const shotAt = new Date()
    const dateKey = toDateKey(shotAt)
    const mealType = guessMealType(shotAt)
    const ac = new AbortController()
    abortRef.current = ac
    let id: string | null = null
    try {
      const photo = await getPhoto()
      lastPhoto.current = photo
      id = newMealId(uid)
      await beforePhotoStore.put(id, photo)
      const beforeAnalysis = await analyzeBefore(photo, { signal: ac.signal })
      // 기다리지 않는다: 오프라인이면 서버 확인이 끝나지 않는다(로컬 캐시에는 바로 들어간다).
      createAwaitingMeal(uid, id, { dateKey, mealType, beforeAnalysis }).catch((e: unknown) =>
        console.warn('[S2] awaiting_after 저장 실패', e),
      )
      abortRef.current = null
      lastPhoto.current = null
      const state: AfterPageState = { beforeAnalysis, dateKey, mealType }
      navigate(`/meal/${id}/after`, { replace: true, state })
    } catch (e) {
      // 문서를 만들지 않았으니 보관한 사진도 남기지 않는다.
      if (id) beforePhotoStore.remove(id).catch(() => {})
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
      if (!isAbortError(e)) setError(describeAnalysisError(e))
    }
  }

  const primary = 'flex min-h-14 w-full items-center justify-center rounded-xl text-lg font-semibold'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-2">
      <div className="flex items-center justify-between text-sm">
        <Link to="/" className="flex min-h-11 items-center pr-3 text-gray-600">
          ← 홈
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-bold">먹기 전 사진</h1>
      <p className="mt-2 text-base text-gray-800">수저를 함께, 위에서 찍어 주세요</p>
      <p className="mt-1 text-sm text-gray-500">카메라가 없으면 사진을 고를 수 있어요.</p>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="font-semibold text-red-800">{error.title}</p>
          <p className="mt-1 text-sm text-red-700">{error.detail}</p>
          {import.meta.env.DEV && error.devCode && <p className="mt-1 text-xs text-gray-500">{error.devCode}</p>}
        </div>
      )}

      <div className="flex-1" />

      <p className="mt-4 text-xs leading-relaxed text-gray-500">{PHOTO_NOTICE}</p>

      <div className="sticky bottom-0 -mx-4 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error?.retry ? (
          <>
            <button
              type="button"
              onClick={() => void retryLast()}
              disabled={busy}
              className={`${primary} bg-emerald-600 text-white disabled:opacity-50`}
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={startCapture}
              disabled={busy}
              className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-gray-600 underline disabled:opacity-50"
            >
              다시 찍기
            </button>
            <button
              type="button"
              onClick={goManual}
              className="flex min-h-11 w-full items-center justify-center text-sm text-gray-600 underline"
            >
              직접 입력
            </button>
          </>
        ) : error?.preferManual ? (
          <>
            <button type="button" onClick={goManual} className={`${primary} bg-emerald-600 text-white`}>
              직접 입력
            </button>
            <button
              type="button"
              onClick={startCapture}
              disabled={busy}
              className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-gray-600 underline disabled:opacity-50"
            >
              다시 찍기
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={startCapture}
              disabled={busy}
              className={`${primary} bg-emerald-600 text-white disabled:opacity-50`}
            >
              {error ? '다시 찍기' : '사진 찍기'}
            </button>
            <button
              type="button"
              onClick={goManual}
              className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-gray-600 underline"
            >
              직접 입력
            </button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void onPick(f)
        }}
      />

      {showNotice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4">
            <p className="font-semibold">사진을 보내기 전에 알려 드려요</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{PHOTO_NOTICE}</p>
            <button type="button" onClick={acceptNotice} className={`${primary} mt-4 bg-emerald-600 text-white`}>
              확인하고 찍기
            </button>
            <button
              type="button"
              onClick={() => setShowNotice(false)}
              className="mt-1 flex min-h-11 w-full items-center justify-center text-sm text-gray-600"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {busy && <AnalyzingOverlay label="음식을 알아보고 있어요" manualLabel="직접 입력" onManual={goManual} />}
    </main>
  )
}
