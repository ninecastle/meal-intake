// 끼니 자동 선택 guessMealType 시험(2026-10-27 사용자 결정 시간대, Asia/Seoul). 실행: node spike/tests/time_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { guessMealType, toDateKey } = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/time.ts')).href)
const at = (hm) => new Date(`2026-10-27T${hm}:00+09:00`)
const cases = [
  ['04:59', 'snack'], ['05:00', 'breakfast'], ['09:59', 'breakfast'], ['10:00', 'lunch'], ['14:59', 'lunch'],
  ['15:00', 'dinner'], ['20:59', 'dinner'], ['21:00', 'snack'], ['23:30', 'snack'], ['00:10', 'snack'],
]
for (const [hm, want] of cases) assert.equal(guessMealType(at(hm)), want, hm)
// 시간대는 기기 시간대가 아니라 Asia/Seoul(UTC 01:00 = KST 10:00 → 점심)
assert.equal(guessMealType(new Date('2026-10-27T01:00:00Z')), 'lunch')
assert.equal(toDateKey(new Date('2026-10-27T15:30:00Z')), '2026-10-28')
console.log('모두 통과')
