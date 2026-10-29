// 실제 a11 응답(live_a11_*.json) → assembleAnalysis(실제 식약처 DB, 호출 D 없음, 국물 몫 표). AI 호출 없음.
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
writeFileSync(ROOT + 'spike/results/nutrition-stub.mjs', "export async function resolveNutrition() { throw new Error('stub') }\n")
const STUB = pathToFileURL(ROOT + 'spike/results/nutrition-stub.mjs').href
registerHooks({ resolve(spec, ctx, next) { return spec === './nutrition/index.ts' ? { url: STUB, shortCircuit: true } : next(spec, ctx) } })
const u = (p) => pathToFileURL(W + p).href
const S = await import(u('src/analysis/assemble.ts'))
const R = await import(u('src/analysis/nutrition/resolve.ts'))
const D = await import(u('src/analysis/nutrition/db.ts'))
const db = JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8'))
const broth = JSON.parse(readFileSync(W + 'public/data/broth-20261029.json', 'utf8'))
const r = R.createNutritionResolver({ loadIndex: () => D.loadDb(async () => db), estimate: null })
for (const f of ['jjamppong', 'ramyeon']) {
  const live = JSON.parse(readFileSync(`${ROOT}spike/live/broth/live_a11_${f}.json`, 'utf8'))
  const out = await S.assembleAnalysis({ items: live.parsed, warnings: [], model: 'm', prompt_version: 'a11' }, null, { resolve: r.resolveNutrition, detail: async () => null, broth, franchise: null })
  console.log(f)
  for (const x of out.items) console.log(' ', x.name, x.before_grams + 'g', x.nutrition_source, x.db_name ?? '', 'kcal/100', x.per_100g?.kcal, '먹기 전 kcal', Math.round((x.per_100g?.kcal ?? 0) * x.before_grams / 100), 'soup_of', x.soup_of ?? '-')
  console.log('  before_kcal', out.totals.before_kcal)
}
