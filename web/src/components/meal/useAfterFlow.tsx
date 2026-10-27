// 끼니 화면(D3)의 먹은 후 흐름("남은 음식을 알려 주세요" 시트). 예전 S3(CaptureAfterPage)의 분석 경로를 그대로 옮겼다.
// 사진(카메라·앨범): 같은 사진 확인 → 먹은 후 분석(호출 B) → 영양값 조립 → 먹기 전 사진 삭제 → needs_review 저장(기다리지 않음) → 결과 화면.
//   남긴 비율이 불확실한(null) 음식이 있으면 먹기 전 사진과 awaiting_after 문서를 그대로 두고 결과 화면에 retake를 넘긴다.
// [다 먹었어요]·[남긴 양 직접 고르기](2026-10-27 사용자 결정): 호출 B 없이 영양값만 조립하고 음식마다 고른 남긴 비율을 넣는다.
//   사진 비교가 없으므로 "확인 필요"·그릇 안 보임(ratio_assumed) 규칙을 쓰지 않는다. 먹기 전 사진은 결과 화면으로 넘어갈 때 지운다.
// 먹은 후 사진은 이 화면 메모리에만 둔다. 먹기 전 사진은 IndexedDB에 있으면 카메라 화면에 반투명하게 겹친다(photoUrl).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { analyzeAfter, assembleAnalysis } from '../../analysis/analyze'
import { WARN_NO_AFTER } from '../../analysis/assemble'
import { buildAnalysis, setRemainingRatio } from '../../analysis/compute'
import { deleteMeal, saveReview, type MealType, type MealWithId } from '../../data/meals'
import { beforePhotoStore } from '../../photos/beforePhotoStore'
import { compressPhoto } from '../../photos/compress'
import { isSamePhoto } from '../../photos/samePhoto'
import type { BeforeAnalysis, MealIntakeAnalysis } from '../../types/analysis'
import AnalyzingOverlay from '../capture/AnalyzingOverlay'
import { describeAnalysisError, isAbortError, type ErrorView } from '../capture/captureText'

/** 결과 화면(ReviewPage)에 넘기는 state */
export type ReviewEntry = { analysis: MealIntakeAnalysis; dateKey: string; mealType: MealType; retake?: boolean }

/** 먹은 후 흐름의 대상: awaiting_after 기록 하나 */
export type AfterTarget = { id: string; dateKey: string; mealType: MealType; beforeAnalysis: BeforeAnalysis }

export function afterTarget(m: MealWithId): AfterTarget | null {
  return m.status === 'awaiting_after' && m.beforeAnalysis && Array.isArray(m.beforeAnalysis.items)
    ? { id: m.id, dateKey: m.dateKey, mealType: m.mealType, beforeAnalysis: m.beforeAnalysis }
    : null
}

type Busy = null | 'after' | 'manual'

export type AfterFlow = {
  busy: Busy
  error: ErrorView | null
  canRetry: boolean
  /** 먹기 전과 같은 사진을 골랐다([그대로 분석]을 누르기 전에는 호출하지 않는다) */
  samePending: boolean
  /** 먹기 전 사진 주소(카메라 겹쳐 보기). 없으면 null */
  photoUrl: string | null
  /** 먹기 전 사진이 이 기기에 없다(다른 기기에서 찍음 등). 확인 전이면 null */
  hasBeforePhoto: boolean | null
  onPick: (file: File) => void
  analyzeSame: () => void
  retry: () => void
  /** 음식 id → 남긴 비율(0~1). 빠진 음식은 0(다 먹음) */
  chooseRatios: (ratios: Record<string, number>) => void
  cancelMeal: () => void
  clearNotices: () => void
  elements: ReactNode
}

export function useAfterFlow(opts: {
  uid: string
  target: AfterTarget | null
  onReview: (mealId: string, entry: ReviewEntry) => void
  /** 분석 중 덮개의 [남긴 양 직접 고르기] */
  onManual: () => void
  /** 기록을 취소했다 */
  onCanceled: () => void
}): AfterFlow {
  const { uid, target } = opts
  const cbRef = useRef(opts)
  useEffect(() => {
    cbRef.current = opts
  })
  const targetId = target?.id ?? null
  const [photo, setPhoto] = useState<{ id: string; url: string | null } | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [same, setSame] = useState<{ beforePhoto: Blob; afterPhoto: Blob } | null>(null)
  const [error, setError] = useState<ErrorView | null>(null)
  const busyRef = useRef(false)
  const opRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용. 압축본 두 장을 이 화면 메모리에만 둔다.
  const lastShot = useRef<{ beforePhoto: Blob | null; afterPhoto: Blob } | null>(null)
  const [hasLast, setHasLast] = useState(false)

  // 대상이 바뀌면 그 기록의 먹기 전 사진(IndexedDB에 있을 때만)을 불러온다.
  useEffect(() => {
    if (!targetId) return
    let alive = true
    let url: string | null = null
    beforePhotoStore.get(targetId).then(
      (b) => {
        if (!alive) return
        url = b ? URL.createObjectURL(b) : null
        setPhoto({ id: targetId, url })
      },
      () => alive && setPhoto({ id: targetId, url: null }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [targetId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const current = photo && photo.id === targetId ? photo : null

  function begin(kind: Exclude<Busy, null>): number {
    busyRef.current = true
    setBusy(kind)
    setError(null)
    setSame(null)
    return ++opRef.current
  }

  function end(op: number) {
    if (opRef.current !== op) return
    abortRef.current = null
    busyRef.current = false
    setBusy(null)
  }

  function fail(e: unknown, op: number) {
    if (!isAbortError(e) && opRef.current === op) setError(describeAnalysisError(e))
  }

  async function runAfter(t: AfterTarget, beforePhoto: Blob | null, afterPhoto: Blob) {
    const ac = new AbortController()
    abortRef.current = ac
    lastShot.current = { beforePhoto, afterPhoto }
    setHasLast(true)
    const after = await analyzeAfter({ before: t.beforeAnalysis, beforePhoto, afterPhoto }, { signal: ac.signal })
    const analysis = await assembleAnalysis(t.beforeAnalysis, after, { signal: ac.signal })
    lastShot.current = null
    setHasLast(false)
    if (analysis.items.some((it) => it.remaining_ratio === null)) {
      // 다시 찍을 수 있게 먹기 전 사진과 awaiting_after 문서를 그대로 둔다. 저장하면 그때 결과 화면이 사진을 지운다.
      cbRef.current.onReview(t.id, { analysis, dateKey: t.dateKey, mealType: t.mealType, retake: true })
      return
    }
    // 분석이 성공했을 때만 지운다(실패하면 다시 시도할 수 있게 남긴다).
    await beforePhotoStore.remove(t.id).catch((e: unknown) => console.warn('[meal] 먹기 전 사진 삭제 실패', e))
    saveReview(uid, t.id, analysis).catch((e: unknown) => console.warn('[meal] needs_review 저장 실패', e))
    cbRef.current.onReview(t.id, { analysis, dateKey: t.dateKey, mealType: t.mealType })
  }

  async function withOp(fn: (t: AfterTarget) => Promise<void>, kind: Exclude<Busy, null> = 'after') {
    const t = target
    if (busyRef.current || !t) return
    const op = begin(kind)
    try {
      await fn(t)
    } catch (e) {
      fail(e, op)
    } finally {
      end(op)
    }
  }

  function onPick(file: File) {
    void withOp(async (t) => {
      const afterPhoto = await compressPhoto(file)
      const beforePhoto = await beforePhotoStore.get(t.id).catch(() => null)
      // 분석 호출 전에 비교한다. 같으면 [그대로 분석]을 누르기 전에는 호출하지 않는다(한도 절약).
      if (beforePhoto && (await isSamePhoto(beforePhoto, afterPhoto).catch(() => false))) {
        setSame({ beforePhoto, afterPhoto })
        return
      }
      await runAfter(t, beforePhoto, afterPhoto)
    })
  }

  function analyzeSame() {
    const p = same
    if (p) void withOp((t) => runAfter(t, p.beforePhoto, p.afterPhoto))
  }

  // 분당 한도 뒤 [다시 시도]: 같은 사진으로 한 번 더 보낸다(누를 때만 호출, 자동 재시도 없음).
  function retry() {
    const shot = lastShot.current
    if (shot) void withOp((t) => runAfter(t, shot.beforePhoto, shot.afterPhoto))
  }

  // [다 먹었어요]·[남긴 양 직접 고르기]: 호출 B 없이 영양값만 조립하고 고른 비율을 넣는다.
  function chooseRatios(ratios: Record<string, number>) {
    abortRef.current?.abort()
    busyRef.current = false
    void withOp(async (t) => {
      const ac = new AbortController()
      abortRef.current = ac
      const base = await assembleAnalysis(t.beforeAnalysis, null, { signal: ac.signal })
      const items = base.items.map((it) => setRemainingRatio(it, clampRatio(ratios[it.id] ?? 0)))
      const analysis = buildAnalysis(
        items,
        base.warnings.filter((w) => w !== WARN_NO_AFTER),
        { model: base.model, prompt_version: base.prompt_version },
      )
      await beforePhotoStore.remove(t.id).catch((e: unknown) => console.warn('[meal] 먹기 전 사진 삭제 실패', e))
      saveReview(uid, t.id, analysis).catch((e: unknown) => console.warn('[meal] needs_review 저장 실패', e))
      cbRef.current.onReview(t.id, { analysis, dateKey: t.dateKey, mealType: t.mealType })
    }, 'manual')
  }

  function cancelMeal() {
    const t = target
    if (!t || !window.confirm('이 기록을 취소할까요? 먹기 전 분석 결과도 지워져요.')) return
    abortRef.current?.abort()
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다).
    deleteMeal(uid, t.id).catch((e: unknown) => console.warn('[meal] 기록 취소 실패', e))
    beforePhotoStore.remove(t.id).catch(() => {})
    cbRef.current.onCanceled()
  }

  function manualFromOverlay() {
    abortRef.current?.abort()
    cbRef.current.onManual()
  }

  const elements = (
    <>
      {busy === 'after' && (
        <AnalyzingOverlay label="남은 양을 비교하고 있어요" manualLabel="남긴 양 직접 고르기" onManual={manualFromOverlay} />
      )}
      {busy === 'manual' && <AnalyzingOverlay label="영양 정보를 찾고 있어요" />}
    </>
  )

  return {
    busy,
    error,
    canRetry: !!error?.retry && hasLast,
    samePending: same != null,
    photoUrl: current?.url ?? null,
    hasBeforePhoto: current ? current.url != null : null,
    onPick,
    analyzeSame,
    retry,
    chooseRatios,
    cancelMeal,
    clearNotices: () => {
      setError(null)
      setSame(null)
    },
    elements,
  }
}

function clampRatio(r: number): number {
  return Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
}
