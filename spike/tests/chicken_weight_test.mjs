// 치킨 1마리 무게(2026-10-29 사용자 결정, 조사표) 시험. 실제 AI 호출 없음.
// 실행: node spike/tests/chicken_weight_test.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (/\/nutrition\/index(\.ts)?$/.test(spec) || spec === './index.ts')
      return { url: 'data:text/javascript,export function resolveNutrition(){throw new Error("inject resolve")}', shortCircuit: true }
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
const { loadDb, loadServing } = await import(u('src/analysis/nutrition/db.ts'))
const { loadDetailDb } = await import(u('src/analysis/nutrition/detail.ts'))
const CW = await import(u('src/analysis/nutrition/chickenWeight.ts'))
const F = await import(u('src/analysis/nutrition/franchise.ts'))
const { assembleAnalysis } = await import(u('src/analysis/assemble.ts'))
const C = await import(u('src/analysis/compute.ts'))
const { checkAnalysis } = await import(u('src/analysis/validate.ts'))
const mjs = await import(pathToFileURL('C:/Users/kkama/dev/hackathon/.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs').href)

let bad = 0
const ok = (cond, msg) => {
  if (!cond) bad++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
}
const idx = await loadDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')))
await loadDetailDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-detail-20261006.json', 'utf8')))
await loadServing(async () => JSON.parse(readFileSync(W + 'public/data/serving-20261029.json', 'utf8')))
const T = await F.loadFranchise(async () => JSON.parse(readFileSync(W + 'public/data/franchise-20261029.json', 'utf8')))
const E = CW.EDIBLE_BONE_IN
const r1 = (n) => Math.round(n * 10) / 10

// ── 표·평균 ──
ok(CW.CHICKEN_TABLE.length === 13 && CW.CHICKEN_TABLE.filter((r) => r.boneless).length === 7, '조사표 13행(뼈 6·순살 7)')
ok(CW.CHICKEN_AVG.bone === 780.9 && CW.CHICKEN_AVG.boneless === 806.3, `표 평균 뼈 780.9·순살 806.3 (${CW.CHICKEN_AVG.bone} ${CW.CHICKEN_AVG.boneless})`)
ok(E >= 0.7 && E <= 0.75, `먹는 부분 비율 ${E}`)

// ── 매칭 ──
const cw = CW.chickenWeight
let c = cw('허니순살', 'kyochon')
ok(c.unit_g === 528.1 && c.boneless && c.basis === 'menu', `교촌 허니순살 → 528.1 그대로 (${JSON.stringify(c)})`)
c = cw('교촌 후라이드')
ok(c.unit_g === r1(684.5 * E) && !c.boneless && c.basis === 'menu' && c.brand === 'kyochon', `교촌 후라이드 → 684.5 × ${E} = ${c.unit_g}`)
c = cw('황금올리브치킨', 'bbq')
ok(c.unit_g === r1(762.8 * E) && c.basis === 'menu', `BBQ 황금올리브 → 762.8 × ${E} = ${c.unit_g}`)
c = cw('황금올리브치킨양념 순살', 'BBQ')
ok(c.unit_g === 918.4 && c.boneless, `BBQ 황금올리브 양념 순살 → 918.4 (${c.unit_g})`)
c = cw('레드콤보', 'kyochon')
ok(c.unit_g === r1(684.5 * E) && !c.boneless && c.basis === 'brand', `교촌 레드콤보(콤보 = 뼈) → 교촌 뼈 값 (${c.unit_g} ${c.basis})`)
c = cw('허니윙콤비(하프윙+순살)', 'kyochon')
ok(!c.boneless && !c.half, `교촌 허니윙콤비(하프윙+순살) → 뼈 있음·반마리 아님 (${c.boneless} ${c.half})`)
c = cw('레드순살', '교촌치킨')
ok(c.unit_g === 528.1 && c.basis === 'brand', `교촌 레드순살 → 교촌 순살 값 528.1 (${c.unit_g} ${c.basis})`)
c = cw('뿌링클 반마리', 'bhc')
ok(c.half && c.unit_g === r1(852.5 * E), `bhc 뿌링클 반마리 → bhc 뼈 값·반마리 (${c.unit_g} half=${c.half})`)
c = cw('반반한마리[간장+레드]', 'kyochon')
ok(!c.half, '반반한마리 → 반마리 아님')
c = cw('고추바사삭', 'goobne')
ok(c.basis === 'average' && c.unit_g === r1(780.9 * E), `굽네 고추바사삭(뼈) → 굽네 뼈 값 없음 → 뼈 평균 (${c.unit_g} ${c.basis})`)
c = cw('호식이 두마리 순살치킨')
ok(c.basis === 'average' && c.unit_g === 806.3 && c.brand === null, `표에 없는 브랜드 순살 → 순살 평균 806.3 (${c.unit_g})`)
c = cw('후라이드치킨')
ok(c.basis === 'average' && c.unit_g === r1(780.9 * E), `일반 후라이드치킨 → 뼈 평균 × ${E} = ${c.unit_g}`)

ok(
  CW.isWholeChicken('후라이드치킨') && CW.isWholeChicken('닭튀김_간장 치킨', '닭튀김') && !CW.isWholeChicken('치킨너겟') && !CW.isWholeChicken('치킨버거') &&
    !CW.isWholeChicken('닭다리튀김', '닭튀김') && !CW.isWholeChicken('치킨무') && !CW.isWholeChicken('양념게장'),
  'isWholeChicken(치킨·닭튀김 O / 너겟·버거·다리·치킨무·양념게장 X)',
)

// ── 보충표 메뉴(pickToNutritionIn): 교촌·BBQ는 100g당만, 1마리 무게 없음 → typical ──
const pickBy = (b, name) => F.brandMenusIn(T, b).find((p) => p.name === name)
let r = await F.pickToNutritionIn(T, pickBy('kyochon', '허니순살'))
ok(r.unitWeight_source === 'typical' && r.unitWeight_g === 528.1 && r.source === 'official', `교촌 허니순살 메뉴 → typical 528.1 (${r.unitWeight_source} ${r.unitWeight_g})`)
r = await F.pickToNutritionIn(T, pickBy('kyochon', '후라이드한마리'))
ok(r.unitWeight_source === 'typical' && r.unitWeight_g === r1(684.5 * E), `교촌 후라이드한마리 → 684.5 × ${E} (${r.unitWeight_g})`)
r = await F.pickToNutritionIn(T, pickBy('bbq', '황금올리브치킨'))
ok(r.unitWeight_source === 'typical' && r.unitWeight_g === r1(762.8 * E) && r.unit === '마리', `BBQ 황금올리브치킨(DB 행 w 없음) → typical ${r.unitWeight_g}`)
r = await F.pickToNutritionIn(T, pickBy('bbq', '자메이카 통다리구이'))
ok(r.unitWeight_source !== 'typical', `BBQ 통다리구이는 치킨 1마리 무게를 쓰지 않음 (${r.unitWeight_source})`)

// applyMenuPick: 1마리 → 공개 중량 세 필드 + grams_basis typical, 저장·검증 통과
const base = C.applyNutrition(
  { id: 'u1', name: '허니순살', db_food_code: null, eaters: 1, before_grams: 100, remaining_ratio: 0, consumed_grams: 0, per_100g: null, nutrition_source: 'user_input', consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }, kcal_overridden: false, confidence: 1, needs_review: false },
  { source: 'user_input', per_100g: null },
)
const ap = await F.applyMenuPick(base, T, pickBy('kyochon', '허니순살'), { count: 1 })
ok(ap.before_grams === 528.1 && ap.grams_basis === 'typical' && ap.unit_count === 1 && ap.unit === '마리' && Math.round(ap.consumed.kcal) === Math.round(345 * 5.281), `applyMenuPick 교촌 허니순살 1마리 → 528.1g·${Math.round(ap.consumed.kcal)}kcal·typical`)
const ap2 = await F.applyMenuPick(base, T, pickBy('kyochon', '허니순살'), { count: 0.5 })
const stored = C.buildAnalysis([ap, { ...ap2, id: 'u2' }], [], {})
ok(stored.items[0].grams_basis === 'typical' && stored.items[1].unit_count === 0.5, '저장 항목에 grams_basis 남음(0.5마리 포함)')
const mv = mjs.checkAnalysis(stored)
ok(checkAnalysis(stored).errors.length === 0 && (!mv || (mv.errors ?? []).length === 0), `검증(ts·mjs) 통과 (${checkAnalysis(stored).errors.join(' / ')} ${mv ? JSON.stringify(mv.errors) : 'mjs 함수 없음'})`)
const gEdit = C.setBeforeGrams(ap, 400)
ok(!('grams_basis' in gEdit) && !('published_g' in gEdit), '무게를 직접 고치면 grams_basis도 지움')
const forged = structuredClone(stored)
delete forged.items[0].grams_source
delete forged.items[0].published_g
delete forged.items[0].unit_count
ok(checkAnalysis(forged).errors.some((e) => e.includes('grams_basis')), '검증: 공개 중량 없이 grams_basis만 있으면 오류')

// 다른 1개 무게 없는 메뉴(치킨 아님) → 1인분 표(serving, unit 인분)
let servingHit = null
for (const b of T.brands)
  for (const p of F.brandMenusIn(T, b.id)) {
    if (servingHit || p.unitWeight_g || p.unit === '마리') continue
    const x = await F.pickToNutritionIn(T, p)
    if (x.unitWeight_source === 'serving') servingHit = [p, x]
  }
ok(servingHit && servingHit[1].unit === '인분' && servingHit[1].unitWeight_g > 0, `1개 무게 없는 메뉴 → 1인분 표 (${servingHit ? `${servingHit[0].brandName} ${servingHit[0].name} ${servingHit[1].unitWeight_g}g` : '없음'})`)

// ── 사진 분석(assembleAnalysis) ──
const item = (o) => ({ id: 'a1', name: '후라이드치킨', location: '가운데', before_grams: 900, confidence: 0.9, per_100g_guess: { kcal: 280, carbs_g: 10, protein_g: 20, fat_g: 17 }, ...o })
const resolveDb = async () => {
  const code = 'D212-549000000-0039' // 닭튀김_리얼후라이드 치킨
  const f = idx.db.foods[idx.byCode.get(code)]
  return { source: 'db', per_100g: { kcal: f.k, carbs_g: f.cb ?? 0, protein_g: f.p ?? 0, fat_g: f.f ?? 0 }, db_food_code: code, db_name: f.n, db_match: 'name' }
}
let a = await assembleAnalysis({ items: [item({ whole_count: 1 })], warnings: [] }, null, { resolve: resolveDb, detail: async () => null, franchise: T })
let it = a.items[0]
ok(it.grams_basis === 'typical' && it.before_grams === r1(780.9 * E) && it.unit === '마리' && it.unit_count === 1, `DB 닭튀김 통째로 1마리 → 뼈 평균 × ${E} = ${it.before_grams}g (typical)`)
a = await assembleAnalysis({ items: [item({ whole_count: null })], warnings: [] }, null, { resolve: resolveDb, detail: async () => null, franchise: T })
ok(a.items[0].before_grams === 900 && !a.items[0].grams_basis, `일부만 보이면(whole_count 없음) AI 무게 900g 그대로 (${a.items[0].before_grams})`)
a = await assembleAnalysis({ items: [item({ name: '허니순살', brand: '교촌', franchise: true, whole_count: 2 })], warnings: [] }, null, { resolve: resolveDb, detail: async () => null, franchise: T })
it = a.items[0]
ok(it.grams_basis === 'typical' && it.before_grams === r1(528.1 * 2) && it.brand === 'kyochon', `교촌 허니순살 통째로 2마리 → 528.1 × 2 = ${it.before_grams}g`)
const aiRes = async () => ({ source: 'ai_estimate', per_100g: { kcal: 300, carbs_g: 12, protein_g: 20, fat_g: 18 }, via: 'guess' })
a = await assembleAnalysis({ items: [item({ name: '뿌링클 순살치킨', brand: 'bhc', franchise: true, whole_count: 1 })], warnings: [] }, null, { resolve: aiRes, detail: async () => null, franchise: T })
it = a.items[0]
ok(it.grams_basis === 'typical' && it.before_grams === 527.4, `bhc 뿌링클 순살치킨(보충표에 없는 브랜드) 통째로 → 527.4 (${it.before_grams})`)
ok(checkAnalysis(a).errors.length === 0, `사진 분석 결과 검증 통과 (${checkAnalysis(a).errors.join(' / ')})`)

console.log(bad ? `\n${bad}개 실패` : '\n모두 통과')
process.exit(bad ? 1 : 0)
