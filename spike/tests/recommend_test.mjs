// 디자인 조각 D12 음식 추천 계산(web/src/analysis/recommend.ts) 시험. AI 호출 없음, 식약처 DB JSON을 파일에서 읽는다.
// 2026-10-28 사용자 결정: 후보 영양값은 DB에서만(없으면 후보 제외), focus 10%p·5%p 규칙, 남은 칼로리 초과 제외, page 순환.
// 실행: node spike/tests/recommend_test.mjs <repo 루트>
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const web = path.join(ROOT, 'web')
const db = await import(pathToFileURL(path.join(web, 'src/analysis/nutrition/db.ts')).href)
const R = await import(pathToFileURL(path.join(web, 'src/analysis/recommend.ts')).href)
const idx = await db.loadDb(async () => JSON.parse(fs.readFileSync(path.join(web, 'public/data/mfds-foods-20261006.json'), 'utf8')))

let pass = 0
const t = (name, fn) => {
  fn()
  pass++
  console.log('ok', name)
}
const A = (kcal, carbs_g, protein_g, fat_g) => ({ kcal, carbs_g, protein_g, fat_g })
const T = A(2000, 250, 100, 50)

// ── 후보가 모두 DB에 있다 ──
t('모든 후보의 DB 이름이 식약처 DB에 있고 kcal·탄·단·지가 비어 있지 않다', () => {
  const { items, missing } = R.buildCandidates(idx)
  assert.deepEqual(missing, [])
  assert.equal(items.length, R.REC_CANDIDATES.length)
  for (const x of items) for (const k of ['kcal', 'carbs_g', 'protein_g', 'fat_g']) assert.ok(Number.isFinite(x[k]) && x[k] >= 0, `${x.name} ${k}`)
  assert.ok(items.length >= 200 && items.length <= 440, `후보 수 ${items.length}`)
  const names = items.map((x) => x.name)
  assert.equal(new Set(names).size, names.length, '화면 이름 중복')
  const per = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  for (const x of items) for (const m of x.meals) per[m]++
  for (const m of Object.keys(per)) assert.ok(per[m] >= 90 && per[m] <= 110, `${m} 후보 ${per[m]}`)
  console.log('   후보', items.length, '끼니별', JSON.stringify(per))
})

t('후보 값 = DB 100g당 값 × g ÷ 100(정식은 합)', () => {
  const foods = idx.db.foods
  const row = (n) => foods.find((f) => f.n === n)
  const items = R.buildCandidates(idx).items
  const egg = items.find((x) => x.name === '삶은 달걀')
  assert.equal(egg.kcal, row('달걀_삶은것').k)
  const set = items.find((x) => x.name === '된장찌개 정식')
  const want = (row('쌀밥').k * 210 + row('된장찌개').k * 300 + row('달걀말이').k * 60) / 100
  assert.ok(Math.abs(set.kcal - want) < 1e-9)
  // 100ml 환산 행(ml)도 그대로 g으로 쓴다
  const fruit = items.find((x) => x.name === '과일샐러드')
  assert.equal(row('과일샐러드').ml, 1)
  assert.ok(Math.abs(fruit.fat_g - (row('과일샐러드').f * 150) / 100) < 1e-9)
})

// ── planFocus ──
const P = (rc, rp, rf) => R.planFocus(A(1000, rc, rp, rf), T)
t('planFocus: 차이 10%p 이내면 세 가지', () => {
  // 탄 50%, 단 45%, 지 40% → 차이 10%p
  assert.deepEqual(P(125, 45, 20), { lacking: 'carbs', focus: ['carbs', 'protein', 'fat'] })
})
t('planFocus: 10%p를 넘으면 두 번째와 5%p 이내일 때 두 가지', () => {
  // 탄 50%, 단 45%, 지 39.8%
  assert.deepEqual(P(125, 45, 19.9), { lacking: 'carbs', focus: ['carbs', 'protein'] })
})
t('planFocus: 두 번째와 5%p를 넘으면 한 가지', () => {
  // 지 60%, 탄 54.8%, 단 30%
  assert.deepEqual(P(137, 30, 30), { lacking: 'fat', focus: ['fat'] })
  // 지 60%, 탄 55% → 정확히 5%p면 두 가지
  assert.deepEqual(P(137.5, 30, 30), { lacking: 'fat', focus: ['fat', 'carbs'] })
})
t('planFocus: 셋 다 0 이하·목표 없음 → null', () => {
  assert.deepEqual(P(0, -5, -1), { lacking: null, focus: [] })
  assert.deepEqual(R.planFocus(A(500, 50, 20, 10), A(0, 0, 0, 0)), { lacking: null, focus: [] })
})
t('planFocus: 목표 0인 영양소는 빼고, 0 이하 비율은 focus에서 뺀다', () => {
  assert.deepEqual(R.planFocus(A(500, 50, 20, 10), A(2000, 0, 100, 50)), { lacking: 'protein', focus: ['protein', 'fat'] })
  // 탄 3%, 단 0%, 지 −4% → 차이 7%p라 세 가지지만 0 이하는 빠진다
  assert.deepEqual(P(7.5, 0, -2), { lacking: 'carbs', focus: ['carbs'] })
})

// ── defaultRecMeal ──
const at = (h, m = 0) => new Date(2026, 9, 28, h, m)
t('defaultRecMeal: 시각 경계', () => {
  const none = new Set()
  assert.equal(R.defaultRecMeal(at(9, 59), none), 'breakfast')
  assert.equal(R.defaultRecMeal(at(10), none), 'lunch')
  assert.equal(R.defaultRecMeal(at(14, 59), none), 'lunch')
  assert.equal(R.defaultRecMeal(at(15), none), 'dinner')
  assert.equal(R.defaultRecMeal(at(21), none), 'snack')
})
t('defaultRecMeal: 기록한 끼니는 건너뛰고 간식에서 멈춘다', () => {
  assert.equal(R.defaultRecMeal(at(8), new Set(['breakfast'])), 'lunch')
  assert.equal(R.defaultRecMeal(at(8), new Set(['breakfast', 'lunch'])), 'dinner')
  assert.equal(R.defaultRecMeal(at(12), new Set(['lunch', 'dinner'])), 'snack')
  assert.equal(R.defaultRecMeal(at(22), new Set(['snack'])), 'snack')
  assert.equal(R.defaultRecMeal(at(12), new Set(['breakfast'])), 'lunch')
})

// ── recommendFoods ──
const all = R.buildCandidates(idx).items
t('남은 칼로리를 넘는 후보는 빠진다', () => {
  const rem = A(500, 60, 30, 15)
  const plan = R.planFocus(rem, T)
  const seen = new Set()
  for (let p = 0; p < 10; p++) for (const x of R.recommendFrom(idx, rem, plan, 'lunch', p)) {
    assert.ok(x.kcal <= 500, `${x.name} ${x.kcal}`)
    seen.add(x.name)
  }
  const fit = all.filter((x) => x.meals.includes('lunch') && x.kcal <= 500).map((x) => x.name)
  assert.deepEqual([...seen].sort(), [...fit].sort())
})
t('page 순환: 4개씩, 다 돌면 처음부터 이어서', () => {
  const rem = A(1200, 150, 60, 40)
  const plan = R.planFocus(rem, T)
  const n = all.filter((x) => x.meals.includes('dinner') && x.kcal <= 1200).length
  assert.ok(n > 4)
  const flat = []
  for (let p = 0; p < n; p++) flat.push(...R.recommendFrom(idx, rem, plan, 'dinner', p).map((x) => x.name))
  // p*4 번째부터 4개: 전체 줄은 첫 n개의 반복
  const first = flat.slice(0, n)
  assert.equal(new Set(first).size, n)
  for (let i = 0; i < flat.length; i++) assert.equal(flat[i], first[i % n])
  assert.deepEqual(R.recommendFrom(idx, rem, plan, 'dinner', 0), R.recommendFrom(idx, rem, plan, 'dinner', n))
})
t('focus 영양소가 많은 후보가 먼저(단백질 부족 → 첫 추천의 단백질이 끼니 평균보다 많다)', () => {
  const rem = A(900, 100, 60, 20)
  const plan = R.planFocus(rem, A(2000, 250, 100, 50)) // 단 60%, 탄 40%, 지 40%
  assert.deepEqual(plan.focus, ['protein'])
  const top = R.recommendFrom(idx, rem, plan, 'dinner', 0)
  const pool = all.filter((x) => x.meals.includes('dinner') && x.kcal <= 900)
  const avg = pool.reduce((s, x) => s + x.protein_g, 0) / pool.length
  for (const x of top) assert.ok(x.protein_g > avg, `${x.name} ${x.protein_g} ≤ ${avg}`)
  console.log('   단백질 추천', top.map((x) => `${x.name} ${x.protein_g}g ${x.kcal}kcal`).join(', '))
})
t('첫 추천 다양성: 같은 조건 page 0~3의 16개가 모두 다르다(끼니마다)', () => {
  const rem = A(800, 100, 50, 25)
  const plan = R.planFocus(rem, T)
  for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const names = [0, 1, 2, 3].flatMap((p) => R.recommendFrom(idx, rem, plan, meal, p).map((x) => x.name))
    assert.equal(names.length, 16, meal)
    assert.equal(new Set(names).size, 16, meal + ' ' + names.join(','))
  }
})
t('남은 양을 넘으면 감점, 세 가지면 고르게', () => {
  const rem = A(800, 30, 30, 30)
  assert.ok(R.scoreItem(A(0, 0, 30, 0), rem, ['protein']) > R.scoreItem(A(0, 0, 50, 0), rem, ['protein']))
  assert.ok(R.scoreItem(A(0, 20, 20, 20), rem, ['carbs', 'protein', 'fat']) > R.scoreItem(A(0, 30, 30, 0), rem, ['carbs', 'protein', 'fat']))
})
t('남은 칼로리 0 이하 → 간식 후보에서 낮은 칼로리 순(끼니와 상관없이)', () => {
  for (const kcal of [0, -150]) {
    const rem = A(kcal, -10, -5, -3)
    const got = R.recommendFrom(idx, rem, R.planFocus(rem, T), 'lunch', 0)
    const snacks = all.filter((x) => x.meals.includes('snack')).sort((a, b) => a.kcal - b.kcal || a.name.localeCompare(b.name, 'ko'))
    assert.deepEqual(got.map((x) => x.name), snacks.slice(0, 4).map((x) => x.name))
    for (let i = 1; i < got.length; i++) assert.ok(got[i - 1].kcal <= got[i].kcal)
  }
})
t('맞는 후보가 없으면 빈 배열, 4개보다 적으면 있는 만큼', () => {
  const rem = A(20, 5, 5, 5)
  assert.deepEqual(R.recommendFrom(idx, rem, R.planFocus(rem, T), 'dinner', 0), [])
  const lim = 170
  const few = all.filter((x) => x.meals.includes('breakfast') && x.kcal <= lim)
  const got = R.recommendFrom(idx, A(lim, 30, 30, 30), { lacking: null, focus: [] }, 'breakfast', 3)
  assert.equal(got.length, Math.min(4, few.length))
})
t('결과 숫자: kcal 정수, g 소수 한 자리', () => {
  for (const x of R.recommendFrom(idx, A(700, 80, 40, 20), R.planFocus(A(700, 80, 40, 20), T), 'lunch', 0)) {
    assert.ok(Number.isInteger(x.kcal))
    for (const k of ['carbs_g', 'protein_g', 'fat_g']) assert.equal(Math.round(x[k] * 10) / 10, x[k])
    assert.ok(x.name && x.portion)
  }
})
t('recommendFoods(비동기)는 recommendFrom과 같다', () => {})
const rem = A(600, 70, 30, 20)
const plan = R.planFocus(rem, T)
assert.deepEqual(await R.recommendFoods(rem, plan, 'lunch', 1), R.recommendFrom(idx, rem, plan, 'lunch', 1))

console.log(`\nrecommend_test: ${pass}개 통과`)
