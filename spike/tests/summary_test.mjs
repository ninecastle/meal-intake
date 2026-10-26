// 3단계 조각 1: summarizeDay 단위 시험(순수 함수, Firestore·AI 호출 없음).
// 실행: node spike/tests/summary_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { summarizeDay } = await import(pathToFileURL(path.join(ROOT, 'web/src/data/summary.ts')).href)

const D = '2026-10-31'
const ts = (iso) => {
  const ms = Date.parse(iso)
  return { toDate: () => new Date(ms), toMillis: () => ms }
}
const item = (name, nutrition_source, extra = {}) => ({ name, nutrition_source, ...extra })
const meal = (id, mealType, status, createdIso, consumed, items, extra = {}) => ({
  id, dateKey: D, mealType, status,
  createdAt: createdIso ? ts(createdIso) : null, updatedAt: null,
  analysis: { items, totals: { before_kcal: 0, consumed }, warnings: [] },
  ...extra,
})

// 손 계산
// done: m1 점심 512.3/70.1/20.4/15.2, m2 아침 250.4/30.3/10.1/8.7(수정됨), m3 점심 120/0/0/0(user_input)
// 합계 kcal 882.7, 탄 100.4, 단 30.5, 지 23.9 / 아침 250.4·30.3·10.1·8.7 (1건) / 점심 632.3·70.1·20.4·15.2 (2건)
// 빠지는 것: m4 needs_review(999 kcal), m5 다른 날짜 done(777 kcal)
const m1 = meal('m1', 'lunch', 'done', '2026-10-31T12:10:00+09:00',
  { kcal: 512.3, carbs_g: 70.1, protein_g: 20.4, fat_g: 15.2 },
  [item('김치찌개', 'db'), item(' 공기밥 ', 'db', { per_100g_fill: { carbs_g: 'ai_estimate' } })])
const m2 = meal('m2', 'breakfast', 'done', '2026-10-31T08:05:00+09:00',
  { kcal: 250.4, carbs_g: 30.3, protein_g: 10.1, fat_g: 8.7 },
  [item('토스트', 'ai_estimate')], { editedAt: ts('2026-10-31T09:00:00+09:00') })
const m3 = meal('m3', 'lunch', 'done', '2026-10-31T13:00:00+09:00',
  { kcal: 120, carbs_g: 0, protein_g: 0, fat_g: 0 }, [item('떡', 'user_input')])
const m4 = meal('m4', 'dinner', 'needs_review', '2026-10-31T19:00:00+09:00',
  { kcal: 999, carbs_g: 99, protein_g: 99, fat_g: 99 }, [item('라면', 'user_input')])
const m5 = { ...meal('m5', 'snack', 'done', '2026-10-30T22:00:00+09:00',
  { kcal: 777, carbs_g: 1, protein_g: 1, fat_g: 1 }, [item('과자', 'db')]), dateKey: '2026-10-30' }

const s = summarizeDay(D, [m3, m4, m1, m5, m2])
assert.equal(s.dateKey, D)
assert.deepEqual(s.totals, { kcal: 882.7, carbs_g: 100.4, protein_g: 30.5, fat_g: 23.9 })
assert.deepEqual(s.byMealType.breakfast, { kcal: 250.4, carbs_g: 30.3, protein_g: 10.1, fat_g: 8.7, count: 1 })
assert.deepEqual(s.byMealType.lunch, { kcal: 632.3, carbs_g: 70.1, protein_g: 20.4, fat_g: 15.2, count: 2 })
assert.deepEqual(s.byMealType.dinner, { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0, count: 0 })
assert.deepEqual(s.byMealType.snack, { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0, count: 0 })
assert.deepEqual(s.meals.map((m) => m.id), ['m2', 'm1', 'm3'])
assert.deepEqual(s.meals[1].itemNames, ['김치찌개', '공기밥'])
assert.equal(s.meals[0].editedAt?.toISOString(), '2026-10-31T00:00:00.000Z')
assert.equal(s.meals[1].editedAt, null)
assert.equal(s.meals[0].createdAt?.toISOString(), '2026-10-30T23:05:00.000Z')
assert.deepEqual(s.meals[2].consumed, { kcal: 120, carbs_g: 0, protein_g: 0, fat_g: 0 })
assert.equal(s.incompleteMacros, true) // m3 user_input
assert.equal(s.hasPendingWrites, false)
console.log('PASS 기본: 합계·끼니별·정렬·editedAt·user_input·needs_review/다른 날짜 제외')

// incompleteMacros: ai_estimate fill만 있으면 false, missing이 있으면 true
assert.equal(summarizeDay(D, [m1, m2]).incompleteMacros, false)
const m6 = meal('m6', 'snack', 'done', null, { kcal: 0.1, carbs_g: 0.2, protein_g: 0, fat_g: 0 },
  [item('우유', 'db', { per_100g_fill: { fat_g: 'missing' } })])
const m7 = meal('m7', 'snack', 'done', '2026-10-31T16:00:00+09:00', { kcal: 0.2, carbs_g: 0.1, protein_g: 0, fat_g: 0 },
  [item('사과', 'db')])
const s2 = summarizeDay(D, [m6, m1, m7])
assert.equal(s2.incompleteMacros, true)
// 부동소수 오차 정리(0.1+0.2), createdAt 없는 기록은 맨 뒤
assert.equal(s2.byMealType.snack.kcal, 0.3)
assert.equal(s2.byMealType.snack.carbs_g, 0.3)
assert.equal(s2.byMealType.snack.count, 2)
assert.deepEqual(s2.meals.map((m) => m.id), ['m1', 'm7', 'm6'])
console.log('PASS fill missing·반올림·createdAt 없음 정렬')

// 빈 날
const e = summarizeDay(D, [])
assert.deepEqual(e.totals, { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 })
assert.equal(e.meals.length, 0)
assert.equal(e.incompleteMacros, false)
console.log('PASS 빈 날')
