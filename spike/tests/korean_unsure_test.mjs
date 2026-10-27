// 프롬프트 a4·b2(2026-10-27) 시험: 한국어 경고, 확신 낮은 끝값 → null, 모델 null 유지, 분당 429 재시도 없음. 실제 AI 호출 없음(가짜 모델).
// 실행: node spike/tests/korean_unsure_test.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { registerHooks } from 'node:module'

const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const AICALL = u('src/analysis/aiCall.ts')

registerHooks({
  resolve(spec, ctx, next) {
    // 시험 파일의 'firebase/ai'를 aiCall.ts와 같은 위치 기준으로 찾는다(같은 AIError 클래스를 쓰게).
    if (spec === 'firebase/ai' && !ctx.parentURL?.includes('/web/')) return next(spec, { ...ctx, parentURL: AICALL })
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !path.extname(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
  // aiCall.ts의 import.meta.env.DEV(Vite 전용)는 Node에 없으므로 false로 바꿔 읽는다.
  load(url, ctx, next) {
    const r = next(url, ctx)
    if (url === AICALL) return { ...r, source: String(r.source).replace(/import\.meta\.env\.DEV/g, 'false') }
    return r
  },
})

const A = await import(u('src/analysis/beforePrompt.ts'))
const B = await import(u('src/analysis/afterPrompt.ts'))
const K = await import(u('src/analysis/koreanText.ts'))
const { generateWithRetry, RETRY_DELAY_MS } = await import(AICALL)
const { AnalysisError } = await import(u('src/analysis/errors.ts'))
const { AIError, AIErrorCode } = await import('firebase/ai')

let bad = 0
const ok = (cond, msg) => {
  if (!cond) bad++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
}

// ── 프롬프트 버전·문구 ──
ok(A.PROMPT_VERSION_A === 'a4' && B.PROMPT_VERSION_B === 'b3', `버전 a4·b3 (${A.PROMPT_VERSION_A}·${B.PROMPT_VERSION_B})`)
ok(/한국어로 쓴다/.test(A.SYSTEM_INSTRUCTION_A) && /한국어로 쓴다/.test(B.SYSTEM_INSTRUCTION_B), 'A·B 지시에 한국어 규칙')
ok(/다른 음식, 다른 그릇, 다른 식탁/.test(B.SYSTEM_INSTRUCTION_B) && /remaining_ratio=null/.test(B.SYSTEM_INSTRUCTION_B), 'B 지시에 다른 장면 → null 규칙')
ok(!/안 보이면 remaining_ratio=0/.test(B.SYSTEM_INSTRUCTION_B), 'b1의 "그릇이 안 보이면 0" 규칙 없음')

// ── 호출 A 정리: 영어 경고 → 일반 안내 ──
const rawA = {
  items: [{ id: 'x', name: '불고기 버거', location: '가운데 종이 포장', before_grams: 220, confidence: 0.8, per_100g_guess: { kcal: 250, carbs_g: 25, protein_g: 12, fat_g: 11 }, whole_count: 1 }],
  warnings: ['Lighting is dim', 'The sauce may be hidden', '불고기 버거: 소스가 가려져 있어요'],
}
let ra = A.normalizeBeforeResponse(rawA)
ok(ra.ok && ra.warnings.length === 2 && ra.warnings[0] === K.GENERIC_MODEL_NOTE && ra.warnings[1] === '불고기 버거: 소스가 가려져 있어요', `A: 영어 경고 2개 → 일반 안내 1개, 한국어는 그대로 (${JSON.stringify(ra.warnings)})`)

// ── 호출 B 정리 ──
const before = [
  { id: 'i1', name: '불고기 버거', location: '가운데 종이 포장', before_grams: 220, confidence: 0.8, per_100g_guess: null, whole_count: 1 },
  { id: 'i2', name: '감자튀김', location: '오른쪽 빨간 종이 상자', before_grams: 110, confidence: 0.8, per_100g_guess: null, whole_count: 1 },
  { id: 'i3', name: '콜라', location: '왼쪽 종이컵', before_grams: 400, confidence: 0.7, per_100g_guess: null, whole_count: 1 },
  { id: 'i4', name: '케첩', location: '앞쪽 작은 봉지', before_grams: 10, confidence: 0.6, per_100g_guess: null, whole_count: null },
  { id: 'i5', name: '양배추 샐러드', location: '오른쪽 위 작은 컵', before_grams: 80, confidence: 0.6, per_100g_guess: null, whole_count: null },
  { id: 'i6', name: '치킨 너겟', location: '앞쪽 종이 상자', before_grams: 100, confidence: 0.8, per_100g_guess: null, whole_count: null },
  { id: 'i7', name: '아이스크림', location: '오른쪽 앞 컵', before_grams: 120, confidence: 0.8, per_100g_guess: null, whole_count: 1 },
]
const unsure = (n) => B.unsureRatioWarning(n)
// 사용자 사례: 다른 음식처럼 보여 "버거는 그대로"(1.0)로 가정, 영어 경고
let rb = B.normalizeAfterResponse({
  items: [
    { id: 'i1', remaining_ratio: 1, confidence: 0.4 }, // 가정한 그대로 → null
    { id: 'i2', remaining_ratio: 0.96, confidence: 59 }, // 0~100 척도 59 → 0.59 → null
    { id: 'i3', remaining_ratio: 1, confidence: 0.6 }, // 경계: 0.6은 그대로 둔다
    { id: 'i4', remaining_ratio: 0, confidence: 0.4 }, // 가정한 다 먹음 → null
    { id: 'i5', remaining_ratio: 0.9, confidence: 0.3 }, // 끝값 아님 → 그대로
    { id: 'i6', remaining_ratio: 0, confidence: 0.85 }, // 빈 상자가 보여 확신 → 0 그대로
    { id: 'i7', remaining_ratio: 0.05, confidence: 0.5 }, // 아래쪽 경계 0.05 → null
  ],
  warnings: ['The after photo appears to show a different meal; assuming the burger is unchanged.'],
}, before)
const ratios = rb.ok ? rb.items.map((i) => i.remaining_ratio) : null
ok(rb.ok && JSON.stringify(ratios) === JSON.stringify([null, null, 1, null, 0.9, 0, null]), `B: 끝값·낮은 확신만 null (${JSON.stringify(ratios)})`)
ok(rb.ok && rb.items[0].confidence === 0.4 && rb.items[1].confidence === 0.59, 'B: null로 바꿔도 confidence는 그대로')
ok(rb.ok && rb.warnings[0] === K.GENERIC_MODEL_NOTE, 'B: 영어 경고 → 일반 안내가 맨 앞')
ok(rb.ok && ['불고기 버거', '감자튀김', '케첩', '아이스크림'].every((n) => rb.warnings.includes(unsure(n))), 'B: null로 바꾼 4개에 한국어 경고')
ok(rb.ok && !rb.warnings.some((w) => /콜라|양배추|너겟/.test(w)), 'B: 그대로 둔 항목에는 경고 없음')
ok(rb.ok && rb.warnings.every((w) => K.isKoreanText(w)), 'B: 경고가 모두 한국어')

// 모델의 null 유지: 모델 경고가 이름을 말하면 경고를 더하지 않고, 영어라 일반 안내로 바뀌면 한국어 경고를 넣는다
rb = B.normalizeAfterResponse({
  items: [
    { id: 'i1', remaining_ratio: null, confidence: 0.2 },
    { id: 'i2', remaining_ratio: null, confidence: 0.9 },
    { id: 'i3', remaining_ratio: 0.5, confidence: 0.8 },
    { id: 'i4', remaining_ratio: 0.2, confidence: 0.8 },
    { id: 'i5', remaining_ratio: 0.5, confidence: 0.8 },
    { id: 'i6', remaining_ratio: 0.5, confidence: 0.8 },
    { id: 'i7', remaining_ratio: 0.5, confidence: 0.8 },
  ],
  warnings: ['불고기 버거: 먹은 후 사진이 다른 음식처럼 보여 남은 양을 판단할 수 없어요', 'Fries container not visible'],
}, before)
ok(rb.ok && rb.items[0].remaining_ratio === null && rb.items[1].remaining_ratio === null && rb.items[1].confidence === 0.9, 'B: 모델 null은 null 그대로(확신 높아도)')
ok(rb.ok && !rb.warnings.includes(unsure('불고기 버거')) && rb.warnings.includes(unsure('감자튀김')), 'B: 이름 있는 모델 경고면 추가 안 함, 없으면 한국어 경고 추가')
ok(rb.ok && rb.warnings.filter((w) => w === K.GENERIC_MODEL_NOTE).length === 1, 'B: 일반 안내는 한 번만')

// 목업 픽스처(after-bibimbap, b3 형식): i4 unclear → null, i5 not_visible → 0, i6 1·0.6은 경계라 그대로(b3 규칙은 b3_test.mjs)
const fxB = JSON.parse(readFileSync(W + 'src/analysis/__fixtures__/after-bibimbap.json', 'utf8'))
const fxA = A.normalizeBeforeResponse(JSON.parse(readFileSync(W + 'src/analysis/__fixtures__/before-bibimbap.json', 'utf8')))
rb = fxA.ok ? B.normalizeAfterResponse(fxB, fxA.items) : { ok: false }
ok(rb.ok && JSON.stringify(rb.items.map((i) => i.remaining_ratio)) === JSON.stringify([0.3, 0, 1, null, 0, 1]), `목업 픽스처 남긴 비율 (${JSON.stringify(rb.ok && rb.items.map((i) => i.remaining_ratio))})`)

// ── aiCall: 가짜 모델 ──
const okResponse = (text) => ({ response: { candidates: [{ finishReason: 'STOP' }], text: () => text } })
function fakeModel(behave) {
  const m = { calls: 0, async generateContent() { m.calls++; return behave(m.calls) } }
  return m
}
const err429 = (msg) => new AIError(AIErrorCode.FETCH_ERROR, msg, { status: 429, statusText: 'Too Many Requests', errorDetails: [] })
const parse = (t) => ({ ok: true, value: t })
async function run(model) {
  const t0 = Date.now()
  try {
    const r = await generateWithRetry({ model, parts: [{ text: 'x' }], parse, label: '시험' })
    return { r, ms: Date.now() - t0 }
  } catch (e) {
    return { e, ms: Date.now() - t0 }
  }
}
let m = fakeModel(() => { throw err429('Quota exceeded for metric generate_content_free_tier_requests, limit: 15 per minute (GenerateRequestsPerMinutePerProjectPerModel-FreeTier)') })
let out = await run(m)
ok(out.e instanceof AnalysisError && out.e.code === 'ANALYSIS_UNAVAILABLE' && out.e.reason === 'quota' && out.e.quotaScope === 'minute', `분당 429 → ANALYSIS_UNAVAILABLE·quota·minute (${out.e?.code}/${out.e?.reason}/${out.e?.quotaScope})`)
ok(m.calls === 1 && out.ms < RETRY_DELAY_MS, `분당 429 재시도 없음: 호출 ${m.calls}회, ${out.ms}ms`)
m = fakeModel(() => { throw err429('Quota exceeded, limit: 500 per day (GenerateRequestsPerDayPerProjectPerModel-FreeTier)') })
out = await run(m)
ok(out.e?.quotaScope === 'day' && m.calls === 1, `일일 429 → day, 호출 ${m.calls}회`)
m = fakeModel((n) => { if (n === 1) throw new AIError(AIErrorCode.FETCH_ERROR, 'Service Unavailable', { status: 503, statusText: 'Service Unavailable' }); return okResponse('{"ok":1}') })
out = await run(m)
ok(out.r?.attempts === 2 && m.calls === 2 && out.ms >= RETRY_DELAY_MS - 50, `503은 2초 뒤 1회 재시도해 성공(호출 ${m.calls}회, ${out.ms}ms)`)

console.log(bad === 0 ? '\n모두 통과' : `\n실패 ${bad}개`)
process.exit(bad === 0 ? 0 : 1)
