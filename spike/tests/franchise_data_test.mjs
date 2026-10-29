// 프랜차이즈 보충표 데이터 시험: node spike/tests/franchise_data_test.mjs
// 계약(web/src/analysis/nutrition/franchise.ts FranchiseTable) 형식, 숫자 범위, 출처·확인 날짜, dbCode·dbBrand가 실제 DB에 있는지.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dataDir = path.join(ROOT, 'web/public/data')
const file = fs.readdirSync(dataDir).filter((f) => /^franchise-\d{8}\.json$/.test(f)).sort().pop()
let fail = 0, pass = 0
const ok = (cond, msg) => { if (cond) pass++; else { fail++; if (fail <= 40) console.error('FAIL', msg) } }

ok(!!file, '보충표 파일이 있다')
if (!file) process.exit(1)
const t = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'))
const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'mfds-foods-20261006.json'), 'utf8')).foods
const codes = new Set(db.map((r) => r.c))

const TOP = ['version', 'brands', 'menus', 'dbBrand']
ok(Object.keys(t).every((k) => TOP.includes(k)) && TOP.every((k) => k in t), '최상위 칸은 version·brands·menus·dbBrand')
ok(typeof t.version === 'string' && /^\d{8}$/.test(t.version), 'version은 YYYYMMDD 문자열')
ok(Array.isArray(t.brands) && t.brands.length > 0, 'brands 배열')
const brandIds = new Set()
for (const b of t.brands) {
  ok(typeof b.id === 'string' && b.id && typeof b.name === 'string' && b.name && Array.isArray(b.aliases) && b.aliases.every((a) => typeof a === 'string'), `브랜드 형식 ${JSON.stringify(b)}`)
  ok(Object.keys(b).every((k) => ['id', 'name', 'aliases'].includes(k)), `브랜드 칸 ${b.id}`)
  ok(!brandIds.has(b.id), `브랜드 id 중복 ${b.id}`)
  brandIds.add(b.id)
}

const UNITS = ['개', '마리', '판', '조각', '잔', '인분']
const CATS = ['burger', 'chicken', 'pizza', 'side', 'drink', 'dessert', 'set', 'etc']
const MENU_KEYS = ['id', 'brand', 'name', 'aliases', 'unit', 'size', 'unitWeight_g', 'perUnit', 'per100', 'dbCode', 'category', 'sourceUrl', 'checkedAt']
const NUT_KEYS = ['kcal', 'carbs_g', 'protein_g', 'fat_g', 'sugar_g', 'sodium_mg', 'sat_fat_g']
const ids = new Set()
ok(Array.isArray(t.menus) && t.menus.length > 0, 'menus 배열')
for (const m of t.menus) {
  const tag = `${m.id} ${m.name}`
  ok(Object.keys(m).every((k) => MENU_KEYS.includes(k)), `메뉴 칸 이름 ${tag}: ${Object.keys(m)}`)
  ok(typeof m.id === 'string' && m.id && !ids.has(m.id), `id 고유 ${tag}`)
  ids.add(m.id)
  ok(brandIds.has(m.brand), `브랜드가 brands에 있음 ${tag}`)
  ok(typeof m.name === 'string' && m.name.trim().length > 0, `이름 ${tag}`)
  ok(UNITS.includes(m.unit), `단위 ${tag} ${m.unit}`)
  ok(CATS.includes(m.category), `분류 ${tag} ${m.category}`)
  ok(typeof m.sourceUrl === 'string' && /^https:\/\//.test(m.sourceUrl), `sourceUrl ${tag}`)
  ok(typeof m.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.checkedAt), `checkedAt ${tag}`)
  if (m.aliases !== undefined) ok(Array.isArray(m.aliases), `aliases ${tag}`)
  if (m.size !== undefined) ok(typeof m.size === 'string' && m.size.length > 0, `size ${tag}`)
  if (m.unitWeight_g !== undefined) ok(typeof m.unitWeight_g === 'number' && m.unitWeight_g >= 1 && m.unitWeight_g <= 3000, `중량 1~3000g ${tag} ${m.unitWeight_g}`)
  ok(m.perUnit !== undefined || m.per100 !== undefined, `perUnit 또는 per100 ${tag}`)
  for (const [kind, v] of [['perUnit', m.perUnit], ['per100', m.per100]]) {
    if (v === undefined) continue
    ok(typeof v.kcal === 'number', `${kind}.kcal 있음 ${tag}`)
    for (const [k, x] of Object.entries(v)) {
      ok(NUT_KEYS.includes(k), `${kind} 칸 이름 ${tag} ${k}`)
      ok(typeof x === 'number' && Number.isFinite(x) && x >= 0, `${kind}.${k} 숫자 ${tag} ${x}`)
    }
    if (kind === 'perUnit') ok(v.kcal >= 0 && v.kcal <= 5000, `kcal 0~5000/단위 ${tag} ${v.kcal}`)
    else ok(v.kcal >= 0 && v.kcal <= 900, `kcal 0~900/100g ${tag} ${v.kcal}`)
    if (v.sodium_mg !== undefined) ok(v.sodium_mg <= 20000, `나트륨 범위 ${tag}`)
  }
  if (m.dbCode !== undefined) {
    ok(codes.has(m.dbCode), `dbCode가 DB에 있음 ${tag} ${m.dbCode}`)
    ok(t.dbBrand[m.dbCode] === m.brand, `dbCode 브랜드 일치 ${tag}`)
  }
}
ok(t.dbBrand && typeof t.dbBrand === 'object' && !Array.isArray(t.dbBrand), 'dbBrand 객체')
for (const [c, b] of Object.entries(t.dbBrand)) {
  ok(codes.has(c), `dbBrand 코드가 DB에 있음 ${c}`)
  ok(brandIds.has(b), `dbBrand 브랜드가 brands에 있음 ${c} ${b}`)
}
// 모든 브랜드는 보충표 메뉴나 DB 이름표 중 하나는 가진다
for (const b of brandIds) ok(t.menus.some((m) => m.brand === b) || Object.values(t.dbBrand).includes(b), `쓰이지 않는 브랜드 없음 ${b}`)

console.log(`${file}: ${t.menus.length}개 메뉴, dbBrand ${Object.keys(t.dbBrand).length}개 — 통과 ${pass}, 실패 ${fail}`)
process.exit(fail ? 1 : 0)
