// 식약처 세부 영양소(당류·나트륨·포화지방·식이섬유) 100g당 값(D4-a). 앱 DB(db.ts)와 따로 두고 처음 쓸 때만 받는다.
// 파일: web/public/data/mfds-detail-20261006.json(web/scripts/build-mfds-db.mjs가 앱 DB와 같은 행 선택으로 만든다).
// 상대 import에 .ts 확장자를 붙인다: Node 시험 스크립트가 이 파일을 그대로 불러오기 때문이다.
import { DETAIL_KEYS, DETAIL_MAX_PER_100G } from '../compute.ts'
import type { DetailKey, DetailNutrients } from '../../types/analysis.ts'

export interface MfdsDetailDb {
  version: string
  source: string
  /** foods 배열 자리의 키 순서(지금은 sugar_g·sodium_mg·satfat_g·fiber_g) */
  keys: string[]
  /** 식품코드 → keys 순서의 100g당 값, 빈 값은 null. 네 값이 모두 빈 음식은 없다 */
  foods: Record<string, (number | null)[]>
}

export const MFDS_DETAIL_URL = `${import.meta.env?.BASE_URL ?? '/'}data/mfds-detail-20261006.json`

const emptyDb = (): MfdsDetailDb => ({ version: '', source: '', keys: [], foods: {} })

async function fetchDefault(): Promise<MfdsDetailDb> {
  const res = await fetch(MFDS_DETAIL_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as MfdsDetailDb
}

let loading: Promise<MfdsDetailDb> | null = null

/**
 * 세부 영양소 표를 한 번만 받아 캐시한다. 실패하면 던지지 않고 빈 표를 돌려주며(화면은 "–"), 다음 호출에서 다시 받는다.
 * fetchDb는 Node 시험용(파일에서 읽기)이며 받기를 시작하는 호출의 것만 쓴다.
 */
export function loadDetailDb(fetchDb: () => Promise<MfdsDetailDb> = fetchDefault): Promise<MfdsDetailDb> {
  loading ??= fetchDb()
    .then((db) => {
      if (!db || typeof db !== 'object' || !Array.isArray(db.keys) || !db.foods || typeof db.foods !== 'object')
        throw new Error('형식 오류')
      return db
    })
    .catch(() => {
      loading = null
      return emptyDb()
    })
  return loading
}

/** 식품코드의 세부 영양소 100g당 값. 값이 있는 키만(범위 0~상한), 하나도 없거나 코드가 없으면 null. 던지지 않는다 */
export async function detailFor(code: string): Promise<DetailNutrients | null> {
  if (typeof code !== 'string' || code === '') return null
  const db = await loadDetailDb()
  const row = Object.prototype.hasOwnProperty.call(db.foods, code) ? db.foods[code] : undefined
  if (!Array.isArray(row)) return null
  const out: DetailNutrients = {}
  db.keys.forEach((k, i) => {
    const v = row[i]
    if (!(DETAIL_KEYS as readonly string[]).includes(k)) return
    const key = k as DetailKey
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= DETAIL_MAX_PER_100G[key]) out[key] = v
  })
  return Object.keys(out).length > 0 ? out : null
}
