// 기록 보기 [AI 리포트 👑] 탭(디자인 조각 D14, 스펙 4.11절, 사용자 확인 모양 `_workspace/design/mock/d14_1~5*.png`).
// 시안 calendar() .chartcard.report 그대로(header 제목 + 왕관, .score, .aitag, h4·ul) + 사용자 요청으로 더 자세하게(결제하고 싶게).
// 위에서 아래로: ‹ 지난주 · "10.19 – 10.25" · 다음 주 › → .score(점수/100, 한 줄, AI 분석, 기간) → 숫자 칸 3개(기록·하루 평균·목표 범위 안)
// → [코드 계산] 요일별 칼로리 막대(목표 점선, 110% 초과 peach) · 영양 균형(탄·단·지 목표 대비 %, 당류·식이섬유·나트륨 평균)
//   · 끼니별 비중 · 식단 다양성(먹은 음식 가짓수·지난주 대비) · 가장 좋았던 날·아쉬웠던 날(누르면 그날 홈) · 지난주와 비교(지난주 3일 이상)
// → [AI 칸] 한 주 총평 · 잘한 점 · 아쉬운 점 · 다음 주 제안 · 다음 주 하루 식단 예시.
// 숫자 칸은 늘 지금 기록으로 코드가 다시 계산한다(computeWeekStats). AI 글만 저장본(users/{uid}/reports/{weekStart}, data/reports).
// - 처음엔 지난주. 이번 주는 "일요일이 지나면 분석해 드려요"(›는 흐리게·누를 수 없음). 기록 3일 미만은 안내만(AI 없음).
// - 저장본이 없으면 처음 열 때 한 번 만든다(서버에서 받은 기록으로만, 진행 막대 + "한 주를 분석하고 있어요…"). 실패는 안내 + [다시 시도].
// - 저장본의 inputHash가 지금과 다르면 "이 주 기록이 바뀌었어요 [다시 만들기]"(주당 3회까지, 다 쓰면 "이번 주는 더 만들 수 없어요").
// - 만 18세 미만 = 지금 목표 input.age < 18(generateReportText under18).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  compareWeeks,
  computeWeekStats,
  generateReportText,
  REPORT_MIN_DAYS,
  type ReportText,
  type WeekStats,
} from '../../analysis/weeklyReport'
import { subscribeGoal, subscribeGoalsUpTo, type DatedGoal, type StoredGoal } from '../../data/goals'
import { subscribeFastedInRange } from '../../data/fasting'
import { subscribeMealsInRange, type MealType, type MealWithId } from '../../data/meals'
import { getReport, REPORT_MAX_GEN, saveReport, type StoredReport } from '../../data/reports'
import { goalForDate, RANGE_HIGH } from '../../lib/calendar'
import { axisTicks, mondayOf, shiftWeek, weekDays, weekGoalSteps } from '../../lib/week'
import { formatKcal, MEAL_TYPE_LABEL, MEAL_TYPES } from '../mealText'
import { BottomSheet, Crown, Mascot } from '../ui'

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일']
const md = (k: string) => `${Number(k.slice(5, 7))}.${Number(k.slice(8, 10))}`
const dayLabel = (k: string, weekStart: string) => `${md(k)} (${WEEKDAY[weekDays(weekStart).indexOf(k)] ?? ''})`
const SHARE_COLOR: Record<MealType, string> = { breakfast: 'var(--butter)', lunch: 'var(--lime)', dinner: 'var(--sky)', snack: 'var(--peach)' }

/** 같은 주를 두 번 만들지 않게(탭을 오가거나 다시 열어도) 진행 중인 생성을 uid·주마다 하나만 둔다 */
const inflight = new Map<string, Promise<StoredReport>>()

type ReportState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'generating'; saved: StoredReport | null }
  | { kind: 'error'; saved: StoredReport | null; message: string }
  | { kind: 'ready'; saved: StoredReport }

function failMessage(e: unknown): string {
  const reason = (e as { reason?: string } | null)?.reason
  if (reason === 'quota') return '지금은 AI 분석이 많아요. 잠시 후 다시 시도해 주세요.'
  if (reason === 'timeout') return '분석이 오래 걸려 멈췄어요. 잠시 후 다시 시도해 주세요.'
  if (reason === 'network' || (typeof navigator !== 'undefined' && !navigator.onLine)) return '인터넷 연결을 확인하고 다시 시도해 주세요.'
  return '리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export interface AiReportPaneProps {
  uid: string
  today: string
  onOpenDay: (dateKey: string) => void
}

export default function AiReportPane({ uid, today, onOpenDay }: AiReportPaneProps) {
  const [info, setInfo] = useState(false)
  const thisWeek = mondayOf(today)
  const [week, setWeek] = useState(() => shiftWeek(thisWeek, -1))
  const isCurrent = week >= thisWeek
  const prevWeek = shiftWeek(week, -1)
  const weekEnd = weekDays(week)[6]

  // 지난주 비교까지 두 주(14일) 기록 한 번에
  const [meals, setMeals] = useState<{ week: string; list: MealWithId[]; fromCache: boolean } | { week: string; error: true } | null>(null)
  const [goals, setGoals] = useState<{ week: string; list: DatedGoal[] } | null>(null)
  const [goal, setGoal] = useState<StoredGoal | null | undefined>(undefined)
  // 공복 표시(2026-10-29 사용자 결정: 리포트·AI에 반영)
  const [fasted, setFasted] = useState<{ week: string; byDate: Record<string, MealType[]> } | null>(null)
  const [report, setReport] = useState<{ week: string; state: ReportState } | null>(null)
  const autoTried = useRef(new Set<string>())

  useEffect(() => {
    if (isCurrent) return
    return subscribeMealsInRange(
      uid,
      prevWeek,
      weekEnd,
      (list, fromCache) => setMeals({ week, list, fromCache }),
      () => setMeals({ week, error: true }),
    )
  }, [uid, week, prevWeek, weekEnd, isCurrent])
  useEffect(() => {
    if (isCurrent) return
    return subscribeGoalsUpTo(
      uid,
      weekEnd,
      (list) => setGoals({ week, list }),
      () => setGoals({ week, list: [] }),
    )
  }, [uid, week, weekEnd, isCurrent])
  useEffect(() => subscribeGoal(uid, setGoal, () => setGoal(null)), [uid])
  useEffect(() => {
    if (isCurrent) return
    return subscribeFastedInRange(uid, prevWeek, weekEnd, (byDate) => setFasted({ week, byDate }))
  }, [uid, week, prevWeek, weekEnd, isCurrent])

  // 저장본 읽기(주마다 한 번)
  useEffect(() => {
    if (isCurrent) return
    let live = true
    setReport({ week, state: { kind: 'loading' } })
    getReport(uid, week).then(
      (saved) => {
        // 만드는 중이면 그 결과를 기다린다(아래 inflight)
        if (live && !inflight.has(`${uid}/${week}`)) setReport({ week, state: saved ? { kind: 'ready', saved } : { kind: 'none' } })
      },
      () => live && setReport({ week, state: { kind: 'error', saved: null, message: '리포트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' } }),
    )
    // 다른 화면에서 만들던 것이 있으면 이어 받는다
    const run = inflight.get(`${uid}/${week}`)
    if (run) {
      setReport({ week, state: { kind: 'generating', saved: null } })
      run.then(
        (saved) => live && setReport({ week, state: { kind: 'ready', saved } }),
        (e: unknown) => live && setReport({ week, state: { kind: 'error', saved: null, message: failMessage(e) } }),
      )
    }
    return () => {
      live = false
    }
  }, [uid, week, isCurrent])

  const mealsNow = meals && meals.week === week ? meals : null
  const goalsNow = goals && goals.week === week ? goals : null
  const fastedNow = fasted && fasted.week === week ? fasted.byDate : null
  const loaded = mealsNow !== null && 'list' in mealsNow && goalsNow !== null && fastedNow !== null
  const stats = useMemo<{ cur: WeekStats; prev: WeekStats; curMeals: MealWithId[] } | null>(() => {
    if (!loaded) return null
    const goalFor = (d: string) => goalForDate(goalsNow.list, d)
    const curMeals = mealsNow.list.filter((m) => m.dateKey >= week)
    const prevMeals = mealsNow.list.filter((m) => m.dateKey < week)
    return { cur: computeWeekStats(week, curMeals, goalFor, fastedNow), prev: computeWeekStats(prevWeek, prevMeals, goalFor, fastedNow), curMeals }
  }, [loaded, mealsNow, goalsNow, fastedNow, week, prevWeek])
  const fromServer = loaded && !mealsNow.fromCache
  const state: ReportState = report && report.week === week ? report.state : { kind: 'loading' }

  function generate(prevSaved: StoredReport | null) {
    if (!stats || goal === undefined) return
    const key = `${uid}/${week}`
    if (inflight.has(key)) return
    const s = stats.cur
    const under18 = goal !== null && goal.input.age < 18
    const forWeek = week
    setReport({ week: forWeek, state: { kind: 'generating', saved: prevSaved } })
    const run = (async () => {
      // 다른 기기에서 다시 만들었을 수 있으니 저장 직전 최신 genCount·createdAt을 다시 읽는다
      const latest = prevSaved ? await getReport(uid, forWeek) : null
      if (latest && latest.genCount >= REPORT_MAX_GEN) return latest
      const r = await generateReportText(s, { under18, meals: stats.curMeals, compare: compareWeeks(s, stats.prev), goal: goal?.targets ?? null })
      const { saved, committed } = saveReport(uid, forWeek, { inputHash: s.inputHash, stats: s, text: r.text, model: r.model, promptVersion: r.promptVersion }, latest)
      committed.catch((e: unknown) => console.warn('[report] 저장 실패', e))
      return saved
    })()
    inflight.set(key, run)
    run.then(
      (saved) => setReport((cur) => (cur && cur.week !== forWeek ? cur : { week: forWeek, state: { kind: 'ready', saved } })),
      (e: unknown) => {
        console.warn('[report] 만들기 실패', e)
        setReport((cur) => (cur && cur.week !== forWeek ? cur : { week: forWeek, state: { kind: 'error', saved: prevSaved, message: failMessage(e) } }))
      },
    )
    void run.finally(() => inflight.delete(key)).catch(() => undefined)
  }

  // 저장본이 없으면 처음 열 때 한 번 자동으로 만든다(서버 기록·목표가 다 온 뒤, 3일 이상일 때만)
  const canAuto = !isCurrent && state.kind === 'none' && fromServer && stats !== null && stats.cur.recordDays >= REPORT_MIN_DAYS && goal !== undefined
  useEffect(() => {
    if (!canAuto || autoTried.current.has(week)) return
    autoTried.current.add(week)
    generate(null)
    // generate는 렌더마다 새로 만들어지지만 최신 값만 쓰면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAuto, week])

  let body: ReactNode
  if (isCurrent) {
    body = <Notice title="이번 주는 일요일이 지나면 분석해 드려요">지난주 리포트는 ‹ 지난주에서 볼 수 있어요</Notice>
  } else if (mealsNow && 'error' in mealsNow) {
    body = <Notice title="기록을 불러오지 못했어요">인터넷 연결을 확인해 주세요</Notice>
  } else if (!stats) {
    body = <Notice title="불러오는 중…" />
  } else if (stats.cur.recordDays < REPORT_MIN_DAYS) {
    body = (
      <Notice title="기록이 더 쌓이면 분석해 드려요">
        한 주에 3일 이상 기록하면 AI가 한 주를 돌아봐 드려요
        <br />
        {`(이 주 기록 ${stats.cur.recordDays}일)`}
      </Notice>
    )
  } else if (state.kind === 'generating' && !state.saved) {
    body = <Analyzing />
  } else if (state.kind === 'error' && !state.saved) {
    body = (
      <Notice title={state.message}>
        <button type="button" className="chipbtn dark" style={{ marginTop: 12 }} onClick={() => generate(null)}>
          다시 시도
        </button>
      </Notice>
    )
  } else if (state.kind === 'loading' || (state.kind === 'none' && !fromServer)) {
    body =
      state.kind === 'none' && typeof navigator !== 'undefined' && !navigator.onLine ? (
        <Notice title="인터넷에 연결되면 분석해 드려요" />
      ) : (
        <Notice title="불러오는 중…" />
      )
  } else {
    const saved = state.kind === 'none' ? null : state.saved
    const changed = saved !== null && fromServer && saved.inputHash !== stats.cur.inputHash
    body = (
      <Report
        stats={stats.cur}
        compare={compareWeeks(stats.cur, stats.prev)}
        prevKinds={stats.prev && stats.prev.recordDays > 0 ? stats.prev.foodKinds : null}
        text={saved?.text ?? null}
        weekStart={week}
        onOpenDay={onOpenDay}
        banner={
          state.kind === 'generating' ? (
            <Analyzing compact />
          ) : state.kind === 'error' ? (
            <Banner text={state.message} action="다시 시도" onAction={() => generate(saved)} />
          ) : changed && saved ? (
            saved.genCount >= REPORT_MAX_GEN ? (
              <Banner text={`${week === shiftWeek(thisWeek, -1) ? '지난주' : '이 주'} 기록이 바뀌었어요`} note="이 주는 더 분석할 수 없어요" />
            ) : (
              // 2026-10-29 사용자 결정: 바뀐 기록을 새로 분석할지 묻고 남은 횟수를 보인다
              <Banner
                text={`${week === shiftWeek(thisWeek, -1) ? '지난주' : '이 주'} 기록이 바뀌었어요. 새로 분석할까요? (남은 횟수 ${REPORT_MAX_GEN - saved.genCount}번)`}
                action="새로 분석하기"
                onAction={() => generate(saved)}
              />
            )
          ) : null
        }
      />
    )
  }

  return (
    <div className="chartcard report">
      <header>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          AI 주간 리포트
          {/* 점수 판정 기준(2026-10-29 사용자 요청): 제목 옆 i → 시트 */}
          <button
            type="button"
            aria-label="점수 기준 보기"
            onClick={() => setInfo(true)}
            style={{ width: 24, height: 24, minHeight: 0, padding: 0, borderRadius: '50%', border: '1.5px solid var(--ink-3)', background: 'transparent', color: 'var(--ink-2)', fontFamily: 'var(--f-num)', fontSize: 13, fontWeight: 700, lineHeight: 1, display: 'inline-grid', placeItems: 'center' }}
          >
            i
          </button>
        </h3>
        <Crown />
      </header>
      <ScoreInfoSheet open={info} onClose={() => setInfo(false)} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 10px' }}>
        <button type="button" className="chipbtn" style={{ background: 'var(--ground)' }} onClick={() => setWeek(prevWeek)}>
          ‹ 지난주
        </button>
        <span className="num" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          {`${md(week)} – ${md(weekEnd)}`}
        </span>
        <button
          type="button"
          className="chipbtn"
          style={{ background: 'var(--ground)', ...(isCurrent ? { opacity: 0.35 } : null) }}
          disabled={isCurrent}
          aria-disabled={isCurrent}
          onClick={() => !isCurrent && setWeek(shiftWeek(week, 1))}
        >
          다음 주 ›
        </button>
      </div>
      {body}
    </div>
  )
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '26px 8px 10px', color: 'var(--ink-2)' }} role="status">
      <b style={{ color: 'var(--ink)', fontFamily: 'var(--f-head)', fontWeight: 400, fontSize: 17 }}>{title}</b>
      {children && <p style={{ margin: '8px 0 0', fontSize: 14 }}>{children}</p>}
    </div>
  )
}

/** 그림 5: 진행 막대(서서히 90%까지) + "한 주를 분석하고 있어요…" */
function Analyzing({ compact = false }: { compact?: boolean }) {
  const [pct, setPct] = useState(8)
  useEffect(() => {
    const t = setInterval(() => setPct((p) => p + (90 - p) * 0.08), 400)
    return () => clearInterval(t)
  }, [])
  const bar = (
    <div className="progress" style={{ margin: '0 auto 12px', maxWidth: 220 }} role="progressbar" aria-label="분석 진행">
      <i style={{ width: `${pct}%`, transition: 'width .4s linear' }} />
    </div>
  )
  if (compact)
    return (
      <div className="callout" style={{ marginTop: 14, textAlign: 'center' }} role="status">
        {bar}
        <b>한 주를 분석하고 있어요…</b>
      </div>
    )
  return (
    <div style={{ textAlign: 'center', padding: '26px 8px 10px', color: 'var(--ink-2)' }} role="status">
      {bar}
      <b style={{ color: 'var(--ink)', fontFamily: 'var(--f-head)', fontWeight: 400, fontSize: 17 }}>한 주를 분석하고 있어요…</b>
    </div>
  )
}

/** 그림 2: 흰 상자 한 줄 + 오른쪽 버튼(또는 안내) */
function Banner({ text, action, note, onAction }: { text: string; action?: string; note?: string; onAction?: () => void }) {
  return (
    <div className="callout" style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 14 }}>{text}</span>
      {action ? (
        <button type="button" className="chipbtn" style={{ background: 'var(--butter)' }} onClick={onAction}>
          {action}
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--ink-3)', textAlign: 'right' }}>{note}</span>
      )}
    </div>
  )
}

const H4 = ({ children }: { children: ReactNode }) => <h4>{children}</h4>
const BOX = { marginTop: 0 } as const

function Report({
  stats,
  compare,
  prevKinds,
  text,
  weekStart,
  onOpenDay,
  banner,
}: {
  stats: WeekStats
  compare: { kcalDiff: number; scoreDiff: number } | null
  /** 지난주 먹은 음식 가짓수(지난주 기록이 없으면 null) */
  prevKinds: number | null
  text: ReportText | null
  weekStart: string
  onOpenDay: (d: string) => void
  banner: ReactNode
}) {
  const period = `${md(weekStart)} – ${md(weekDays(weekStart)[6])}`
  const hasTarget = stats.days.some((d) => d.target !== null)
  const tiles: [string, string][] = [
    ['기록', `${stats.recordDays}일`],
    ['하루 평균', stats.avgKcal === null ? '–' : `${formatKcal(stats.avgKcal)}kcal`],
    ['목표 범위 안', hasTarget ? `${stats.inRangeDays}일` : '–'],
  ]
  const lines = (t: string[] | undefined) => (t ?? []).filter((s) => s.trim().length > 0)
  const plan = text?.dayPlan
  const planRows = plan ? MEAL_TYPES.filter((m) => (plan[m] ?? '').trim().length > 0) : []

  return (
    <>
      <div className="score">
        <div className="big num">
          {stats.score}
          <span>/100</span>
        </div>
        <div>
          <b>{stats.headline}</b>
          <br />
          {/* 점수·한 줄은 앱 계산이라 "AI 분석" 표시는 아래 AI 칸에만(2026-10-29 사용자 결정) */}
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{period}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 14 }}>
        {tiles.map(([l, v]) => (
          <div key={l} style={{ background: 'var(--surface)', borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{l}</div>
            <b className="num" style={{ fontSize: 17 }}>
              {v}
            </b>
          </div>
        ))}
      </div>
      {banner}

      <H4>요일별 칼로리</H4>
      <div className="callout" style={BOX}>
        <WeekBars stats={stats} />
      </div>

      <H4>영양 균형</H4>
      <div className="callout" style={{ ...BOX, display: 'grid', gap: 10 }}>
        {(
          [
            ['carbs', '탄수화물', 'var(--carb)'],
            ['protein', '단백질', 'var(--prot)'],
            ['fat', '지방', 'var(--fat)'],
          ] as const
        ).map(([k, name, color]) => {
          const p = stats.macroPct[k]
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 48px', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>
                <span style={{ color }}>●</span> {name}
              </span>
              <div className="track" aria-hidden="true">
                <i style={{ display: 'block', height: '100%', width: `${Math.min(p ?? 0, 100)}%`, background: color, borderRadius: 99 }} />
              </div>
              <b className="num" style={{ fontSize: 15, textAlign: 'right', color: p !== null && p > RANGE_HIGH * 100 ? 'var(--peach-deep)' : 'var(--ink)' }}>
                {p === null ? '–' : `${p}%`}
              </b>
            </div>
          )
        })}
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>하루 평균 ÷ 목표</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          {(
            [
              ['당류', stats.minorAvg.sugar_g, 'g'],
              ['식이섬유', stats.minorAvg.fiber_g, 'g'],
              ['나트륨', stats.minorAvg.sodium_mg, 'mg'],
            ] as const
          ).map(([l, v, u]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{l}</div>
              <b className="num" style={{ fontSize: 15 }}>
                {v === null ? '–' : `${u === 'mg' ? formatKcal(v) : v}${u}`}
              </b>
            </div>
          ))}
        </div>
      </div>

      <H4>끼니별 비중</H4>
      <div className="callout" style={BOX}>
        <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--line)' }} aria-hidden="true">
          {MEAL_TYPES.map((m) =>
            stats.mealShare[m] > 0 ? <i key={m} style={{ width: `${stats.mealShare[m]}%`, background: SHARE_COLOR[m] }} /> : null,
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', marginTop: 10, textAlign: 'center' }}>
          {MEAL_TYPES.map((m) => (
            <div key={m}>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                <span style={{ color: SHARE_COLOR[m] }}>●</span> {MEAL_TYPE_LABEL[m]}
              </div>
              <b className="num" style={{ fontSize: 15 }}>{`${stats.mealShare[m]}%`}</b>
            </div>
          ))}
        </div>
        {stats.fastCount.breakfast + stats.fastCount.lunch + stats.fastCount.dinner + stats.fastCount.snack > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-2)', textAlign: 'center' }}>
            {'공복 '}
            {MEAL_TYPES.filter((m) => m !== 'snack' || stats.fastCount.snack > 0)
              .map((m) => `${MEAL_TYPE_LABEL[m]} ${stats.fastCount[m]}번`)
              .join(' · ')}
          </div>
        )}
      </div>

      {stats.foodKinds > 0 && (
        <>
          {/* 식단 다양성(2026-10-29 사용자 결정): 한 주에 같은 음식을 자주 먹지 않아 "자주 먹은 음식 TOP 5" 대신 */}
          <H4>식단 다양성</H4>
          <div className="callout" style={{ ...BOX, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14 }}>
              이번 주 먹은 음식 <b className="num" style={{ fontSize: 22 }}>{stats.foodKinds}</b>가지
            </span>
            {prevKinds != null && (
              <span style={{ fontSize: 14, color: stats.foodKinds > prevKinds ? 'var(--lime-deep)' : 'var(--ink-2)' }}>
                {stats.foodKinds === prevKinds
                  ? '지난주와 같아요'
                  : `지난주보다 ${Math.abs(stats.foodKinds - prevKinds)}가지 ${stats.foodKinds > prevKinds ? '많아요' : '적어요'}`}
              </span>
            )}
          </div>
        </>
      )}

      {stats.bestDay && (
        <>
          <H4>가장 좋았던 날 · 아쉬웠던 날</H4>
          <div style={{ display: 'grid', gridTemplateColumns: stats.worstDay ? '1fr 1fr' : '1fr', gap: 8 }}>
            {(
              [
                ['좋았던 날', stats.bestDay, 'var(--lime-deep)'],
                ['아쉬웠던 날', stats.worstDay, 'var(--peach-deep)'],
              ] as const
            ).map(([l, d, c]) =>
              d ? (
                <button
                  key={l}
                  type="button"
                  className="callout"
                  style={{ margin: 0, textAlign: 'left', display: 'grid', gap: 2, width: '100%', color: 'var(--ink)' }}
                  onClick={() => onOpenDay(d.dateKey)}
                >
                  <span style={{ fontSize: 12, color: c }}>{l}</span>
                  <b style={{ fontSize: 16 }}>{dayLabel(d.dateKey, weekStart)} ›</b>
                  <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {`${formatKcal(d.kcal)}kcal`}
                    <br />
                    {`목표의 ${d.pct}%`}
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </>
      )}

      {compare && (
        <>
          <H4>지난주와 비교</H4>
          <div className="callout" style={{ ...BOX, display: 'grid', gridTemplateColumns: '1fr 1fr', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>하루 평균</div>
              <b className="num" style={{ fontSize: 15 }}>
                {compare.kcalDiff === 0 ? '같아요' : `${formatKcal(Math.abs(compare.kcalDiff))}kcal ${compare.kcalDiff > 0 ? '늘었어요' : '줄었어요'}`}
              </b>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>점수</div>
              <b className="num" style={{ fontSize: 15, color: compare.scoreDiff > 0 ? 'var(--lime-deep)' : compare.scoreDiff < 0 ? 'var(--peach-deep)' : 'var(--ink)' }}>
                {compare.scoreDiff === 0 ? '같아요' : `${Math.abs(compare.scoreDiff)}점 ${compare.scoreDiff > 0 ? '올랐어요' : '내렸어요'}`}
              </b>
            </div>
          </div>
        </>
      )}

      {text && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 0', paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div style={{ width: 34, flex: 'none' }}>
              <Mascot size={34} decorative />
            </div>
            <b style={{ fontSize: 15 }}>AI가 본 한 주</b>
            <span className="aitag">AI 분석</span>
          </div>
          {text.summary.trim() && (
            <>
              <H4>한 주 총평</H4>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{text.summary}</p>
            </>
          )}
          {(
            [
              ['잘한 점', lines(text.good)],
              ['아쉬운 점', lines(text.improve)],
              ['다음 주 제안', lines(text.next)],
            ] as const
          ).map(([t, l]) =>
            l.length > 0 ? (
              <div key={t}>
                <H4>{t}</H4>
                <ul style={{ listStyle: 'disc' }}>
                  {l.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {planRows.length > 0 && plan && (
            <>
              <H4>다음 주 하루 식단 예시</H4>
              <div className="callout" style={{ ...BOX, display: 'grid', gap: 8 }}>
                {planRows.map((m) => (
                  <div key={m} style={{ display: 'flex', gap: 10, fontSize: 14 }}>
                    <b style={{ flex: 'none', width: 34, color: 'var(--ink-2)' }}>{MEAL_TYPE_LABEL[m]}</b>
                    <span>{plan[m]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

// 요일별 칼로리 막대: 월간 그래프(MonthPane)와 같은 SVG 값·색 규칙(110% 초과 peach, 아니면 lime, 목표 점선 계단)
const MW = 320
const MH = 150
const L = 34
const R = 8
const PLOT = MH - 34

function WeekBars({ stats }: { stats: WeekStats }) {
  const n = 7
  const bw = (MW - L - R) / n
  const values = stats.days.map((d) => d.kcal)
  const steps = weekGoalSteps(stats.days.map((d) => (d.target !== null && d.target > 0 ? d.target : null)))
  const ticks = axisTicks([...values, ...(steps ?? [])].filter((v): v is number => v !== null), 2000, 3)
  const max = ticks[ticks.length - 1]
  const y = (v: number) => 10 + (1 - v / max) * PLOT
  let goalPath = ''
  if (steps) {
    goalPath = `M${L} ${y(steps[0])}`
    steps.forEach((v, i) => {
      if (i > 0 && v !== steps[i - 1]) goalPath += ` V${y(v)}`
      goalPath += ` H${L + (i + 1) * bw}`
    })
  }
  return (
    <svg viewBox={`0 0 ${MW} ${MH}`} role="img" aria-label="요일별 섭취 칼로리" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={MW - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x="28" y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)">
            {v}
          </text>
        </g>
      ))}
      {steps && <path d={goalPath} fill="none" stroke="var(--ink-3)" strokeDasharray="4 4" />}
      {stats.days.map((d, i) => {
        if (d.kcal === null || !(d.kcal > 0)) return null
        const h = (Math.min(d.kcal, max) / max) * PLOT
        const over = d.target !== null && d.target > 0 && d.kcal > d.target * RANGE_HIGH
        return (
          <g key={d.dateKey}>
            <rect x={L + i * bw + 6} y={10 + PLOT - h} width={bw - 12} height={h} rx="4" fill={over ? 'var(--peach)' : 'var(--lime)'} />
            <text x={L + i * bw + bw / 2} y={10 + PLOT - h - 4} textAnchor="middle" fontSize="9" fill="var(--ink-2)" stroke="var(--surface)" strokeWidth="3" paintOrder="stroke">
              {formatKcal(d.kcal)}
            </text>
          </g>
        )
      })}
      {WEEKDAY.map((w, i) => (
        <text key={w} x={L + i * bw + bw / 2} y={MH - 6} textAnchor="middle" fontSize="11" fill="var(--ink-2)">
          {w}
        </text>
      ))}
    </svg>
  )
}

/** 점수 판정 기준 시트(2026-10-29 사용자 요청). 계산은 analysis/weeklyReport.ts scoreFor·headlineFor와 같다 */
function ScoreInfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const row = (pts: string, title: string, desc: string) => (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <b className="num" style={{ minWidth: 44, fontSize: 18 }}>{pts}</b>
      <span>
        <b style={{ fontFamily: 'var(--f-head)', fontWeight: 400, fontSize: 16 }}>{title}</b>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 2 }}>{desc}</div>
      </span>
    </li>
  )
  return (
    <BottomSheet open={open} onClose={onClose} title="점수는 이렇게 매겨요">
      <p style={{ color: 'var(--ink-2)', margin: '6px 0 10px' }}>그 주(월~일) 기록으로 앱이 계산해요. 100점 만점이에요</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {row('30점', '꾸준히 기록했나요', '7일 모두 기록하면 30점, 기록한 날만큼 나눠 받아요')}
        {row('40점', '칼로리가 목표에 맞았나요', '기록한 날 가운데 목표의 90~110% 안에 든 날의 비율만큼 받아요')}
        {row('30점', '탄·단·지가 고르게 맞았나요', '탄수화물·단백질·지방 하루 평균이 목표와 같으면 각 10점, 50% 넘게 차이 나면 0점이에요')}
      </ul>
      <div className="callout" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>
        <b>80점 이상</b> 균형 잡힌 한 주였어요
        <br />
        <b>60~79점</b> 조금만 더 다듬으면 좋아요
        <br />
        <b>60점 미만</b> 다음 주는 목표에 더 가까이 가 봐요
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '12px 0 0' }}>
        점수·숫자는 기록으로 계산하고, 총평·잘한 점·아쉬운 점·제안·식단 예시는 AI가 써요. 기록이 3일 이상인 주만 분석해요
      </p>
    </BottomSheet>
  )
}
