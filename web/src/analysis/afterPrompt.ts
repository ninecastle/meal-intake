// 호출 B(먹은 후 분석) 프롬프트 b2·응답 스키마·응답 정리.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 B.
// b2(2026-10-27, 사용자 결정): 먹은 후 사진이 다른 음식처럼 보였는데 모델이 "버거는 그대로"로 가정해 남긴 비율 100%·섭취 0kcal가 된 문제.
//   - 남은 양을 사진에서 직접 볼 수 있을 때만 숫자. 다른 음식·그릇·식탁처럼 보이거나, 그릇이 안 보이거나, 판단할 수 없으면 null + 한국어 경고.
//   - b1의 "그릇이 안 보이면 0(confidence 0.5 이하)"은 없앴다. 다 먹고 치운 것과 사진 밖에 있는 것을 구분할 수 없고,
//     장면이 다른 사진이면 모든 그릇이 "안 보임"이 되어 전부 다 먹은 것(0)으로 조용히 계산되기 때문이다. 빈 그릇·포장지가 보이면 0.
//   - 모든 문자열(warnings)은 한국어. 응답 정리에서 koreanWarnings로 거른다. 코드 안전장치는 normalizeAfterResponse 주석.
//   b1 캐시는 다시 분석한다(prompt_version으로 구분).
// 이 파일은 import.meta.env를 쓰지 않고, 값 import는 firebase/ai만 한다(Node 시험 스크립트에서도 그대로 불러 쓴다).
import { Schema, ThinkingLevel, type GenerationConfig } from 'firebase/ai'
import type { AfterItem, BeforeItem } from '../types/analysis'
import { koreanWarnings } from './koreanText.ts'

export const PROMPT_VERSION_B = 'b2'

export const SYSTEM_INSTRUCTION_B = `당신은 식사 사진을 분석하는 영양 보조 도구다.
먹기 전에 분석한 음식 목록(JSON), 먹기 전 사진, 먹은 후 같은 식탁 사진이 주어진다. 먹기 전 사진이 빠질 수도 있다.

할 일:
1. 먼저 먹은 후 사진이 먹기 전과 같은 식사(같은 음식, 같은 그릇, 같은 식탁)인지 확인한다.
2. 목록의 각 id에 대해 먹은 후 사진에서 같은 그릇을 location을 단서로 찾는다.
3. 남은 비율 remaining_ratio를 추정한다(0=다 먹음, 1=그대로). 목록의 모든 id를 결과에 넣는다.

규칙:
- 칼로리를 계산하지 않는다. 비율만 추정한다.
- remaining_ratio는 먹은 후 사진에서 그 음식의 남은 양을 직접 보고 판단할 수 있을 때만 숫자로 쓴다. 빈 그릇·빈 접시·빈 포장지가 보이면 0, 손대지 않은 모양 그대로 보이면 1.
- 다음 경우에는 1(그대로)이나 0(다 먹음)으로 가정하지 말고 remaining_ratio=null로 둔다. 그리고 warnings에 이유를 적는다.
  - 먹은 후 사진이 먹기 전과 다른 음식, 다른 그릇, 다른 식탁처럼 보일 때
  - 그 음식의 그릇이 먹은 후 사진에 보이지 않을 때(다 먹고 치웠는지 사진 밖에 있는지 알 수 없다)
  - 어느 그릇인지 판단할 수 없거나, 가려지거나 흐려서 남은 양을 판단할 수 없을 때
- 목록에 없는데 먹은 후 사진에만 있는 음식은 결과에 넣지 말고 warnings에 적는다.
- 확신이 없으면 confidence를 낮게 준다.
- warnings의 모든 문장은 한국어로 쓴다. 영어로 쓰지 않는다. 음식은 목록의 name으로 부르고 "음식 이름: 이유" 형식으로 짧게 쓴다(예: "불고기 버거: 먹은 후 사진이 다른 음식처럼 보여 남은 양을 판단할 수 없어요").`

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

// 응답 스키마 B. 템플릿상 모든 필드 필수, remaining_ratio만 nullable.
export const RESPONSE_SCHEMA_B = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
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
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  maxOutputTokens: 4096,
}

// ── 응답 정리(형식 검증) ──
const MAX_MODEL_WARNINGS = 10
/**
 * 코드 안전장치(b2): 확신이 낮은데 "그대로(≥0.95)"나 "다 먹음(≤0.05)"으로 답한 항목은 모델이 판단 대신 가정한 것으로 보고 null로 바꾼다.
 * - confidence 0.6은 needs_review 기준(compute.ts)과 같은 값이다. "낮은 확신"의 뜻을 하나로 둔다.
 * - 0.95/0.05: 모델이 가정할 때 쓰는 끝값(1·0)과 그 근처만 잡는다. 0.9·0.1처럼 실제로 본 양일 수 있는 값은 건드리지 않는다.
 * - 아래쪽(0 근처)도 넣은 이유: 사용자 요청이 "100% 남김(또는 0%)으로 조용히 가정하지 말 것"이고,
 *   b1의 "그릇이 안 보이면 0, confidence 0.5 이하" 습관이 남아 있으면 그대로 저장되기 때문이다.
 */
export const ASSUMED_RATIO_HIGH = 0.95
export const ASSUMED_RATIO_LOW = 0.05
export const ASSUMED_CONFIDENCE_MAX = 0.6
export const unsureRatioWarning = (name: string) =>
  `${name}: 먹은 후 사진에서 남은 양을 판단하기 어려워요. 남긴 양을 직접 골라 주세요`

export interface AfterParsed { items: AfterItem[]; warnings: string[] }
export type NormalizeAfterResult = ({ ok: true } & AfterParsed) | { ok: false; detail: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
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
 * - before에 없는 id·중복 id는 버리고 경고한다.
 * - 응답에 빠진 id는 remaining_ratio=null, confidence=0으로 채우고 경고한다.
 * - remaining_ratio가 0~1 밖이거나 숫자가 아니면 잘라 넣지 않고 null로 두고 경고한다.
 * - 확신이 낮은(< 0.6) 끝값(≥ 0.95 또는 ≤ 0.05)은 null로 바꾸고 한국어 경고를 넣는다(위 안전장치).
 * - 모델의 null은 그대로 둔다. 모델 경고에 그 음식 이름이 없으면(영어 경고가 일반 안내로 바뀐 경우 등) 같은 한국어 경고를 넣는다.
 * - 모델 경고는 koreanWarnings로 거른다(한국어가 아니면 일반 안내 한 줄).
 * - 형식 오류(재시도 대상): items 배열 없음, 응답 항목이 있는데 before id와 하나도 맞지 않음.
 */
export function normalizeAfterResponse(raw: unknown, before: readonly BeforeItem[]): NormalizeAfterResult {
  if (!isObj(raw) || !Array.isArray(raw.items)) return { ok: false, detail: 'items 배열이 없습니다' }
  const warnings: string[] = Array.isArray(raw.warnings)
    ? koreanWarnings(raw.warnings.filter((w): w is string => typeof w === 'string')).slice(0, MAX_MODEL_WARNINGS)
    : []
  const modelWarnings = [...warnings]

  const nameOf = new Map(before.map((b) => [b.id, b.name]))
  const got = new Map<string, AfterItem>()
  const unknownIds: string[] = []
  let malformed = 0
  for (const it of raw.items) {
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
    const name = nameOf.get(id) ?? id
    const r = (it as Record<string, unknown>).remaining_ratio
    const confidence = normConfidence((it as Record<string, unknown>).confidence)
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

  if (raw.items.length > 0 && got.size === 0) {
    return { ok: false, detail: '먹기 전 목록의 id와 맞는 항목이 없습니다' }
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
