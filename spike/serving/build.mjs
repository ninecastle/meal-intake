// 대표식품명별 보통 1인분 무게 표 만들기(2026-10-29 사용자 결정, CLAUDE.md "일반 음식 1인분 무게").
// 사용: node spike/serving/build.mjs [--dry]   (--dry: Gemini를 부르지 않고 이미 받은 묶음만으로 표를 만든다)
// 대상: 식약처 DB 대표식품명(r) 가운데 1개 중량(w)이 없는 행이 있는 것.
// 근거 순서: 1) MFDS_REF(식품등의 표시기준 1회 섭취참고량으로 정할 수 있는 것) 2) Gemini에 100개씩 묶어 "보통 1인분 g".
// 프롬프트 v2: 크기 기준 예시를 넣었다(v1은 묶음마다 국 한 그릇이 300~700g으로 들쭉날쭉, raw_v1/에 남김).
// Gemini 응답은 raw/batch_N.json에 남겨 다시 돌릴 때 부르지 않는다. 범위 5~1500g 밖이거나 정수가 아니면 버린다.
// 출력: web/public/data/serving-20261029.json {version, byRep: {대표식품명: g}, source: {대표식품명: 'mfds_ref'|'ai'}}
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
const RAW = ROOT + 'spike/serving/raw/'
const OUT = W + 'public/data/serving-20261029.json'
const VERSION = '20261029'
const BATCH = 100
const MIN_G = 5
const MAX_G = 1500
const DRY = process.argv.includes('--dry')

// 1회 섭취참고량(식품등의 표시기준 별표, 식품유형별)으로 정한 것. 밥류 210g, 김치류 40g, 우유류 200ml(1ml=1g).
// 고시의 유형과 음식이 분명히 맞는 대표식품명만 넣는다(국·찌개·요리처럼 유형이 맞지 않는 음식은 Gemini).
const MFDS_REF_RULES = [
  { g: 210, test: (r) => /^(쌀밥|보리밥|잡곡밥|현미밥|콩밥|찰밥|기장밥|수수밥|차조밥|흑미밥|오곡밥|밥)$/.test(r) },
  { g: 40, test: (r) => r !== "두부김치" && /김치$|^깍두기$|^총각김치$|^동치미$|^석박지$|^나박김치$/.test(r) },
  { g: 200, test: (r) => /^(우유|가공유|저지방우유|딸기우유|초코우유|바나나우유|두유)$/.test(r) },
]

export function refOf(r) {
  for (const x of MFDS_REF_RULES) if (x.test(r)) return x.g
  return null
}

export function checkGrams(v) {
  return Number.isInteger(v) && v >= MIN_G && v <= MAX_G ? v : null
}

const db = JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8'))
const groups = new Map()
for (const f of db.foods) {
  const e = groups.get(f.r) ?? { rows: 0, noW: 0, names: [] }
  e.rows++
  if (!f.w) e.noW++
  if (e.names.length < 2 && f.n !== f.r) e.names.push(f.n)
  groups.set(f.r, e)
}
const reps = [...groups.entries()].filter(([, e]) => e.noW > 0).map(([r, e]) => ({ r, ex: e.names }))
console.log('대표식품명', groups.size, '대상', reps.length)

const byRep = {}
const source = {}
const aiTargets = []
for (const x of reps) {
  const g = refOf(x.r)
  if (g) {
    byRep[x.r] = g
    source[x.r] = 'mfds_ref'
  } else aiTargets.push(x)
}

function promptOf(list) {
  const lines = list.map((x, i) => `${i}. ${x.r}${x.ex.length ? ` (예: ${x.ex.join(', ')})` : ''}`).join('\n')
  return `다음은 한국 식약처 식품영양성분 DB의 대표식품명 목록이다(괄호는 그 묶음의 예시 메뉴 이름).
각 음식을 한국에서 보통 1인분(한 그릇·한 접시·1개·1잔·1인분)으로 먹을 때의 무게를 g 정수로 답하라.
- 국·찌개·면처럼 국물이 있는 음식은 국물까지 포함한 한 그릇 무게.
- 음료는 1잔(1ml=1g). 반찬·소스·양념·과자는 보통 한 번에 먹는 양.
- 크기 기준(이 값에 맞춰 비교해서 정한다): 쌀밥 한 공기 210g, 미역국·된장국 한 그릇 300g, 김치찌개 1인분 350g, 설렁탕 한 그릇 700g, 짜장면 한 그릇 600g, 비빔밥 한 그릇 450g, 김밥 1줄 230g, 떡볶이 1인분 300g, 배추김치 반찬 40g, 나물 반찬 50g, 아메리카노 1잔 350g.
- 범위는 ${MIN_G}~${MAX_G}g. 모든 번호에 하나씩 답한다. i는 번호, g는 무게.
${lines}`
}

async function callBatches() {
  const require = createRequire(W + 'package.json')
  const { initializeApp } = require('firebase/app')
  const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = require('firebase/ai')
  const app = initializeApp({ apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s', authDomain: 'meal-intake-2026.firebaseapp.com', projectId: 'meal-intake-2026', appId: '1:686292653830:web:87f810922b0016e244f087' })
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  const schema = Schema.object({
    properties: { items: Schema.array({ items: Schema.object({ properties: { i: Schema.integer(), g: Schema.integer() } }) }) },
  })
  const model = getGenerativeModel(ai, {
    model: 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 8192 },
  })
  let calls = 0
  for (let b = 0; b * BATCH < aiTargets.length; b++) {
    const file = `${RAW}batch_${b}.json`
    const list = aiTargets.slice(b * BATCH, (b + 1) * BATCH)
    if (existsSync(file)) continue
    if (DRY) continue
    calls++
    try {
      const r = (await model.generateContent(promptOf(list))).response
      writeFileSync(file, JSON.stringify({ reps: list.map((x) => x.r), text: r.text() }, null, 1))
      console.log('묶음', b, '받음')
    } catch (e) {
      console.log('묶음', b, '실패', String(e?.message ?? e).slice(0, 200))
    }
  }
  return calls
}

mkdirSync(RAW, { recursive: true })
const calls = await callBatches()
let dropped = 0
for (let b = 0; b * BATCH < aiTargets.length; b++) {
  const file = `${RAW}batch_${b}.json`
  if (!existsSync(file)) continue
  const { reps: names, text } = JSON.parse(readFileSync(file, 'utf8'))
  let items = []
  try {
    items = JSON.parse(text).items ?? []
  } catch {
    continue
  }
  for (const it of items) {
    const r = names[it?.i]
    const g = checkGrams(it?.g)
    if (!r || r in byRep) continue
    if (g === null) {
      dropped++
      continue
    }
    byRep[r] = g
    source[r] = 'ai'
  }
}
const missing = reps.filter((x) => !(x.r in byRep)).map((x) => x.r)
const out = { version: VERSION, byRep, source }
writeFileSync(OUT, JSON.stringify(out))
const n = Object.values(source)
console.log(JSON.stringify({ calls, total: n.length, mfds_ref: n.filter((s) => s === 'mfds_ref').length, ai: n.filter((s) => s === 'ai').length, dropped, missing: missing.length, missingSample: missing.slice(0, 20), bytes: JSON.stringify(out).length }))
