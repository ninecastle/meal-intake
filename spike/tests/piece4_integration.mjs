// 조각 4 연결 확인: 목업 before·after 픽스처 + 실제 식약처 DB + 목업 호출 D → assembleAnalysis → validateAnalysis
// 실행: node <이 파일> <repo 루트>
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'

// 브라우저 전용 lib/ai(import.meta.env, firebase 초기화)는 시험에서 쓰지 않으므로 빈 모듈로 바꾼다.
// 확장자 없는 상대 import(Vite 방식)는 .ts를 붙여 찾는다.
registerHooks({
  resolve(spec, ctx, next) {
    // 앱용 resolveNutrition 연결(index.ts)은 import.meta.env를 읽는다. 시험은 opts.resolve로 주입하므로 빈 모듈로 바꾼다.
    if (/\/nutrition\/index(\.ts)?$/.test(spec)) return { url: 'data:text/javascript,export function resolveNutrition(){throw new Error("inject resolve")}', shortCircuit: true }
    if (/\/lib\/ai$/.test(spec)) return { url: 'data:text/javascript,export const AI_MODEL_ID="mock";export function getModel(){throw new Error("no AI in test")}', shortCircuit: true }
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !path.extname(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
})

const ROOT = process.argv[2]
const W = (p) => pathToFileURL(path.join(ROOT, 'web/src', p)).href
const { assembleAnalysis } = await import(W('analysis/assemble.ts'))
const { createNutritionResolver, mockEstimate } = await import(W('analysis/nutrition/resolve.ts'))
const { loadDb } = await import(W('analysis/nutrition/db.ts'))
const { normalizeBeforeResponse } = await import(W('analysis/beforePrompt.ts')).catch(() => ({}))
const { validateAnalysis } = await import(W('analysis/validate.ts'))
const { recomputeItem, buildAnalysis } = await import(W('analysis/compute.ts'))

const json = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const dbJson = json('web/public/data/mfds-foods-20261006.json')
let estimateCalls = 0
const resolver = createNutritionResolver({
  loadIndex: () => loadDb(async () => dbJson),
  estimate: (name, signal) => {
    estimateCalls++
    return mockEstimate(name, signal)
  },
})

// 픽스처는 모델 원본 응답 형태라, 모듈의 정리 함수가 있으면 그걸 거친다
const rawBefore = json('web/src/analysis/__fixtures__/before-bibimbap.json')
const rawAfter = json('web/src/analysis/__fixtures__/after-bibimbap.json')
console.log('before keys:', Object.keys(rawBefore), 'normalizeBeforeResponse:', typeof normalizeBeforeResponse)
const before = rawBefore.items?.[0]?.id ? { model: 'mock', prompt_version: 'a2', warnings: [], ...rawBefore } : rawBefore
const after = { model: 'mock', prompt_version: 'b1', used_before_photo: true, warnings: [], ...rawAfter }

const meal = await assembleAnalysis(before, after, { resolve: resolver.resolveNutrition })
const src = (it) =>
  it.nutrition_source === 'db' ? (it.db_ml_converted ? 'DB(환산)' : 'DB') : it.nutrition_source
for (const it of meal.items) {
  console.log(
    [it.id, it.name, src(it), it.db_name ?? '', it.db_reference ? `참고 ${it.db_reference.db_name} ${it.db_reference.kcal_per_100g}` : '',
      `전 ${it.before_grams}g`, `남김 ${it.remaining_ratio}`, `인원 ${it.eaters}`, `섭취 ${it.consumed_grams}g`, `${it.consumed.kcal}kcal`,
      it.per_100g_fill ? `fill ${JSON.stringify(it.per_100g_fill)}` : ''].filter(Boolean).join(' | '),
  )
}
console.log('totals', JSON.stringify(meal.totals), 'prompt', meal.prompt_version, 'warnings', meal.warnings)
console.log('validate:', JSON.stringify(validateAnalysis(meal).ok), 'estimate calls:', estimateCalls)

// 인원수 2로 바꾸면 섭취값이 정확히 절반인지
const first = meal.items[0]
const two = recomputeItem({ ...first, eaters: 2 })
console.log('eaters 1→2:', first.consumed.kcal, '→', two.consumed.kcal)
const meal2 = buildAnalysis(meal.items.map((it) => (it.id === first.id ? two : it)), meal.warnings, meal)
console.log('validate after eaters change:', validateAnalysis(meal2).ok)
