// 3단계 조각 2: 목표 계산 goal.ts 단위 시험(순수 함수, Firestore·AI 호출 없음). 손 계산은 스펙 4.7절.
// 2026-10-27 사용자 결정 기준: 감량 −400·유지 ±0·증량 +300, 탄단지 감량 50:25:25·유지·증량 55:20:25, 하한 기초대사량.
// 실행: node spike/tests/goal_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const { validateGoalInput, computeGoal, applyOverride, targetKcalFloor, compareToGoal, macroRatioText } = await import(
  pathToFileURL(path.join(ROOT, 'web/src/analysis/goal.ts')).href
)

const man = { sex: 'male', age: 30, height_cm: 175, weight_kg: 70, activity: 'moderate', goal: 'lose' }
const woman = { sex: 'female', age: 25, height_cm: 160, weight_kg: 50, activity: 'sedentary', goal: 'lose' }
const teen = { sex: 'female', age: 16, height_cm: 160, weight_kg: 50, activity: 'sedentary', goal: 'lose' }

// 1. 스펙 손 계산 예시 두 개
// 남 30세 감량: TDEE 2555.5625 − 400 = 2155.5625 → 2160, 50:25:25 → 탄 269.4 → 269, 단 134.7 → 135, 지 59.9 → 60
const r1 = computeGoal(man)
assert.deepEqual(r1, {
  bmr: 1650, tdee: 2560, target_kcal: 2160, macros: { carbs_g: 269, protein_g: 135, fat_g: 60 },
  goal_applied: 'lose', clamped: false, minor: false, formula: 'mifflin-st-jeor',
})
// 여 25세 감량: 1456.8 − 400 = 1056.8 < BMR 1214 → 1214(clamped) → 1210, 50:25:25 → 탄 151.75 → 152, 단 75.9 → 76, 지 33.7 → 34
const r2 = computeGoal(woman)
assert.deepEqual(r2, {
  bmr: 1210, tdee: 1460, target_kcal: 1210, macros: { carbs_g: 152, protein_g: 76, fat_g: 34 },
  goal_applied: 'lose', clamped: true, minor: false, formula: 'mifflin-st-jeor',
})

// 2. 증량 +300, 유지 = TDEE (남 30세: TDEE 2555.5625)
const gain = computeGoal({ ...man, goal: 'gain' }) // 2855.56 → 2860, 탄 392.6 → 393, 단 142.8 → 143, 지 79.3 → 79
assert.equal(gain.target_kcal, 2860)
assert.deepEqual(gain.macros, { carbs_g: 393, protein_g: 143, fat_g: 79 })
assert.equal(computeGoal({ ...man, goal: 'maintain' }).target_kcal, 2560)
// 유지는 55:20:25: 2555.5625 → 탄 351.4 → 351, 단 127.8 → 128, 지 71.0 → 71
assert.deepEqual(computeGoal({ ...man, goal: 'maintain' }).macros, { carbs_g: 351, protein_g: 128, fat_g: 71 })
assert.equal(macroRatioText('lose'), '50:25:25')
assert.equal(macroRatioText('maintain'), '55:20:25')
assert.equal(macroRatioText('gain'), '55:20:25')
// 감량 −400이 기초대사량에 걸리는지: 남 30세는 1.2 계수에서 걸리고(clamped) 1.375에서는 안 걸린다
assert.equal(computeGoal({ ...man, activity: 'sedentary' }).clamped, true) // 1978.5 − 400 = 1578.5 < BMR 1648.75
assert.equal(computeGoal({ ...man, activity: 'light' }).clamped, false) // 2267.03 − 400 = 1867.03 ≥ BMR

// 3. 만 18세 미만: 감량을 골라도 유지로 계산, 입력 검사는 goal을 maintain으로 바꿔 돌려준다
// 여 16세 160cm 50kg 1.2: BMR 1259 → 1260, TDEE 1510.8 → 1510
const rt = computeGoal(teen)
assert.equal(rt.minor, true)
assert.equal(rt.goal_applied, 'maintain')
assert.equal(rt.target_kcal, 1510)
assert.equal(rt.clamped, false)
// 미성년은 유지 비율 55:20:25: 1510.8 → 탄 207.7 → 208, 단 75.5 → 76, 지 42.0 → 42
assert.deepEqual(rt.macros, { carbs_g: 208, protein_g: 76, fat_g: 42 })
assert.equal(targetKcalFloor(rt), 1510)
assert.equal(targetKcalFloor(r1), 1650)
const vt = validateGoalInput(teen)
assert.equal(vt.ok, true)
assert.equal(vt.value.goal, 'maintain')
assert.equal(validateGoalInput({ ...teen, age: 18 }).value.goal, 'lose')

// 4. 입력 검사
assert.deepEqual(validateGoalInput(man), { ok: true, value: man })
assert.equal(validateGoalInput({ ...man, height_cm: 172.5 }).ok, true)
for (const bad of [
  null, 'x', {},
  { ...man, age: 13 }, { ...man, age: 101 }, { ...man, age: 30.5 }, { ...man, age: '30' },
  { ...man, height_cm: 119 }, { ...man, height_cm: 221 }, { ...man, weight_kg: 29.9 }, { ...man, weight_kg: 251 },
  { ...man, weight_kg: Number.NaN }, { ...man, sex: 'x' }, { ...man, activity: 'x' }, { ...man, goal: 'x' },
]) {
  const v = validateGoalInput(bad)
  assert.equal(v.ok, false, JSON.stringify(bad))
  assert.ok(v.errors.length > 0)
}
assert.equal(validateGoalInput({ ...man, age: 13, height_cm: 300 }).errors.length, 2)

// 5. 직접 조정
const rec = applyOverride(r1, null)
assert.deepEqual(rec, { targets: { target_kcal: 2160, carbs_g: 269, protein_g: 135, fat_g: 60, source: 'recommended' }, errors: [] })
assert.equal(applyOverride(r1, {}).targets.source, 'recommended')
// kcal만 고치면 탄단지를 그 목표 비율(감량 50:25:25)로 다시 나눈다: 1800 → 탄 225, 단 112.5 → 113, 지 50
assert.deepEqual(applyOverride(r1, { target_kcal: 1800 }), {
  targets: { target_kcal: 1800, carbs_g: 225, protein_g: 113, fat_g: 50, source: 'custom' }, errors: [],
})
// 유지·증량은 55:20:25로 다시 나눈다: 1800 → 탄 247.5 → 248, 단 90, 지 50
assert.deepEqual(applyOverride(computeGoal({ ...man, goal: 'gain' }), { target_kcal: 1800 }).targets, {
  target_kcal: 1800, carbs_g: 248, protein_g: 90, fat_g: 50, source: 'custom',
})
// 탄만 고치면 나머지는 추천값
assert.deepEqual(applyOverride(r1, { carbs_g: 200 }).targets, { target_kcal: 2160, carbs_g: 200, protein_g: 135, fat_g: 60, source: 'custom' })
// kcal과 단백질을 고치면 단백질은 그 값, 탄·지는 새 kcal로 다시 나눈다
assert.deepEqual(applyOverride(r1, { target_kcal: 1800, protein_g: 120 }).targets, { target_kcal: 1800, carbs_g: 225, protein_g: 120, fat_g: 50, source: 'custom' })
// 하한: 성인 기초대사량(같은 값은 통과), 상한 6000
assert.deepEqual(applyOverride(r1, { target_kcal: 1650 }).errors, [])
assert.equal(applyOverride(r1, { target_kcal: 1640 }).errors.length, 1)
assert.match(applyOverride(r1, { target_kcal: 1640 }).errors[0], /기초대사량\(1650kcal\)/)
assert.equal(applyOverride(r1, { target_kcal: 6000 }).errors.length, 0)
assert.equal(applyOverride(r1, { target_kcal: 6001 }).errors.length, 1)
assert.equal(applyOverride(r1, { target_kcal: Number.NaN }).errors.length, 1)
assert.deepEqual(applyOverride(r2, { target_kcal: 1210 }).errors, []) // clamped 목표와 같은 값
// 미성년 하한은 하루 소모량
assert.match(applyOverride(rt, { target_kcal: 1400 }).errors[0], /하루 소모량\(1510kcal\)/)
// 탄단지 0~1000
assert.equal(applyOverride(r1, { fat_g: 0 }).errors.length, 0)
assert.equal(applyOverride(r1, { fat_g: 1001 }).errors.length, 1)
assert.equal(applyOverride(r1, { protein_g: -1 }).errors.length, 1)
// 입력을 바꿔 하한이 올라가면 조정값은 남고 오류가 난다: 남 90kg → BMR 1848.75 → 1850
const heavier = computeGoal({ ...man, weight_kg: 90 })
const kept = applyOverride(heavier, { target_kcal: 1700 })
assert.equal(kept.targets.target_kcal, 1700)
assert.match(kept.errors[0], /기초대사량\(1850kcal\)/)

// 6. 목표 비교(하루 요약 막대용)
const cmp = compareToGoal({ kcal: 1500, carbs_g: 300, protein_g: 50, fat_g: 0 }, rec.targets)
assert.deepEqual(cmp.kcal, { eaten: 1500, target: 2160, remaining: 660, ratio: 1500 / 2160 })
assert.equal(cmp.carbs_g.remaining, -31) // 초과
assert.ok(cmp.carbs_g.ratio > 1) // 자르지 않는다
assert.equal(cmp.protein_g.remaining, 85)
assert.equal(cmp.fat_g.ratio, 0)
assert.equal(compareToGoal({ kcal: 10, carbs_g: 0, protein_g: 0, fat_g: 0 }, { ...rec.targets, fat_g: 0 }).fat_g.ratio, 0)

console.log('모두 통과')
