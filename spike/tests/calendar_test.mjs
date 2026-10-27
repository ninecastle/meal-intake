// 3단계 조각 3-1 달력: lib/calendar.ts 순수 함수 시험(Firestore·AI 호출 없음). 규칙은 스펙 4.7절 "달력".
// 실행: node spike/tests/calendar_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { calendarTone, parseMonth, shiftMonth, monthRange, monthCells, goalForDate, heatLevelFor, monthGrid, gridRange, monthSummary, targetOf, metricOf, REFERENCE_AMOUNT } = await import(
  pathToFileURL(path.join(ROOT, 'web/src/lib/calendar.ts')).href
)

// 색: 목표 2000 → 1800(90%)·2200(110%) 경계 포함 초록, 2201 주황, 1799 파랑, 기록 없음 회색, 목표 없음 null
assert.equal(calendarTone(1800, 2000), 'green')
assert.equal(calendarTone(2000, 2000), 'green')
assert.equal(calendarTone(2200, 2000), 'green')
assert.equal(calendarTone(2201, 2000), 'orange')
assert.equal(calendarTone(1799, 2000), 'blue')
assert.equal(calendarTone(0, 2000), 'blue')
assert.equal(calendarTone(null, 2000), 'gray')
assert.equal(calendarTone(1500, null), null)
assert.equal(calendarTone(null, null), null)
assert.equal(calendarTone(1500, 0), null)

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

// 칸: 2026-10-01은 목요일 → 앞 빈칸 4, 31일, 뒤 빈칸 0(4+31=35)
const oct = monthCells('2026-10')
assert.equal(oct.length, 35)
assert.deepEqual(oct.slice(0, 5), [null, null, null, null, '2026-10-01'])
assert.equal(oct[34], '2026-10-31')
// 2026-11-01은 일요일 → 앞 빈칸 0, 30일, 뒤 빈칸 5
const nov = monthCells('2026-11')
assert.equal(nov[0], '2026-11-01')
assert.equal(nov.length, 35)
assert.equal(nov.filter((c) => c === null).length, 5)
// 2026-02(28일, 일요일 시작)는 4주
assert.equal(monthCells('2026-02').length, 28)

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

console.log('모두 통과')
