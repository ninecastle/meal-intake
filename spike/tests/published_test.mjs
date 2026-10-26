// 공개 중량(스펙 4.5.5)·프롬프트 a3 시험. 실제 AI 호출 없음.
// 실행: node spike/tests/published_test.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
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
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const { createNutritionResolver, mockEstimate } = await import(u('src/analysis/nutrition/resolve.ts'))
const { loadDb, matchFood } = await import(u('src/analysis/nutrition/db.ts'))
const { assembleAnalysis, publishedGrams } = await import(u('src/analysis/assemble.ts'))
const { setBeforeGrams, buildAnalysis } = await import(u('src/analysis/compute.ts'))
const { checkAnalysis } = await import(u('src/analysis/validate.ts'))
const { normWholeCount, parseBeforeText, PROMPT_VERSION_A } = await import(u('src/analysis/beforePrompt.ts'))
const mjs = await import(pathToFileURL('C:/Users/kkama/dev/hackathon/.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs').href)

let bad = 0
const ok = (cond, msg) => {
  if (!cond) bad++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
}
const loadIndex = () => loadDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')))
const idx = await loadIndex()
const R = createNutritionResolver({ loadIndex, estimate: mockEstimate, searchGrounding: false })

// ── 이름 표 ──
console.log('\n| 이름 | 매칭 | 맞은 키 | DB 행 | w(행) | 결과 published_g |\n| --- | --- | --- | --- | --- | --- |')
const names = ['빅맥', '빅맥 버거', '버거_빅맥 버거', '싸이버거', '치즈와퍼', '치즈와퍼 버거', '허니콤보', '허니콤보 치킨', '김치찌개']
const table = {}
for (const n of names) {
  const m = matchFood(idx, n)
  const r = await R.resolveNutrition(n)
  table[n] = { m, r }
  console.log(`| ${n} | ${m?.match ?? '-'} | ${m?.key ?? '-'} | ${m?.food.n ?? '-'} | ${m?.w ?? '-'} | ${r.source === 'db' ? (r.published_g ?? '-') : r.source} |`)
}
ok(table['빅맥'].m?.match === 'name' && table['빅맥'].r.published_g === 223, '빅맥 → 이름 일치, published_g 223')
ok(table['싸이버거'].m?.match === 'name' && table['싸이버거'].r.published_g === 230, '싸이버거 → 이름 일치, published_g 230')
ok(table['허니콤보 치킨'].r.source !== 'db' || table['허니콤보 치킨'].r.published_g === undefined, '허니콤보 치킨 → 공개 중량 없음(식품중량 100g)')
ok(table['김치찌개'].r.source === 'db' && table['김치찌개'].r.published_g === undefined, '김치찌개 → 공개 중량 없음(가정식)')

// ── whole_count 정리 ──
const wc = [1, 3, 10, 0, 11, 1.5, '1', null, undefined].map((v) => `${JSON.stringify(v)}→${normWholeCount(v)}`)
console.log('\nnormWholeCount:', wc.join(', '))
ok(normWholeCount(3) === 3 && normWholeCount(0) === null && normWholeCount(11) === null && normWholeCount(1.5) === null && normWholeCount('1') === null, 'whole_count 범위 밖·소수·문자열은 null')
const fx = parseBeforeText(readFileSync(W + 'src/analysis/__fixtures__/before-bibimbap.json', 'utf8'))
ok(fx.ok && fx.items[0].whole_count === 1 && fx.items.slice(1).every((x) => x.whole_count === null), `목업 픽스처 whole_count(비빔밥 1, 나머지 null), PROMPT_VERSION_A=${PROMPT_VERSION_A}`)

// ── 조립 시험 1: whole_count 1·2·null ──
const g = { kcal: 250, carbs_g: 25, protein_g: 12, fat_g: 12 }
const bi = (id, name, grams, whole_count) => ({ id, name, location: '가운데', before_grams: grams, confidence: 0.8, per_100g_guess: g, whole_count })
const before = {
  model: 'mock', prompt_version: 'a3', warnings: [],
  items: [bi('i1', '빅맥', 180, 1), bi('i2', '빅맥', 180, 2), bi('i3', '빅맥', 180, null), bi('i4', '싸이버거', 200, 1), bi('i5', '김치찌개', 300, 1)],
}
const after = { model: 'mock', prompt_version: 'b1', used_before_photo: true, warnings: [], items: before.items.map((b) => ({ id: b.id, remaining_ratio: 0.1, confidence: 0.9 })) }
const res = await assembleAnalysis(before, after, { resolve: R.resolveNutrition })
console.log('\n| id | 이름 | whole_count | before_grams | grams_source | published_g × unit_count | 출처 | consumed kcal |\n| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const it of res.items) {
  const b = before.items.find((x) => x.id === it.id)
  console.log(`| ${it.id} | ${it.name} | ${b.whole_count} | ${it.before_grams} | ${it.grams_source ?? '-'} | ${it.published_g ? `${it.published_g} × ${it.unit_count}` : '-'} | ${it.nutrition_source}/${it.db_match ?? '-'} | ${it.consumed.kcal} |`)
}
const byId = Object.fromEntries(res.items.map((x) => [x.id, x]))
ok(byId.i1.before_grams === 223 && byId.i1.grams_source === 'published' && byId.i1.unit_count === 1, '빅맥 × 1 → 223g, published')
ok(byId.i2.before_grams === 446 && byId.i2.unit_count === 2, '빅맥 × 2 → 446g')
ok(byId.i3.before_grams === 180 && !('grams_source' in byId.i3), '빅맥 whole_count null → AI 추정 180g 그대로')
ok(byId.i5.before_grams === 300 && !('grams_source' in byId.i5), '김치찌개(w 없음) → AI 추정 300g 그대로')
let v = checkAnalysis(res), vm = mjs.checkAnalysis(res)
ok(v.errors.length === 0 && vm.errors.length === 0, `v2 검증 통과(TS ${v.errors.length}건, mjs ${vm.errors.length}건) ${[...v.errors, ...vm.errors].join(' / ')}`)

// ── 조립 시험 2: db_match가 group이면 적용하지 않는다 ──
const stub = (match) => async () => ({ source: 'db', per_100g: g, db_food_code: 'X1', db_name: '버거_빅맥 버거', db_match: match, published_g: 223 })
for (const match of ['group', 'partial', 'name']) {
  const r2 = await assembleAnalysis({ ...before, items: [bi('i1', '버거', 180, 1)] }, null, { resolve: stub(match) })
  const it = r2.items[0]
  console.log(`db_match=${match}: before_grams ${it.before_grams}, grams_source ${it.grams_source ?? '-'}`)
  ok(match === 'name' ? it.before_grams === 223 : it.before_grams === 180 && !('published_g' in it), `db_match=${match} → ${match === 'name' ? '적용' : '적용 안 함'}`)
}
ok(publishedGrams(bi('i1', '빅맥', 180, 1), { source: 'ai_estimate', per_100g: g, via: 'guess' }) === null, 'AI 추정 출처면 적용 안 함')

// ── setBeforeGrams·buildAnalysis·검증 규칙 ──
const edited = setBeforeGrams(byId.i1, 250)
ok(edited.before_grams === 250 && !('grams_source' in edited) && !('published_g' in edited) && !('unit_count' in edited), 'setBeforeGrams → 세 필드 지움, 다시 계산')
const rebuilt = buildAnalysis([edited, byId.i2], [], { model: 'mock' })
ok(!('grams_source' in rebuilt.items[0]) && rebuilt.items[1].grams_source === 'published' && checkAnalysis(rebuilt).errors.length === 0, 'buildAnalysis가 세 필드를 남김(편집한 항목은 없음)')
const stale = buildAnalysis([{ ...byId.i1, before_grams: 250 }], [])
ok(!('grams_source' in stale.items[0]), 'buildAnalysis: 무게가 published_g × unit_count와 다르면 세 필드를 뺀다')
const partial = structuredClone(res); delete partial.items[0].unit_count
const mismatch = structuredClone(res); mismatch.items[0].before_grams = 230; mismatch.items[0].consumed_grams = 207
mismatch.items[0].consumed = { ...mismatch.items[0].consumed, kcal: (mismatch.items[0].per_100g.kcal * 207) / 100 }
for (const [label, x] of [['세 필드 중 하나 없음', partial], ['before_grams ≠ published_g × unit_count', mismatch]]) {
  const e1 = checkAnalysis(x).errors.filter((e) => /published|grams_source|unit_count/.test(e))
  const e2 = mjs.checkAnalysis(x).errors.filter((e) => /published|grams_source|unit_count/.test(e))
  ok(e1.length > 0 && e2.length > 0, `검증 실패해야 함: ${label} → ${e1[0]}`)
}
console.log(`\n${bad === 0 ? '모두 통과' : `실패 ${bad}건`}`)
process.exit(bad ? 1 : 0)
