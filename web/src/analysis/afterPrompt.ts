// 호출 B(먹은 후 분석) 프롬프트 b3·응답 스키마·응답 정리.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 B.
// b2(2026-10-27, 사용자 결정): 먹은 후 사진이 다른 음식처럼 보였는데 모델이 "버거는 그대로"로 가정해 남긴 비율 100%·섭취 0kcal가 된 문제.
//   - 남은 양을 사진에서 직접 볼 수 있을 때만 숫자. 그렇지 않으면 1·0으로 가정하지 않고 null + 한국어 경고.
//   - 모든 문자열(warnings)은 한국어. 응답 정리에서 koreanWarnings로 거른다. 코드 안전장치는 normalizeAfterResponse 주석.
// b3(2026-10-27, 사용자 결정): 같은 식사 장면인데 그 그릇만 먹은 후 사진에 안 보이면 "모름"으로 막지 않고 0(다 먹음)으로 미리 골라 둔다
//   (MealItem.ratio_assumed='not_visible', 화면 노란 표시, 저장 허용). 다른 음식·다른 장면·판단 불가는 b2처럼 null(확인 필요, 고르기 전 저장 막음).
//   - 이 구분을 모델 경고 문장이 아니라 응답 필드로 받는다: 맨 위 same_scene(boolean), 항목마다 match(same|not_visible|different|unclear).
//   - 0·null을 정하는 것은 코드(normalizeAfterResponse)다. 모델은 match가 same일 때만 숫자를 쓴다.
//   - same_scene·match가 없는 응답(b2 응답·옛 픽스처)은 b2 규칙 그대로. b1·b2 캐시는 prompt_version이 달라 다시 분석한다.
// 이 파일은 import.meta.env를 쓰지 않고, 값 import는 firebase/ai만 한다(Node 시험 스크립트에서도 그대로 불러 쓴다).
import { Schema, ThinkingLevel, type GenerationConfig } from 'firebase/ai'
import type { AfterItem, BeforeItem } from '../types/analysis'
import { koreanWarnings } from './koreanText.ts'

export const PROMPT_VERSION_B = 'b3'

export const SYSTEM_INSTRUCTION_B = `당신은 식사 사진을 분석하는 영양 보조 도구다.
먹기 전에 분석한 음식 목록(JSON), 먹기 전 사진, 먹은 후 사진이 주어진다. 먹기 전 사진이 빠질 수도 있다.

할 일:
1. 먼저 먹은 후 사진이 먹기 전과 같은 식사 장면인지 판단해 same_scene에 쓴다. 같은 식탁, 같은 그릇이나 포장, 같은 배경이면 true. 다른 음식, 다른 그릇, 다른 식탁, 다른 장소의 사진처럼 보이면 false.
2. 목록의 각 id에 대해 먹은 후 사진에서 같은 그릇을 location을 단서로 찾고, 그 결과를 match에 쓴다.
   - "same": 같은 그릇(또는 포장)을 찾았고 남은 양이 보인다.
   - "not_visible": 같은 식사 장면인데 그 그릇만 먹은 후 사진에 보이지 않는다(치웠거나 사진 밖에 있다).
   - "different": 그 자리에 다른 음식이나 다른 그릇이 있다.
   - "unclear": 어느 그릇인지, 또는 남은 양이 얼마인지 판단할 수 없다(가려짐, 흐림, 겹침 등).
3. match가 "same"일 때만 남은 비율 remaining_ratio를 숫자로 쓴다(0=다 먹음, 1=그대로). 빈 그릇·빈 접시·빈 포장지가 보이면 0, 손대지 않은 모양 그대로 보이면 1.
4. 목록의 모든 id를 결과에 넣는다.

규칙:
- 칼로리를 계산하지 않는다. 비율만 추정한다.
- match가 "not_visible", "different", "unclear"이면 remaining_ratio=null로 둔다. 1(그대로)이나 0(다 먹음)으로 가정하지 않는다.
- same_scene이 false이면 모든 항목을 match="different", remaining_ratio=null로 둔다.
- 목록에 없는데 먹은 후 사진에만 있는 음식은 결과에 넣지 말고 warnings에 적는다.
- 확신이 없으면 confidence를 낮게 준다.
- warnings에는 match가 "different"·"unclear"인 음식의 이유와 새로 생긴 음식만 적는다. "not_visible"인 음식은 적지 않는다.
- warnings의 모든 문장은 한국어로 쓴다. 영어로 쓰지 않는다. 음식은 목록의 name으로 부르고 "음식 이름: 이유" 형식으로 짧게 쓴다(예: "불고기 버거: 그 자리에 다른 음식이 있어 남은 양을 판단할 수 없어요").`

/** 이미지 앞에 붙이는 텍스트 파트. 순서: 목록 → "BEFORE 사진" → 먹기 전 이미지(없으면 둘 다 생략) → "AFTER 사진" → 먹은 후 이미지 */
export const USER_TEXT_BEFORE_PHOTO = 'BEFORE 사진'
export const USER_TEXT_AFTER_PHOTO = 'AFTER 사진'
/** 먹기 전 사진이 없을 때 warnings 맨 앞에 넣는 문구(스펙 4.3절) */
export const WARNING_NO_BEFORE_PHOTO = '먹기 전 사진 없이 분석'

/** 모델에 보내는 먹기 전 목록 JSON(id·이름·위치·중량). 같은 사진 캐시 키에도 이 문자열의 해시를 쓴다. */
export function buildBeforeItemsJson(items: readonly BeforeItem[]): string {
  return JSON.stringify(
    items.map((it) => ({ id: it.id, name: it.name, location: it.location, before_grams: it.before_grams })),
  )
}
export function buildBeforeItemsText(itemsJson: string): string {
  return `먹기 전 음식 목록: ${itemsJson}`
}

/** b3 항목별 매칭 결과. same=같은 그릇을 찾음, not_visible=같은 장면인데 그 그릇만 안 보임, different=다른 음식·그릇, unclear=판단 불가 */
export const MATCH_VALUES = ['same', 'not_visible', 'different', 'unclear'] as const
export type AfterMatch = (typeof MATCH_VALUES)[number]

// 응답 스키마 B(b3). 모든 필드 필수, remaining_ratio만 nullable. same_scene을 맨 앞에 두어 장면 판단을 먼저 쓰게 한다.
export const RESPONSE_SCHEMA_B = Schema.object({
  properties: {
    same_scene: Schema.boolean(),
    items: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          match: Schema.enumString({ enum: [...MATCH_VALUES] }),
          remaining_ratio: Schema.number({ nullable: true }),
          confidence: Schema.number(),
        },
      }),
    }),
    warnings: Schema.array({ items: Schema.string() }),
  },
})

export const GENERATION_CONFIG_B: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: RESPONSE_SCHEMA_B,
  // 2026-10-29 속도(사용자 결정): LOW → MINIMAL(03_vision_eval.md "AI 응답 속도")
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  maxOutputTokens: 4096,
}

// ── 응답 정리(형식 검증) ──
const MAX_MODEL_WARNINGS = 10
/**
 * 코드 안전장치(b2, b3에서는 match "same"과 match 없는 항목에만): 확신이 낮은데 "그대로(≥0.95)"나 "다 먹음(≤0.05)"으로 답한 항목은
 * 모델이 판단 대신 가정한 것으로 보고 null로 바꾼다.
 * - confidence 0.6은 needs_review 기준(compute.ts)과 같은 값이다. "낮은 확신"의 뜻을 하나로 둔다.
 * - 0.95/0.05: 모델이 가정할 때 쓰는 끝값(1·0)과 그 근처만 잡는다. 0.9·0.1처럼 실제로 본 양일 수 있는 값은 건드리지 않는다.
 */
export const ASSUMED_RATIO_HIGH = 0.95
export const ASSUMED_RATIO_LOW = 0.05
export const ASSUMED_CONFIDENCE_MAX = 0.6
export const unsureRatioWarning = (name: string) =>
  `${name}: 먹은 후 사진에서 남은 양을 판단하기 어려워요. 남긴 양을 직접 골라 주세요`
/** b3: same_scene=false일 때 넣는 경고(이 한 줄만 남긴다) */
export const WARNING_DIFFERENT_SCENE = '먹은 후 사진이 먹기 전과 다른 장면처럼 보여요. 음식마다 남긴 양을 직접 골라 주세요'
/** b3: 같은 그릇(match same)을 하나도 찾지 못했는데 안 보이는(not_visible) 그릇이 있을 때 넣는 경고 */
export const WARNING_NO_MATCHED_BOWL = '먹은 후 사진에서 먹기 전 그릇을 하나도 찾지 못했어요. 음식마다 남긴 양을 직접 골라 주세요'

export interface AfterParsed { items: AfterItem[]; warnings: string[] }
export type NormalizeAfterResult = ({ ok: true } & AfterParsed) | { ok: false; detail: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const MATCH_SET = new Set<string>(MATCH_VALUES)
function matchOf(v: unknown): AfterMatch | null {
  return typeof v === 'string' && MATCH_SET.has(v) ? (v as AfterMatch) : null
}
/** beforePrompt.ts와 같은 규칙: 빠지면 0.3, 1 초과 100 이하이면 0~100 척도로 보고 나눈다 */
function normConfidence(v: unknown): number {
  let c = num(v)
  if (c === null) return 0.3
  if (c > 1 && c <= 100) c = c / 100
  return Math.round(Math.min(1, Math.max(0, c)) * 100) / 100
}

/**
 * 모델 원본(JSON 객체) → 먹기 전 목록 순서의 AfterItem[].
 *
 * b3 응답(same_scene이 boolean이거나 match가 하나라도 있음):
 * - same_scene=false: items 내용과 상관없이 모든 항목 null, 경고는 WARNING_DIFFERENT_SCENE 한 줄만(모델 경고·항목별 경고는 버린다).
 *   items 배열이 빠져도 형식 오류로 보지 않는다(결론이 이미 나왔으니 다시 호출해 한도를 쓰지 않는다).
 * - match "not_visible": remaining_ratio=0, ratio_assumed='not_visible'(모델 숫자는 무시). 코드 경고는 넣지 않는다(화면이 항목마다 노란 표시).
 * - match "different"·"unclear": null + unsureRatioWarning(모델 숫자는 무시).
 * - match "same", 또는 match가 없거나 4개 값이 아님: 아래 b2 규칙.
 * - 같은 그릇(same)이 하나도 없는데 not_visible이 있으면 not_visible도 null + WARNING_NO_MATCHED_BOWL.
 *   not_visible은 "같은 장면"이 전제인데 먹기 전 그릇이 하나도 안 보이면 같은 장면이라는 근거가 식탁·배경뿐이다.
 *   다른 사진인데 모델이 same_scene=true로 잘못 주면 모든 그릇이 다 먹음(칼로리 최대)으로 조용히 저장되므로(b2가 막은 오류의 반대 방향),
 *   이때는 사용자가 한 번씩 고르게 한다. 빈 그릇이 보이면 same(0)이라 여기에 걸리지 않는다.
 *
 * b2 규칙(same_scene·match가 없는 응답 전체, b3의 same 항목):
 * - remaining_ratio가 0~1 밖이거나 숫자가 아니면 잘라 넣지 않고 null로 두고 경고한다.
 * - 확신이 낮은(< 0.6) 끝값(≥ 0.95 또는 ≤ 0.05)은 null로 바꾸고 한국어 경고를 넣는다(위 안전장치).
 * - 모델의 null은 그대로 둔다. 모델 경고에 그 음식 이름이 없으면 같은 한국어 경고를 넣는다.
 * - match 없는 응답에서 ratio_assumed='not_visible'이 붙은 항목은 이 함수가 정리한 결과를 다시 읽는 경우(캐시)다. 0과 표시를 그대로 둔다
 *   (확신이 낮아도 안전장치를 다시 걸지 않는다). 모델 응답 스키마에는 ratio_assumed가 없다.
 *
 * 공통:
 * - before에 없는 id·중복 id는 버리고 경고한다. 응답에 빠진 id는 remaining_ratio=null, confidence=0으로 채우고 경고한다.
 * - 모델 경고는 koreanWarnings로 거른다(한국어가 아니면 일반 안내 한 줄).
 * - 형식 오류(재시도 대상): items 배열 없음(same_scene=false 제외), 응답 항목이 있는데 before id와 하나도 맞지 않음.
 */
export function normalizeAfterResponse(raw: unknown, before: readonly BeforeItem[]): NormalizeAfterResult {
  if (!isObj(raw)) return { ok: false, detail: 'items 배열이 없습니다' }
  const differentScene = raw.same_scene === false
  if (!Array.isArray(raw.items) && !differentScene) return { ok: false, detail: 'items 배열이 없습니다' }
  const rawItems: unknown[] = Array.isArray(raw.items) ? raw.items : []
  const isB3 = typeof raw.same_scene === 'boolean' || rawItems.some((it) => isObj(it) && typeof it.match === 'string')
  const warnings: string[] = Array.isArray(raw.warnings)
    ? koreanWarnings(raw.warnings.filter((w): w is string => typeof w === 'string')).slice(0, MAX_MODEL_WARNINGS)
    : []
  const modelWarnings = [...warnings]

  const nameOf = new Map(before.map((b) => [b.id, b.name]))
  const got = new Map<string, AfterItem>()
  const unknownIds: string[] = []
  const notVisibleIds: string[] = []
  let sameCount = 0
  let malformed = 0
  for (const it of rawItems) {
    const id = isObj(it) && typeof it.id === 'string' ? it.id.trim() : ''
    if (!id) {
      malformed++
      continue
    }
    if (!nameOf.has(id)) {
      unknownIds.push(id)
      continue
    }
    if (got.has(id)) {
      warnings.push(`${nameOf.get(id)}: 같은 항목이 두 번 와서 첫 번째만 썼습니다`)
      continue
    }
    const rec = it as Record<string, unknown>
    const name = nameOf.get(id) ?? id
    const confidence = normConfidence(rec.confidence)
    const match: AfterMatch | null = isB3 ? matchOf(rec.match) : rec.ratio_assumed === 'not_visible' ? 'not_visible' : null

    if (match === 'not_visible') {
      notVisibleIds.push(id)
      got.set(id, { id, remaining_ratio: 0, confidence, ratio_assumed: 'not_visible' })
      continue
    }
    if (match === 'different' || match === 'unclear') {
      // 모델이 그 음식 이유를 이미 한국어로 적었으면 같은 뜻의 경고를 또 넣지 않는다
      if (!modelWarnings.some((w) => w.includes(name))) warnings.push(unsureRatioWarning(name))
      got.set(id, { id, remaining_ratio: null, confidence })
      continue
    }
    if (match === 'same') sameCount++

    // b2 규칙(match same, 또는 match 없음)
    const r = rec.remaining_ratio
    let remaining_ratio: number | null = null
    if (r === null) {
      if (!modelWarnings.some((w) => w.includes(name))) warnings.push(unsureRatioWarning(name))
    } else {
      const n = num(r)
      if (n !== null && n >= 0 && n <= 1) remaining_ratio = Math.round(n * 100) / 100
      else warnings.push(`${name}: 남긴 비율 값(${String(r)})이 0~1 밖이라 직접 골라 주세요`)
    }
    if (
      remaining_ratio !== null &&
      confidence < ASSUMED_CONFIDENCE_MAX &&
      (remaining_ratio >= ASSUMED_RATIO_HIGH || remaining_ratio <= ASSUMED_RATIO_LOW)
    ) {
      remaining_ratio = null
      warnings.push(unsureRatioWarning(name))
    }
    got.set(id, { id, remaining_ratio, confidence })
  }

  if (differentScene) {
    return {
      ok: true,
      items: before.map((b) => ({ id: b.id, remaining_ratio: null, confidence: got.get(b.id)?.confidence ?? 0 })),
      warnings: [WARNING_DIFFERENT_SCENE],
    }
  }
  if (rawItems.length > 0 && got.size === 0) {
    return { ok: false, detail: '먹기 전 목록의 id와 맞는 항목이 없습니다' }
  }
  if (isB3 && sameCount === 0 && notVisibleIds.length > 0) {
    for (const id of notVisibleIds) got.set(id, { id, remaining_ratio: null, confidence: got.get(id)?.confidence ?? 0 })
    warnings.push(WARNING_NO_MATCHED_BOWL)
  }
  if (unknownIds.length > 0) warnings.push(`먹기 전 목록에 없는 항목(${unknownIds.slice(0, 5).join(', ')})을 뺐습니다`)
  if (malformed > 0) warnings.push(`먹은 후 결과 중 ${malformed}개 항목을 형식 오류로 뺐습니다`)

  const items: AfterItem[] = before.map((b) => {
    const hit = got.get(b.id)
    if (hit) return hit
    warnings.push(`${b.name}: 먹은 후 결과가 없어 남긴 비율을 직접 골라 주세요`)
    return { id: b.id, remaining_ratio: null, confidence: 0 }
  })
  return { ok: true, items, warnings }
}

/** 모델 응답 텍스트 → JSON 파싱 → 정리 */
export function parseAfterText(text: string, before: readonly BeforeItem[]): NormalizeAfterResult {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, detail: 'JSON 파싱 실패' }
  }
  return normalizeAfterResponse(raw, before)
}
