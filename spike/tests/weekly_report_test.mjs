// D14 AI 주간 리포트 계산·AI 흐름(web/src/analysis/weeklyReport.ts) 시험. 실제 Gemini 호출 없음(가짜 모델).
// 실행: node spike/tests/weekly_report_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const W = await import(pathToFileURL(path.join(ROOT, 'web/src/analysis/weeklyReport.ts')).href)

let pass = 0
const t = async (name, fn) => {
  await fn()
  pass++
  console.log('ok', name)
}

const MON = '2026-10-19' // 월요일
const day = (i) => `2026-10-${String(19 + i).padStart(2, '0')}`
const GOAL = { target_kcal: 2000, carbs_g: 250, protein_g: 100, fat_g: 60 }
let seq = 0
const item = (name, extra = {}) => ({ name, remaining_ratio: 0, ...extra })
const meal = (dateKey, mealType, kcal, items, macro = {}, status = 'done') => ({
  id: `m${++seq}`,
  dateKey,
  mealType,
  status,
  createdAt: null,
  updatedAt: null,
  analysis: {
    items,
    totals: { consumed: { kcal, carbs_g: macro.c ?? 0, protein_g: macro.p ?? 0, fat_g: macro.f ?? 0 } },
  },
})
// 하루 목표와 꼭 같은 탄단지(근접 만점)
const perfectDay = (i) => [
  meal(day(i), 'breakfast', 500, [item('현미밥'), item('된장국')], { c: 62.5, p: 25, f: 15 }),
  meal(day(i), 'lunch', 700, [item('김밥_김치')], { c: 87.5, p: 35, f: 21 }),
  meal(day(i), 'dinner', 800, [item('닭가슴살 샐러드')], { c: 100, p: 40, f: 24 }),
]

await t('기록 없음', () => {
  const s = W.computeWeekStats(MON, [], () => GOAL)
  assert.equal(s.days.length, 7)
  assert.deepEqual(s.days.map((d) => d.dateKey), [0, 1, 2, 3, 4, 5, 6].map(day))
  assert.ok(s.days.every((d) => d.kcal === null && d.target === 2000))
  assert.equal(s.recordDays, 0)
  assert.equal(s.avgKcal, null)
  assert.deepEqual(s.macroPct, { carbs: null, protein: null, fat: null })
  assert.deepEqual(s.mealShare, { breakfast: 0, lunch: 0, dinner: 0, snack: 0 })
  assert.equal(s.bestDay, null)
  assert.equal(s.worstDay, null)
  assert.equal(s.score, 0)
  assert.equal(s.headline, '다음 주는 목표에 더 가까이 가 봐요')
  assert.equal(typeof s.inputHash, 'string')
})

await t('7일 완벽 → 100점', () => {
  const meals = [0, 1, 2, 3, 4, 5, 6].flatMap(perfectDay)
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  assert.equal(s.recordDays, 7)
  assert.equal(s.avgKcal, 2000)
  assert.equal(s.inRangeDays, 7)
  assert.deepEqual(s.macroPct, { carbs: 100, protein: 100, fat: 100 })
  assert.equal(s.score, 100)
  assert.equal(s.headline, '균형 잡힌 한 주였어요')
  assert.deepEqual(s.mealShare, { breakfast: 25, lunch: 35, dinner: 40, snack: 0 })
  assert.equal(s.topFoods.length, 4)
  assert.ok(s.topFoods.some((f) => f.name === '김치김밥' && f.count === 7), 'foodName 정리')
  assert.ok(!s.topFoods.some((f) => f.name.includes('_')))
  assert.equal(s.bestDay.pct, 100)
  assert.equal(s.worstDay, null, '모두 같으면 가장 먼 날 없음')
})

await t('3일, 목표 범위·좋은 날·아쉬운 날', () => {
  const meals = [
    meal(day(0), 'lunch', 2000, [item('비빔밥')], { c: 250, p: 100, f: 60 }),
    meal(day(2), 'lunch', 1800, [item('비빔밥')], { c: 250, p: 100, f: 60 }),
    meal(day(4), 'dinner', 2300, [item('치킨')], { c: 250, p: 100, f: 60 }),
    meal(day(5), 'dinner', 900, [item('라면')], {}, 'awaiting_after'), // done 아님 → 제외
  ]
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  assert.equal(s.recordDays, 3)
  assert.equal(s.avgKcal, 2033)
  assert.equal(s.inRangeDays, 2)
  assert.deepEqual(s.bestDay, { dateKey: day(0), kcal: 2000, pct: 100 })
  assert.deepEqual(s.worstDay, { dateKey: day(4), kcal: 2300, pct: 115 })
  // 30·3/7 + 40·2/3 + 30 = 12.86 + 26.67 + 30 = 69.5 → 70
  assert.equal(s.score, 70)
  assert.equal(s.headline, '조금만 더 다듬으면 좋아요')
  assert.deepEqual(s.topFoods[0], { name: '비빔밥', count: 2 })
  const sh = s.mealShare
  assert.equal(sh.breakfast + sh.lunch + sh.dinner + sh.snack, 100)
})

await t('목표 없는 날', () => {
  const meals = [
    meal(day(0), 'lunch', 2000, [item('비빔밥')], { c: 250, p: 100, f: 60 }),
    meal(day(1), 'lunch', 1000, [item('비빔밥')], { c: 125, p: 50, f: 30 }),
  ]
  const s = W.computeWeekStats(MON, meals, (dk) => (dk === day(0) ? GOAL : null))
  assert.equal(s.days[1].target, null)
  assert.equal(s.days[1].kcal, 1000)
  assert.equal(s.recordDays, 2)
  assert.equal(s.inRangeDays, 1)
  assert.deepEqual(s.macroPct, { carbs: 100, protein: 100, fat: 100 }, '목표 있는 날만으로')
  assert.equal(s.avgTarget, 2000)
  const none = W.computeWeekStats(MON, meals, () => null)
  assert.deepEqual(none.macroPct, { carbs: null, protein: null, fat: null })
  assert.equal(none.bestDay, null)
  assert.equal(none.inRangeDays, 0)
  assert.equal(none.score, Math.round((30 * 2) / 7))
})

await t('다 남긴 음식 제외, 세부 영양소 평균', () => {
  const meals = [
    meal(day(0), 'lunch', 600, [item('피자', { remaining_ratio: 1 }), item('콜라', { detail_consumed: { sugar_g: 27, sodium_mg: 10 } })]),
    meal(day(1), 'lunch', 600, [item('피자', { remaining_ratio: 1 }), item('콜라', { detail_consumed: { sugar_g: 20.4 } })]),
  ]
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  assert.deepEqual(s.topFoods, [{ name: '콜라', count: 2 }])
  assert.equal(s.foodCount, 2)
  assert.equal(s.minorAvg.sugar_g, 23.7)
  assert.equal(s.minorAvg.sodium_mg, 10, '값 있는 날만 평균')
  assert.equal(s.minorAvg.fiber_g, null)
})

await t('inputHash 안정·변화', () => {
  const a = [0, 1, 2].flatMap(perfectDay)
  const h1 = W.computeWeekStats(MON, a, () => GOAL).inputHash
  const h2 = W.computeWeekStats(MON, [...a].reverse(), () => GOAL).inputHash
  assert.equal(h1, h2, '배열 순서와 무관')
  const b = a.map((m, i) => (i === 0 ? { ...m, analysis: { ...m.analysis, totals: { consumed: { ...m.analysis.totals.consumed, kcal: 510 } } } } : m))
  assert.notEqual(W.computeWeekStats(MON, b, () => GOAL).inputHash, h1, 'kcal 바뀌면 다름')
  assert.notEqual(W.computeWeekStats(MON, a, () => ({ ...GOAL, target_kcal: 1900 })).inputHash, h1, '목표 바뀌면 다름')
})

await t('점수·한 줄 경계', () => {
  const p = (x) => ({ carbs: x, protein: x, fat: x })
  assert.equal(W.scoreFor(7, 7, p(100)), 100)
  assert.equal(W.scoreFor(7, 0, p(150)), 30)
  assert.equal(W.scoreFor(7, 7, p(125)), 85)
  assert.equal(W.scoreFor(7, 7, p(50)), 70)
  assert.equal(W.scoreFor(7, 7, p(null)), 70)
  assert.equal(W.scoreFor(0, 0, p(100)), 0)
  assert.equal(W.headlineFor(100), '균형 잡힌 한 주였어요')
  assert.equal(W.headlineFor(80), '균형 잡힌 한 주였어요')
  assert.equal(W.headlineFor(79), '조금만 더 다듬으면 좋아요')
  assert.equal(W.headlineFor(60), '조금만 더 다듬으면 좋아요')
  assert.equal(W.headlineFor(59), '다음 주는 목표에 더 가까이 가 봐요')
})

await t('compareWeeks', () => {
  const cur = W.computeWeekStats(MON, [0, 1, 2].flatMap(perfectDay), () => GOAL)
  const prev2 = W.computeWeekStats('2026-10-12', [], () => GOAL)
  assert.equal(W.compareWeeks(cur, null), null)
  assert.equal(W.compareWeeks(cur, prev2), null)
  const prev = { ...cur, recordDays: 3, avgKcal: 1800, score: 50 }
  assert.deepEqual(W.compareWeeks(cur, prev), { kcalDiff: 200, scoreDiff: cur.score - 50 })
})

await t('숫자 검사: 허용·위반·반올림', () => {
  const allowed = [1847, 95.5, 23.7, 3, 7]
  assert.equal(W.numbersOk('하루 평균 1,847kcal였어요.', allowed), true)
  assert.equal(W.numbersOk('하루 평균 약 1,850kcal였어요.', allowed), true, '10 단위 반올림')
  assert.equal(W.numbersOk('약 1,800kcal였어요.', allowed), true, '100 단위 반올림')
  assert.equal(W.numbersOk('단백질은 96%였어요.', allowed), true, '정수 반올림')
  assert.equal(W.numbersOk('당류는 24g이었어요.', allowed), true)
  assert.equal(W.numbersOk('하루 평균 1,900kcal였어요.', allowed), false)
  assert.equal(W.numbersOk('물을 8잔 드세요.', allowed), false)
  assert.equal(W.numbersOk('숫자 없는 문장이에요.', allowed), true)
  assert.deepEqual(W.extractNumbers('1,847kcal과 95.5%, 3일'), [1847, 95.5, 3])
})

await t('안전 거르기', () => {
  const u = (s, k = false) => W.isUnsafeSentence(s, k)
  assert.equal(u('하루 단식을 해 보세요.'), true)
  assert.equal(u('저녁을 거르면 좋아요.'), true)
  assert.equal(u('아침을 거르지 않고 챙겨 드셨어요.'), false)
  assert.equal(u('1,200kcal 이하로 드셔 보세요.'), true)
  assert.equal(u('당뇨가 있다면 조심하세요.'), true)
  assert.equal(u('약을 드시는 분은 확인하세요.'), true)
  assert.equal(u('점심에 현미밥과 고등어구이를 드셔 보세요.'), false)
  assert.equal(u('간식을 줄여 감량해 보세요.'), false, '성인은 감량 문장 허용')
  assert.equal(u('간식을 줄여 감량해 보세요.', true), true, '18세 미만 감량 금지')
  assert.equal(u('살을 빼려면 저녁을 가볍게 드세요.', true), true)
})

const goodResp = (o = {}) => ({
  summary: '이번 주는 3일 기록했어요. 비빔밥을 자주 드셨어요.',
  good: ['꾸준히 기록하셨어요.'],
  improve: ['채소가 조금 부족했어요.'],
  next: ['점심에 현미밥과 고등어구이를 드셔 보세요.'],
  dayPlan: { breakfast: '현미밥, 달걀찜', lunch: '비빔밥', dinner: '생선구이, 나물', snack: '사과' },
  ...o,
})
const stats3 = W.computeWeekStats(
  MON,
  [
    meal(day(0), 'lunch', 2000, [item('비빔밥')], { c: 250, p: 100, f: 60 }),
    meal(day(2), 'lunch', 1800, [item('비빔밥')], { c: 250, p: 100, f: 60 }),
    meal(day(4), 'dinner', 2300, [item('치킨')], { c: 250, p: 100, f: 60 }),
  ],
  () => GOAL,
)
const opts3 = { under18: false, meals: [], goal: GOAL }

await t('가짜 모델: 위반 없음 → 1회', async () => {
  let n = 0
  const r = await W.runReportFlow(stats3, opts3, async () => (n++, goodResp()))
  assert.equal(n, 1)
  assert.equal(r.calls, 1)
  assert.deepEqual(r.dropped, [])
  assert.equal(r.text.good.length, 1)
})

await t('가짜 모델: 숫자 위반 → 1회 다시, 깨끗하면 그대로', async () => {
  const texts = []
  const r = await W.runReportFlow(stats3, opts3, async (txt) => {
    texts.push(txt)
    return texts.length === 1 ? goodResp({ good: ['하루 평균 9,999kcal로 잘 드셨어요.'] }) : goodResp()
  })
  assert.equal(texts.length, 2)
  assert.ok(texts[1].includes('[다시 요청]') && texts[1].includes('9999'))
  assert.equal(r.calls, 2)
  assert.deepEqual(r.text.good, ['꾸준히 기록하셨어요.'])
})

await t('가짜 모델: 다시 해도 위반 → 그 문장만 버림(배열 비면 빈 배열)', async () => {
  let n = 0
  const r = await W.runReportFlow(stats3, opts3, async () => {
    n++
    return goodResp({
      summary: '이번 주는 3일 기록했어요. 물을 8잔 드셨어요.',
      good: ['하루 평균 9,999kcal로 잘 드셨어요.'],
      next: ['점심에 현미밥을 드셔 보세요.', '하루 단식을 해 보세요.'],
      dayPlan: { breakfast: '현미밥 1공기', lunch: '비빔밥', dinner: '생선구이', snack: '사과' },
    })
  })
  assert.equal(n, 2, '재요청은 1회만')
  assert.equal(r.text.summary, '이번 주는 3일 기록했어요.')
  assert.deepEqual(r.text.good, [])
  assert.deepEqual(r.text.next, ['점심에 현미밥을 드셔 보세요.'])
  assert.equal(r.text.dayPlan.breakfast, '', '식단 예시 숫자 금지')
  assert.equal(r.text.dayPlan.lunch, '비빔밥')
  assert.ok(r.dropped.length >= 4)
})

await t('가짜 모델: 다시 부르기 실패 → 첫 응답에서 거름', async () => {
  let n = 0
  const r = await W.runReportFlow(stats3, opts3, async () => {
    if (++n === 2) throw new Error('quota')
    return goodResp({ good: ['하루 평균 9,999kcal로 잘 드셨어요.', '꾸준히 기록하셨어요.'] })
  })
  assert.equal(n, 2)
  assert.deepEqual(r.text.good, ['꾸준히 기록하셨어요.'])
})

await t('가짜 모델: 첫 호출 실패는 그대로 던짐', async () => {
  await assert.rejects(W.runReportFlow(stats3, opts3, async () => { throw new Error('boom') }), /boom/)
})

await t('입력 글: 숫자·기록 요약, 개인 정보 없음, 18세 미만 안내', () => {
  const meals = [meal(day(0), 'lunch', 2000, [item('김밥_김치'), item('피자', { remaining_ratio: 1 })], { c: 250, p: 100, f: 60 })]
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  const txt = W.buildReportUserText(s, { under18: true, meals, goal: GOAL, compare: { kcalDiff: -120, scoreDiff: 5 } })
  assert.ok(txt.includes('10월 19일(월) 합계 2000kcal(목표 2000kcal): 점심 김치김밥 2000kcal'))
  assert.ok(!txt.includes('피자'), '다 남긴 음식은 요약에서도 뺌')
  assert.ok(txt.includes('120kcal 적음') && txt.includes('5점 높음'))
  assert.ok(txt.includes('성장기 청소년'))
  assert.ok(txt.includes('10월 20일(화): 기록 없음'))
})

await t('목업 응답은 거르기를 그대로 통과', async () => {
  for (const s of [stats3, W.computeWeekStats(MON, [0, 1, 2, 3, 4, 5, 6].flatMap(perfectDay), () => GOAL)]) {
    for (const under18 of [false, true]) {
      const r = await W.runReportFlow(s, { under18, meals: [], goal: GOAL }, async () => W.mockReportText(s, under18))
      assert.equal(r.calls, 1)
      assert.deepEqual(r.dropped, [])
      assert.ok(r.text.summary && r.text.good.length && r.text.improve.length && r.text.next.length)
    }
  }
})

await t('응답 형식 정리', () => {
  assert.equal(W.parseReportJson('not json'), null)
  assert.equal(W.parseReportJson('[]'), null)
  assert.equal(W.parseReportJson('{}'), null)
  const r = W.parseReportJson(JSON.stringify({ summary: ' 좋아요. ', good: ['a', 'b', 'c', 'd', 3, ''], dayPlan: { lunch: '비빔밥' } }))
  assert.equal(r.summary, '좋아요.')
  assert.deepEqual(r.good, ['a', 'b', 'c'])
  assert.deepEqual(r.improve, [])
  assert.deepEqual(r.dayPlan, { breakfast: '', lunch: '비빔밥', dinner: '', snack: '' })
  const f = W.filterReportText(r, [], false)
  assert.deepEqual(f.text.good, [], '한국어가 아닌 문장은 버림')
})

await t('기록 3일 미만은 호출하지 않음', async () => {
  const s = W.computeWeekStats(MON, [meal(day(0), 'lunch', 500, [item('비빔밥')])], () => GOAL)
  await assert.rejects(W.generateReportText(s, { under18: false, meals: [] }), (e) => e.code === 'ANALYSIS_UNAVAILABLE' && e.reason === 'bad_request')
  assert.equal(W.REPORT_MIN_DAYS, 3)
  assert.equal(W.PROMPT_VERSION_REPORT, 'r2') // r2: 공복 끼니 입력(2026-10-29)
})

await t('공복(2026-10-29): 기록 없는 끼니의 공복만 세고, 해시·AI 입력에 반영', () => {
  const meals = [0, 1, 2].flatMap(perfectDay)
  const base = W.computeWeekStats(MON, meals, () => GOAL)
  assert.deepEqual(base.fastCount, { breakfast: 0, lunch: 0, dinner: 0, snack: 0 })
  const lunchEaten = meals.some((m) => m.dateKey === day(0) && m.mealType === 'lunch')
  const fasted = { [day(3)]: ['breakfast', 'dinner'], [day(4)]: ['breakfast'], [day(0)]: ['lunch'], '2026-10-30': ['breakfast'] }
  const s = W.computeWeekStats(MON, meals, () => GOAL, fasted)
  assert.equal(s.fastCount.breakfast, 2)
  assert.equal(s.fastCount.dinner, 1)
  assert.equal(s.fastCount.lunch, lunchEaten ? 0 : 1) // 기록이 있는 끼니의 공복 표시는 세지 않는다
  assert.notEqual(s.inputHash, base.inputHash)
  assert.equal(s.score, base.score) // 점수는 공복과 상관없음
  const txt = W.buildReportUserText(s, { under18: false, meals })
  assert.ok(txt.includes('공복') && txt.includes('아침 2번'))
  assert.ok(!W.buildReportUserText(base, { under18: false, meals }).includes('공복'))
})

console.log(`weekly_report_test: ${pass} passed`)
