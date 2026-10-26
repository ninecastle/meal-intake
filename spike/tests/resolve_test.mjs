import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const { createNutritionResolver, mockEstimate } = await import(u('src/analysis/nutrition/resolve.ts'))
const { loadDb } = await import(u('src/analysis/nutrition/db.ts'))
const { isHighVarianceFood } = await import(u('src/analysis/nutrition/highVariance.ts'))
const { normalizeFoodName } = await import(u('src/analysis/nutrition/normalize.ts'))
const loadIndex = () => loadDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')))
const idx = await loadIndex()
let calls = 0
const estimate = (n, s) => { calls++; return mockEstimate(n, s) }
const R = createNutritionResolver({ loadIndex, estimate, searchGrounding: false })
const GUESS = { kcal: 180, carbs_g: 20, protein_g: 7, fat_g: 8 }
const nullRow = idx.db.foods.find((f) => f.cb === null && f.f === null && f.n === f.r)
const names = ['김치찌개', '공기밥', '제육볶음', '떡볶이', '로제 떡볶이', '양념치킨 순살', '치킨', '더블 치즈버거', '아이스 카페라떼', '닭볶음탕', '없는음식xyz', nullRow?.n].filter(Boolean)
const fmt = (r) => {
  const p = r.per_100g ? `${r.per_100g.kcal}/${r.per_100g.carbs_g}/${r.per_100g.protein_g}/${r.per_100g.fat_g}` : '-'
  if (r.source === 'db') return `${r.ml_converted ? 'DB(환산)' : 'DB'} ${r.db_match} "${r.db_name}" ${p}${r.fill ? ' fill=' + JSON.stringify(r.fill) : ''}`
  if (r.source === 'ai_estimate') return `AI 추정 via=${r.via} ${p}${r.reference ? ` 참고="${r.reference.db_name}"(${r.reference.db_match}, ${r.reference.kcal_per_100g}kcal${r.reference.ml_converted ? ', 환산' : ''})` : ''}`
  return r.source + ' ' + p
}
console.log('| 이름 | 고위험 | guess 있음 | guess 없음(호출 D 목업) |\n| --- | --- | --- | --- |')
for (const n of names) {
  const a = await R.resolveNutrition(n, { guess: GUESS })
  const b = await R.resolveNutrition(n)
  const m = idx && (await import(u('src/analysis/nutrition/db.ts'))).matchFood(idx, n)
  console.log(`| ${n} | ${isHighVarianceFood(n, m?.food) ? 'O' : '-'} | ${fmt(a)} | ${fmt(b)} |`)
}
const before = calls
for (const n of names) await R.resolveNutrition(n)
console.log('\n호출 D(목업) 수: 1회차', before, '/ 같은 이름 2회차 추가', calls - before)
const pz = idx.db.foods[idx.byGroup.get('피자')]
console.log('dbCode(피자 대표 행) + 이름 "페퍼로니 피자":', fmt(await R.resolveNutrition('페퍼로니 피자', { dbCode: pz.c })))
const ac = new AbortController(); ac.abort()
try { await R.resolveNutrition('새이름abc', { signal: ac.signal }); console.log('abort: 안 던짐(오류)') } catch (e) { console.log('abort:', e.name) }
console.log('\n오탐 점검:', ['치킨무', '무초절임(치킨무)', '고구마라떼', '닭볶음탕', '닭갈비', '치킨가스', '먼치킨 도넛', '마라샹궈', '감자튀김', '김치볶음밥'].map((x) => `${x}=${isHighVarianceFood(x) ? 'O' : '-'}`).join(', '))
const groups = Object.keys(idx.db.groups).map((g) => idx.db.foods[idx.db.groups[g]].r)
const hv = groups.filter((r) => isHighVarianceFood(r))
console.log(`DB 대표식품명 ${groups.length}개 중 해당 ${hv.length}개:`, hv.join(', '))
