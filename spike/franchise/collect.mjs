// 프랜차이즈 보충표 수집(2026-10-29). 공식 홈페이지 영양정보만 쓴다 — 숫자를 지어내지 않는다.
// 실행: node spike/franchise/collect.mjs [--refresh]
//   원본은 spike/franchise/raw/에 받아 두고(있으면 다시 받지 않음, --refresh면 다시 받음) 요청 사이 300ms 쉰다.
// 출력: web/public/data/franchise-20261029.json (계약: web/src/analysis/nutrition/franchise.ts FranchiseTable)
//       spike/franchise/report.json (브랜드별 수, 중량 차이 등 — 08_franchise_table.md 작성용)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RAW = path.join(HERE, 'raw')
const CHECKED = '2026-10-29'
const VERSION = '20261029'
const OUT = path.join(ROOT, 'web/public/data', `franchise-${VERSION}.json`)
const REFRESH = process.argv.includes('--refresh')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(path.join(RAW, 'sb'), { recursive: true })

/** 원본을 raw/에 두고 읽는다(없거나 --refresh면 받는다). encoding: 'utf8' | 'euc-kr' */
async function cached(name, url, { method = 'GET', body, headers = {}, encoding = 'utf8' } = {}) {
  const file = path.join(RAW, name)
  if (!REFRESH && fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  await sleep(300)
  const res = await fetch(url, { method, body, headers: { 'User-Agent': UA, ...headers } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const text = new TextDecoder(encoding).decode(buf)
  fs.writeFileSync(file, text)
  return text
}

const num = (v) => {
  if (v === null || v === undefined) return undefined
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : undefined
}
const clean = (o) => {
  const r = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && !Number.isNaN(v)) r[k] = v
  return Object.keys(r).length ? r : undefined
}
const strip = (h) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim()

/** HTML 표 → 2차원 배열(rowspan·colspan 반영) */
function tableGrid(html) {
  const grid = []
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1])
  rows.forEach((row, r) => {
    grid[r] = grid[r] || []
    let c = 0
    for (const m of row.matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t[hd]>/gi)) {
      while (grid[r][c] !== undefined) c++
      const rs = num((m[2].match(/rowspan="?(\d+)/i) || [])[1]) || 1
      const cs = num((m[2].match(/colspan="?(\d+)/i) || [])[1]) || 1
      const v = strip(m[3])
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
        grid[r + i] = grid[r + i] || []
        grid[r + i][c + j] = v
      }
      c += cs
    }
  })
  return grid
}

const menus = []
const excluded = [] // { brand, name, reason }
const add = (m) => menus.push({ ...m, checkedAt: CHECKED })

// ---------- 맥도날드 ----------
async function mcdonalds() {
  const url = 'https://www.mcdonalds.co.kr/api/v1/kor/product/nutrition'
  const list = JSON.parse(await cached('mcd.json', url)).resultObject.list
  const seen = new Set()
  for (const x of list) {
    const g = x.menuGroup
    const name = x.menuName.replace(/[®™]/g, '').replace(/\s+/g, ' ').trim()
    if (/옵션/.test(g)) { excluded.push({ brand: 'mcdonalds', name, reason: '해피밀 옵션(구성품)' }); continue }
    const isSet = /세트|콤보|해피밀/.test(g)
    const facts = {}
    if (x.nutritionFacts && x.nutritionFacts !== '-') {
      for (const part of x.nutritionFacts.split(',')) {
        const [k, v] = part.split(';')
        if (k && v) facts[k.trim()] = v.trim()
      }
    }
    let kcal = num(facts['열량'])
    if (kcal === undefined) {
      if (/-/.test(x.calorie) || !x.calorie) { excluded.push({ brand: 'mcdonalds', name, reason: 'kcal 범위만 공개' }); continue }
      kcal = num(x.calorie)
    }
    const key = name + '|' + (x.type === 'morning' ? 'm' : 'r')
    if (seen.has(name)) continue // 아침·일반 메뉴판에 같은 이름이 있으면 한 번만
    seen.add(name)
    const w = facts['중량']
    const category = isSet ? 'set' : /버거|머핀|맥모닝/.test(g + name) && !/음료|디저트|사이드/.test(g) ? 'burger' : /음료/.test(g) ? 'drink' : /디저트/.test(g) ? 'dessert' : 'side'
    add({
      id: `mcd-${x.plu}${x.type === 'morning' ? 'm' : ''}`,
      brand: 'mcdonalds', name, unit: isSet ? '인분' : category === 'drink' ? '잔' : '개',
      unitWeight_g: w ? num(w) : undefined,
      perUnit: clean({ kcal, protein_g: num(facts['단백질']), sugar_g: num(facts['당']), sodium_mg: num(facts['나트륨']), sat_fat_g: num(facts['포화지방']) }),
      category, sourceUrl: url, _key: key,
    })
  }
}

// ---------- 버거킹 ----------
async function burgerking() {
  const url = 'https://www.burgerking.co.kr/burgerking/BKR0347.json'
  const header = { error_code: '', error_text: '', info_text: '', login_session_id: '', message_version: '', result: true, trcode: 'BKR0347', cdCallChnn: null, content_update_flag: false, emergency_flag: false }
  const body = 'message=' + encodeURIComponent(JSON.stringify({ header, body: {} }))
  const j = JSON.parse(await cached('bk.json', url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }))
  const seen = new Set()
  for (const x of j.body.allNutrientList) {
    const name = x.menuNm.replace(/[®™]/g, '').trim()
    if (/소스|치즈$|슬라이스|베이컨|패티|토핑|추가|케찹|케첩|시럽|드레싱|^롱베이컨/.test(name)) { excluded.push({ brand: 'burgerking', name, reason: '소스·토핑 단독' }); continue }
    if (seen.has(name)) continue
    seen.add(name)
    const kcal = num(x.calory)
    if (kcal === undefined) { excluded.push({ brand: 'burgerking', name, reason: 'kcal 없음' }); continue }
    const category = /세트/.test(name) ? 'set' : /와퍼|버거/.test(name) ? 'burger' : /콜라|사이다|스프라이트|커피|라떼|아메리카노|주스|쉐이크|에이드|티$|우유|음료|미닛메이드|환타|제로/.test(name) ? 'drink' : /선데|아이스크림|파이|츄러스|콘$|크런치/.test(name) ? 'dessert' : 'side'
    add({
      id: `bk-${menus.filter((m) => m.brand === 'burgerking').length + 1}`,
      brand: 'burgerking', name, unit: category === 'set' ? '인분' : category === 'drink' ? '잔' : '개',
      unitWeight_g: num(x.weight) || undefined,
      perUnit: clean({ kcal, protein_g: num(x.protein), sugar_g: num(x.sugars), sodium_mg: num(x.natrium), sat_fat_g: num(x.satufat) }),
      category, sourceUrl: 'https://www.burgerking.co.kr/menu/nutrition',
    })
  }
}

// ---------- 스타벅스 ----------
const SB_DRINK = ['W0000003', 'W0000004', 'W0000005', 'W0000053', 'W0000060', 'W0000061', 'W0000062', 'W0000075', 'W0000171', 'W0000422']
const SB_FOOD = ['W0000013', 'W0000032', 'W0000033', 'W0000055', 'W0000056', 'W0000064']
const OZ = { 6: 'Short', 8: 'Short', 12: 'Tall', 16: 'Grande', 20: 'Venti', 24: 'Venti' }
async function starbucks() {
  for (const code of [...SB_DRINK, ...SB_FOOD]) {
    const drink = SB_DRINK.includes(code)
    let list
    try { list = JSON.parse(await cached(`sb/${code}.json`, `https://www.starbucks.co.kr/upload/json/menu/${code}.js`)).list || [] } catch (e) { console.warn('starbucks', code, e.message); continue }
    for (const x of list) {
      const name = x.product_NM.trim()
      let v = x
      try {
        const d = JSON.parse(await cached(`sb/view_${x.product_CD}.json`, 'https://www.starbucks.co.kr/menu/productViewAjax.do', { method: 'POST', body: `product_cd=${x.product_CD}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }))
        if (d.view) v = { ...x, ...d.view }
      } catch (e) { console.warn('starbucks view', x.product_CD, e.message) }
      const kcal = num(v.kcal)
      if (kcal === undefined) { excluded.push({ brand: 'starbucks', name, reason: 'kcal 없음' }); continue }
      const std = num(v.standard)
      const unit = String(v.unit || '').toLowerCase()
      let size, w
      if (std && unit === 'oz') { size = `${OZ[std] || ''} ${std}oz`.trim(); w = Math.round(std * 29.5735) }
      else if (std && unit === 'ml') { size = `${std}ml`; w = std }
      else if (std && unit === 'g') { w = std }
      const label = std && unit === 'oz' && OZ[std]
      const category = drink ? 'drink' : /샌드위치|베이글|스콘|패스츄리|브레드|토스트|샐러드|밀 박스/.test(v.cate_NAME + name) && code !== 'W0000032' ? 'etc' : 'dessert'
      add({
        id: `sb-${x.product_CD}`, brand: 'starbucks', name: label ? `${name} (${label})` : name, unit: drink ? '잔' : '개',
        size, unitWeight_g: w,
        perUnit: clean({ kcal, carbs_g: num(v.chabo), protein_g: num(v.protein), fat_g: num(v.fat), sugar_g: num(v.sugars), sodium_mg: num(v.sodium), sat_fat_g: num(v.sat_FAT) }),
        category, sourceUrl: `https://www.starbucks.co.kr/menu/${drink ? 'drink' : 'food'}_view.do?product_cd=${x.product_CD}`,
      })
    }
  }
}

// ---------- 이디야(음료) ----------
async function ediya() {
  const seen = new Set()
  for (let page = 1; page <= 40; page++) {
    const html = await cached(`ediya_${page}.html`, `https://ediya.com/inc/ajax_brand.php?gubun=menu_more&product_cate=7&page=${page}`)
    const items = html.split('<li>').slice(1)
    if (!items.length) break
    for (const it of items) {
      const id = (it.match(/id="nutri_(\d+)"/) || [])[1]
      const h2 = (it.match(/<h2>([\s\S]*?)<span>/) || [])[1]
      if (!id || !h2 || seen.has(id)) continue
      seen.add(id)
      let name = strip(h2)
      const vals = {}
      for (const m of it.matchAll(/<dt>([^<]*)<\/dt>\s*<dd>\(?([^<)]*)\)?<\/dd>/g)) vals[m[1].trim()] = m[2].trim()
      const kcal = /kcal/i.test(vals['칼로리'] || '') ? num(vals['칼로리']) : undefined
      if (kcal === undefined) { excluded.push({ brand: 'ediya', name, reason: 'kcal 없음' }); continue }
      const g = (k) => (/^[\d.]+g$/i.test(vals[k] || '') ? num(vals[k]) : undefined)
      const sodium = /mg$/i.test(vals['나트륨'] || '') ? num(vals['나트륨']) : undefined
      const sz = (name.match(/^\((L|EX|R|M|S|XL)\)\s*/i) || [])[1]
      if (sz) name = name.replace(/^\([^)]*\)\s*/, '')
      const cup = num((it.match(/컵용량\s*:\s*([\d,]+)\s*ml/i) || [])[1])
      const size = [sz && sz.toUpperCase(), cup && `컵 ${cup}ml`].filter(Boolean).join(' · ') || undefined
      add({
        id: `ediya-${id}`, brand: 'ediya', name: sz ? `${name} (${sz.toUpperCase()})` : name, unit: '잔', size,
        unitWeight_g: cup || undefined,
        perUnit: clean({ kcal, protein_g: g('단백질'), sugar_g: g('당류'), sodium_mg: sodium, sat_fat_g: g('포화지방') }),
        category: 'drink', sourceUrl: 'https://ediya.com/contents/drink.html',
      })
    }
  }
}

// ---------- 도미노피자 ----------
async function dominos() {
  const url = 'https://web.dominos.co.kr/contents/ingredient'
  let html = await cached('dominos.html', url, { encoding: 'euc-kr' })
  if (!/영양성분/.test(html)) html = await cached('dominos.html', url, { encoding: 'utf8' })
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1])
  const report = []
  let n = 0
  for (const t of tables) {
    const cap = strip((t.match(/<caption>([\s\S]*?)<\/caption>/i) || [])[1] || '')
    if (!/영양성분/.test(cap)) continue
    const grid = tableGrid(t)
    const head = grid[0] || []
    const hi = (re) => head.findIndex((h) => re.test(h))
    const iW = hi(/총\s*중량\s*\(g\)/)
    const iK = head.findIndex((h, i) => /열량/.test(h) && /총중량/.test(h) && !/범위/.test(h) && i > iW)
    const iP = hi(/단백질.*총중량/), iS = hi(/포화지방.*총중량/), iN = hi(/나트륨.*총중량/), iSu = hi(/당류.*총중량/)
    report.push(`${cap}: head=${head.join('|')}`)
    if (iW < 0 || iK < 0) continue
    const pizza = /피자/.test(cap)
    for (const row of grid.slice(1)) {
      if (!row || row.length < iK) continue
      // 제품명 칸은 앞쪽 colspan 3(피자: 이름·도우·사이즈), 사이드: 앞쪽 칸들
      const front = row.slice(0, iW).filter((v, i, a) => v && a.indexOf(v) === i)
      const kcal = num(row[iK]), w = num(row[iW])
      const base = front[0]
      if (!base || kcal === undefined || /토핑|소스|마이키친|단종/.test(cap + base)) continue
      let name, size
      if (pizza && front.length >= 3) { size = `${front[2]} · ${front[1]}`; name = `${base} ${front[1]} (${front[2]})` }
      else if (pizza && front.length === 2) { size = front[1]; name = `${base} (${front[1]})` }
      else { name = front.join(' '); size = undefined }
      add({
        id: `dominos-${++n}`, brand: 'dominos', name, unit: pizza ? '판' : '개', size,
        unitWeight_g: w || undefined,
        perUnit: clean({ kcal, protein_g: num(row[iP]), sat_fat_g: num(row[iS]), sodium_mg: num(row[iN]), sugar_g: num(row[iSu]) }),
        category: pizza ? 'pizza' : 'side', sourceUrl: url,
      })
    }
  }
  return report
}

// ---------- 교촌(100g당만) ----------
async function kyochon() {
  const list = await cached('kyochon_list.html', 'https://www.kyochon.com/menu/chicken.asp')
  const items = new Map()
  for (const m of list.matchAll(/<a href="view\.asp\?id=(\d+)&cg=(\d+)">[\s\S]*?<dt>([\s\S]*?)<\/dt>/g)) if (!items.has(m[1])) items.set(m[1], { cg: m[2], name: strip(m[3]) })
  for (const [id, it] of items) {
    const url = `https://www.kyochon.com/menu/view.asp?id=${id}`
    const html = await cached(`kyochon_${id}.html`, url)
    const sec = (html.match(/영양정보 - 구분, PCS[\s\S]*?<\/table>/) || [])[0]
    if (!sec) { excluded.push({ brand: 'kyochon', name: it.name, reason: '영양 표 없음' }); continue }
    if (!/<span class="gram">100g<\/span>/.test(sec)) { excluded.push({ brand: 'kyochon', name: it.name, reason: '100g 기준 아님' }); continue }
    const v = {}
    for (const m of sec.matchAll(/<td scope="row">([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g)) v[m[1].trim()] = num(m[2])
    const kcal = v['열량(Kcal)']
    if (kcal === undefined) { excluded.push({ brand: 'kyochon', name: it.name, reason: 'kcal 없음' }); continue }
    const name = it.name
    if (/소스|음료|콜라|사이다|^무$|치킨무/.test(name)) { excluded.push({ brand: 'kyochon', name, reason: '소스·음료' }); continue }
    const category = /세트/.test(name) ? 'set' : /볶음밥|떡|볼|칩스|샐러드|웨지|감자|튀김|面|면$|만두|고구마|치즈볼|버거/.test(name) ? (/버거/.test(name) ? 'burger' : 'side') : 'chicken'
    add({
      id: `kyochon-${id}`, brand: 'kyochon', name, unit: category === 'chicken' ? '마리' : category === 'set' ? '인분' : '개',
      per100: clean({ kcal, protein_g: v['단백질(g)'], sugar_g: v['당류(g)'], sodium_mg: v['나트륨(mg)'], sat_fat_g: v['포화지방(g)'] }),
      category, sourceUrl: url,
    })
  }
}

// ---------- 롯데리아(LOTTE EATZ 상품 소개, 1회 제공량) ----------
async function lotteria() {
  const brand = await cached('lotteria_brand.html', 'https://www.lotteeatz.com/brand/ria')
  const items = new Map()
  const dec = brand.replace(/&#39;/g, "'")
  for (const m of dec.matchAll(/GA_Event\('click_event',\s*'[^']*',\s*'([^'_]*)_상품_\d+',\s*'([^']*)'\);\s*goBrandDetail\('(REP_\d+)'\)/g)) if (!items.has(m[3])) items.set(m[3], { cat: m[1], name: m[2] })
  for (const [id, it] of items) {
    const url = `https://www.lotteeatz.com/products/introductions/${id}`
    const html = await cached(`lotteria_${id}.html`, url)
    // 주석으로 막아 둔 같은 제목이 앞에 있어 실제 표(<caption>영양소 정보</caption>)부터 읽는다
    const i = html.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length)).indexOf('<caption>영양소 정보</caption>') // 주석 안 표는 건너뜀
    if (i < 0) { excluded.push({ brand: 'lotteria', name: it.name, reason: '영양 표 없음' }); continue }
    const sec = html.slice(i, html.indexOf('</table>', i))
    const cells = [...sec.matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => [m[1], strip(m[2])])
    const v = {}
    for (let k = 0; k < cells.length - 1; k++) if (cells[k][0] === 'h' && cells[k + 1][0] === 'd') v[cells[k][1]] = cells[k + 1][1]
    const pick = (re) => { const key = Object.keys(v).find((k) => re.test(k)); return key ? num(v[key]) : undefined }
    const kcal = pick(/^열량/)
    if (kcal === undefined) { excluded.push({ brand: 'lotteria', name: it.name, reason: 'kcal 없음' }); continue }
    const c = it.cat
    const category = /세트/.test(c + it.name) ? 'set' : /버거/.test(c) ? 'burger' : /치킨/.test(c) ? 'chicken' : /음료|커피/.test(c) ? 'drink' : /디저트|아이스/.test(c) ? 'dessert' : 'side'
    add({
      id: `lotteria-${id}`, brand: 'lotteria', name: it.name, unit: category === 'set' ? '인분' : category === 'drink' ? '잔' : category === 'chicken' && /마리/.test(it.name) ? '마리' : '개',
      unitWeight_g: pick(/총중량/) || undefined,
      perUnit: clean({ kcal, protein_g: pick(/단백질/), sodium_mg: pick(/나트륨/), sugar_g: pick(/당류/), sat_fat_g: pick(/포화지방/) }),
      category, sourceUrl: url, _cat: c,
    })
  }
}

// ---------- BBQ(100g당, 상품 페이지 "※100g 당 함량 기준으로 표기함") ----------
async function bbq() {
  const cats = { 18: 'set', 19: 'chicken', 20: 'pizza', 21: 'side', 23: 'drink' }
  const seen = new Set()
  for (const [cid, cat] of Object.entries(cats)) {
    const list = JSON.parse(await cached(`bbq_${cid}.json`, `https://bbq.co.kr/api/delivery/menu/${cid}?`))
    for (const x of list) {
      if (seen.has(x.id)) continue
      seen.add(x.id)
      const name = x.menuName.replace(/[®™]/g, '').trim()
      const n = x.nutrient || {}
      const vals = [n.calorie, n.sugars, n.protein, n.saturatedFat, n.natrium]
      if (n.calorie == null || vals.every((v) => !v)) { excluded.push({ brand: 'bbq', name, reason: '값 없음(null·0)' }); continue }
      // 세트는 "100g당" 표시와 달리 세트 전체 값으로 보이는 것이 있어(1,000kcal 넘음) 기준이 불분명 → 넣지 않는다
      if (cat === 'set') { excluded.push({ brand: 'bbq', name, reason: '세트(값 기준 불분명)' }); continue }
      const category = cat === 'pizza' ? (/버거/.test(name) ? 'burger' : 'pizza') : cat
      add({
        id: `bbq-${x.id}`, brand: 'bbq', name, unit: category === 'chicken' ? '마리' : category === 'pizza' ? '판' : category === 'drink' ? '잔' : category === 'set' ? '인분' : '개',
        per100: clean({ kcal: num(n.calorie), protein_g: num(n.protein), sugar_g: num(n.sugars), sodium_mg: num(n.natrium), sat_fat_g: num(n.saturatedFat) }),
        category, sourceUrl: `https://bbq.co.kr/products/${x.id}`,
      })
    }
  }
}

const BRANDS = [
  { id: 'mcdonalds', name: '맥도날드', aliases: ["McDonald's", 'McDonalds', '맥날', '맥도'], maker: '맥도날드' },
  { id: 'burgerking', name: '버거킹', aliases: ['Burger King', 'BURGER KING', '버킹'], maker: '버거킹' },
  { id: 'lotteria', name: '롯데리아', aliases: ['LOTTERIA', 'Lotteria', '롯리'], maker: '롯데리아' },
  { id: 'momstouch', name: '맘스터치', aliases: ["Mom's Touch", 'MOMS TOUCH', '맘터'], maker: '맘스터치' },
  { id: 'kfc', name: 'KFC', aliases: ['케이에프씨', '켄터키'], maker: 'KFC' },
  { id: 'bbq', name: 'BBQ', aliases: ['비비큐', 'bbq'], maker: '비비큐' },
  { id: 'kyochon', name: '교촌치킨', aliases: ['교촌', 'KYOCHON'], maker: '교촌치킨' },
  { id: 'bhc', name: 'bhc', aliases: ['BHC', '비에이치씨'], maker: null },
  { id: 'goobne', name: '굽네치킨', aliases: ['굽네', 'GOOBNE'], maker: '굽네치킨' },
  { id: 'dominos', name: '도미노피자', aliases: ["Domino's", 'Dominos', '도미노'], maker: '도미노피자' },
  { id: 'starbucks', name: '스타벅스', aliases: ['Starbucks', 'STARBUCKS', '스벅'], maker: '스타벅스' },
  { id: 'ediya', name: '이디야커피', aliases: ['이디야', 'EDIYA'], maker: '이디야' },
]

const norm = (s) => s.replace(/^[^_]*_/, '').replace(/[®™*\s·,.\-_'"]/g, '').replace(/[()（）\[\]]/g, '').toLowerCase()
const normLoose = (s) => norm(s).replace(/버거$/, '')

async function main() {
  const steps = { mcdonalds, burgerking, starbucks, ediya, dominos, kyochon, lotteria, bbq }
  const errors = {}
  let domReport
  for (const [k, fn] of Object.entries(steps)) {
    try { const r = await fn(); if (k === 'dominos') domReport = r } catch (e) { errors[k] = e.message; console.error('FAIL', k, e.message) }
  }

  // 식약처 DB: 업체명 칸(원본)으로 브랜드 이름표, 앱 JSON에 있는 코드만
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/data/mfds-foods-20261006.json'), 'utf8')).foods
  const appBy = new Map(app.map((r) => [r.c, r]))
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, '_workspace/00_input/mfds/mfds_food_std_raw.json'), 'utf8')).records
  const makerTo = Object.fromEntries(BRANDS.filter((b) => b.maker).map((b) => [b.maker, b.id]))
  const dbBrand = {}
  for (const r of raw) {
    const b = makerTo[r['업체명']]
    if (b && appBy.has(r['식품코드'])) dbBrand[r['식품코드']] = b
  }

  // 보충표 메뉴 ↔ DB 행: 같은 브랜드 안에서 정리한 이름이 하나만 같을 때만
  const byBrand = {}
  for (const [c, b] of Object.entries(dbBrand)) (byBrand[b] = byBrand[b] || []).push(appBy.get(c))
  for (const m of menus) {
    const rows = byBrand[m.brand] || []
    for (const f of [norm, normLoose]) {
      const hit = rows.filter((r) => f(r.n) === f(m.name))
      if (hit.length === 1) { m.dbCode = hit[0].c; break }
      if (hit.length > 1) break
    }
  }

  // 같은 DB 행에 둘 이상 붙으면(애매) 모두 뗀다
  const cnt = {}
  menus.forEach((m) => m.dbCode && (cnt[m.dbCode] = (cnt[m.dbCode] || 0) + 1))
  menus.forEach((m) => { if (m.dbCode && cnt[m.dbCode] > 1) delete m.dbCode })

  // id 중복 정리, 내부 칸 지우기
  const ids = new Set()
  for (const m of menus) {
    let id = m.id, k = 2
    while (ids.has(id)) id = `${m.id}-${k++}`
    m.id = id; ids.add(id)
    delete m._key; delete m._cat
    for (const k2 of Object.keys(m)) if (m[k2] === undefined) delete m[k2]
  }

  const usedBrands = new Set([...menus.map((m) => m.brand), ...Object.values(dbBrand)])
  const table = {
    version: VERSION,
    brands: BRANDS.filter((b) => usedBrands.has(b.id)).map(({ id, name, aliases }) => ({ id, name, aliases })),
    menus,
    dbBrand,
  }
  fs.writeFileSync(OUT, JSON.stringify(table))

  // 보고용
  const weightDiff = []
  for (const m of menus) {
    if (!m.dbCode || !m.unitWeight_g) continue
    const r = appBy.get(m.dbCode)
    if (!r.w) continue
    const d = (r.w - m.unitWeight_g) / m.unitWeight_g
    if (Math.abs(d) > 0.05) weightDiff.push({ brand: m.brand, name: m.name, dbName: r.n, db: r.w, official: m.unitWeight_g, diffPct: Math.round(d * 1000) / 10 })
  }
  const per = {}
  for (const m of menus) {
    const p = (per[m.brand] = per[m.brand] || { total: 0, cats: {}, carbs: 0, fat: 0, weight: 0, dbCode: 0 })
    p.total++; p.cats[m.category] = (p.cats[m.category] || 0) + 1
    const v = m.perUnit || m.per100 || {}
    if (v.carbs_g !== undefined) p.carbs++
    if (v.fat_g !== undefined) p.fat++
    if (m.unitWeight_g) p.weight++
    if (m.dbCode) p.dbCode++
  }
  const dbBrandCount = {}
  Object.values(dbBrand).forEach((b) => (dbBrandCount[b] = (dbBrandCount[b] || 0) + 1))
  const exclCount = {}
  excluded.forEach((e) => { const k = `${e.brand}: ${e.reason}`; exclCount[k] = (exclCount[k] || 0) + 1 })
  const report = { out: OUT, bytes: fs.statSync(OUT).size, menus: menus.length, per, dbBrandCount, weightDiff, exclCount, errors, domReport }
  fs.writeFileSync(path.join(HERE, 'report.json'), JSON.stringify(report, null, 1))
  console.log(JSON.stringify({ ...report, weightDiff: weightDiff.length }, null, 1))
}

await main()
