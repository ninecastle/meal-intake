// 디자인 조각 D8: 설정 "목표 칼로리·탄단지" 시트 계산 lib/goalEdit.ts 시험(순수 함수, Firestore·AI 호출 없음).
// 2026-10-28 사용자 결정: 칼로리를 바꾸면 탄·단·지는 목표 비율로, 탄·단·지 g를 바꾸면 칼로리는 세 값의 합(4·4·9kcal/g).
// 실행: node spike/tests/goal_edit_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { computeGoal } = await import(pathToFileURL(path.join(ROOT, 'web/src/analysis/goal.ts')).href)
const { kcalOfMacros, macroShares, kcalOverride, macroOverride, stepKcal, previewTargets } = await import(
  pathToFileURL(path.join(ROOT, 'web/src/lib/goalEdit.ts')).href
)

// 여 24세 163cm 58kg 주 3~5회 감량: 기초대사량 1,320 · 하루 소모량 2,040 · 목표 1,640(스펙 4.7절 손 계산과 같은 공식)
const r = computeGoal({ sex: 'female', age: 24, height_cm: 163, weight_kg: 58, activity: 'moderate', goal: 'lose' })
assert.equal(r.bmr, 1320)
assert.equal(r.target_kcal, 1640)
assert.deepEqual(r.macros, { carbs_g: 205, protein_g: 103, fat_g: 46 })

// 합·비율
assert.equal(kcalOfMacros({ carbs_g: 205, protein_g: 103, fat_g: 46 }), 205 * 4 + 103 * 4 + 46 * 9)
assert.deepEqual(macroShares({ carbs_g: 205, protein_g: 103, fat_g: 46 }), { carbs_g: 50, protein_g: 25, fat_g: 25 })
assert.deepEqual(macroShares({ carbs_g: 0, protein_g: 0, fat_g: 0 }), { carbs_g: 0, protein_g: 0, fat_g: 0 })

// 칼로리만 바꾸기: 추천과 같으면 null, 다르면 { target_kcal } → 탄·단·지는 목표 비율(감량 50:25:25)로 다시 나뉨
assert.equal(kcalOverride(r, 1640), null)
let p = previewTargets(r, kcalOverride(r, 1800))
assert.deepEqual(p.targets, { target_kcal: 1800, carbs_g: 225, protein_g: 113, fat_g: 50, source: 'custom' })
assert.equal(p.custom, true)
assert.deepEqual(p.errors, [])

// 탄·단·지 바꾸기: 칼로리 = 합, 추천과 모두 같으면 null
assert.equal(macroOverride(r, { carbs_g: 205, protein_g: 103, fat_g: 46 }), null)
const o = macroOverride(r, { carbs_g: 230, protein_g: 103, fat_g: 46 })
assert.deepEqual(o, { target_kcal: 230 * 4 + 103 * 4 + 46 * 9, carbs_g: 230, protein_g: 103, fat_g: 46 })
p = previewTargets(r, o)
assert.equal(p.targets.target_kcal, 1746)
assert.equal(p.targets.carbs_g, 230)
assert.deepEqual(p.errors, [])

// 합이 기초대사량보다 낮으면 저장 막음
p = previewTargets(r, macroOverride(r, { carbs_g: 100, protein_g: 80, fat_g: 40 }))
assert.equal(p.targets.target_kcal, 100 * 4 + 80 * 4 + 40 * 9)
assert.match(p.errors[0], /기초대사량\(1320kcal\)보다 낮아요/)
// 빈 칸(NaN)은 오류
assert.ok(previewTargets(r, macroOverride(r, { carbs_g: NaN, protein_g: 103, fat_g: 46 })).errors.length > 0)
assert.ok(previewTargets(r, kcalOverride(r, NaN)).errors.length > 0)

// −/+ 50kcal, 내릴 때는 하한에서 멈춤
assert.equal(stepKcal(r, 1640, 1), 1690)
assert.equal(stepKcal(r, 1640, -1), 1590)
assert.equal(stepKcal(r, 1350, -1), 1320)
assert.equal(stepKcal(r, 1320, -1), 1320)

// 만 18세 미만: 하한은 하루 소모량
const m = computeGoal({ sex: 'male', age: 16, height_cm: 170, weight_kg: 60, activity: 'light', goal: 'lose' })
assert.equal(m.goal_applied, 'maintain')
assert.equal(stepKcal(m, m.tdee + 20, -1), m.tdee)

console.log('goal_edit_test: 모두 통과')
