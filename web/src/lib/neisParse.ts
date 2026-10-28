// 나이스 교육정보 개방 포털 응답 정리(순수 함수, D13 학교 급식). 호출은 lib/neis.ts.
// Node 단위 시험(spike/tests/neis_test.mjs)이 이 파일을 바로 불러오므로 import·import.meta를 쓰지 않는다.
// 응답 모양: _workspace/06_neis_meal_spike.md (schoolInfo·mealServiceDietInfo, Type=json)

export type SchoolHit = { atpt: string; code: string; name: string; region: string; kind: string }
export type SchoolMeal = { menu: string[]; kcal: number | null; carbs_g: number | null; protein_g: number | null; fat_g: number | null }

type Row = Record<string, unknown>

/** {서비스이름: [{head}, {row: [...]}]} 에서 row 목록. 자료 없음(INFO-200)·오류면 [] */
export function neisRows(json: unknown, service: string): Row[] {
  if (!json || typeof json !== 'object') return []
  const parts = (json as Record<string, unknown>)[service]
  if (!Array.isArray(parts)) return []
  for (const p of parts) {
    if (p && typeof p === 'object' && Array.isArray((p as Row).row)) return ((p as Row).row as unknown[]).filter((r): r is Row => !!r && typeof r === 'object')
  }
  return []
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** 학교 검색 결과. 교육청 코드(A00)·학교 코드(7자리)가 맞는 줄만 */
export function parseSchools(json: unknown): SchoolHit[] {
  const out: SchoolHit[] = []
  for (const r of neisRows(json, 'schoolInfo')) {
    const atpt = str(r.ATPT_OFCDC_SC_CODE)
    const code = str(r.SD_SCHUL_CODE)
    const name = str(r.SCHUL_NM).slice(0, 50)
    if (!/^[A-Z][0-9]{2}$/.test(atpt) || !/^[0-9]{7}$/.test(code) || !name) continue
    out.push({ atpt, code, name, region: str(r.LCTN_SC_NM), kind: str(r.SCHUL_KND_SC_NM) })
  }
  return out
}

/** 메뉴 한 줄 정리: 괄호(알레르기 번호 등)·특수 기호 지움. "마제소바 (5.6.10.13.18)" → "마제소바", "*배추김치(9)" → "배추김치" */
export function cleanMenuName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/[0-9]+(\.[0-9]+)*\.?\s*$/g, ' ') // 괄호 없이 붙은 알레르기 번호 "김치9.13."
    .replace(/[^0-9A-Za-z가-힣&\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** DDISH_NM("<br/>"로 이은 메뉴) → 메뉴 이름 목록(빈 것·같은 이름 뺌) */
export function parseMenu(ddish: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of ddish.split(/<br\s*\/?>|\n/i)) {
    const n = cleanMenuName(part)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function num(s: string): number | null {
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const v = Number(m[0])
  return Number.isFinite(v) && v >= 0 ? v : null
}

/** CAL_INFO "932.2 Kcal" → 932.2 */
export const parseKcal = (s: string): number | null => num(s)

/** NTR_INFO "탄수화물(g) : 133.4<br/>단백질(g) : 40.6<br/>지방(g) : 25.4<br/>…" → 탄단지 g */
export function parseNutrients(s: string): { carbs_g: number | null; protein_g: number | null; fat_g: number | null } {
  const out = { carbs_g: null as number | null, protein_g: null as number | null, fat_g: null as number | null }
  for (const part of s.split(/<br\s*\/?>|\n/i)) {
    const [k = '', v = ''] = part.split(':')
    const key = k.replace(/\s/g, '')
    if (key.startsWith('탄수화물')) out.carbs_g = num(v)
    else if (key.startsWith('단백질')) out.protein_g = num(v)
    else if (key.startsWith('지방')) out.fat_g = num(v)
  }
  return out
}

/** 급식 응답(한 학교·한 날·한 끼) → 메뉴·합계. 메뉴가 없으면 null */
export function parseMeal(json: unknown): SchoolMeal | null {
  const r = neisRows(json, 'mealServiceDietInfo')[0]
  if (!r) return null
  const menu = parseMenu(str(r.DDISH_NM))
  if (menu.length === 0) return null
  return { menu, kcal: parseKcal(str(r.CAL_INFO)), ...parseNutrients(str(r.NTR_INFO)) }
}

/** 결과 화면 "학교 기준 1인분 ○○kcal"는 그럴듯한 한 끼일 때만(스펙 4.9절, 시험에서 2,964kcal 같은 값이 섞여 있었다) */
export function plausibleSchoolKcal(kcal: number | null | undefined): number | null {
  return typeof kcal === 'number' && kcal >= 300 && kcal <= 1500 ? Math.round(kcal) : null
}

/** 끼니 → 급식 코드(조식 1·중식 2·석식 3, 간식 없음) */
export function mealCode(mealType: string): '1' | '2' | '3' | null {
  return mealType === 'breakfast' ? '1' : mealType === 'lunch' ? '2' : mealType === 'dinner' ? '3' : null
}
