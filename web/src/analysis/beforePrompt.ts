// 호출 A(먹기 전 분석) 프롬프트 a1·응답 스키마·응답 정리.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 A.
// 이 파일은 import.meta.env를 쓰지 않는다(Node 시험 스크립트에서도 그대로 불러 쓴다).
import { Schema, ThinkingLevel, type GenerationConfig } from 'firebase/ai'
import type { BeforeItem, Nutrients } from '../types/analysis'

export const PROMPT_VERSION_A = 'a1'

export const SYSTEM_INSTRUCTION_A = `당신은 식사 사진을 분석하는 영양 보조 도구다. 먹기 전 식탁 사진 한 장이 주어진다.

할 일:
1. 보이는 음식을 그릇 단위로 모두 나열하고 i1, i2 … 순서로 id를 붙인다.
2. name은 한국 식품영양성분 DB에 있을 법한 일반 음식명으로 쓴다(예: "김치찌개", "제육볶음", "쌀밥").
3. location에 그릇 위치와 모양을 짧게 적는다(예: "왼쪽 위 흰 밥공기"). 나중에 먹은 후 사진에서 같은 그릇을 찾는 데 쓴다.
4. 각 음식의 먹기 전 중량(g)을 추정한다. 수저, 표준 밥공기(밥 약 210g), 접시 크기를 단서로 쓴다.
5. 국·찌개는 건더기와 국물을 별도 항목으로 나눈다.
6. per_100g_guess에 100g당 kcal, 탄수화물·단백질·지방(g) 추정값을 적는다. DB에 없을 때만 쓰이는 예비값이다.

규칙:
- 섭취량이나 총 칼로리를 계산하지 않는다.
- 확신이 없으면 confidence를 낮게 준다. 추측을 사실처럼 쓰지 않는다.`

/** 사용자 메시지 첫 텍스트 파트. 그다음 파트가 이미지다. */
export const USER_TEXT_A = 'BEFORE 사진'

// 응답 스키마 A. 템플릿에서 모든 필드가 필수라 optionalProperties는 없다.
const per100Schema = Schema.object({
  properties: {
    kcal: Schema.number(),
    carbs_g: Schema.number(),
    protein_g: Schema.number(),
    fat_g: Schema.number(),
  },
})
export const RESPONSE_SCHEMA_A = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          name: Schema.string(),
          location: Schema.string(),
          before_grams: Schema.number(),
          confidence: Schema.number(),
          per_100g_guess: per100Schema,
        },
      }),
    }),
    warnings: Schema.array({ items: Schema.string() }),
  },
})

export const GENERATION_CONFIG_A: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: RESPONSE_SCHEMA_A,
  // 가장 낮은 수준. 0단계 스파이크에서 3.5 Flash-Lite가 LOW를 받았다(3.8 Flash는 MINIMAL 불가).
  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  maxOutputTokens: 4096,
}

// ── 응답 정리(형식 검증) ──
export const GRAMS_MIN = 1
export const GRAMS_MAX = 3000
export const MAX_ITEMS = 30
/** 100g당 범위(스펙 4.5.1): kcal 0~900, 탄·단·지 각 0~100, 세 값 합 100 이하 */
export const PER100_LIMITS = { kcalMax: 900, macroMax: 100, macroSumMax: 100 } as const

export interface BeforeParsed { items: BeforeItem[]; warnings: string[] }
export type NormalizeBeforeResult =
  | ({ ok: true } & BeforeParsed)
  | { ok: false; kind: 'invalid'; detail: string }
  | { ok: false; kind: 'empty' }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const round1 = (n: number) => Math.round(n * 10) / 10

/** 범위를 벗어나거나 값이 빠지면 null */
export function checkPer100(v: unknown): Nutrients | null {
  if (!isObj(v)) return null
  const kcal = num(v.kcal)
  const carbs = num(v.carbs_g)
  const protein = num(v.protein_g)
  const fat = num(v.fat_g)
  if (kcal === null || carbs === null || protein === null || fat === null) return null
  const { kcalMax, macroMax, macroSumMax } = PER100_LIMITS
  if (kcal < 0 || kcal > kcalMax) return null
  if ([carbs, protein, fat].some((x) => x < 0 || x > macroMax)) return null
  if (carbs + protein + fat > macroSumMax) return null
  return { kcal: round1(kcal), carbs_g: round1(carbs), protein_g: round1(protein), fat_g: round1(fat) }
}

function normConfidence(v: unknown): number {
  let c = num(v)
  if (c === null) return 0.3
  if (c > 1 && c <= 100) c = c / 100 // 0~100 척도로 답한 경우
  return Math.round(Math.min(1, Math.max(0, c)) * 100) / 100
}

/** 모델 원본(JSON 객체) → 정리된 항목. id는 i1부터 다시 매긴다. */
export function normalizeBeforeResponse(raw: unknown): NormalizeBeforeResult {
  if (!isObj(raw) || !Array.isArray(raw.items)) return { ok: false, kind: 'invalid', detail: 'items 배열이 없습니다' }
  const warnings: string[] = Array.isArray(raw.warnings)
    ? raw.warnings
        .filter((w): w is string => typeof w === 'string')
        .map((w) => w.trim())
        .filter((w) => w.length > 0)
        .slice(0, 10)
    : []
  if (raw.items.length === 0) return { ok: false, kind: 'empty' }

  const items: BeforeItem[] = []
  let dropped = 0
  for (const it of raw.items) {
    if (!isObj(it)) {
      dropped++
      continue
    }
    const name = typeof it.name === 'string' ? it.name.trim().slice(0, 60) : ''
    const grams = num(it.before_grams)
    if (!name || grams === null || grams <= 0) {
      dropped++
      continue
    }
    if (items.length >= MAX_ITEMS) {
      warnings.push(`음식이 많아 앞의 ${MAX_ITEMS}개만 남겼습니다`)
      break
    }
    let before_grams = Math.round(grams)
    let confidence = normConfidence(it.confidence)
    if (before_grams < GRAMS_MIN || before_grams > GRAMS_MAX) {
      before_grams = Math.min(GRAMS_MAX, Math.max(GRAMS_MIN, before_grams))
      confidence = Math.min(confidence, 0.5)
      warnings.push(`${name}: 중량 추정값이 범위를 벗어나 ${before_grams}g으로 맞췄습니다`)
    }
    items.push({
      id: `i${items.length + 1}`,
      name,
      location: typeof it.location === 'string' ? it.location.trim().slice(0, 80) : '',
      before_grams,
      confidence,
      per_100g_guess: checkPer100(it.per_100g_guess),
    })
  }
  if (items.length === 0) return { ok: false, kind: 'invalid', detail: '형식에 맞는 항목이 없습니다' }
  if (dropped > 0) warnings.push(`인식 결과 중 ${dropped}개 항목을 형식 오류로 뺐습니다`)
  return { ok: true, items, warnings }
}

/** 모델 응답 텍스트 → JSON 파싱 → 정리 */
export function parseBeforeText(text: string): NormalizeBeforeResult {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, kind: 'invalid', detail: 'JSON 파싱 실패' }
  }
  return normalizeBeforeResponse(raw)
}
