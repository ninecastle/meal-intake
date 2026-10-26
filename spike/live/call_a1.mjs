// 프롬프트 a1·응답 스키마 A 실제 호출 1회(재시도 없음). web/src/analysis/beforePrompt.ts를 그대로 불러 쓴다.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = 'C:/Users/kkama/dev/hackathon'
const require = createRequire(root + '/web/package.json')
const { initializeApp } = require('firebase/app')
const { getAI, getGenerativeModel, GoogleAIBackend } = require('firebase/ai')
const P = await import(pathToFileURL(root + '/web/src/analysis/beforePrompt.ts').href)

const app = initializeApp({
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain: 'meal-intake-2026.firebaseapp.com',
  projectId: 'meal-intake-2026',
  appId: '1:686292653830:web:87f810922b0016e244f087',
})
const ai = getAI(app, { backend: new GoogleAIBackend() })
const MODEL = 'gemini-3.5-flash-lite'
const model = getGenerativeModel(ai, {
  model: MODEL,
  systemInstruction: P.SYSTEM_INSTRUCTION_A,
  generationConfig: P.GENERATION_CONFIG_A,
})
const data = readFileSync(root + '/spike/bibimbap.jpg').toString('base64')
const out = { at: new Date().toISOString(), model: MODEL, prompt_version: P.PROMPT_VERSION_A }
const t0 = performance.now()
try {
  const res = await model.generateContent(
    [{ type: 'text', text: P.USER_TEXT_A }, { type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data } }],
    { timeout: 20000 },
  )
  const r = res.response
  out.latency_ms = Math.round(performance.now() - t0)
  out.finishReason = r.candidates?.[0]?.finishReason
  out.text = r.text()
  out.usage = r.usageMetadata
  out.normalized = P.parseBeforeText(out.text)
} catch (e) {
  out.latency_ms = Math.round(performance.now() - t0)
  out.error = { name: e.name, code: e.code, message: e.message, status: e.customErrorData?.status }
}
writeFileSync(new URL('./call_a1_result.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
