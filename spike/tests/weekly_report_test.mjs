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
  assert.ok(txt.includes('10월 19일(월) 합계 2000kcal(목표 2000kcal): 점심 2000kcal'))
  assert.ok(txt.includes('  - 점심 김치김밥'))
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
  assert.deepEqual(r.good, ['a', 'b', 'c', 'd'])
  assert.deepEqual(r.improve, [])
  assert.deepEqual(r.dayPlan, { breakfast: '', lunch: '비빔밥', dinner: '', snack: '' })
  const f = W.filterReportText(r, [], false)
  assert.deepEqual(f.text.good, [], '한국어가 아닌 문장은 버림')
})

await t('기록 3일 미만은 호출하지 않음', async () => {
  const s = W.computeWeekStats(MON, [meal(day(0), 'lunch', 500, [item('비빔밥')])], () => GOAL)
  await assert.rejects(W.generateReportText(s, { under18: false, meals: [] }), (e) => e.code === 'ANALYSIS_UNAVAILABLE' && e.reason === 'bad_request')
  assert.equal(W.REPORT_MIN_DAYS, 3)
  assert.equal(W.PROMPT_VERSION_REPORT, 'r3') // r3: 음식별 영양소 입력·새 칸(2026-10-29)
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


// ── r3(2026-10-29): 음식별 영양소 입력·새 칸 ──
const richItem = (name, kcal, c, p, f, extra = {}) => item(name, { consumed: { kcal, carbs_g: c, protein_g: p, fat_g: f }, ...extra })

await t('r3 입력: 음식별 탄단지·나트륨·당류(있는 것만, 반올림), 끼니별 합계, 숫자 집합에 들어감', () => {
  const meals = [
    meal(day(0), 'lunch', 500, [richItem('김밥_김치', 480.4, 60.4, 15.2, 12.6, { detail_consumed: { sodium_mg: 901.7, sugar_g: 4.6 } })], { c: 60, p: 15, f: 13 }),
    meal(day(0), 'lunch', 120, [richItem('된장국', 120, 8, 7, 4)], { c: 8, p: 7, f: 4 }),
    meal(day(0), 'dinner', 900, [richItem('양념치킨', 900, 40, 50, 55)], { c: 40, p: 50, f: 55 }),
  ]
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  const txt = W.buildReportUserText(s, { under18: false, meals, goal: GOAL })
  assert.ok(txt.includes('합계 1520kcal(목표 2000kcal): 점심 620kcal / 저녁 900kcal'), txt)
  assert.ok(txt.includes('  - 점심 김치김밥 480kcal(탄 60g, 단 15g, 지 13g, 나트륨 902mg, 당류 5g)'))
  assert.ok(txt.includes('  - 점심 된장국 120kcal(탄 8g, 단 7g, 지 4g)'), '없는 세부 영양소는 뺌')
  const allowed = W.inputNumberSet(txt)
  assert.ok(W.numbersOk('김치김밥의 나트륨이 902mg이었어요.', allowed))
  assert.ok(!W.numbersOk('나트륨이 1,234mg이었어요.', allowed))
})

await t('r3 입력: 음식 줄 상한(80) 넘으면 생략 줄', () => {
  const meals = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    meal(day(i), 'lunch', 1000, Array.from({ length: 15 }, (_, k) => richItem(`반찬${String.fromCharCode(0xac00 + k)}`, 50, 1, 1, 1))),
  )
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  const txt = W.buildReportUserText(s, { under18: false, meals, goal: GOAL })
  assert.equal((txt.match(/^  - /gm) ?? []).length, W.MAX_FOOD_LINES)
  assert.ok(txt.includes('(음식 줄이 많아 25개는 생략)'))
})

const fullResp = (over = {}) => ({
  summary: '이번 주는 3일 기록했어요. 비빔밥을 자주 드셨어요. 치킨을 드신 날이 조금 많았어요.',
  good: ['꾸준히 기록하셨어요.', '점심에 비빔밥으로 채소를 챙기셨어요.'],
  improve: ['저녁 치킨이 하루 칼로리를 끌어올렸어요.', '단백질 반찬이 적은 날이 있었어요.'],
  next: ['점심 비빔밥에 달걀프라이를 올려 보세요.', '간식은 우유로 바꿔 보세요.'],
  dayPlan: { breakfast: '현미밥, 달걀찜', lunch: '비빔밥', dinner: '생선구이', snack: '사과' },
  nutrients: { carbs: '탄수화물은 비빔밥 덕분에 알맞았어요.', protein: '단백질이 조금 적었어요.', fat: '치킨을 드신 날 지방이 많았어요.', sodium: '', sugar: '당류는 적당했어요.' },
  meals: { lunch: '점심은 비빔밥으로 든든했어요.', dinner: '저녁 치킨은 구운 치킨으로 바꿔 보세요.', breakfast: '' },
  swaps: [
    { from: '치킨', to: '구운 치킨과 샐러드', why: '튀김옷이 없어 지방을 덜 드실 수 있어요.' },
    { from: '비 빔밥', to: '산채비빔밥', why: '나물이 많아 식이섬유를 더 챙길 수 있어요.' },
    { from: '떡볶이', to: '김밥', why: '그 주에 먹지 않은 음식이라 버려요.' },
  ],
  focus: '다음 주에는 저녁 치킨 대신 구운 치킨에 샐러드를 곁들여 보세요.',
  ...over,
})

await t('r3 응답 정리: 새 칸 파싱(빈 칸 빼기, swaps 3개·빈 항목 버림, 문장 4개)', () => {
  const r = W.parseReportJson(JSON.stringify(fullResp({ swaps: [...fullResp().swaps, { from: '라면', to: '', why: 'x' }, { from: '김밥', to: '유부초밥', why: '넷째' }] })))
  assert.equal(r.focus, '다음 주에는 저녁 치킨 대신 구운 치킨에 샐러드를 곁들여 보세요.')
  assert.deepEqual(Object.keys(r.nutrients).sort(), ['carbs', 'fat', 'protein', 'sugar'])
  assert.deepEqual(Object.keys(r.meals).sort(), ['dinner', 'lunch'])
  assert.equal(r.swaps.length, 3)
  assert.ok(r.swaps.every((s) => s.to))
  const old = W.parseReportJson(JSON.stringify({ summary: '좋아요.', good: ['잘했어요.'] }))
  assert.deepEqual(old.swaps, [])
  assert.equal(old.focus, '')
  assert.deepEqual(old.meals, {})
})

await t('r3 거르기: swaps.from은 그 주 음식만(띄어쓰기 무시), 위반 칸만 비움, 예전 저장본 그대로', async () => {
  const r = await W.runReportFlow(stats3, opts3, async () => W.parseReportJson(JSON.stringify(fullResp())))
  assert.equal(r.calls, 1)
  assert.deepEqual(r.text.swaps.map((s) => s.from), ['치킨', '비 빔밥'])
  assert.ok(r.dropped.some((d) => d.startsWith('떡볶이')))
  assert.equal(r.text.nutrients.sugar, '당류는 적당했어요.')
  // 숫자·안전 위반: 그 칸만 비움, swaps는 항목째
  let n = 0
  const r2 = await W.runReportFlow(stats3, opts3, async () => {
    n++
    return W.parseReportJson(
      JSON.stringify(
        fullResp({
          nutrients: { carbs: '탄수화물은 하루 345g이었어요.', protein: '단백질이 적었어요.', fat: '지방은 알맞았어요.', sodium: '나트륨 때문에 고혈압이 걱정돼요.' },
          meals: { lunch: '점심은 든든했어요.', dinner: '저녁은 굶어 보세요.' },
          swaps: [
            { from: '치킨', to: '샐러드', why: '777kcal를 줄일 수 있어요.' },
            { from: '비빔밥', to: '산채비빔밥', why: '나물이 많아 좋아요.' },
          ],
          focus: '다음 주엔 저녁 식사를 건너뛰어 보세요.',
        }),
      ),
    )
  })
  assert.equal(n, 2, '숫자 위반이면 1회 다시')
  assert.equal(r2.text.nutrients.carbs, '')
  assert.equal(r2.text.nutrients.protein, '단백질이 적었어요.')
  assert.equal(r2.text.nutrients.sodium, undefined)
  assert.deepEqual(r2.text.meals, { lunch: '점심은 든든했어요.' })
  assert.deepEqual(r2.text.swaps.map((s) => s.from), ['비빔밥'])
  assert.equal(r2.text.focus, '')
  // 예전 저장본(r2, 새 칸 없음)은 새 칸 없이 그대로
  const legacy = { summary: '좋아요.', good: ['꾸준히 기록하셨어요.'], improve: [], next: [], dayPlan: { breakfast: '', lunch: '', dinner: '', snack: '' } }
  const f = W.filterReportText(legacy, [], false)
  assert.ok(!('swaps' in f.text) && !('nutrients' in f.text) && !('focus' in f.text))
  // foodNames를 안 주면 swaps는 모두 버림
  assert.deepEqual(W.filterReportText(W.parseReportJson(JSON.stringify(fullResp())), W.inputNumberSet(W.buildReportUserText(stats3, opts3)), false).text.swaps, [])
})

await t('r3 목업: 새 칸을 채우고 거르기를 그대로 통과', async () => {
  const meals = [0, 1, 2, 3, 4].flatMap(perfectDay)
  const s = W.computeWeekStats(MON, meals, () => GOAL)
  for (const under18 of [false, true]) {
    const r = await W.runReportFlow(s, { under18, meals, goal: GOAL }, async () => W.mockReportText(s, under18))
    assert.deepEqual(r.dropped, [])
    assert.ok(r.text.focus)
    assert.ok(r.text.nutrients.carbs && r.text.nutrients.protein && r.text.nutrients.fat)
    assert.deepEqual(Object.keys(r.text.meals).sort(), ['breakfast', 'dinner', 'lunch'])
    assert.ok(r.text.swaps.length >= 2)
    assert.ok(r.text.good.length >= 2 && r.text.improve.length >= 2 && r.text.next.length >= 2)
    assert.ok(r.text.summary.split(/(?<=[.!?])\s+/).length >= 3)
  }
})

console.log(`weekly_report_test: ${pass} passed`)
