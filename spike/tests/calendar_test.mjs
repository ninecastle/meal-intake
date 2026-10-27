// 3단계 조각 3-1 달력: lib/calendar.ts 순수 함수 시험(Firestore·AI 호출 없음). 규칙은 스펙 4.7절 "달력".
// 실행: node spike/tests/calendar_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { calendarTone, parseMonth, shiftMonth, monthRange, monthCells, goalForDate } = await import(
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

console.log('모두 통과')
