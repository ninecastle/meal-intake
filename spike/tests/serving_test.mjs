// 일반 음식 1인분 무게(2026-10-29 사용자 결정): servingOf 순서(w → 대표식품명 표 → null), 표 형식·범위, 호출 D serving_g 파싱.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const D = await import(u('src/analysis/nutrition/db.ts'))
const R = await import(u('src/analysis/nutrition/resolve.ts'))
let fails = 0
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++ }

const db = JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8'))
const table = JSON.parse(readFileSync(W + 'public/data/serving-20261029.json', 'utf8'))

// ── 표 형식·범위 ──
const reps = Object.keys(table.byRep)
ok(table.version === '20261029' && reps.length > 1000, `표: version·개수 ${reps.length}`)
ok(reps.every((r) => Number.isInteger(table.byRep[r]) && table.byRep[r] >= 5 && table.byRep[r] <= 1500), '모든 값 5~1500 정수')
ok(reps.every((r) => table.source[r] === 'mfds_ref' || table.source[r] === 'ai') && Object.keys(table.source).length === reps.length, 'source는 mfds_ref|ai, byRep와 같은 키')
const needs = new Set(db.foods.filter((f) => !f.w).map((f) => f.r))
ok([...needs].every((r) => r in table.byRep), `w 없는 행이 있는 대표식품명 ${needs.size}개 모두 표에 있음`)
ok(table.byRep['쌀밥'] === 210 && table.source['쌀밥'] === 'mfds_ref' && table.byRep['배추김치'] === 40, '쌀밥 210·배추김치 40(1회 섭취참고량)')
ok(JSON.stringify(table).length < 40000, `표 크기 ${JSON.stringify(table).length}B`)

// ── servingOf 순서 ──
const withW = db.foods.find((f) => f.w && f.w >= 5 && f.w <= 1500)
const noW = db.foods.find((f) => !f.w && f.r === '김치찌개')
ok(D.servingOf(withW.c) === null, '표·DB 받기 전에는 null')
await D.loadDb(async () => db)
ok(D.servingOf(withW.c) === Math.round(withW.w), `DB만 받음: w 있는 행 → w (${withW.n} ${withW.w}g)`)
ok(D.servingOf(noW.c) === null, 'DB만 받음: w 없는 행 → null(표 아직 없음)')
await D.loadServing(async () => table)
ok(D.servingOf(withW.c) === Math.round(withW.w), '표를 받아도 w가 먼저')
ok(D.servingOf(noW.c) === table.byRep['김치찌개'], `w 없는 행 → 대표식품명 표 (${noW.n} ${D.servingOf(noW.c)}g)`)
ok(D.servingOf('없는코드') === null, '없는 코드 → null')
ok(D.servingOfRep('없는대표') === null, '표에 없는 대표식품명 → null')

// ── 호출 D serving_g ──
ok(R.checkServingG(350) === 350 && R.checkServingG(349.6) === 350 && R.checkServingG(4) === null && R.checkServingG(1501) === null && R.checkServingG('300') === null, 'checkServingG 범위·형식')
const per = { kcal: 80, carbs_g: 5, protein_g: 6, fat_g: 4 }
ok(JSON.stringify(R.checkEstimate({ ...per, serving_g: 400 })) === JSON.stringify({ ...per, serving_g: 400 }), 'checkEstimate: serving_g 붙임')
ok(JSON.stringify(R.checkEstimate({ ...per, serving_g: 3000 })) === JSON.stringify(per), '범위 밖 serving_g는 뺌(100g당 값은 그대로)')
ok(JSON.stringify(R.checkEstimate(per)) === JSON.stringify(per), 'serving_g 없음(d1 캐시)도 통과')
ok(R.checkEstimate({ ...per, kcal: 1200, serving_g: 300 }) === null, '100g당 값이 틀리면 전체 null')

// resolver: 호출 D 결과의 serving_g가 ai_estimate 결과에 실리고 per_100g에는 섞이지 않는다
const loadIndex = () => D.loadDb()
const res = R.createNutritionResolver({ loadIndex, estimate: async () => ({ ...per, serving_g: 420 }), searchGrounding: false })
const r1 = await res.resolveNutrition('없는음식xyz')
ok(r1.source === 'ai_estimate' && r1.via === 'call_d' && r1.serving_g === 420 && !('serving_g' in r1.per_100g), `호출 D → serving_g 420 (${JSON.stringify(r1)})`)
const r2 = await res.resolveNutrition('없는음식xyz', { guess: per })
ok(r2.source === 'ai_estimate' && r2.via === 'guess' && r2.serving_g === undefined, 'guess(사진 분석) 경로에는 serving_g 없음')
const res2 = R.createNutritionResolver({ loadIndex, estimate: async () => ({ ...per, serving_g: 99999 }), searchGrounding: false })
const r3 = await res2.resolveNutrition('없는음식abc')
ok(r3.source === 'ai_estimate' && r3.serving_g === undefined, '범위 밖 serving_g → 없음(무게는 화면 기본 100g)')
const m = await R.mockEstimate('x')
ok(m.serving_g === R.MOCK_SERVING_G, '목업 호출 D serving_g')
// 캐시: d2 값(serving_g 포함)을 그대로 돌려준다
const store = new Map()
const res3 = R.createNutritionResolver({ loadIndex, estimate: async () => ({ ...per, serving_g: 310 }), searchGrounding: false, cache: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) } })
await res3.resolveNutrition('없는음식캐시')
ok(store.get('없는음식캐시')?.serving_g === 310 || [...store.values()][0]?.serving_g === 310, '영구 캐시에 serving_g 저장')

// 호출 D 프롬프트·파싱
const E = await import(u('src/analysis/nutrition/estimate.ts')).catch((e) => ({ err: e }))
if (E.err) console.log('estimate.ts 직접 불러오기 생략(firebase/ai 의존):', String(E.err.message).slice(0, 80))
else {
  ok(E.PROMPT_VERSION_D === 'd2' && E.buildPromptD('김치찌개').includes('serving_g'), '프롬프트 d2·serving_g 문장')
  const p = E.parseEstimateText('```json\n{"kcal":60,"carbs_g":4,"protein_g":4,"fat_g":3,"serving_g":380}\n```')
  ok(p.ok && p.value.serving_g === 380, 'parseEstimateText serving_g')
  const q = E.parseEstimateText('{"kcal":60,"carbs_g":4,"protein_g":4,"fat_g":3,"serving_g":0}')
  ok(q.ok && q.value.serving_g === undefined, 'serving_g 0 → 뺌')
}
console.log(`\nSERVING ${fails === 0 ? '모두 통과' : `실패 ${fails}`}`)
process.exit(fails ? 1 : 0)
