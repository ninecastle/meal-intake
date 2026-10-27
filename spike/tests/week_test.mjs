// 3단계 조각 4 주간 추이: lib/week.ts 순수 함수 시험(Firestore·AI 호출 없음). 규칙은 스펙 4.7절 "주간 추이".
// 실행: node spike/tests/week_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { mondayOf, weekDays, shiftWeek, defaultWeek, monthForWeek, parseWeek, isCurrentOrLaterWeek, niceCeil, axisTicks } =
  await import(pathToFileURL(path.join(ROOT, 'web/src/lib/week.ts')).href)

const today = '2026-10-27' // 화요일

// 월요일 찾기: 2026-10-27(화) → 10-26, 일요일 11-01 → 10-26, 월요일은 그대로, 연·월 넘김
assert.equal(mondayOf('2026-10-27'), '2026-10-26')
assert.equal(mondayOf('2026-11-01'), '2026-10-26')
assert.equal(mondayOf('2026-10-26'), '2026-10-26')
assert.equal(mondayOf('2026-10-01'), '2026-09-28')
assert.equal(mondayOf('2027-01-01'), '2026-12-28')
assert.deepEqual(weekDays('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
assert.equal(shiftWeek('2026-10-26', -1), '2026-10-19')
assert.equal(shiftWeek('2026-12-28', 1), '2027-01-04')

// 기본 주: 이번 달 → 오늘이 든 주, 지난 달 → 말일이 든 주(2026-09-30 수 → 09-28)
assert.equal(defaultWeek('2026-10', today), '2026-10-26')
assert.equal(defaultWeek('2026-09', today), '2026-09-28')
assert.equal(defaultWeek('2026-08', today), '2026-08-31') // 8/31 월요일

// 주가 달 격자를 벗어나면 달이 따라간다(10월 격자 9/28~11/1)
assert.equal(monthForWeek('2026-10', '2026-09-28'), '2026-10') // 걸친 주는 그대로
assert.equal(monthForWeek('2026-10', '2026-09-21'), '2026-09') // 뒤로 벗어남
assert.equal(monthForWeek('2026-09', '2026-09-28'), '2026-09') // 9월 격자 마지막 주(9/28~10/4)
assert.equal(monthForWeek('2026-09', '2026-10-05'), '2026-10') // 앞으로 벗어남
assert.equal(monthForWeek('2026-10', '2026-10-26'), '2026-10')

// 주소 ?week 검증
assert.equal(parseWeek('2026-10-19', '2026-10', today), '2026-10-19')
assert.equal(parseWeek('2026-10-20', '2026-10', today), '2026-10-26') // 월요일 아님 → 기본
assert.equal(parseWeek('2026-11-02', '2026-10', today), '2026-10-26') // 미래 주 → 기본
assert.equal(parseWeek('2026-08-31', '2026-10', today), '2026-10-26') // 그달 격자 밖 → 기본
assert.equal(parseWeek('2026-02-30', '2026-10', today), '2026-10-26') // 없는 날짜
assert.equal(parseWeek(null, '2026-09', today), '2026-09-28')
assert.equal(isCurrentOrLaterWeek('2026-10-26', today), true)
assert.equal(isCurrentOrLaterWeek('2026-10-19', today), false)

// 세로축 눈금: 최댓값의 110% 이상, 4칸, 칸은 보기 좋은 수
assert.equal(niceCeil(660), 800)
assert.equal(niceCeil(1), 1)
assert.equal(niceCeil(0.07), 0.08)
assert.equal(niceCeil(0), 0)
assert.deepEqual(axisTicks([2400, 2060, NaN], 2000), [0, 800, 1600, 2400, 3200]) // 2640/4 = 660 → 800
assert.deepEqual(axisTicks([511, 2060], 2000), [0, 600, 1200, 1800, 2400]) // 2266/4 = 566.5 → 600
assert.deepEqual(axisTicks([26, 103], 100), [0, 30, 60, 90, 120]) // 113.3/4 = 28.3 → 30
assert.deepEqual(axisTicks([], 2000), [0, 600, 1200, 1800, 2400]) // 기준량 2000 → 2200/4 = 550 → 600
for (const vals of [[1], [99], [123456], [57, 56], [0.5]]) {
  const t = axisTicks(vals, 100)
  assert.ok(t[4] >= Math.max(...vals) * 1.1 - 1e-9, `${vals} 머리 공간`)
}

console.log('모두 통과')
