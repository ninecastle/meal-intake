import type { MealType } from '../data/meals'

// 날짜 키와 끼니는 기기 시간대가 아니라 앱 시간대(Asia/Seoul) 기준이다.
// 자정 전후 식사가 다른 날로 잡히지 않게 한다(스펙 2.2절, firebase-stack).
export const APP_TIMEZONE = 'Asia/Seoul'

const fmtCache = new Map<string, Intl.DateTimeFormat>()

function formatter(kind: 'date' | 'hour', tz: string): Intl.DateTimeFormat {
  const key = `${kind}|${tz}`
  let f = fmtCache.get(key)
  if (!f) {
    f =
      kind === 'date'
        ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        : new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' })
    fmtCache.set(key, f)
  }
  return f
}

/** "YYYY-MM-DD". 엔진마다 en-CA 구분자가 다를 수 있어 부분값으로 조립한다. */
export function toDateKey(d: Date, tz: string = APP_TIMEZONE): string {
  const parts = formatter('date', tz).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** 앱 시간대의 시(0~23) */
export function hourIn(d: Date, tz: string = APP_TIMEZONE): number {
  const h = formatter('hour', tz).formatToParts(d).find((p) => p.type === 'hour')?.value
  return Number(h ?? 0) % 24
}

/** 먹기 전 촬영 시각 기준 끼니(스펙 2.2절): 05~10시 아침, 11~15시 점심, 17~21시 저녁, 그 밖(16시, 22~04시) 간식 */
export function guessMealType(d: Date, tz: string = APP_TIMEZONE): MealType {
  // 2026-10-27 사용자 결정: 아침 05:00~09:59, 점심 10:00~14:59, 저녁 15:00~20:59, 그 밖(21:00~04:59)은 간식.
  // 기준 시각은 먹기 전 사진 시각(앨범 사진이면 찍은 시각, 카메라 조각 3)이다.
  const h = hourIn(d, tz)
  if (h >= 5 && h < 10) return 'breakfast'
  if (h >= 10 && h < 15) return 'lunch'
  if (h >= 15 && h < 21) return 'dinner'
  return 'snack'
}
