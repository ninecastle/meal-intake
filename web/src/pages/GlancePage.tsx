// 한눈에(디자인 조각 D5, /glance?date=YYYY-MM-DD). 시안 glance() 마크업·클래스·문구 그대로, 숫자만 실제 데이터(그날 done 기록 합).
// div.screen > .topbar.sticky(‹ "10.27 (화)") → .pad > .tabs [오늘 하루|오늘 식단]
// → 오늘 하루: .gcard(마스코트, "N kcal 먹었어요", .badges 탄·단·지 %, .subline 당류·식이섬유, .gmeals 끼니 4개 kcal)
// → 오늘 식단: 끼니마다 .tmeal(.thead 이름·kcal·큰 그림, .tcard 끼니 색 — 탄단지 g 배지·음식 이름과 먹은 양 g, 없으면 .tempty)
// → .bottom [오늘 하루 공유하기]·[오늘 식단 공유하기](그 카드·목록을 PNG로, lib/share). 세부 영양소가 없으면 "–"(가짜 숫자 금지).
// 지난 날짜면 탭·버튼의 "오늘"을 "이날"로. 홈에서 push(state.fromHome)로 들어오면 ‹는 뒤로 가기(보던 위치 그대로).
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { shortDateLabel, useDayData } from '../components/day/useDayData'
import { formatDetail, homeHref, macroPct, MEAL_TYPE_LABEL, MEAL_TYPES } from '../components/mealText'
import { IconButton, Mascot, MealArt, Toast } from '../components/ui'
import type { MealType } from '../data/meals'
import { foodName } from '../lib/foodName'
import { shareElementImage } from '../lib/share'

/** 시안 meals[k].card(끼니 색) */
const CARD_BG: Record<MealType, string> = { breakfast: 'var(--sky)', lunch: 'var(--lime)', dinner: 'var(--peach)', snack: 'var(--butter)' }
const r1 = (n: number) => Math.round(n * 10) / 10

/** 시안 tempty 말풍선 얼굴 */
const SMILE = (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 4c9 0 16 6.5 16 15s-7 15-16 15c-2 0-4-.3-5.8-1L6 36l2-7.5C5.5 26 4 22.7 4 19 4 10.5 11 4 20 4z" fill="currentColor" opacity=".35" />
    <circle cx="15" cy="17" r="1.8" fill="currentColor" />
    <circle cx="25" cy="17" r="1.8" fill="currentColor" />
    <path d="M15.5 22.5q4.5 3.5 9 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
)

export default function GlancePage({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: unknown } | null)?.fromHome === true
  const { dateKey, today, meals, summary } = useDayData(uid)
  const [tab, setTab] = useState<'day' | 'meal'>('day')
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null)
  const [sharing, setSharing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const word = dateKey === today ? '오늘' : '이날'

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600) // 시안 toast() 1.6초
    return () => window.clearTimeout(t)
  }, [toast])

  function back() {
    if (fromHome) navigate(-1)
    else navigate(homeHref(dateKey, today), { replace: true })
  }

  async function share() {
    const el = tab === 'day' ? cardRef.current : listRef.current
    if (!el || sharing) return
    setSharing(true)
    try {
      const r = await shareElementImage(el, `${dateKey}-${tab === 'day' ? 'day' : 'meals'}.png`, `${word} ${tab === 'day' ? '하루' : '식단'}`)
      if (r === 'saved') setToast({ text: '이미지로 저장했어요', at: Date.now() })
    } catch (e) {
      console.warn('[glance] 공유 이미지 실패', e)
      setToast({ text: '이미지를 만들지 못했어요', at: Date.now() })
    } finally {
      setSharing(false)
    }
  }

  const t = summary?.totals ?? { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
  const p = macroPct(t.carbs_g, t.protein_g, t.fat_g)
  const detail = summary?.detail.totals ?? {}
  const itemsOf = (meal: MealType) =>
    (meals ?? [])
      .filter((m) => m.mealType === meal && m.analysis)
      .flatMap((m) => m.analysis!.items.map((it) => ({ key: `${m.id}/${it.id}`, name: foodName(it.name), grams: Math.round(it.consumed_grams) })))

  const day = (
    <div className="gcard" ref={cardRef}>
      <Mascot />
      <div className="kc">
        <span className="num">{Math.round(t.kcal)}</span>kcal 먹었어요
      </div>
      <div className="badges">
        <span className="badge">
          <i style={{ color: 'var(--carb)' }}>탄</i>
          <span className="num">{`${p.c}%`}</span>
        </span>
        <span className="badge">
          <i style={{ color: 'var(--prot)' }}>단</i>
          <span className="num">{`${p.p}%`}</span>
        </span>
        <span className="badge">
          <i style={{ color: 'var(--fat)' }}>지</i>
          <span className="num">{`${p.f}%`}</span>
        </span>
      </div>
      <div className="subline">
        {'당류 '}
        <b className="num">{detail.sugar_g ? formatDetail('sugar_g', detail.sugar_g.value) : '–'}</b>
        {' · 식이섬유 '}
        <b className="num">{detail.fiber_g ? formatDetail('fiber_g', detail.fiber_g.value) : '–'}</b>
      </div>
      <div className="gmeals">
        {MEAL_TYPES.map((meal) => (
          <div key={meal} className="gmeal">
            <span className="ic">
              <MealArt meal={meal} className="mico" />
            </span>
            <span>
              <b>{MEAL_TYPE_LABEL[meal]}</b>
              <span className="num">{`${Math.round(summary?.byMealType[meal].kcal ?? 0)}kcal`}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  const list = (
    <div ref={listRef}>
      {MEAL_TYPES.map((meal) => {
        const mt = summary?.byMealType[meal] ?? { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0, count: 0 }
        const items = itemsOf(meal)
        return (
          <div key={meal} className="tmeal">
            <div className="thead">
              <div>
                <h3>{MEAL_TYPE_LABEL[meal]}</h3>
                <span className="num tk">{`${Math.round(mt.kcal)}kcal`}</span>
              </div>
              <MealArt meal={meal} className="mico" size={112} style={{ width: 112, height: 112 }} />
            </div>
            <div className="tcard" style={{ background: CARD_BG[meal] }}>
              {items.length > 0 ? (
                <>
                  <div className="badges">
                    <span className="badge">
                      <i style={{ color: 'var(--carb)' }}>탄</i>
                      <span className="num">{`${r1(mt.carbs_g)}g`}</span>
                    </span>
                    <span className="badge">
                      <i style={{ color: 'var(--prot)' }}>단</i>
                      <span className="num">{`${r1(mt.protein_g)}g`}</span>
                    </span>
                    <span className="badge">
                      <i style={{ color: 'var(--fat)' }}>지</i>
                      <span className="num">{`${r1(mt.fat_g)}g`}</span>
                    </span>
                  </div>
                  <ul className="tfoods">
                    {items.map((it) => (
                      <li key={it.key}>
                        <span>{it.name}</span>
                        <span className="num">{`${it.grams}g`}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="tempty">
                  {SMILE}아직 기록이 없어요
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={back} />
        </div>
        <h1>{shortDateLabel(dateKey)}</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad">
        <div className="tabs" role="tablist">
          <button type="button" className="tab" role="tab" aria-selected={tab === 'day'} onClick={() => setTab('day')}>
            {`${word} 하루`}
          </button>
          <button type="button" className="tab" role="tab" aria-selected={tab === 'meal'} onClick={() => setTab('meal')}>
            {`${word} 식단`}
          </button>
        </div>
        {meals === null ? null : tab === 'day' ? day : list}
      </div>
      <div className="bottom">
        <div className="inner pad">
          <button type="button" className="btn ink" onClick={() => void share()} disabled={sharing || meals === null}>
            {`${word} ${tab === 'day' ? '하루' : '식단'} 공유하기`}
          </button>
        </div>
      </div>
      <Toast message={toast?.text ?? null} />
    </main>
  )
}
