// 프랜차이즈 보충표 화면 도우미(2026-10-29 사용자 결정, CLAUDE.md "프랜차이즈 보충표" bullet).
// 값 찾기·1개 중량 순서는 analysis/nutrition/franchise.ts(vision 담당)가 정한다. 여기서는 화면에 쓸 모양만 만든다:
// 메뉴 목록 줄(1개 kcal), 이름 검색의 메뉴 후보, 개수 ↔ 무게, 가게 칩 분류 말.
import { useEffect, useState } from 'react'
import { loadNutritionDb } from '../../analysis/nutrition'
import { recomputeItem } from '../../analysis/compute'
import {
  brandMenus,
  categoryOfName,
  franchiseBrands,
  servingOf,
  loadFranchise,
  type BrandId,
  type FranchiseBrand,
  type FranchiseTable,
  type FranchiseUnit,
  type MenuPick,
} from '../../analysis/nutrition/franchise'
import type { MealItem } from '../../types/analysis'
export { countLabel, countOf, countStep, MAX_COUNT } from '../mealText'

export type { BrandId, FranchiseBrand, MenuPick }

/** 메뉴 목록 한 줄: 메뉴와 1단위 kcal(모르면 null) */
export type MenuRow = { pick: MenuPick; kcal: number | null; size?: string }

const compact = (s: string) => s.replace(/\s+/g, '').toLowerCase()

let tableP: Promise<FranchiseTable> | null = null
/** 보충표를 한 번만 받는다(실패하면 다음에 다시 시도) */
export function franchiseTable(): Promise<FranchiseTable> {
  if (tableP) return tableP
  const p = loadFranchise()
  tableP = p
  p.catch(() => {
    if (tableP === p) tableP = null
  })
  return p
}

/** 저장용 연결 메뉴(undefined 키 없이, Firestore가 거부하지 않게) */
export function menuRef(pick: MenuPick): { menuId?: string; dbCode?: string } {
  return { ...(pick.menuId ? { menuId: pick.menuId } : {}), ...(pick.dbCode ? { dbCode: pick.dbCode } : {}) }
}

/** 프랜차이즈 표시가 있는 카드만 보충표를 불러 브랜드 이름표를 붙인다 */
export function useFranchiseTable(need: boolean): FranchiseTable | null {
  const [t, setT] = useState<FranchiseTable | null>(null)
  useEffect(() => {
    if (!need || t) return
    let alive = true
    franchiseTable()
      .then((x) => alive && setT(x))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [need, t])
  return t
}

export function brandNameOf(t: FranchiseTable | null, id: BrandId | null | undefined): string | null {
  if (!t || !id) return null
  return t.brands.find((b) => b.id === id)?.name ?? null
}

function rowOf(t: FranchiseTable, pick: MenuPick): MenuRow {
  const m = pick.menuId ? t.menus.find((x) => x.id === pick.menuId) : undefined
  let kcal: number | null = m?.perUnit?.kcal ?? null
  if (kcal == null && m?.per100?.kcal != null && pick.unitWeight_g) kcal = (m.per100.kcal * pick.unitWeight_g) / 100
  return { pick, kcal: kcal == null ? null : Math.round(kcal), size: m?.size }
}

/** 그 브랜드 메뉴 목록(보충표 + DB 브랜드 메뉴, brandMenus가 정한 순서) */
export async function menusOf(brand: BrandId): Promise<MenuRow[]> {
  const [t, picks] = await Promise.all([franchiseTable(), brandMenus(brand)])
  return picks.map((p) => rowOf(t, p))
}

/** 이름 검색 후보에 넣을 프랜차이즈 메뉴: 메뉴 이름(+브랜드 이름)에 입력한 글자가 든 것 */
export async function searchMenus(q: string, limit = 6): Promise<MenuRow[]> {
  const c = compact(q)
  if (!c) return []
  const t = await franchiseTable()
  const out: MenuRow[] = []
  for (const b of t.brands) {
    const names = [b.name, ...b.aliases].map(compact)
    for (const p of await brandMenus(b.id)) {
      const nm = compact(p.name)
      if (nm.includes(c) || names.some((bn) => (bn + nm).includes(c) || (nm + bn).includes(c))) out.push(rowOf(t, p))
    }
  }
  // 이름이 짧을수록(더 딱 맞을수록) 먼저
  out.sort((a, b) => a.pick.name.length - b.pick.name.length)
  return out.slice(0, limit)
}

/** 가게 칩 분류: 음식 이름으로 보충표 분류를 고른다(화면 문구 "어느 가게 ○○인가요?"). 분류를 모르면 메뉴가 있는 모든 브랜드 */
const WORD: Record<string, string> = { burger: '버거', chicken: '치킨', pizza: '피자', drink: '음료', dessert: '디저트', side: '사이드', set: '세트' }
export function categoryOf(name: string): { id: string | undefined; word: string } {
  const id = categoryOfName(name) ?? undefined
  return { id, word: (id && WORD[id]) || '음식' }
}

/** 그 분류 메뉴가 실제로 있는 브랜드 */
export async function brandsFor(name: string): Promise<FranchiseBrand[]> {
  return franchiseBrands(categoryOf(name).id)
}

/** 무게 = 1단위 중량 × 개수. 저장 규칙(compute publishedFields)에 맞게 공개 중량 세 필드를 함께 둔다.
 *  1인분(unit '인분', DB 1회 제공량)도 같은 필드를 쓰고, 화면에서 "공개 중량" 대신 "1인분 ○g 기준"으로 보인다 */
export function withUnits(it: MealItem, unitG: number, count: number, unit?: FranchiseUnit): MealItem {
  const next: MealItem = { ...it, before_grams: Math.round(unitG * count), published_g: unitG, unit_count: count, grams_source: 'published' }
  if (unit) next.unit = unit
  return recomputeItem(next)
}

/** 프랜차이즈가 아닌 DB 음식의 1회 제공량(g). 없으면 null(지금 식약처 원본은 이 칸이 비어 늘 null — vision 확인 2026-10-29) */
export async function servingGrams(dbCode: string): Promise<number | null> {
  try {
    await loadNutritionDb()
    return servingOf(dbCode)
  } catch {
    return null
  }
}
