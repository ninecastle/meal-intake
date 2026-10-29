// 홈(하루 요약 S1)·기록 상세(S7)·결과 수정 편집기가 함께 쓰는 표시 문구, 숫자 형식, 날짜 키 계산.
// 분석 모듈·Firebase SDK를 import하지 않는다(홈 첫 번들에 들어가도 가볍게).
import type { MealType } from '../data/meals'
import { APP_TIMEZONE } from '../lib/time'
import type { DetailKey, MealItem } from '../types/analysis'
import type { FranchiseUnit } from '../analysis/nutrition/franchise'

/** 하루 요약에 보이는 끼니 순서 */
export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const MEAL_TYPE_LABEL: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' }

export const NUTRITION_SOURCE_NOTE = '영양 정보: 식품의약품안전처 식품영양성분 DB(2026-10-06 갱신본)'

type SourceFields = Pick<MealItem, 'nutrition_source' | 'db_ml_converted'>

export function sourceLabel(it: SourceFields): string {
  switch (it.nutrition_source) {
    case 'db':
      return it.db_ml_converted ? 'DB 환산' : 'DB' // 시안 배지 문구(2026-10-27 사용자 결정)
    case 'search':
      return '검색 기반'
    case 'ai_estimate':
      return 'AI 추정'
    case 'user_input':
      return '직접 입력'
    case 'official':
      return '공식 정보' // 프랜차이즈 보충표(2026-10-29 사용자 결정)
  }
}

/** 출처 배지(.srcb) 색: 기본은 시안 lime(DB), "공식 정보"만 sky로 구별한다 */
export function sourceBadgeStyle(it: Pick<MealItem, 'nutrition_source'>): { background: string; color: string } | undefined {
  return it.nutrition_source === 'official' ? { background: 'var(--sky-soft)', color: 'var(--sky-deep)' } : undefined
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

export function formatGrams(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

/** 시안 pct(): 탄·단·지 에너지 비율(정수 %). 끼니 화면·결과 화면의 .stack 막대 */
export function macroPct(carbs_g: number, protein_g: number, fat_g: number): { c: number; p: number; f: number } {
  const kc = carbs_g * 4 + protein_g * 4 + fat_g * 9 || 1
  return {
    c: Math.round(((carbs_g * 4) / kc) * 100),
    p: Math.round(((protein_g * 4) / kc) * 100),
    f: Math.round(((fat_g * 9) / kc) * 100),
  }
}

/** 탄·단·지 g: 10g 미만은 소수 한 자리 */
export function formatMacro(n: number): string {
  return n < 10 ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString('ko-KR')
}

/** 세부 영양소 값(D4): g은 소수 첫째 자리, mg(나트륨·콜레스테롤·칼륨)은 쉼표 정수. space면 숫자와 단위 사이를 띄운다(시안 영양정보 표 "12 g") */
export function formatDetail(key: DetailKey, v: number, space = false): string {
  const mg = key.endsWith('_mg')
  const n = mg ? Math.round(v).toLocaleString('ko-KR') : String(Math.round(v * 10) / 10)
  return `${n}${space ? ' ' : ''}${mg ? 'mg' : 'g'}`
}

/** 시:분(서울) */
export const clockFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: APP_TIMEZONE, hour: 'numeric', minute: '2-digit' })

const dateFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: APP_TIMEZONE, month: 'long', day: 'numeric', weekday: 'short' })

function ymd(dateKey: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = dateKey.split('-').map(Number)
  return [y, m, d]
}

/** 'YYYY-MM-DD' 꼴이고 달력에 있는 날짜인지 */
export function isDateKey(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = ymd(s)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** 달력 날짜를 days만큼 옮긴다(시간대와 무관한 날짜 계산) */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = ymd(dateKey)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** '10월 26일 (월)' 꼴 */
export function dateKeyLabel(dateKey: string): string {
  const [y, m, d] = ymd(dateKey)
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d, 3))) // 서울 정오
}

/** 그 날짜의 홈(하루 요약) 경로. 오늘이면 ?date를 붙이지 않는다. */
export function homeHref(dateKey: string, today: string): string {
  return dateKey === today ? '/' : `/?date=${dateKey}`
}

/** 1단위 중량을 쓰는 음식(프랜차이즈 메뉴 공개 중량·1인분): 개수·단위·1개 중량. 없으면 null(무게 칸 그대로, 2026-10-29 사용자 결정) */
export function countOf(it: MealItem): { count: number; unit: FranchiseUnit; unitG: number } | null {
  if (it.published_g == null || it.unit_count == null || !(it.published_g > 0)) return null
  return { count: it.unit_count, unit: it.unit ?? '개', unitG: it.published_g }
}

/** 공식 1단위 값만 있고 중량을 모르는 메뉴(pickToNutrition unitWeight_source 'nominal'): 1단위 = 100g으로 둔 것이라 무게를 숨긴다.
 *  공개 중량 규칙(스펙 4.5.5)은 100g 식품중량을 쓰지 않으므로 official + 1단위 100g이면 nominal이다 */
export function isNominalUnit(it: Pick<MealItem, 'nutrition_source' | 'grams_source' | 'published_g'>): boolean {
  return it.nutrition_source === 'official' && it.grams_source === 'published' && it.published_g === 100
}

/** 치킨처럼 나눠 먹는 메뉴(마리)는 0.5 단위 */
export const countStep = (it: Pick<MealItem, 'unit'>): number => (it.unit === '마리' ? 0.5 : 1)
/** 저장 규칙(unit_count 1~10)에 맞춘 상한 */
export const MAX_COUNT = 10

/** "1개", "1.5마리", "2인분" */
export function countLabel(n: number, unit: string): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`
}
