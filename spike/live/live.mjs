// 실제 호출 1회(재시도 없음). 사용: node live.mjs d | a
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const require = createRequire(W + 'package.json')
const { initializeApp } = require('firebase/app')
const { getAI, getGenerativeModel, GoogleAIBackend } = require('firebase/ai')
const bp = await import(pathToFileURL(W + 'src/analysis/beforePrompt.ts').href)
const app = initializeApp({ apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s', authDomain: 'meal-intake-2026.firebaseapp.com', projectId: 'meal-intake-2026', appId: '1:686292653830:web:87f810922b0016e244f087' })
const ai = getAI(app, { backend: new GoogleAIBackend() })
const MODEL = 'gemini-3.5-flash-lite'
const mode = process.argv[2]
let model, parts, timeout
if (mode === 'd') {
  // estimate.ts buildPromptD·GENERATION_CONFIG_D와 같은 문장·설정
  const name = '양념치킨 순살'
  model = getGenerativeModel(ai, { model: MODEL, generationConfig: { responseMimeType: 'application/json', responseSchema: bp.PER100_SCHEMA, thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 1024 } })
  parts = [{ type: 'text', text: `"${name}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 일반적인 조리 기준으로 추정하라.` }]
  timeout = 10_000
} else {
  model = getGenerativeModel(ai, { model: MODEL, systemInstruction: bp.SYSTEM_INSTRUCTION_A, generationConfig: bp.GENERATION_CONFIG_A })
  const img = readFileSync('C:/Users/kkama/dev/hackathon/spike/bibimbap.jpg').toString('base64')
  parts = [{ type: 'text', text: bp.USER_TEXT_A }, { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: img } }]
  timeout = 20_000
}
const t0 = Date.now()
const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout)
const out = { mode, model: MODEL, at: new Date().toISOString() }
try {
  const r = (await model.generateContent(parts, { signal: ctl.signal, timeout: timeout + 1000 })).response
  out.ms = Date.now() - t0; out.finish = r.candidates?.[0]?.finishReason; out.usage = r.usageMetadata; out.text = r.text()
  out.parsed = mode === 'd' ? bp.checkPer100(JSON.parse(out.text)) : bp.parseBeforeText(out.text)
} catch (e) { out.ms = Date.now() - t0; out.error = String(e?.message ?? e).slice(0, 400); out.status = e?.customErrorData?.status }
clearTimeout(timer)
writeFileSync(`live_${mode}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out))
