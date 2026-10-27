// S2 먹기 전 촬영. 사진을 고르면: dateKey·끼니(아래 날짜 규칙) → 압축 → newMealId → IndexedDB 임시 보관
// → 먹기 전 분석(호출 A) → awaiting_after 기록(기다리지 않음) → S3. 사진 선택 1회 = 분석 1회, 자동 재호출 없음.
// 사진을 얻는 방법은 useCaptureSource(M19). 처음은 선택 화면(조각 2-1, 2026-10-27 사용자 결정): 폰·태블릿 [카메라로 찍기]
// (앱 안 카메라 화면, 이때만 연다)·[앨범에서 고르기]·[직접 입력], PC [사진 파일 고르기]·웹캠이 있으면 [카메라로 찍기]·[직접 입력].
// 날짜(2026-10-27 사용자 결정): 카메라로 찍은 사진은 오늘, 앨범 사진(PC 파일 포함)과 [직접 입력]은 ?date=YYYY-MM-DD(홈에서 보던
// 날짜, 없으면 오늘). 끼니: 앨범 사진은 EXIF 찍은 시각(없거나 미래면 지금), 카메라는 지금. 사진 날짜는 쓰지 않는다.
// 기록: 홈 → S2는 push 한 번. 카메라 화면은 같은 주소 칸을 하나 더 쌓아 열고(location.state 카메라 키, ?date= 유지),
// 닫기 X·셔터·기기 뒤로 가기는 그 칸을 빼서 이 선택 화면으로 돌아온다(useCaptureSource). S2 → S3·S4는 replace.
import { Button } from '../components/ui'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { analyzeBefore } from '../analysis/analyze'
import { loadNutritionDb } from '../analysis/nutrition/db'
import AnalyzingOverlay from '../components/capture/AnalyzingOverlay'
import { CameraHelp, CaptureChoice } from '../components/capture/CaptureControls'
import {
  describeAnalysisError,
  isAbortError,
  PHOTO_NOTICE,
  readNoticeAck,
  writeNoticeAck,
  type ErrorView,
} from '../components/capture/captureText'
import { useCaptureSource, type PickSource } from '../components/capture/useCaptureSource'
import { dateKeyLabel, isDateKey } from '../components/mealText'
import { createAwaitingMeal, newMealId } from '../data/meals'
import { guessMealType, toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { compressPhoto } from '../photos/compress'
import { readTakenAt } from '../photos/exif'
import type { AfterPageState } from './CaptureAfterPage'

/** 기록 날짜와 끼니를 정할 시각 */
type When = { dateKey: string; mealAt: Date }

export default function CaptureBeforePage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // 들어온 때의 오늘(렌더마다 시계를 읽지 않는다)
  const [today] = useState(() => toDateKey(new Date()))
  const rawDate = params.get('date')
  // 선택 화면 [직접 입력] 날짜 = 홈에서 보던 날짜(없거나 틀리거나 미래면 오늘)
  const manualDate = isDateKey(rawDate) && rawDate <= today ? rawDate : today
  // 고지 확인 창 뒤에 이어서 할 동작(파일 고르기·카메라 열기 중 누른 것)
  const pendingRef = useRef<(() => void) | null>(null)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // 분당 한도 뒤 [다시 시도]용 압축본. 이 화면 메모리에만 둔다(누를 때만 다시 호출, 자동 재시도 없음).
  const lastPhoto = useRef<Blob | null>(null)
  // 그 사진의 기록 날짜와 끼니 기준 시각. [다시 시도]와 분석 실패 뒤 [직접 입력] 날짜에 쓴다.
  const lastWhen = useRef<When | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNotice, setShowNotice] = useState(false)
  const [error, setError] = useState<ErrorView | null>(null)
  const cap = useCaptureSource({
    title: '먹기 전 사진',
    hint: '수저를 함께, 위에서 찍어 주세요',
    onPick: (f, meta) => void onPick(f, meta.source),
  })

  // 결과 화면에서 쓸 식약처 DB JSON을 미리 받아 둔다(실패해도 결과 화면이 다시 시도한다).
  useEffect(() => {
    loadNutritionDb().catch(() => {})
  }, [])
  // 화면을 떠나면 진행 중 분석을 끊는다.
  useEffect(() => () => abortRef.current?.abort(), [])

  // 사진 전송 고지를 아직 확인하지 않았으면 먼저 보이고, 확인하면 누른 동작을 이어서 한다.
  function gated(fn: () => void) {
    if (busyRef.current) return
    if (!readNoticeAck()) {
      pendingRef.current = fn
      setShowNotice(true)
      return
    }
    fn()
  }

  function startCapture() {
    gated(cap.take)
  }

  function acceptNotice() {
    writeNoticeAck()
    setShowNotice(false)
    const fn = pendingRef.current
    pendingRef.current = null
    fn?.()
  }

  // replace: 결과 화면에서 저장(→ '/' replace)하거나 뒤로 가면 홈으로 간다(예전 홈 [직접 입력]과 같은 기록 쌓임).
  function goManual(dateKey: string) {
    abortRef.current?.abort()
    navigate(`/meal/new/review?date=${dateKey}`, { replace: true })
  }
  // 분석이 안 될 때의 [직접 입력]은 방금 고른 사진과 같은 날짜(카메라면 오늘, 앨범이면 홈에서 보던 날짜)
  const goManualNow = () => goManual(lastWhen.current?.dateKey ?? toDateKey(new Date()))

  // 앨범 사진(PC 파일 포함): 날짜는 [직접 입력]과 같은 manualDate, 끼니는 EXIF 찍은 시각(없거나 미래면 지금, 스펙 4.8절).
  // 카메라·capture input 사진은 오늘·지금 시각. EXIF는 이 계산에만 쓰고 저장하지 않는다(압축본에는 EXIF가 없다).
  async function onPick(file: File, source: PickSource) {
    const getWhen =
      source === 'album' ? async () => ({ dateKey: manualDate, mealAt: (await readTakenAt(file)) ?? new Date() }) : undefined
    await run(() => compressPhoto(file), getWhen)
  }

  async function retryLast() {
    const photo = lastPhoto.current
    const when = lastWhen.current
    if (!photo) {
      startCapture()
      return
    }
    await run(async () => photo, async () => when)
  }

  async function run(getPhoto: () => Promise<Blob>, getWhen?: () => Promise<When | null>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    let id: string | null = null
    try {
      // 없으면 카메라 사진: 오늘·지금 시각(스펙 2.2절). readTakenAt은 예외 없이 null을 돌려준다.
      const now = new Date()
      const when = (await getWhen?.()) ?? { dateKey: toDateKey(now), mealAt: now }
      lastWhen.current = when
      const { dateKey } = when
      const mealType = guessMealType(when.mealAt)
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
      lastWhen.current = null
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col px-4 pt-2">
      <div className="flex items-center justify-between text-sm">
        <Link to="/" className="focus-ring flex min-h-11 items-center pr-3 text-ink-2">
          ← 홈
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-bold">식사 기록</h1>
      <p className="mt-2 text-base text-ink">먹기 전 사진은 수저를 함께, 위에서 찍어 주세요</p>
      <CameraHelp cap={cap} disabled={busy} />

      {error && (
        <div role="alert" className="mt-4 rounded-tile border border-red-200 bg-red-50 p-3">
          <p className="font-semibold text-red-800">{error.title}</p>
          <p className="mt-1 text-sm text-red-700">{error.detail}</p>
          {import.meta.env.DEV && error.devCode && <p className="mt-1 text-xs text-ink-2">{error.devCode}</p>}
        </div>
      )}

      <div className="flex-1" />

      <p className="mt-4 text-xs leading-relaxed text-ink-2">{PHOTO_NOTICE}</p>

      <div className="sticky bottom-0 -mx-4 bg-surface/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error?.retry ? (
          <>
            <Button
              full
              type="button"
              onClick={() => void retryLast()}
              disabled={busy}
            >
              다시 시도
            </Button>
            <button
              type="button"
              onClick={startCapture}
              disabled={busy}
              className="focus-ring mt-1 flex min-h-11 w-full items-center justify-center text-sm text-ink-2 underline disabled:opacity-50"
            >
              다시 찍기
            </button>
            <button
              type="button"
              onClick={goManualNow}
              className="focus-ring flex min-h-11 w-full items-center justify-center text-sm text-ink-2 underline"
            >
              직접 입력
            </button>
          </>
        ) : error?.preferManual ? (
          <>
            <Button full type="button" onClick={goManualNow}>
              직접 입력
            </Button>
            <button
              type="button"
              onClick={startCapture}
              disabled={busy}
              className="focus-ring mt-1 flex min-h-11 w-full items-center justify-center text-sm text-ink-2 underline disabled:opacity-50"
            >
              다시 찍기
            </button>
          </>
        ) : (
          <>
            {/* top: 급식 연동(스펙 4.9) "오늘 ○○ 점심 급식인가요?" 카드 자리 */}
            <CaptureChoice
              cap={cap}
              cameraLabel={error ? '다시 찍기' : '카메라로 찍기'}
              disabled={busy}
              gate={gated}
              onManual={() => goManual(manualDate)}
            />
            {manualDate !== today && (
              <p className="mt-2 text-center text-xs text-ink-2">
                {cap.mode === 'pc' && !cap.hasWebcam
                  ? `고른 사진과 직접 입력은 ${dateKeyLabel(manualDate)} 기록으로 들어가요`
                  : `${cap.mode === 'pc' ? '고른 사진' : '앨범 사진'}과 직접 입력은 ${dateKeyLabel(manualDate)}, 카메라로 찍은 사진은 오늘 기록으로 들어가요`}
              </p>
            )}
          </>
        )}
      </div>

      {cap.elements}

      {showNotice && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-[430px] rounded-card bg-surface p-4">
            <p className="font-semibold">사진을 보내기 전에 알려 드려요</p>
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

      {busy && <AnalyzingOverlay label="음식을 알아보고 있어요" manualLabel="직접 입력" onManual={goManualNow} />}
    </main>
  )
}
