// 디자인 조각 D12 음식 추천 계산(web/src/analysis/recommend.ts) 시험. AI 호출 없음, 식약처 DB JSON을 파일에서 읽는다.
// 2026-10-28 사용자 결정: 후보 영양값은 DB에서만(없으면 후보 제외), 한 음식은 한 끼니에만·끼니마다 약 100개,
// focus 10%p·5%p 규칙, 남은 칼로리 초과 제외, page 순환, 넘침이면 가벼운 추천(light), 넘은 영양소 감점.
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
const t = async (name, fn) => {
  await fn()
  pass++
  console.log('ok', name)
}
const A = (kcal, carbs_g, protein_g, fat_g) => ({ kcal, carbs_g, protein_g, fat_g })
const T = A(2000, 250, 100, 50)
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
const all = R.buildCandidates(idx).items
const byKcal = (a, b) => a.kcal - b.kcal || a.name.localeCompare(b.name, 'ko')

// ── 후보 ──
await t('모든 후보의 DB 이름이 식약처 DB에 있고 kcal·탄·단·지가 비어 있지 않다', () => {
  const { items, missing } = R.buildCandidates(idx)
  assert.deepEqual(missing, [])
  assert.equal(items.length, R.REC_CANDIDATES.length)
  for (const x of items) for (const k of ['kcal', 'carbs_g', 'protein_g', 'fat_g']) assert.ok(Number.isFinite(x[k]) && x[k] >= 0, `${x.name} ${k}`)
})
await t('한 음식은 한 끼니에만, 끼니마다 90~110개, 화면 이름 겹침 0, 간식 200kcal 이하 많이', () => {
  const per = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  for (const x of all) {
    assert.equal(x.meals.length, 1, x.name)
    per[x.meals[0]]++
  }
  for (const m of MEALS) assert.ok(per[m] >= 90 && per[m] <= 110, `${m} 후보 ${per[m]}`)
  const names = all.map((x) => x.name)
  assert.equal(new Set(names).size, names.length, '화면 이름 중복(끼니 사이 포함)')
  const light = all.filter((x) => x.meals[0] === 'snack' && x.kcal <= 200).length
  assert.ok(light >= 40, `간식 200kcal 이하 ${light}`)
  console.log('   후보', all.length, '끼니별', JSON.stringify(per), '간식 200kcal 이하', light)
})
await t('후보 값 = DB 100g당 값 × g ÷ 100(정식은 합, 100ml 환산 행 포함)', () => {
  const row = (n) => idx.db.foods.find((f) => f.n === n)
  const egg = all.find((x) => x.name === '삶은 달걀')
  assert.equal(egg.kcal, row('달걀_삶은것').k)
  const set = all.find((x) => x.name === '된장찌개 정식')
  const want = (row('쌀밥').k * 210 + row('된장찌개').k * 300 + row('달걀말이').k * 60) / 100
  assert.ok(Math.abs(set.kcal - want) < 1e-9)
  const fruit = all.find((x) => x.name === '과일샐러드')
  assert.equal(row('과일샐러드').ml, 1)
  assert.ok(Math.abs(fruit.fat_g - (row('과일샐러드').f * 150) / 100) < 1e-9)
})

// ── planFocus ──
const P = (rc, rp, rf, kcal = 1000) => R.planFocus(A(kcal, rc, rp, rf), T)
await t('planFocus: 차이 10%p 이내면 세 가지', () => {
  assert.deepEqual(P(125, 45, 20), { lacking: 'carbs', focus: ['carbs', 'protein', 'fat'], light: false }) // 50·45·40%
})
await t('planFocus: 10%p를 넘으면 두 번째와 5%p 이내일 때 두 가지', () => {
  assert.deepEqual(P(125, 45, 19.9), { lacking: 'carbs', focus: ['carbs', 'protein'], light: false })
})
await t('planFocus: 두 번째와 5%p를 넘으면 한 가지, 정확히 5%p면 두 가지', () => {
  assert.deepEqual(P(137, 30, 30), { lacking: 'fat', focus: ['fat'], light: false })
  assert.deepEqual(P(137.5, 30, 30), { lacking: 'fat', focus: ['fat', 'carbs'], light: false })
})
await t('planFocus: light — 칼로리 넘음(0·음수), 세 영양소 모두 넘음', () => {
  assert.deepEqual(P(100, 50, 20, 0), { lacking: null, focus: [], light: true })
  assert.deepEqual(P(100, 50, 20, -80), { lacking: null, focus: [], light: true })
  assert.deepEqual(P(0, -5, -1), { lacking: null, focus: [], light: true })
})
await t('planFocus: 목표 없음은 light 아님', () => {
  assert.deepEqual(R.planFocus(A(500, 50, 20, 10), A(0, 0, 0, 0)), { lacking: null, focus: [], light: false })
})
await t('planFocus: 목표 0인 영양소는 빼고, 0 이하 비율은 focus에서 빼고 over에 둔다', () => {
  assert.deepEqual(R.planFocus(A(500, 50, 20, 10), A(2000, 0, 100, 50)), { lacking: 'protein', focus: ['protein', 'fat'], light: false })
  assert.deepEqual(P(7.5, 0, -2), { lacking: 'carbs', focus: ['carbs'], light: false, over: ['protein', 'fat'] })
})

// ── defaultRecMeal ──
const at = (h, m = 0) => new Date(2026, 9, 28, h, m)
await t('defaultRecMeal: 시각 경계', () => {
  const none = new Set()
  assert.equal(R.defaultRecMeal(at(9, 59), none), 'breakfast')
  assert.equal(R.defaultRecMeal(at(10), none), 'lunch')
  assert.equal(R.defaultRecMeal(at(14, 59), none), 'lunch')
  assert.equal(R.defaultRecMeal(at(15), none), 'dinner')
  assert.equal(R.defaultRecMeal(at(21), none), 'snack')
})
await t('defaultRecMeal: 기록한 끼니는 건너뛰고 간식에서 멈춘다', () => {
  assert.equal(R.defaultRecMeal(at(8), new Set(['breakfast'])), 'lunch')
  assert.equal(R.defaultRecMeal(at(8), new Set(['breakfast', 'lunch'])), 'dinner')
  assert.equal(R.defaultRecMeal(at(12), new Set(['lunch', 'dinner'])), 'snack')
  assert.equal(R.defaultRecMeal(at(22), new Set(['snack'])), 'snack')
  assert.equal(R.defaultRecMeal(at(12), new Set(['breakfast'])), 'lunch')
})

// ── recommendFrom ──
await t('남은 칼로리를 넘는 후보는 빠진다', () => {
  const rem = A(500, 60, 30, 15)
  const plan = R.planFocus(rem, T)
  const seen = new Set()
  for (let p = 0; p < 30; p++) for (const x of R.recommendFrom(idx, rem, plan, 'lunch', p)) {
    assert.ok(x.kcal <= 500, `${x.name} ${x.kcal}`)
    seen.add(x.name)
  }
  const fit = all.filter((x) => x.meals.includes('lunch') && x.kcal <= 500).map((x) => x.name)
  assert.deepEqual([...seen].sort(), [...fit].sort())
})
await t('page 순환: 4개씩, 다 돌면 처음부터 이어서', () => {
  const rem = A(1200, 150, 60, 40)
  const plan = R.planFocus(rem, T)
  const n = all.filter((x) => x.meals.includes('dinner') && x.kcal <= 1200).length
  assert.ok(n > 4)
  const flat = []
  for (let p = 0; p < n; p++) flat.push(...R.recommendFrom(idx, rem, plan, 'dinner', p).map((x) => x.name))
  const first = flat.slice(0, n)
  assert.equal(new Set(first).size, n)
  for (let i = 0; i < flat.length; i++) assert.equal(flat[i], first[i % n])
  assert.deepEqual(R.recommendFrom(idx, rem, plan, 'dinner', 0), R.recommendFrom(idx, rem, plan, 'dinner', n))
})
await t('첫 추천 다양성: 같은 조건 page 0~3의 16개가 모두 다르다(네 끼니)', () => {
  const rem = A(800, 100, 50, 25)
  const plan = R.planFocus(rem, T)
  for (const meal of MEALS) {
    const names = [0, 1, 2, 3].flatMap((p) => R.recommendFrom(idx, rem, plan, meal, p).map((x) => x.name))
    assert.equal(names.length, 16, meal)
    assert.equal(new Set(names).size, 16, meal + ' ' + names.join(','))
  }
})
await t('focus 영양소가 많은 후보가 먼저(단백질 부족 → 첫 추천의 단백질이 끼니 평균보다 많다)', () => {
  const rem = A(900, 100, 60, 20)
  const plan = R.planFocus(rem, T) // 단 60%, 탄 40%, 지 40%
  assert.deepEqual(plan.focus, ['protein'])
  const top = R.recommendFrom(idx, rem, plan, 'dinner', 0)
  const pool = all.filter((x) => x.meals.includes('dinner') && x.kcal <= 900)
  const avg = pool.reduce((s, x) => s + x.protein_g, 0) / pool.length
  for (const x of top) assert.ok(x.protein_g > avg, `${x.name} ${x.protein_g} ≤ ${avg}`)
  console.log('   단백질 추천', top.map((x) => `${x.name} ${x.protein_g}g ${x.kcal}kcal`).join(', '))
})
await t('남은 양을 넘으면 감점, 세 가지면 고르게, 넘은 영양소가 많으면 감점', () => {
  const rem = A(800, 30, 30, 30)
  assert.ok(R.scoreItem(A(0, 0, 30, 0), rem, ['protein']) > R.scoreItem(A(0, 0, 50, 0), rem, ['protein']))
  assert.ok(R.scoreItem(A(0, 20, 20, 20), rem, ['carbs', 'protein', 'fat']) > R.scoreItem(A(0, 30, 30, 0), rem, ['carbs', 'protein', 'fat']))
  const over = A(600, 50, 30, -3)
  assert.ok(R.scoreItem(A(0, 0, 30, 5), over, ['protein'], ['fat']) > R.scoreItem(A(0, 0, 30, 25), over, ['protein'], ['fat']))
})
await t('지방이 넘은 경우: 상위 4개 평균 지방이 감점 없는 순위보다 낮다(네 끼니)', () => {
  const rem = A(800, 100, 50, -5)
  const plan = R.planFocus(rem, T)
  assert.equal(plan.light, false)
  assert.deepEqual(plan.over, ['fat'])
  for (const meal of MEALS) {
    const got = R.recommendFrom(idx, rem, plan, meal, 0)
    const plain = all
      .filter((x) => x.meals.includes(meal) && x.kcal <= rem.kcal)
      .map((x) => ({ x, s: R.scoreItem(x, rem, plan.focus) }))
      .sort((a, b) => b.s - a.s || byKcal(a.x, b.x))
      .slice(0, 4)
      .map((e) => e.x)
    const avg = (xs) => xs.reduce((s, x) => s + x.fat_g, 0) / xs.length
    assert.ok(avg(got) < avg(plain), `${meal} ${avg(got)} ≥ ${avg(plain)}`)
    console.log(`   ${meal} 지방 평균 ${avg(got).toFixed(1)}g (감점 없으면 ${avg(plain).toFixed(1)}g)`)
  }
})
await t('light(칼로리 넘음·세 영양소 모두 넘음): 고른 끼니 후보를 칼로리 오름차순으로, page마다 다음 4개', () => {
  for (const rem of [A(-150, 10, 5, 3), A(300, -10, -5, -2)]) {
    const plan = R.planFocus(rem, T)
    assert.equal(plan.light, true)
    for (const meal of MEALS) {
      const want = all.filter((x) => x.meals.includes(meal)).sort(byKcal).map((x) => x.name)
      const got = [0, 1].flatMap((p) => R.recommendFrom(idx, rem, plan, meal, p).map((x) => x.name))
      assert.deepEqual(got, want.slice(0, 8), meal)
    }
  }
})
await t('맞는 후보가 없으면 빈 배열, 4개보다 적으면 있는 만큼', () => {
  const rem = A(20, 5, 5, 5)
  assert.deepEqual(R.recommendFrom(idx, rem, R.planFocus(rem, T), 'dinner', 0), [])
  const lim = 170
  const few = all.filter((x) => x.meals.includes('breakfast') && x.kcal <= lim)
  const got = R.recommendFrom(idx, A(lim, 30, 30, 30), { lacking: null, focus: [], light: false }, 'breakfast', 3)
  assert.equal(got.length, Math.min(4, few.length))
})
await t('결과 숫자: kcal 정수, g 소수 한 자리', () => {
  for (const x of R.recommendFrom(idx, A(700, 80, 40, 20), R.planFocus(A(700, 80, 40, 20), T), 'lunch', 0)) {
    assert.ok(Number.isInteger(x.kcal))
    for (const k of ['carbs_g', 'protein_g', 'fat_g']) assert.equal(Math.round(x[k] * 10) / 10, x[k])
    assert.ok(x.name && x.portion)
  }
})
await t('recommendFoods(비동기)는 recommendFrom과 같다', async () => {
  const rem = A(600, 70, 30, 20)
  const plan = R.planFocus(rem, T)
  assert.deepEqual(await R.recommendFoods(rem, plan, 'lunch', 1), R.recommendFrom(idx, rem, plan, 'lunch', 1))
})

console.log(`\nrecommend_test: ${pass}개 통과`)
