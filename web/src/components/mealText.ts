// 홈(하루 요약 S1)·기록 상세(S7)·결과 수정 편집기가 함께 쓰는 표시 문구, 숫자 형식, 날짜 키 계산.
// 분석 모듈·Firebase SDK를 import하지 않는다(홈 첫 번들에 들어가도 가볍게).
import type { MealType } from '../data/meals'
import { APP_TIMEZONE } from '../lib/time'
import type { MealItem } from '../types/analysis'

/** 하루 요약에 보이는 끼니 순서 */
export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const MEAL_TYPE_LABEL: Record<MealType, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁', snack: '간식' }

export const NUTRITION_SOURCE_NOTE = '영양 정보: 식품의약품안전처 식품영양성분 DB(2026-10-06 갱신본)'

type SourceFields = Pick<MealItem, 'nutrition_source' | 'db_ml_converted'>

export const SOURCE_BADGE_CLASS: Record<MealItem['nutrition_source'], string> = {
  db: 'bg-green-100 text-green-800',
  search: 'bg-blue-100 text-blue-800',
  ai_estimate: 'bg-amber-100 text-amber-800',
  user_input: 'bg-gray-200 text-gray-800',
}

export function sourceLabel(it: SourceFields): string {
  switch (it.nutrition_source) {
    case 'db':
      return it.db_ml_converted ? 'DB(환산)' : 'DB'
    case 'search':
      return '검색 기반'
    case 'ai_estimate':
      return 'AI 추정'
    case 'user_input':
      return '직접 입력'
  }
}

export function formatKcal(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

export function formatGrams(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

/** 탄·단·지 g: 10g 미만은 소수 한 자리 */
export function formatMacro(n: number): string {
  return n < 10 ? String(Math.round(n * 10) / 10) : Math.round(n).toLocaleString('ko-KR')
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
