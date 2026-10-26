// 조각 3 시험: afterPrompt.ts 정리 규칙 오프라인 검사 + 실제 호출 B 1회(재시도 없음).
// 실행: cd web && node --input-type=module < after_test.mjs [LIVE=1]
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { initializeApp } from 'firebase/app'
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'

const ROOT = 'C:/Users/kkama/dev/hackathon'
const P = await import(pathToFileURL(`${ROOT}/web/src/analysis/afterPrompt.ts`).href)

// ── 오프라인 검사 ──
const before6 = JSON.parse(readFileSync(`${ROOT}/web/src/analysis/__fixtures__/before-bibimbap.json`, 'utf8')).items
const fx = JSON.parse(readFileSync(`${ROOT}/web/src/analysis/__fixtures__/after-bibimbap.json`, 'utf8'))
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) }
let r = P.normalizeAfterResponse(fx, before6)
assert(r.ok && r.items.map((i) => i.remaining_ratio).join() === '0.3,0,1,,0,1', '픽스처 6개 그대로')
r = P.normalizeAfterResponse({ items: [{ id: 'i9', remaining_ratio: 0.5, confidence: 0.9 }, { id: 'i1', remaining_ratio: 1.4, confidence: 90 }, { id: 'i1', remaining_ratio: 0.2, confidence: 1 }], warnings: [] }, before6)
assert(r.ok && r.items.length === 6 && r.items[0].remaining_ratio === null && r.items[0].confidence === 0.9, '1.4 → null, 90 → 0.9, 중복 무시')
assert(r.ok && r.items.slice(1).every((i) => i.remaining_ratio === null && i.confidence === 0), '빠진 id → null·0')
assert(r.ok && r.warnings.some((w) => w.includes('i9')) && r.warnings.some((w) => w.includes('0~1 밖')) && r.warnings.some((w) => w.includes('두 번')), '경고 3종')
assert(!P.normalizeAfterResponse({ items: [{ id: 'x', remaining_ratio: 0 }] }, before6).ok, '맞는 id 0개 → 형식 오류')
assert(!P.parseAfterText('not json', before6).ok, 'JSON 실패 → 형식 오류')
r = P.normalizeAfterResponse({ items: [], warnings: ['안 보임'] }, before6)
assert(r.ok && r.items.every((i) => i.remaining_ratio === null), '빈 items → 전부 null')
console.log('목록 텍스트:', P.buildBeforeItemsText(P.buildBeforeItemsJson(before6.slice(0, 2))))

if (process.env.LIVE !== '1') process.exit()

// ── 실제 호출 B 1회 ── 먹기 전·먹은 후 모두 spike/bibimbap.jpg(같은 사진). a1 시험 결과를 목록으로 쓴다(location은 재구성).
const before = [{ id: 'i1', name: '돌솥비빔밥', location: '가운데 검은 돌솥', before_grams: 450, confidence: 0.95, per_100g_guess: null }]
const app = initializeApp({
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain: 'meal-intake-2026.firebaseapp.com',
  projectId: 'meal-intake-2026',
  appId: '1:686292653830:web:87f810922b0016e244f087',
})
const ai = getAI(app, { backend: new GoogleAIBackend() })
const model = getGenerativeModel(ai, { model: 'gemini-3.5-flash-lite', systemInstruction: P.SYSTEM_INSTRUCTION_B, generationConfig: P.GENERATION_CONFIG_B }, { timeout: 21000 })
const img = readFileSync(`${ROOT}/spike/bibimbap.jpg`).toString('base64')
const parts = [
  { type: 'text', text: P.buildBeforeItemsText(P.buildBeforeItemsJson(before)) },
  { type: 'text', text: P.USER_TEXT_BEFORE_PHOTO },
  { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: img } },
  { type: 'text', text: P.USER_TEXT_AFTER_PHOTO },
  { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: img } },
]
const t0 = Date.now()
const out = { at: new Date().toISOString(), model: 'gemini-3.5-flash-lite', prompt_version: P.PROMPT_VERSION_B }
try {
  const res = await model.generateContent({ contents: [{ role: 'user', parts }] })
  out.ms = Date.now() - t0
  out.finishReason = res.response.candidates?.[0]?.finishReason
  out.usage = res.response.usageMetadata
  out.text = res.response.text()
  out.normalized = P.parseAfterText(out.text, before)
} catch (e) {
  out.ms = Date.now() - t0
  out.error = { name: e?.name, code: e?.code, message: String(e?.message).slice(0, 500), status: e?.customErrorData?.status }
}
writeFileSync('C:/Users/kkama/dev/hackathon/spike/results/after_live.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
