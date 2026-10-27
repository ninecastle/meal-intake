// 영양소 상세(디자인 조각 D5, /detail?date=YYYY-MM-DD). 시안 detail() 마크업·클래스·문구 그대로, 숫자만 실제 데이터(그날 done 기록 합).
// div.screen > .topbar.sticky(‹ 영양소 상세) → section.band.sky(날짜, .donut 탄·단·지 에너지 비율·kcal, .mgrams g·%)
// → .pad > .segment [영양정보|먹은 음식] → 영양정보: 공용 NutrientTable(세부 아홉 가지, 사용자 결정) /
//   먹은 음식: .rank 네 개(탄수화물·단백질·지방 = 그날 목표 대비, 당류 = 권장 목표 kcal × 0.20 ÷ 4 g, 2026-10-27 사용자 결정) —
//   상태(부족해요 <50% / 적당해요 ≤110% / 많아요), 막대, 많이 먹은 음식 3개(더 보기 ▾로 전부). 목표가 없으면 상태 "목표 없음"·"목표 –".
// 홈에서 push(state.fromHome)로 들어오면 ‹는 뒤로 가기.
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { shortDateLabel, useDayData } from '../components/day/useDayData'
import { homeHref, macroPct } from '../components/mealText'
import { NutrientTable } from '../components/nutrition/NutrientTable'
import { IconButton } from '../components/ui'
import { foodName } from '../lib/foodName'
import type { MealItem } from '../types/analysis'

type RankKey = 'carbs_g' | 'protein_g' | 'fat_g' | 'sugar_g'
const r1 = (n: number) => Math.round(n * 10) / 10

/** 음식 하나가 그 영양소를 먹은 양(g). 당류는 세부 영양소(detail_consumed), 없으면 null */
function amountOf(it: MealItem, k: RankKey): number | null {
  if (k === 'sugar_g') return it.detail_consumed?.sugar_g ?? null
  return it.consumed?.[k] ?? null
}

function Rank(props: { label: string; k: RankKey; value: number; goal: number | null; foods: { name: string; v: number }[] }) {
  const { label, k, value, goal, foods } = props
  const [more, setMore] = useState(false)
  const ratio = goal ? value / goal : null
  const st = ratio == null ? ['목표 없음', ''] : ratio < 0.5 ? ['부족해요', ''] : ratio <= 1.1 ? ['적당해요', 'ok'] : ['많아요', 'hi']
  const sorted = [...foods].sort((a, b) => b.v - a.v).filter((f) => f.v > 0)
  const shown = more ? sorted : sorted.slice(0, 3)
  return (
    <section className="rank">
      <header>
        <h3>{label}</h3>
        <span className={st[1] ? `state ${st[1]}` : 'state'}>{st[0]}</span>
      </header>
      <div className="track">
        <div className="fill" style={{ width: `${Math.min((ratio ?? 0) * 100, 100)}%`, background: k === 'sugar_g' ? 'var(--peach)' : 'var(--sky-deep)' }}></div>
      </div>
      <div className="meta">
        <span>
          <b className="num">{`${r1(value)}g`}</b> 먹었어요
        </span>
        <span style={{ color: 'var(--ink-3)' }}>
          {k === 'sugar_g' ? '권장 ' : '목표 '}
          <span className="num">{goal ? `${goal}g` : '–'}</span>
        </span>
      </div>
      <ol>
        {(more ? shown : [0, 1, 2].map((i) => shown[i])).map((f, i) =>
          f ? (
            <li key={`${f.name}-${i}`}>
              <span className="n num">{i + 1}</span>
              <span>{f.name}</span>
              <span className="v num">
                {`${r1(f.v)}g`}
                <small>1회</small>
              </span>
            </li>
          ) : (
            <li key={`empty-${i}`}>
              <span className="n num">{i + 1}</span>
              <span style={{ color: 'var(--ink-3)' }}>-</span>
            </li>
          ),
        )}
      </ol>
      {sorted.length > 3 && (
        <button type="button" className="more" onClick={() => setMore((m) => !m)}>
          {more ? '접기 ▴' : '더 보기 ▾'}
        </button>
      )}
    </section>
  )
}

export default function NutritionDetailPage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const { dateKey, today, meals, summary, targets } = useDayData(uid)
  const [tab, setTab] = useState<'info' | 'food'>('info')

  function back() {
    if (fromHome) navigate(-1)
    else navigate(homeHref(dateKey, today), { replace: true })
  }

  const t = summary?.totals ?? { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
  const p = macroPct(t.carbs_g, t.protein_g, t.fat_g)
  // 시안 donut: 반지름 78, 굵기 30, 조각 사이 5 띄움
  const DR = 78
  const DL = 2 * Math.PI * DR
  let off = 0
  const seg = (v: number, col: string) => {
    const len = Math.max((DL * v) / 100 - 5, 0)
    const el = <circle key={col} cx="105" cy="105" r={DR} fill="none" stroke={col} strokeWidth="30" strokeDasharray={`${len} ${DL}`} strokeDashoffset={-off} />
    off += (DL * v) / 100
    return el
  }
  const dot = (c: string) => <span className="dot" style={{ background: c, display: 'inline-block', marginRight: 6 }}></span>
  const items = (meals ?? []).flatMap((m) => m.analysis?.items ?? [])
  const foodsFor = (k: RankKey) =>
    items.flatMap((it) => {
      const v = amountOf(it, k)
      return v == null ? [] : [{ name: foodName(it.name), v }]
    })
  const sugarValue = summary?.detail.totals.sugar_g?.value ?? 0
  // 당류 권장 = 목표 kcal의 20%를 g으로(÷ 4), 2026-10-27 사용자 결정
  const sugarGoal = targets ? Math.round((targets.target_kcal * 0.2) / 4) : null

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={back} />
        </div>
        <h1>영양소 상세</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <section className="band sky">
        <div className="pad">
          <div style={{ textAlign: 'center', fontWeight: 700 }} className="num">
            {shortDateLabel(dateKey)}
          </div>
          <div className="donut" role="img" aria-label={`탄수화물 ${p.c}% 단백질 ${p.p}% 지방 ${p.f}%`}>
            <svg viewBox="0 0 210 210" aria-hidden="true">
              <circle cx="105" cy="105" r={DR} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="30" />
              {t.kcal > 0 && [seg(p.c, 'var(--carb)'), seg(p.p, 'var(--prot)'), seg(p.f, 'var(--fat)')]}
            </svg>
            <div className="dc">
              <span className="num">{Math.round(t.kcal)}</span>
              <span>kcal</span>
            </div>
          </div>
          <div className="mgrams">
            <div>
              {dot('var(--carb)')}탄수화물<div className="num">{`${r1(t.carbs_g)}g`}</div>
              <small>{`${p.c}%`}</small>
            </div>
            <div>
              {dot('var(--prot)')}단백질<div className="num">{`${r1(t.protein_g)}g`}</div>
              <small>{`${p.p}%`}</small>
            </div>
            <div>
              {dot('var(--fat)')}지방<div className="num">{`${r1(t.fat_g)}g`}</div>
              <small>{`${p.f}%`}</small>
            </div>
          </div>
        </div>
      </section>
      <div className="pad" style={{ paddingTop: 22 }}>
        <div className="segment" role="tablist" style={{ maxWidth: 320, margin: '0 auto 10px' }}>
          <button type="button" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')}>
            영양정보
          </button>
          <button type="button" role="tab" aria-selected={tab === 'food'} onClick={() => setTab('food')}>
            먹은 음식
          </button>
        </div>
        {summary &&
          (tab === 'info' ? (
            <NutrientTable t={t} detail={summary.detail} />
          ) : (
            <>
              <Rank label="탄수화물" k="carbs_g" value={t.carbs_g} goal={targets?.carbs_g ?? null} foods={foodsFor('carbs_g')} />
              <Rank label="단백질" k="protein_g" value={t.protein_g} goal={targets?.protein_g ?? null} foods={foodsFor('protein_g')} />
              <Rank label="지방" k="fat_g" value={t.fat_g} goal={targets?.fat_g ?? null} foods={foodsFor('fat_g')} />
              <Rank label="당류" k="sugar_g" value={sugarValue} goal={sugarGoal} foods={foodsFor('sugar_g')} />
            </>
          ))}
      </div>
    </main>
  )
}
