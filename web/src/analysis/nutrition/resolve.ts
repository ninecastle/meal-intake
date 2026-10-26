// 영양값 조회 resolveNutrition(스펙 4.3·4.5절, CLAUDE.md "칼로리 계산 순서").
// 순서: 1 DB → 2 검색(호출 C, 미구현) → 3 AI 추정(guess, 없으면 호출 D) → 4 user_input.
// 이 파일은 의존성(DB 로드, 호출 D, 영구 캐시, 검색 스위치)을 주입받고 import.meta.env·firebase 초기화를 쓰지 않는다.
// 앱은 nutrition/index.ts가 만든 resolveNutrition을 쓰고, Node 시험은 createNutritionResolver를 직접 부른다.
import type { DbReference, FillSource, Nutrients, NutritionResult } from '../../types/analysis'
import { checkPer100 } from '../beforePrompt.ts'
import { matchFood, type DbMatchResult, type NutritionDbIndex } from './db.ts'
import { isHighVarianceFood } from './highVariance.ts'
import { normalizeFoodName } from './normalize.ts'

/** 호출 D 결과의 영구 캐시(IndexedDB). 키는 정규화한 이름. 실패는 null·무시로 처리한다 */
export interface EstimateCache {
  get(key: string): Promise<Nutrients | null>
  put(key: string, value: Nutrients): Promise<void>
}

export interface ResolverDeps {
  /** DB 색인. 실패하면 DB 단계를 건너뛴다 */
  loadIndex: () => Promise<NutritionDbIndex>
  /** 호출 D: 이름만 보내 100g당 값을 받는다. 실패하면 던지고, 취소는 AbortError. null이면 호출 D를 하지 않는다 */
  estimate: ((name: string, signal?: AbortSignal) => Promise<Nutrients>) | null
  /** VITE_SEARCH_GROUNDING === 'on'. 기본 false(무료 등급에서 막혀 있다) */
  searchGrounding?: boolean
  cache?: EstimateCache
}

export interface ResolveOptions {
  /** 그 이름에 대해 호출 A가 낸 per_100g_guess. 이름을 고친 뒤에는 넘기지 않는다 */
  guess?: Nutrients | null
  /** 자동완성에서 고른 행. 그 행을 그대로 쓰고 종류 규칙을 적용하지 않는다 */
  dbCode?: string
  signal?: AbortSignal
}

/** 목업 모드(VITE_AI_MOCK=1)의 호출 D 고정 값 */
export const MOCK_ESTIMATE: Readonly<Nutrients> = { kcal: 200, carbs_g: 25, protein_g: 8, fat_g: 7 }
const MOCK_DELAY_MS = 300

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}
function abortError(signal?: AbortSignal): unknown {
  const r: unknown = signal?.reason
  return isAbortError(r) ? r : new DOMException('조회를 취소했습니다', 'AbortError')
}
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal)
}
/** p를 기다리되 signal이 먼저 끊기면 AbortError */
function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** 목업 호출 D: 0.3초 뒤 고정 값 */
export function mockEstimate(_name: string, signal?: AbortSignal): Promise<Nutrients> {
  return raceAbort(new Promise<Nutrients>((r) => setTimeout(() => r({ ...MOCK_ESTIMATE }), MOCK_DELAY_MS)), signal)
}

const round1 = (n: number) => Math.round(n * 10) / 10

function toReference(m: DbMatchResult): DbReference {
  return {
    db_food_code: m.food.c,
    db_name: m.food.n,
    db_match: m.match === 'partial' ? 'partial' : 'group',
    kcal_per_100g: m.food.k,
    ...(m.food.ml === 1 ? { ml_converted: true } : {}),
  }
}

/**
 * 2단계 검색(호출 C) 자리. 미구현이라 건너뜀: 무료 등급에서 검색 그라운딩이 막혀 있어(0단계 스파이크, CLAUDE.md)
 * 지금은 만들지 않는다. VITE_SEARCH_GROUNDING=on이어도 null을 돌려 3단계로 간다.
 */
async function searchStage(_name: string, _signal?: AbortSignal): Promise<NutritionResult | null> {
  return null
}

export function createNutritionResolver(deps: ResolverDeps) {
  // 호출 D 결과: 세션 메모리 → 영구 캐시 → 호출. 같은 이름의 동시 요청은 한 번만 부른다.
  const mem = new Map<string, Nutrients>()
  const inflight = new Map<string, Promise<Nutrients>>()

  function startEstimate(key: string, name: string, signal?: AbortSignal): Promise<Nutrients> {
    const run = async (): Promise<Nutrients> => {
      const stored = deps.cache ? checkPer100(await deps.cache.get(key).catch(() => null)) : null
      if (stored) return stored
      const raw = await deps.estimate!(name, signal)
      const v = checkPer100(raw)
      if (!v) throw new Error('호출 D 값이 범위를 벗어났습니다')
      void deps.cache?.put(key, v).catch(() => undefined)
      return v
    }
    const p = run()
      .then((v) => {
        mem.set(key, v)
        return v
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p
  }

  /** 호출 D(캐시 포함). 실패하면 null, 취소는 AbortError */
  async function estimateByName(name: string, signal?: AbortSignal): Promise<Nutrients | null> {
    if (!deps.estimate) return null
    const key = normalizeFoodName(name)
    if (!key) return null
    for (let tries = 0; tries < 3; tries++) {
      const hit = mem.get(key)
      if (hit) return { ...hit }
      throwIfAborted(signal)
      const p = inflight.get(key) ?? startEstimate(key, name, signal)
      try {
        return { ...(await raceAbort(p, signal)) }
      } catch (e) {
        if (signal?.aborted) throw abortError(signal)
        if (isAbortError(e)) continue // 같은 호출을 먼저 시작한 쪽이 취소했다. 다시 시작한다
        return null
      }
    }
    return null
  }

  /** DB 행 → db 결과. 탄·지 null은 guess → 호출 D → missing(0) 순으로 채운다(4.5.3 (b)) */
  async function fromDb(m: DbMatchResult, name: string, guess: Nutrients | null, signal?: AbortSignal) {
    const f = m.food
    const per: Nutrients = { kcal: f.k, carbs_g: f.cb ?? 0, protein_g: f.p, fat_g: f.f ?? 0 }
    const empty = (['carbs_g', 'fat_g'] as const).filter((k) => (k === 'carbs_g' ? f.cb : f.f) === null)
    const fill: Partial<Record<'carbs_g' | 'fat_g', FillSource>> = {}
    if (empty.length > 0) {
      const src = guess ?? (await estimateByName(name, signal))
      // 채운 값까지 탄·단·지 합이 100g을 넘지 않게 한다
      let room = Math.max(0, 100 - per.carbs_g - per.protein_g - per.fat_g)
      for (const k of empty) {
        if (src) {
          const v = round1(Math.min(src[k], room))
          per[k] = v
          room = Math.max(0, room - v)
          fill[k] = 'ai_estimate'
        } else {
          fill[k] = 'missing'
        }
      }
    }
    const r: NutritionResult = {
      source: 'db',
      per_100g: per,
      ...(empty.length > 0 ? { fill } : {}),
      db_food_code: f.c,
      db_name: f.n,
      db_match: m.match,
      ...(f.ml === 1 ? { ml_converted: true as const } : {}),
      // 4.5.5: 공개 중량은 넘기기만 한다. 적용 여부(db_match === 'name', whole_count)는 assembleAnalysis가 정한다
      ...(typeof f.w === 'number' && f.w > 0 ? { published_g: f.w } : {}),
    }
    return r
  }

  async function run(name: string, opts: ResolveOptions): Promise<NutritionResult> {
    const { dbCode, signal } = opts
    const guess = opts.guess ? checkPer100(opts.guess) : null
    throwIfAborted(signal)

    // 1 DB
    let reference: DbReference | undefined
    let m: DbMatchResult | null = null
    try {
      m = matchFood(await raceAbort(deps.loadIndex(), signal), name, dbCode)
    } catch (e) {
      if (signal?.aborted) throw abortError(signal)
      m = null // DB를 못 받으면(NUTRITION_DB_UNAVAILABLE) DB 단계 없이 진행
    }
    if (m) {
      const userPicked = !!dbCode && m.food.c === dbCode
      // 종류 규칙: 차이가 큰 음식이 대표값·뒤쪽 일치에만 맞으면 DB 값을 참고로만 붙인다
      if (!userPicked && m.match !== 'name' && isHighVarianceFood(name, m.food)) reference = toReference(m)
      else return await fromDb(m, name, guess, signal)
    }

    // 2 검색
    if (deps.searchGrounding) {
      const s = await searchStage(name, signal)
      if (s) return s
    }

    // 3 AI 추정
    const ref = reference ? { reference } : {}
    if (guess) return { source: 'ai_estimate', per_100g: guess, via: 'guess', ...ref }
    const d = await estimateByName(name, signal)
    if (d) return { source: 'ai_estimate', per_100g: d, via: 'call_d', ...ref }

    // 4 직접 입력
    throwIfAborted(signal)
    return { source: 'user_input', per_100g: null }
  }

  /** 오류를 던지지 않는다(AbortError만 예외). 예상 못 한 오류도 user_input으로 돌려준다 */
  async function resolveNutrition(name: string, opts: ResolveOptions = {}): Promise<NutritionResult> {
    try {
      return await run(name, opts)
    } catch (e) {
      if (opts.signal?.aborted) throw abortError(opts.signal)
      console.warn('[nutrition] 조회 실패', e)
      return { source: 'user_input', per_100g: null }
    }
  }

  return {
    resolveNutrition,
    /** 시험용: 세션 메모리 캐시를 비운다 */
    clearMemoryCache: () => mem.clear(),
  }
}
