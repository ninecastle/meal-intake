import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
const web = 'C:/Users/kkama/dev/hackathon/web'
const m = await import(pathToFileURL(web + '/src/analysis/nutrition/db.ts').href)
const { FOOD_ALIASES } = await import(pathToFileURL(web + '/src/analysis/nutrition/aliases.ts').href)
await m.loadDb(async () => JSON.parse(fs.readFileSync(web + '/public/data/mfds-foods-20261006.json', 'utf8')))
const f = (v) => (v == null ? '–' : v)
for (const q of ['김치찌개', '비빔밥', '공기밥', '떡볶이', '없는음식xyz']) {
  const hits = await m.searchFoods(q, 10)
  const b = await m.findBestMatch(q)
  console.log(`\n## "${q}" findBestMatch: ${b ? `${b.food.n} [${b.match}, key=${b.key}] ${b.food.c} ${b.food.k}kcal` : 'null'}`)
  hits.forEach((h, i) => console.log(`${i + 1}. ${h.label} | ${h.match}/${h.kind} | ${h.food.k} kcal, 탄 ${f(h.food.cb)}, 단 ${h.food.p}, 지 ${f(h.food.f)}${h.food.ml ? ' (ml)' : ''}`))
}
console.log('\n## 별칭 대상 확인')
for (const [k, v] of Object.entries(FOOD_ALIASES)) { const r = await m.findBestMatch(k); console.log(k, '→', v, r ? `${r.food.n} [${r.match}]` : 'MISSING') }
console.log('\n## 기타 매칭')
for (const q of ['돼지고기김치찌개', '김치찌개 국물', '치즈피자', '쌀밥', '제육볶음', '된장찌개', '계란말이', '달걀말이']) { const r = await m.findBestMatch(q); console.log(q, '→', r ? `${r.food.n} [${r.match}, key=${r.key}] ${r.food.k}kcal 탄${f(r.food.cb)} 지${f(r.food.f)}${r.food.ml ? ' (ml)' : ''}` : 'null') }
const t0 = performance.now(); for (let i = 0; i < 100; i++) await m.searchFoods('김치', 10); console.log('\nsearchFoods 100회', (performance.now() - t0).toFixed(1), 'ms')
