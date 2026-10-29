// 화면 음식 이름 foodName 시험(2026-10-27 사용자가 고른 변경). 실행: node spike/tests/food_name_test.mjs <repo 루트>
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { foodName, isPlainRice, representativeFood } = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/foodName.ts')).href)
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
  ['콩나물무침 · 대표값', '콩나물무침'],
  ['치킨 · 대표값', '치킨'],
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
// 대표 음식: 맨밥은 건너뛴다(2026-10-28 사용자 요청)
for (const r of ['쌀밥', '밥', '공기밥', '공깃밥', '흰쌀밥', '현미밥', '잡곡밥', '흑미밥', '보리밥', '쌀밥(1공기)', ' 쌀 밥 ', '잡곡밥_보리_흑미', '잡곡밥_서리태', '현미밥_쌀', '흑미밥_찹쌀', '혼합잡곡밥', '순 현미밥', '발아현미밥']) assert.ok(isPlainRice(r), r)
for (const r of ['컵밥', '제육덮밥', '김치볶음밥', '비빔밥', '김밥', '순대국밥', '연어초밥', '쌈밥', '덮밥_돼지고기(제육)', '밥버거', '콩나물밥', '비빔 잡곡밥', '주먹밥']) assert.ok(!isPlainRice(r), r)
assert.equal(representativeFood(['쌀밥', '해물 칼국수', '닭볶음탕', '떡갈비', '어묵볶음', '울면']), '해물 칼국수 외 5개')
assert.equal(representativeFood(['제육덮밥', '미역국']), '제육덮밥 외 1개')
assert.equal(representativeFood(['현미밥', '쌀밥']), '현미밥 외 1개') // 맨밥뿐이면 첫 밥
assert.equal(representativeFood(['쌀밥']), '쌀밥')
assert.equal(representativeFood(['버거_빅맥 버거', '쌀밥']), '빅맥 버거 외 1개')
assert.equal(representativeFood([]), '')
// 국물 요리 나누기: 같은 요리의 면·건더기 + 국물은 요리 하나로 센다
assert.equal(representativeFood(['짬뽕 면·건더기', '짬뽕 국물']), '짬뽕')
assert.equal(representativeFood(['쌀밥', '순대국밥 건더기', '순대국밥 국물', '깍두기']), '순대국밥 외 2개')
assert.equal(representativeFood(['짬뽕 국물', '군만두']), '짬뽕 국물 외 1개') // 국물만 있으면 그대로
assert.equal(representativeFood(['짬뽕 면·건더기']), '짬뽕') // 국물을 다 남겨 숨김
console.log(`모두 통과(예시 ${cases.length}개, DB 이름 ${n}개, 대표 음식)`)
