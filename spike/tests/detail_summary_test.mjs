// D4 세부 영양소 합계 sumDetail·summarizeDay.detail 시험(순수 함수, Firestore·AI 호출 없음).
// 실행: node spike/tests/detail_summary_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { summarizeDay, sumDetail } = await import(pathToFileURL(path.join(ROOT, 'web/src/data/summary.ts')).href)

const D = '2026-10-28'
const it = (name, detail_consumed, detail_source) => ({ name, nutrition_source: 'db', ...(detail_consumed ? { detail_consumed, detail_source } : {}) })
const analysis = (items) => ({ items, totals: { before_kcal: 0, consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 } }, warnings: [] })

// 음식 4개: a(DB 당·나트륨·포화), b(당 DB·나트륨 AI 추정), c(세부 없음 — 지난 기록), d(식이섬유만 AI 추정).
// 값은 저장 형식 그대로(toStoredItem: g 소수 첫째 자리, mg 정수)
const a = it('제육덮밥', { sugar_g: 9.1, sodium_mg: 1210, satfat_g: 5.6 }, { sugar_g: 'db', sodium_mg: 'db', satfat_g: 'db' })
const b = it('미역국', { sugar_g: 1.0, sodium_mg: 641 }, { sugar_g: 'db', sodium_mg: 'ai_estimate' })
const c = it('콩나물무침')
const d = it('사과', { fiber_g: 2.4 }, { fiber_g: 'ai_estimate' })

const s = sumDetail([analysis([a, b]), analysis([c, d])])
assert.equal(s.items, 4)
assert.deepEqual(s.totals.sugar_g, { value: 10.1, count: 2, est: false })
assert.deepEqual(s.totals.sodium_mg, { value: 1851, count: 2, est: true }) // b가 AI 추정
assert.deepEqual(s.totals.satfat_g, { value: 5.6, count: 1, est: false })
assert.deepEqual(s.totals.fiber_g, { value: 2.4, count: 1, est: true })

// 값이 하나도 없으면 키가 없다(화면은 "–")
assert.deepEqual(sumDetail([analysis([c])]), { items: 1, totals: {} })
assert.deepEqual(sumDetail([]), { items: 0, totals: {} })
// 숫자가 아닌 값은 센 데서 뺀다
assert.equal(sumDetail([analysis([it('x', { sugar_g: NaN, sodium_mg: '3' }, {})])]).totals.sugar_g, undefined)

// summarizeDay: done·같은 날짜만 더한다
const meal = (id, status, dateKey, items) => ({ id, dateKey, mealType: 'lunch', status, createdAt: null, updatedAt: null, analysis: analysis(items) })
const day = summarizeDay(D, [meal('m1', 'done', D, [a, b]), meal('m2', 'needs_review', D, [d]), meal('m3', 'done', '2026-10-27', [d]), meal('m4', 'done', D, [c])])
assert.equal(day.detail.items, 3)
assert.deepEqual(day.detail.totals.sugar_g, { value: 10.1, count: 2, est: false })
assert.equal(day.detail.totals.fiber_g, undefined)
console.log('모두 통과')
