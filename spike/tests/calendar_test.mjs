// 3단계 조각 3-1 기록 보기(히트맵 달력): lib/calendar.ts 순수 함수 시험(Firestore·AI 호출 없음). 규칙은 스펙 4.7절 "기록 보기".
// 실행: node spike/tests/calendar_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { parseMonth, shiftMonth, monthRange, goalForDate, heatLevelFor, monthGrid, gridRange, monthSummary, targetOf, metricOf, REFERENCE_AMOUNT, monthDayCount, monthDayLabels, monthInRangeDays, CAL_NUTS, CAL_NUT_LABEL } = await import(
  pathToFileURL(path.join(ROOT, 'web/src/lib/calendar.ts')).href
)

// 달 주소: 틀리면·미래면 이번 달
const today = '2026-10-27'
assert.equal(parseMonth('2026-09', today), '2026-09')
assert.equal(parseMonth('2026-10', today), '2026-10')
assert.equal(parseMonth('2026-11', today), '2026-10')
assert.equal(parseMonth('2026-13', today), '2026-10')
assert.equal(parseMonth('2026-9', today), '2026-10')
assert.equal(parseMonth(null, today), '2026-10')
assert.equal(shiftMonth('2026-01', -1), '2025-12')
assert.equal(shiftMonth('2026-12', 1), '2027-01')
assert.equal(shiftMonth('2026-10', 0), '2026-10')

// 범위: 윤년 2월, 30일·31일 달
assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' })
assert.deepEqual(monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
assert.deepEqual(monthRange('2026-11'), { start: '2026-11-01', end: '2026-11-30' })
assert.deepEqual(monthRange('2026-10'), { start: '2026-10-01', end: '2026-10-31' })

// 날짜별 목표: dateKey <= D 가운데 가장 늦은 것, 순서 상관없음
const t = (kcal) => ({ target_kcal: kcal, carbs_g: 1, protein_g: 1, fat_g: 1, source: 'recommended' })
const goals = [
  { dateKey: '2026-10-20', targets: t(2000) },
  { dateKey: '2026-10-05', targets: t(1800) },
  { dateKey: '2026-10-25', targets: t(2200) },
]
assert.equal(goalForDate(goals, '2026-10-04'), null)
assert.equal(goalForDate(goals, '2026-10-05').target_kcal, 1800)
assert.equal(goalForDate(goals, '2026-10-19').target_kcal, 1800)
assert.equal(goalForDate(goals, '2026-10-20').target_kcal, 2000)
assert.equal(goalForDate(goals, '2026-10-31').target_kcal, 2200)
assert.equal(goalForDate([], '2026-10-31'), null)

// ── 히트맵(2026-10-27 사용자 결정) ──
// 진하기: 50% 미만 1, 50~90% 2, 90~110%(경계 포함) 3 + ✓, 110% 초과 4, 기록 없음 0
const h = (v, t, m = 'kcal') => heatLevelFor(v, t, m)
assert.deepEqual(h(null, 2000), { level: 0, inRange: false, ratio: null, basis: null })
assert.equal(h(999, 2000).level, 1)
assert.equal(h(1000, 2000).level, 2)
assert.equal(h(1799, 2000).level, 2)
assert.equal(h(1800, 2000).level, 3)
assert.equal(h(1800, 2000).inRange, true)
assert.equal(h(2200, 2000).level, 3)
assert.equal(h(2201, 2000).level, 4)
assert.equal(h(2201, 2000).inRange, false)
assert.equal(h(0, 2000).level, 1)
// 목표가 없는 날: 항목별 기준량(2,000kcal 55:20:25) 대비, ✓ 없음
assert.deepEqual(REFERENCE_AMOUNT, { kcal: 2000, carbs_g: 275, protein_g: 100, fat_g: 56 })
assert.equal(h(2000, null).level, 3)
assert.equal(h(2000, null).inRange, false)
assert.equal(h(2000, null).basis, 'reference')
assert.equal(h(100, null, 'protein_g').level, 3)
assert.equal(h(30, null, 'fat_g').level, 2)
assert.equal(h(50, 0, 'carbs_g').basis, 'reference')
// 탄·단·지 목표
const T = { target_kcal: 2060, carbs_g: 283, protein_g: 103, fat_g: 57, source: 'recommended' }
assert.equal(targetOf(T, 'kcal'), 2060)
assert.equal(targetOf(T, 'protein_g'), 103)
assert.equal(targetOf(null, 'fat_g'), null)
assert.equal(metricOf({ kcal: 1, carbs_g: 2, protein_g: 3, fat_g: 4 }, 'fat_g'), 4)
assert.equal(h(103, targetOf(T, 'protein_g'), 'protein_g').inRange, true)

// 월요일 시작 격자, 앞뒤 달 날짜 채움
// 2026-10: 1일 목요일 → 앞 9/28~9/30, 31일 토요일 → 뒤 11/1 → 35칸
const g10 = monthGrid('2026-10')
assert.equal(g10.length, 35)
assert.deepEqual(g10[0], { dateKey: '2026-09-28', inMonth: false })
assert.deepEqual(g10[3], { dateKey: '2026-10-01', inMonth: true })
assert.deepEqual(g10[34], { dateKey: '2026-11-01', inMonth: false })
assert.equal(g10.filter((c) => c.inMonth).length, 31)
// 2026-11: 1일 일요일 → 앞 6칸, 30일 월요일 → 뒤 6칸 → 42칸(6주)
const g11 = monthGrid('2026-11')
assert.equal(g11.length, 42)
assert.equal(g11[0].dateKey, '2026-10-26')
assert.equal(g11[41].dateKey, '2026-12-06')
assert.deepEqual(gridRange('2026-11'), { start: '2026-10-26', end: '2026-12-06' })
// 2027-02: 1일 월요일, 28일 일요일 → 28칸(4주), 연도 넘김 2026-12 → 2027-01-03까지
assert.equal(monthGrid('2027-02').length, 28)
assert.equal(monthGrid('2026-12').at(-1).dateKey, '2027-01-03')
for (const m of ['2026-01', '2026-02', '2026-03', '2026-08', '2026-11', '2028-02']) {
  const g = monthGrid(m)
  assert.equal(g.length % 7, 0, m)
  assert.ok(g.length <= 42, m)
  for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].dateKey < g[i].dateKey, `${m} 순서`)
}

// 월 요약: 그달 날짜만, 기록 있는 날 평균
const vals = new Map([['2026-09-30', 9999], ['2026-10-01', 1500], ['2026-10-15', 2500], ['2026-11-01', 9999]])
assert.deepEqual(monthSummary(vals, '2026-10'), { recordDays: 2, average: 2000 })
assert.deepEqual(monthSummary(new Map(), '2026-10'), { recordDays: 0, average: null })

// D7 월간 그래프: 막대 수(이번 달은 오늘까지), 가로축 날짜(시안 1·8·15·22·27일), 목표 범위 안 날 수
assert.equal(monthDayCount('2026-10', '2026-10-27'), 27)
assert.equal(monthDayCount('2026-09', '2026-10-27'), 30)
assert.equal(monthDayCount('2026-02', '2026-10-27'), 28)
assert.deepEqual(monthDayLabels(27), [1, 8, 15, 22, 27])
assert.deepEqual(monthDayLabels(31), [1, 8, 15, 22, 31]) // 29와 31은 겹쳐서 31만
assert.deepEqual(monthDayLabels(30), [1, 8, 15, 22, 30])
assert.deepEqual(monthDayLabels(29), [1, 8, 15, 22, 29])
assert.deepEqual(monthDayLabels(28), [1, 8, 15, 22, 28])
assert.deepEqual(monthDayLabels(24), [1, 8, 15, 24])
assert.deepEqual(monthDayLabels(5), [1, 5])
assert.deepEqual(monthDayLabels(3), [1])
assert.deepEqual(monthDayLabels(1), [1])
{
  const g = (dateKey, kcal) => ({ dateKey, targets: { target_kcal: kcal, carbs_g: 200, protein_g: 80, fat_g: 50 } })
  const vals = new Map([['2026-09-30', 1900], ['2026-10-01', 1900], ['2026-10-02', 2300], ['2026-10-03', 1710], ['2026-10-04', 1000], ['2026-10-10', 2090]])
  // 10/3부터 목표 1900: 10/1·10/2는 목표 전, 10/3 1710(90%)·10/10 2090(110%)은 안, 10/4 1000은 밖, 9/30은 다른 달
  assert.equal(monthInRangeDays(vals, '2026-10', [g('2026-10-03', 1900)], 'kcal'), 2)
  assert.equal(monthInRangeDays(vals, '2026-10', [], 'kcal'), null) // 목표가 없으면 null
  assert.equal(monthInRangeDays(new Map(), '2026-10', [g('2026-10-03', 1900)], 'kcal'), null) // 기록이 없으면 null
  assert.equal(monthInRangeDays(new Map([['2026-10-05', 210]]), '2026-10', [g('2026-10-03', 1900)], 'carbs_g'), 1) // 탄 200g의 105%
}
assert.deepEqual(CAL_NUTS, ['kcal', 'carbs_g', 'protein_g', 'fat_g', 'weight'])
assert.deepEqual(CAL_NUTS.map((k) => CAL_NUT_LABEL[k]), ['칼로리', '탄', '단', '지', '몸무게'])

console.log('모두 통과')
