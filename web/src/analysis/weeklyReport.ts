// AI 주간 리포트(D14, 스펙 4.11절, CLAUDE.md 디자인 기준 "AI 주간 리포트(D14)").
// 숫자는 모두 코드가 계산한다(computeWeekStats). Gemini에는 그 숫자 + 그 주 기록 요약 + 목표 + 만 18세 미만 여부만 보내
// 총평·잘한 점·아쉬운 점·다음 주 제안·하루 식단 예시 글만 받는다(generateReportText, 프롬프트 r1, 텍스트만).
// 응답 문장의 숫자는 보낸 글에 있는 숫자여야 한다(반올림 허용). 어긋나면 1회 다시 요청하고, 그래도 어긋난 문장은 버린다.
// 극단적 감량·끼니 거르기·질병·약 표현 문장도 버린다(만 18세 미만은 감량 문장까지).
// 이 파일은 Node 시험(spike/tests/weekly_report_test.mjs)에서 바로 불러 쓴다: 런타임 import는 .ts 확장자를 붙이고,
// Firebase 앱을 여는 모듈(lib/ai, aiCall)은 실제 호출 때만 동적으로 불러온다.
import { Schema, ThinkingLevel, type GenerationConfig } from 'firebase/ai'
import type { MealType, MealWithId } from '../data/meals'
import { summarizeDay } from '../data/summary.ts'
import { foodName, isAllLeft } from '../lib/foodName.ts'
import { weekDays } from '../lib/week.ts'
import { AnalysisError } from './errors.ts'
import { isKoreanText } from './koreanText.ts'

export const REPORT_MIN_DAYS = 3
export const PROMPT_VERSION_REPORT = 'r2'
export const MOCK_REPORT_MODEL = 'mock'

// ───────────────────────── 숫자 계산(AI 없음) ─────────────────────────

export interface WeekGoal {
  target_kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
}

export interface WeekStats {
  /** 월요일 dateKey */
  weekStart: string
  /** 월~일 7개, 기록 없으면 kcal null(정수 kcal), target은 그날 목표 kcal(없으면 null) */
  days: { dateKey: string; kcal: number | null; target: number | null }[]
  recordDays: number
  /** 기록한 날의 하루 평균(정수) */
  avgKcal: number | null
  /** 그날 목표의 90~110% 안에 든 기록일 수 */
  inRangeDays: number
  /** 목표가 있는 기록일의 하루 평균 ÷ 그날 목표 평균 × 100(정수) */
  macroPct: { carbs: number | null; protein: number | null; fat: number | null }
  /** 값이 있는 기록일의 하루 평균(g 소수 첫째, mg 정수) */
  minorAvg: { sugar_g: number | null; fiber_g: number | null; sodium_mg: number | null }
  /** 끼니별 kcal 비중 %(정수, 기록이 있으면 합 100, 없으면 모두 0) */
  mealShare: { breakfast: number; lunch: number; dinner: number; snack: number }
  /** 자주 먹은 음식 상위 5(화면 이름, 다 남긴 음식 제외) */
  topFoods: { name: string; count: number }[]
  /** 목표 대비 100%에 가장 가까운 날 */
  bestDay: { dateKey: string; kcal: number; pct: number } | null
  /** 100%에서 가장 먼 날(기록일이 하나면 null) */
  worstDay: { dateKey: string; kcal: number; pct: number } | null
  /** 0~100 정수 */
  score: number
  headline: string
  /** 그 주 기록 요약(날짜·끼니·음식 이름·kcal·목표)의 안정된 해시 */
  inputHash: string
  /** (추가) 하루 평균 탄·단·지 g(목표가 있는 기록일 기준이 아니라 모든 기록일, 소수 첫째). 화면·프롬프트 참고용 */
  macroAvg: { carbs_g: number | null; protein_g: number | null; fat_g: number | null }
  /** (추가) 기록일 목표 kcal 평균(정수). 목표가 있는 기록일이 없으면 null */
  avgTarget: number | null
  /** (추가) 그 주에 먹은 음식 수(다 남긴 음식 제외) */
  foodCount: number
  /** 그 주에 먹은 음식 가짓수(정리한 이름 기준, 다 남긴 음식 제외) — 리포트 "식단 다양성"(2026-10-29 사용자 결정, 자주 먹은 음식 TOP 5 대신) */
  foodKinds: number
  /** 그 주 공복으로 표시한 끼니 횟수(그 끼니에 기록이 없는 것만, 직접·자동 공복 모두, 2026-10-29 사용자 결정) */
  fastCount: { breakfast: number; lunch: number; dinner: number; snack: number }
}

const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_KO: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' }
const WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일']

const round1 = (v: number) => {
  const r = Math.round(v * 10) / 10
  return r === 0 ? 0 : r
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const validGoal = (g: WeekGoal | null): g is WeekGoal => !!g && Number.isFinite(g.target_kcal) && g.target_kcal > 0

/** 점수 경계(계약): 80 이상, 60~79, 60 미만 */
export function headlineFor(score: number): string {
  if (score >= 80) return '균형 잡힌 한 주였어요'
  if (score >= 60) return '조금만 더 다듬으면 좋아요'
  return '다음 주는 목표에 더 가까이 가 봐요'
}

/** 점수: 기록일 30(7일=30, 비례) + 목표 범위 안 날 ÷ 기록일 × 40 + 탄단지 근접 30(영양소마다 |pct−100| 0이면 10, 50 이상 0, 선형) */
export function scoreFor(recordDays: number, inRangeDays: number, macroPct: WeekStats['macroPct']): number {
  if (recordDays <= 0) return 0
  const rec = (30 * Math.min(recordDays, 7)) / 7
  const range = (40 * Math.min(inRangeDays, recordDays)) / recordDays
  let macro = 0
  for (const p of [macroPct.carbs, macroPct.protein, macroPct.fat]) {
    if (p == null || !Number.isFinite(p)) continue
    macro += Math.max(0, 10 * (1 - Math.abs(p - 100) / 50))
  }
  return Math.max(0, Math.min(100, Math.round(rec + range + macro)))
}

/** 정수 %들의 합이 100이 되게(가장 큰 나머지 방식, 같으면 앞 끼니 먼저) */
function sharePct(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    out[i]++
    left--
  }
  return out
}

/** FNV-1a 32비트 두 개(시드 다름)를 이어 16자리 16진수. 동기·안정(같은 입력이면 같은 값) */
export function stableHash(s: string): string {
  const h = (seed: number) => {
    let x = seed >>> 0
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i)
      x = Math.imul(x, 0x01000193) >>> 0
    }
    return x.toString(16).padStart(8, '0')
  }
  return h(0x811c9dc5) + h(0x6a09e667)
}

function doneMealsOf(dateKey: string, meals: MealWithId[]): MealWithId[] {
  return meals
    .filter((m) => m.status === 'done' && !!m.analysis && m.dateKey === dateKey)
    .sort(
      (a, b) =>
        MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) ||
        (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}

function shownNames(m: MealWithId): string[] {
  const items = Array.isArray(m.analysis?.items) ? m.analysis!.items : []
  return items
    .filter((it) => !isAllLeft(it))
    .map((it) => foodName(typeof it.name === 'string' ? it.name : ''))
    .filter((n) => n.length > 0)
}

const mealKcal = (m: MealWithId) => {
  const k = m.analysis?.totals?.consumed?.kcal
  return typeof k === 'number' && Number.isFinite(k) ? k : 0
}

export function computeWeekStats(
  weekStart: string,
  meals: MealWithId[],
  goalFor: (dateKey: string) => WeekGoal | null,
  /** 날짜별 공복 표시 끼니(users/{uid}/days fasted). 없으면 공복 0 */
  fasted: Readonly<Record<string, readonly MealType[]>> = {},
): WeekStats {
  const keys = weekDays(weekStart)
  const days: WeekStats['days'] = []
  const recKcal: number[] = []
  const macroIntake = { carbs: [] as number[], protein: [] as number[], fat: [] as number[] }
  const macroGoal = { carbs: [] as number[], protein: [] as number[], fat: [] as number[] }
  const macroAll = { carbs_g: [] as number[], protein_g: [] as number[], fat_g: [] as number[] }
  const minor = { sugar_g: [] as number[], fiber_g: [] as number[], sodium_mg: [] as number[] }
  const mealKcalSum = [0, 0, 0, 0]
  const targets: number[] = []
  const foodCounts = new Map<string, number>()
  const hashLines: string[] = []
  let inRangeDays = 0
  let foodCount = 0
  const ranked: { dateKey: string; kcal: number; ratio: number }[] = []

  for (const dk of keys) {
    const goal = goalFor(dk)
    const g = validGoal(goal) ? goal : null
    const dayMeals = doneMealsOf(dk, meals)
    hashLines.push(`${dk}#${g ? [g.target_kcal, g.carbs_g, g.protein_g, g.fat_g].join(',') : '-'}`)
    if (dayMeals.length === 0) {
      days.push({ dateKey: dk, kcal: null, target: g ? Math.round(g.target_kcal) : null })
      continue
    }
    const s = summarizeDay(dk, dayMeals)
    const kcal = Math.round(s.totals.kcal)
    days.push({ dateKey: dk, kcal, target: g ? Math.round(g.target_kcal) : null })
    recKcal.push(s.totals.kcal)
    macroAll.carbs_g.push(s.totals.carbs_g)
    macroAll.protein_g.push(s.totals.protein_g)
    macroAll.fat_g.push(s.totals.fat_g)
    MEAL_TYPES.forEach((mt, i) => (mealKcalSum[i] += s.byMealType[mt].kcal))
    for (const k of ['sugar_g', 'fiber_g', 'sodium_mg'] as const) {
      const t = s.detail.totals[k]
      if (t && t.count > 0) minor[k].push(t.value)
    }
    if (g) {
      targets.push(g.target_kcal)
      const ratio = s.totals.kcal / g.target_kcal
      if (ratio >= 0.9 && ratio <= 1.1) inRangeDays++
      ranked.push({ dateKey: dk, kcal, ratio })
      macroIntake.carbs.push(s.totals.carbs_g)
      macroIntake.protein.push(s.totals.protein_g)
      macroIntake.fat.push(s.totals.fat_g)
      macroGoal.carbs.push(g.carbs_g)
      macroGoal.protein.push(g.protein_g)
      macroGoal.fat.push(g.fat_g)
    }
    for (const m of dayMeals) {
      const names = shownNames(m)
      foodCount += names.length
      for (const n of names) foodCounts.set(n, (foodCounts.get(n) ?? 0) + 1)
      hashLines.push(`${dk}|${m.mealType}|${names.join(',')}|${round1(mealKcal(m))}`)
    }
  }

  const pctOf = (intake: number[], goal: number[]) => {
    const a = mean(intake)
    const b = mean(goal)
    return a == null || b == null || !(b > 0) ? null : Math.round((a / b) * 100)
  }
  const macroPct = {
    carbs: pctOf(macroIntake.carbs, macroGoal.carbs),
    protein: pctOf(macroIntake.protein, macroGoal.protein),
    fat: pctOf(macroIntake.fat, macroGoal.fat),
  }
  const avg1 = (xs: number[]) => {
    const v = mean(xs)
    return v == null ? null : round1(v)
  }
  const avgInt = (xs: number[]) => {
    const v = mean(xs)
    return v == null ? null : Math.round(v)
  }
  const share = sharePct(mealKcalSum)
  const topFoods = [...foodCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 5)

  let best: (typeof ranked)[number] | null = null
  let worst: (typeof ranked)[number] | null = null
  for (const r of ranked) {
    const d = Math.abs(r.ratio - 1)
    if (!best || d < Math.abs(best.ratio - 1)) best = r
    if (!worst || d > Math.abs(worst.ratio - 1)) worst = r
  }
  // 공복: 그 끼니에 기록이 없는 공복 표시만 센다
  const fastCount = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
  const fastLines: string[] = []
  for (const k of keys) {
    const list = fasted[k] ?? []
    const eaten = new Set(meals.filter((m) => m.dateKey === k).map((m) => m.mealType))
    const f = (['breakfast', 'lunch', 'dinner', 'snack'] as const).filter((mt) => list.includes(mt) && !eaten.has(mt))
    for (const mt of f) fastCount[mt]++
    if (f.length) fastLines.push(`fast|${k}|${f.join(',')}`)
  }
  const fastHash = fastLines.length ? `\n${fastLines.join('\n')}` : ''
  const dayOut = (r: (typeof ranked)[number] | null) => (r ? { dateKey: r.dateKey, kcal: r.kcal, pct: Math.round(r.ratio * 100) } : null)
  const recordDays = recKcal.length
  const score = scoreFor(recordDays, inRangeDays, macroPct)

  return {
    weekStart,
    days,
    recordDays,
    avgKcal: avgInt(recKcal),
    inRangeDays,
    macroPct,
    minorAvg: { sugar_g: avg1(minor.sugar_g), fiber_g: avg1(minor.fiber_g), sodium_mg: avgInt(minor.sodium_mg) },
    mealShare: { breakfast: share[0], lunch: share[1], dinner: share[2], snack: share[3] },
    topFoods,
    bestDay: dayOut(best),
    worstDay: best && worst && worst.dateKey !== best.dateKey ? dayOut(worst) : null,
    score,
    headline: headlineFor(score),
    inputHash: stableHash(`${weekStart}\n${hashLines.join('\n')}${fastHash}`),
    macroAvg: { carbs_g: avg1(macroAll.carbs_g), protein_g: avg1(macroAll.protein_g), fat_g: avg1(macroAll.fat_g) },
    avgTarget: avgInt(targets),
    foodCount,
    foodKinds: foodCounts.size,
    fastCount,
  }
}

/** 지난주와 비교. 지난주 기록이 3일 미만이거나 평균이 없으면 null */
export function compareWeeks(cur: WeekStats, prev: WeekStats | null): { kcalDiff: number; scoreDiff: number } | null {
  if (!prev || prev.recordDays < REPORT_MIN_DAYS || prev.avgKcal == null || cur.avgKcal == null) return null
  return { kcalDiff: cur.avgKcal - prev.avgKcal, scoreDiff: cur.score - prev.score }
}

// ───────────────────────── AI 글(프롬프트 r1) ─────────────────────────

export interface ReportText {
  summary: string
  good: string[]
  improve: string[]
  next: string[]
  dayPlan: { breakfast: string; lunch: string; dinner: string; snack: string }
}

export const SYSTEM_INSTRUCTION_REPORT = [
  '너는 식단 기록 앱의 주간 리포트를 쓰는 친절한 영양 코치다. 모든 글은 한국어 존댓말(~해요체)로 쓴다.',
  '입력은 앱이 이미 계산한 한 주의 숫자, 날짜·끼니별 기록 요약, 목표다. 숫자는 새로 계산하거나 지어내지 않는다.',
  '숫자를 쓸 때는 입력에 적힌 숫자만 그대로 쓴다. 입력에 없는 숫자(새 합계, 새 비율, 횟수, 권장량, 그램 수 등)는 쓰지 말고 말로 표현한다.',
  '안전: 단식, 굶기, 끼니 거르기, 아주 적은 칼로리로 줄이기 같은 극단적 감량은 권하지 않는다. 질병·약·진단·치료는 언급하지 않는다.',
  '출력 JSON:',
  '- summary: 한 주 총평 2~3문장.',
  '- good: 잘한 점 1~3개(한 항목에 한 문장).',
  '- improve: 아쉬운 점 1~3개(한 항목에 한 문장, 비난하지 않는 말투).',
  '- next: 다음 주 제안 1~3개. 항목마다 구체적인 음식 예시를 넣는다(예: "점심에 현미밥과 고등어구이를 곁들여 보세요").',
  '- dayPlan: 다음 주 하루 식단 예시. breakfast·lunch·dinner·snack에 메뉴 이름만 쓴다(숫자·양·칼로리 없이, 예: "현미밥, 된장국, 시금치나물").',
  '기록에 있는 음식을 근거로 구체적으로 쓰고, 기록에 없는 사실은 만들지 않는다.',
  '공복으로 표시한 끼니는 한 주를 이해하는 참고 자료다. 꼭 언급할 필요는 없고, 공복이 잦거나 다른 내용과 이어질 때만 자연스럽게 한두 번 쓴다. 쓸 때는 "공복이었던 아침이 있었어요"처럼 "공복"이라는 말로만 쓰고(거르다·건너뛰다·빼먹다는 쓰지 않는다), 필요하면 바쁜 날 간단히 챙길 수 있는 음식을 제안한다. 끼니를 거르라고 하지 않는다.',
].join('\n')

const STR_ARR = Schema.array({ items: Schema.string() })
export const RESPONSE_SCHEMA_REPORT = Schema.object({
  properties: {
    summary: Schema.string(),
    good: STR_ARR,
    improve: STR_ARR,
    next: STR_ARR,
    dayPlan: Schema.object({
      properties: {
        breakfast: Schema.string(),
        lunch: Schema.string(),
        dinner: Schema.string(),
        snack: Schema.string(),
      },
    }),
  },
})

export const GENERATION_CONFIG_REPORT: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: RESPONSE_SCHEMA_REPORT,
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  maxOutputTokens: 2048,
}

const md = (dk: string) => {
  const [, m, d] = dk.split('-').map(Number)
  return `${m}월 ${d}일`
}
const fmt = (v: number | null, unit: string) => (v == null ? '없음' : `${v}${unit}`)

export interface ReportOpts {
  under18: boolean
  meals: MealWithId[]
  signal?: AbortSignal
  /** (추가, 선택) 지난주 비교 값. 있으면 입력에 넣는다(compareWeeks 결과) */
  compare?: { kcalDiff: number; scoreDiff: number } | null
  /** (추가, 선택) 목표 칸에 보일 목표. 없으면 stats의 평균 목표 kcal만 */
  goal?: WeekGoal | null
}

/** Gemini에 보내는 글(숫자는 모두 stats·기록에서). 사진·이름·이메일 없음 */
export function buildReportUserText(stats: WeekStats, opts: Pick<ReportOpts, 'under18' | 'meals' | 'compare' | 'goal'>): string {
  const L: string[] = []
  L.push(`[주간] ${md(stats.weekStart)}부터 7일`)
  L.push(`[대상] ${opts.under18 ? '만 18세 미만(성장기)' : '성인'}`)
  const g = opts.goal
  if (g && validGoal(g)) {
    L.push(`[목표] 하루 ${Math.round(g.target_kcal)}kcal, 탄수화물 ${Math.round(g.carbs_g)}g, 단백질 ${Math.round(g.protein_g)}g, 지방 ${Math.round(g.fat_g)}g`)
  } else {
    L.push(`[목표] 하루 평균 목표 ${fmt(stats.avgTarget, 'kcal')}`)
  }
  L.push('[숫자]')
  L.push(`- 기록한 날 ${stats.recordDays}일, 하루 평균 ${fmt(stats.avgKcal, 'kcal')}, 목표 범위(90~110%) 안에 든 날 ${stats.inRangeDays}일`)
  L.push(`- 점수 ${stats.score}점(100점 만점)`)
  const mp = stats.macroPct
  L.push(`- 목표 대비 하루 평균: 탄수화물 ${fmt(mp.carbs, '%')}, 단백질 ${fmt(mp.protein, '%')}, 지방 ${fmt(mp.fat, '%')}`)
  const ma = stats.macroAvg
  L.push(`- 하루 평균 섭취: 탄수화물 ${fmt(ma.carbs_g, 'g')}, 단백질 ${fmt(ma.protein_g, 'g')}, 지방 ${fmt(ma.fat_g, 'g')}`)
  const mi = stats.minorAvg
  L.push(`- 하루 평균: 당류 ${fmt(mi.sugar_g, 'g')}, 식이섬유 ${fmt(mi.fiber_g, 'g')}, 나트륨 ${fmt(mi.sodium_mg, 'mg')}`)
  const sh = stats.mealShare
  L.push(`- 끼니별 칼로리 비중: 아침 ${sh.breakfast}%, 점심 ${sh.lunch}%, 저녁 ${sh.dinner}%, 간식 ${sh.snack}%`)
  L.push(`- 이번 주 먹은 음식 가짓수: ${stats.foodKinds}가지`)
  {
    const fc = stats.fastCount
    if (fc.breakfast + fc.lunch + fc.dinner + fc.snack > 0)
      L.push(`- 공복(먹지 않음)으로 표시한 끼니: 아침 ${fc.breakfast}번, 점심 ${fc.lunch}번, 저녁 ${fc.dinner}번, 간식 ${fc.snack}번`)
  }
  if (stats.topFoods.length) L.push(`- 자주 먹은 음식: ${stats.topFoods.map((f) => `${f.name} ${f.count}번`).join(', ')}`)
  if (stats.bestDay) L.push(`- 목표에 가장 가까웠던 날: ${md(stats.bestDay.dateKey)} ${stats.bestDay.kcal}kcal(목표의 ${stats.bestDay.pct}%)`)
  if (stats.worstDay) L.push(`- 목표에서 가장 멀었던 날: ${md(stats.worstDay.dateKey)} ${stats.worstDay.kcal}kcal(목표의 ${stats.worstDay.pct}%)`)
  if (opts.compare) {
    const c = opts.compare
    const kd = c.kcalDiff === 0 ? '같음' : `${Math.abs(c.kcalDiff)}kcal ${c.kcalDiff > 0 ? '많음' : '적음'}`
    const sd = c.scoreDiff === 0 ? '같음' : `${Math.abs(c.scoreDiff)}점 ${c.scoreDiff > 0 ? '높음' : '낮음'}`
    L.push(`- 지난주와 비교: 하루 평균 ${kd}, 점수 ${sd}`)
  }
  L.push('[날짜별 기록]')
  stats.days.forEach((d, i) => {
    const head = `${md(d.dateKey)}(${WEEKDAY_KO[i]})`
    if (d.kcal == null) {
      L.push(`${head}: 기록 없음`)
      return
    }
    const parts = doneMealsOf(d.dateKey, opts.meals).map((m) => {
      const names = shownNames(m)
      return `${MEAL_KO[m.mealType]} ${names.length ? names.join('·') : '음식 없음'} ${Math.round(mealKcal(m))}kcal`
    })
    L.push(`${head} 합계 ${d.kcal}kcal${d.target != null ? `(목표 ${d.target}kcal)` : ''}: ${parts.join(' / ')}`)
  })
  L.push('')
  L.push(
    opts.under18
      ? '이 사용자는 성장기 청소년이다. 감량·다이어트·체중 줄이기 조언은 하지 말고, 골고루 먹기와 규칙적인 끼니 위주로 쓴다.'
      : '극단적인 감량 없이 꾸준히 지킬 수 있는 조언을 쓴다.',
  )
  L.push('숫자는 위에 적힌 것만 쓴다. 위 숫자가 필요 없으면 숫자 없이 쓴다.')
  return L.join('\n')
}

// ── 숫자 검사 ──

/** 문장에서 숫자(정수·소수, 1,850처럼 쉼표 포함)를 뽑는다 */
export function extractNumbers(s: string): number[] {
  const out: number[] = []
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const v = Number(m[0].replace(/,/g, ''))
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

/** 입력 숫자 집합(보낸 글에서 뽑은 숫자 전부) */
export function inputNumberSet(userText: string): number[] {
  return [...new Set(extractNumbers(userText))]
}

/** 반올림 허용: 정수·소수 첫째 반올림(차이 0.5 이하), 100 이상은 10 단위, 1000 이상은 100 단위 반올림까지 */
export function numberAllowed(x: number, allowed: readonly number[]): boolean {
  return allowed.some((v) => {
    const d = Math.abs(x - v)
    if (d <= 0.5) return true
    if (v >= 100 && x % 10 === 0 && d < 5) return true
    if (v >= 1000 && x % 100 === 0 && d < 50) return true
    return false
  })
}

export function numbersOk(sentence: string, allowed: readonly number[]): boolean {
  return extractNumbers(sentence).every((x) => numberAllowed(x, allowed))
}

// ── 안전 거르기 ──

const UNSAFE: RegExp[] = [
  /단식|금식|굶|절식|원푸드|디톡스|간헐적/,
  /(끼니|식사|아침|점심|저녁)(를|을)?\s*(거르|건너뛰|건너 뛰|생략|빼|안 ?먹|먹지 ?않)/,
  /\d[\d,]*\s*(kcal|칼로리)\s*(이하|미만|아래)/,
  /(극단|급격|대폭|확\s*줄|최대한\s*줄|칼로리를\s*크게)/,
  /질병|질환|당뇨|고혈압|고지혈|비만증|대사증후군|암\s|진단|처방|치료|복용|약물|약을|약 먹|영양제|보충제|의사|병원|한의원|증상/,
]
const UNDER18_UNSAFE = /감량|다이어트|살\s*(을\s*)?빼|살\s*빼|체중\s*(을\s*)?(줄|감소)|몸무게\s*(를\s*)?줄|칼로리\s*(를\s*)?줄/

/** "아침을 거르지 않았어요"처럼 거르지 않는다는 말은 끼니 거르기 표현으로 보지 않는다 */
const NOT_SKIP = /(거르|건너뛰|건너 뛰|생략하|빼먹)지\s*(않|말|마)[가-힣]*/g

export function isUnsafeSentence(s: string, under18: boolean): boolean {
  const t = s.replace(NOT_SKIP, '')
  if (UNSAFE.some((r) => r.test(t))) return true
  return under18 && UNDER18_UNSAFE.test(s)
}

// ── 응답 정리 ──

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** 응답 JSON 형식 확인(문장 거르기 전). 형식이 아니면 null */
export function parseReportJson(text: string): ReportText | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const r = o as Record<string, unknown>
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean).slice(0, 3) : [])
  const dp = r.dayPlan && typeof r.dayPlan === 'object' ? (r.dayPlan as Record<string, unknown>) : {}
  const out: ReportText = {
    summary: clean(r.summary),
    good: arr(r.good),
    improve: arr(r.improve),
    next: arr(r.next),
    dayPlan: { breakfast: clean(dp.breakfast), lunch: clean(dp.lunch), dinner: clean(dp.dinner), snack: clean(dp.snack) },
  }
  if (!out.summary && !out.good.length && !out.improve.length && !out.next.length) return null
  return out
}

const splitSentences = (s: string) =>
  s
    .split(/(?<=[.!?。])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** 숫자 위반 문장 목록(재요청 판단용) */
export function numberViolations(t: ReportText, allowed: readonly number[]): string[] {
  const all = [...splitSentences(t.summary), ...t.good, ...t.improve, ...t.next]
  const bad = all.filter((s) => !numbersOk(s, allowed))
  // 식단 예시는 메뉴 이름만: 숫자가 있으면 위반
  for (const v of Object.values(t.dayPlan)) if (/\d/.test(v)) bad.push(v)
  return bad
}

/** 숫자 위반·안전·한국어 아님 문장을 버린다. 배열이 비면 빈 배열 그대로(화면이 처리) */
export function filterReportText(t: ReportText, allowed: readonly number[], under18: boolean): { text: ReportText; dropped: string[] } {
  const dropped: string[] = []
  const keep = (s: string) => {
    const ok = isKoreanText(s) && numbersOk(s, allowed) && !isUnsafeSentence(s, under18)
    if (!ok) dropped.push(s)
    return ok
  }
  const plan = (s: string) => {
    if (!s) return ''
    if (!/\d/.test(s) && isKoreanText(s) && !isUnsafeSentence(s, under18)) return s
    dropped.push(s)
    return ''
  }
  return {
    text: {
      summary: splitSentences(t.summary).filter(keep).join(' '),
      good: t.good.filter(keep),
      improve: t.improve.filter(keep),
      next: t.next.filter(keep),
      dayPlan: {
        breakfast: plan(t.dayPlan.breakfast),
        lunch: plan(t.dayPlan.lunch),
        dinner: plan(t.dayPlan.dinner),
        snack: plan(t.dayPlan.snack),
      },
    },
    dropped,
  }
}

export function retryNote(bad: readonly string[]): string {
  const nums = [...new Set(bad.flatMap(extractNumbers))].slice(0, 10)
  return (
    '\n\n[다시 요청] 이전 답에 입력에 없는 숫자' +
    (nums.length ? `(${nums.join(', ')})` : '') +
    '가 있었다. 입력에 적힌 숫자만 쓰거나 숫자 없이 말로 다시 써라. 식단 예시에는 숫자를 쓰지 않는다.'
  )
}

/** 모델 한 번 부르기(시험에서 가짜로 바꾼다). 형식 오류·시간 초과·한도는 안에서 처리하고 ReportText를 돌려준다 */
export type ReportGenerate = (userText: string, signal?: AbortSignal) => Promise<ReportText>

/**
 * 숫자 검사·재요청·거르기 흐름(모델 부르는 방법만 주입). 첫 응답에 숫자 위반이 있으면 1회 다시 부르고,
 * 다시 부른 응답(실패하면 첫 응답)에서 위반·위험 문장을 버린다. 첫 호출 실패는 그대로 던진다.
 */
export async function runReportFlow(
  stats: WeekStats,
  opts: ReportOpts,
  generate: ReportGenerate,
): Promise<{ text: ReportText; calls: number; dropped: string[] }> {
  const userText = buildReportUserText(stats, opts)
  const allowed = inputNumberSet(userText)
  let res = await generate(userText, opts.signal)
  let calls = 1
  const bad = numberViolations(res, allowed)
  if (bad.length) {
    try {
      res = await generate(userText + retryNote(bad), opts.signal)
      calls = 2
    } catch (e) {
      if (opts.signal?.aborted) throw e
      calls = 2 // 다시 부르기가 실패하면 첫 응답에서 위반 문장만 버린다
    }
  }
  const { text, dropped } = filterReportText(res, allowed, opts.under18)
  return { text, calls, dropped }
}

// ── 목업(VITE_AI_MOCK=1): 숫자는 stats에서만 ──

export function mockReportText(stats: WeekStats, under18: boolean): ReportText {
  const top = stats.topFoods[0]?.name
  const summary = [
    `이번 주는 ${stats.recordDays}일 기록했고 하루 평균 ${stats.avgKcal ?? '–'}kcal를 드셨어요.`,
    `목표 범위 안에 든 날은 ${stats.inRangeDays}일이에요.`,
    top ? `${top}을 자주 드셨네요.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    summary,
    good: [`${stats.recordDays}일 동안 꾸준히 기록하셨어요.`, '끼니마다 밥과 반찬을 함께 드신 날이 많았어요.'],
    improve: [
      stats.macroPct.protein != null && stats.macroPct.protein < 100
        ? `단백질이 목표의 ${stats.macroPct.protein}%로 조금 부족했어요.`
        : '저녁에 드신 양이 다른 끼니보다 많은 편이었어요.',
    ],
    next: [
      '점심에 현미밥과 고등어구이를 곁들여 보세요.',
      under18 ? '간식으로 우유와 바나나를 드셔 보세요.' : '간식은 과자 대신 플레인 요거트와 견과류를 드셔 보세요.',
    ],
    dayPlan: {
      breakfast: '현미밥, 달걀찜, 시금치나물',
      lunch: '잡곡밥, 된장찌개, 고등어구이',
      dinner: '닭가슴살 샐러드, 고구마',
      snack: '플레인 요거트, 사과',
    },
  }
}

// ── 공개 함수 ──

const env = (import.meta as { env?: Record<string, string | undefined> }).env
const MOCK = env?.VITE_AI_MOCK === '1'

function abortErr(signal?: AbortSignal): DOMException {
  const r: unknown = signal?.reason
  return r instanceof DOMException && r.name === 'AbortError' ? r : new DOMException('분석을 취소했습니다', 'AbortError')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortErr(signal))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', on)
      resolve()
    }, ms)
    const on = () => {
      clearTimeout(t)
      reject(abortErr(signal))
    }
    signal?.addEventListener('abort', on, { once: true })
  })
}

/**
 * 주간 리포트 글(AI). 기록일이 REPORT_MIN_DAYS 미만이면 부르지 말 것(화면이 막는다. 여기서도 ANALYSIS_UNAVAILABLE bad_request로 막는다).
 * 오류: ANALYSIS_UNAVAILABLE(reason: timeout·quota(quotaScope)·network·server·invalid_response·blocked·bad_request).
 * 시간 초과·429는 다시 시도하지 않는다(aiCall 규칙). 숫자 위반 재요청은 1회. 취소: AbortError
 */
export async function generateReportText(
  stats: WeekStats,
  opts: ReportOpts,
): Promise<{ text: ReportText; model: string; promptVersion: string }> {
  if (opts.signal?.aborted) throw abortErr(opts.signal)
  if (stats.recordDays < REPORT_MIN_DAYS) {
    throw new AnalysisError('ANALYSIS_UNAVAILABLE', `기록이 ${REPORT_MIN_DAYS}일 미만인 주는 분석하지 않습니다`, { reason: 'bad_request' })
  }
  if (MOCK) {
    const { text } = await runReportFlow(stats, opts, async (_t, signal) => {
      await sleep(600, signal)
      return mockReportText(stats, opts.under18)
    })
    return { text, model: MOCK_REPORT_MODEL, promptVersion: PROMPT_VERSION_REPORT }
  }
  const [{ AI_MODEL_ID, getModel }, { generateWithRetry }] = await Promise.all([import('../lib/ai'), import('./aiCall')])
  const model = getModel(AI_MODEL_ID, { systemInstruction: SYSTEM_INSTRUCTION_REPORT, generationConfig: GENERATION_CONFIG_REPORT })
  const generate: ReportGenerate = async (userText, signal) => {
    const { value } = await generateWithRetry({
      model,
      parts: [{ type: 'text', text: userText }],
      parse: (t) => {
        const r = parseReportJson(t)
        return r ? { ok: true, value: r } : { ok: false, detail: '리포트 JSON 형식이 아닙니다' }
      },
      signal,
      label: '주간 리포트',
    })
    return value
  }
  const { text } = await runReportFlow(stats, opts, generate)
  return { text, model: AI_MODEL_ID, promptVersion: PROMPT_VERSION_REPORT }
}
