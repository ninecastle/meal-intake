// 호출 A(먹기 전 분석) 프롬프트 a4·응답 스키마·응답 정리.
// 출처: .claude/skills/intake-calorie-estimation/references/prompt-template.md 호출 A.
// a2(2026-10-26): a1 + 종류에 따라 칼로리 차이가 큰 음식은 보이는 특징까지 넣은 구체적인 이름, per_100g_guess는 보이는 구성을 따져 추정
// (CLAUDE.md "칼로리 계산 순서"). 같은 사진 캐시는 prompt_version으로 구분되므로 a1 결과는 다시 쓰지 않는다.
// a3(2026-10-26): a2 + whole_count(한 개·한 마리·한 판·1인분이 통째로 보이는 개수). 공개 중량(스펙 4.5.5)에 쓴다. a2 캐시는 다시 분석한다.
// a4(2026-10-27): a3 + name·location·warnings를 모두 한국어로 쓴다(결과 화면 경고가 영어로 나온 문제, 사용자 결정).
//   응답 정리에서도 모델 warnings를 koreanWarnings로 거른다(한국어가 아니면 일반 안내 한 줄). a3 캐시는 다시 분석한다.
// 이 파일은 import.meta.env를 쓰지 않는다(Node 시험 스크립트에서도 그대로 불러 쓴다).
import { Schema, ThinkingLevel, type GenerationConfig } from 'firebase/ai'
import type { BeforeItem, Nutrients } from '../types/analysis'
import { koreanWarnings } from './koreanText.ts'

export const PROMPT_VERSION_A = 'a4'

export const SYSTEM_INSTRUCTION_A = `당신은 식사 사진을 분석하는 영양 보조 도구다. 먹기 전 식탁 사진 한 장이 주어진다.

할 일:
1. 보이는 음식을 그릇 단위로 모두 나열하고 i1, i2 … 순서로 id를 붙인다.
2. name은 한국 식품영양성분 DB에 있을 법한 일반 음식명으로 쓴다(예: "김치찌개", "제육볶음", "쌀밥").
   단, 종류에 따라 칼로리 차이가 큰 음식(햄버거·샌드위치, 치킨, 피자, 떡볶이·라면, 마라탕·샐러드, 카페 음료, 케이크·디저트)은 사진에 보이는 특징까지 넣은 구체적인 이름으로 쓴다(예: "더블 치즈버거", "양념치킨 순살", "페퍼로니 피자", "로제 떡볶이", "아이스 카페라떼", "생크림 딸기 케이크"). 사진에서 보이지 않는 특징은 지어내지 않는다.
3. location에 그릇 위치와 모양을 짧게 적는다(예: "왼쪽 위 흰 밥공기"). 나중에 먹은 후 사진에서 같은 그릇을 찾는 데 쓴다.
4. 각 음식의 먹기 전 중량(g)을 추정한다. 수저, 표준 밥공기(밥 약 210g), 접시 크기를 단서로 쓴다.
5. 국·찌개는 건더기와 국물을 별도 항목으로 나눈다.
6. per_100g_guess에 100g당 kcal, 탄수화물·단백질·지방(g) 추정값을 적는다. 일반적인 값을 그대로 쓰지 말고 보이는 구성(패티 수, 치즈·소스·토핑, 튀김옷, 크림·시럽 등)을 따져 그 음식에 맞게 추정한다. DB에 없거나, 종류 차이가 큰 음식이 DB 대표값에만 맞을 때 쓰인다.
7. whole_count: 버거, 피자 한 판, 치킨 한 마리, 도시락, 컵 음료처럼 한 개·한 마리·한 판·1인분이 손대지 않은 모양 그대로 통째로 보이면 그 개수를 정수(1~10)로 적는다. 일부만 덜어 왔거나, 잘라 놓은 조각(피자 몇 조각 등)이거나, 여러 그릇에 나눠 담겼거나, 반찬·나물·국물처럼 정해진 크기가 없는 음식이면 null로 적는다. 판단이 어려우면 null. before_grams는 whole_count와 상관없이 그대로 추정한다.

규칙:
- 섭취량이나 총 칼로리를 계산하지 않는다.
- 확신이 없으면 confidence를 낮게 준다. 추측을 사실처럼 쓰지 않는다.
- name, location, warnings의 모든 문자열은 한국어로 쓴다. 영어 문장이나 로마자 음식명으로 쓰지 않는다. 브랜드·메뉴 이름도 한글로 적는다(예: "빅맥", "치즈와퍼 버거"). warnings는 "음식 이름: 이유" 형식의 짧은 한국어 문장으로 쓴다.`

/** 사용자 메시지 첫 텍스트 파트. 그다음 파트가 이미지다. */
export const USER_TEXT_A = 'BEFORE 사진'

// 응답 스키마 A. 템플릿에서 모든 필드가 필수라 optionalProperties는 없다.
/** 100g당 값 스키마. 호출 D(d1)도 같은 스키마를 쓴다 */
export const PER100_SCHEMA = Schema.object({
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
          per_100g_guess: PER100_SCHEMA,
          whole_count: Schema.integer({ nullable: true }),
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

export const WHOLE_COUNT_MAX = 10
/** whole_count 정리: 정수 1~10만 남기고 나머지(범위 밖·소수·문자열·누락)는 null */
export function normWholeCount(v: unknown): number | null {
  const n = num(v)
  return n !== null && Number.isInteger(n) && n >= 1 && n <= WHOLE_COUNT_MAX ? n : null
}

/** 모델 원본(JSON 객체) → 정리된 항목. id는 i1부터 다시 매긴다. */
export function normalizeBeforeResponse(raw: unknown): NormalizeBeforeResult {
  if (!isObj(raw) || !Array.isArray(raw.items)) return { ok: false, kind: 'invalid', detail: 'items 배열이 없습니다' }
  // 모델 경고는 한국어만 그대로 두고, 아니면 일반 안내 한 줄로 바꾼다(koreanText.ts). 코드 경고는 아래에서 한국어로 붙인다.
  const warnings: string[] = Array.isArray(raw.warnings)
    ? koreanWarnings(raw.warnings.filter((w): w is string => typeof w === 'string')).slice(0, 10)
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
      whole_count: normWholeCount(it.whole_count),
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
