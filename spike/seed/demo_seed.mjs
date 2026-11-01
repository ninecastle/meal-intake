// 심사위원용 테스트 계정에 넣을 가상 식단(2026-11-01 사용자 요청). AI 호출 없음.
// 앱의 계산 코드(web/src/analysis: DB 조회·applyNutrition·applyDetail·국물 나누기·buildAnalysis)를 그대로 써서
// 앱이 직접 저장한 것과 같은 모양의 문서를 만든다. 끼니는 날짜로 정한 난수라 범위와 상관없이 같은 날은 늘 같고(문서 id도 고정),
// 체중은 시작 → 끝 흐름(63.4 → 61kg쯤)이라 이어 채울 때는 시작을 그대로 두고 끝만 늘린 뒤 [이어 채울 첫 날짜]를 준다.
//
// 쓰는 법: node spike/seed/demo_seed.mjs <시작 YYYY-MM-DD> <끝 YYYY-MM-DD> <출력 JSON> [사진 폴더] [이어 채울 첫 날짜]
//   → { users: {...}, docs: [{ path, fields }] } (path는 users/{UID} 아래 상대 경로, 쓰기는 demo_write.mjs)
// 사진 폴더: thumbs/<slug>_<n>.jpg(긴 변 360·5:4, make_thumbs.py가 만듦)와 manifest.json. 있으면 그 음식의 먹기 전 사진으로 넣는다.
// 이어 채울 첫 날짜: 그 날짜부터의 문서만 낸다(사진 차례·목표·체중 흐름은 시작부터 계산). 사용자 문서(목표·목표 몸무게)는 비워
//   쓰지 않는다(심사위원이 처음처럼 흐름에서 정한 목표를 덮지 않게). 예: 9/1~10/31을 쓴 뒤 2026-09-01 2026-11-04 … 2026-11-01
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'web')
const imp = (p) => import(pathToFileURL(path.join(WEB, 'src', p)).href)
const [dbMod, resolveMod, detailMod, brothMod, compute, foodNameMod, goalMod] = await Promise.all([
  imp('analysis/nutrition/db.ts'),
  imp('analysis/nutrition/resolve.ts'),
  imp('analysis/nutrition/detail.ts'),
  imp('analysis/nutrition/broth.ts'),
  imp('analysis/compute.ts'),
  imp('lib/foodName.ts'),
  imp('analysis/goal.ts'),
])
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(WEB, 'public/data', f), 'utf8'))
const dataFile = (prefix) => fs.readdirSync(path.join(WEB, 'public/data')).find((f) => f.startsWith(prefix))
const index = await dbMod.loadDb(async () => readJson(dataFile('mfds-foods-')))
await detailMod.loadDetailDb(async () => readJson(dataFile('mfds-detail-')))
const brothTable = await brothMod.loadBroth(async () => readJson(dataFile('broth-')))
const resolver = resolveMod.createNutritionResolver({ loadIndex: async () => index, estimate: null })

const [START, END, OUT, PHOTO_DIR, FROM] = process.argv.slice(2)
if (!START || !END || !OUT) throw new Error('쓰는 법: demo_seed.mjs 시작 끝 출력.json [사진폴더] [이어 채울 첫 날짜]')
if (FROM && (FROM < START || FROM > END)) throw new Error('이어 채울 첫 날짜는 시작~끝 안이어야 해요')

// ── 날짜로 정한 난수(같은 날짜·같은 칸이면 늘 같은 값) ──
function hash(s) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0
  return h
}
function rng(seed) {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const between = (r, a, b) => a + (b - a) * r()
const roundTo = (v, step) => Math.round(v / step) * step
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const docId = (seed) => {
  const r = rng(`id:${seed}`)
  return Array.from({ length: 20 }, () => ID_CHARS[Math.floor(r() * ID_CHARS.length)]).join('')
}

// ── 음식(식약처 DB 이름 그대로) ──
// g: 먹기 전 무게 범위, photo: 사진 폴더 이름표, show: 화면 이름(없으면 앱 규칙 foodName(DB 이름))
const F = {
  rice: { db: '쌀밥', g: [190, 220] },
  multigrain: { db: '잡곡밥', g: [190, 220] },
  kimchi: { db: '배추김치', g: [35, 55] },
  eggroll: { db: '달걀말이', g: [60, 90] },
  beansprout: { db: '콩나물무침', g: [40, 60] },
  spinach: { db: '시금치나물', g: [40, 60] },
  anchovy: { db: '멸치볶음', g: [20, 30] },
  fishcake: { db: '어묵볶음', g: [40, 60] },
  potato: { db: '감자조림', g: [50, 70] },
  tofu: { db: '두부조림', g: [70, 100] },
  seaweedsoup: { db: '미역국', g: [300, 380] },
  sproutsoup: { db: '콩나물국', g: [300, 380] },
  bibimbap: { db: '비빔밥', g: [430, 500], photo: 'bibimbap' },
  kimchistew: { db: '김치찌개', g: [380, 450], photo: 'kimchi_jjigae' },
  soybeanstew: { db: '된장찌개', g: [380, 450], photo: 'doenjang_jjigae' },
  jeyuk: { db: '제육볶음', g: [180, 230], photo: 'jeyuk_bokkeum' },
  donkatsu: { db: '돈가스', g: [220, 260], photo: 'donkatsu' },
  jajang: { db: '짜장면', g: [600, 680], photo: 'jajangmyeon' },
  jjamppong: { db: '짬뽕', g: [850, 950], photo: 'jjamppong' },
  kalguksu: { db: '칼국수', g: [750, 850], photo: 'kalguksu' },
  pho: { db: '쌀국수', g: [700, 800], photo: 'pho' },
  curry: { db: '카레라이스', g: [420, 480], photo: 'curry_rice' },
  gimbap: { db: '김밥', g: [220, 260], photo: 'gimbap' },
  tteokbokki: { db: '떡볶이', g: [280, 340], photo: 'tteokbokki' },
  sundaegukbap: { db: '국밥_순대국밥', g: [650, 750], photo: 'sundae_gukbap' },
  bulgogi: { db: '소불고기', g: [180, 220], photo: 'bulgogi' },
  omurice: { db: '오므라이스', g: [380, 440], photo: 'omurice' },
  udon: { db: '우동', g: [650, 750], photo: 'udon' },
  naengmyeon: { db: '물냉면', g: [700, 800], photo: 'naengmyeon' },
  samgyeopsal: { db: '삼겹살구이', g: [180, 230], photo: 'samgyeopsal' },
  chicken: { db: '닭튀김_후라이드 치킨', g: [300, 380], photo: 'fried_chicken', show: '후라이드 치킨' },
  pizza: { db: '피자', g: [250, 330], photo: 'pizza' },
  salad: { db: '샐러드_닭가슴살', g: [230, 280], photo: 'chicken_salad', show: '닭가슴살 샐러드' },
  mackerel: { db: '고등어구이', g: [110, 140], photo: 'grilled_mackerel' },
  galbitang: { db: '갈비탕', g: [650, 750], photo: 'galbitang' },
  budae: { db: '부대찌개', g: [450, 520], photo: 'budae_jjigae' },
  japchae: { db: '잡채', g: [120, 160], photo: 'japchae' },
  spaghetti: { db: '스파게티', g: [380, 440], photo: 'spaghetti' },
  sushi: { db: '초밥_모듬', g: [280, 340], photo: 'sushi', show: '모둠 초밥' },
  bigmac: { db: '버거_빅맥 버거', g: [223, 223], photo: 'hamburger', unit: true },
  mandu: { db: '만두_군만두', g: [150, 190], photo: 'fried_mandu' },
  tteokguk: { db: '떡국', g: [600, 700], photo: 'tteokguk' },
  kimchirice: { db: '볶음밥_김치', g: [350, 400], photo: 'kimchi_fried_rice' },
  dakgalbi: { db: '닭볶음(닭갈비)', g: [280, 340], photo: 'dakgalbi', show: '닭갈비' },
  jokbal: { db: '족발', g: [220, 280], photo: 'jokbal' },
  hambak: { db: '함박스테이크', g: [180, 220], photo: 'hamburg_steak' },
  toast: { db: '토스트(식빵)', g: [110, 140], photo: 'toast', show: '토스트' },
  cereal: { db: '시리얼_우유', g: [230, 280], photo: 'cereal', show: '시리얼과 우유' },
  sandwich: { db: '샌드위치', g: [170, 210], photo: 'sandwich' },
  yogurt: { db: '요구르트(액상)_그릭요거트', g: [150, 180], photo: 'yogurt', show: '그릭요거트' },
  egg: { db: '달걀_삶은것', g: [50, 55], photo: 'boiled_eggs', show: '삶은 달걀' },
  sweetpotato: { db: '고구마_밤고구마_삶은것', g: [130, 170], photo: 'sweet_potato', show: '찐 고구마' },
  latte: { db: '커피_카페라떼', g: [330, 360], photo: 'cafe_latte', show: '카페라떼' },
  americano: { db: '커피_아메리카노', g: [350, 400], photo: 'americano', show: '아메리카노' },
  cake: { db: '케이크_치즈케이크', g: [90, 110], photo: 'cake', show: '치즈케이크' },
  pound: { db: '파운드케이크', g: [70, 90] },
  icecream: { db: '아이스크림_바닐라 아이스크림', g: [100, 115], show: '바닐라 아이스크림' },
  fruitsalad: { db: '과일샐러드', g: [150, 200], photo: 'fruit', show: '과일 샐러드' },
  donut: { db: '도넛', g: [60, 80] },
}
const codeOf = new Map(index.db.foods.map((f, i) => [f.n, f.c]))
for (const [k, v] of Object.entries(F)) if (!codeOf.has(v.db)) throw new Error(`DB에 없는 이름: ${k} ${v.db}`)

// ── 사진 ──
const photos = new Map() // photo 이름표 → [{ file, b64, w, h }]
if (PHOTO_DIR && fs.existsSync(path.join(PHOTO_DIR, 'thumbs'))) {
  for (const f of fs.readdirSync(path.join(PHOTO_DIR, 'thumbs')).sort()) {
    const m = /^(.+)_(\d+)\.jpg$/.exec(f)
    if (!m) continue
    const buf = fs.readFileSync(path.join(PHOTO_DIR, 'thumbs', f))
    const list = photos.get(m[1]) ?? []
    list.push({ file: f, b64: buf.toString('base64'), w: 360, h: 288 })
    photos.set(m[1], list)
  }
}

// ── 한 끼 차림(가장 위가 대표 음식, 사진은 대표 음식) ──
const SIDES = ['kimchi', 'eggroll', 'beansprout', 'spinach', 'anchovy', 'fishcake', 'potato', 'tofu']
const MENUS = {
  breakfast: [
    ['toast', 'egg', 'americano'], ['cereal'], ['sandwich', 'latte'], ['yogurt', 'fruitsalad'], ['gimbap'],
    ['rice', 'seaweedsoup', 'kimchi', 'eggroll'], ['sweetpotato', 'egg'], ['toast', 'latte'], ['rice', 'sproutsoup', 'kimchi', 'anchovy'],
  ],
  lunch: [
    ['bibimbap'], ['kimchistew', 'rice', 'eggroll'], ['soybeanstew', 'rice', 'kimchi'], ['jeyuk', 'rice', 'kimchi', 'beansprout'],
    ['donkatsu'], ['jajang'], ['jjamppong'], ['kalguksu', 'kimchi'], ['pho'], ['curry'], ['gimbap', 'tteokbokki'], ['sundaegukbap', 'kimchi'],
    ['bulgogi', 'multigrain', 'spinach'], ['omurice'], ['udon', 'gimbap'], ['naengmyeon'], ['salad'], ['kimchirice'], ['bigmac'], ['mackerel', 'rice', 'seaweedsoup', 'kimchi'],
  ],
  dinner: [
    ['mackerel', 'multigrain', 'sproutsoup', 'kimchi'], ['galbitang', 'rice', 'kimchi'], ['budae', 'rice'], ['japchae', 'rice', 'tofu'],
    ['spaghetti'], ['salad'], ['bulgogi', 'rice', 'kimchi'], ['dakgalbi', 'rice'], ['hambak', 'rice'], ['soybeanstew', 'multigrain', 'fishcake', 'kimchi'],
    ['kimchistew', 'multigrain', 'potato'], ['tteokguk', 'kimchi'], ['salad', 'sweetpotato'],
  ],
  // 금·토 저녁
  treat: [['chicken'], ['pizza'], ['samgyeopsal', 'rice', 'soybeanstew', 'kimchi'], ['jokbal', 'kimchi'], ['sushi'], ['chicken', 'pizza'], ['dakgalbi', 'kimchirice']],
  snack: [['americano'], ['latte'], ['latte', 'cake'], ['americano', 'pound'], ['icecream'], ['fruitsalad'], ['sweetpotato'], ['donut', 'americano'], ['mandu']],
}
const TIMES = { breakfast: [7, 30, 8, 40], lunch: [12, 0, 13, 10], dinner: [18, 30, 20, 0], snack: [15, 0, 16, 30] }
const WEEKEND_TIMES = { breakfast: [9, 20, 10, 30], lunch: [12, 40, 14, 0], dinner: [18, 0, 19, 40], snack: [15, 30, 17, 0] }

// ── 음식 한 줄 ──
async function makeItem(key, id, r, opts) {
  const f = F[key]
  const code = codeOf.get(f.db)
  const res = await resolver.resolveNutrition(f.db, { dbCode: code })
  if (res.source !== 'db') throw new Error(`DB 값이 아님: ${f.db} ${res.source}`)
  const grams = f.g[0] === f.g[1] ? f.g[0] : Math.round(roundTo(between(r, f.g[0], f.g[1]), 5))
  let item = compute.recomputeItem({
    id,
    name: f.show ?? foodNameMod.foodName(f.db),
    db_food_code: null,
    eaters: 1,
    before_grams: grams,
    remaining_ratio: opts.ratio,
    consumed_grams: 0,
    per_100g: null,
    nutrition_source: 'user_input',
    consumed: { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 },
    kcal_overridden: true,
    confidence: opts.photo ? Math.round(between(r, 0.82, 0.95) * 100) / 100 : 1,
    needs_review: false,
  })
  item = compute.applyNutrition(item, res)
  item = compute.applyDetail(item, await detailMod.detailFor(code))
  if (f.unit) item = compute.recomputeItem({ ...item, published_g: grams, unit_count: 1, grams_source: 'published', unit: '개' })
  // 국물 요리는 앱처럼 면·건더기/국물 두 항목(CLAUDE.md "국물 요리 나누기")
  const split = brothMod.splitSoupItemWith(brothTable, item)
  if (split) {
    const [solid, broth] = split
    // 국물은 가끔 남긴다(사진 없이 직접 고른 남긴 양)
    const brothLeft = opts.ratio === 0 && r() < 0.35 ? roundTo(between(r, 0.3, 0.7), 0.1) : opts.ratio
    return [solid, compute.recomputeItem({ ...broth, remaining_ratio: Math.round(brothLeft * 10) / 10 })]
  }
  return [item]
}

// ── 날짜 ──
const DAY_MS = 86_400_000
const keyOf = (t) => new Date(t).toISOString().slice(0, 10)
const tOf = (key) => Date.parse(`${key}T00:00:00Z`)
const dowOf = (key) => new Date(tOf(key)).getUTCDay() // 0 일 … 6 토
const kst = (key, h, m) => new Date(Date.parse(`${key}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)).toISOString()
const hm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

// ── 목표: 9/1 처음, 10/1 몸무게 바뀐 뒤 다시 계산(날짜별 목표 기록) ──
const goals = []
for (const [day, kg] of [['2026-09-01', 63.4], ['2026-10-01', 62.2]]) {
  if (day < START || day > END) continue
  const input = { sex: 'female', age: 29, height_cm: 163, weight_kg: kg, activity: 'moderate', goal: 'lose' }
  const result = goalMod.computeGoal(input)
  const { targets } = goalMod.applyOverride(result, null)
  const tg = { target_kcal: targets.target_kcal, carbs_g: targets.carbs_g, protein_g: targets.protein_g, fat_g: targets.fat_g, source: targets.source }
  goals.push({ day, input, result, targets: tg })
}
const targetOn = (day) => [...goals].reverse().find((g) => g.day <= day)?.targets.target_kcal ?? goals[0]?.targets.target_kcal ?? 1700

const docs = []
for (const g of goals) docs.push({ path: `goals/${g.day}`, fields: { dateKey: g.day, targets: g.targets, updatedAt: { $ts: kst(g.day, 9, 0) } } })
const stats = { meals: 0, photos: 0, days: 0, weights: 0, kcalByDay: [] }
const photoTurn = new Map()

for (let t = tOf(START); t <= tOf(END); t += DAY_MS) {
  const day = keyOf(t)
  const dow = dowOf(day)
  const weekend = dow === 0 || dow === 6
  const r = rng(`day:${day}`)
  const mealTimes = {}
  const fasted = []
  let dayKcal = 0

  const plan = []
  // 아침: 평일 20%·주말 35% 거름(공복)
  if (r() < (weekend ? 0.35 : 0.2)) fasted.push('breakfast')
  else plan.push(['breakfast', pick(r, MENUS.breakfast)])
  plan.push(['lunch', pick(r, MENUS.lunch)])
  plan.push(['dinner', (dow === 5 || dow === 6) && r() < 0.75 ? pick(r, MENUS.treat) : pick(r, MENUS.dinner)])
  if (r() < (weekend ? 0.5 : 0.6)) plan.push(['snack', pick(r, MENUS.snack)])

  const treatDay = plan.some(([m, menu]) => m === 'dinner' && MENUS.treat.includes(menu))
  const meals = []
  for (const [mealType, menu0] of plan) {
    const rr = rng(`meal:${day}:${mealType}`)
    // 한식 차림에 반찬 하나를 가끔 더한다
    const menu = [...menu0]
    if (menu.includes('rice') || menu.includes('multigrain')) if (rr() < 0.4) menu.push(pick(rr, SIDES.filter((s) => !menu.includes(s))))
    const main = F[menu[0]]
    const mainPhotos = main.photo ? photos.get(main.photo) : null
    // 사진으로 기록한 끼니: 대표 음식 사진이 있고 간식이 아니면 대부분(85%). 먹은 후는 [다 먹었어요]·[남긴 양 직접 고르기](사진 없음)
    const byPhoto = !!mainPhotos?.length && (mealType !== 'snack' ? rr() < 0.85 : rr() < 0.3)
    const leftSome = rr() < 0.25
    const items = []
    let n = 0
    for (const key of menu) {
      // 반찬·밥은 가끔 조금 남긴다
      const side = key === 'rice' || key === 'multigrain' || SIDES.includes(key)
      const ratio = leftSome && side ? roundTo(between(rr, 0.1, 0.5), 0.1) : 0
      n++
      for (const it of await makeItem(key, byPhoto ? `i${n}` : `u${n}`, rr, { photo: byPhoto, ratio: Math.round(ratio * 10) / 10 })) items.push(it)
    }
    meals.push({ mealType, items, byPhoto, main, mainPhotos, rr })
  }
  // 다이어트 중인 사람처럼: 금·토 외식 날 말고는 하루 양을 그날 목표의 86~110% 근처로(먹기 전 무게를 함께 줄이거나 늘린다, 개수 메뉴는 그대로)
  if (!treatDay) {
    const total = meals.reduce((s, m) => s + m.items.reduce((a, it) => a + it.consumed.kcal, 0), 0)
    const aim = targetOn(day) * between(r, 0.86, 1.1)
    const f = Math.min(1.15, Math.max(0.75, aim / (total || 1)))
    for (const m of meals)
      m.items = m.items.map((it) => (it.grams_source === 'published' ? it : compute.recomputeItem({ ...it, before_grams: Math.max(5, roundTo(it.before_grams * f, 5)) })))
  }

  for (const { mealType, items, byPhoto, main, mainPhotos, rr } of meals) {
    const analysis = compute.buildAnalysis(items, [], byPhoto ? { model: 'gemini-3.5-flash-lite', prompt_version: 'a11' } : undefined)
    const [h0, m0, h1, m1] = (weekend ? WEEKEND_TIMES : TIMES)[mealType]
    const mins = Math.round(between(rr, h0 * 60 + m0, h1 * 60 + m1))
    const [H, M] = [Math.floor(mins / 60), mins % 60]
    mealTimes[mealType] = hm(H, M)
    const created = kst(day, H, M)
    const updated = new Date(Date.parse(created) + Math.round(between(rr, 15, 55)) * 60_000).toISOString()
    const id = docId(`${day}:${mealType}`)
    docs.push({
      path: `meals/${id}`,
      fields: { dateKey: day, mealType, status: 'done', analysis, consumedKcal: analysis.totals.consumed.kcal, createdAt: { $ts: created }, updatedAt: { $ts: updated } },
    })
    stats.meals++
    dayKcal += analysis.totals.consumed.kcal
    if (byPhoto) {
      const turn = photoTurn.get(main.photo) ?? 0
      photoTurn.set(main.photo, turn + 1)
      const p = mainPhotos[turn % mainPhotos.length]
      docs.push({ path: `mealPhotos/${id}`, fields: { before: { $bytes: p.b64 }, w: p.w, h: p.h, createdAt: { $ts: created }, updatedAt: { $ts: created } } })
      stats.photos++
    }
  }
  docs.push({ path: `days/${day}`, fields: { dateKey: day, mealTimes, ...(fasted.length ? { fasted } : {}), updatedAt: { $ts: kst(day, 22, 0) } } })
  stats.days++
  stats.kcalByDay.push([day, Math.round(dayKcal)])

  // 체중: 9/1 63.4kg → 끝 61.0kg 쯤, 주 3번 정도 아침
  const wr = rng(`weight:${day}`)
  if (wr() < 0.45 || day === START || day === END) {
    const span = (tOf(END) - tOf(START)) / DAY_MS || 1
    const k = (t - tOf(START)) / DAY_MS / span
    const kg = Math.round((63.4 - 2.4 * k + between(wr, -0.25, 0.25)) * 10) / 10
    docs.push({ path: `weights/${day}`, fields: { dateKey: day, kg, updatedAt: { $ts: kst(day, 7, Math.round(between(wr, 0, 40))) } } })
    stats.weights++
  }
}

const last = goals.at(-1)
const user = last && !FROM
  ? { goal: { input: last.input, override: null, result: last.result, targets: last.targets, updatedAt: { $ts: kst(last.day, 9, 0) } }, targetWeightKg: 58 }
  : {}

// 이어 채우기: FROM 날짜부터의 문서만(사진 문서는 남긴 끼니 id로)
let out = docs
if (FROM) {
  const dayOf = (d) => d.fields.dateKey ?? null
  const mealIds = new Set(docs.filter((d) => d.path.startsWith('meals/') && dayOf(d) >= FROM).map((d) => d.path.slice('meals/'.length)))
  out = docs.filter((d) => (d.path.startsWith('mealPhotos/') ? mealIds.has(d.path.slice('mealPhotos/'.length)) : dayOf(d) >= FROM))
  const count = (p) => out.filter((d) => d.path.startsWith(p)).length
  Object.assign(stats, { meals: count('meals/'), photos: count('mealPhotos/'), days: count('days/'), weights: count('weights/') })
  stats.kcalByDay = stats.kcalByDay.filter(([day]) => day >= FROM)
}

fs.writeFileSync(OUT, JSON.stringify({ range: [FROM ?? START, END], user, docs: out }))
const kc = stats.kcalByDay.map((x) => x[1])
console.log(JSON.stringify({ ...stats, kcalByDay: undefined, ...(FROM ? { perDay: stats.kcalByDay.map(([d, k]) => `${d.slice(5)} ${k}`) } : {}), avgKcal: Math.round(kc.reduce((a, b) => a + b, 0) / kc.length), minKcal: Math.min(...kc), maxKcal: Math.max(...kc), goals: goals.map((g) => [g.day, g.targets.target_kcal]), photoDishes: [...photos.keys()].length }))
