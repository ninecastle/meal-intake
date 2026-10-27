// S3 먹은 후 촬영. 같은 사진 확인 → 먹은 후 분석(호출 B) → 성공하면 먹기 전 사진 삭제 → 영양값 조립
// → needs_review 저장(기다리지 않음) → S4. 먹은 후 사진은 이 화면 메모리에만 둔다.
// 남긴 비율이 불확실한(null) 음식이 있으면(먹은 후 사진이 달라 보임, 2026-10-27) 먹기 전 사진을 지우지 않고 저장도 하지 않는다
// (문서는 awaiting_after 그대로). S4에 retake: true를 넘겨 [먹은 후 사진 다시 찍기]를 보이게 한다.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { analyzeAfter, assembleAnalysis } from '../analysis/analyze'
import AnalyzingOverlay from '../components/capture/AnalyzingOverlay'
import { describeAnalysisError, isAbortError, PHOTO_NOTICE, type ErrorView } from '../components/capture/captureText'
import { deleteMeal, getMeal, saveReview, type MealType } from '../data/meals'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { compressPhoto } from '../photos/compress'
import { isSamePhoto } from '../photos/samePhoto'
import type { BeforeAnalysis, MealIntakeAnalysis } from '../types/analysis'

/** S2 → S3 navigate state. 없으면(앱을 다시 연 경우) getMeal로 불러온다. */
export type AfterPageState = { beforeAnalysis: BeforeAnalysis; dateKey: string; mealType: MealType }
/** S3 → S4 navigate state(ReviewPage와의 계약) */
type ReviewState = { analysis: MealIntakeAnalysis; dateKey: string; mealType: MealType; retake?: boolean }

function readState(s: unknown): AfterPageState | null {
  const v = s as Partial<AfterPageState> | null
  return v && Array.isArray(v.beforeAnalysis?.items) && typeof v.dateKey === 'string' && typeof v.mealType === 'string'
    ? (v as AfterPageState)
    : null
}

type Busy = null | 'after' | 'manual'

export default function CaptureAfterPage({ uid }: { uid: string }) {
  const { mealId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [meal, setMeal] = useState<AfterPageState | null>(() => readState(location.state))
  const [loadError, setLoadError] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [hasBeforePhoto, setHasBeforePhoto] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [samePending, setSamePending] = useState<{ beforePhoto: Blob; afterPhoto: Blob } | null>(null)
  const [error, setError] = useState<ErrorView | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const opRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용. 압축본 두 장을 이 화면 메모리에만 둔다(어디에도 저장하지 않는다).
  const lastShot = useRef<{ beforePhoto: Blob | null; afterPhoto: Blob } | null>(null)

  // state가 없으면 문서를 불러온다. 없거나 상태가 다르면 홈으로.
  useEffect(() => {
    if (meal) return
    let alive = true
    getMeal(uid, mealId).then(
      (m) => {
        if (!alive) return
        if (!m || m.status !== 'awaiting_after' || !m.beforeAnalysis) {
          navigate('/', { replace: true })
          return
        }
        setMeal({ beforeAnalysis: m.beforeAnalysis, dateKey: m.dateKey, mealType: m.mealType })
      },
      () => alive && setLoadError(true),
    )
    return () => {
      alive = false
    }
  }, [uid, mealId, meal, navigate])

  // 먹기 전 사진(IndexedDB에 있을 때만)을 위쪽에 보인다.
  useEffect(() => {
    let alive = true
    let url: string | null = null
    beforePhotoStore.get(mealId).then(
      (b) => {
        if (!alive) return
        setHasBeforePhoto(b != null)
        if (b) {
          url = URL.createObjectURL(b)
          setPhotoUrl(url)
        }
      },
      () => alive && setHasBeforePhoto(false),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [mealId])

  useEffect(() => () => abortRef.current?.abort(), [])

  function begin(kind: Exclude<Busy, null>): number {
    busyRef.current = true
    setBusy(kind)
    setError(null)
    return ++opRef.current
  }

  function end(op: number) {
    if (opRef.current !== op) return
    abortRef.current = null
    busyRef.current = false
    setBusy(null)
  }

  function goReview(state: ReviewState) {
    abortRef.current = null
    navigate(`/meal/${mealId}/review`, { replace: true, state })
  }

  // 먹은 후 분석 → 영양값 조립 → (불확실한 비율이 없으면) 먹기 전 사진 삭제 → needs_review 저장(기다리지 않음) → S4
  async function runAfter(m: AfterPageState, beforePhoto: Blob | null, afterPhoto: Blob) {
    const ac = new AbortController()
    abortRef.current = ac
    lastShot.current = { beforePhoto, afterPhoto }
    const after = await analyzeAfter({ before: m.beforeAnalysis, beforePhoto, afterPhoto }, { signal: ac.signal })
    const analysis = await assembleAnalysis(m.beforeAnalysis, after, { signal: ac.signal })
    lastShot.current = null
    if (analysis.items.some((it) => it.remaining_ratio === null)) {
      // 다시 찍을 수 있게 먹기 전 사진과 awaiting_after 문서를 그대로 둔다. 저장하면 그때 S4가 사진을 지운다.
      goReview({ analysis, dateKey: m.dateKey, mealType: m.mealType, retake: true })
      return
    }
    // 분석이 성공했을 때만 지운다(실패하면 다시 시도할 수 있게 남긴다).
    await beforePhotoStore.remove(mealId).catch((e: unknown) => console.warn('[S3] 먹기 전 사진 삭제 실패', e))
    saveReview(uid, mealId, analysis).catch((e: unknown) => console.warn('[S3] needs_review 저장 실패', e))
    goReview({ analysis, dateKey: m.dateKey, mealType: m.mealType })
  }

  async function onPick(file: File) {
    if (busyRef.current || !meal) return
    const op = begin('after')
    setSamePending(null)
    try {
      const afterPhoto = await compressPhoto(file)
      const beforePhoto = await beforePhotoStore.get(mealId).catch(() => null)
      // 분석 호출 전에 비교한다. 같으면 [그대로 분석]을 누르기 전에는 호출하지 않는다(한도 절약).
      if (beforePhoto && (await isSamePhoto(beforePhoto, afterPhoto).catch(() => false))) {
        setSamePending({ beforePhoto, afterPhoto })
        return
      }
      await runAfter(meal, beforePhoto, afterPhoto)
    } catch (e) {
      if (!isAbortError(e) && opRef.current === op) setError(describeAnalysisError(e))
    } finally {
      end(op)
    }
  }

  async function analyzeSameAnyway() {
    const p = samePending
    if (!p || busyRef.current || !meal) return
    const op = begin('after')
    setSamePending(null)
    try {
      await runAfter(meal, p.beforePhoto, p.afterPhoto)
    } catch (e) {
      if (!isAbortError(e) && opRef.current === op) setError(describeAnalysisError(e))
    } finally {
      end(op)
    }
  }

  // 분당 한도 뒤 [다시 시도]: 같은 사진으로 한 번 더 보낸다(누를 때만 호출, 자동 재시도 없음).
  async function retryLast() {
    const shot = lastShot.current
    if (!shot) {
      inputRef.current?.click()
      return
    }
    if (busyRef.current || !meal) return
    const op = begin('after')
    setSamePending(null)
    try {
      await runAfter(meal, shot.beforePhoto, shot.afterPhoto)
    } catch (e) {
      if (!isAbortError(e) && opRef.current === op) setError(describeAnalysisError(e))
    } finally {
      end(op)
    }
  }

  function pickOther() {
    setSamePending(null)
    inputRef.current?.click()
  }

  // 남긴 양 직접 고르기: 먹은 후 분석 없이 S4로(remaining_ratio는 모두 null). 먹기 전 사진은 남긴다.
  async function chooseManually() {
    if (!meal) return
    abortRef.current?.abort()
    const op = begin('manual')
    setSamePending(null)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const analysis = await assembleAnalysis(meal.beforeAnalysis, null, { signal: ac.signal })
      if (opRef.current === op) goReview({ analysis, dateKey: meal.dateKey, mealType: meal.mealType })
    } catch (e) {
      if (!isAbortError(e) && opRef.current === op) setError(describeAnalysisError(e))
    } finally {
      end(op)
    }
  }

  function cancelMeal() {
    if (!window.confirm('이 기록을 취소할까요? 먹기 전 분석 결과도 지워져요.')) return
    abortRef.current?.abort()
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다).
    deleteMeal(uid, mealId).catch((e: unknown) => console.warn('[S3] 기록 취소 실패', e))
    beforePhotoStore.remove(mealId).catch(() => {})
    navigate('/', { replace: true })
  }

  const primary = 'flex min-h-14 w-full items-center justify-center rounded-xl text-lg font-semibold'
  const secondary = 'flex min-h-11 w-full items-center justify-center text-sm text-gray-600 underline'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-2">
      <div className="flex items-center justify-between text-sm">
        <Link to="/" className="flex min-h-11 items-center pr-3 text-gray-600">
          ← 홈
        </Link>
        <button type="button" onClick={cancelMeal} className="min-h-11 pl-3 text-gray-500 underline">
          기록 취소
        </button>
      </div>

      <h1 className="mt-2 text-2xl font-bold">먹은 후 사진</h1>

      {!meal && !loadError && <p className="mt-4 text-sm text-gray-500">불러오는 중…</p>}
      {loadError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
          <Link to="/" className="mt-2 flex min-h-11 items-center font-medium underline">
            홈으로
          </Link>
        </div>
      )}

      {meal && (
        <>
          {photoUrl && (
            <figure className="mt-3">
              <img src={photoUrl} alt="먹기 전 사진" className="max-h-64 w-full rounded-xl object-cover" />
              <figcaption className="mt-1 text-xs text-gray-500">먹기 전</figcaption>
            </figure>
          )}
          {hasBeforePhoto === false && (
            <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
              먹기 전 사진이 이 기기에 없어 음식 목록만으로 분석해요. 정확도가 낮을 수 있어요.
            </p>
          )}

          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {meal.beforeAnalysis.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{it.name}</span>
                <span className="shrink-0 text-gray-500">{Math.round(it.before_grams)}g</span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-base text-gray-800">같은 위치·각도로 찍어 주세요</p>

          {samePending && (
            <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold text-amber-900">먹기 전과 같은 사진이에요</p>
              <p className="mt-1 text-sm text-amber-800">다 먹은 뒤의 사진을 골라 주세요.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={pickOther}
                  className="min-h-11 flex-1 rounded-lg bg-amber-500 px-3 font-semibold text-white"
                >
                  다른 사진 고르기
                </button>
                <button
                  type="button"
                  onClick={() => void analyzeSameAnyway()}
                  className="min-h-11 flex-1 rounded-lg border border-amber-400 px-3 text-amber-900"
                >
                  그대로 분석
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
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
                  disabled={busy != null}
                  className={`${primary} bg-emerald-600 text-white disabled:opacity-50`}
                >
                  다시 시도
                </button>
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy != null} className={secondary}>
                  다시 찍기
                </button>
                <button type="button" onClick={() => void chooseManually()} className={secondary}>
                  남긴 양 직접 고르기
                </button>
              </>
            ) : error?.preferManual ? (
              <>
                <button type="button" onClick={() => void chooseManually()} className={`${primary} bg-emerald-600 text-white`}>
                  남긴 양 직접 고르기
                </button>
                <button type="button" onClick={() => inputRef.current?.click()} className={secondary}>
                  다시 찍기
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={busy != null}
                  className={`${primary} bg-emerald-600 text-white disabled:opacity-50`}
                >
                  {error ? '다시 찍기' : '남은 음식 찍기'}
                </button>
                {error && (
                  <button type="button" onClick={() => void chooseManually()} className={secondary}>
                    남긴 양 직접 고르기
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

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

      {busy === 'after' && (
        <AnalyzingOverlay
          label="남은 양을 비교하고 있어요"
          manualLabel="남긴 양 직접 고르기"
          onManual={() => void chooseManually()}
        />
      )}
      {busy === 'manual' && <AnalyzingOverlay label="영양 정보를 찾고 있어요" />}
    </main>
  )
}
