import { useEffect, useRef, useState } from 'react'
import { analyzeAfter, analyzeBefore, getAnalysisMode, getAnalysisOrigin } from '../analysis/analyze'
import { assembleAnalysis } from '../analysis/assemble'
import { buildAnalysis } from '../analysis/compute'
import { AnalysisError } from '../analysis/errors'
import { validateAnalysis } from '../analysis/validate'
import ReviewEditor from '../components/review/ReviewEditor'
import {
  createAwaitingMeal,
  deleteMeal,
  getMeal,
  listRecentMeals,
  newMealId as newMealDocId,
  saveMeal,
  saveReview,
  subscribePending,
  type MealType,
  type MealWithId,
} from '../data/meals'
import { auth } from '../lib/firebase'
import { guessMealType, toDateKey } from '../lib/time'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { compressPhoto } from '../photos/compress'
import { isSamePhoto } from '../photos/samePhoto'
import type { AfterAnalysis, BeforeAnalysis, MealIntakeAnalysis } from '../types/analysis'

// 개발용 흐름 시험 패널.
// 조각 2: 먹기 전 사진 → 압축 → IndexedDB 보관 → 먹기 전 분석.
// 조각 3: 먹은 후 사진(메모리에만) + 보관한 먹기 전 사진·결과 → 먹은 후 분석 → 성공하면 IndexedDB 사진 삭제.
// 조각 4: 먹은 후 분석이 끝나면 영양값 조회(DB → AI 추정) → 섭취량 계산.
// 2단계 조각 1: 먹은 후 분석 전에 같은 사진인지 확인(같으면 사용자가 고를 때까지 호출 안 함),
//   결과는 편집기(ReviewEditor)로 고친다. "직접 입력으로 시작"은 사진 없이 빈 분석으로 편집기를 연다.
// 2단계 조각 3: 로그인한 사용자 기록으로 Firestore에 저장한다. 먹기 전 분석 성공 → awaiting_after,
//   먹은 후 분석·조립 성공 → needs_review, [저장] → done. 대기 목록·최근 기록·다른 사람 기록 읽기 시도(거부 확인).
// 사진 선택 1회 = 분석 1회, 자동 재호출 없음. 영양값 단계는 먹기 전 추정값이 없는 음식에만 AI 호출(호출 D)을 한다.

type ErrInfo = { stage: string; code?: string; reason?: string; message: string }
type PhotoInfo = { kb: number; width: number; height: number }
type StoredBefore = Awaited<ReturnType<typeof beforePhotoStore.get>>
type MealMeta = { dateKey: string; mealType: MealType }

// 로그인했으면 Firestore 문서 id(IndexedDB 키와 같다), 아니면 로컬 id
function newMealId(): string {
  const uid = auth.currentUser?.uid
  return uid ? newMealDocId(uid) : newLocalId()
}

// http://192.168.x.x 개발 서버(보안 컨텍스트 아님)에서는 crypto.randomUUID가 없다.
function newLocalId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function measure(blob: Blob): Promise<PhotoInfo> {
  const kb = Math.round(blob.size / 102.4) / 10
  try {
    const bmp = await createImageBitmap(blob)
    const info = { kb, width: bmp.width, height: bmp.height }
    bmp.close()
    return info
  } catch {
    return { kb, width: 0, height: 0 }
  }
}

function toErr(stage: string, e: unknown): ErrInfo {
  if (e instanceof AnalysisError) return { stage, code: e.code, reason: e.reason, message: e.message }
  return { stage, message: e instanceof Error ? e.message : String(e) }
}

function showMode(m: unknown): string {
  return typeof m === 'string' ? m : JSON.stringify(m)
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export default function FlowTest() {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const [mealId, setMealId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PhotoInfo | null>(null)
  const [where, setWhere] = useState<'idb' | 'memory' | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [result, setResult] = useState<BeforeAnalysis | null>(null)
  const [error, setError] = useState<ErrInfo | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  const [after, setAfter] = useState<AfterAnalysis | null>(null)
  const [afterError, setAfterError] = useState<ErrInfo | null>(null)
  const [afterElapsedMs, setAfterElapsedMs] = useState<number | null>(null)
  const [afterSentBefore, setAfterSentBefore] = useState<boolean | null>(null)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  // 먹기 전과 같은 사진: 사용자가 고를 때까지 압축본을 메모리에만 들고 있는다(저장하지 않음)
  const [samePending, setSamePending] = useState<{ beforePhoto: Blob; afterPhoto: Blob } | null>(null)
  const [meal, setMeal] = useState<MealIntakeAnalysis | null>(null)
  const [mealElapsedMs, setMealElapsedMs] = useState<number | null>(null)
  // 새 분석이 들어오면 편집기 상태(순서·되돌리기)를 새로 시작한다
  const [editorKey, setEditorKey] = useState(0)
  // Firestore 저장(조각 3)
  const [mealMeta, setMealMeta] = useState<MealMeta | null>(null)
  const [storeLog, setStoreLog] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState<MealWithId[] | null>(null)
  const [recent, setRecent] = useState<MealWithId[] | null>(null)
  const [otherReadMsg, setOtherReadMsg] = useState<string | null>(null)
  const uid = auth.currentUser?.uid ?? null

  // 화면을 떠나면 진행 중 요청을 끊고 미리보기 URL을 돌려준다.
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (!uid) return
    return subscribePending(uid, setPending, (code) => log(`대기 목록 구독 오류: ${code}`))
  }, [uid])

  function log(msg: string) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setStoreLog((l) => [`${t} ${msg}`, ...l].slice(0, 8))
  }

  // 쓰기 Promise는 서버가 확인해야 끝난다(오프라인이면 대기). 화면은 기다리지 않고 결과만 기록한다.
  function track(label: string, p: Promise<void>) {
    log(`${label} 보냄`)
    p.then(
      () => log(`${label} 완료`),
      (e: unknown) => log(`${label} 실패: ${e instanceof Error ? e.message : String(e)}`),
    )
  }
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function onPick(file: File) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setPhoto(null)
    setWhere(null)
    setElapsedMs(null)
    setResult(null)
    setError(null)
    setPreview(null)
    setPreviewMsg(null)
    resetAfter()

    const id = newMealId()
    setMealId(id)
    // dateKey·끼니는 먹기 전 촬영 시각 기준(스펙 2.2절)
    const now = new Date()
    const meta: MealMeta = { dateKey: toDateKey(now), mealType: guessMealType(now) }
    setMealMeta(meta)
    let stage = '압축'
    try {
      const compressed = await compressPhoto(file)
      setPhoto(await measure(compressed))

      stage = '보관'
      setWhere(await beforePhotoStore.put(id, compressed))

      stage = '먹기 전 분석'
      const ac = new AbortController()
      abortRef.current = ac
      const t0 = performance.now()
      let res: BeforeAnalysis
      try {
        res = await analyzeBefore(compressed, { signal: ac.signal })
      } finally {
        setElapsedMs(Math.round(performance.now() - t0))
      }
      setResult(res)
      if (uid) track('먹기 전 기록(awaiting_after)', createAwaitingMeal(uid, id, { ...meta, beforeAnalysis: res }))
    } catch (e) {
      setError(toErr(stage, e))
    } finally {
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
    }
  }

  function resetAfter() {
    setAfter(null)
    setAfterError(null)
    setAfterElapsedMs(null)
    setAfterSentBefore(null)
    setCleanupMsg(null)
    setSamePending(null)
    setMeal(null)
    setMealElapsedMs(null)
  }

  // 먹은 후 사진은 압축본을 메모리에만 들고 있다(어디에도 저장하지 않음).
  async function onPickAfter(file: File) {
    if (busyRef.current || !mealId || !result) return
    const id = mealId
    const before = result
    busyRef.current = true
    setBusy(true)
    resetAfter()

    let stage = '먹은 후 압축'
    try {
      const afterPhoto = await compressPhoto(file)

      stage = '먹기 전 사진 꺼내기'
      const beforePhoto = await beforePhotoStore.get(id)

      // 분석 호출 전에 비교한다. 같으면 [그대로 분석]을 누르기 전에는 호출하지 않는다(한도 절약).
      stage = '같은 사진 확인'
      if (beforePhoto && (await isSamePhoto(beforePhoto, afterPhoto))) {
        setSamePending({ beforePhoto, afterPhoto })
        return
      }
      await runAfter(id, before, beforePhoto, afterPhoto)
    } catch (e) {
      setAfterError(toErr(stage, e))
    } finally {
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
    }
  }

  async function analyzeSameAnyway() {
    const p = samePending
    if (!p || busyRef.current || !mealId || !result) return
    busyRef.current = true
    setBusy(true)
    setSamePending(null)
    try {
      await runAfter(mealId, result, p.beforePhoto, p.afterPhoto)
    } finally {
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
    }
  }

  function pickOtherAfter() {
    setSamePending(null)
    afterInputRef.current?.click()
  }

  // 먹은 후 분석 → 성공하면 먹기 전 사진 삭제 → 영양값 계산. 오류는 afterError로 보인다. busy는 호출한 쪽이 잡는다.
  async function runAfter(id: string, before: BeforeAnalysis, beforePhoto: StoredBefore, afterPhoto: Blob) {
    setAfterSentBefore(beforePhoto != null)
    let stage = '먹은 후 분석'
    try {
      const ac = new AbortController()
      abortRef.current = ac
      const t0 = performance.now()
      let res: AfterAnalysis
      try {
        res = await analyzeAfter({ before, beforePhoto, afterPhoto }, { signal: ac.signal })
      } finally {
        setAfterElapsedMs(Math.round(performance.now() - t0))
      }
      setAfter(res)

      // 분석이 성공했을 때만 먹기 전 사진을 지운다(실패하면 다시 시도할 수 있게 남긴다).
      stage = '먹기 전 사진 삭제'
      await beforePhotoStore.remove(id)
      const left = await beforePhotoStore.get(id)
      setCleanupMsg(left ? '먹기 전 사진이 아직 남아 있음(삭제 실패)' : '먹기 전 사진 삭제됨 — 다시 꺼내 보니 없음')
      setPreview(null)
      setPreviewMsg(null)

      stage = '영양값 계산'
      const t1 = performance.now()
      try {
        const assembled = await assembleAnalysis(before, res, { signal: ac.signal })
        setMeal(assembled)
        setEditorKey((k) => k + 1)
        if (uid) track('먹은 후 결과(needs_review)', saveReview(uid, id, assembled))
      } finally {
        setMealElapsedMs(Math.round(performance.now() - t1))
      }
    } catch (e) {
      setAfterError(toErr(stage, e))
    }
  }

  // 사진 없이 빈 분석으로 편집기를 연다(AI 호출 없음)
  function startManual() {
    if (busyRef.current) return
    resetAfter()
    setResult(null)
    setError(null)
    setPhoto(null)
    setWhere(null)
    setElapsedMs(null)
    setMealId(newMealId())
    const now = new Date()
    setMealMeta({ dateKey: toDateKey(now), mealType: guessMealType(now) })
    setMeal(buildAnalysis([], []))
    setEditorKey((k) => k + 1)
  }

  // [저장] → done. 직접 입력이면 문서를 새로 만든다.
  async function saveDone() {
    if (!uid || !mealId || !mealMeta || !meal || saving) return
    setSaving(true)
    log('저장(done) 보냄')
    try {
      await saveMeal(uid, mealId, { ...mealMeta, analysis: meal })
      log('저장(done) 완료')
      void loadRecent()
    } catch (e) {
      log(`저장(done) 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function loadRecent() {
    if (!uid) return
    try {
      setRecent(await listRecentMeals(uid, 5))
    } catch (e) {
      log(`최근 기록 불러오기 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function removeMeal(id: string) {
    if (!uid) return
    try {
      await deleteMeal(uid, id)
      await beforePhotoStore.remove(id)
      log(`삭제 완료: ${id.slice(0, 8)}`)
      void loadRecent()
    } catch (e) {
      log(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 보안 규칙 확인: 다른 사람 경로를 읽으면 거부돼야 한다
  async function tryReadOthers() {
    setOtherReadMsg('읽는 중…')
    try {
      const m = await getMeal(`not-me-${Date.now()}`, 'probe')
      setOtherReadMsg(`⚠ 읽기가 허용됨(규칙 문제): ${m ? '문서 있음' : '문서 없음'}`)
    } catch (e) {
      setOtherReadMsg(`거부됨(정상): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function showStored() {
    if (!mealId) return
    const blob = await beforePhotoStore.get(mealId)
    if (!blob) {
      setPreview(null)
      setPreviewMsg('보관된 사진 없음')
      return
    }
    setPreview(URL.createObjectURL(blob))
    setPreviewMsg(`${Math.round(blob.size / 102.4) / 10} KB`)
  }

  async function removeStored() {
    if (!mealId) return
    await beforePhotoStore.remove(mealId)
    setPreview(null)
    setPreviewMsg('보관 사진 지움')
  }

  const check = meal ? validateAnalysis(meal) : null

  return (
    <div className="mt-2 w-full rounded border border-dashed border-gray-300 p-3 text-left text-xs">
      <p className="font-semibold">흐름 시험 (DEV) · 분석 모드: {showMode(getAnalysisMode())}</p>

      <button
        type="button"
        onClick={startManual}
        disabled={busy}
        className="mt-2 min-h-11 rounded border border-gray-400 px-3 disabled:opacity-50"
      >
        직접 입력으로 시작 (사진 없이 편집기 시험)
      </button>

      <label className="mt-2 block text-gray-600">
        먹기 전 사진 (선택 1회 = 분석 1회)
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onPick(f)
          }}
          className="mt-1 block w-full text-xs disabled:opacity-50"
        />
      </label>

      <div className="mt-2 space-y-0.5 break-all text-gray-700">
        {busy && <p className="text-amber-600">진행 중…</p>}
        <p>mealId: {mealId ?? '–'}</p>
        <p>
          압축본: {photo ? `${photo.kb} KB · ${photo.width}×${photo.height}` : '–'} · 저장 위치: {where ?? '–'}
        </p>
        <p>분석 소요: {elapsedMs == null ? '–' : `${elapsedMs} ms`}</p>
        <p>결과 출처: {showOrigin(result ? getAnalysisOrigin(result) : null)}</p>
        {error && (
          <p className="text-red-600">
            오류({error.stage}): {error.code ?? '-'} / {error.reason ?? '-'} — {error.message}
          </p>
        )}
      </div>

      {result && (
        <>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-normal">이름</th>
                <th className="text-left font-normal">위치</th>
                <th className="text-right font-normal">g</th>
                <th className="text-right font-normal">신뢰도</th>
                <th className="text-right font-normal">kcal/100g</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it) => (
                <tr key={it.id} className="border-t border-gray-100">
                  <td className="py-0.5">{it.name}</td>
                  <td>{it.location}</td>
                  <td className="text-right">{Math.round(it.before_grams)}</td>
                  <td className="text-right">{pct(it.confidence)}</td>
                  <td className="text-right">{it.per_100g_guess ? Math.round(it.per_100g_guess.kcal) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-amber-700">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-gray-500">
            model: {result.model} · prompt: {result.prompt_version}
          </p>
        </>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void showStored()}
          disabled={!mealId || busy}
          className="rounded bg-gray-800 px-2 py-1 text-white disabled:opacity-50"
        >
          IndexedDB 보관 사진 확인
        </button>
        <button
          type="button"
          onClick={() => void removeStored()}
          disabled={!mealId || busy}
          className="rounded border border-gray-400 px-2 py-1 disabled:opacity-50"
        >
          보관 사진 지우기
        </button>
      </div>
      {previewMsg && <p className="mt-1 text-gray-600">{previewMsg}</p>}
      {preview && <img src={preview} alt="보관된 먹기 전 사진" className="mt-1 max-h-32 rounded" />}

      {result && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <label className="block text-gray-600">
            먹은 후 사진 (선택 1회 = 분석 1회, 사진은 저장하지 않음)
            <input
              ref={afterInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onPickAfter(f)
              }}
              className="mt-1 block w-full text-xs disabled:opacity-50"
            />
          </label>

          {samePending && (
            <div className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-sm">
              <p className="font-semibold text-amber-800">먹기 전과 같은 사진이에요</p>
              <p className="text-xs text-amber-800">다 먹은 뒤의 접시를 찍었는지 확인해 주세요. 아직 분석을 호출하지 않았어요.</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={pickOtherAfter}
                  className="min-h-11 flex-1 rounded bg-gray-900 px-2 text-white"
                >
                  다른 사진 고르기
                </button>
                <button
                  type="button"
                  onClick={() => void analyzeSameAnyway()}
                  disabled={busy}
                  className="min-h-11 flex-1 rounded border border-gray-400 px-2 disabled:opacity-50"
                >
                  그대로 분석
                </button>
              </div>
            </div>
          )}

          <div className="mt-2 space-y-0.5 break-all text-gray-700">
            <p>
              먹기 전 사진 함께 보냄: {afterSentBefore == null ? '–' : afterSentBefore ? '예' : '아니요(텍스트만)'}
              {after && ` · 모델 응답 used_before_photo: ${after.used_before_photo}`}
            </p>
            <p>분석 소요: {afterElapsedMs == null ? '–' : `${afterElapsedMs} ms`}</p>
            <p>결과 출처: {showOrigin(after ? getAnalysisOrigin(after) : null)}</p>
            {cleanupMsg && <p className="text-green-700">{cleanupMsg}</p>}
            {afterError && (
              <p className="text-red-600">
                오류({afterError.stage}): {afterError.code ?? '-'} / {afterError.reason ?? '-'} — {afterError.message}
              </p>
            )}
          </div>

          {after && (
            <>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left font-normal">이름</th>
                    <th className="text-right font-normal">먹기 전 g</th>
                    <th className="text-right font-normal">남긴 비율</th>
                    <th className="text-right font-normal">신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((it) => {
                    const a = after.items.find((x) => x.id === it.id)
                    return (
                      <tr key={it.id} className="border-t border-gray-100">
                        <td className="py-0.5">{it.name}</td>
                        <td className="text-right">{Math.round(it.before_grams)}</td>
                        <td className="text-right">
                          {a?.remaining_ratio == null ? <span className="text-amber-700">확인 필요</span> : pct(a.remaining_ratio)}
                        </td>
                        <td className="text-right">{a ? pct(a.confidence) : '–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {after.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-amber-700">
                  {after.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-gray-500">
                model: {after.model} · prompt: {after.prompt_version}
              </p>
            </>
          )}
        </div>
      )}

      {meal && check && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <p className="font-semibold">결과 확인·수정 (2단계 조각 1)</p>
          <p className="text-gray-700">
            계산 소요: {mealElapsedMs == null ? '–' : `${mealElapsedMs} ms`} · 검증:{' '}
            {check.ok ? (
              <span className="text-green-700">
                통과{check.warnings.length > 0 && ` (경고 ${check.warnings.length}개)`}
              </span>
            ) : (
              <span className="text-red-600">실패 — {check.errors.join(' / ')}</span>
            )}
          </p>
          <div className="mt-2">
            <ReviewEditor key={editorKey} analysis={meal} onChange={setMeal} />
          </div>
          {meal.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-amber-700">
              {meal.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-gray-500">prompt: {meal.prompt_version ?? '–'}</p>
          <button
            type="button"
            onClick={() => void saveDone()}
            disabled={!uid || !mealId || !mealMeta || saving || !check.ok || meal.items.length === 0}
            className="mt-2 min-h-11 w-full rounded bg-gray-900 px-3 text-sm text-white disabled:opacity-50"
          >
            {saving ? '저장 중…' : `저장 (done · ${mealMeta?.dateKey ?? '–'} · ${mealMeta?.mealType ?? '–'})`}
          </button>
        </div>
      )}

      <div className="mt-3 border-t border-gray-200 pt-2 text-gray-700">
        <p className="font-semibold">Firestore 기록 (2단계 조각 3)</p>
        {!uid && <p className="text-red-600">로그인하지 않아 저장하지 않습니다.</p>}
        <ul className="mt-1 space-y-0.5 break-all">
          {storeLog.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>

        <p className="mt-2 font-semibold">대기 중 (awaiting_after · needs_review, 실시간)</p>
        {pending == null ? (
          <p>–</p>
        ) : pending.length === 0 ? (
          <p>없음</p>
        ) : (
          <ul>
            {pending.map((m) => (
              <li key={m.id}>
                {m.id.slice(0, 8)} · {m.status} · {m.dateKey} · {m.mealType}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadRecent()}
            disabled={!uid}
            className="min-h-11 rounded border border-gray-400 px-3 disabled:opacity-50"
          >
            내 최근 기록 5건
          </button>
          <button
            type="button"
            onClick={() => void tryReadOthers()}
            className="min-h-11 rounded border border-gray-400 px-3"
          >
            다른 사람 기록 읽기 시도
          </button>
        </div>
        {otherReadMsg && <p className="mt-1">{otherReadMsg}</p>}
        {recent && (
          <ul className="mt-1 space-y-1">
            {recent.length === 0 && <li>기록 없음</li>}
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1">
                <span className="break-all">
                  {m.id.slice(0, 8)} · {m.status} · {m.dateKey} · {m.mealType} ·{' '}
                  {m.consumedKcal != null ? `${Math.round(m.consumedKcal)}kcal` : '–'} ·{' '}
                  {(m.analysis?.items ?? m.beforeAnalysis?.items ?? []).map((it) => it.name).join(', ') || '음식 없음'}
                </span>
                <button
                  type="button"
                  onClick={() => void removeMeal(m.id)}
                  className="min-h-11 shrink-0 rounded border border-red-300 px-2 text-red-700"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// 같은 사진을 다시 고르면 'cache'가 나와야 한다(AI 호출 없음)
function showOrigin(o: ReturnType<typeof getAnalysisOrigin>): string {
  if (!o) return '–'
  const label = { live: '실제 호출', cache: '캐시(호출 안 함)', mock: '목업' }[o.source]
  return o.source === 'live' ? `${label}, 시도 ${o.attempts}회` : label
}
