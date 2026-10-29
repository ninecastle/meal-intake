// 음식 추천(디자인 조각 D12, /recommend, 2026-10-28 사용자 확인 `_workspace/design/mock/d12_AB.png`). 시안 recommend() 마크업·클래스 그대로.
// div.screen > .topbar(‹ "음식 추천" 왕관) → .pad > .leftcard "오늘 남은 양"(칼로리·탄·단·지, 초록 줄 "○○이 가장 많이 남았어요")
// → .segment [아침|점심|저녁|간식](시안에 없음, 사용자 확인 모양: 상자 아래 18px) → h2 "○○으로 이런 건 어때요" → .rec 줄 → [다시 추천 받기].
// 늘 오늘 기준. 남은 양 = 오늘 비교 목표(useDayData: 그날 목표 기록 → 없으면 현재 목표) − 오늘 done 기록 합(summarizeDay). 넘으면 "N 넘었어요"(홈 문구 방식).
// 추천은 analysis/recommend.ts(AI 호출 없음, 식약처 DB). 처음 끼니는 defaultRecMeal(지금 시각, 오늘 기록·먹은 후 기다림·공복 표시 끼니).
// 목표가 없으면 상자 안에 "목표를 정하면 추천해 드려요 ›"(목표 질문 /start), 끼니 고르기·목록은 그리지 않는다(남은 양이 없어 고를 수 없다).
// 홈 식사 띠 [음식 추천]에서 push(state.fromHome). ‹는 홈에서 왔으면 뒤로 가기(보던 위치 그대로), 아니면 홈으로 replace.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { defaultRecMeal, planFocus, recommendRanked, type Amounts, type Macro, type RecItem, type RecPlan } from '../analysis/recommend'
import { useDayData } from '../components/day/useDayData'
import { formatKcal, formatMacro, MEAL_TYPE_LABEL, MEAL_TYPES } from '../components/mealText'
import { Crown, IconButton, MealArt, Segment } from '../components/ui'
import { subscribeFasted } from '../data/fasting'
import { subscribePending, type MealType, type MealWithId } from '../data/meals'

/** 시안 recs[i][4]: 아이콘 바탕 4색 순환 */
const IC_BG = ['var(--lime-soft)', 'var(--sky-soft)', 'var(--peach-soft)', 'var(--butter-soft)']
const MACRO_LABEL: Record<Macro, string> = { carbs: '탄수화물', protein: '단백질', fat: '지방' }
/** 받침이 있으면 "이", 없으면 "가"(탄수화물·단백질·지방 모두 받침 있음 — 그래도 규칙대로) */
const subj = (w: string) => ((w.charCodeAt(w.length - 1) - 0xac00) % 28 ? '이' : '가')
/** "아침으로", "점심으로" … */
const MEAL_TO: Record<MealType, string> = { breakfast: '아침으로', lunch: '점심으로', dinner: '저녁으로', snack: '간식으로' }

type Fetch = { key: string; items: RecItem[] | null; error: boolean }

/** 한 장에 보이는 추천 수 */
const PAGE = 4

/**
 * 추천 4개씩 한 장, 손가락으로 좌우로 밀어 넘긴다(왼쪽으로 밀면 다음, 오른쪽이면 이전). 아래 ‹ "1 / 25" ›.
 * 첫 장에서 ‹는 흐리게, 마지막 장에서 ›는 첫 장으로(2026-10-28 사용자 요청, [다시 추천 받기] 대신 — 실수로 넘겨도 전 장을 다시 본다).
 */
function RecPager({ pages, page, onPage }: { pages: ReactNode[][]; page: number; onPage: (p: number) => void }) {
  const n = pages.length
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const [dx, setDx] = useState(0)
  const go = (p: number) => {
    setDx(0)
    onPage(p < 0 ? 0 : p >= n ? 0 : p)
  }
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <>
      <div
        className="recpager"
        style={{ overflow: 'hidden', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
          e.currentTarget.setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          const s0 = start.current
          if (!s0 || s0.id !== e.pointerId) return
          const x = e.clientX - s0.x
          if (Math.abs(x) > Math.abs(e.clientY - s0.y)) setDx(page === 0 && x > 0 ? x / 3 : x)
        }}
        onPointerUp={() => {
          const x = dx
          start.current = null
          if (x < -50) go(page + 1)
          else if (x > 50 && page > 0) go(page - 1)
          else setDx(0)
        }}
        onPointerCancel={() => {
          start.current = null
          setDx(0)
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            transform: `translateX(calc(${-page * 100}% + ${dx}px))`,
            transition: dx !== 0 || reduce ? 'none' : 'transform .28s ease',
          }}
        >
          {pages.map((pg, k) => (
            <div key={k} style={{ flex: '0 0 100%', minWidth: 0 }} aria-hidden={k !== page || undefined} inert={k !== page || undefined}>
              {pg}
            </div>
          ))}
        </div>
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 14 }}>
          <IconButton icon="back" label="이전 추천" disabled={page === 0} style={{ opacity: page === 0 ? 0.35 : 1 }} onClick={() => go(page - 1)} />
          <span className="num" style={{ color: 'var(--ink-2)', minWidth: 64, textAlign: 'center' }} aria-live="polite">{`${page + 1} / ${n}`}</span>
          <IconButton icon="back" label="다음 추천" style={{ transform: 'scaleX(-1)' }} onClick={() => go(page + 1)} />
        </div>
      )}
    </>
  )
}

/** 남은 양 한 칸(사용자가 고른 변경 22): 위에 이름, 아래에 남은 양. 넘으면 "N 초과"(peach-deep), 0이 되는 작은 초과는 0 */
function LeftItem({ label, left, unit }: { label: string; left: number | null; unit: 'kcal' | 'g' }) {
  const fmt = unit === 'kcal' ? formatKcal : formatMacro
  const over = left !== null && left < 0 ? fmt(-left) : '0'
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{label}</span>
      {left === null ? (
        <b className="num">–</b>
      ) : over !== '0' ? (
        <b className="num" style={{ color: 'var(--peach-deep)', whiteSpace: 'nowrap' }}>{`${over}${unit} 초과`}</b>
      ) : (
        <b className="num" style={{ whiteSpace: 'nowrap' }}>{`${fmt(Math.max(left, 0))}${unit}`}</b>
      )}
    </span>
  )
}

export default function RecommendPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  // ?date가 없으니 늘 오늘
  const { today, summary, targets, loadError } = useDayData(uid)
  const [pending, setPending] = useState<MealWithId[] | null>(null)
  const [fasted, setFastedList] = useState<MealType[] | null>(null)
  const [meal, setMeal] = useState<MealType | null>(null)
  const [page, setPage] = useState(0)
  const [fetched, setFetched] = useState<Fetch | null>(null)
  // 추천 목록 불러오기 실패 뒤 [다시 시도](같은 조건으로 다시 부른다)
  const [retry, setRetry] = useState(0)

  useEffect(() => subscribePending(uid, setPending, () => setPending([])), [uid])
  useEffect(() => subscribeFasted(uid, today, setFastedList, () => setFastedList([])), [uid, today])

  // 처음 끼니: 오늘 기록·이어 할 기록·공복 표시가 모두 들어온 뒤 한 번 정한다
  useEffect(() => {
    if (meal || !summary || pending === null || fasted === null) return
    const done = new Set<MealType>(fasted)
    for (const m of summary.meals) done.add(m.mealType)
    for (const m of pending) if (m.dateKey === today) done.add(m.mealType)
    setMeal(defaultRecMeal(new Date(), done))
  }, [meal, summary, pending, fasted, today])

  const remaining: Amounts | null =
    summary && targets
      ? {
          kcal: targets.target_kcal - summary.totals.kcal,
          carbs_g: targets.carbs_g - summary.totals.carbs_g,
          protein_g: targets.protein_g - summary.totals.protein_g,
          fat_g: targets.fat_g - summary.totals.fat_g,
        }
      : null
  const remKey = remaining ? [remaining.kcal, remaining.carbs_g, remaining.protein_g, remaining.fat_g].map((n) => n.toFixed(1)).join('/') : ''

  // 표시할 영양소·채울 영양소. 계산이 실패하면(모듈 오류) 목록 오류로 안내한다
  const plan = useMemo<{ plan: RecPlan | null; error: boolean }>(() => {
    if (!remaining || !targets) return { plan: null, error: false }
    try {
      return { plan: planFocus(remaining, { kcal: targets.target_kcal, carbs_g: targets.carbs_g, protein_g: targets.protein_g, fat_g: targets.fat_g }), error: false }
    } catch (e) {
      console.warn('[recommend] planFocus 실패', e)
      return { plan: null, error: true }
    }
    // remKey가 remaining 값을 대신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remKey, targets])

  const fetchKey = plan.plan && meal ? `${remKey}|${plan.plan.focus.join(',')}|${plan.plan.light ? 'light' : ''}|${meal}` : ''
  useEffect(() => {
    if (!fetchKey || !remaining || !plan.plan || !meal) return
    let alive = true
    recommendRanked(remaining, plan.plan, meal).then(
      (items) => alive && setFetched({ key: fetchKey, items, error: false }),
      (e: unknown) => {
        console.warn('[recommend] 추천 실패', e)
        if (alive) setFetched({ key: fetchKey, items: null, error: true })
      },
    )
    return () => {
      alive = false
    }
    // fetchKey가 나머지 값을 대신한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, retry])

  function back() {
    if (fromHome) navigate(-1)
    else navigate('/', { replace: true })
  }

  function pickMeal(m: MealType) {
    setMeal(m)
    setPage(0)
  }

  const cur = fetched && fetched.key === fetchKey ? fetched : null
  const lacking = plan.plan?.lacking ?? null
  // 세 영양소 모두 넘었거나 칼로리를 넘었으면: 그 끼니 낮은 칼로리 순, 초록 줄 대신 안내(사용자 결정)
  const light = plan.plan?.light ?? false
  const noGoal = targets === null
  const left = (k: keyof Amounts) => (remaining ? remaining[k] : null)

  let list
  if (loadError) list = <div className="callout">오늘 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div>
  else if (plan.error) list = <div className="callout">추천 음식을 고르지 못했어요. 잠시 후 다시 열어 주세요.</div>
  else if (cur?.error)
    list = (
      <div className="callout">
        추천 음식을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
        <div>
          <button
            type="button"
            className="chipbtn dark"
            style={{ marginTop: 10 }}
            onClick={() => {
              setFetched(null)
              setRetry((n) => n + 1)
            }}
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  else if (!cur || !meal) list = <div className="callout">추천 음식을 고르는 중이에요…</div>
  else if (cur.items!.length === 0) list = <div className="callout">지금 남은 양에 맞는 음식을 찾지 못했어요.</div>
  else {
    const row = (r: RecItem, i: number) => (
      <div className="rec" key={`${r.name}/${i}`}>
        <span className="ic" style={{ background: IC_BG[i % IC_BG.length] }}>
          <MealArt meal={meal} className="mico" style={{ width: 28, height: 28 }} />
        </span>
        <span>
          <b>
            {r.name} <small>{r.portion}</small>
          </b>
          <small>
            {(['carbs', 'protein', 'fat'] as const).map((k, j) => {
              const g = k === 'carbs' ? r.carbs_g : k === 'protein' ? r.protein_g : r.fat_g
              const text = `${'탄단지'[j]} ${formatMacro(g)}g`
              return (
                <span key={k}>
                  {j > 0 && ' · '}
                  {k === lacking ? <span style={{ color: 'var(--lime-deep)' }}>{text}</span> : text}
                </span>
              )
            })}
          </small>
        </span>
        <span className="num">{`${formatKcal(r.kcal)}kcal`}</span>
      </div>
    )
    const items = cur.items!
    const pages = Array.from({ length: Math.ceil(items.length / PAGE) }, (_, k) => items.slice(k * PAGE, k * PAGE + PAGE))
    list = <RecPager pages={pages.map((pg) => pg.map(row))} page={Math.min(page, pages.length - 1)} onPage={setPage} />
  }

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={back} />
        </div>
        <h1>음식 추천</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}>
          <Crown />
        </div>
      </div>
      <div className="pad" style={{ paddingBottom: 24 }}>
        <div className="leftcard">
          <b>오늘 남은 양</b>
          {noGoal ? (
            <Link to="/start" state={{ from: 'recommend' }} style={{ display: 'block' }}>
              목표를 정하면 추천해 드려요 ›
            </Link>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                <LeftItem label="칼로리" left={left('kcal')} unit="kcal" />
                <LeftItem label="탄수화물" left={left('carbs_g')} unit="g" />
                <LeftItem label="단백질" left={left('protein_g')} unit="g" />
                <LeftItem label="지방" left={left('fat_g')} unit="g" />
              </div>
              {light ? (
                <span style={{ fontSize: 14, color: 'var(--lime-deep)', fontWeight: 700 }}>오늘 목표를 다 채웠어요. 가볍게 먹을 만한 걸 골랐어요</span>
              ) : lacking && (
                <span style={{ fontSize: 14, color: 'var(--lime-deep)', fontWeight: 700 }}>
                  {`${MACRO_LABEL[lacking]}${subj(MACRO_LABEL[lacking])} 가장 많이 남았어요`}
                </span>
              )}
            </>
          )}
        </div>
        {!noGoal && (
          <>
            <Segment
              label="끼니"
              className="mt-[18px]"
              items={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_TYPE_LABEL[m] }))}
              value={meal ?? ('' as MealType)}
              onChange={pickMeal}
            />
            {meal && <h2 style={{ fontSize: 17, margin: '24px 0 4px' }}>{`${MEAL_TO[meal]} 이런 건 어때요`}</h2>}
            {list}
          </>
        )}
      </div>
    </main>
  )
}
