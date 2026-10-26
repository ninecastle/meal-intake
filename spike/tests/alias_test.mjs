// 별칭·세부 종류 시험(2단계 조각 1 데이터 쪽). 실제 AI 호출 없음: 호출 D는 mockEstimate.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const u = (p) => pathToFileURL(W + p).href
const { createNutritionResolver, mockEstimate } = await import(u('src/analysis/nutrition/resolve.ts'))
const { loadDb, matchFood, listFoodVariants, searchFoodNames } = await import(u('src/analysis/nutrition/db.ts'))
const { isHighVarianceFood } = await import(u('src/analysis/nutrition/highVariance.ts'))
const loadIndex = () => loadDb(async () => JSON.parse(readFileSync(W + 'public/data/mfds-foods-20261006.json', 'utf8')))
const idx = await loadIndex()
let calls = 0
const estimate = (n, s) => { calls++; return mockEstimate(n, s) }
const R = createNutritionResolver({ loadIndex, estimate, searchGrounding: false })
const GUESS = { kcal: 180, carbs_g: 20, protein_g: 7, fat_g: 8 }
const fmt = (r) => {
  if (r.source === 'db') return `${r.ml_converted ? 'DB(환산)' : 'DB'} | ${r.db_match} | ${r.db_name} | ${r.per_100g.kcal}`
  if (r.source === 'ai_estimate')
    return `AI 추정(${r.via}) | - | ${r.reference ? `참고: ${r.reference.db_name} (${r.reference.db_match}) ${r.reference.kcal_per_100g}kcal` : '참고 없음'} | ${r.per_100g.kcal}`
  return `${r.source} | - | - | -`
}
const names = process.argv[2] === 'extra'
  ? ['치킨가스', '치킨까스', '먼치킨 도넛', '생선가스', '돈까스', '치즈돈까스', '간짜장', '카페라테', '야채김밥', '계란찜', '삶은계란', '오뎅볶음', '순살치킨', '치킨너겟', '컵라면', '닭갈비', '불고기', '카레', '짜장', '프라이드 치킨', '계란프라이', '떡볶이', '공깃밥', '순댓국', '치킨버거', '치킨 샐러드', '반반치킨', '라면', '김밥']
  : ['치킨', '후라이드 치킨', '양념치킨', '간장치킨', '순살 양념치킨', '치킨무', '계란후라이', '계란말이', '돈가스', '짜장면', '아메리카노', '아이스 아메리카노', '카페라떼', '김치찌개', '공기밥']
console.log('| 이름 | 종류 규칙 | 출처 | db_match | DB 행 / 참고 | kcal/100g |\n| --- | --- | --- | --- | --- | --- |')
for (const n of names) {
  const r = await R.resolveNutrition(n, { guess: GUESS })
  const m = matchFood(idx, n)
  console.log(`| ${n} | ${isHighVarianceFood(n, m?.food) ? 'O' : '-'} | ${fmt(r)} |`)
}
console.log('\n호출 D(목업) 수:', calls, '(guess가 있어 0이어야 함)')
for (const q of ['치킨', '떡볶이']) {
  const v = await listFoodVariants(q)
  console.log(`\nlistFoodVariants("${q}") ${v.length}개, 상위 10:`, v.slice(0, 10).map((x) => `${x.dbName}(${x.kcalPer100g})`).join(' | '))
}
const yang = (await listFoodVariants('양념치킨')).length
const byCode = await listFoodVariants('', { dbCode: idx.db.foods[idx.byGroup.get('떡볶이')].c, limit: 3 })
console.log('\n양념치킨 목록 수:', yang, '| dbCode(떡볶이 대표 행), limit 3:', byCode.map((x) => x.dbName).join(' | '))
console.log('없는 이름:', JSON.stringify(await listFoodVariants('없는음식xyz')))
const lat = await listFoodVariants('카페라떼')
console.log('카페라떼 목록:', lat.map((x) => `${x.dbName}${x.mlConverted ? '[환산]' : ''}`).join(' | '))
const sg = await searchFoodNames('치킨')
console.log('searchFoodNames("치킨"):', sg.map((x) => `${x.label}${x.mlConverted ? '[환산]' : ''}`).join(' | '))
const sl = await searchFoodNames('아메리카노')
console.log('searchFoodNames("아메리카노"):', sl.map((x) => `${x.label}${x.mlConverted ? '[환산]' : ''}`).join(' | '))
