// D4-b 세부 영양소 추정(호출 A a5 detail_guess)·assemble 채우기 시험. 실제 AI 호출 없음(가짜 응답·가짜 resolve).
// 파싱·범위·반올림, 캐시 다시 읽기(a4 형태 포함), 응답 스키마, assemble(DB 우선 → 추정 채움, db_reference 음식은 추정만,
// DB 조회는 출처 db일 때만), 먹은 후 결과 없음 경로([다 먹었어요]·[남긴 양 직접 고르기] = assembleAnalysis(before, null)), 목업 픽스처.
// 실행: node spike/tests/detail_guess_test.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { registerHooks } from 'node:module'
import assert from 'node:assert/strict'

// 앱용 resolveNutrition 연결(index.ts)·lib/ai는 import.meta.env·firebase 초기화를 쓰므로 빈 모듈로 바꾼다(published_test와 같은 방식)
registerHooks({
  resolve(spec, ctx, next) {
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
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const A = await import(u('src/analysis/beforePrompt.ts'))
const S = await import(u('src/analysis/assemble.ts'))
const C = await import(u('src/analysis/compute.ts'))
const V = await import(u('src/analysis/validate.ts'))
const D = await import(u('src/analysis/nutrition/detail.ts'))
let n = 0
const ok = (label) => { n++; console.log('ok', label) }

// 1. 버전·지시·응답 스키마
assert.equal(A.PROMPT_VERSION_A, 'a6')
assert.equal(A.GENERATION_CONFIG_A.maxOutputTokens, 8192)
assert.ok(/detail_guess/.test(A.SYSTEM_INSTRUCTION_A) && /100g당 값이다/.test(A.SYSTEM_INSTRUCTION_A) && /null로 적는다/.test(A.SYSTEM_INSTRUCTION_A))
const schemaText = JSON.stringify(A.RESPONSE_SCHEMA_A.toJSON())
const KEYS9 = ['sugar_g', 'fiber_g', 'satfat_g', 'transfat_g', 'polyunsat_g', 'monounsat_g', 'cholesterol_mg', 'sodium_mg', 'potassium_mg']
assert.ok(['detail_guess', ...KEYS9].every((k) => schemaText.includes(`"${k}"`)))
assert.ok(['트랜스지방', '다불포화지방', '단일불포화지방', '콜레스테롤(mg)', '칼륨(mg)'].every((w) => A.SYSTEM_INSTRUCTION_A.includes(w)))
const detailJson = A.DETAIL_SCHEMA.toJSON()
assert.deepEqual(Object.keys(detailJson.properties), KEYS9)
assert.ok(Object.values(detailJson.properties).every((p) => p.nullable === true && p.type === 'number'))
ok('a6, 지시 8번 9가지(100g당·모르면 null), 응답 스키마 detail_guess 9키 nullable, maxOutputTokens 8192')

// 2. 정리: 범위 밖·숫자 아님·모르는 키는 빼고 반올림(g 0.1, 나트륨 정수), 하나도 없으면 null
const item = (dg, extra = {}) => ({ id: 'x', name: '비빔밥', location: '가운데', before_grams: 400, confidence: 0.8,
  per_100g_guess: { kcal: 150, carbs_g: 24, protein_g: 5, fat_g: 4 }, whole_count: null, ...(dg === undefined ? {} : { detail_guess: dg }), ...extra })
const parse = (...its) => A.parseBeforeText(JSON.stringify({ items: its, warnings: [] }))
const r1 = parse(
  item({ sugar_g: 4.26, sodium_mg: 333.6, satfat_g: 0.84, fiber_g: 1.5 }),
  item({ sugar_g: null, sodium_mg: 300, satfat_g: null, fiber_g: null }),
  item({ sugar_g: 150, sodium_mg: -5, satfat_g: '3', fiber_g: 2, calcium_mg: 400 }),
  item({ sugar_g: 101, sodium_mg: 40001, satfat_g: null, fiber_g: 'x' }),
  item(undefined),
  item([1, 2]),
  item({ sugar_g: 0, sodium_mg: 40000, satfat_g: 100, fiber_g: 0 }),
  item({ transfat_g: 0.04, polyunsat_g: 2.36, monounsat_g: null, cholesterol_mg: 210.6, potassium_mg: 10000, sodium_mg: 520 }),
  item({ cholesterol_mg: 5001, potassium_mg: 10001, transfat_g: 100.5, polyunsat_g: '1' }),
)
assert.ok(r1.ok)
const g = r1.items.map((x) => x.detail_guess)
assert.deepEqual(g[0], { sugar_g: 4.3, sodium_mg: 334, satfat_g: 0.8, fiber_g: 1.5 })
assert.deepEqual(g[1], { sodium_mg: 300 })
assert.deepEqual(g[2], { fiber_g: 2 })
assert.equal(g[3], null); assert.equal(g[4], null); assert.equal(g[5], null)
assert.deepEqual(g[6], { sugar_g: 0, sodium_mg: 40000, satfat_g: 100, fiber_g: 0 })
assert.deepEqual(g[7], { transfat_g: 0, polyunsat_g: 2.4, cholesterol_mg: 211, potassium_mg: 10000, sodium_mg: 520 })
assert.equal(g[8], null)
ok('정리: 반올림(g 0.1·mg 정수), null·범위 밖(g 0~100, 콜레스테롤 0~5000, 나트륨 0~40000, 칼륨 0~10000)·문자열·모르는 키 빼기, 없음·배열 → null, 경계값 유지, 4키만 있는 a5 응답도 그대로')

// 3. 캐시 다시 읽기: 정리 결과를 다시 정리해도 같다. a4 형태(detail_guess 없음)도 깨지지 않는다
const again = A.normalizeBeforeResponse({ items: r1.items, warnings: r1.warnings })
assert.ok(again.ok); assert.deepEqual(again.items.map((x) => x.detail_guess), g)
const a4 = A.normalizeBeforeResponse({ items: [{ id: 'i1', name: '김밥', location: '접시', before_grams: 230, confidence: 0.8, per_100g_guess: null, whole_count: null }], warnings: [] })
assert.ok(a4.ok); assert.equal(a4.items[0].detail_guess, null)
ok('캐시 다시 읽기 결과 같음, a4 형태(detail_guess 없음) → null')

// 4. assemble: DB 출처면 DB 값 우선 → 빈 키는 추정, db_reference(종류 차이가 큰 음식)는 추정만, user_input도 추정
const before = {
  items: [
    { id: 'i1', name: '비빔밥', location: '가운데', before_grams: 400, confidence: 0.9, per_100g_guess: { kcal: 150, carbs_g: 24, protein_g: 5, fat_g: 4 }, whole_count: null,
      detail_guess: { sugar_g: 4, sodium_mg: 300, satfat_g: 0.8, fiber_g: 1.5 } },
    { id: 'i2', name: '양념치킨 순살', location: '상자', before_grams: 300, confidence: 0.8, per_100g_guess: { kcal: 290, carbs_g: 18, protein_g: 17, fat_g: 16 }, whole_count: null,
      detail_guess: { sugar_g: 9, sodium_mg: 700 } },
    { id: 'i3', name: '배추김치', location: '왼쪽', before_grams: 50, confidence: 0.9, per_100g_guess: null, whole_count: null },
    { id: 'i4', name: '할머니 떡', location: '오른쪽', before_grams: 100, confidence: 0.7, per_100g_guess: null, whole_count: null, detail_guess: { sugar_g: 20 } },
    { id: 'i5', name: '콩나물무침', location: '위', before_grams: 40, confidence: 0.8, per_100g_guess: null, whole_count: null, detail_guess: null },
  ],
  warnings: [], model: 'mock', prompt_version: 'a5',
}
const per = (kcal) => ({ kcal, carbs_g: 10, protein_g: 5, fat_g: 3 })
const fakeResolve = async (name) => {
  switch (name) {
    case '비빔밥': return { source: 'db', per_100g: per(140), db_food_code: 'C1', db_name: '비빔밥', db_match: 'name' }
    case '양념치킨 순살': return { source: 'ai_estimate', per_100g: per(290), via: 'guess', reference: { db_food_code: 'C2', db_name: '닭튀김_양념', db_match: 'group', kcal_per_100g: 260 } }
    case '배추김치': return { source: 'db', per_100g: per(20), db_food_code: 'C3', db_name: '배추김치', db_match: 'name' }
    case '할머니 떡': return { source: 'user_input', per_100g: null }
    case '콩나물무침': return { source: 'db', per_100g: per(45), db_food_code: 'C5', db_name: '콩나물무침', db_match: 'name' }
  }
  throw new Error('unexpected ' + name)
}
const dbDetail = { C1: { sugar_g: 0.05, sodium_mg: 232, satfat_g: 0.95 }, C2: { sugar_g: 1, sodium_mg: 1, satfat_g: 1, fiber_g: 1 }, C3: { sugar_g: 1.2, sodium_mg: 600 }, C5: null }
const asked = []
const fakeDetail = async (code) => { asked.push(code); return dbDetail[code] ?? null }
const after = { items: before.items.map((b) => ({ id: b.id, remaining_ratio: 0.5, confidence: 0.9 })), warnings: [], used_before_photo: true, model: 'mock', prompt_version: 'b3' }
const out = await S.assembleAnalysis(before, after, { resolve: fakeResolve, detail: fakeDetail })
const by = Object.fromEntries(out.items.map((x) => [x.id, x]))
assert.deepEqual(asked.sort(), ['C1', 'C3', 'C5'], 'DB 세부 값은 출처 db일 때만 조회(C2 참고 행은 조회하지 않음)')
assert.deepEqual(by.i1.detail_per_100g, { sugar_g: 0.05, sodium_mg: 232, satfat_g: 0.95, fiber_g: 1.5 })
assert.deepEqual(by.i1.detail_source, { sugar_g: 'db', sodium_mg: 'db', satfat_g: 'db', fiber_g: 'ai_estimate' })
assert.deepEqual(by.i1.detail_consumed, { sugar_g: 0.1, sodium_mg: 464, satfat_g: 1.9, fiber_g: 3 })
assert.deepEqual(by.i2.detail_per_100g, { sugar_g: 9, sodium_mg: 700 }); assert.deepEqual(by.i2.detail_source, { sugar_g: 'ai_estimate', sodium_mg: 'ai_estimate' })
assert.ok(by.i2.db_reference, 'db_reference 유지')
assert.deepEqual(by.i3.detail_per_100g, { sugar_g: 1.2, sodium_mg: 600 }); assert.deepEqual(by.i3.detail_source, { sugar_g: 'db', sodium_mg: 'db' })
assert.deepEqual(by.i4.detail_per_100g, { sugar_g: 20 }); assert.equal(by.i4.nutrition_source, 'user_input')
assert.ok(!('detail_per_100g' in by.i5), 'DB·추정 모두 없으면 세부 필드 없음')
assert.deepEqual(out.totals.detail.sugar_g, { value: C.round1(0.05 * 2 + 9 * 1.5 + 1.2 * 0.25 + 20 * 0.5), count: 4 })
assert.deepEqual(out.totals.detail.fiber_g, { value: 3, count: 1 })
assert.deepEqual(V.checkAnalysis(out).errors, [])
ok('assemble: DB 우선 → 추정 채움, db_reference 음식은 추정만, DB 조회는 출처 db만, 합계·검사 통과')

// 5. 먹은 후 결과 없음([다 먹었어요]·[남긴 양 직접 고르기]): useAfterFlow처럼 assembleAnalysis(before, null) → setRemainingRatio → buildAnalysis
const base = await S.assembleAnalysis(before, null, { resolve: fakeResolve, detail: fakeDetail })
assert.ok(base.items.every((x) => x.remaining_ratio === null))
assert.deepEqual(base.items.find((x) => x.id === 'i1').detail_source, by.i1.detail_source)
const ratios = { i1: 0, i2: 0.5, i3: 1, i4: 0, i5: 0 }
const manual = C.buildAnalysis(base.items.map((it) => C.setRemainingRatio(it, ratios[it.id])), base.warnings.filter((w) => w !== S.WARN_NO_AFTER))
const m = Object.fromEntries(manual.items.map((x) => [x.id, x]))
assert.deepEqual(m.i1.detail_consumed, { sugar_g: 0.2, sodium_mg: 928, satfat_g: 3.8, fiber_g: 6 })
assert.deepEqual(m.i3.detail_consumed, { sugar_g: 0, sodium_mg: 0 })
assert.deepEqual(V.checkAnalysis(manual).errors, [])
ok('먹은 후 결과 없음 경로: 세부 값 채워짐, 직접 고른 비율로 다시 계산(다 먹음 0·그대로 1), 검사 통과')

// 6. 취소된 signal이면 DB 세부 조회를 하지 않는다(추정만)
asked.length = 0
const ac = new AbortController(); ac.abort()
const ab = await S.assembleAnalysis(before, null, { resolve: fakeResolve, detail: fakeDetail, signal: ac.signal })
assert.equal(asked.length, 0)
assert.deepEqual(ab.items.find((x) => x.id === 'i1').detail_source, { sugar_g: 'ai_estimate', sodium_mg: 'ai_estimate', satfat_g: 'ai_estimate', fiber_g: 'ai_estimate' })
ok('취소 → DB 세부 조회 없음(조회 실패와 같게 추정만)')

// 7. 실제 세부 JSON(기본 detailFor) + 실제 앱 DB 행: 출처 db 비빔밥은 식약처 값
const foods = JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')).foods
const detailFile = JSON.parse(readFileSync(W + 'public/data/mfds-detail-20261006.json', 'utf8'))
await D.loadDetailDb(async () => detailFile)
const row = foods.find((f) => f.n === '비빔밥')
const realResolve = async () => ({ source: 'db', per_100g: { kcal: row.k, carbs_g: row.cb ?? 0, protein_g: row.p, fat_g: row.f ?? 0 }, db_food_code: row.c, db_name: row.n, db_match: 'name' })
const real = await S.assembleAnalysis({ ...before, items: [before.items[0]] }, null, { resolve: realResolve })
const exp = Object.fromEntries(detailFile.keys.map((k, i) => [k, detailFile.foods[row.c][i]]).filter(([, v]) => v != null))
assert.deepEqual(real.items[0].detail_per_100g, { ...before.items[0].detail_guess, ...exp })
console.log('   ', row.n, row.c, JSON.stringify(real.items[0].detail_per_100g), JSON.stringify(real.items[0].detail_source))
ok('기본 detailFor(세부 JSON)로 식약처 값 사용')

// 8. 목업 픽스처(VITE_AI_MOCK=1): 정리 뒤 모든 음식에 detail_guess, 빈 값은 키가 빠진다
const fx = A.parseBeforeText(readFileSync(W + 'src/analysis/__fixtures__/before-bibimbap.json', 'utf8'))
assert.ok(fx.ok && fx.items.every((x) => x.detail_guess && Object.keys(x.detail_guess).length > 0))
assert.deepEqual(Object.keys(fx.items[0].detail_guess), KEYS9)
assert.ok(!('fiber_g' in fx.items[2].detail_guess) && !('polyunsat_g' in fx.items[2].detail_guess))
assert.deepEqual(Object.keys(fx.items[5].detail_guess).sort(), ['cholesterol_mg', 'sodium_mg', 'sugar_g'])
ok('목업 픽스처 detail_guess(6개 음식, 9키, null 키 빠짐)')

console.log(`detail_guess_test: ${n}개 통과`)
