import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const { createNutritionResolver, mockEstimate } = await import(u('src/analysis/nutrition/resolve.ts'))
const { loadDb } = await import(u('src/analysis/nutrition/db.ts'))
const loadIndex = () => loadDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')))
const idx = await loadIndex()
const R = createNutritionResolver({ loadIndex, estimate: mockEstimate, searchGrounding: false })
const GUESS = { kcal: 180, carbs_g: 20, protein_g: 7, fat_g: 8 }
const cbNull = idx.db.foods.find((f) => f.cb === null && f.f !== null)
const bothNull = idx.db.foods.find((f) => f.cb === null && f.f === null)
const fmt = (r) => {
  const p = r.per_100g ? `${r.per_100g.kcal}/${r.per_100g.carbs_g}/${r.per_100g.protein_g}/${r.per_100g.fat_g}` : '-'
  if (r.source === 'db') return `${r.ml_converted ? 'DB(환산)' : 'DB'} ${r.db_match} "${r.db_name}" ${p}${r.fill ? ' fill=' + JSON.stringify(r.fill) : ''}`
  if (r.source === 'ai_estimate') return `AI 추정 via=${r.via} ${p}${r.reference ? ` 참고="${r.reference.db_name}"(${r.reference.db_match}, ${r.reference.kcal_per_100g}kcal${r.reference.ml_converted ? ', 환산' : ''})` : ''}`
  return r.source + ' ' + p
}
for (const n of ['페퍼로니 피자', '콤비네이션 피자', '생크림 딸기 케이크', '후라이드 치킨', '닭튀김', '새우 버거', '마라탕', '아메리카노', '돼지고기김치찌개', cbNull.n, bothNull.n]) {
  console.log(`| ${n} | ${fmt(await R.resolveNutrition(n, { guess: GUESS }))} | ${fmt(await R.resolveNutrition(n))} |`)
}
console.log('원본 행:', JSON.stringify(cbNull), JSON.stringify(bothNull))
// DB 로드 실패
const R2 = createNutritionResolver({ loadIndex: () => Promise.reject(new Error('NUTRITION_DB_UNAVAILABLE')), estimate: null })
console.log('DB 실패 + 호출 D 없음:', fmt(await R2.resolveNutrition('김치찌개')), '/ guess 있음:', fmt(await R2.resolveNutrition('김치찌개', { guess: GUESS })))
const R3 = createNutritionResolver({ loadIndex, estimate: async () => { throw new Error('429') } })
console.log('호출 D 실패:', fmt(await R3.resolveNutrition('양념치킨 순살')))
