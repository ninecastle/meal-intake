// 체중 계산 lib/weight.ts 시험(디자인 조각 D6). 실행: node spike/tests/weight_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const W = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/weight.ts')).href)
let n = 0
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++ }

// parseKg: 0.1kg 반올림, 30~250, 쉼표, 틀린 글자
eq(W.parseKg('58.4'), 58.4)
eq(W.parseKg(' 58,45 '), 58.5)
eq(W.parseKg('58.'), 58)
eq(W.parseKg('30'), 30)
eq(W.parseKg('250'), 250)
eq(W.parseKg('29.9'), null)
eq(W.parseKg('250.1'), null)
eq(W.parseKg(''), null)
eq(W.parseKg('5'), null)
eq(W.parseKg('-58'), null)
eq(W.parseKg('58kg'), null)
eq(W.parseKg('1e2'), null)
eq(W.parseKg('.5'), null)
// 입력 중 안내
eq(W.kgInputLooksWrong(''), false)
eq(W.kgInputLooksWrong('5'), false)
eq(W.kgInputLooksWrong('58'), false)
eq(W.kgInputLooksWrong('25'), true)
eq(W.kgInputLooksWrong('580'), true)
eq(W.kgInputLooksWrong('5a'), true)
// formatKg·isKg
eq(W.formatKg(54), '54.0')
eq(W.formatKg(58.449), '58.4')
eq(W.isKg(58.4), true)
eq(W.isKg(29), false)
eq(W.isKg('58'), false)
eq(W.isKg(Number.NaN), false)
// deltaText: 소수 오차 없이
eq(W.deltaText(58.4, 58.7), '지난 기록보다 0.3kg 줄었어요')
eq(W.deltaText(58.7, 58.5), '지난 기록보다 0.2kg 늘었어요')
eq(W.deltaText(58.4, 58.4), '지난 기록과 같아요')
eq(W.deltaText(60, 58), '지난 기록보다 2.0kg 늘었어요')
// goalTagText
eq(W.goalTagText(58.4, 54, 'lose'), '목표까지 4.4kg')
eq(W.goalTagText(53.8, 54, 'lose'), '목표에 도착했어요')
eq(W.goalTagText(54, 54), '목표에 도착했어요')
eq(W.goalTagText(53.8, 54), '목표까지 0.2kg')
eq(W.goalTagText(68, 70, 'gain'), '목표까지 2.0kg')
eq(W.goalTagText(70.3, 70, 'gain'), '목표에 도착했어요')
eq(W.goalTagText(53.8, 54, 'maintain'), '목표까지 0.2kg')
// 목표 다시 계산 묻기: 2kg 이상, [나중에] 뒤 1kg 이상 더
eq(W.shouldAskRecalc(58.4, 56.4, null), true)
eq(W.shouldAskRecalc(58.4, 56.5, null), false)
eq(W.shouldAskRecalc(58.4, 60.4, null), true)
eq(W.shouldAskRecalc(58.4, 56.4, 56.4), false)
eq(W.shouldAskRecalc(58.4, 55.5, 56.4), false)
eq(W.shouldAskRecalc(58.4, 55.4, 56.4), true)
eq(W.shouldAskRecalc(58.4, 57.4, 56.4), false) // 1kg 다시 늘었지만 목표 계산 몸무게와 1kg 차이라 묻지 않음
eq(W.shouldAskRecalc(58.4, 61.4, 60.4), true)
eq(W.weightGap(58.4, 54), 4.4)
eq(W.weightGap(58.4, 56.4), 2)
// weightJump: 하루 3kg × 떨어진 날수(앞·뒤 기록), 경계는 0.1kg 정수로(2026-10-28 사용자 결정)
const P = { dateKey: '2026-10-27', kg: 58 }
eq(W.weightJump(61, '2026-10-28', P, null), null)
eq(W.weightJump(55, '2026-10-28', P, null), null)
eq(W.weightJump(61.1, '2026-10-28', P, null), { ref: P, limitKg: 3 })
eq(W.weightJump(54.9, '2026-10-28', P, null), { ref: P, limitKg: 3 })
eq(W.weightJump(70, '2026-11-01', P, null), null) // 5일 → ±15
eq(W.weightJump(73.1, '2026-11-01', P, null), { ref: P, limitKg: 15 })
const N = { dateKey: '2026-10-29', kg: 58 }
eq(W.weightJump(62, '2026-10-28', null, N), { ref: N, limitKg: 3 }) // 뒤 기록과도 비교
eq(W.weightJump(62, '2026-10-28', null, null), null)
eq(W.weightJump(70, '2026-10-27', P, null), null) // 같은 날 기록은 비교하지 않음
eq(W.weightJump(61.1, '2026-11-28', { dateKey: '2026-10-31', kg: 58 }, null), null) // 달 넘김 28일
console.log(`weight_test: ${n}개 통과`)
