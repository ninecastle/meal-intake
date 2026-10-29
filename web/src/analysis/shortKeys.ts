// 응답 칸 이름 줄이기(2026-10-29 속도, 사용자 결정 — 호출 A a8): 모델에는 짧은 칸 이름으로 답하게 해 출력 토큰을 줄이고,
// 응답을 받자마자 정리 함수 맨 앞에서 원래 이름(앱 타입·캐시·저장 형식의 이름)으로 되돌린다. 바깥에서는 아무것도 바뀌지 않는다.
// 되돌리기는 원래 이름이 이미 있으면 건드리지 않는다 → 예전 응답(a7 이하)·캐시·픽스처(원래 이름)도 그대로 읽힌다.
// 호출 B는 실측에서 출력 토큰이 6%만 줄어(10% 미만) 원래 이름 그대로 둔다(03_vision_eval.md "칸 이름 줄이기").
// 이 파일은 import를 하지 않는다(Node 시험 스크립트에서도 그대로 불러 쓴다).

type Obj = Record<string, unknown>
type KeyMap = Readonly<Record<string, string>>

/** 호출 A 맨 위 */
export const SHORT_A_TOP: KeyMap = { f: 'items', w: 'warnings' }
/** 호출 A 음식 하나 */
export const SHORT_A_ITEM: KeyMap = { n: 'name', l: 'location', g: 'before_grams', c: 'confidence', p: 'per_100g_guess', wc: 'whole_count', d: 'detail_guess' }
/** 호출 A 100g당 kcal·탄·단·지 */
export const SHORT_A_PER100: KeyMap = { k: 'kcal', c: 'carbs_g', p: 'protein_g', f: 'fat_g' }
/** 호출 A 세부 영양소 9가지(순서는 compute.ts DETAIL_KEYS) */
export const SHORT_A_DETAIL: KeyMap = {
  su: 'sugar_g', fi: 'fiber_g', sf: 'satfat_g', tf: 'transfat_g', pu: 'polyunsat_g', mu: 'monounsat_g',
  ch: 'cholesterol_mg', na: 'sodium_mg', ka: 'potassium_mg',
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 짧은 이름 → 원래 이름. 원래 이름이 이미 있으면 그 칸은 그대로 둔다(짧은 칸은 버린다). 객체가 아니면 그대로 */
export function expandKeys(v: unknown, map: KeyMap): unknown {
  if (!isObj(v)) return v
  const out: Obj = {}
  for (const [k, val] of Object.entries(v)) {
    const long = Object.prototype.hasOwnProperty.call(map, k) ? map[k] : undefined
    if (long === undefined) out[k] = val
    else if (!Object.prototype.hasOwnProperty.call(v, long)) out[long] = val
  }
  return out
}

/** 호출 A 응답(짧은 이름이든 원래 이름이든) → 원래 이름 */
export function expandBeforeRaw(raw: unknown): unknown {
  const top = expandKeys(raw, SHORT_A_TOP)
  if (!isObj(top) || !Array.isArray(top.items)) return top
  return {
    ...top,
    items: top.items.map((it) => {
      const x = expandKeys(it, SHORT_A_ITEM)
      if (!isObj(x)) return x
      const out: Obj = { ...x }
      if ('per_100g_guess' in x) out.per_100g_guess = expandKeys(x.per_100g_guess, SHORT_A_PER100)
      if ('detail_guess' in x) out.detail_guess = expandKeys(x.detail_guess, SHORT_A_DETAIL)
      return out
    }),
  }
}
