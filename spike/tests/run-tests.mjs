import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const ROOT = 'C:/Users/kkama/dev/hackathon/'
const SCR = 'C:/Users/kkama/dev/hackathon/spike/results/'
writeFileSync(SCR + 'nutrition-stub.mjs', "export async function resolveNutrition() { throw new Error('stub: inject opts.resolve') }\n")
const STUB = pathToFileURL(SCR + 'nutrition-stub.mjs').href
registerHooks({ resolve(spec, ctx, next) { return spec === './nutrition/index.ts' ? { url: STUB, shortCircuit: true } : next(spec, ctx) } })
const A = ROOT + 'web/src/analysis/'
const C = await import(pathToFileURL(A + 'compute.ts').href)
const V = await import(pathToFileURL(A + 'validate.ts').href)
const S = await import(pathToFileURL(A + 'assemble.ts').href)
const foods = JSON.parse(readFileSync(ROOT + 'web/public/data/mfds-foods-20261006.json', 'utf8')).foods
const find = (pred, label) => { const r = foods.find(pred); if (!r) throw new Error('row not found: ' + label); return r }
const findName = (name) => {
  let r = foods.find((f) => f.n === name); if (r) return [r, 'name']
  r = foods.find((f) => f.r === name); if (r) return [r, 'group']
  return [find((f) => f.n.includes(name), name), 'partial']
}
const dbRes = ([row, match]) => {
  const fill = {}
  const per = { kcal: row.k, carbs_g: row.cb ?? 0, protein_g: row.p, fat_g: row.f ?? 0 }
  if (row.cb == null) { fill.carbs_g = 'ai_estimate'; per.carbs_g = 3.5 }
  if (row.f == null) fill.fat_g = 'missing'
  return { source: 'db', per_100g: per, ...(Object.keys(fill).length ? { fill } : {}), db_food_code: row.c, db_name: row.n, db_match: match, ...(row.ml ? { ml_converted: true } : {}) }
}
const bibim = findName('비빔밥')
const jeyuk = [find((f) => f.ml && f.n.includes('제육볶음'), 'ml 제육'), 'name']
const kimchi = [foods.find((f) => f.n.includes('김치') && f.cb == null && f.f == null) ?? find((f) => f.f == null, 'fat null'), 'name']
const kong = findName('콩나물무침')
const chickenRow = foods.find((f) => f.r === '치킨') ?? find((f) => f.r && f.r.includes('치킨'), 'chicken group')
const ref = { db_food_code: chickenRow.c, db_name: chickenRow.n, db_match: 'group', kcal_per_100g: chickenRow.k, ...(chickenRow.ml ? { ml_converted: true } : {}) }
console.log('rows:', [bibim, jeyuk, kimchi, kong].map(([r, m]) => `${r.n}(${r.c},${m},k${r.k},cb${r.cb},f${r.f}${r.ml ? ',ml' : ''})`).join(' | '), '| ref', ref.db_name, ref.kcal_per_100g)

const base = (id, name, location, grams, ratio, conf, eaters = 1) => ({ id, name, location, db_food_code: null, eaters, before_grams: grams, remaining_ratio: ratio, consumed_grams: 0, per_100g: null, nutrition_source: 'user_input', consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }, kcal_overridden: false, confidence: conf, needs_review: false })
const items = [
  C.applyNutrition(base('i1', '비빔밥', '가운데 큰 흰 대접', 450, 0.3, 0.85), dbRes(bibim)),
  C.applyNutrition(base('i2', '제육볶음', '오른쪽 큰 접시', 300, 0.1, 0.75), dbRes(jeyuk)),
  C.applyNutrition(base('i3', '김치 고로케', '왼쪽 위 작은 접시', 80, null, 0.3), dbRes(kimchi)),
  C.applyNutrition(base('i4', '콩나물무침', '위쪽 가운데 작은 접시', 60, 0.25, 0.8, 2), dbRes(kong)),
  C.applyNutrition(base('i5', '양념치킨 순살', '가운데 종이 상자', 300, 0.5, 0.7), { source: 'ai_estimate', per_100g: { kcal: 290, carbs_g: 18, protein_g: 17, fat_g: 16 }, via: 'guess', reference: ref }),
]
let u = C.newUserItem(items)
u = C.setKcalOverride({ ...u, name: '할머니 떡', before_grams: 120, user_edited: true }, 250)
items.push(u)
const valid = C.buildAnalysis(items, ['김치 고로케: 먹은 후 사진에서 어느 그릇인지 판단할 수 없습니다'], { model: 'gemini-3.5-flash-lite', prompt_version: 'a1-b1' })
const badCalc = structuredClone(valid); badCalc.items[0].consumed.kcal = Math.round(badCalc.items[0].consumed.kcal + 80)
const badPhoto = structuredClone(valid); badPhoto.items[0].photo_base64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'
const FX = A + '__fixtures__/'
writeFileSync(FX + 'analysis-v2-valid.json', JSON.stringify(valid, null, 2) + '\n')
writeFileSync(FX + 'analysis-v2-bad-calc.json', JSON.stringify(badCalc, null, 2) + '\n')
writeFileSync(FX + 'analysis-v2-bad-photo.json', JSON.stringify(badPhoto, null, 2) + '\n')

// compute 단위 확인
const it = Object.fromEntries(valid.items.map((x) => [x.id, x]))
assert.equal(it.i4.consumed_grams, 22.5); assert.equal(it.i4.eaters, 2)
assert.equal(it.i3.consumed_grams, 80); assert.equal(it.i3.needs_review, true)
assert.equal(it.i2.db_ml_converted, true); assert.ok(it.i3.per_100g_fill); assert.ok(it.i5.db_reference); assert.equal(it.i5.db_food_code, null)
assert.equal(it.u1.nutrition_source, 'user_input'); assert.equal(it.u1.consumed.kcal, 250); assert.equal(it.u1.kcal_overridden, true)
const sw = C.applyNutrition(items[1], { source: 'ai_estimate', per_100g: { kcal: 200, carbs_g: 10, protein_g: 15, fat_g: 10 }, via: 'call_d' })
for (const k of ['db_name', 'db_match', 'db_ml_converted', 'per_100g_fill', 'db_reference']) assert.ok(!(k in sw), 'left ' + k)
assert.equal(sw.db_food_code, null)
const back = C.applyNutrition(C.applyNutrition(items[4], dbRes(bibim)), { source: 'search', per_100g: { kcal: 100, carbs_g: 1, protein_g: 1, fat_g: 1 }, searchSuggestionHtml: null, groundingSources: [] })
assert.ok(!('db_reference' in back) && !('db_name' in back) && back.db_food_code === null)
const ov = C.setKcalOverride(items[0], 999); assert.equal(ov.consumed.kcal, 999)
const un = C.setKcalOverride(ov, null); assert.equal(un.kcal_overridden, false); assert.ok(Math.abs(un.consumed.kcal - items[0].consumed.kcal) < 1e-9)
assert.equal(C.newUserItem([{ id: 'u1' }, { id: 'u3' }, { id: 'i9' }]).id, 'u4')
assert.equal(C.setKcalOverride(it.u1, null).kcal_overridden, true)
console.log('compute asserts: ok')

// assemble
const before = { ...JSON.parse(readFileSync(FX + 'before-bibimbap.json', 'utf8')), model: 'mock', prompt_version: 'a1' }
const after = { ...JSON.parse(readFileSync(FX + 'after-bibimbap.json', 'utf8')), used_before_photo: true, model: 'mock', prompt_version: 'b1' }
let active = 0, maxActive = 0, calls = 0
const fake = async (name, opts) => {
  calls++; active++; maxActive = Math.max(maxActive, active)
  await new Promise((r) => setTimeout(r, 30)); active--
  switch (name) {
    case '비빔밥': return dbRes(bibim)
    case '배추김치': return dbRes(kimchi)
    case '된장국 건더기': return { source: 'ai_estimate', per_100g: opts.guess, via: 'guess', reference: ref }
    case '된장국 국물': throw new Error('boom')
    case '콩나물무침': return dbRes(jeyuk)
    case '멸치볶음': return { source: 'user_input', per_100g: null }
  }
  throw new Error('unexpected ' + name)
}
const out = await S.assembleAnalysis(before, after, { resolve: fake })
writeFileSync(SCR + 'assemble-out.json', JSON.stringify(out, null, 2))
console.log('assemble: calls', calls, 'maxActive', maxActive, 'prompt_version', out.prompt_version, 'model', out.model)
for (const x of out.items) console.log(' ', x.id, x.name, x.nutrition_source, x.db_ml_converted ? '(환산)' : '', x.db_reference ? '(참고)' : '', 'ratio', x.remaining_ratio, 'conf', x.confidence, 'g', x.consumed_grams, 'kcal', x.consumed.kcal, x.needs_review ? 'REVIEW' : '')
console.log('  totals', JSON.stringify(out.totals)); console.log('  warnings', JSON.stringify(out.warnings))
active = maxActive = calls = 0
const out2 = await S.assembleAnalysis(before, null, { resolve: fake })
writeFileSync(SCR + 'assemble-out-noafter.json', JSON.stringify(out2, null, 2))
console.log('assemble(after=null): ratios', out2.items.map((x) => x.remaining_ratio).join(','), 'allReview', out2.items.every((x) => x.needs_review), 'pv', out2.prompt_version)
const ac = new AbortController(); ac.abort(); calls = 0
const out3 = await S.assembleAnalysis(before, after, { resolve: fake, signal: ac.signal })
console.log('assemble(aborted): calls', calls, 'sources', out3.items.map((x) => x.nutrition_source).join(','))
const out4 = await S.assembleAnalysis({ items: null, warnings: [] }, null, { resolve: fake })
console.log('assemble(broken before): items', out4.items.length, 'warnings', out4.warnings.length)
for (const [n, o] of [['valid', valid], ['bad-calc', badCalc], ['bad-photo', badPhoto], ['assemble', out], ['assemble-noafter', out2], ['assemble-aborted', out3], ['assemble-broken', out4]]) {
  const v = V.validateAnalysis(o)
  console.log(`validateAnalysis ${n}:`, v.ok ? `ok (warn ${v.warnings.length})` : `FAIL ${v.errors.length}: ${v.errors.join(' / ')}`)
}
