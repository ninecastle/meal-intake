// 끼니 화면(디자인 조각 D3, /day/:dateKey/:mealType). 시안 meal() 마크업·클래스·인라인 style·문구 그대로, 숫자만 실제 데이터.
// div.screen > .mealhero(.topbar 닫기·제목 "점심 N", .art 큰 끼니 그림, .cam → 식사 기록 시트) → .sheetbody.pad(.mtotal 총 kcal·[시간 입력]·[자세히],
// .stack·.legend 탄단지, .foods) → .bottom .inner([음식 추가]·[수정 완료]).
// 사용자가 고른 변경(시안과 다르게, 2026-10-27): 먹은 시간은 .timebox 줄 대신 [시간 입력] 칩 글자("10:47"), 음식 이름은 foodName(DB 표기 정리),
// 탄단지 막대 안쪽 끝은 거의 수직(index.css .stack). 같은 사진(같은 기록)에서 나온 음식은 한 묶음: 묶음마다 왼쪽 4px 세로 줄
// (끝난 기록은 그 끼니 카드 색, 먹은 후 사진·결과 확인을 기다리는 묶음은 ink-3 회색), 묶음 사이 14px(사용자 선택 C, 모양 _workspace/design/mock/d3_group_C.png).
// 기다리는 묶음은 묶음 전체가 한 버튼(먹은 후 시트 또는 결과 화면), 끝난 묶음은 음식 줄마다 수정 화면.
// 데이터(AI 호출 없음): subscribeMealsFor(그 날짜·끼니 모든 상태 기록), subscribeMealTimes(하루 문서 mealTimes). 합계는 done 기록만(클라이언트).
// 사용자 결정(2026-10-27, CLAUDE.md 디자인 기준 "끼니 화면"):
// - 모든 기록의 음식을 한 목록으로. done 음식 줄: 먹은 양 kcal·출처 배지·설명 줄(먹기 전 무게·남긴 비율·인원), 누르면 그 기록 수정 화면,
//   X는 확인 뒤 그 음식만 빼고 바로 저장(마지막 음식이면 기록 삭제).
// - 먹은 후 사진 기다림(awaiting_after) 음식: 설명 줄 "먹은 후 사진 기다림"·kcal "–"·X 없음, 누르면 "남은 음식을 알려 주세요" 시트.
//   결과 확인 기다림(needs_review)도 X 없이 "결과 확인 기다림"·"–", 누르면 결과 화면.
// - 촬영·분석은 이 화면이 맡는다(useBeforeFlow·useAfterFlow, 카메라는 useCaptureSource 하나). 먹기 전 분석이 끝나면 이 화면에 머문다.
// - [수정 완료]·닫기는 홈(그 날짜)으로. [수정 완료]는 "저장했어요" 토스트(바뀐 내용은 이미 바로 저장됨).
// 들어오는 state: { fromHome?: true(홈에서 push → 나갈 때 뒤로), openAfter?: 기록 id(그 시트를 바로 연다), openRecord?: true(식사 기록 시트) }.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Navigate, useBlocker, useLocation, useNavigate, useParams } from 'react-router'
import { buildAnalysis } from '../analysis/compute'
import { useCaptureSource } from '../components/capture/useCaptureSource'
import {
  AfterNotices,
  AfterSheet,
  MealInfoSheet,
  RatioSheet,
  RecordSheet,
  TimeSheet,
  type MealTotals,
} from '../components/meal/MealSheets'
import { afterTarget, useAfterFlow, type MealReturn, type ReviewEntry } from '../components/meal/useAfterFlow'
import { useBeforeFlow } from '../components/meal/useBeforeFlow'
import { useKeepPhotosAsk } from '../components/meal/KeepPhotosAsk'
import { useSchoolMealAsk } from '../components/meal/SchoolMealAsk'
import { markSchoolMeal } from '../lib/neis'
import { formatGrams, homeHref, isDateKey, countLabel, countOf, isNominalUnit, macroPct, MEAL_TYPE_LABEL, MEAL_TYPES, sourceBadgeStyle, sourceLabel } from '../components/mealText'
import { foodName, isAllLeft, representativeFood } from '../lib/foodName'
import { askConfirm, IconButton, MealArt, Toast } from '../components/ui'
import { deleteMeal, saveMeal, subscribeMealsFor, type MealType, type MealWithId } from '../data/meals'
import { sumDetail } from '../data/summary'
import { setMealTime, subscribeMealTimes, toHm, type MealTimes } from '../data/mealTimes'
import { clearFlash, peekFlash, setFlash } from '../lib/flash'
import { toDateKey } from '../lib/time'
import {
  allPendingEdits,
  clearPendingEdits,
  dropPendingEdit,
  getPendingEdit,
  pendingEditsVersion,
  setPendingEdit,
  subscribePendingEdits,
} from '../lib/pendingEdits'
import type { MealItem } from '../types/analysis'

/** 시안 meals[k].card(홈 끼니 카드 색). 끝난 기록 묶음의 왼쪽 세로 줄 색 */
const GROUP_LINE: Record<MealType, string> = {
  breakfast: 'var(--sky)',
  lunch: 'var(--lime)',
  dinner: 'var(--peach)',
  snack: 'var(--butter)',
}

/** 시안 meals[k].color(끼니 화면 위쪽 바탕) */
const HERO_BG: Record<MealType, string> = {
  breakfast: 'var(--sky-soft)',
  lunch: 'var(--lime-soft)',
  dinner: 'var(--peach-soft)',
  snack: 'var(--butter-soft)',
}

type Sheet = null | 'record' | 'time' | 'mealinfo' | 'after' | 'ratio'

type Row = {
  key: string
  name: string
  src: string | null
  srcStyle?: { background: string; color: string }
  desc: string
  kcal: number | null
  /** 끝난 기록의 음식 줄만(수정 화면). 기다리는 묶음은 묶음 전체가 누르기를 받는다 */
  onOpen?: () => void
  onDelete?: () => void
}

/** 같은 기록(같은 사진)에서 나온 음식 묶음 */
type Group = { key: string; done: boolean; rows: Row[]; onOpen?: () => void; label?: string }

/** div를 버튼처럼(Enter·Space). 안쪽 X 버튼의 키 입력은 그 버튼이 받는다 */
function pressable(onPress: () => void, label?: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onPress,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        onPress()
      }
    },
  } as const
}

type EntryState = { fromHome?: unknown; openAfter?: unknown; openRecord?: unknown }

const r1 = (n: number) => Math.round(n * 10) / 10
/** [수정 완료] 저장 거부를 기다리는 최대 시간(오프라인이면 끝나지 않으므로 그 뒤에는 나간다) */
const FINISH_WAIT_MS = 1500

/** 시안 .fs 설명 줄의 실제 값: 먹기 전 무게 · 남긴 비율(있을 때) · 같이 먹은 인원(2명 이상일 때) · 수정됨 */
function describeItem(it: MealItem, edited: boolean): string {
  // 1개 중량을 쓰는 음식(프랜차이즈 메뉴·1인분)은 개수·단위 먼저: "1개 · 223g · 다 먹음"(2026-10-29 사용자 결정)
  const cnt = countOf(it)
  const grams = `${it.grams_basis === 'typical' ? '약 ' : ''}${formatGrams(it.before_grams)}g` // 치킨 조사표 1마리 무게는 "약"
  const parts = cnt ? [countLabel(cnt.count, cnt.unit), ...(isNominalUnit(it) ? [] : [grams])] : [`${formatGrams(it.before_grams)}g`]
  const left = it.remaining_ratio ?? 0
  if (left > 0) parts.push(`${Math.round(left * 100)}% 남김`)
  else if (cnt) parts.push('다 먹음')
  if (it.eaters > 1) parts.push(`${it.eaters}명이 나눠 먹음`)
  if (edited) parts.push('수정됨')
  return parts.join(' · ')
}


export default function MealPage({ uid }: { uid: string }) {
  const { dateKey = '', mealType = '' } = useParams()
  // 들어온 때의 오늘(렌더마다 시계를 읽지 않는다)
  const [today] = useState(() => toDateKey(new Date()))
  const meal = (MEAL_TYPES as readonly string[]).includes(mealType) ? (mealType as MealType) : null
  if (!isDateKey(dateKey) || dateKey > today || !meal) return <Navigate to="/" replace />
  return <MealScreen key={`${dateKey}/${meal}`} uid={uid} dateKey={dateKey} meal={meal} today={today} />
}

function MealScreen({ uid, dateKey, meal, today }: { uid: string; dateKey: string; meal: MealType; today: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const entry = useRef(location.state as EntryState | null)
  const fromHome = entry.current?.fromHome === true
  const [meals, setMeals] = useState<MealWithId[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [times, setTimes] = useState<MealTimes>({})
  const [sheet, setSheet] = useState<Sheet>(() => (entry.current?.openRecord === true ? 'record' : null))
  const [afterId, setAfterId] = useState<string | null>(() =>
    typeof entry.current?.openAfter === 'string' ? entry.current.openAfter : null,
  )
  // 어느 흐름이 카메라·앨범 사진을 받을지(카메라 화면은 방문 기록 한 칸이라 useCaptureSource는 하나만 둔다)
  const [target, setTarget] = useState<'before' | 'after'>('before')
  const [toast, setToast] = useState<{ text: string; at: number } | null>(() =>
    peekFlash('meal:saved') ? { text: '저장했어요', at: Date.now() } : null,
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const finishing = useRef(false)

  useEffect(() => clearFlash('meal:saved'), [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600) // 시안 toast() 1.6초
    return () => window.clearTimeout(t)
  }, [toast])
  const showToast = (text: string) => setToast({ text, at: Date.now() })

  useEffect(
    () =>
      subscribeMealsFor(
        uid,
        dateKey,
        meal,
        (list) => {
          setMeals(list)
          setLoadError(false)
        },
        () => setLoadError(true),
      ),
    [uid, dateKey, meal],
  )
  useEffect(() => subscribeMealTimes(uid, dateKey, setTimes), [uid, dateKey])

  // 음식을 눌러 고친 내용(수정 화면 [확인], 2026-10-28 사용자 결정)은 [수정 완료] 때 저장한다. 그 전에는 저장한 기록 위에 덮어 보인다
  // (날짜·끼니를 바꿨으면 이 화면에서 빠진다). [수정 완료] 없이 다른 화면으로 나가면 물어보고 버린다(수정·결과 화면으로 가는 것은 제외).
  const pendingVer = useSyncExternalStore(subscribePendingEdits, pendingEditsVersion)
  const view = useMemo(() => {
    void pendingVer
    if (!meals) return null
    return meals.flatMap((m): MealWithId[] => {
      const p = getPendingEdit(m.id)
      if (!p) return [m]
      if (p.dateKey !== dateKey || p.mealType !== meal) return []
      return [{ ...m, ...p, editedAt: m.editedAt ?? (new Date() as unknown as MealWithId['editedAt']) }]
    })
  }, [meals, pendingVer, dateKey, meal])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      allPendingEdits().length > 0 && currentLocation.pathname !== nextLocation.pathname && !nextLocation.pathname.startsWith('/meal/'),
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void askConfirm({ title: '저장하지 않고 나갈까요?', body: '고친 내용은 사라져요.', ok: '나가기' }).then((ok) => {
      if (ok) {
        clearPendingEdits()
        blocker.proceed()
      } else blocker.reset()
    })
  }, [blocker])

  /** [수정 완료]: 고친 내용이 있으면 저장하고 "저장했어요", 없으면 그냥 홈(보던 위치)으로.
   *  오프라인이면 쓰기가 끝나지 않으므로 FINISH_WAIT_MS까지만 기다린다(쓰기는 기기에 남아 연결되면 올라간다).
   *  그 안에 거부(검사·보안 규칙)되면 나가지 않고 그 기록의 고친 내용을 남긴 채 안내한다. */
  async function finish() {
    if (finishing.current) return
    finishing.current = true
    const edits = allPendingEdits()
    const jobs = edits.map(([id, e]) => {
      // 수정 화면에서 음식을 지워 다 남긴 음식만 남았으면 기록째(사진도) 지운다(사용자 결정, X와 같은 규칙)
      const savedCount = meals?.find((x) => x.id === id)?.analysis?.items.length ?? 0
      const job =
        e.analysis.items.length < savedCount && e.analysis.items.every(isAllLeft) ? deleteMeal(uid, id) : saveMeal(uid, id, e)
      return job.then(
        () => {
          dropPendingEdit(id)
          return true
        },
        (err: unknown) => {
          console.warn('[meal] 수정 저장 실패', err)
          return false
        },
      )
    })
    const failed = await Promise.race([
      Promise.all(jobs).then((r) => r.includes(false)),
      new Promise<false>((r) => window.setTimeout(() => r(false), FINISH_WAIT_MS)),
    ])
    if (failed) {
      finishing.current = false
      setActionError('고친 내용을 저장하지 못했어요. 값을 확인하고 다시 [수정 완료]를 눌러 주세요.')
      showToast('저장하지 못했어요')
      window.scrollTo(0, 0)
      return
    }
    clearPendingEdits()
    leave(edits.length > 0)
  }

  // 들어올 때 받은 시트 열기 요청은 한 번만 쓴다(새로고침 때 다시 열리지 않게 state를 비운다)
  useEffect(() => {
    const s = entry.current
    if (s?.openAfter !== undefined || s?.openRecord !== undefined) {
      navigate(location.pathname, { replace: true, state: fromHome ? { fromHome: true } : null })
    }
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const afterMeal = afterId && meals ? (meals.find((m) => m.id === afterId) ?? null) : null
  const target_ = afterMeal ? afterTarget(afterMeal) : null
  // openAfter로 들어왔는데 그 기록이 이미 다음 단계면(다른 기기 등) 시트를 열지 않는다
  useEffect(() => {
    if (!meals || !afterId) return
    if (!meals.some((m) => m.id === afterId && m.status === 'awaiting_after')) {
      setAfterId(null)
      setSheet((s) => (s === 'after' || s === 'ratio' ? null : s))
    } else if (entry.current?.openAfter === afterId) {
      entry.current = { fromHome: entry.current.fromHome }
      setTarget('after')
      setSheet('after')
    }
  }, [meals, afterId])

  function leave(saved: boolean) {
    if (saved) setFlash('meal:saved')
    if (fromHome) navigate(-1)
    else navigate(homeHref(dateKey, today), { replace: true })
  }

  function goReview(mealId: string, e: ReviewEntry) {
    navigate(`/meal/${mealId}/review`, { replace: true, state: { ...e, ...backToMeal() } })
  }
  // 학교 급식(D13): 식사 기록 시트 맨 위 질문. 불러온 급식은 그 기록(먹기 전 분석·직접 입력)에 쓴다
  const schoolAsk = useSchoolMealAsk(uid, dateKey, meal, sheet === 'record')
  const goManual = () => {
    const schoolMeal = schoolAsk.take()
    navigate(`/meal/new/review?date=${dateKey}&meal=${meal}`, { replace: true, state: { ...backToMeal(), ...(schoolMeal ? { schoolMeal } : {}) } })
  }
  /** 결과 화면이 끝나면 이 끼니 화면으로, 보던 위치 그대로 돌아오게(2026-10-28 사용자 요청) */
  function backToMeal(): MealReturn {
    return { mealReturn: { dateKey, mealType: meal, fromHome, scrollY: window.scrollY } }
  }

  // 식사 사진 보관(D9): 처음 사진 버튼을 누를 때 묻고, 켜져 있으면 흐름이 썸네일을 저장한다
  const keepAsk = useKeepPhotosAsk(uid)
  const before = useBeforeFlow({
    uid,
    dateKey,
    mealType: meal,
    keepPhotos: keepAsk.keepPhotos,
    menuCandidates: schoolAsk.loaded?.menu,
    onDone: (id) => {
      const sm = schoolAsk.take()
      if (sm) markSchoolMeal(id, sm)
      setSheet(null)
    },
    onManual: goManual,
  })
  const after = useAfterFlow({
    uid,
    target: target_,
    keepPhotos: keepAsk.keepPhotos,
    onReview: goReview,
    onManual: () => {
      setTarget('after')
      setSheet('ratio')
    },
    onCanceled: () => {
      setSheet(null)
      setAfterId(null)
      showToast('기록을 취소했어요')
    },
  })
  const cap = useCaptureSource(
    target === 'after'
      ? {
          title: '먹은 후 사진',
          hint: '같은 위치·각도로 찍어 주세요',
          onPick: (f) => after.onPick(f),
          overlaySrc: after.photoUrl, // 카메라 화면에 먹기 전 사진을 반투명하게 겹친다
        }
      : { title: '먹기 전 사진', hint: '수저를 함께, 위에서 찍어 주세요', onPick: (f, m) => before.onPick(f, m.source) },
  )

  // 분석 오류·같은 사진이면 그 흐름의 시트를 다시 열어 안내와 [다시 시도]를 보인다
  const beforeError = before.error
  useEffect(() => {
    if (beforeError) setSheet('record')
  }, [beforeError])
  const afterNotice = after.error ?? (after.samePending ? 'same' : null)
  useEffect(() => {
    if (afterNotice) setSheet('after')
  }, [afterNotice])

  function openRecord() {
    before.clearError()
    setTarget('before')
    setSheet('record')
  }

  function openAfter(id: string) {
    after.clearNotices()
    setAfterId(id)
    setTarget('after')
    setSheet('after')
  }

  async function removeItem(m: MealWithId, item: MealItem) {
    if (!m.analysis || !(await askConfirm({ title: `${foodName(item.name) || '이 음식'}을(를) 지울까요?`, ok: '지우기' })) || !m.analysis) return
    setActionError(null)
    const pending = getPendingEdit(m.id)
    // 화면에 보이는 것(고치는 중이면 고친 내용) 기준으로, 남은 음식이 없거나 다 남긴 음식뿐이면 기록째 지운다
    const pRest = pending ? pending.analysis.items.filter((it) => it.id !== item.id) : null
    if (pending && pRest) {
      if (pRest.every(isAllLeft)) dropPendingEdit(m.id)
      else
        setPendingEdit(m.id, {
          ...pending,
          analysis: buildAnalysis(pRest, pending.analysis.warnings ?? [], { model: pending.analysis.model, prompt_version: pending.analysis.prompt_version }),
        })
    }
    // X는 바로 저장(사용자 결정): 저장된 기록(고치기 전)에서 그 음식을 뺀다
    const base = meals?.find((x) => x.id === m.id)?.analysis ?? m.analysis
    const rest = base.items.filter((it) => it.id !== item.id)
    // 기다리지 않는다(오프라인이면 끝나지 않는다). 구독은 로컬 캐시로 바로 바뀐다.
    // 남은 음식이 없거나 다 남긴 음식(목록에서 숨김)뿐이면 기록째 지운다 — 보관한 사진도 함께(사용자 결정)
    const dropRecord = rest.length === 0 || (pRest ?? rest).every(isAllLeft)
    if (dropRecord && pending) dropPendingEdit(m.id)
    const job =
      dropRecord
        ? deleteMeal(uid, m.id)
        : saveMeal(uid, m.id, {
            dateKey: m.dateKey,
            mealType: m.mealType,
            analysis: buildAnalysis(rest, base.warnings ?? [], {
              model: base.model,
              prompt_version: base.prompt_version,
            }),
          })
    showToast('삭제했어요')
    job.catch((e: unknown) => {
      console.warn('[meal] 음식 삭제 실패', e)
      setActionError('지우지 못했어요. 잠시 뒤 다시 해 주세요.')
    })
  }

  const done = useMemo(() => (view ?? []).filter((m) => m.status === 'done' && m.analysis), [view])
  const totals: MealTotals = useMemo(() => {
    const t = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
    for (const m of done) {
      const c = m.analysis?.totals?.consumed
      if (!c) continue
      t.kcal += c.kcal
      t.carbs_g += c.carbs_g
      t.protein_g += c.protein_g
      t.fat_g += c.fat_g
    }
    return { kcal: t.kcal, carbs_g: r1(t.carbs_g), protein_g: r1(t.protein_g), fat_g: r1(t.fat_g) }
  }, [done])
  // 세부 영양소(D4): 끝난 기록 음식들의 먹은 양 기준 합(값 있는 음식만)
  const detail = useMemo(() => sumDetail(done.flatMap((m) => (m.analysis ? [m.analysis] : []))), [done])

  const groups: Group[] = []
  for (const m of view ?? []) {
    if (m.status === 'done' && m.analysis) {
      // 다 남긴 음식(남긴 비율 100%)은 줄을 숨긴다. 기록의 음식이 모두 그렇면 묶음도 숨긴다(사용자가 고른 변경 18, 수정 화면에는 그대로)
      const shownItems = m.analysis.items.filter((it) => !isAllLeft(it))
      if (shownItems.length === 0) continue
      groups.push({
        key: m.id,
        done: true,
        rows: shownItems.map((it) => ({
          key: `${m.id}/${it.id}`,
          name: foodName(it.name),
          src: sourceLabel(it),
          srcStyle: sourceBadgeStyle(it),
          desc: describeItem(it, !!m.editedAt),
          kcal: Math.round(it.consumed.kcal),
          onOpen: () => navigate(`/meal/${m.id}/edit`, { state: { fromMeal: true } }),
          onDelete: () => void removeItem(m, it),
        })),
      })
    } else if (m.status === 'awaiting_after' && m.beforeAnalysis) {
      const rows = m.beforeAnalysis.items.map((it) => ({
        key: `${m.id}/${it.id}`,
        name: foodName(it.name),
        src: null,
        desc: '먹은 후 사진 기다림',
        kcal: null,
      }))
      groups.push({
        key: m.id,
        done: false,
        rows,
        onOpen: () => openAfter(m.id),
        label: `${rows.map((r) => r.name).join(', ')}: 먹은 후 사진 기다림. 남은 음식 알려 주기`,
      })
    } else if (m.status === 'needs_review' && m.analysis) {
      const rows = m.analysis.items.map((it) => ({
        key: `${m.id}/${it.id}`,
        name: foodName(it.name),
        src: sourceLabel(it),
        desc: '결과 확인 기다림',
        kcal: null,
      }))
      groups.push({
        key: m.id,
        done: false,
        rows,
        onOpen: () => navigate(`/meal/${m.id}/review`, { replace: true }),
        label: `${rows.map((r) => r.name).join(', ')}: 결과 확인 기다림. 결과 화면 열기`,
      })
    }
  }
  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0)

  const label = MEAL_TYPE_LABEL[meal]
  const time = times[meal]
  const p = macroPct(totals.carbs_g, totals.protein_g, totals.fat_g)
  const afterFoods = target_ ? target_.beforeAnalysis.items : []
  const afterSubtitle = `${label} · ${representativeFood(afterFoods.map((it) => it.name))}`
  const closeSheet = () => setSheet(null)

  return (
    <>
      <main className="screen enter">
        <div className="mealhero" style={{ background: HERO_BG[meal] }}>
          <div className="topbar pad">
            <IconButton icon="close" label="닫기" onClick={() => leave(false)} />
            <h1>
              {`${label} `}
              <span className="num" style={{ color: 'var(--ink-3)' }}>
                {rowCount}
              </span>
            </h1>
            <div style={{ width: 44 }}></div>
          </div>
          <div className="art">
            <MealArt meal={meal} className="mico" size={110} style={{ width: 110, height: 110 }} />
          </div>
          {/* 위쪽 카메라 버튼(시안 .cam)은 없앤다 — 새 음식은 아래 [음식 추가](사용자가 고른 변경 19) */}
        </div>
        <div className="sheetbody pad">
          {(loadError || actionError) && (
            <p className="callout" role="status" style={{ margin: '0 0 14px', background: 'var(--ground)' }}>
              {actionError ?? '기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'}
            </p>
          )}
          <div className="mtotal">
            <span>
              {'총 '}
              <span className="num">{`${Math.round(totals.kcal)}kcal`}</span>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* 먹은 시간이 있으면 칩 글자가 그 시각(사용자가 고른 변경), 누르면 바꾸는 시트 */}
              <button
                type="button"
                className="chipbtn"
                style={{ background: 'var(--sky-soft)' }}
                aria-label={time ? `먹은 시간 ${time}, 바꾸기` : undefined}
                onClick={() => setSheet('time')}
              >
                {time ?? '시간 입력'}
              </button>
              <button
                type="button"
                className="chipbtn"
                style={{ background: 'var(--sky-deep)', color: '#fff' }}
                onClick={() => setSheet('mealinfo')}
              >
                자세히
              </button>
            </div>
          </div>
          {done.length > 0 && (
            <>
              <div className="stack">
                <div style={{ flex: p.c, background: 'var(--carb)' }} className="num">{`${p.c}%`}</div>
                <div style={{ flex: p.p, background: 'var(--prot)' }} className="num">{`${p.p}%`}</div>
                <div style={{ flex: p.f, background: 'var(--fat)' }} className="num">{`${p.f}%`}</div>
              </div>
              <div className="legend">
                <span>
                  <i className="dot" style={{ background: 'var(--carb)' }}></i>
                  {'탄수화물 '}
                  <b className="num">{`${totals.carbs_g}g`}</b>
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--prot)' }}></i>
                  {'단백질 '}
                  <b className="num">{`${totals.protein_g}g`}</b>
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--fat)' }}></i>
                  {'지방 '}
                  <b className="num">{`${totals.fat_g}g`}</b>
                </span>
              </div>
            </>
          )}
          <div className="foods" style={{ gap: 14 }}>
            {meals === null && !loadError ? null : groups.length > 0 ? (
              groups.map((g) => (
                <div
                  key={g.key}
                  style={{
                    borderLeft: `4px solid ${g.done ? GROUP_LINE[meal] : 'var(--ink-3)'}`,
                    paddingLeft: 12,
                    ...(g.onOpen ? { cursor: 'pointer' } : {}),
                  }}
                  {...(g.onOpen ? pressable(g.onOpen, g.label) : {})}
                >
                  {g.rows.map((r) => (
                    <div
                      key={r.key}
                      className="food"
                      {...(r.onOpen ? { ...pressable(r.onOpen), style: { cursor: 'pointer' } } : {})}
                    >
                      <div>
                        <div className="fn">
                          {r.name}
                          {r.src && <span className="srcb" style={r.srcStyle}>{r.src}</span>}
                        </div>
                        <div className="fs">{r.desc}</div>
                      </div>
                      <span className="num">{r.kcal == null ? '–' : `${r.kcal}kcal`}</span>
                      {r.onDelete && (
                        <IconButton
                          icon="close"
                          label={`${r.name} 삭제`}
                          style={{ width: 36, height: 36 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            r.onDelete?.()
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--ink-3)', textAlign: 'center', padding: '30px 0' }}>
                아직 기록이 없어요. 카메라로 먹기 전 사진을 찍어보세요.
              </p>
            )}
          </div>
        </div>
        <div className="bottom">
          <div className="inner pad">
            {rowCount > 0 ? (
              <>
                <button type="button" className="btn sky narrow" onClick={openRecord}>
                  음식 추가
                </button>
                {/* 음식을 눌러 고친 내용은 여기서 저장(2026-10-28 사용자 결정), 고친 것이 없으면 홈으로만 */}
                <button type="button" className="btn ink" onClick={finish}>
                  수정 완료
                </button>
              </>
            ) : (
              <button type="button" className="btn ink" onClick={openRecord}>
                음식 추가
              </button>
            )}
          </div>
        </div>
        <Toast message={toast?.text ?? null} />
      </main>

      <RecordSheet
        open={sheet === 'record'}
        onClose={closeSheet}
        cap={cap}
        gate={(fn) => keepAsk.gate(() => before.gate(fn))}
        error={before.error}
        onRetry={before.canRetry ? before.retry : undefined}
        onManual={goManual}
        top={schoolAsk.box}
      />
      <TimeSheet
        open={sheet === 'time'}
        onClose={closeSheet}
        meal={meal}
        value={time ?? toHm(new Date())}
        onSave={(hm) => {
          setSheet(null)
          showToast('시간을 저장했어요')
          setMealTime(uid, dateKey, meal, hm).catch((e: unknown) => {
            console.warn('[meal] 먹은 시간 저장 실패', e)
            setActionError('먹은 시간을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.')
          })
        }}
      />
      <MealInfoSheet open={sheet === 'mealinfo'} onClose={closeSheet} meal={meal} totals={totals} detail={detail} />
      <AfterSheet
        open={sheet === 'after' && target_ != null}
        onClose={closeSheet}
        subtitle={afterSubtitle}
        cap={cap}
        gate={keepAsk.gate}
        notices={
          <AfterNotices
            cap={cap}
            error={after.error}
            onRetry={after.canRetry ? after.retry : undefined}
            samePending={after.samePending}
            onAnalyzeSame={() => {
              setSheet(null)
              after.analyzeSame()
            }}
            hasBeforePhoto={after.hasBeforePhoto}
          />
        }
        onAllEaten={() => {
          setSheet(null)
          after.chooseRatios({})
        }}
        onRatio={() => setSheet('ratio')}
        onCancelMeal={after.cancelMeal}
      />
      <RatioSheet
        open={sheet === 'ratio' && target_ != null}
        onClose={closeSheet}
        foods={afterFoods.map((it) => ({ id: it.id, name: foodName(it.name), beforeGrams: it.before_grams }))}
        onSubmit={(ratios) => {
          setSheet(null)
          after.chooseRatios(ratios)
        }}
      />

      {cap.elements}
      {before.elements}
      {after.elements}
      {keepAsk.elements}
    </>
  )
}
