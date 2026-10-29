// 호출 A(a11) 실제 1회: 국물 요리 나누기(면·건더기/국물 + ds) 확인. 재시도 없음. 사용: node call_a11.mjs <이미지 파일 이름>
// 사진: Wikimedia Commons — jjamppong.jpg "Jjamppong 4" CC BY 2.0, ramyeon.jpg "Ramyeon and kimchi" CC BY 2.0 (1280px 줄임본)
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const D = 'C:/Users/kkama/dev/hackathon/spike/live/broth/'
const require = createRequire(W + 'package.json')
const { initializeApp } = require('firebase/app')
const { getAI, getGenerativeModel, GoogleAIBackend } = require('firebase/ai')
const bp = await import(pathToFileURL(W + 'src/analysis/beforePrompt.ts').href)
const app = initializeApp({ apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s', authDomain: 'meal-intake-2026.firebaseapp.com', projectId: 'meal-intake-2026', appId: '1:686292653830:web:87f810922b0016e244f087' })
const ai = getAI(app, { backend: new GoogleAIBackend() })
const MODEL = 'gemini-3.5-flash-lite'
const file = process.argv[2]
const model = getGenerativeModel(ai, { model: MODEL, systemInstruction: bp.SYSTEM_INSTRUCTION_A, generationConfig: bp.GENERATION_CONFIG_A })
const img = readFileSync(D + file).toString('base64')
const parts = [{ type: 'text', text: bp.buildUserTextA() }, { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: img } }]
const t0 = Date.now()
const ctl = new AbortController()
const timer = setTimeout(() => ctl.abort(), 25_000)
const out = { file, model: MODEL, prompt: bp.PROMPT_VERSION_A, at: new Date().toISOString() }
try {
  const r = (await model.generateContent(parts, { signal: ctl.signal, timeout: 26_000 })).response
  out.ms = Date.now() - t0
  out.usage = r.usageMetadata
  out.text = r.text()
  const p = bp.parseBeforeText(out.text)
  out.items = p.ok ? p.items.map((x) => ({ name: x.name, grams: x.before_grams, wc: x.whole_count, franchise: x.franchise, brand: x.brand, dish: x.dish, kcal100: x.per_100g_guess?.kcal, na100: x.detail_guess?.sodium_mg })) : p
  out.warnings = p.ok ? p.warnings : undefined
  out.parsed = p.ok ? p.items : undefined
} catch (e) {
  out.ms = Date.now() - t0
  out.error = String(e?.message ?? e).slice(0, 400)
}
clearTimeout(timer)
writeFileSync(D + `live_a11_${file.replace(/\.jpg$/, '')}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify({ ...out, text: undefined }, null, 1))
