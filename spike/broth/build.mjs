// 국물 몫 표 만들기(2026-10-29 사용자 결정, CLAUDE.md "국물 요리 나누기").
// 사용: node spike/broth/build.mjs [--dry]   (--dry: Gemini를 부르지 않고 이미 받은 raw/response.json만으로 표를 만든다)
// 대상: web/src/analysis/nutrition/broth.ts BROTH_KINDS(요리 종류 키). 기준 예시(ANCHORS)는 사람이 정한 값을 그대로 쓰고,
// 나머지는 Gemini에 한 번 묶어 물어본다(기준 예시를 보여 주고 비교해 정하게). 응답은 raw/response.json에 남겨 다시 부르지 않는다.
// 검사: 모든 몫 0~1, 무게 몫 0.1~0.95(checkShare). 빠지거나 틀린 종류는 같은 무리의 일반 종류(국·탕·찌개·전골) 값으로 채운다.
// 출력: web/public/data/broth-20261029.json {version, kinds: {키: {weight,kcal,carbs,protein,fat,sodium,sugar}}, source: {키: 'anchor'|'ai'}}
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
const RAW = ROOT + 'spike/broth/raw/'
const OUT = W + 'public/data/broth-20261029.json'
const DRY = process.argv.includes('--dry')
const B = await import(pathToFileURL(W + 'src/analysis/nutrition/broth.ts').href)

// 기준 예시(국물 몫). 라면: 스프 나트륨 대부분·튀긴 면 기름 일부가 국물로, 탄수화물은 면에. 설렁탕: 국물이 무게 대부분·지방 많음, 고기·소면은 건더기.
// 김치찌개: 건더기(돼지고기·두부·김치)가 단백질 대부분. 물냉면: 국물은 거의 물·당·소금.
export const ANCHORS = {
  라면: { weight: 0.6, kcal: 0.25, carbs: 0.1, protein: 0.15, fat: 0.4, sodium: 0.7, sugar: 0.5 },
  설렁탕: { weight: 0.7, kcal: 0.35, carbs: 0.05, protein: 0.25, fat: 0.6, sodium: 0.8, sugar: 0.3 },
  김치찌개: { weight: 0.55, kcal: 0.3, carbs: 0.35, protein: 0.15, fat: 0.4, sodium: 0.6, sugar: 0.5 },
  물냉면: { weight: 0.6, kcal: 0.15, carbs: 0.15, protein: 0.1, fat: 0.1, sodium: 0.65, sugar: 0.6 },
}
const KEYS = { weight: 'w', kcal: 'kc', carbs: 'c', protein: 'p', fat: 'f', sodium: 'na', sugar: 'su' }

const kinds = B.BROTH_KINDS
const targets = kinds.filter((k) => !(k.key in ANCHORS))

function promptOf() {
  const ex = Object.entries(ANCHORS)
    .map(([k, s]) => `- ${k}: ` + Object.entries(KEYS).map(([long, short]) => `${short}=${s[long]}`).join(', '))
    .join('\n')
  const lines = targets.map((k, i) => `${i}. ${k.key} — ${k.desc}`).join('\n')
  return `한국에서 흔히 먹는 국물 요리 한 그릇(1인분)을 "건더기(면·고기·채소·밥 등)"와 "국물" 두 부분으로 나눌 때, 한 그릇 전체에서 국물 쪽이 차지하는 몫을 0~1 소수로 답하라.
칸: w=무게, kc=열량, c=탄수화물, p=단백질, f=지방, na=나트륨, su=당류(각각 한 그릇 전체 대비 국물 쪽 비율).
- 국물에 녹아 나온 기름·소금·양념은 국물 쪽이다. 면·밥·떡·고기·두부·채소 같은 씹는 것은 건더기 쪽이다.
- 한국 조리 기준으로, 아래 기준 예시와 비교해 일관되게 정한다. 소수 둘째 자리까지.
기준 예시:
${ex}
대상(i는 번호):
${lines}
모든 번호에 하나씩 답한다.`
}

async function call() {
  const require = createRequire(W + 'package.json')
  const { initializeApp } = require('firebase/app')
  const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = require('firebase/ai')
  const app = initializeApp({ apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s', authDomain: 'meal-intake-2026.firebaseapp.com', projectId: 'meal-intake-2026', appId: '1:686292653830:web:87f810922b0016e244f087' })
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const n = () => Schema.number()
  const schema = Schema.object({
    properties: { items: Schema.array({ items: Schema.object({ properties: { i: Schema.integer(), w: n(), kc: n(), c: n(), p: n(), f: n(), na: n(), su: n() } }) }) },
  })
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 8192 },
  })
  const r = (await model.generateContent(promptOf())).response
  return { keys: targets.map((k) => k.key), text: r.text(), usage: r.usageMetadata }
}

mkdirSync(RAW, { recursive: true })
const file = RAW + 'response.json'
let calls = 0
if (!existsSync(file) && !DRY) {
  calls++
  writeFileSync(file, JSON.stringify(await call(), null, 1))
}
const kindsOut = {}
const source = {}
for (const [k, s] of Object.entries(ANCHORS)) {
  kindsOut[k] = s
  source[k] = 'anchor'
}
let dropped = []
if (existsSync(file)) {
  const { keys, text } = JSON.parse(readFileSync(file, 'utf8'))
  let items = []
  try {
    items = JSON.parse(text).items ?? []
  } catch {}
  for (const it of items) {
    const key = keys[it?.i]
    if (!key || key in kindsOut) continue
    const s = {}
    for (const [long, short] of Object.entries(KEYS)) s[long] = typeof it[short] === 'number' ? Math.round(it[short] * 100) / 100 : NaN
    const ok = B.checkShare(s)
    if (ok) {
      kindsOut[key] = ok
      source[key] = 'ai'
    } else dropped.push(key)
  }
}
// 빠진 종류: 일반 종류 값(같은 무리)으로
const GENERIC = (k) => (k.noodle ? '라면' : /찌개$/.test(k.key) ? '찌개' : /전골$/.test(k.key) ? '전골' : /국$/.test(k.key) ? '국' : '탕')
const filled = []
for (const k of kinds) {
  if (k.key in kindsOut) continue
  const g = kindsOut[GENERIC(k)] ?? ANCHORS['김치찌개']
  kindsOut[k.key] = g
  source[k.key] = 'ai'
  filled.push(k.key)
}
const ordered = {}
const orderedSrc = {}
for (const k of kinds) {
  ordered[k.key] = kindsOut[k.key]
  orderedSrc[k.key] = source[k.key]
}
writeFileSync(OUT, JSON.stringify({ version: '20261029', kinds: ordered, source: orderedSrc }) + '\n')
console.log('종류', kinds.length, '기준 예시', Object.keys(ANCHORS).length, 'AI', Object.values(orderedSrc).filter((s) => s === 'ai').length - filled.length, '버림', dropped, '일반값으로 채움', filled, 'Gemini 호출', calls)
