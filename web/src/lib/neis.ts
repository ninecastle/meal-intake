// 나이스 교육정보 개방 포털 Open API를 브라우저에서 바로 부른다(D13 학교 급식, 스펙 4.9절. CORS *, 서버 없음).
// 인증키 VITE_NEIS_API_KEY(무료, 번들에 보인다). 없으면 키 없이(샘플 5건) 부른다. 사진·개인 정보는 보내지 않는다.
// 급식은 날짜·학교·끼니마다 localStorage에 캐시(없음도 캐시)해 같은 날 다시 부르지 않는다. 3초 넘으면 포기(null).
import { mealCode, parseMeal, parseSchools, type SchoolHit, type SchoolMeal } from './neisParse'

export type { SchoolHit, SchoolMeal } from './neisParse'
export type SchoolRef = { atpt: string; code: string; name: string }

const BASE = 'https://open.neis.go.kr/hub'
const TIMEOUT_MS = 3000
const CACHE_PREFIX = 'neisMeal.v1:'
const CACHE_MAX = 40

function url(service: string, params: Record<string, string>): string {
  const q = new URLSearchParams({ Type: 'json', pIndex: '1', ...params })
  const key = import.meta.env.VITE_NEIS_API_KEY
  if (key) q.set('KEY', key)
  else q.set('pSize', '5')
  return `${BASE}/${service}?${q.toString()}`
}

async function getJson(u: string, signal?: AbortSignal): Promise<unknown> {
  const ac = new AbortController()
  const t = window.setTimeout(() => ac.abort(), TIMEOUT_MS)
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(u, { signal: ac.signal })
    if (!res.ok) throw new Error(`NEIS_HTTP_${res.status}`)
    return await res.json()
  } finally {
    window.clearTimeout(t)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** 학교 이름 검색(결과 최대 20곳). 실패하면 throw(화면이 오류 안내) */
export async function searchSchools(name: string, signal?: AbortSignal): Promise<SchoolHit[]> {
  const q = name.trim()
  if (!q) return []
  const key = !!import.meta.env.VITE_NEIS_API_KEY
  const json = await getJson(url('schoolInfo', { SCHUL_NM: q, ...(key ? { pSize: '20' } : {}) }), signal)
  return parseSchools(json)
}

type CacheEntry = { at: number; meal: SchoolMeal | null }

function cacheKey(school: SchoolRef, dateKey: string, code: string) {
  return `${CACHE_PREFIX}${school.atpt}-${school.code}:${dateKey}:${code}`
}

function readCache(k: string): CacheEntry | undefined {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return undefined
    const v = JSON.parse(raw) as CacheEntry
    return v && typeof v === 'object' && 'meal' in v ? v : undefined
  } catch {
    return undefined
  }
}

function writeCache(k: string, meal: SchoolMeal | null) {
  try {
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), meal } satisfies CacheEntry))
    // 오래된 캐시를 줄인다(가장 오래된 것부터)
    const keys: { k: string; at: number }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push({ k: key, at: readCache(key)?.at ?? 0 })
    }
    if (keys.length > CACHE_MAX) keys.sort((a, b) => a.at - b.at).slice(0, keys.length - CACHE_MAX).forEach((x) => localStorage.removeItem(x.k))
  } catch {
    // 캐시를 못 써도 기능은 돈다
  }
}

/**
 * 그 날짜·끼니의 급식(아침 조식·점심 중식·저녁 석식, 간식은 늘 null). 없음·실패·3초 초과면 null.
 * 받은 결과(없음 포함)는 캐시한다. 실패·시간 초과는 캐시하지 않는다(다음에 다시 물어본다).
 */
export async function getSchoolMeal(school: SchoolRef, dateKey: string, mealType: string, signal?: AbortSignal): Promise<SchoolMeal | null> {
  const code = mealCode(mealType)
  if (!code) return null
  const k = cacheKey(school, dateKey, code)
  const hit = readCache(k)
  if (hit) return hit.meal
  try {
    const json = await getJson(
      url('mealServiceDietInfo', {
        ATPT_OFCDC_SC_CODE: school.atpt,
        SD_SCHUL_CODE: school.code,
        MLSV_YMD: dateKey.replace(/-/g, ''),
        MMEAL_SC_CODE: code,
      }),
      signal,
    )
    const meal = parseMeal(json)
    writeCache(k, meal)
    return meal
  } catch {
    return null
  }
}

// ── 급식 기록 표시(기기에만, Firestore 식사 문서에는 넣지 않는다) ──
// [급식 불러오기]로 시작한 기록의 mealId → 그 급식. 먹기 전 → 먹은 후·결과 화면까지 남고, 결과 화면이 참고 kcal을 보인다.
const MEAL_MARK_PREFIX = 'schoolMealOf.v1:'
const MARK_TTL_MS = 3 * 24 * 3600 * 1000

export function markSchoolMeal(mealId: string, meal: SchoolMeal): void {
  try {
    localStorage.setItem(MEAL_MARK_PREFIX + mealId, JSON.stringify({ at: Date.now(), meal }))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith(MEAL_MARK_PREFIX)) continue
      const at = (JSON.parse(localStorage.getItem(key) ?? '{}') as { at?: number }).at ?? 0
      if (Date.now() - at > MARK_TTL_MS) localStorage.removeItem(key)
    }
  } catch {
    // 표시를 못 남겨도 기록은 그대로 된다(참고 줄만 안 보임)
  }
}

export function schoolMealOf(mealId: string): SchoolMeal | null {
  try {
    const raw = localStorage.getItem(MEAL_MARK_PREFIX + mealId)
    if (!raw) return null
    const v = JSON.parse(raw) as { meal?: SchoolMeal }
    return v.meal && Array.isArray(v.meal.menu) ? v.meal : null
  } catch {
    return null
  }
}
