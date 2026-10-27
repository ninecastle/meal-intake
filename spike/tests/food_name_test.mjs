// 화면 음식 이름 foodName 시험(2026-10-27 사용자가 고른 변경). 실행: node spike/tests/food_name_test.mjs <repo 루트>
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { foodName } = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/foodName.ts')).href)
const cases = [
  ['버거_빅맥 버거', '빅맥 버거'],
  ['국밥_순대국밥', '순대국밥'],
  ['케이크_롤케이크', '롤케이크'],
  ['김밥_김치', '김치김밥'],
  ['국밥_돼지머리', '돼지머리국밥'],
  ['덮밥_돼지고기(제육)', '돼지고기(제육) 덮밥'],
  ['샌드위치_햄_달걀', '햄 달걀 샌드위치'],
  ['냉면_회냉면_홍어', '회냉면 홍어'],
  ['김밥_간편조리세트_수유김밥(기본김밥)', '간편조리세트 수유김밥(기본김밥)'],
  ['비빔밥', '비빔밥'],
  ['  된장국  건더기 ', '된장국 건더기'],
  ['버거 버거', '버거'],
  ['', ''],
]
for (const [raw, want] of cases) assert.equal(foodName(raw), want, raw)
// DB 전체: 밑줄이 남지 않고, 빈 이름이 생기지 않는다
const foods = JSON.parse(readFileSync(path.join(ROOT, 'web/public/data/mfds-foods-20261006.json'), 'utf8')).foods
let n = 0
for (const f of foods) {
  const out = foodName(f.n)
  assert.ok(out.length > 0 && !out.includes('_'), `${f.n} → ${out}`)
  n++
}
console.log(`모두 통과(예시 ${cases.length}개, DB 이름 ${n}개)`)
