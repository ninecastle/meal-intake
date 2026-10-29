// 속도 실측(2026-10-29 사용자 결정 "AI 응답 속도"): 앱과 같은 프롬프트·스키마·설정으로 실제 호출 시간을 잰다.
// 사용: node spike/live/speed.mjs <a|b|r> <LOW|MINIMAL> <1280|1024> [횟수=3]
//   a: 호출 A(먹기 전 사진 1장), b: 호출 B(전·후 2장, 같은 사진), r: 주간 리포트(7일 가짜 기록)
//   thinkingLevel만 인자로 덮어쓴다(나머지 generationConfig는 앱 파일 그대로). 재시도 없음, 한 번 실행 = 호출 <횟수>회.
//   429가 나오면 바로 멈춘다. 결과: spike/results/speed_<kind>_<level>_<side>.json
// 사진: spike/live/bibimbap_<side>.jpg (spike/bibimbap.jpg를 긴 변 1280/1024px·JPEG 품질 80으로 다시 저장, 커밋하지 않음)
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
const require = createRequire(W + 'package.json')
const { initializeApp } = require('firebase/app')
const { getAI, getGenerativeModel, GoogleAIBackend } = require('firebase/ai')
const imp = (p) => import(pathToFileURL(W + p).href)
const [A, B, R] = await Promise.all([imp('src/analysis/beforePrompt.ts'), imp('src/analysis/afterPrompt.ts'), imp('src/analysis/weeklyReport.ts')])

const [kind, level, side = '1280', nArg = '3'] = process.argv.slice(2)
if (!['a', 'b', 'r'].includes(kind) || !['LOW', 'MINIMAL'].includes(level)) {
  console.error('usage: node spike/live/speed.mjs <a|b|r> <LOW|MINIMAL> <1280|1024> [n]')
  process.exit(2)
}
const N = Number(nArg)
const MODEL = 'gemini-3.5-flash-lite'
const app = initializeApp({ apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s', authDomain: 'meal-intake-2026.firebaseapp.com', projectId: 'meal-intake-2026', appId: '1:686292653830:web:87f810922b0016e244f087' })
const ai = getAI(app, { backend: new GoogleAIBackend() })
const cfg = (c) => ({ ...c, thinkingConfig: { thinkingLevel: level } })
// IMG=bibimbap4 이면 spike/live/bibimbap4_<side>.jpg(돌솥 4개 2×2 상차림, 2026-10-29 칸 이름 줄이기 실측)
const IMG = process.env.IMG ?? 'bibimbap'
const img = () => ({ type: 'inlineData', inlineData: { mimeType: 'image/jpeg', data: readFileSync(`${ROOT}spike/live/${IMG}_${side}.jpg`).toString('base64') } })

// 호출 B 먹기 전 목록: 전후 측정에 같은 값(호출 A 사진의 돌솥 하나)
const BEFORE = IMG === 'bibimbap4'
  ? ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'].map((loc, i) => ({ id: `i${i + 1}`, name: '돌솥비빔밥', location: `${loc} 검은 돌솥`, before_grams: 450, confidence: 0.9, per_100g_guess: null }))
  : [{ id: 'i1', name: '돌솥비빔밥', location: '가운데 검은 돌솥', before_grams: 450, confidence: 0.95, per_100g_guess: null }]

// 리포트 입력: 2026-10-19 주 7일 가짜 기록
const MON = '2026-10-19'
const day = (i) => `2026-10-${String(19 + i).padStart(2, '0')}`
const GOAL = { target_kcal: 2000, carbs_g: 250, protein_g: 100, fat_g: 60 }
let seq = 0
const it = (name, kcal, c, p, f, extra = {}) => ({ name, remaining_ratio: 0, eaters: 1, nutrition_source: 'db', consumed: { kcal, carbs_g: c, protein_g: p, fat_g: f }, ...extra })
const meal = (dk, mt, items) => {
  const sum = (k) => Math.round(items.reduce((s, x) => s + x.consumed[k], 0) * 10) / 10
  return { id: `m${++seq}`, dateKey: dk, mealType: mt, status: 'done', createdAt: null, updatedAt: null, analysis: { items, totals: { consumed: { kcal: sum('kcal'), carbs_g: sum('carbs_g'), protein_g: sum('protein_g'), fat_g: sum('fat_g') } } } }
}
const MENU = [
  [['breakfast', [it('토스트', 320, 40, 9, 13), it('우유', 130, 10, 6, 7)]], ['lunch', [it('국밥_순대국밥', 650, 60, 32, 28), it('배추김치', 20, 3, 1, 0)]], ['dinner', [it('쌀밥', 310, 68, 6, 1), it('제육볶음', 420, 15, 28, 27), it('된장국', 60, 6, 4, 2)]]],
  [['lunch', [it('김밥_김치', 480, 70, 12, 16)]], ['dinner', [it('양념치킨 순살', 900, 50, 55, 52)]], ['snack', [it('아이스 카페라테', 180, 14, 8, 9)]]],
  [['breakfast', [it('현미밥', 300, 64, 6, 2), it('달걀후라이', 110, 1, 7, 9)]], ['lunch', [it('짜장면', 780, 120, 22, 22)]], ['dinner', [it('닭가슴살 샐러드', 350, 18, 38, 13)]]],
  [['lunch', [it('비빔밥', 600, 95, 20, 15)]], ['dinner', [it('떡볶이', 520, 105, 10, 6), it('어묵', 120, 10, 7, 5)]]],
  [['breakfast', [it('그릭요거트', 150, 12, 15, 4), it('바나나', 90, 23, 1, 0)]], ['lunch', [it('돈가스', 850, 75, 30, 45)]], ['dinner', [it('쌀밥', 310, 68, 6, 1), it('고등어구이', 300, 0, 25, 22), it('시금치나물', 40, 4, 3, 2)]]],
  [['lunch', [it('버거_빅맥 버거', 580, 46, 27, 32), it('감자튀김', 330, 42, 4, 16)]], ['dinner', [it('라면', 500, 70, 10, 18)]], ['snack', [it('초콜릿 케이크', 400, 48, 5, 21)]]],
  [['breakfast', [it('오트밀', 250, 42, 9, 5)]], ['lunch', [it('냉면_물냉면', 550, 100, 18, 6)]], ['dinner', [it('쌀밥', 310, 68, 6, 1), it('된장찌개', 150, 10, 11, 7), it('불고기', 380, 15, 28, 22)]]],
]
const MEALS = MENU.flatMap((d, i) => d.map(([mt, items]) => meal(day(i), mt, items)))

let model, parts, parse, timeout
if (kind === 'a') {
  model = getGenerativeModel(ai, { model: MODEL, systemInstruction: A.SYSTEM_INSTRUCTION_A, generationConfig: cfg(A.GENERATION_CONFIG_A) })
  parts = () => [{ type: 'text', text: A.USER_TEXT_A }, img()]
  parse = (t) => A.parseBeforeText(t)
  timeout = 40_000
} else if (kind === 'b') {
  model = getGenerativeModel(ai, { model: MODEL, systemInstruction: B.SYSTEM_INSTRUCTION_B, generationConfig: cfg(B.GENERATION_CONFIG_B) })
  parts = () => [
    { type: 'text', text: B.buildBeforeItemsText(B.buildBeforeItemsJson(BEFORE)) },
    { type: 'text', text: B.USER_TEXT_BEFORE_PHOTO }, img(),
    { type: 'text', text: B.USER_TEXT_AFTER_PHOTO }, img(),
  ]
  parse = (t) => B.parseAfterText(t, BEFORE)
  timeout = 40_000
} else {
  const stats = R.computeWeekStats(MON, MEALS, () => GOAL)
  const userText = R.buildReportUserText(stats, { under18: false, meals: MEALS, goal: GOAL, compare: { kcalDiff: -120, scoreDiff: 5 } })
  const allowed = R.inputNumberSet(userText)
  model = getGenerativeModel(ai, { model: MODEL, systemInstruction: R.SYSTEM_INSTRUCTION_REPORT, generationConfig: cfg(R.GENERATION_CONFIG_REPORT) })
  parts = () => [{ type: 'text', text: userText }]
  parse = (t) => {
    const r = R.parseReportJson(t)
    if (!r) return { ok: false }
    const filtered = R.filterReportText(r, allowed, false, R.weekFoodNames(stats, MEALS))
    return { ok: true, numberViolations: R.numberViolations(r, allowed), dropped: filtered.dropped, chars: t.length, text: r }
  }
  timeout = 90_000
}

const runs = []
for (let i = 0; i < N; i++) {
  const t0 = Date.now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  const out = { i, at: new Date().toISOString(), kind, level, side: Number(side) }
  try {
    const r = (await model.generateContent(parts(), { signal: ctl.signal, timeout: timeout + 1000 })).response
    out.ms = Date.now() - t0
    out.finish = r.candidates?.[0]?.finishReason
    out.usage = r.usageMetadata
    const text = r.text()
    out.raw = text
    out.parsed = parse(text)
  } catch (e) {
    out.ms = Date.now() - t0
    out.error = String(e?.message ?? e).slice(0, 400)
    out.status = e?.customErrorData?.status
  }
  clearTimeout(timer)
  runs.push(out)
  const u = out.usage ?? {}
  console.log(`${kind} ${level} ${side} #${i}: ${(out.ms / 1000).toFixed(1)}s ${out.finish ?? out.status ?? 'ERR'} in=${u.promptTokenCount} out=${u.candidatesTokenCount} think=${u.thoughtsTokenCount ?? '-'} total=${u.totalTokenCount}`)
  if (out.error) {
    console.log('  error:', out.error)
    if (out.status === 429 || /429|quota|RESOURCE_EXHAUSTED/i.test(out.error)) { console.log('429 — 멈춤'); break }
  }
}
const ver = kind === 'a' ? A.PROMPT_VERSION_A : kind === 'b' ? B.PROMPT_VERSION_B : 'r'
writeFileSync(`${ROOT}spike/results/speed_${kind}_${level}_${side}${IMG === 'bibimbap' ? '' : '_' + IMG + '_' + ver}.json`, JSON.stringify(runs, null, 2))
