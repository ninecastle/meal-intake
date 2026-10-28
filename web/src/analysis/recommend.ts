// 음식 추천(디자인 조각 D12, 2026-10-28 사용자 결정): AI 호출 없이 식약처 DB 값으로 오늘 남은 양에 맞는 음식 4개를 고른다.
// - 끼니마다 어울리는 흔한 음식 후보(화면 이름·양·식약처 DB 이름)를 두고, 남은 칼로리를 넘지 않는 것 가운데 채울 영양소(focus)가 많은 순서로 고른다.
// - 채울 영양소(focus): 영양소마다 남은 비율(남은 g ÷ 목표 g)을 낸다. 가장 큰 것과 가장 작은 것의 차이가 10%p 이내면 세 가지 모두(고르게 갖춘 음식),
//   아니면 가장 큰 것과 두 번째의 차이가 5%p 이내면 그 두 가지, 그 밖에는 가장 큰 한 가지. 화면 표시(색·"○○이 가장 많이 남았어요")는 늘 가장 큰 한 가지(lacking).
// - [다시 추천 받기]: page를 하나씩 올리면 다음으로 잘 맞는 4개(후보를 다 돌면 처음부터).
// - 처음 고른 끼니(defaultRecMeal): 지금 시각의 끼니(10시 전 아침, 15시 전 점심, 21시 전 저녁, 그 뒤 간식)부터,
//   그 끼니에 기록(먹은 후 기다림 포함)이나 공복 표시가 있으면 다음 끼니로. 저녁 다음은 간식.
// 화면(pages/RecommendPage.tsx)은 이 파일의 함수·타입만 쓴다.
// 영양값은 식약처 DB JSON의 행을 원문 식품명(n) 그대로 찾아 100g당 값 × g ÷ 100으로 계산한다(영양 숫자를 코드에 적지 않는다).
// 100ml 기준 행은 변환 때 이미 1ml=1g으로 환산돼 있다. 행이 없거나 kcal·탄·단·지 가운데 빈 값(null)이 있으면 그 후보는 뺀다.
// 상대 import에 .ts 확장자를 붙인다: Node 시험 스크립트(spike/tests/recommend_test.mjs)가 이 파일을 그대로 불러온다.
import type { MealType } from '../data/meals'
import { loadDb, type MfdsFood, type NutritionDbIndex } from './nutrition/db.ts'

export type Macro = 'carbs' | 'protein' | 'fat'
export interface Amounts {
  kcal: number
  carbs_g: number
  protein_g: number
  fat_g: number
}
export interface RecItem extends Amounts {
  /** 화면 이름(예: "닭가슴살 샐러드") */
  name: string
  /** 양 표시(예: "200g", "1인분") */
  portion: string
}
export interface RecPlan {
  /** 화면에 표시하는 가장 부족한 영양소(남은 비율이 가장 큰 것). 목표가 없거나 셋 다 0 이하면 null */
  lacking: Macro | null
  /** 고를 때 채울 영양소(1~3개) */
  focus: Macro[]
}

const ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** 지금 시각의 끼니 */
export function mealByTime(now: Date): MealType {
  const h = now.getHours()
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

/** 처음 골라 둘 끼니: 시각의 끼니부터, 이미 기록했거나 공복이면 다음 끼니(간식은 마지막이라 그대로) */
export function defaultRecMeal(now: Date, done: ReadonlySet<MealType>): MealType {
  let i = ORDER.indexOf(mealByTime(now))
  while (i < ORDER.length - 1 && done.has(ORDER[i])) i++
  return ORDER[i]
}

const MACROS: Macro[] = ['carbs', 'protein', 'fat']
const KEY: Record<Macro, 'carbs_g' | 'protein_g' | 'fat_g'> = { carbs: 'carbs_g', protein: 'protein_g', fat: 'fat_g' }
const EPS = 1e-9

/**
 * 남은 양·목표로 표시할 영양소와 채울 영양소를 정한다(규칙은 파일 머리 주석).
 * 목표가 0 이하(또는 숫자가 아님)인 영양소는 뺀다. 이미 다 채운(남은 비율 0 이하) 영양소는 focus에 넣지 않는다.
 * 같은 비율이면 탄 → 단 → 지 순서.
 */
export function planFocus(remaining: Amounts, targets: Amounts): RecPlan {
  const ratios = MACROS.flatMap((m) => {
    const t = targets[KEY[m]]
    const r = remaining[KEY[m]]
    return Number.isFinite(t) && t > 0 && Number.isFinite(r) ? [{ m, v: r / t }] : []
  }).sort((a, b) => b.v - a.v || MACROS.indexOf(a.m) - MACROS.indexOf(b.m))
  if (ratios.length === 0 || ratios[0].v <= 0) return { lacking: null, focus: [] }
  const top = ratios[0].v
  const last = ratios[ratios.length - 1].v
  const n = top - last <= 0.1 + EPS ? ratios.length : ratios.length >= 2 && top - ratios[1].v <= 0.05 + EPS ? 2 : 1
  const focus = ratios
    .slice(0, n)
    .filter((x) => x.v > 0)
    .map((x) => x.m)
  return { lacking: ratios[0].m, focus }
}

// ── 후보 ───────────────────────────────────────────────

/** 추천 후보. parts는 [식약처 DB 식품명(원문 그대로), g]. 정식처럼 여러 음식이면 여러 줄. */
export interface RecCandidate {
  name: string
  portion: string
  meals: MealType[]
  parts: [string, number][]
}

const B: MealType[] = ['breakfast']
const L: MealType[] = ['lunch']
const D: MealType[] = ['dinner']
const LD: MealType[] = ['lunch', 'dinner']
const S: MealType[] = ['snack']
const BS: MealType[] = ['breakfast', 'snack']
const LS: MealType[] = ['lunch', 'snack']
const LDS: MealType[] = ['lunch', 'dinner', 'snack']
const RICE = 210 // 공기밥 한 그릇(표준 공기 210g)
const KIMCHI: [string, number] = ['배추김치', 40]

const c = (name: string, portion: string, meals: MealType[], ...parts: [string, number][]): RecCandidate => ({
  name,
  portion,
  meals,
  parts,
})
/** 한 가지 음식 */
const one = (name: string, portion: string, meals: MealType[], dbName: string, g: number): RecCandidate =>
  c(name, portion, meals, [dbName, g])
/** 밥 한 공기 + 국·찌개·탕(g) + 김치 */
const soupSet = (name: string, meals: MealType[], dbName: string, g: number, rice = '쌀밥'): RecCandidate =>
  c(name, '1인분', meals, [rice, RICE], [dbName, g], KIMCHI)
/** 밥 한 공기 + 주반찬 + 곁들이(국 등) */
const mealSet = (name: string, meals: MealType[], main: [string, number], side?: [string, number], rice = '쌀밥'): RecCandidate =>
  c(name, '1인분', meals, [rice, RICE], main, ...(side ? [side] : []))

export const REC_CANDIDATES: readonly RecCandidate[] = [
  // ── 아침: 죽 ──
  one('닭죽', '1그릇(400g)', B, '닭죽', 400),
  one('전복죽', '1그릇(400g)', B, '전복죽', 400),
  one('채소죽', '1그릇(400g)', B, '채소죽', 400),
  one('호박죽', '1그릇(300g)', BS, '호박죽', 300),
  one('팥죽', '1그릇(300g)', BS, '팥죽', 300),
  one('흑임자죽', '1그릇(300g)', BS, '흑임자죽', 300),
  one('잣죽', '1그릇(300g)', BS, '잣죽', 300),
  one('오리죽', '1그릇(400g)', B, '오리죽', 400),
  one('게살죽', '1그릇(400g)', B, '게살죽', 400),
  one('깨죽', '1그릇(300g)', B, '깨죽', 300),
  one('백합죽', '1그릇(400g)', B, '백합죽', 400),
  one('소고기버섯죽', '1그릇(400g)', B, '소고기버섯죽', 400),
  one('흰죽', '1그릇(400g)', B, '흰죽', 400),
  one('어죽', '1그릇(400g)', B, '어죽', 400),
  one('율무죽', '1그릇(300g)', B, '율무죽', 300),
  one('참치죽', '1그릇(400g)', B, '참치죽', 400),
  one('현미죽', '1그릇(400g)', B, '현미죽', 400),
  one('굴죽', '1그릇(400g)', B, '굴죽', 400),
  one('소고기 감자죽', '1그릇(400g)', B, '소고기 감자죽', 400),
  one('오리감자죽', '1그릇(400g)', B, '오리감자죽', 400),
  one('잡곡죽', '1그릇(400g)', B, '잡곡죽', 400),
  one('홍합 미나리죽', '1그릇(400g)', B, '홍합 미나리죽', 400),
  one('들깨죽', '1그릇(300g)', B, '들깨죽', 300),
  one('애호박죽', '1그릇(300g)', B, '애호박죽', 300),
  one('홍합 소고기죽', '1그릇(400g)', B, '홍합 소고기죽', 400),
  one('달걀 채소죽', '1그릇(400g)', B, '채소죽_달걀', 400),
  // ── 아침: 수프 ──
  c('양송이 수프와 식빵', '1그릇·식빵 1쪽', B, ['스프_양송이버섯', 250], ['식빵', 35]),
  c('감자 수프와 식빵', '1그릇·식빵 1쪽', B, ['스프_감자', 250], ['식빵', 35]),
  c('옥수수 수프와 식빵', '1그릇·식빵 1쪽', B, ['스프_옥수수', 250], ['식빵', 35]),
  c('크림 수프와 식빵', '1그릇·식빵 1쪽', B, ['스프_크림', 250], ['식빵', 35]),
  // ── 아침: 국과 밥 ──
  soupSet('소고기 미역국과 밥', B, '미역국_소고기', 300),
  soupSet('북어국과 밥', B, '북어국', 300),
  soupSet('콩나물국과 밥', B, '콩나물국', 300),
  soupSet('시금치 된장국과 밥', B, '된장국_시금치', 300),
  soupSet('아욱 된장국과 밥', B, '된장국_아욱', 300),
  soupSet('소고기 무국과 밥', B, '무국_소고기', 300),
  soupSet('달걀국과 밥', B, '달걀국', 300),
  soupSet('감자국과 밥', B, '감자국', 300),
  soupSet('김치 콩나물국과 밥', B, '김치국_콩나물', 300),
  soupSet('순두부 달걀탕과 밥', B, '달걀탕_순두부', 300),
  soupSet('배추 된장국과 밥', B, '된장국_배추', 300),
  soupSet('시래기 된장국과 밥', B, '된장국_시래기', 300),
  soupSet('황태해장국과 밥', B, '황태해장국', 400),
  soupSet('두부 된장국과 밥', B, '두부 된장국', 300),
  soupSet('굴 무국과 밥', B, '굴국_무', 300),
  soupSet('재첩국과 밥', B, '재첩국', 300),
  soupSet('바지락국과 밥', B, '조개국_바지락', 300),
  soupSet('들깨 미역국과 밥', B, '미역국_들깨', 300),
  soupSet('북어 달걀국과 밥', B, '북어국_달걀', 300),
  soupSet('냉이 된장국과 밥', B, '된장국_냉이', 300),
  // ── 아침: 밥과 반찬 ──
  mealSet('달걀말이와 밥', B, ['달걀말이', 80], KIMCHI),
  c('달걀찜과 밥', '밥 반 공기·달걀찜', B, ['쌀밥', 105], ['달걀찜_달걀만', 150]),
  mealSet('달걀프라이와 밥', B, ['달걀부침(달걀후라이)', 50], KIMCHI),
  mealSet('소고기 장조림과 밥', B, ['장조림_소고기', 60], KIMCHI),
  mealSet('두부부침과 잡곡밥', B, ['두부부침', 100], KIMCHI, '잡곡밥'),
  one('계란덮밥', '1그릇(400g)', B, '계란덮밥', 400),
  one('콩나물밥', '1그릇(300g)', B, '콩나물밥', 300),
  one('누룽지', '1그릇(300g)', B, '누룽지_뜨거운물첨가', 300),
  one('시리얼과 우유', '1그릇(250g)', BS, '시리얼_우유', 250),
  // ── 아침: 주먹밥·김밥 ──
  one('참치 주먹밥', '1개(120g)', BS, '주먹밥_참치', 120),
  one('소고기 주먹밥', '1개(120g)', BS, '주먹밥_소고기', 120),
  one('참치마요 삼각김밥', '1개(110g)', BS, '삼각김밥_참치마요네즈', 110),
  one('김밥 반 줄', '반 줄(120g)', BS, '김밥', 120),
  one('채소김밥 반 줄', '반 줄(120g)', BS, '김밥_채소', 120),
  // ── 아침: 빵 ──
  c('달걀프라이 토스트', '식빵 2쪽·달걀 1개', B, ['식빵', 70], ['달걀부침(달걀후라이)', 50]),
  c('스크램블드에그와 식빵', '1접시', B, ['스크램블드에그', 100], ['식빵', 35]),
  c('오믈렛과 식빵', '1접시', B, ['오믈렛', 150], ['식빵', 35]),
  c('통밀빵과 삶은 달걀', '통밀식빵 2쪽·달걀 1개', B, ['식빵_통밀식빵', 70], ['달걀_삶은것', 50]),
  c('달걀 샐러드 샌드위치', '1개', B, ['식빵', 70], ['달걀 샐러드', 60]),
  one('베이글', '1개(100g)', B, '베이글', 100),
  one('크로와상', '1개(60g)', B, '크로와상', 60),
  one('모닝빵', '2개(60g)', B, '모닝빵', 60),
  one('머핀', '1개(80g)', B, '머핀', 80),
  one('카스텔라', '1조각(50g)', B, '카스텔라', 50),
  one('핫케이크', '2장(150g)', B, '핫케이크', 150),
  one('햄달걀 샌드위치', '1개(150g)', B, '샌드위치_햄_달걀', 150),
  one('닭가슴살 샌드위치', '1개(150g)', B, '샌드위치_닭가슴살', 150),
  one('참치 샌드위치', '1개(150g)', B, '샌드위치_참치', 150),
  one('채소 샌드위치', '1개(150g)', B, '샌드위치_채소', 150),
  one('감자샐러드 샌드위치', '1개(150g)', B, '감자샐러드 샌드위치', 150),
  one('모둠 샌드위치', '1개(150g)', B, '샌드위치_모듬', 150),
  one('햄치즈 샌드위치', '1개(150g)', B, '샌드위치_햄_치즈', 150),
  one('소고기 샌드위치', '1개(150g)', B, '샌드위치_소고기', 150),
  // ── 아침·간식: 떡 ──
  one('백설기', '1조각(100g)', BS, '백설기', 100),
  one('인절미', '5개(100g)', BS, '인절미', 100),
  one('절편', '4개(100g)', BS, '절편', 100),
  one('증편', '2개(100g)', BS, '증편', 100),
  one('약식', '1조각(100g)', BS, '약식', 100),
  one('쑥떡', '3개(100g)', BS, '쑥떡', 100),
  one('시루떡', '1조각(100g)', BS, '시루떡', 100),
  // ── 아침·간식: 요거트·음료·과일 ──
  one('그릭요거트', '1컵(150g)', BS, '요구르트(액상)_그릭요거트', 150),
  one('마시는 요거트', '1병(200g)', BS, '요구르트(액상)_마시는요거트 플레인', 200),
  one('미숫가루', '1잔(250g)', BS, '미숫가루(선식)음료', 250),
  one('딸기우유', '1팩(200g)', BS, '우유_딸기', 200),
  one('과일샐러드', '1컵(150g)', BS, '과일샐러드', 150),
  one('과일주스', '1잔(200g)', BS, '과ㆍ채주스_혼합과일주스', 200),
  one('사과당근주스', '1잔(200g)', BS, '과ㆍ채주스_사과_당근', 200),
  one('딸기바나나 주스', '1잔(200g)', BS, '과ㆍ채주스_딸기_바나나', 200),
  one('해독주스', '1잔(200g)', BS, '과ㆍ채주스_해독주스_착즙형', 200),
  one('카페라떼', '1잔(300g)', BS, '커피_카페라떼', 300),
  // ── 아침·간식: 찐 것·달걀·샐러드 ──
  one('찐고구마', '1개(150g)', BS, '고구마_찐고구마', 150),
  one('찐감자', '2개(200g)', BS, '감자_찐감자', 200),
  one('삶은 달걀', '2개(100g)', BS, '달걀_삶은것', 100),
  c('양상추 샐러드와 삶은 달걀', '1접시', BS, ['양상추 샐러드', 150], ['달걀_삶은것', 50]),

  // ── 점심·저녁: 밥 ──
  one('비빔밥', '1그릇(450g)', LD, '비빔밥', 450),
  one('돌솥비빔밥', '1그릇(450g)', L, '비빔밥_돌솥', 450),
  one('육회비빔밥', '1그릇(450g)', LD, '비빔밥_육회', 450),
  one('멍게비빔밥', '1그릇(450g)', L, '비빔밥_멍게', 450),
  one('열무비빔밥', '1그릇(450g)', L, '비빔밥_열무', 450),
  one('참치비빔밥', '1그릇(450g)', L, '비빔밥_참치', 450),
  one('약초비빔밥', '1그릇(450g)', LD, '비빔밥_약초', 450),
  one('곤드레나물밥', '1그릇(350g)', LD, '곤드레나물밥', 350),
  one('영양돌솥밥', '1그릇(350g)', D, '영양돌솥밥', 350),
  one('굴밥', '1그릇(350g)', D, '굴밥', 350),
  // ── 점심·저녁: 덮밥 ──
  one('불고기덮밥', '1그릇(450g)', L, '덮밥_불고기', 450),
  one('제육덮밥', '1그릇(450g)', L, '덮밥_돼지고기(제육)', 450),
  one('닭고기덮밥', '1그릇(450g)', L, '덮밥_닭고기', 450),
  one('오징어덮밥', '1그릇(450g)', LD, '덮밥_오징어', 450),
  one('낙지덮밥', '1그릇(450g)', LD, '덮밥_낙지', 450),
  one('회덮밥', '1그릇(400g)', LD, '회덮밥', 400),
  one('장어덮밥', '1그릇(400g)', LD, '덮밥_장어', 400),
  one('참치덮밥', '1그릇(400g)', L, '덮밥_참치', 400),
  one('해물덮밥', '1그릇(450g)', LD, '덮밥_해물', 450),
  one('유산슬덮밥', '1그릇(450g)', LD, '덮밥_유산슬', 450),
  one('송이버섯덮밥', '1그릇(450g)', L, '덮밥_송이버섯', 450),
  one('소고기덮밥', '1그릇(450g)', L, '소고기 덮밥', 450),
  one('잡탕밥', '1그릇(500g)', LD, '잡탕밥', 500),
  one('짜장밥', '1그릇(450g)', L, '자장밥', 450),
  one('짬뽕밥', '1그릇(700g)', LD, '짬뽕밥', 700),
  one('카레라이스', '1그릇(450g)', LD, '카레라이스', 450),
  one('하이라이스', '1그릇(450g)', D, '하이라이스', 450),
  one('오므라이스', '1그릇(400g)', L, '오므라이스', 400),
  mealSet('마파두부덮밥', LD, ['마파두부', 200]),
  // ── 점심·저녁: 볶음밥 ──
  one('새우볶음밥', '1그릇(400g)', L, '볶음밥_새우', 400),
  one('김치볶음밥', '1그릇(400g)', LD, '볶음밥_김치', 400),
  one('소고기볶음밥', '1그릇(400g)', L, '볶음밥_소고기', 400),
  one('해물볶음밥', '1그릇(400g)', LD, '볶음밥_해물', 400),
  one('삼선볶음밥', '1그릇(400g)', D, '볶음밥_삼선', 400),
  one('참치볶음밥', '1그릇(400g)', L, '볶음밥_참치', 400),
  // ── 점심·저녁: 국밥 ──
  one('콩나물국밥', '1그릇(600g)', L, '국밥_콩나물', 600),
  one('순대국밥', '1그릇(700g)', LD, '국밥_순대국밥', 700),
  one('돼지국밥', '1그릇(700g)', LD, '국밥_돼지고기', 700),
  one('소고기국밥', '1그릇(700g)', LD, '국밥_소고기', 700),
  one('굴국밥', '1그릇(600g)', LD, '국밥_굴', 600),
  one('머리국밥', '1그릇(600g)', D, '국밥_돼지머리', 600),
  // ── 점심·저녁: 탕과 밥 ──
  soupSet('갈비탕', LD, '갈비탕', 600),
  soupSet('설렁탕', LD, '설렁탕', 600),
  soupSet('곰탕', LD, '곰탕', 600),
  soupSet('육개장', LD, '육개장', 600),
  soupSet('추어탕', LD, '추어탕', 600),
  soupSet('감자탕', D, '감자탕', 600),
  soupSet('뼈해장국', LD, '해장국_뼈다귀', 600),
  soupSet('선지해장국', LD, '해장국_선지', 600),
  soupSet('우거지해장국', L, '해장국_우거지', 600),
  soupSet('내장탕', D, '내장탕', 600),
  soupSet('도가니탕', D, '도가니탕', 600),
  soupSet('닭곰탕', LD, '닭곰탕', 600),
  soupSet('꼬리곰탕', D, '꼬리곰탕', 600),
  soupSet('대구매운탕', D, '매운탕_대구', 500),
  soupSet('알탕', D, '알탕', 500),
  soupSet('해물탕', D, '해물탕', 600),
  one('삼계탕', '1그릇(800g)', LD, '삼계탕', 800),
  one('닭백숙', '1인분(700g)', D, '닭백숙', 700),
  // ── 점심·저녁: 찌개 정식 ──
  mealSet('된장찌개 정식', LD, ['된장찌개', 300], ['달걀말이', 60]),
  mealSet('김치찌개 정식', LD, ['김치찌개', 300], ['두부부침', 80]),
  mealSet('순두부찌개 정식', LD, ['순두부찌개_김치', 400]),
  mealSet('청국장 정식', LD, ['청국장찌개', 300], ['달걀말이', 60]),
  soupSet('부대찌개', LD, '부대찌개', 400),
  soupSet('동태찌개', D, '동태찌개', 400),
  soupSet('참치김치찌개', L, '김치찌개_참치', 300),
  soupSet('콩비지찌개', D, '콩비지찌개', 300),
  soupSet('고추장찌개', L, '두부찌개_고추장', 300),
  soupSet('꽁치김치찌개', D, '김치찌개_꽁치', 300),
  mealSet('우렁 강된장과 밥', LD, ['된장찌개_우렁_강된장', 150], ['콩나물무침', 70]),
  soupSet('버섯전골', D, '버섯전골', 400),
  c('소고기 샤브샤브', '1인분', D, ['샤브샤브_소고기', 600], ['쌀밥', 105]),
  // ── 점심·저녁: 생선 구이·조림 정식 ──
  mealSet('고등어구이 정식', LD, ['고등어구이_석쇠', 100], ['미역국_소고기', 250]),
  mealSet('삼치구이 정식', LD, ['삼치구이', 100], ['된장찌개', 250]),
  mealSet('조기구이 정식', D, ['조기구이', 100], ['미역국', 250]),
  mealSet('갈치구이 정식', D, ['갈치구이_기름', 100], ['콩나물국', 250]),
  mealSet('연어구이 정식', D, ['연어구이', 120], ['된장찌개', 250], '잡곡밥'),
  mealSet('가자미구이 정식', LD, ['가자미구이', 120], ['된장국_시금치', 250]),
  mealSet('임연수구이 정식', D, ['임연수구이', 120], ['무국_소고기', 250]),
  mealSet('꽁치구이 정식', D, ['꽁치구이', 100], ['된장국_배추', 250]),
  mealSet('고등어조림 정식', D, ['고등어조림', 150], ['콩나물국', 250]),
  mealSet('두부조림 정식', D, ['두부조림', 120], ['된장찌개', 250], '현미밥'),
  mealSet('갈치조림 정식', D, ['갈치조림_무', 200], ['콩나물국', 250]),
  mealSet('코다리조림 정식', D, ['코다리조림', 150], ['된장국_아욱', 250]),
  // ── 점심·저녁: 고기·볶음·찜 ──
  mealSet('제육볶음 정식', LD, ['돼지고기볶음(제육볶음)', 150], ['콩나물국', 250]),
  mealSet('소불고기 정식', LD, ['소불고기', 150], ['미역국_소고기', 250]),
  mealSet('돼지불고기 정식', D, ['돼지불고기_간장', 200], ['된장국_배추', 250]),
  mealSet('오징어볶음 정식', LD, ['오징어볶음', 150], ['콩나물국', 250]),
  mealSet('낙지볶음 정식', D, ['낙지볶음', 200], ['콩나물국', 250]),
  mealSet('주꾸미볶음 정식', D, ['주꾸미볶음', 200], ['콩나물국', 250]),
  mealSet('떡갈비 정식', LD, ['떡갈비', 120], ['된장국_시금치', 250]),
  mealSet('닭갈비와 밥', D, ['닭볶음(닭갈비)', 250]),
  mealSet('소고기 수육과 밥', D, ['수육_소고기', 150]),
  mealSet('보쌈 정식', D, ['제육(돼지고기 수육)', 150], ['보쌈김치', 50]),
  mealSet('잡채밥', D, ['잡채', 200]),
  mealSet('소갈비찜과 밥', D, ['갈비찜_소고기', 250]),
  mealSet('돼지갈비찜과 밥', D, ['돼지갈비찜', 250]),
  mealSet('안동찜닭과 밥', D, ['닭찜_안동찜닭', 400]),
  mealSet('김치찜과 밥', D, ['김치찜_돼지고기', 300]),
  mealSet('닭볶음탕과 밥', D, ['닭볶음탕', 400]),
  mealSet('오리불고기와 밥', D, ['오리불고기', 200]),
  mealSet('아귀찜과 밥', D, ['아귀찜', 300]),
  mealSet('해물찜과 밥', D, ['해물찜', 300]),
  c('함박스테이크', '1인분', L, ['함박스테이크', 150], ['쌀밥', 150]),
  c('돈가스', '1인분', L, ['돈가스', 150], ['쌀밥', 150], ['샐러드_양배추', 50]),
  c('생선까스', '1인분', L, ['생선까스', 150], ['쌀밥', 150], ['샐러드_양배추', 50]),
  c('치킨가스', '1인분', L, ['치킨가스', 150], ['쌀밥', 150], ['샐러드_양배추', 50]),
  c('소등심 스테이크', '1인분', D, ['스테이크_소등심', 200], ['감자구이', 100]),
  // ── 점심·저녁: 면 ──
  one('칼국수', '1그릇(600g)', L, '칼국수', 600),
  one('바지락칼국수', '1그릇(600g)', L, '칼국수_바지락', 600),
  one('해물칼국수', '1그릇(600g)', LD, '칼국수_해물', 600),
  one('물냉면', '1그릇(600g)', L, '냉면_물냉면', 600),
  one('비빔냉면', '1그릇(450g)', L, '냉면_비빔냉면', 450),
  one('막국수', '1그릇(500g)', L, '국수_막국수', 500),
  one('비빔국수', '1그릇(400g)', L, '비빔국수', 400),
  one('잔치국수', '1그릇(600g)', L, '국수_잔치국수', 600),
  one('콩국수', '1그릇(600g)', L, '콩국수', 600),
  one('쌀국수', '1그릇(600g)', LD, '쌀국수', 600),
  one('우동', '1그릇(500g)', L, '우동_일식', 500),
  one('짜장면', '1그릇(600g)', LD, '자장면', 600),
  one('짬뽕', '1그릇(800g)', LD, '짬뽕', 800),
  one('쫄면', '1그릇(400g)', L, '쫄면', 400),
  one('달걀 라면', '1그릇(550g)', L, '라면_달걀', 550),
  one('떡만두국', '1그릇(600g)', LD, '떡만두국', 600),
  one('떡국', '1그릇(600g)', L, '떡국', 600),
  one('사골 만두국', '1그릇(600g)', L, '만두국_사골', 600),
  one('수제비', '1그릇(600g)', L, '수제비', 600),
  one('메밀소바', '1그릇(500g)', L, '메밀소바', 500),
  one('팟타이', '1접시(300g)', LD, '팟타이', 300),
  one('분짜', '1인분(350g)', L, '분짜', 350),
  // ── 점심·저녁: 양식·일식 ──
  one('토마토 스파게티', '1접시(400g)', LD, '스파게티_토마토소스', 400),
  one('크림 스파게티', '1접시(350g)', LD, '스파게티_크림소스', 350),
  one('오일 스파게티', '1접시(300g)', L, '스파게티_오일소스', 300),
  one('까르보나라', '1접시(300g)', L, '스파게티_까르보나라소스', 300),
  one('미트볼 스파게티', '1접시(350g)', D, '스파게티_미트볼', 350),
  one('모둠초밥', '10개(300g)', LD, '초밥_모듬', 300),
  one('유부초밥', '6개(200g)', LS, '초밥_유부초밥', 200),
  one('연어초밥', '8개(250g)', LD, '초밥_연어', 250),
  one('캘리포니아롤', '8개(250g)', L, '캘리포니아롤', 250),
  one('돈코츠라멘', '1그릇(600g)', LD, '라멘_돈코츠라멘', 600),
  one('소유라멘', '1그릇(600g)', L, '라멘_소유라멘', 600),
  // ── 점심·저녁: 분식·샐러드 ──
  one('김밥', '1줄(230g)', L, '김밥', 230),
  one('참치김밥', '1줄(230g)', L, '김밥_참치', 230),
  one('떡볶이', '1인분(250g)', LS, '떡볶이', 250),
  one('라볶이', '1인분(350g)', L, '라볶이', 350),
  one('고기만두', '6개(200g)', LD, '만두_고기만두', 200),
  one('김치만두', '6개(200g)', L, '만두_김치만두', 200),
  one('닭가슴살 샐러드', '1그릇(250g)', LDS, '샐러드_닭가슴살', 250),
  one('단호박 샐러드', '1그릇(200g)', LS, '샐러드_단호박', 200),
  one('월남쌈', '1인분(250g)', LDS, '월남쌈', 250),

  // ── 간식: 떡 ──
  one('가래떡', '2줄(100g)', S, '가래떡', 100),
  one('흑미 가래떡', '2줄(100g)', S, '가래떡_흑미', 100),
  one('꿀떡', '5개(100g)', S, '꿀떡', 100),
  one('깨송편', '4개(100g)', S, '송편_깨', 100),
  one('콩송편', '4개(100g)', S, '송편_콩', 100),
  one('깨경단', '5개(100g)', S, '경단_깨', 100),
  one('수수경단', '5개(100g)', S, '수수경단', 100),
  one('찹쌀떡', '2개(100g)', S, '찹쌀떡_팥', 100),
  one('모둠찰떡', '1조각(100g)', S, '모듬찰떡', 100),
  one('무지개떡', '1조각(100g)', S, '무지개떡', 100),
  one('바람떡', '4개(100g)', S, '개피떡(바람떡)', 100),
  one('수수팥떡', '1조각(100g)', S, '수수팥떡', 100),
  one('찰시루떡', '1조각(100g)', S, '찰시루떡', 100),
  one('기피편', '1조각(100g)', S, '기피편', 100),
  one('검정콩 백설기', '1조각(100g)', S, '백설기_검정콩', 100),
  one('팥고물 인절미', '5개(100g)', S, '인절미_팥고물', 100),
  one('메밀전병', '2개(150g)', S, '빙떡(메밀전병)', 150),
  // ── 간식: 주먹밥·김밥 ──
  one('멸치 주먹밥', '1개(120g)', S, '주먹밥_멸치', 120),
  one('김치 주먹밥', '1개(120g)', S, '주먹밥_배추김치', 120),
  one('불고기 삼각김밥', '1개(110g)', S, '삼각김밥_고추장불고기', 110),
  one('숯불갈비 삼각김밥', '1개(110g)', S, '삼각김밥_숯불갈비', 110),
  one('계란김밥 반 줄', '반 줄(120g)', S, '김밥_계란', 120),
  one('충무김밥', '1인분(200g)', S, '충무김밥', 200),
  // ── 간식: 음료 ──
  one('당근주스', '1잔(200g)', S, '과ㆍ채주스_당근', 200),
  one('두유 카페라떼', '1잔(300g)', S, '두유 카페라떼', 300),
  one('딸기바나나 스무디', '1잔(300g)', S, '딸기바나나 스무디', 300),
  one('식혜', '1잔(200g)', S, '식혜', 200),
  one('수박화채', '1그릇(250g)', S, '수박화채', 250),
  one('녹차라떼', '1잔(300g)', S, '라떼_그린티', 300),
  one('밀크티', '1잔(300g)', S, '밀크티_블랙', 300),
  one('율무차', '1잔(200g)', S, '율무차', 200),
  one('아메리카노', '1잔(350g)', S, '커피_아메리카노', 350),
  one('레몬차', '1잔(250g)', S, '레몬청차', 250),
  one('아이스티', '1잔(300g)', S, '아이스티', 300),
  // ── 간식: 찐 것·달걀·샐러드 ──
  one('찐옥수수', '1개(150g)', S, '옥수수_찐옥수수', 150),
  one('밤고구마', '1개(150g)', S, '고구마_밤고구마_삶은것', 150),
  one('단호박찜', '1접시(150g)', S, '단호박찜', 150),
  one('감자구이', '1접시(150g)', S, '감자구이', 150),
  one('감자범벅', '1그릇(150g)', S, '감자범벅', 150),
  one('달걀찜', '1그릇(150g)', S, '달걀찜', 150),
  one('메추리알 장조림', '10알(60g)', S, '장조림_메추리알', 60),
  one('연두부찜', '1그릇(150g)', S, '연두부찜', 150),
  one('새싹 샐러드', '1그릇(150g)', S, '새싹 샐러드', 150),
  one('감자샐러드', '1그릇(150g)', S, '감자샐러드', 150),
  one('고구마 샐러드', '1그릇(150g)', S, '샐러드_고구마', 150),
  one('옥수수 샐러드', '1그릇(150g)', S, '옥수수샐러드', 150),
  one('양배추 사과 샐러드', '1그릇(150g)', S, '양배추 사과 샐러드', 150),
  // ── 간식: 분식·기타 ──
  one('순대', '1인분(150g)', S, '순대', 150),
  one('어묵탕', '1그릇(300g)', S, '어묵국(어묵탕)', 300),
  one('호떡', '1개(90g)', S, '호떡', 90),
  one('물만두', '10개(150g)', S, '물만두', 150),
  one('두부부침', '1접시(100g)', S, '두부부침', 100),
  one('두부김치', '1접시(150g)', S, '두부김치', 150),
  one('감자전', '1장(150g)', S, '감자전', 150),
  one('녹두전', '1장(150g)', S, '녹두전', 150),
  one('도토리묵무침', '1접시(150g)', S, '묵무침_도토리묵', 150),
  one('청포묵무침', '1접시(150g)', S, '청포묵무침', 150),
  one('닭꼬치', '1개(100g)', S, '닭꼬치구이', 100),
  one('팥빙수', '1그릇(300g)', S, '팥빙수', 300),
  one('인절미 빙수', '1그릇(300g)', S, '빙수_인절미_우유얼음', 300),
  one('견과', '1봉(40g)', S, '견과_넛츠앤푸르츠', 40),
]

/** DB 값으로 계산한 후보(반올림 전) */
export interface BuiltCandidate extends RecItem {
  meals: MealType[]
}

const builtCache = new WeakMap<NutritionDbIndex, BuiltCandidate[]>()

/** 식약처 DB 행에서 후보 영양값을 계산한다. 행이 없거나 빈 값이 있는 후보는 빼고 missing에 "후보: DB 이름"을 남긴다. */
export function buildCandidates(idx: NutritionDbIndex): { items: BuiltCandidate[]; missing: string[] } {
  const want = new Set(REC_CANDIDATES.flatMap((x) => x.parts.map(([n]) => n)))
  const rows = new Map<string, MfdsFood>()
  for (const f of idx.db.foods) if (want.has(f.n) && !rows.has(f.n)) rows.set(f.n, f)
  const items: BuiltCandidate[] = []
  const missing: string[] = []
  for (const cand of REC_CANDIDATES) {
    const sum = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 }
    let ok = true
    for (const [dbName, g] of cand.parts) {
      const f = rows.get(dbName)
      if (!f || f.cb == null || f.f == null || !Number.isFinite(f.k) || !Number.isFinite(f.p)) {
        ok = false
        missing.push(`${cand.name}: ${dbName}`)
        break
      }
      sum.kcal += (f.k * g) / 100
      sum.carbs_g += (f.cb * g) / 100
      sum.protein_g += (f.p * g) / 100
      sum.fat_g += (f.f * g) / 100
    }
    if (ok) items.push({ name: cand.name, portion: cand.portion, meals: cand.meals, ...sum })
  }
  return { items, missing }
}

function candidatesOf(idx: NutritionDbIndex): BuiltCandidate[] {
  let b = builtCache.get(idx)
  if (!b) {
    b = buildCandidates(idx).items
    builtCache.set(idx, b)
  }
  return b
}

/**
 * 채울 영양소 점수: focus 영양소마다 (min(g, 남은 g) − max(0, g − 남은 g)) ÷ 남은 g 을 더한다(남은 양을 넘은 만큼 감점).
 * focus가 세 가지면 고르게 갖춘 것이 높게, 세 값의 차이(가장 큰 것 − 가장 작은 것)를 뺀다.
 * focus가 없으면(목표 없음) 남은 칼로리를 채우는 정도(kcal ÷ 남은 kcal).
 */
export function scoreItem(item: Amounts, remaining: Amounts, focus: readonly Macro[]): number {
  const fs = focus.flatMap((m) => {
    const r = remaining[KEY[m]]
    if (!(r > 0)) return []
    const g = item[KEY[m]]
    return [(Math.min(g, r) - Math.max(0, g - r)) / r]
  })
  if (fs.length === 0) return remaining.kcal > 0 ? item.kcal / remaining.kcal : 0
  const sum = fs.reduce((a, b) => a + b, 0)
  return fs.length >= 3 ? sum - (Math.max(...fs) - Math.min(...fs)) : sum
}

const PAGE = 4

function toItem(x: BuiltCandidate): RecItem {
  return {
    name: x.name,
    portion: x.portion,
    kcal: Math.round(x.kcal),
    carbs_g: Math.round(x.carbs_g * 10) / 10,
    protein_g: Math.round(x.protein_g * 10) / 10,
    fat_g: Math.round(x.fat_g * 10) / 10,
  }
}

/** 색인이 이미 있을 때 쓰는 동기 버전(시험용). 규칙은 recommendFoods. */
export function recommendFrom(
  idx: NutritionDbIndex,
  remaining: Amounts,
  plan: RecPlan,
  meal: MealType,
  page: number,
): RecItem[] {
  const all = candidatesOf(idx)
  let list: BuiltCandidate[]
  if (!(remaining.kcal > 0)) {
    list = all
      .filter((x) => x.meals.includes('snack'))
      .sort((a, b) => a.kcal - b.kcal || a.name.localeCompare(b.name, 'ko'))
  } else {
    list = all
      .filter((x) => x.meals.includes(meal) && x.kcal <= remaining.kcal)
      .map((x) => ({ x, s: scoreItem(x, remaining, plan.focus) }))
      .sort((a, b) => b.s - a.s || a.x.kcal - b.x.kcal || a.x.name.localeCompare(b.x.name, 'ko'))
      .map((e) => e.x)
  }
  const n = list.length
  if (n === 0) return []
  if (n <= PAGE) return list.map(toItem)
  const p = Math.max(0, Math.floor(page) || 0)
  const start = (p * PAGE) % n
  return Array.from({ length: PAGE }, (_, i) => toItem(list[(start + i) % n]))
}

/**
 * 끼니에 맞는 추천 4개(page 0부터, [다시 추천 받기]마다 +1). 남은 칼로리가 0 이하면 가벼운 간식 후보에서 낮은 칼로리 순.
 * 식약처 DB JSON을 처음 쓸 때 받는다. 후보가 4개보다 적으면 있는 만큼.
 * 남은 칼로리 안에 드는 끼니 후보를 focus 점수(scoreItem) 높은 순 → kcal 낮은 순 → 이름 순으로 늘어놓고
 * page*4번째부터 4개(끝을 넘으면 처음부터 이어서).
 */
export async function recommendFoods(remaining: Amounts, plan: RecPlan, meal: MealType, page: number): Promise<RecItem[]> {
  return recommendFrom(await loadDb(), remaining, plan, meal, page)
}
