// 국물 요리 나누기(2026-10-29 사용자 결정): 국물 몫 표 형식·범위, isSoupDish, splitSoupItem 합계 보존(남긴 비율 다르게 포함),
// mergeSoupItems, assembleAnalysis 사진 경로(가짜 응답: dish가 같은 면·건더기/국물 → 한 그릇 값 나누기), a11 파싱(ds → dish).
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
const SCR = ROOT + 'spike/results/'
writeFileSync(SCR + 'nutrition-stub.mjs', "export async function resolveNutrition() { throw new Error('stub: inject opts.resolve') }\n")
const STUB = pathToFileURL(SCR + 'nutrition-stub.mjs').href
registerHooks({ resolve(spec, ctx, next) { return spec === './nutrition/index.ts' ? { url: STUB, shortCircuit: true } : next(spec, ctx) } })
const u = (p) => pathToFileURL(W + p).href
const B = await import(u('src/analysis/nutrition/broth.ts'))
const C = await import(u('src/analysis/compute.ts'))
const S = await import(u('src/analysis/assemble.ts'))
const A = await import(u('src/analysis/beforePrompt.ts'))
const V = await import(u('src/analysis/validate.ts'))
const F = await import(u('src/lib/foodName.ts'))
let fails = 0
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++ }
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol

const table = JSON.parse(readFileSync(W + 'public/data/broth-20261029.json', 'utf8'))
await B.loadBroth(async () => table)

// ── 표 형식·범위 ──
const keys = Object.keys(table.kinds)
ok(table.version === '20261029' && keys.length >= 40 && keys.length <= 80, `표: version·개수 ${keys.length}`)
ok(B.BROTH_KINDS.every((k) => k.key in table.kinds) && keys.every((k) => B.BROTH_KINDS.some((x) => x.key === k)), '표 키 = BROTH_KINDS 키')
ok(keys.every((k) => B.checkShare(table.kinds[k]) !== null), '모든 몫 0~1, 무게 0.1~0.95')
ok(keys.every((k) => table.source[k] === 'anchor' || table.source[k] === 'ai'), 'source anchor|ai')
ok(keys.every((k) => table.kinds[k].sodium >= table.kinds[k].carbs), '나트륨 몫 ≥ 탄수화물 몫(국물에 소금, 면·밥은 건더기)')
ok(JSON.stringify(table).length < 12000, `표 크기 ${JSON.stringify(table).length}B`)

// ── 요리 종류 맞추기 ──
const kindOf = (n) => B.brothKindOf(n)?.key ?? null
const cases = [
  ['짬뽕', '짬뽕'], ['해물짬뽕', '짬뽕'], ['짬뽕밥', '짬뽕밥'], ['짬뽕라면', '라면'], ['신라면', '라면'], ['육개장칼국수', '칼국수'],
  ['순대국밥', '순대국밥'], ['콩나물국밥', '콩나물국밥'], ['소고기 국밥', '국밥'], ['물냉면', '물냉면'], ['비빔냉면', null], ['회냉면', null],
  ['잔치국수', '잔치국수'], ['비빔국수', null], ['쌀국수', '쌀국수'], ['마라탕', '마라탕'], ['탕수육', null], ['닭볶음탕', null],
  ['된장국', '된장국'], ['된장찌개', '된장찌개'], ['해물순두부찌개', '순두부찌개'], ['고추장찌개', '찌개'], ['꽃게탕', '해물탕'], ['오이냉국', '냉국'],
  ['짬뽕 면·건더기', '짬뽕'], ['짬뽕 국물', '짬뽕'], ['국밥_순대국밥', '순대국밥'], ['쌀밥', null], ['떡볶이', null], ['짜장면', null], ['감자스프', null],
  ['황태해장국', '북어국'], ['뼈다귀해장국', '감자탕'],
]
const bad = cases.filter(([n, k]) => kindOf(n) !== k).map(([n, k]) => `${n}→${kindOf(n)}(기대 ${k})`)
ok(bad.length === 0, `brothKindOf ${cases.length}개 ${bad.join(', ')}`)
ok(B.isSoupDish('라면') && !B.isSoupDish('제육볶음'), 'isSoupDish')
ok(B.soupPartOf('짬뽕 면·건더기') === 'solid' && B.soupPartOf('순대국밥 건더기') === 'solid' && B.soupPartOf('짬뽕 국물') === 'broth' && B.soupPartOf('짬뽕') === null, 'soupPartOf')
ok(JSON.stringify(B.soupPartNames('짬뽕')) === JSON.stringify({ solid: '짬뽕 면·건더기', broth: '짬뽕 국물' }) && B.soupPartNames('순대국밥').solid === '순대국밥 건더기', 'soupPartNames: 면 요리 "면·건더기", 그 밖 "건더기"')
ok(F.representativeFood(['짬뽕 면·건더기', '짬뽕 국물', '단무지']) === '짬뽕 외 1개', `홈 대표 이름(foodName.ts joinSoupParts): ${F.representativeFood(['짬뽕 면·건더기', '짬뽕 국물', '단무지'])}`)

// ── splitSoupItem ──
const per = { kcal: 85, carbs_g: 11, protein_g: 4.5, fat_g: 2.8 }
const base = C.applyDetail(
  C.applyNutrition(
    { id: 'u1', name: '짬뽕', db_food_code: null, eaters: 1, before_grams: 900, remaining_ratio: 0, consumed_grams: 0, per_100g: null, nutrition_source: 'user_input', consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }, kcal_overridden: false, confidence: 1, needs_review: false },
    { source: 'db', per_100g: per, db_food_code: 'D1', db_name: '짬뽕', db_match: 'name' },
  ),
  { sodium_mg: 330, sugar_g: 1.5, fiber_g: 1 },
  { satfat_g: 0.6 },
)
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0)
const parts = await B.splitSoupItem(base)
ok(Array.isArray(parts) && parts.length === 2, 'splitSoupItem: 두 항목')
const [sp, bp] = parts
const sh = table.kinds['짬뽕']
ok(sp.name === '짬뽕 면·건더기' && bp.name === '짬뽕 국물' && sp.soup_of === '짬뽕' && bp.soup_of === '짬뽕', `이름·soup_of (${sp.name} / ${bp.name})`)
ok(sp.id === 'u1' && bp.id === 'u1b', 'id: 면·건더기는 원래, 국물은 +b')
ok(sp.before_grams + bp.before_grams === 900 && bp.before_grams === Math.round(900 * sh.weight), `무게 합 900 (${sp.before_grams}+${bp.before_grams})`)
ok(sp.nutrition_source === 'db' && bp.nutrition_source === 'db' && bp.db_food_code === 'D1' && sp.eaters === 1, '출처·DB 코드·eaters 이어받음')
for (const k of ['kcal', 'carbs_g', 'protein_g', 'fat_g']) ok(near(sum(parts, (x) => x.consumed[k]), base.consumed[k], 0.3), `다 먹으면 ${k} 합 = 원래 (${sum(parts, (x) => x.consumed[k]).toFixed(1)} vs ${base.consumed[k].toFixed(1)})`)
ok(near(sum(parts, (x) => x.detail_consumed.sodium_mg), base.detail_consumed.sodium_mg, 2), `나트륨 합 = 원래 (${sum(parts, (x) => x.detail_consumed.sodium_mg).toFixed(0)} vs ${base.detail_consumed.sodium_mg})`)
ok(near(bp.consumed.kcal, base.consumed.kcal * sh.kcal, 0.3) && near(bp.detail_consumed.sodium_mg, base.detail_consumed.sodium_mg * sh.sodium, 2), '국물 쪽 = 원래 × 국물 몫(kcal·나트륨)')
ok(bp.detail_source.satfat_g === 'ai_estimate' && bp.detail_source.sodium_mg === 'db', '세부 출처 이어받음')
// 남긴 비율을 다르게: 국물만 다 남김
const bpLeft = C.setRemainingRatio(bp, 1)
const spHalf = C.setRemainingRatio(sp, 0.5)
const expectK = base.consumed.kcal * (1 - sh.kcal) * 0.5
ok(bpLeft.consumed.kcal === 0 && near(spHalf.consumed.kcal + bpLeft.consumed.kcal, expectK, 0.3), `면 반·국물 다 남김 kcal ${(spHalf.consumed.kcal).toFixed(1)} = 원래 × (1−국물 몫) × 0.5 (${expectK.toFixed(1)})`)
ok(near(bpLeft.detail_consumed.sodium_mg + spHalf.detail_consumed.sodium_mg, base.detail_consumed.sodium_mg * (1 - sh.sodium) * 0.5, 2), '국물을 남기면 나트륨이 국물 몫만큼 줄어듦')
const analysis = C.buildAnalysis([spHalf, bpLeft], [])
const v = V.validateAnalysis(analysis)
ok(v.ok && analysis.items.every((x) => x.soup_of === '짬뽕'), `나눈 결과 검증 통과·저장에 soup_of (${v.ok ? '' : v.errors.join('/')})`)
ok(V.validateAnalysis({ ...analysis, items: [{ ...analysis.items[0], soup_of: '' }, analysis.items[1]] }).ok === false, '빈 soup_of는 검증 실패')
// 나누지 않는 경우
ok((await B.splitSoupItem({ ...base, name: '제육볶음' })) === null, '국물 요리가 아니면 null')
ok((await B.splitSoupItem(sp)) === null, '이미 나뉜 항목은 null')
ok((await B.splitSoupItem(C.setKcalOverride(base, 500))) === null, '칼로리 직접 고친 항목은 null')
ok((await B.splitSoupItem({ ...base, per_100g: null, nutrition_source: 'user_input' })) === null, '직접 입력(per_100g 없음)은 null')
const eat2 = await B.splitSoupItem(C.recomputeItem({ ...base, eaters: 2, remaining_ratio: 0.2 }))
ok(eat2[0].eaters === 2 && eat2[1].remaining_ratio === 0.2 && near(sum(eat2, (x) => x.consumed.kcal), base.consumed.kcal * 0.8 / 2, 0.3), 'eaters 2·남긴 비율 0.2 이어받고 합계 보존')

// ── merge ──
const m = B.mergeSoupItems(bp, sp)
ok(m && m.name === '짬뽕' && m.id === 'u1' && !('soup_of' in m) && m.before_grams === 900, '합치기: 이름·id·무게')
ok(m && ['kcal', 'carbs_g', 'protein_g', 'fat_g'].every((k) => near(m.per_100g[k], per[k], 0.02)), '합치기: 100g당 값 = 원래')
ok(m && near(m.detail_per_100g.sodium_mg, 330, 0.5), '합치기: 나트륨 100g당 = 원래')
const m2 = B.mergeSoupItems(spHalf, bpLeft)
ok(m2 && near(m2.consumed_grams, spHalf.consumed_grams + bpLeft.consumed_grams, 0.5), `남긴 비율이 다르면 먹은 무게 보존 (${m2?.remaining_ratio})`)
ok(B.mergeSoupItems(sp, sp) === null && B.mergeSoupItems(sp, { ...bp, soup_of: '라면' }) === null && B.mergeSoupItems(base, bp) === null, '짝이 아니면 null')
ok(B.mergeSoupItems(C.recomputeItem({ ...sp, remaining_ratio: null }), bp).remaining_ratio === null, '한쪽 비율 null → null')

// ── a11 파싱 ──
ok(A.PROMPT_VERSION_A === 'a11' && A.SYSTEM_INSTRUCTION_A.includes('ds=') && A.SYSTEM_INSTRUCTION_A.includes('면·건더기') && A.SYSTEM_INSTRUCTION_A.includes('짬뽕'), '버전 a11·지시에 ds·면·건더기')
const raw = { f: [
  { id: 'i1', n: '짬뽕 면·건더기', l: '가운데 큰 그릇', g: 450, c: 0.8, p: { k: 130, c: 20, p: 7, f: 2.5 }, wc: null, d: { na: 200 }, fr: false, b: null, ds: '짬뽕' },
  { id: 'i2', n: '짬뽕 국물', l: '가운데 큰 그릇', g: 450, c: 0.8, p: { k: 40, c: 2, p: 2, f: 3 }, wc: null, d: { na: 450 }, fr: false, b: null, ds: ' 짬뽕 ' },
  { id: 'i3', n: '단무지', l: '오른쪽 작은 접시', g: 40, c: 0.9, p: { k: 20, c: 4, p: 0.3, f: 0.1 }, wc: null, d: { na: 900 }, fr: false, b: null, ds: null },
  { id: 'i4', n: '군만두', l: '왼쪽', g: 100, c: 0.9, p: { k: 250, c: 30, p: 8, f: 11 }, wc: null, d: {}, fr: false, b: null, ds: 'null' },
], w: [] }
const pa = A.parseBeforeText(JSON.stringify(raw))
ok(pa.ok && pa.items[0].dish === '짬뽕' && pa.items[1].dish === '짬뽕' && pa.items[2].dish === null && pa.items[3].dish === null, 'ds → dish(빈칸 정리, "null" → null)')
const old = A.normalizeBeforeResponse({ items: [{ name: '김치찌개', before_grams: 300, confidence: 0.8 }], warnings: [] })
ok(old.ok && !('dish' in old.items[0]), 'a10 이하 응답(ds 없음)은 dish 칸 없음')

// ── assemble 사진 경로 ──
const before = { items: pa.items, warnings: [], model: 'm', prompt_version: 'a11' }
const after = { items: [{ id: 'i1', remaining_ratio: 0.1, confidence: 0.9 }, { id: 'i2', remaining_ratio: 0.8, confidence: 0.7 }, { id: 'i3', remaining_ratio: 0, confidence: 0.9 }, { id: 'i4', remaining_ratio: 0, confidence: 0.9, ratio_assumed: 'not_visible' }], warnings: [], used_before_photo: true, model: 'm', prompt_version: 'b4' }
const asked = []
const fake = async (name, opts) => {
  asked.push(name)
  if (name === '짬뽕') return { source: 'db', per_100g: per, db_food_code: 'D1', db_name: '짬뽕', db_match: 'name' }
  return { source: 'ai_estimate', per_100g: opts.guess, via: 'guess' }
}
const detail = async (code) => (code === 'D1' ? { sodium_mg: 330 } : null)
const out = await S.assembleAnalysis(before, after, { resolve: fake, detail, broth: table, franchise: null })
const [o1, o2, o3, o4] = out.items
ok(asked.includes('짬뽕') && !asked.includes('짬뽕 면·건더기') && !asked.includes('짬뽕 국물'), `한 그릇 이름으로 한 번 조회 (${asked.join(',')})`)
ok(out.items.length === 4 && o1.id === 'i1' && o2.id === 'i2' && o1.name === '짬뽕 면·건더기' && o2.name === '짬뽕 국물', '순서·id·이름 유지')
ok(o1.soup_of === '짬뽕' && o2.soup_of === '짬뽕' && !('soup_of' in o3), 'soup_of 표시(나눈 두 항목만)')
ok(o1.before_grams === 450 && o2.before_grams === 450 && o1.nutrition_source === 'db' && o2.db_name === '짬뽕', '무게는 모델 값, 출처는 한 그릇 DB')
const wholeK = per.kcal * 9
ok(near((o1.per_100g.kcal * 450) / 100 + (o2.per_100g.kcal * 450) / 100, wholeK, 0.3), `두 항목 먹기 전 kcal 합 = 한 그릇 ${wholeK}`)
const expect = wholeK * (1 - sh.kcal) * 0.9 + wholeK * sh.kcal * 0.2
ok(near(o1.consumed.kcal + o2.consumed.kcal, expect, 0.3), `남긴 비율 각각(0.1·0.8) 적용 kcal ${(o1.consumed.kcal + o2.consumed.kcal).toFixed(1)} ≈ ${expect.toFixed(1)}`)
ok(o2.confidence === 0.7 && o1.remaining_ratio === 0.1 && o2.remaining_ratio === 0.8, '남긴 비율·confidence는 항목별')
ok(near((o1.detail_per_100g.sodium_mg * 450 + o2.detail_per_100g.sodium_mg * 450) / 100, 330 * 9, 2) && o2.detail_source.sodium_mg === 'db', '나트륨: 한 그릇 DB 값을 몫으로')
ok(o3.nutrition_source === 'ai_estimate' && o4.ratio_assumed === 'not_visible', '다른 음식은 그대로')
ok(V.validateAnalysis(out).ok, `assemble 결과 검증 ${V.validateAnalysis(out).errors?.join('/') ?? ''}`)
// 표 없음 → 따로 조회(예전 방식)
asked.length = 0
const out2 = await S.assembleAnalysis(before, after, { resolve: fake, detail, broth: null, franchise: null })
ok(asked.includes('짬뽕 면·건더기') && asked.includes('짬뽕 국물') && !out2.items.some((x) => x.soup_of), '표가 없으면 각 항목을 따로 찾고 soup_of 없음')
// dish가 짝이 안 맞음(국물만) → 따로
asked.length = 0
const out3 = await S.assembleAnalysis({ ...before, items: [pa.items[1], pa.items[2]] }, null, { resolve: fake, detail, broth: table, franchise: null })
ok(asked.includes('짬뽕 국물') && !out3.items.some((x) => x.soup_of), '국물 항목만 있으면 나누지 않음')
// 한 그릇 조회 실패·추정 없음 → 따로
const out4 = await S.assembleAnalysis(before, after, { resolve: async (n, o) => (n === '짬뽕' ? { source: 'user_input', per_100g: null } : { source: 'ai_estimate', per_100g: o.guess, via: 'guess' }), detail, broth: table, franchise: null })
ok(!out4.items.some((x) => x.soup_of) && out4.items[0].nutrition_source === 'ai_estimate', '한 그릇 값을 못 찾으면 각 항목 따로(AI 추정)')
// 한 그릇 조회가 AI 추정이면 두 부분 추정의 무게 가중 평균을 guess로
let g0 = null
await S.assembleAnalysis(before, after, { resolve: async (n, o) => { if (n === '짬뽕') g0 = o.guess; return { source: 'ai_estimate', per_100g: o.guess ?? per, via: 'guess' } }, detail, broth: table, franchise: null })
ok(g0 && g0.kcal === 85 && g0.carbs_g === 11, `한 그릇 guess = 두 부분 가중 평균 (${JSON.stringify(g0)})`)

console.log(fails ? `\n${fails} FAIL` : '\nall ok')
process.exit(fails ? 1 : 0)
