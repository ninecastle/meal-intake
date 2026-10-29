// 프랜차이즈 보충표(2026-10-29) 계산·조립·a10 시험. 실제 AI 호출 없음.
// 가짜 표(아래 FAKE)로 순서 규칙을 확인하고, web/public/data/franchise-*.json이 있으면 그 표로도 형식·매칭을 확인한다.
// 실행: node spike/tests/franchise_test.mjs
import { readFileSync, readdirSync } from 'node:fs'
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
const DBJSON = JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8'))
const { loadDb, servingOf } = await import(u('src/analysis/nutrition/db.ts'))
const { loadDetailDb } = await import(u('src/analysis/nutrition/detail.ts'))
const F = await import(u('src/analysis/nutrition/franchise.ts'))
const { assembleAnalysis } = await import(u('src/analysis/assemble.ts'))
const C = await import(u('src/analysis/compute.ts'))
const { checkAnalysis } = await import(u('src/analysis/validate.ts'))
const A = await import(u('src/analysis/beforePrompt.ts'))
const mjs = await import(pathToFileURL('C:/Users/kkama/dev/hackathon/.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs').href)

let bad = 0
const ok = (cond, msg) => {
  if (!cond) bad++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
}
const near = (a, b, tol = 0.11) => typeof a === 'number' && Math.abs(a - b) <= tol

const idx = await loadDb(async () => DBJSON)
await loadDetailDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-detail-20261006.json', 'utf8')))
const row = (c) => idx.db.foods[idx.byCode.get(c)]
const BIGMAC = 'D202-091000000-0056' // k261 cb22.42 f13.9 w223
const WHOPPER = 'D202-091000000-0085' // k223 cb·f null w278
const CHEESEWHOPPER = 'D202-091000000-0099' // k236 w303 (보충표에 없음, dbBrand만)
const BULGOGI = 'D202-091000000-0046' // 불고기 버거 k246 w164
const BBQ = 'D202-091000000-0183' // k245 w 없음, cb·f null
ok(row(BIGMAC)?.w === 223 && row(WHOPPER)?.cb === null && row(BBQ)?.w === undefined, 'DB 행 전제(빅맥 w223, 와퍼 탄 null, BBQ 치킨 버거 중량 없음)')

const m = (o) => ({ category: 'burger', unit: '개', sourceUrl: 'https://example.com', checkedAt: '2026-10-29', ...o })
const FAKE = {
  version: 'test',
  brands: [
    { id: 'mcdonalds', name: '맥도날드', aliases: ["McDonald's", '맥날'] },
    { id: 'burgerking', name: '버거킹', aliases: ['Burger King', 'BK'] },
    { id: 'starbucks', name: '스타벅스', aliases: ['Starbucks', '스벅'] },
    { id: 'kyochon', name: '교촌치킨', aliases: ['교촌', 'Kyochon'] },
  ],
  menus: [
    m({ id: 'mc-bigmac', brand: 'mcdonalds', name: '빅맥', unitWeight_g: 220, perUnit: { kcal: 583, sugar_g: 8, sodium_mg: 1000 }, dbCode: BIGMAC }),
    m({ id: 'bk-whopper', brand: 'burgerking', name: '와퍼', unitWeight_g: 290, perUnit: { kcal: 640, protein_g: 28, sugar_g: 12 }, dbCode: WHOPPER }),
    m({ id: 'bk-bbq', brand: 'burgerking', name: 'BBQ 치킨 버거', unitWeight_g: 250, perUnit: { kcal: 600, carbs_g: 60, fat_g: 30 }, dbCode: BBQ }),
    m({ id: 'bk-new', brand: 'burgerking', name: '신메뉴 버거', perUnit: { kcal: 500, carbs_g: 50 } }),
    m({ id: 'sb-latte-t', brand: 'starbucks', name: '카페 라떼 (Tall)', size: 'Tall', unit: '잔', category: 'drink', unitWeight_g: 355, perUnit: { kcal: 180, carbs_g: 15, protein_g: 10, fat_g: 9, sugar_g: 14, sodium_mg: 120, sat_fat_g: 6 } }),
    m({ id: 'sb-latte-s', brand: 'starbucks', name: '카페 라떼 (Short)', size: 'Short', unit: '잔', category: 'drink', unitWeight_g: 237, perUnit: { kcal: 110 } }),
    m({ id: 'kc-original', brand: 'kyochon', name: '교촌 오리지날', unit: '마리', category: 'chicken', per100: { kcal: 250, protein_g: 20 } }),
  ],
  dbBrand: { [CHEESEWHOPPER]: 'burgerking', [WHOPPER]: 'burgerking', [BULGOGI]: 'mcdonalds' },
}
const guess = { kcal: 250, carbs_g: 20, protein_g: 12, fat_g: 14 }
const pickOf = (b, id) => F.brandMenusIn(FAKE, b).find((p) => p.menuId === id)

// ── 순서 규칙 ──
{
  // DB 완전(100g당 kcal + 1개 중량): DB, 중량은 DB(223, 공식 220과 다르면 DB)
  const r = await F.pickToNutritionIn(FAKE, pickOf('mcdonalds', 'mc-bigmac'), { guess })
  ok(r.source === 'db' && r.per_100g.kcal === 261 && r.db_match === 'name' && r.published_g === 223 && r.unitWeight_g === 223 && r.unitWeight_source === 'db', `DB 완전 → DB kcal 261·중량 223 (${r.source} ${r.per_100g?.kcal} ${r.unitWeight_g})`)
  ok(r.parts.carbs_g === 'db' && r.parts.fat_g === 'db' && !r.fill, '빅맥 탄·지 DB')
  ok(near(r.official_detail?.sodium_mg, 455, 0.6) && near(r.official_detail?.sugar_g, 3.6), `보충표 세부(1단위 → 공식 중량 220g으로 100g당): 나트륨 455·당류 3.6 (${JSON.stringify(r.official_detail)})`)
}
{
  // DB 완전 + 탄·지 빈칸: 보충표에 없으면 AI 추정, AI도 없으면 missing
  const r = await F.pickToNutritionIn(FAKE, pickOf('burgerking', 'bk-whopper'), { guess })
  ok(r.source === 'db' && r.per_100g.kcal === 223 && r.per_100g.protein_g === 10.43, '와퍼: kcal·단백질 DB(공식 단백질보다 DB 먼저)')
  ok(r.fill?.carbs_g === 'ai_estimate' && r.per_100g.carbs_g === 20 && r.fill?.fat_g === 'ai_estimate', `와퍼: 탄·지 DB 빈칸 → 보충표 없음 → AI (${JSON.stringify(r.fill)})`)
  const r2 = await F.pickToNutritionIn(FAKE, pickOf('burgerking', 'bk-whopper'))
  ok(r2.fill?.carbs_g === 'missing' && r2.per_100g.carbs_g === 0, 'AI 추정도 없으면 missing(0)')
}
{
  // DB kcal만(중량 없음): 보충표 공식 kcal(공식 중량으로 100g당), 영양소는 하나씩
  const r = await F.pickToNutritionIn(FAKE, pickOf('burgerking', 'bk-bbq'), { guess })
  ok(r.source === 'official' && r.per_100g.kcal === 240, `DB kcal만 → 공식 600kcal/250g = 240/100g (${r.source} ${r.per_100g?.kcal})`)
  ok(r.per_100g.carbs_g === 24 && r.parts.carbs_g === 'official' && r.fill?.carbs_g === 'official', '탄: DB 빈칸 → 보충표 24')
  ok(r.per_100g.protein_g === 11.42 && r.parts.protein_g === 'db', '단: DB 11.42')
  ok(r.per_100g.fat_g === 12 && r.parts.fat_g === 'official', '지: 보충표 12')
  ok(r.unitWeight_g === 250 && r.unitWeight_source === 'official', '1개 중량: DB 없음 → 보충표 250')
}
{
  // DB 없음 + 중량 없음 + 1단위 값만: 1단위 = 100g(nominal)
  const r = await F.pickToNutritionIn(FAKE, pickOf('burgerking', 'bk-new'), { guess })
  ok(r.source === 'official' && r.per_100g.kcal === 500 && r.unitWeight_source === 'nominal' && r.unitWeight_g === 100, `DB 없음·중량 없음 → 1단위 값을 100g 값으로(nominal) (${r.per_100g?.kcal} ${r.unitWeight_source})`)
  ok(r.parts.carbs_g === 'official' && r.per_100g.carbs_g === 50 && r.parts.protein_g === 'ai_estimate' && r.per_100g.protein_g === 12, '탄 공식·단 AI')
  // 100g당만 공개(교촌)
  const k = await F.pickToNutritionIn(FAKE, pickOf('kyochon', 'kc-original'), { guess })
  ok(k.source === 'official' && k.per_100g.kcal === 250 && k.per_100g.protein_g === 20 && !k.unitWeight_g, '100g당만 공개(교촌) → 그대로, 1개 중량 없음')
  // 아무 값도 없음
  const none = await F.pickToNutritionIn({ ...FAKE, menus: [m({ id: 'x', brand: 'mcdonalds', name: '빈 메뉴' })] }, { brand: 'mcdonalds', brandName: '맥도날드', name: '빈 메뉴', unit: '개', menuId: 'x' })
  ok(none.source === 'user_input' && none.per_100g === null, '값이 하나도 없고 AI도 없으면 user_input')
  let called = 0
  const est = await F.pickToNutritionIn({ ...FAKE, menus: [m({ id: 'x', brand: 'mcdonalds', name: '빈 메뉴' })] }, { brand: 'mcdonalds', brandName: '맥도날드', name: '빈 메뉴', unit: '개', menuId: 'x' }, { estimate: async () => (called++, guess) })
  ok(est.source === 'ai_estimate' && est.per_100g.kcal === 250 && called === 1, 'guess가 없으면 estimate를 한 번만 불러 AI 추정')
}

// ── 브랜드·메뉴 목록 ──
ok(F.franchiseBrandsIn(FAKE).map((b) => b.id).join() === 'mcdonalds,burgerking,starbucks,kyochon', '브랜드 목록(표 순서)')
ok(F.franchiseBrandsIn(FAKE, 'drink').map((b) => b.id).join() === 'starbucks', '분류 drink → 스타벅스만')
ok(F.franchiseBrandsIn(FAKE, 'chicken').map((b) => b.id).join() === 'kyochon', '분류 chicken → 교촌')
const bk = F.brandMenusIn(FAKE, 'burgerking')
ok(bk.length === 4 && bk.some((p) => p.dbCode === CHEESEWHOPPER && p.name === '치즈와퍼 버거' && p.unitWeight_g === 303 && !p.menuId), `버거킹 메뉴 = 보충표 3 + DB 치즈와퍼(이름 정리·중량 303), 와퍼 DB 행은 중복 없이 (${bk.map((p) => p.name).join(', ')})`)
ok(F.brandMenusIn(FAKE, 'burgerking', '와퍼')[0]?.name === '와퍼', '검색 "와퍼" → 와퍼 먼저')
ok(F.brandMenusIn(FAKE, 'burgerking', '피자').length === 0, '없는 검색어 → 빈 목록')
ok(F.brandOfDbCodeIn(FAKE, CHEESEWHOPPER)?.id === 'burgerking' && F.brandOfDbCodeIn(FAKE, BBQ)?.id === 'burgerking' && F.brandOfDbCodeIn(FAKE, 'nope') === null, 'brandOfDbCodeIn(dbBrand·보충표 dbCode·없음)')
ok(F.servingOf === servingOf && servingOf(BIGMAC) === null, 'servingOf: 원본 1회 섭취참고량이 비어 null')

// ── 브랜드 판별 매칭 ──
ok(F.matchBrand(FAKE, '맥도날드') === 'mcdonalds' && F.matchBrand(FAKE, "McDonald's") === 'mcdonalds' && F.matchBrand(FAKE, 'mcdonalds') === 'mcdonalds', '맥도날드·영문')
ok(F.matchBrand(FAKE, '버거킹 로고') === 'burgerking' && F.matchBrand(FAKE, '교촌치킨') === 'kyochon' && F.matchBrand(FAKE, '교촌') === 'kyochon', '포함·줄임')
ok(F.matchBrand(FAKE, '롯데리아') === null && F.matchBrand(FAKE, '') === null && F.matchBrand(FAKE, null) === null, '표에 없는 브랜드·빈 값 → null')
ok(F.findBrandMenu(FAKE, 'mcdonalds', '빅맥 버거')?.menuId === 'mc-bigmac' && F.findBrandMenu(FAKE, 'mcdonalds', '맥도날드 빅맥')?.menuId === 'mc-bigmac', '메뉴 찾기: "빅맥 버거"·"맥도날드 빅맥" → 빅맥')
ok(F.findBrandMenu(FAKE, 'starbucks', '카페라떼')?.menuId === 'sb-latte-t', '사이즈 여럿 → Tall')
ok(F.findBrandMenu(FAKE, 'burgerking', '치즈와퍼')?.dbCode === CHEESEWHOPPER, 'DB 브랜드 메뉴도 찾음')
ok(F.findBrandMenu(FAKE, 'burgerking', '몬스터 X') === null, '없는 메뉴 → null')
const ref = F.franchiseRef(FAKE, 'burgerking', '몬스터 X 버거')
// 와퍼 640 · BBQ 600 · 신메뉴 500 · 치즈와퍼 236×303/100=715.08 → 평균 613.77
ok(ref?.label === '버거킹 버거 평균' && ref.kcal === 614, `평균 참고 (${JSON.stringify(ref)})`)
ok(F.franchiseRef(FAKE, 'burgerking', '아이스 아메리카노') === null, '그 분류 메뉴가 없으면 null')

// ── a10 파싱 ──
const raw = {
  f: [
    { id: 'i1', n: '빅맥', l: '가운데 상자', g: 230, c: 0.9, p: { k: 250, c: 22, p: 12, f: 13 }, wc: 1, d: null, fr: true, b: '맥도날드' },
    { id: 'i2', n: '치즈버거', l: '오른쪽', g: 120, c: 0.8, p: null, wc: null, d: null, fr: true, b: null },
    { id: 'i3', n: '김치', l: '왼쪽', g: 50, c: 0.8, p: null, wc: null, d: null, fr: false, b: '없음' },
    { id: 'i4', n: '라떼', l: '컵', g: 350, c: 0.8, p: null, wc: 1, d: null, fr: false, b: '  스타벅스\n' },
  ],
  w: [],
}
const pa = A.parseBeforeText(JSON.stringify(raw))
ok(pa.ok && pa.items[0].franchise === true && pa.items[0].brand === '맥도날드', 'a10 짧은 이름 fr·b → franchise·brand')
ok(pa.ok && pa.items[1].franchise === true && pa.items[1].brand === null, '프랜차이즈·브랜드 모름')
ok(pa.ok && pa.items[2].franchise === false && pa.items[2].brand === null, '"없음" → null')
ok(pa.ok && pa.items[3].franchise === true && pa.items[3].brand === '스타벅스', '브랜드가 있으면 franchise=true, 공백 정리')
const old = A.normalizeBeforeResponse({ items: [{ id: 'i1', name: '김치찌개', location: '', before_grams: 300, confidence: 0.8, per_100g_guess: null }], warnings: [] })
ok(old.ok && !('franchise' in old.items[0]) && !('brand' in old.items[0]), 'a9 이하 응답(원래 이름)엔 칸을 넣지 않음')
ok(A.PROMPT_VERSION_A === 'a10' && A.SYSTEM_INSTRUCTION_A.includes('fr=프랜차이즈') && A.SYSTEM_INSTRUCTION_A.includes('b='), '버전 a10·지시에 fr·b')

// ── assembleAnalysis ──
const dbRes = (c) => {
  const f = row(c)
  const fill = {}
  if (f.cb == null) fill.carbs_g = 'missing'
  if (f.f == null) fill.fat_g = 'missing'
  return { source: 'db', per_100g: { kcal: f.k, carbs_g: f.cb ?? 0, protein_g: f.p, fat_g: f.f ?? 0 }, ...(Object.keys(fill).length ? { fill } : {}), db_food_code: f.c, db_name: f.n, db_match: 'name', ...(f.w ? { published_g: f.w } : {}) }
}
const resolve = async (name, o) => {
  if (name === '불고기 버거') return dbRes(BULGOGI)
  if (name === '치즈와퍼') return dbRes(CHEESEWHOPPER)
  return o?.guess ? { source: 'ai_estimate', per_100g: o.guess, via: 'guess' } : { source: 'user_input', per_100g: null }
}
const bi = (id, name, grams, extra) => ({ id, name, location: '', before_grams: grams, confidence: 0.9, per_100g_guess: guess, whole_count: null, detail_guess: { sugar_g: 5, sodium_mg: 400 }, ...extra })
const before = {
  items: [
    bi('i1', '빅맥', 250, { whole_count: 1, franchise: true, brand: '맥도날드' }),
    bi('i2', '와퍼', 300, { whole_count: 2, franchise: true, brand: 'Burger King' }),
    bi('i3', '몬스터 X 버거', 300, { whole_count: 1, franchise: true, brand: '버거킹' }),
    bi('i4', '작은 X 버거', 100, { whole_count: 1, franchise: true, brand: '버거킹', per_100g_guess: { kcal: 100, carbs_g: 10, protein_g: 5, fat_g: 4 } }),
    bi('i5', '치즈버거', 120, { franchise: true, brand: null }),
    bi('i6', '불고기 버거', 160, { whole_count: 1, franchise: true, brand: '버거킹' }),
    bi('i7', '치즈와퍼', 310, { whole_count: 1, franchise: true, brand: null }),
    bi('i8', '김치찌개', 300, { franchise: false, brand: null }),
    bi('i9', '신메뉴 버거', 200, { franchise: true, brand: '버거킹' }),
  ],
  warnings: [],
  model: 'mock',
  prompt_version: 'a10',
}
const after = { items: before.items.map((b) => ({ id: b.id, remaining_ratio: 0, confidence: 0.9 })), warnings: [], used_before_photo: true, model: 'mock', prompt_version: 'b4' }
const res = await assembleAnalysis(before, after, { resolve, detail: async (c) => (c === BIGMAC ? { sodium_mg: 300 } : null), franchise: FAKE })
const it = Object.fromEntries(res.items.map((x) => [x.id, x]))
ok(it.i1.nutrition_source === 'db' && it.i1.before_grams === 223 && it.i1.grams_source === 'published' && it.i1.unit_count === 1 && it.i1.brand === 'mcdonalds' && it.i1.unit === '개' && it.i1.menu_pick?.menuId === 'mc-bigmac' && it.i1.menu_pick?.dbCode === BIGMAC, `빅맥(브랜드 확실): DB·공개 중량 223 (${it.i1.before_grams} ${it.i1.nutrition_source})`)
ok(it.i1.detail_source?.sodium_mg === 'db' && it.i1.detail_per_100g?.sodium_mg === 300 && it.i1.detail_source?.sugar_g === 'official' && near(it.i1.detail_per_100g?.sugar_g, 3.6), `빅맥 세부: 나트륨 DB 300, 당류 보충표 3.6 (${JSON.stringify(it.i1.detail_source)})`)
ok(it.i2.before_grams === 556 && it.i2.unit_count === 2 && it.i2.brand === 'burgerking' && it.i2.per_100g_fill?.carbs_g === 'ai_estimate', `와퍼 2개(영문 브랜드): 278×2=556 (${it.i2.before_grams})`)
ok(it.i3.nutrition_source === 'ai_estimate' && it.i3.franchise === true && it.i3.brand === 'burgerking' && it.i3.franchise_ref?.label === '버거킹 버거 평균' && !it.i3.needs_review, `없는 메뉴: AI 추정 + 평균 참고, 750kcal는 범위 안 (${JSON.stringify(it.i3.franchise_ref)})`)
ok(it.i4.franchise_ref && it.i4.needs_review === true && it.i4.confidence <= 0.5 && res.warnings.some((w) => w.startsWith('작은 X 버거:') && w.includes('평균')), 'AI 1개 100kcal < 평균의 0.5배 → 확인 필요·경고')
ok(it.i5.franchise === true && it.i5.brand === null && !it.i5.franchise_ref, '프랜차이즈인데 브랜드 모름 → franchise true, brand null')
ok(it.i6.nutrition_source === 'ai_estimate' && it.i6.db_food_code === null && it.i6.brand === 'burgerking', '버거킹이라는데 DB 이름이 맥도날드 행 → DB 안 쓰고 AI 추정')
ok(it.i7.nutrition_source === 'db' && it.i7.brand === 'burgerking' && it.i7.menu_pick?.dbCode === CHEESEWHOPPER && it.i7.unit === '개' && it.i7.before_grams === 303, '브랜드 못 봤지만 DB 행이 브랜드 메뉴 → 브랜드 이름표, 기존 공개 중량 규칙(303)')
ok(it.i8.franchise === undefined && it.i8.brand === undefined, '일반 음식엔 프랜차이즈 필드 없음')
ok(it.i9.nutrition_source === 'official' && it.i9.before_grams === 100 && it.i9.consumed.kcal === 500 && !it.i9.grams_source && res.warnings.some((w) => w.startsWith('신메뉴 버거:')), `공식 1단위 값만(중량 없음): 1개 = 500kcal, 개수 확인 경고 (${it.i9.consumed.kcal})`)
const v1 = checkAnalysis(res)
const v2 = mjs.checkAnalysis(res)
ok(v1.errors.length === 0, `앱 검증 통과 (${v1.errors.join(' / ')})`)
if (v2) ok((v2.errors ?? v2).length === 0, `스킬 검증 통과 (${JSON.stringify(v2.errors ?? v2)})`)
const fr0 = await assembleAnalysis(before, after, { resolve, detail: async () => null, franchise: null })
ok(fr0.items[0].nutrition_source === 'ai_estimate' && fr0.items[0].franchise === true && fr0.items[0].brand === null, '표 없음(null) → 브랜드 맞추기 없이 franchise만')

// ── 개수 0.5 단위(마리·인분) ──
const base = C.applyNutrition({ id: 'u1', name: '교촌 오리지날', db_food_code: null, eaters: 1, before_grams: 600, remaining_ratio: 0, consumed_grams: 0, per_100g: null, nutrition_source: 'user_input', consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }, kcal_overridden: false, confidence: 1, needs_review: false }, { source: 'official', per_100g: { kcal: 250, carbs_g: 10, protein_g: 20, fat_g: 15 } })
const half = { ...base, unit: '마리', grams_source: 'published', published_g: 400, unit_count: 1.5 }
const halfStored = C.buildAnalysis([half], [], {})
ok(halfStored.items[0].unit_count === 1.5 && checkAnalysis(halfStored).errors.length === 0, '마리 1.5 → 저장·검증 통과')
const halfBad = C.buildAnalysis([{ ...half, unit: '개' }], [], {})
ok(!('unit_count' in halfBad.items[0]), '개 1.5 → 공개 중량 표시 지움')
const forged = structuredClone(halfStored)
forged.items[0].unit = '개'
ok(checkAnalysis(forged).errors.some((e) => e.includes('unit_count')), '검증: 개 1.5는 오류')
ok(C.unitCountOk(0.5, '인분') && !C.unitCountOk(0.3, '인분') && !C.unitCountOk(0.5, '개') && C.unitCountOk(10, '개') && !C.unitCountOk(11, '마리'), 'unitCountOk 경계')

// ── applyMenuPick ──
const picked = await F.applyMenuPick(base, FAKE, pickOf('burgerking', 'bk-whopper'), { count: 2, guess })
ok(picked.before_grams === 556 && picked.grams_source === 'published' && picked.unit_count === 2 && picked.brand === 'burgerking' && picked.nutrition_source === 'db' && picked.menu_pick?.menuId === 'bk-whopper', 'applyMenuPick 와퍼 2개')
const halfPick = await F.applyMenuPick(base, { ...FAKE, menus: FAKE.menus.map((x) => (x.id === 'kc-original' ? { ...x, unitWeight_g: 800 } : x)) }, { ...pickOf('kyochon', 'kc-original'), unitWeight_g: 800 }, { count: 0.5 })
ok(halfPick.before_grams === 400 && halfPick.unit_count === 0.5 && halfPick.unit === '마리' && halfPick.nutrition_source === 'official', `applyMenuPick 치킨 반 마리 (${halfPick.before_grams} ${halfPick.unit_count})`)
const pv = checkAnalysis(C.buildAnalysis([picked, { ...halfPick, id: 'u2' }], [], {})).errors
ok(pv.length === 0, `applyMenuPick 결과 검증 통과 (${pv.join(' / ')})`)

// ── 화면용 비동기 래퍼(표를 안에서 불러옴) ──
const T0 = await F.loadFranchise(async () => FAKE)
ok(T0.brands.length === 4 && (await F.loadFranchise()) === T0, 'loadFranchise 한 번 받고 캐시')
ok((await F.franchiseBrands('burger')).map((b) => b.id).join() === 'mcdonalds,burgerking', 'franchiseBrands(category)')
ok((await F.brandMenus('burgerking')).length === 4 && (await F.brandOfDbCode(CHEESEWHOPPER)) === 'burgerking' && (await F.brandOfDbCode('x')) === null, 'brandMenus·brandOfDbCode 래퍼')
const wr = await F.pickToNutrition(pickOf('burgerking', 'bk-bbq'))
ok(wr.source === 'official' && wr.per_100g.kcal === 240, 'pickToNutrition(pick) 래퍼')

// ── 실제 표(있으면) ──
const files = readdirSync(W + 'public/data').filter((f) => /^franchise-\d{8}\.json$/.test(f))
if (files.length === 0) console.log('SKIP 실제 보충표 파일이 아직 없음(web/public/data/franchise-*.json)')
for (const file of files) {
  const T = JSON.parse(readFileSync(W + 'public/data/' + file, 'utf8'))
  ok(Array.isArray(T.brands) && Array.isArray(T.menus) && T.dbBrand && typeof T.dbBrand === 'object', `${file}: 형식`)
  const ids = new Set(T.menus.map((x) => x.id))
  ok(ids.size === T.menus.length, `${file}: 메뉴 id 고유 (${T.menus.length}줄)`)
  const missingDb = T.menus.filter((x) => x.dbCode && !idx.byCode.has(x.dbCode)).map((x) => x.id)
  ok(missingDb.length === 0, `${file}: dbCode가 DB에 있음 (없는 것 ${missingDb.slice(0, 5).join(', ')})`)
  const brands = F.franchiseBrandsIn(T)
  console.log(`  브랜드 ${brands.length}: ${brands.map((b) => `${b.name} ${F.brandMenusIn(T, b.id).length}`).join(', ')}`)
  for (const b of T.brands) ok(F.matchBrand(T, b.name) === b.id, `${file}: matchBrand(${b.name})`)
  let sumOfficial = 0, sumDb = 0, sumAi = 0
  for (const b of brands)
    for (const p of F.brandMenusIn(T, b.id)) {
      const r = await F.pickToNutritionIn(T, p)
      if (r.source === 'official') sumOfficial++
      else if (r.source === 'db') sumDb++
      else sumAi++
    }
  console.log(`  칼로리 출처: DB ${sumDb} · 공식 ${sumOfficial} · 값 없음 ${sumAi}`)
  const conflicts = T.menus.filter((x) => x.dbCode && x.unitWeight_g && row(x.dbCode)?.w && Math.abs(row(x.dbCode).w - x.unitWeight_g) > 1)
  console.log(`  DB·공식 중량이 다른 메뉴 ${conflicts.length}개(DB 사용): ${conflicts.slice(0, 10).map((x) => `${x.name} DB ${row(x.dbCode).w}g/공식 ${x.unitWeight_g}g`).join(', ')}`)
}

console.log(bad ? `\n${bad}개 실패` : '\n모두 통과')
process.exit(bad ? 1 : 0)
