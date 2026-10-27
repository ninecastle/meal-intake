import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentReference,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { validateAnalysis } from '../analysis/validate'
import { db } from '../lib/firebase'
import type { BeforeAnalysis, MealIntakeAnalysis } from '../types/analysis'
import { summarizeDay, type DaySummary } from './summary'

// 식사 기록 저장소(스펙 2.1절 상태 전이, 3.2절 필드, 4.3절 시그니처, 4.4절 오류 코드).
// Firestore에는 분석 결과만 저장한다. 사진·썸네일·base64·이미지 URL 필드는 두지 않는다(CLAUDE.md).
// 규칙(firestore.rules)이 문서 키와 analysis·beforeAnalysis 하위 키를 허용 목록으로 막으므로,
// 여기서도 허용 키만 골라 쓴다. 하루 요약은 subscribeDay(쿼리) + summarizeDay(summary.ts, 합산).

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type MealStatus = 'awaiting_after' | 'needs_review' | 'done'

export interface MealDoc {
  dateKey: string
  mealType: MealType
  status: MealStatus
  beforeAnalysis?: BeforeAnalysis
  analysis?: MealIntakeAnalysis
  consumedKcal?: number
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  /** done 기록을 고친 마지막 시각(M16, 스펙 3.2절). 규칙: done → done일 때만 request.time */
  editedAt?: Timestamp | null
}

export type MealWithId = MealDoc & { id: string }

export type MealStoreErrorCode = 'MEAL_SAVE_REJECTED' | 'MEAL_NOT_FOUND' | 'MEAL_STORE_UNAVAILABLE'

export class MealStoreError extends Error {
  readonly code: MealStoreErrorCode
  constructor(code: MealStoreErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options)
    this.name = 'MealStoreError'
    this.code = code
  }
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MEAL_TYPES: readonly string[] = ['breakfast', 'lunch', 'dinner', 'snack']
const MAX_ITEMS = 30 // 규칙과 같은 값
const MAX_KCAL = 10000 // 규칙과 같은 값
const PHOTO_KEY_RE = /photo|image|img|thumb|base64|data_?url|blob/i

const mealsCol = (uid: string) => collection(db, 'users', uid, 'meals')
const mealRef = (uid: string, mealId: string) => doc(db, 'users', uid, 'meals', mealId)

/** JSON 왕복: Firestore가 거부하는 undefined 값과 JSON이 아닌 값(Blob 등)을 없앤다. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** 사진처럼 보이는 키나 data: URL 문자열이 있으면 저장하지 않는다(beforeAnalysis용. analysis는 validateAnalysis가 검사). */
function assertNoPhoto(v: unknown, path = 'beforeAnalysis'): void {
  if (typeof v === 'string') {
    if (v.startsWith('data:') || v.length > 2000) reject(`${path}: 사진·긴 문자열은 저장하지 않습니다`)
    return
  }
  if (Array.isArray(v)) return v.forEach((x, i) => assertNoPhoto(x, `${path}[${i}]`))
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (PHOTO_KEY_RE.test(k)) reject(`${path}.${k}: 사진 필드는 저장하지 않습니다`)
      assertNoPhoto(x, `${path}.${k}`)
    }
  }
}

function reject(message: string): never {
  throw new MealStoreError('MEAL_SAVE_REJECTED', message)
}

function checkKeys(dateKey: string, mealType: MealType): void {
  if (!DATE_KEY_RE.test(dateKey)) reject(`dateKey 형식 오류: ${dateKey}`)
  if (!MEAL_TYPES.includes(mealType)) reject(`mealType 오류: ${mealType}`)
}

/** validateAnalysis 통과 + 규칙의 analysis 허용 키만 남긴다. */
function checkedAnalysis(analysis: MealIntakeAnalysis): MealIntakeAnalysis {
  const r = validateAnalysis(analysis)
  if (!r.ok) reject(`분석 결과 검증 실패: ${r.errors.join('; ')}`)
  const { items, totals, warnings, model, prompt_version } = r.value
  const a = plain({ items, totals, warnings, model, prompt_version })
  if (a.items.length > MAX_ITEMS) reject(`음식은 ${MAX_ITEMS}개까지 저장합니다`)
  const kcal = a.totals.consumed.kcal
  if (!(typeof kcal === 'number' && kcal >= 0 && kcal <= MAX_KCAL)) reject(`섭취 칼로리 범위 밖: ${kcal}`)
  return a
}

function pickBefore(b: BeforeAnalysis): BeforeAnalysis {
  const { items, warnings, model, prompt_version } = b
  const v = plain({ items, warnings, model, prompt_version })
  if (!Array.isArray(v.items) || v.items.length > MAX_ITEMS) reject(`먹기 전 음식은 ${MAX_ITEMS}개까지 저장합니다`)
  assertNoPhoto(v)
  return v
}

function errCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
}

function writeError(e: unknown): MealStoreError {
  if (e instanceof MealStoreError) return e
  const c = errCode(e)
  if (c === 'permission-denied') return new MealStoreError('MEAL_SAVE_REJECTED', '저장이 거부됐습니다(보안 규칙)', { cause: e })
  if (c === 'not-found') return new MealStoreError('MEAL_NOT_FOUND', '식사 기록이 없습니다(삭제됨)', { cause: e })
  return new MealStoreError('MEAL_STORE_UNAVAILABLE', `저장소 오류: ${c || String(e)}`, { cause: e })
}

function readError(e: unknown): MealStoreError {
  return e instanceof MealStoreError
    ? e
    : new MealStoreError('MEAL_STORE_UNAVAILABLE', `불러오기 오류: ${errCode(e) || String(e)}`, { cause: e })
}

/** 대기 중인 serverTimestamp는 추정값으로 읽는다(정렬용). */
function toMeal(s: DocumentSnapshot): MealWithId {
  const d = s.data({ serverTimestamps: 'estimate' }) as MealDoc
  return { ...d, id: s.id, createdAt: d.createdAt ?? null, updatedAt: d.updatedAt ?? null, editedAt: d.editedAt ?? null }
}

/** createdAt 내림차순(최근 먼저). orderBy를 쓰지 않으므로 정렬은 클라이언트에서 한다(스펙 3.2절). */
function newestFirst(meals: MealWithId[]): MealWithId[] {
  const t = (m: MealWithId) => m.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
  return meals.sort((a, b) => t(b) - t(a))
}

/** 서버 왕복 없이 새 문서 id를 만든다. 먹기 전 사진 IndexedDB 키로도 쓴다. */
export function newMealId(uid: string): string {
  return doc(mealsCol(uid)).id
}

/**
 * 호출 A 성공 직후: 없음 → awaiting_after.
 * 쓰기 Promise는 서버 확인 뒤에 끝난다(오프라인이면 다시 연결될 때까지 대기). 화면은 기다리지 않아도 된다.
 */
export async function createAwaitingMeal(
  uid: string,
  mealId: string,
  v: { dateKey: string; mealType: MealType; beforeAnalysis: BeforeAnalysis },
): Promise<void> {
  checkKeys(v.dateKey, v.mealType)
  const beforeAnalysis = pickBefore(v.beforeAnalysis)
  try {
    await setDoc(mealRef(uid, mealId), {
      dateKey: v.dateKey,
      mealType: v.mealType,
      status: 'awaiting_after',
      beforeAnalysis,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    throw writeError(e)
  }
}

/** 호출 B 성공 직후: awaiting_after → needs_review. 문서가 없으면 MEAL_NOT_FOUND. */
export async function saveReview(uid: string, mealId: string, analysis: MealIntakeAnalysis): Promise<void> {
  const a = checkedAnalysis(analysis)
  try {
    await updateDoc(mealRef(uid, mealId), {
      status: 'needs_review',
      analysis: a,
      consumedKcal: a.totals.consumed.kcal,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    throw writeError(e)
  }
}

/**
 * 캐시 → 서버 순으로 문서 상태를 본다. 문서가 없으면 null.
 * 오프라인이고 캐시에도 없으면 새 식사(직접 입력)로 본다.
 */
async function mealStatus(ref: DocumentReference): Promise<MealStatus | null> {
  try {
    const c = await getDocFromCache(ref)
    if (c.exists()) return (c.data() as MealDoc).status
  } catch {
    // 캐시에 없음
  }
  try {
    const s = await getDoc(ref)
    return s.exists() ? (s.data() as MealDoc).status : null
  } catch {
    return null
  }
}

/**
 * S4 저장: awaiting_after·needs_review → done, 문서가 없으면 done으로 만든다(직접 입력).
 * S8 기록 수정(M16): 이미 done이면 done → done으로 dateKey·mealType·analysis·consumedKcal을 바꾸고 editedAt을 기록한다
 * (규칙은 done → done일 때만 editedAt = request.time을 허용하고 createdAt은 그대로 둔다).
 * consumedKcal = analysis.totals.consumed.kcal.
 */
export async function saveMeal(
  uid: string,
  mealId: string,
  v: { dateKey: string; mealType: MealType; analysis: MealIntakeAnalysis },
): Promise<void> {
  checkKeys(v.dateKey, v.mealType)
  // 남긴 비율을 모르는(null) 음식이 있으면 done으로 저장하지 않는다(2026-10-27, 사용자가 고른 뒤에만). saveReview는 null 허용.
  const unpicked = v.analysis.items.filter((it) => it.remaining_ratio === null).map((it) => it.name || it.id)
  if (unpicked.length > 0) reject(`남긴 비율을 고르지 않은 음식이 있습니다: ${unpicked.join(', ')}`)
  const a = checkedAnalysis(v.analysis)
  const ref = mealRef(uid, mealId)
  const fields = {
    dateKey: v.dateKey,
    mealType: v.mealType,
    status: 'done' as const,
    analysis: a,
    consumedKcal: a.totals.consumed.kcal,
    updatedAt: serverTimestamp(),
  }
  try {
    const status = await mealStatus(ref)
    if (status === 'done') await updateDoc(ref, { ...fields, editedAt: serverTimestamp() })
    else if (status) await updateDoc(ref, fields)
    else await setDoc(ref, { ...fields, createdAt: serverTimestamp() })
  } catch (e) {
    throw writeError(e)
  }
}

/** 모든 상태에서 삭제할 수 있다. 호출하는 쪽이 beforePhotoStore.remove도 부른다. */
export async function deleteMeal(uid: string, mealId: string): Promise<void> {
  try {
    await deleteDoc(mealRef(uid, mealId))
  } catch (e) {
    throw writeError(e)
  }
}

/** 문서가 없으면 null(화면은 MEAL_NOT_FOUND로 처리해 S1로 이동). */
export async function getMeal(uid: string, mealId: string): Promise<MealWithId | null> {
  try {
    const s = await getDoc(mealRef(uid, mealId))
    return s.exists() ? toMeal(s) : null
  } catch (e) {
    throw readError(e)
  }
}

/** awaiting_after·needs_review 식사(최근 먼저). 단일 필드 인덱스로 동작한다. */
export function subscribePending(
  uid: string,
  cb: (meals: MealWithId[]) => void,
  onError?: (code: MealStoreErrorCode) => void,
): () => void {
  const q = query(mealsCol(uid), where('status', 'in', ['awaiting_after', 'needs_review']))
  return onSnapshot(
    q,
    (snap) => cb(newestFirst(snap.docs.map(toMeal))),
    (e) => {
      console.warn('[meals] subscribePending 오류', e)
      onError?.('MEAL_STORE_UNAVAILABLE')
    },
  )
}

/**
 * 하루 요약(S1): 그날 done 식사를 구독해 summarizeDay로 합산한다. 등호 조건 두 개라 단일 필드 인덱스로 동작한다
 * (orderBy 없음, 정렬은 summarizeDay). 저장·수정·삭제 후 별도 집계 없이 다시 호출된다.
 * includeMetadataChanges로 오프라인 저장 대기(hasPendingWrites)가 풀릴 때도 다시 알린다.
 */
export function subscribeDay(
  uid: string,
  dateKey: string,
  cb: (s: DaySummary) => void,
  onError?: (code: MealStoreErrorCode) => void,
): () => void {
  const q = query(mealsCol(uid), where('dateKey', '==', dateKey), where('status', '==', 'done'))
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => cb({ ...summarizeDay(dateKey, snap.docs.map(toMeal)), hasPendingWrites: snap.metadata.hasPendingWrites }),
    (e) => {
      console.warn('[meals] subscribeDay 오류', e)
      onError?.('MEAL_STORE_UNAVAILABLE')
    },
  )
}

/**
 * 달력(S10)·주간 추이(S9): startKey~endKey(둘 다 포함) done 식사를 날짜별로 summarizeDay해 구독한다(스펙 4.7절 "달력").
 * dateKey 범위 쿼리 하나(단일 필드 인덱스), done은 클라이언트에서 거른다. 기록이 있는 날만 Map에 넣는다.
 * 같은 필드의 범위 조건 두 개이고 orderBy·status 조건이 없어 복합 인덱스가 필요 없다(firestore.indexes.json 그대로).
 * Map은 dateKey 오름차순으로 넣고, 날마다 hasPendingWrites는 그날 문서 가운데 하나라도 저장 대기면 true.
 * 키 형식이 틀리거나 startKey > endKey이거나 42일(월요일 시작 6주 격자)을 넘으면 쿼리하지 않고 onError('MEAL_STORE_UNAVAILABLE')를 비동기로 알린다.
 */
export function subscribeDaysInRange(
  uid: string,
  startKey: string,
  endKey: string,
  cb: (days: Map<string, DaySummary>) => void,
  onError?: (code: MealStoreErrorCode) => void,
): () => void {
  if (!validRange(startKey, endKey)) {
    console.warn('[meals] subscribeDaysInRange 범위 오류', startKey, endKey)
    let live = true
    queueMicrotask(() => live && onError?.('MEAL_STORE_UNAVAILABLE'))
    return () => {
      live = false
    }
  }
  const q = query(mealsCol(uid), where('dateKey', '>=', startKey), where('dateKey', '<=', endKey))
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const byDay = new Map<string, MealWithId[]>()
      const pending = new Set<string>()
      for (const s of snap.docs) {
        const m = toMeal(s)
        if (m.status !== 'done') continue
        const list = byDay.get(m.dateKey)
        if (list) list.push(m)
        else byDay.set(m.dateKey, [m])
        if (s.metadata.hasPendingWrites) pending.add(m.dateKey)
      }
      const days = new Map<string, DaySummary>()
      for (const k of [...byDay.keys()].sort()) {
        const sum = summarizeDay(k, byDay.get(k)!)
        if (sum.meals.length > 0) days.set(k, { ...sum, hasPendingWrites: pending.has(k) })
      }
      cb(days)
    },
    (e) => {
      console.warn('[meals] subscribeDaysInRange 오류', e)
      onError?.('MEAL_STORE_UNAVAILABLE')
    },
  )
}

// 기록 보기 달력은 앞뒤 달 날짜까지 채운 월요일 시작 격자(최대 6주 = 42일)를 한 번에 조회한다(2026-10-27 사용자 결정)
const MAX_RANGE_DAYS = 42

/** YYYY-MM-DD 두 개, start <= end, 양 끝 포함 42일 이하. */
function validRange(startKey: string, endKey: string): boolean {
  if (!DATE_KEY_RE.test(startKey) || !DATE_KEY_RE.test(endKey) || startKey > endKey) return false
  const ms = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))
  return (ms(endKey) - ms(startKey)) / 86_400_000 + 1 <= MAX_RANGE_DAYS
}

/** 기록 상세(S7): 문서 하나를 구독한다. 없거나 지워지면 null(화면은 S1로 이동). */
export function subscribeMeal(
  uid: string,
  mealId: string,
  cb: (m: MealWithId | null) => void,
  onError?: (code: MealStoreErrorCode) => void,
): () => void {
  return onSnapshot(
    mealRef(uid, mealId),
    (s) => cb(s.exists() ? toMeal(s) : null),
    (e) => {
      console.warn('[meals] subscribeMeal 오류', e)
      onError?.('MEAL_STORE_UNAVAILABLE')
    },
  )
}

/** 확인용: 최근 n개(모든 상태). 전체를 읽어 클라이언트에서 정렬한다(orderBy 없음). */
export async function listRecentMeals(uid: string, n: number): Promise<MealWithId[]> {
  try {
    const snap = await getDocs(mealsCol(uid))
    return newestFirst(snap.docs.map(toMeal)).slice(0, Math.max(0, n))
  } catch (e) {
    throw readError(e)
  }
}
