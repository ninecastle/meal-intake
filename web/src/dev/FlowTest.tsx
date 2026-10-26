import { useEffect, useRef, useState } from 'react'
import { analyzeAfter, analyzeBefore, getAnalysisMode, getAnalysisOrigin } from '../analysis/analyze'
import { AnalysisError } from '../analysis/errors'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { compressPhoto } from '../photos/compress'
import type { AfterAnalysis, BeforeAnalysis } from '../types/analysis'

// 개발용 흐름 시험 패널.
// 조각 2: 먹기 전 사진 → 압축 → IndexedDB 보관 → 먹기 전 분석.
// 조각 3: 먹은 후 사진(메모리에만) + 보관한 먹기 전 사진·결과 → 먹은 후 분석 → 성공하면 IndexedDB 사진 삭제.
// 조각 4(영양값·섭취량)를 이어 붙인다. 사진 선택 1회 = 분석 1회, 자동 재호출 없음.

type ErrInfo = { stage: string; code?: string; reason?: string; message: string }
type PhotoInfo = { kb: number; width: number; height: number }

// http://192.168.x.x 개발 서버(보안 컨텍스트 아님)에서는 crypto.randomUUID가 없다.
function newMealId(): string {
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

  // 화면을 떠나면 진행 중 요청을 끊고 미리보기 URL을 돌려준다.
  useEffect(() => () => abortRef.current?.abort(), [])
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
      try {
        setResult(await analyzeBefore(compressed, { signal: ac.signal }))
      } finally {
        setElapsedMs(Math.round(performance.now() - t0))
      }
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
  }

  // 먹은 후 사진은 압축본을 이 함수 안에서만 들고 있다(어디에도 저장하지 않음).
  async function onPickAfter(file: File) {
    if (busyRef.current || !mealId || !result) return
    busyRef.current = true
    setBusy(true)
    resetAfter()

    let stage = '먹은 후 압축'
    try {
      const afterPhoto = await compressPhoto(file)

      stage = '먹기 전 사진 꺼내기'
      const beforePhoto = await beforePhotoStore.get(mealId)
      setAfterSentBefore(beforePhoto != null)

      stage = '먹은 후 분석'
      const ac = new AbortController()
      abortRef.current = ac
      const t0 = performance.now()
      let res: AfterAnalysis
      try {
        res = await analyzeAfter({ before: result, beforePhoto, afterPhoto }, { signal: ac.signal })
      } finally {
        setAfterElapsedMs(Math.round(performance.now() - t0))
      }
      setAfter(res)

      // 분석이 성공했을 때만 먹기 전 사진을 지운다(실패하면 다시 시도할 수 있게 남긴다).
      stage = '먹기 전 사진 삭제'
      await beforePhotoStore.remove(mealId)
      const left = await beforePhotoStore.get(mealId)
      setCleanupMsg(left ? '먹기 전 사진이 아직 남아 있음(삭제 실패)' : '먹기 전 사진 삭제됨 — 다시 꺼내 보니 없음')
      setPreview(null)
      setPreviewMsg(null)
    } catch (e) {
      setAfterError(toErr(stage, e))
    } finally {
      abortRef.current = null
      busyRef.current = false
      setBusy(false)
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

  return (
    <div className="mt-2 w-full rounded border border-dashed border-gray-300 p-3 text-left text-xs">
      <p className="font-semibold">흐름 시험 (DEV) · 분석 모드: {showMode(getAnalysisMode())}</p>

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
    </div>
  )
}

// 같은 사진을 다시 고르면 'cache'가 나와야 한다(AI 호출 없음)
function showOrigin(o: ReturnType<typeof getAnalysisOrigin>): string {
  if (!o) return '–'
  const label = { live: '실제 호출', cache: '캐시(호출 안 함)', mock: '목업' }[o.source]
  return o.source === 'live' ? `${label}, 시도 ${o.attempts}회` : label
}
