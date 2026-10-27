// D4-a 세부 영양소 데이터·계산 층 시험(D4-c부터 9가지 키). 실제 AI 호출 없음.
// 4가지로 저장된 예전 기록(D4-a)이 검사·sumDetail에서 그대로 통과하는지도 본다.
// compute.ts(공식·반올림·합계 count·toStoredItem·applyDetail), validate.ts·validate_analysis.mjs(범위·키 짝·계산값·합계),
// nutrition/detail.ts(detailFor, 받기 실패 → 빈 표), 세부 JSON ↔ 앱 DB ↔ 식약처 원본 대조.
// 실행: node spike/tests/detail_test.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = 'C:/Users/kkama/dev/hackathon/'
const u = (p) => pathToFileURL(ROOT + p).href
const C = await import(u('web/src/analysis/compute.ts'))
const V = await import(u('web/src/analysis/validate.ts'))
const M = await import(u('.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs'))
const D = await import(u('web/src/analysis/nutrition/detail.ts'))
const SUM = await import(u('web/src/data/summary.ts'))
const KEYS9 = ['sugar_g', 'fiber_g', 'satfat_g', 'transfat_g', 'polyunsat_g', 'monounsat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg']
assert.deepEqual([...C.DETAIL_KEYS], KEYS9)
assert.deepEqual({ ...C.DETAIL_MAX_PER_100G }, { sugar_g: 100, fiber_g: 100, satfat_g: 100, transfat_g: 100, polyunsat_g: 100, monounsat_g: 100, cholesterol_mg: 5000, sodium_mg: 40000, potassium_mg: 10000 })
let n = 0
const ok = (label) => { n++; console.log('ok', label) }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps

const base = (id, o = {}) => ({
  id, name: '시험 ' + id, db_food_code: 'X' + id, db_name: '시험', db_match: 'name', eaters: 1, before_grams: 300,
  remaining_ratio: 0, consumed_grams: 0, per_100g: { kcal: 150, carbs_g: 20, protein_g: 5, fat_g: 4 },
  nutrition_source: 'db', consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }, kcal_overridden: false,
  confidence: 0.9, needs_review: false, ...o,
})
const both = (a) => {
  const t = V.checkAnalysis(a).errors
  const m = M.checkAnalysis(a).errors
  assert.deepEqual(t, m, 'validate.ts와 validate_analysis.mjs 결과가 다르다')
  return t
}

// 1. 공식: 100g당 × 중량 × (1 − 남긴 비율) ÷ 인원수 ÷ 100, 탄단지와 같은 섭취 중량
const per = { sugar_g: 5, sodium_mg: 333, satfat_g: 1.234 }
const src = { sugar_g: 'db', sodium_mg: 'db', satfat_g: 'ai_estimate' }
let a = C.recomputeItem(base('i1', { remaining_ratio: 0.25, eaters: 2, detail_per_100g: per, detail_source: src }))
assert.equal(a.consumed_grams, 112.5)
assert.ok(near(a.detail_consumed.sugar_g, 5.625) && near(a.detail_consumed.sodium_mg, 374.625) && near(a.detail_consumed.satfat_g, 1.38825))
assert.ok(!('fiber_g' in a.detail_consumed))
assert.ok(near(a.consumed.carbs_g, (20 * 112.5) / 100))
ok('공식(남긴 비율 0.25, 인원 2) = 탄단지와 같은 섭취 중량')

// 남긴 비율 null → 탄단지처럼 0으로 계산, needs_review
const nul = C.recomputeItem(base('i2', { remaining_ratio: null, detail_per_100g: { fiber_g: 2 }, detail_source: { fiber_g: 'db' } }))
assert.equal(nul.needs_review, true); assert.equal(nul.consumed_grams, 300); assert.equal(nul.detail_consumed.fiber_g, 6)
ok('남긴 비율 null → 0으로 계산(탄단지와 같게)')

// 칼로리 직접 입력은 세부 영양소에 영향 없음
const ov = C.setKcalOverride(a, 999)
assert.equal(ov.consumed.kcal, 999); assert.deepEqual(ov.detail_consumed, a.detail_consumed)
ok('kcal_overridden은 세부 영양소와 상관없음')

// 짝 맞추기: 출처 없는 키·범위 밖·모르는 키·출처만 있는 키는 뺀다. 하나도 없으면 세 필드 삭제
const pr = C.recomputeItem(base('i3', {
  detail_per_100g: { sugar_g: 150, sodium_mg: 40000, satfat_g: 2, fiber_g: -1, calcium_mg: 10, cholesterol_mg: 5001, potassium_mg: 10000, transfat_g: 0.05, monounsat_g: 100.1 },
  detail_source: { sodium_mg: 'db', sugar_g: 'db', fiber_g: 'db', calcium_mg: 'db', satfat_g: 'guess', cholesterol_mg: 'db', potassium_mg: 'db', transfat_g: 'ai_estimate', monounsat_g: 'ai_estimate' },
}))
assert.deepEqual(pr.detail_per_100g, { sodium_mg: 40000, potassium_mg: 10000, transfat_g: 0.05 })
assert.deepEqual(pr.detail_source, { sodium_mg: 'db', potassium_mg: 'db', transfat_g: 'ai_estimate' })
const none = C.recomputeItem(base('i4', { detail_per_100g: { sugar_g: 1 }, detail_source: {}, detail_consumed: { sugar_g: 3 } }))
for (const k of ['detail_per_100g', 'detail_source', 'detail_consumed']) assert.ok(!(k in none), 'left ' + k)
ok('100g당 값·출처 짝 맞추기, 범위(g 0~100, 콜레스테롤 0~5000, 나트륨 0~40000, 칼륨 0~10000) 밖·모르는 키는 뺌')

// mg 키는 정수, g 키는 소수 첫째 자리(저장·합계)
const r9 = C.buildAnalysis([C.recomputeItem(base('r9', { before_grams: 100, detail_per_100g: { cholesterol_mg: 12.6, potassium_mg: 245.5, transfat_g: 0.26, monounsat_g: 1.04, polyunsat_g: 0 }, detail_source: { cholesterol_mg: 'db', potassium_mg: 'db', transfat_g: 'db', monounsat_g: 'ai_estimate', polyunsat_g: 'ai_estimate' } }))], [])
assert.deepEqual(r9.items[0].detail_consumed, { cholesterol_mg: 13, potassium_mg: 246, transfat_g: 0.3, monounsat_g: 1, polyunsat_g: 0 })
assert.deepEqual(r9.totals.detail.potassium_mg, { value: 246, count: 1 }); assert.deepEqual(r9.totals.detail.transfat_g, { value: 0.3, count: 1 })
assert.deepEqual(V.checkAnalysis(r9).errors, []); assert.deepEqual(M.checkAnalysis(r9).errors, [])
ok('반올림: mg 키(콜레스테롤·칼륨) 정수, g 키(트랜스·단일불포화) 0.1, 0도 유지')

// applyDetail: 영양소마다 DB → 추정 → 없음. applyNutrition은 이전 음식의 세부 값을 지운다
const ad = C.applyDetail(base('i5'), { sugar_g: 3, sodium_mg: null, fiber_g: 101 }, { sodium_mg: 500, satfat_g: 0, fiber_g: 4, sugar_g: 9 })
assert.deepEqual(ad.detail_per_100g, { sugar_g: 3, sodium_mg: 500, satfat_g: 0, fiber_g: 4 })
assert.deepEqual(ad.detail_source, { sugar_g: 'db', sodium_mg: 'ai_estimate', satfat_g: 'ai_estimate', fiber_g: 'ai_estimate' })
const ad0 = C.applyDetail(base('i6'), null, null)
assert.ok(!('detail_per_100g' in ad0) && !('detail_consumed' in ad0))
const sw = C.applyNutrition(ad, { source: 'ai_estimate', per_100g: { kcal: 100, carbs_g: 10, protein_g: 5, fat_g: 3 }, via: 'call_d' })
for (const k of ['detail_per_100g', 'detail_source', 'detail_consumed']) assert.ok(!(k in sw), 'applyNutrition left ' + k)
ok('applyDetail(DB 우선 → 추정, 범위 밖 무시), applyNutrition이 세부 값 지움')

// 2. 합계: 반올림 전 값을 더한 뒤 한 번 반올림, count = 값 있는 음식 수, 0개 키는 뺌
const t1 = C.recomputeItem(base('t1', { before_grams: 1, detail_per_100g: { sugar_g: 4, sodium_mg: 50 }, detail_source: { sugar_g: 'db', sodium_mg: 'db' } }))
const t2 = C.recomputeItem(base('t2', { before_grams: 1, detail_per_100g: { sugar_g: 4 }, detail_source: { sugar_g: 'ai_estimate' } }))
const t3 = C.recomputeItem(base('t3', { before_grams: 1 }))
const tot = C.computeTotals([t1, t2, t3])
assert.deepEqual(tot.detail, { sugar_g: { value: 0.1, count: 2 }, sodium_mg: { value: 1, count: 1 } })
assert.ok(!('detail' in C.computeTotals([t3])))
ok('totals.detail: 0.04+0.04 → 0.1(항목은 각각 0), count 2, 값 없는 키·필드 뺌')

// 3. buildAnalysis·toStoredItem: 세 필드는 허용 키만, 반올림(g 0.1·나트륨 정수), undefined 없음, 검사 통과
const items = [a, nul, ad, C.recomputeItem(base('i7')), C.setKcalOverride(C.newUserItem([]), 120)]
const built = C.buildAnalysis(items, [], { model: 'mock', prompt_version: 'a4-b3' })
const s1 = built.items[0]
assert.deepEqual(s1.detail_consumed, { sugar_g: 5.6, sodium_mg: 375, satfat_g: 1.4 })
assert.deepEqual(s1.detail_per_100g, per); assert.deepEqual(s1.detail_source, src)
assert.ok(!('detail_per_100g' in built.items[3]) && !('detail_per_100g' in built.items[4]))
assert.deepEqual(JSON.parse(JSON.stringify(built)), built, 'undefined 값이 있다')
assert.deepEqual(built.totals.detail, {
  sugar_g: { value: C.round1(5.625 + (3 * 300) / 100), count: 2 },
  sodium_mg: { value: Math.round(374.625 + 1500), count: 2 },
  satfat_g: { value: C.round1(1.38825 + 0), count: 2 },
  fiber_g: { value: C.round1(6 + 12), count: 2 },
})
assert.deepEqual(both(built), [])
assert.equal(V.validateAnalysis(built).ok, true)
const plain = C.buildAnalysis([C.recomputeItem(base('p1'))], [])
assert.ok(!('detail' in plain.totals) && !('detail_per_100g' in plain.items[0])); assert.deepEqual(both(plain), [])
ok('buildAnalysis: 저장 반올림, totals.detail, validate.ts·mjs 통과, 세부 값 없는 기록은 그대로')

// 4. 검사 실패 사례(validate.ts와 validate_analysis.mjs가 같은 오류)
const bad = (label, mut, re) => {
  const x = structuredClone(built); mut(x)
  const errs = both(x)
  assert.ok(errs.some((e) => re.test(e)), `${label}: ${errs.join(' / ') || '오류 없음'}`)
}
bad('나트륨 범위', (x) => { x.items[0].detail_per_100g.sodium_mg = 40001 }, /detail_per_100g\.sodium_mg 범위/)
bad('당류 음수', (x) => { x.items[0].detail_per_100g.sugar_g = -1 }, /detail_per_100g\.sugar_g 범위/)
bad('당류 100 초과', (x) => { x.items[2].detail_per_100g.sugar_g = 100.5 }, /sugar_g 범위\(0~100\)/)
bad('출처 키 빠짐', (x) => { delete x.items[0].detail_source.satfat_g }, /detail_source\.satfat_g 값 오류/)
bad('출처 키 남음', (x) => { x.items[0].detail_source.fiber_g = 'db' }, /detail_source\.fiber_g는 detail_per_100g에 없는 키/)
bad('출처 값', (x) => { x.items[0].detail_source.sugar_g = 'search' }, /detail_source\.sugar_g 값 오류/)
bad('먹은 양 누락', (x) => { delete x.items[0].detail_consumed }, /함께 넣는다/)
bad('먹은 양 계산', (x) => { x.items[0].detail_consumed.sodium_mg = 500 }, /detail_consumed\.sodium_mg 500 ≠ 계산값/)
bad('모르는 키', (x) => { x.items[0].detail_per_100g.calcium_mg = 1 }, /calcium_mg는 허용되지 않는 키/)
bad('콜레스테롤 범위', (x) => { x.items[0].detail_per_100g.cholesterol_mg = 5001 }, /cholesterol_mg 범위\(0~5000\)/)
bad('칼륨 범위', (x) => { x.items[0].detail_per_100g.potassium_mg = 10001 }, /potassium_mg 범위\(0~10000\)/)
bad('빈 객체', (x) => { x.items[3].detail_per_100g = {}; x.items[3].detail_source = {}; x.items[3].detail_consumed = {} }, /비었다/)
bad('합계 count', (x) => { x.totals.detail.sugar_g.count = 3 }, /totals\.detail\.sugar_g\.count 3/)
bad('합계 값', (x) => { x.totals.detail.fiber_g.value = 30 }, /totals\.detail\.fiber_g\.value 30/)
bad('합계 누락', (x) => { delete x.totals.detail.satfat_g }, /totals\.detail\.satfat_g 누락/)
bad('0개 키', (x) => { x.totals.detail = { sugar_g: { value: 0, count: 0 } }; x.items.forEach((it) => { delete it.detail_per_100g; delete it.detail_source; delete it.detail_consumed }) }, /키를 뺀다/)
ok('검사 실패 16가지(범위·키 짝·계산값·합계), 두 검사기 오류 목록 같음')

// 4가지 키로 저장된 예전 기록(D4-a): 새 키는 선택이라 검사 통과, sumDetail도 그 4가지만 더한다
const old = JSON.parse(JSON.stringify(built))
assert.ok(old.items.every((it) => !it.detail_per_100g || Object.keys(it.detail_per_100g).every((k) => ['sugar_g', 'sodium_mg', 'satfat_g', 'fiber_g'].includes(k))))
assert.deepEqual(both(old), [])
const sd = SUM.sumDetail([old, plain])
assert.deepEqual(Object.keys(sd.totals).sort(), Object.keys(old.totals.detail).sort())
for (const [k, t] of Object.entries(old.totals.detail)) {
  assert.equal(sd.totals[k].count, t.count, k)
  assert.ok(Math.abs(sd.totals[k].value - t.value) <= 1, k)
}
assert.equal(sd.items, old.items.length + plain.items.length)
ok('4가지 키 예전 기록: validate.ts·mjs 통과, sumDetail 합계·count가 totals.detail과 같음')

// 5. 세부 JSON ↔ 앱 DB ↔ 원본, detailFor
const detailJson = JSON.parse(readFileSync(ROOT + 'web/public/data/mfds-detail-20261006.json', 'utf8'))
const appFoods = JSON.parse(readFileSync(ROOT + 'web/public/data/mfds-foods-20261006.json', 'utf8')).foods
const raw = JSON.parse(readFileSync(ROOT + '_workspace/00_input/mfds/mfds_food_std_raw.json', 'utf8')).records
assert.deepEqual(detailJson.keys, KEYS9)
assert.ok(Object.values(detailJson.foods).every((row) => row.length === 9 && row[4] === null && row[5] === null), '다불포화·단일불포화는 늘 null')
const appCodes = new Set(appFoods.map((f) => f.c))
const codes = Object.keys(detailJson.foods)
assert.ok(codes.every((c) => appCodes.has(c)), '앱 DB에 없는 식품코드'); assert.ok(codes.length > appFoods.length * 0.9)
const rawBy = new Map(raw.map((r) => [r['식품코드'], r]))
const colOf = { sugar_g: '당류(g)', fiber_g: '식이섬유(g)', satfat_g: '포화지방산(g)', transfat_g: '트랜스지방산(g)', polyunsat_g: null, monounsat_g: null, cholesterol_mg: '콜레스테롤(mg)', sodium_mg: '나트륨(mg)', potassium_mg: '칼륨(mg)' }
const pnum = (v) => { const s = String(v ?? '').trim().replace(/,/g, ''); return s === '' || s === '-' ? null : Number(s) }
await D.loadDetailDb(async () => detailJson)
const picks = ['비빔밥', '김치찌개', '도넛', '제육볶음', '닭튀김', '(100ml 행)']
for (const name of picks) {
  // 100ml 행(앱 DB ml: 1)은 원본 값을 1ml=1g으로 그대로 쓴다
  const row = name === '(100ml 행)' ? appFoods.find((f) => f.ml) : appFoods.find((f) => f.n.includes(name))
  const got = await D.detailFor(row.c)
  const r = rawBy.get(row.c)
  const exp = {}
  detailJson.keys.forEach((k) => { const v = colOf[k] ? pnum(r[colOf[k]]) : null; if (v != null) exp[k] = v })
  assert.deepEqual(got, Object.keys(exp).length ? exp : null, row.n)
  console.log('   ', row.n, row.ml ? '(100ml)' : '', JSON.stringify(got))
}
assert.equal(await D.detailFor('없는코드'), null); assert.equal(await D.detailFor(''), null)
const noDetail = appFoods.find((f) => !(f.c in detailJson.foods))
if (noDetail) assert.equal(await D.detailFor(noDetail.c), null)
ok(`detailFor ${picks.length}개 음식 = 원본 값, 없는 코드 null, 세부 JSON 코드 ${codes.length}개 모두 앱 DB에 있음`)

// 받기 실패 → 던지지 않고 빈 표, 다음 호출에서 다시 받기(별도 모듈 인스턴스)
const D2 = await import(u('web/src/analysis/nutrition/detail.ts') + '?fail')
const empty = await D2.loadDetailDb(async () => { throw new Error('offline') })
assert.deepEqual(empty.foods, {})
let refetched = false
await D2.loadDetailDb(async () => { refetched = true; return detailJson })
assert.ok(refetched); assert.ok((await D2.detailFor(codes[0])) !== null)
ok('받기 실패 → 빈 표(던지지 않음), 다음 호출에서 다시 받음')

// 로더는 파일의 keys 배열로 매핑한다: 순서가 바뀌거나 모르는 키가 있어도 맞게 읽는다(별도 모듈 인스턴스)
const D3 = await import(u('web/src/analysis/nutrition/detail.ts') + '?order')
await D3.loadDetailDb(async () => ({ version: 't', source: 't', keys: ['potassium_mg', 'calcium_mg', 'sugar_g', 'cholesterol_mg'], foods: { X: [300, 99, 5, 6000] } }))
assert.deepEqual(await D3.detailFor('X'), { potassium_mg: 300, sugar_g: 5 })
ok('로더: keys 배열 순서대로 매핑, 모르는 키·범위 밖(콜레스테롤 6000) 무시')

console.log(`detail_test: ${n}개 통과`)
