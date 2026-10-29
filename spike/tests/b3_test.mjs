// 프롬프트 b3(2026-10-27) 시험: same_scene·match 규칙, ratio_assumed 전달(assemble·compute)·검증(validate.ts·validate_analysis.mjs·스키마), setRemainingRatio.
// 실제 AI 호출 없음(가짜 응답·목업 픽스처·가짜 resolve). 실행: node spike/tests/b3_test.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { spawnSync } from 'node:child_process'

const ROOT = 'C:/Users/kkama/dev/hackathon/'
const W = ROOT + 'web/'
const SCR = ROOT + 'spike/results/'
const u = (p) => pathToFileURL(W + p).href
mkdirSync(SCR, { recursive: true })
writeFileSync(SCR + 'nutrition-stub.mjs', "export async function resolveNutrition() { throw new Error('stub: inject opts.resolve') }\n")
const STUB = pathToFileURL(SCR + 'nutrition-stub.mjs').href
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === './nutrition/index.ts') return { url: STUB, shortCircuit: true }
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.') && !path.extname(spec)) return next(spec + '.ts', ctx)
      throw e
    }
  },
})

const B = await import(u('src/analysis/afterPrompt.ts'))
const A = await import(u('src/analysis/beforePrompt.ts'))
const C = await import(u('src/analysis/compute.ts'))
const S = await import(u('src/analysis/assemble.ts'))
const V = await import(u('src/analysis/validate.ts'))

let bad = 0
const ok = (cond, msg) => {
  if (!cond) bad++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`)
}
const J = (v) => JSON.stringify(v)
const ratios = (r) => (r.ok ? r.items.map((i) => i.remaining_ratio) : null)
const flags = (r) => (r.ok ? r.items.map((i) => i.ratio_assumed ?? '-') : null)
const unsure = B.unsureRatioWarning
const guess = { kcal: 200, carbs_g: 20, protein_g: 10, fat_g: 8 }
const before = [
  { id: 'i1', name: '밥', location: '왼쪽 아래 공기', before_grams: 210, confidence: 0.9, per_100g_guess: guess, whole_count: null },
  { id: 'i2', name: '콩나물무침', location: '위쪽 작은 접시', before_grams: 60, confidence: 0.8, per_100g_guess: guess, whole_count: null },
  { id: 'i3', name: '불고기 버거', location: '가운데 종이 포장', before_grams: 220, confidence: 0.8, per_100g_guess: guess, whole_count: 1 },
  { id: 'i4', name: '콜라', location: '오른쪽 종이컵', before_grams: 400, confidence: 0.7, per_100g_guess: guess, whole_count: 1 },
]
const resp = (same_scene, list, warnings = []) => ({
  ...(same_scene === undefined ? {} : { same_scene }),
  items: list.map(([id, match, remaining_ratio, confidence]) => ({ id, ...(match ? { match } : {}), remaining_ratio, confidence })),
  warnings,
})

// ── 프롬프트·스키마 ──
ok(B.PROMPT_VERSION_B === 'b4', `버전 b4 (${B.PROMPT_VERSION_B})`) // b4 = b3 + 경고 말투 지시, 스키마·규칙은 같다
ok(['same_scene', '"not_visible"', '"different"', '"unclear"'].every((s) => B.SYSTEM_INSTRUCTION_B.includes(s)), 'B 지시에 same_scene·match 설명')
const sch = typeof B.RESPONSE_SCHEMA_B.toJSON === 'function' ? B.RESPONSE_SCHEMA_B.toJSON() : B.RESPONSE_SCHEMA_B
const itemSch = sch.properties?.items?.items
ok(sch.properties?.same_scene?.type === 'boolean' && J(itemSch?.properties?.match?.enum) === J(['same', 'not_visible', 'different', 'unclear']),
  `응답 스키마 B: same_scene boolean, match 4개 값 (${sch.properties?.same_scene?.type}, ${J(itemSch?.properties?.match?.enum)})`)
ok((sch.required ?? []).includes('same_scene') && (itemSch?.required ?? []).includes('match'), `same_scene·match 필수 (${J(sch.required)} / ${J(itemSch?.required)})`)

// ── 1. 같은 장면: same → 모델 값, not_visible → 0 + 표시, different·unclear → null + 경고 ──
const case1 = resp(true, [['i1', 'same', 0.2, 0.8], ['i2', 'not_visible', 0.7, 0.4], ['i3', 'different', 1, 0.9], ['i4', 'unclear', 0.5, 0.7]], ['콩나물무침: 먹은 후 사진에 그릇이 보이지 않아요'])
let r = B.normalizeAfterResponse(case1, before)
ok(J(ratios(r)) === J([0.2, 0, null, null]), `같은 장면 + not_visible → 0, different·unclear → null, 모델 숫자 무시 (${J(ratios(r))})`)
ok(J(flags(r)) === J(['-', 'not_visible', '-', '-']), `not_visible 항목만 ratio_assumed (${J(flags(r))})`)
ok(r.ok && r.items[1].confidence === 0.4, 'not_visible도 confidence 그대로(0.4)')
ok(r.ok && r.warnings.includes(unsure('불고기 버거')) && r.warnings.includes(unsure('콜라')), 'different·unclear에 unsureRatioWarning')
ok(r.ok && !r.warnings.includes(unsure('콩나물무침')) && !r.warnings.includes(unsure('밥')), 'not_visible·same에는 코드 경고 없음')

// ── 2. same에도 b2 안전장치 ──
r = B.normalizeAfterResponse(resp(true, [['i1', 'same', 1, 0.4], ['i2', 'same', 0, 0.85], ['i3', 'same', null, 0.9], ['i4', 'not_visible', null, 0.8]]), before)
ok(J(ratios(r)) === J([null, 0, null, 0]) && J(flags(r)) === J(['-', '-', '-', 'not_visible']), `same: 확신 낮은 끝값 null, 확신 높은 0 그대로, 모델 null 유지 (${J(ratios(r))} ${J(flags(r))})`)
ok(r.ok && r.warnings.includes(unsure('밥')) && r.warnings.includes(unsure('불고기 버거')), 'same에서 null이 된 항목에 경고')

// ── 3. same_scene=false → 모두 null, 경고 한 줄 ──
r = B.normalizeAfterResponse(resp(false, [['i1', 'same', 0.3, 0.8], ['i2', 'not_visible', null, 0.5], ['i3', 'different', null, 0.9], ['i4', 'unclear', null, 0.2]], ['불고기 버거: 다른 음식이에요']), before)
ok(J(ratios(r)) === J([null, null, null, null]) && J(flags(r)) === J(['-', '-', '-', '-']), `same_scene=false → 모두 null, 표시 없음 (${J(ratios(r))})`)
ok(r.ok && J(r.warnings) === J([B.WARNING_DIFFERENT_SCENE]), `경고는 한 줄만 (${J(r.ok && r.warnings)})`)
ok(r.ok && r.items[0].confidence === 0.8, 'confidence는 모델 값 유지')
r = B.normalizeAfterResponse({ same_scene: false, warnings: [] }, before)
ok(r.ok && J(ratios(r)) === J([null, null, null, null]), 'same_scene=false이면 items가 빠져도 형식 오류 아님(다시 호출 안 함)')

// ── 4. 같은 그릇(same)이 하나도 없는데 not_visible → not_visible도 null ──
r = B.normalizeAfterResponse(resp(true, [['i1', 'not_visible', null, 0.8], ['i2', 'not_visible', null, 0.8], ['i3', 'not_visible', null, 0.8], ['i4', 'not_visible', null, 0.8]]), before)
ok(J(ratios(r)) === J([null, null, null, null]) && J(flags(r)) === J(['-', '-', '-', '-']) && r.warnings.includes(B.WARNING_NO_MATCHED_BOWL), `모든 그릇 not_visible → 모두 null + 경고 (${J(ratios(r))})`)
r = B.normalizeAfterResponse(resp(true, [['i1', 'not_visible', null, 0.8], ['i2', 'not_visible', null, 0.8], ['i3', 'unclear', null, 0.5], ['i4', 'different', null, 0.5]]), before)
ok(J(ratios(r)) === J([null, null, null, null]) && r.warnings.includes(B.WARNING_NO_MATCHED_BOWL), 'not_visible + unclear·different만 → 모두 null')
r = B.normalizeAfterResponse(resp(true, [['i1', 'same', 0.5, 0.8], ['i2', 'not_visible', null, 0.8], ['i3', 'not_visible', null, 0.8], ['i4', 'not_visible', null, 0.8]]), before)
ok(J(ratios(r)) === J([0.5, 0, 0, 0]) && !r.warnings.includes(B.WARNING_NO_MATCHED_BOWL), 'same 하나 + 나머지 not_visible → 0 + 표시')

// ── 5. same_scene·match 없음 → b2와 같음 ──
r = B.normalizeAfterResponse(resp(undefined, [['i1', null, 1, 0.4], ['i2', null, 0, 0.85], ['i3', null, null, 0.2], ['i4', null, 0, 0.4]]), before)
ok(J(ratios(r)) === J([null, 0, null, null]) && J(flags(r)) === J(['-', '-', '-', '-']), `match 없음 → b2 규칙, 표시 없음 (${J(ratios(r))})`)

// ── 6. 정리 결과 다시 읽기(캐시) → 같은 결과, 표시 유지(확신 0.4여도) ──
const first = B.normalizeAfterResponse(case1, before)
const again = B.normalizeAfterResponse({ items: first.items, warnings: first.warnings, used_before_photo: true, model: 'm', prompt_version: 'b3' }, before)
ok(again.ok && J(again.items) === J(first.items), `캐시 다시 읽기: 항목 그대로 (${J(again.ok && again.items.map((i) => [i.remaining_ratio, i.ratio_assumed ?? '-']))})`)

// ── 7. match 값이 4개 밖 → 그 항목은 b2 규칙 ──
r = B.normalizeAfterResponse(resp(true, [['i1', 'same', 0.3, 0.8], ['i2', 'gone', 0, 0.4], ['i3', 'gone', 0.5, 0.8], ['i4', 'same', 1, 0.9]]), before)
ok(J(ratios(r)) === J([0.3, null, 0.5, 1]) && J(flags(r)) === J(['-', '-', '-', '-']), `잘못된 match → b2 규칙 (${J(ratios(r))})`)

// ── 8. assemble → MealItem.ratio_assumed, 검증 통과 ──
const fakeResolve = async (_name, opts) => ({ source: 'ai_estimate', per_100g: opts.guess, via: 'guess' })
const meal = await S.assembleAnalysis(
  { items: before, warnings: [], model: 'mock', prompt_version: 'a4' },
  { items: first.items, warnings: first.warnings, used_before_photo: true, model: 'mock', prompt_version: 'b3' },
  { resolve: fakeResolve },
)
const m2 = meal.items.find((x) => x.id === 'i2')
ok(m2?.ratio_assumed === 'not_visible' && m2.remaining_ratio === 0 && m2.consumed_grams === 60 && m2.consumed.kcal === 120, `assemble: i2 표시·0·60g·120kcal (${J(m2 && [m2.ratio_assumed, m2.remaining_ratio, m2.consumed_grams, m2.consumed.kcal])})`)
ok(meal.items.filter((x) => 'ratio_assumed' in x).length === 1, '표시는 i2 하나만')
ok(m2?.needs_review === true, 'needs_review 공식 그대로(확신 0.4 < 0.6 → true)')
let v = V.validateAnalysis(meal)
ok(v.ok, `validateAnalysis 통과 (${v.ok ? '' : v.errors.join(' / ')})`)

// ── 9. 계산 경로: 유지·삭제 ──
const kept = [
  C.applyNutrition(m2, { source: 'ai_estimate', per_100g: { kcal: 50, carbs_g: 5, protein_g: 3, fat_g: 2 }, via: 'guess' }),
  C.setBeforeGrams(m2, 80),
  C.setKcalOverride(m2, 99),
  C.recomputeItem({ ...m2, eaters: 2 }),
]
ok(kept.every((x) => x.ratio_assumed === 'not_visible'), '이름 바꿈(applyNutrition)·무게·칼로리 직접 입력·인원수 변경에는 표시 유지')
ok(C.buildAnalysis(meal.items, meal.warnings, meal).items.find((x) => x.id === 'i2')?.ratio_assumed === 'not_visible', 'buildAnalysis(저장용)에 표시 유지')
const picked = C.setRemainingRatio(m2, 0.3)
ok(!('ratio_assumed' in picked) && picked.remaining_ratio === 0.3 && picked.user_edited === true && Math.abs(picked.consumed_grams - 42) < 1e-9, `setRemainingRatio(0.3): 표시 지움·다시 계산 (${picked.consumed_grams}g)`)
const picked0 = C.setRemainingRatio(m2, 0)
ok(!('ratio_assumed' in picked0) && picked0.remaining_ratio === 0, 'setRemainingRatio(0): 사용자가 다 먹음을 골라도 표시 지움')
ok(!('ratio_assumed' in C.recomputeItem({ ...m2, remaining_ratio: 0.5 })), 'recomputeItem: 비율이 0이 아니면 표시 지움')
v = V.validateAnalysis(C.buildAnalysis(meal.items.map((x) => (x.id === 'i2' ? picked : x)), meal.warnings, meal))
ok(v.ok && !v.errors?.length, '고른 뒤 결과 검증 통과')

// ── 10. 검증 실패: 0이 아닌데 표시, 허용 밖 값 ──
const onOther = structuredClone(meal)
onOther.items.find((x) => x.id === 'i1').ratio_assumed = 'not_visible' // i1은 0.2
v = V.validateAnalysis(onOther)
ok(!v.ok && v.errors.some((e) => /ratio_assumed/.test(e)), `validate.ts: remaining_ratio 0.2에 표시 → 오류 (${v.errors.filter((e) => /ratio_assumed/.test(e)).join(' / ')})`)
const badValue = structuredClone(meal)
badValue.items.find((x) => x.id === 'i2').ratio_assumed = 'hidden'
v = V.validateAnalysis(badValue)
ok(!v.ok && v.errors.some((e) => /ratio_assumed/.test(e)), 'validate.ts: 표시 값이 not_visible 밖 → 오류')

// ── 11. validate_analysis.mjs 같은 규칙 ──
const VAM = ROOT + '.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs'
const runVam = (obj, name) => {
  writeFileSync(SCR + name, JSON.stringify(obj, null, 2))
  return spawnSync(process.execPath, [VAM, SCR + name], { encoding: 'utf8' })
}
let p = runVam(meal, 'b3-valid.json')
ok(p.status === 0, `validate_analysis.mjs: 표시 있는 결과 통과 (exit ${p.status}${p.status ? ': ' + (p.stdout + p.stderr).slice(0, 300) : ''})`)
p = runVam(onOther, 'b3-bad-ratio.json')
ok(p.status !== 0 && /ratio_assumed/.test(p.stdout + p.stderr), `validate_analysis.mjs: 0이 아닌 비율에 표시 → 실패 (exit ${p.status})`)
p = runVam(badValue, 'b3-bad-value.json')
ok(p.status !== 0 && /ratio_assumed/.test(p.stdout + p.stderr), `validate_analysis.mjs: 허용 밖 값 → 실패 (exit ${p.status})`)

// ── 12. JSON Schema ──
const schema = JSON.parse(readFileSync(ROOT + '.claude/skills/intake-calorie-estimation/references/analysis-schema.json', 'utf8'))
const itemSchema = schema.properties.items.items
ok(itemSchema.properties.ratio_assumed?.const === 'not_visible' &&
  itemSchema.allOf.some((c) => J(c.if?.required) === J(['ratio_assumed']) && c.then?.properties?.remaining_ratio?.const === 0),
  'analysis-schema.json: ratio_assumed(const not_visible) + 있으면 remaining_ratio=0')

// ── 13. 목업 픽스처(b3 형식) ──
const fxA = A.normalizeBeforeResponse(JSON.parse(readFileSync(W + 'src/analysis/__fixtures__/before-bibimbap.json', 'utf8')))
const fxB = fxA.ok ? B.normalizeAfterResponse(JSON.parse(readFileSync(W + 'src/analysis/__fixtures__/after-bibimbap.json', 'utf8')), fxA.items) : { ok: false }
ok(J(ratios(fxB)) === J([0.3, 0, 1, null, 0, 1]) && J(flags(fxB)) === J(['-', '-', '-', '-', 'not_visible', '-']),
  `목업 픽스처: i4 unclear → null, i5 not_visible → 0 + 표시 (${J(ratios(fxB))} ${J(flags(fxB))})`)

console.log(bad === 0 ? '\n모두 통과' : `\n실패 ${bad}개`)
process.exit(bad === 0 ? 0 : 1)
