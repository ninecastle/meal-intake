// S7 기록 상세(3단계 조각 1, /meal/:mealId, 보기 전용). subscribeMeal로 불러와 날짜·끼니·저장 시각, 끼니 합계,
// 음식별 값(먹기 전 무게·남긴 비율·같이 먹은 인원·먹은 양·kcal·탄단지·출처)을 보인다. 사진은 없다(서버 미저장).
// [삭제]는 확인 뒤 deleteMeal → 그 날짜 홈(replace). done이 아니면 이어 할 화면으로 안내한다.
// [수정]은 S8 기록 수정(/meal/:mealId/edit, 3단계 조각 1-2)으로 간다. 수정 저장 뒤 돌아오면(flash 또는 state { edited: true }) "수정했어요"를 3초 보인다.
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import SourceBadge from '../components/review/SourceBadge'
import {
  MEAL_TYPE_LABEL,
  NUTRITION_SOURCE_NOTE,
  dateKeyLabel,
  formatGrams,
  formatKcal,
  formatMacro,
  homeHref,
} from '../components/mealText'
import { deleteMeal, subscribeMeal, type MealWithId } from '../data/meals'
import { clearFlash, peekFlash } from '../lib/flash'
import { APP_TIMEZONE, toDateKey } from '../lib/time'
import type { MealItem, Nutrients } from '../types/analysis'

const stampFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: APP_TIMEZONE,
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

type Macro = 'carbs_g' | 'protein_g' | 'fat_g'
const MACROS: { k: Macro; label: string }[] = [
  { k: 'carbs_g', label: '탄수화물' },
  { k: 'protein_g', label: '단백질' },
  { k: 'fat_g', label: '지방' },
]

/** Firestore Timestamp·Date·없음을 Date | null로 */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate()
  return null
}

/** 직접 입력(100g당 값 없음)이거나 DB에 값이 비어 채우지 못한 영양소 */
function macroMissing(it: MealItem, k: Macro): boolean {
  if (it.per_100g === null) return true
  return k !== 'protein_g' && it.per_100g_fill?.[k] === 'missing'
}

const btnLink = 'mt-4 flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold'

export default function MealDetailPage({ uid }: { uid: string }) {
  const { mealId = '' } = useParams()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<{ id: string; meal: MealWithId | null } | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const today = toDateKey(new Date())
  // 기록 수정(S8)에서 저장하고 돌아왔으면 "수정했어요"를 3초 보인다
  const location = useLocation()
  const flashKey = `edited:${mealId}`
  const [editedNotice, setEditedNotice] = useState(
    () => (location.state as { edited?: unknown } | null)?.edited === true || peekFlash(flashKey),
  )
  useEffect(() => clearFlash(flashKey), [flashKey])
  useEffect(() => {
    if (!editedNotice) return
    const t = window.setTimeout(() => setEditedNotice(false), 3000)
    return () => window.clearTimeout(t)
  }, [editedNotice])

  useEffect(
    () =>
      subscribeMeal(
        uid,
        mealId,
        (m: MealWithId | null) => {
          setLoaded({ id: mealId, meal: m })
          setErrorId(null)
        },
        () => setErrorId(mealId),
      ),
    [uid, mealId],
  )

  // undefined = 아직 불러오는 중, null = 문서 없음
  const meal = loaded?.id === mealId ? loaded.meal : undefined

  function remove(m: MealWithId) {
    if (deleting || !window.confirm('이 기록을 삭제할까요?')) return
    setDeleting(true)
    // 서버 확인을 기다리지 않는다(오프라인이면 끝나지 않는다). 로컬 캐시에서 바로 지워져 홈 요약에 반영된다.
    deleteMeal(uid, m.id).catch((e: unknown) => console.warn('[detail] 기록 삭제 실패', e))
    navigate(homeHref(m.dateKey, today), { replace: true })
  }

  let body: ReactNode
  if (meal === undefined && errorId === mealId) {
    body = (
      <Notice text="기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.">
        <Link to="/" replace className={`${btnLink} border border-gray-300 text-gray-700`}>
          홈으로
        </Link>
      </Notice>
    )
  } else if (meal === undefined) {
    body = <p className="mt-6 text-center text-sm text-gray-500">불러오는 중…</p>
  } else if (meal === null) {
    body = (
      <Notice text="기록을 찾을 수 없어요">
        <Link to="/" replace className={`${btnLink} border border-gray-300 text-gray-700`}>
          홈으로
        </Link>
      </Notice>
    )
  } else if (meal.status !== 'done') {
    const next =
      meal.status === 'awaiting_after'
        ? { to: `/meal/${meal.id}/after`, label: '다 드셨나요? 남은 음식 찍기', text: '아직 먹은 후 사진을 찍지 않은 기록이에요.' }
        : { to: `/meal/${meal.id}/review`, label: '확인하고 저장하기', text: '아직 확인하고 저장하지 않은 기록이에요.' }
    body = (
      <Notice text={next.text}>
        <Link to={next.to} replace className={`${btnLink} bg-amber-500 text-white`}>
          {next.label}
        </Link>
      </Notice>
    )
  } else {
    body = <DoneMeal meal={meal} deleting={deleting} onDelete={() => remove(meal)} />
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center">
        <Link to={meal ? homeHref(meal.dateKey, today) : '/'} replace className="flex min-h-11 items-center pr-4 text-gray-700">
          ‹ 홈
        </Link>
      </header>
      {editedNotice && (
        <p role="status" className="mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          수정했어요
        </p>
      )}
      {body}
    </main>
  )
}

function Notice({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-xl bg-gray-50 p-4 text-center">
      <p className="font-medium text-gray-700">{text}</p>
      {children}
    </div>
  )
}

function DoneMeal({ meal, deleting, onDelete }: { meal: MealWithId; deleting: boolean; onDelete: () => void }) {
  const items = meal.analysis?.items ?? []
  const total: Nutrients = meal.analysis?.totals.consumed ?? { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
  const created = toDate(meal.createdAt)
  const edited = toDate(meal.editedAt)
  const incomplete = items.some((it) => MACROS.some(({ k }) => macroMissing(it, k)))

  return (
    <>
      <h1 className="mt-1 text-xl font-bold">
        {dateKeyLabel(meal.dateKey)} · {MEAL_TYPE_LABEL[meal.mealType] ?? '식사'}
      </h1>
      <p className="text-sm text-gray-600">
        {created ? `${stampFmt.format(created)} 저장` : '저장 대기 중'}
        {edited && ` · 수정됨 · ${stampFmt.format(edited)}`}
      </p>

      <section aria-label="끼니 합계" className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">끼니 합계</p>
        <p className="text-3xl font-bold">
          {formatKcal(total.kcal)}
          <span className="ml-1 text-base font-medium text-gray-600">kcal</span>
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
          {MACROS.map(({ k, label }) => (
            <div key={k} className="rounded-lg bg-gray-50 py-2">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="font-semibold">{formatMacro(total[k])}g</dd>
            </div>
          ))}
        </dl>
        {incomplete && <p className="mt-2 text-xs text-amber-700">일부 음식의 탄·단·지가 빠져 있어요</p>}
      </section>

      <ul className="mt-4 space-y-3">
        {items.map((it) => (
          <FoodRow key={it.id} it={it} />
        ))}
      </ul>
      {items.length === 0 && <p className="mt-4 text-center text-sm text-gray-500">음식 정보가 없어요</p>}

      <p className="mt-4 text-xs text-gray-500">{NUTRITION_SOURCE_NOTE}. DB에 없는 음식은 AI 추정값이에요.</p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {/* push: 수정 화면에서 뒤로 가기·‹·저장하면 방문 기록 한 칸 뒤의 이 상세로 돌아온다(기록은 [홈, 상세]) */}
        <Link
          to={`/meal/${meal.id}/edit`}
          state={{ fromDetail: true }}
          className="flex min-h-12 items-center justify-center rounded-xl border border-gray-300 font-medium text-gray-800"
        >
          수정
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="min-h-12 rounded-xl border border-red-300 font-medium text-red-600 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </>
  )
}

function FoodRow({ it }: { it: MealItem }) {
  const ref = it.db_reference
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words font-semibold">{it.name || '이름 없음'}</h2>
        <span className="shrink-0 text-xs">
          <SourceBadge item={it} />
        </span>
      </div>
      {ref && (
        <p className="mt-1 text-xs text-gray-600">
          참고 DB 대표값 {formatKcal(ref.kcal_per_100g)}kcal/100g ({ref.db_name})
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <Field
          label="먹기 전 무게"
          value={
            it.grams_source === 'published' && it.published_g != null
              ? `${formatGrams(it.before_grams)}g (공개 중량 ${formatGrams(it.published_g)}g × ${it.unit_count ?? 1})`
              : `${formatGrams(it.before_grams)}g`
          }
        />
        <Field
          label="남긴 비율"
          value={it.remaining_ratio === null ? '확인 안 됨' : `${Math.round(it.remaining_ratio * 100)}%`}
        />
        <Field label="같이 먹은 인원" value={`${it.eaters}명`} />
        <Field label="먹은 양" value={`${formatGrams(it.consumed_grams)}g`} />
      </dl>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-gray-50 px-3 py-2">
        <span className="text-lg font-bold">
          {formatKcal(it.consumed.kcal)}kcal
          {it.kcal_overridden && <span className="ml-1 text-xs font-normal text-gray-500">직접 고침</span>}
        </span>
        <span className="text-xs text-gray-600">
          {MACROS.map(({ k, label }, i) => (
            <span key={k}>
              {i > 0 && ' · '}
              {label.slice(0, 1)} {macroMissing(it, k) ? '–' : `${formatMacro(it.consumed[k])}g`}
            </span>
          ))}
        </span>
      </div>
    </li>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
