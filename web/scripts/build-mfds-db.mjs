// 식약처 전국통합식품영양성분정보(음식)표준데이터 원본 → 앱용 DB JSON (스펙 3.5절, 4.5.2~4.5.5)
// 실행: node web/scripts/build-mfds-db.mjs [원본 JSON 경로]
// 출력: web/public/data/mfds-foods-20261006.json, web/public/data/mfds-detail-20261006.json(D4-a 세부 영양소), web/scripts/build-mfds-db.stats.json
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { detailKey, normalizeFoodName } from '../src/analysis/nutrition/normalize.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const RAW = process.argv[2] ?? path.join(ROOT, '_workspace/00_input/mfds/mfds_food_std_raw.json')
const VERSION = '2026-10-06'
const OUT = path.join(HERE, '../public/data/mfds-foods-20261006.json')
const STATS_OUT = path.join(HERE, 'build-mfds-db.stats.json')
const SRC_LABEL = '식품의약품안전처 전국통합식품영양성분정보(음식)표준데이터(15100070)'
const DETAIL_OUT = path.join(HERE, '../public/data/mfds-detail-20261006.json')

// D4-a 세부 영양소(당류·나트륨·포화지방·식이섬유만, 2026-10-27 사용자 결정): [앱 키, 원본 열, 100g당 상한].
// 값은 원본 기준량(100g·100ml)당 그대로다. 100ml 행은 앱 DB처럼 1ml=1g으로 본다. 범위를 벗어나거나 읽을 수 없으면 빈 값(null).
// 앱 DB 행 선택(pick)에는 쓰지 않는다(앱 DB 파일은 그대로).
const DETAIL_COLS = [
  ['sugar_g', '당류(g)', 100],
  ['sodium_mg', '나트륨(mg)', 40000],
  ['satfat_g', '포화지방산(g)', 100],
  ['fiber_g', '식이섬유(g)', 100],
]
const detailBad = { unparsable: 0, out_of_range: 0 }
function detailNum(v, max) {
  if (v == null) return null
  const s = String(v).trim().replace(/,/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  if (!Number.isFinite(n)) {
    detailBad.unparsable++
    return null
  }
  if (n < 0 || n > max) {
    detailBad.out_of_range++
    return null
  }
  return n
}

// 4.5.3 (a)-2: 100ml 행만 있는 이름은 분류와 상관없이 밀도 1.0g/ml로 환산해 넣는다(ml: 1, 화면 출처 "DB 환산").
// 아래 액체 분류는 통계에서 고형·액체를 나눠 세는 데만 쓴다(원본 식품대분류명 그대로)
const LIQUID_CATEGORIES = new Set(['음료 및 차류', '국 및 탕류', '찌개 및 전골류', '죽 및 스프류'])

let unparsable = 0
function num(v) {
  if (v == null) return null
  const s = String(v).trim().replace(/,/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  if (!Number.isFinite(n)) {
    unparsable++
    return null
  }
  return n
}

function originRank(o = '') {
  if (o.startsWith('가정식')) return 0
  if (o.includes('분석')) return 1
  if (o.includes('재료량')) return 2
  return 3 // 외식 업체 제공
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// 4.5.3 (c): 100g 행 우선 → 탄·지가 모두 있는 행 우선 → kcal 중앙값에 가장 가까운 실제 행
// → 식품기원 → 데이터기준일자 최신 → 식품코드 사전순
function pick(rows) {
  let c = rows
  if (c.some((r) => !r.ml)) c = c.filter((r) => !r.ml)
  if (c.some((r) => r.cb != null && r.f != null)) c = c.filter((r) => r.cb != null && r.f != null)
  const med = median(c.map((r) => r.k))
  return [...c].sort(
    (a, b) =>
      Math.abs(a.k - med) - Math.abs(b.k - med) ||
      a.origin - b.origin ||
      cmpStr(b.date, a.date) ||
      cmpStr(a.c, b.c),
  )[0]
}

function groupBy(xs, keyOf) {
  const m = new Map()
  for (const x of xs) {
    const k = keyOf(x)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x)
  }
  return m
}

const inc = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n)

// 4.5.5 공개 중량: 식품기원이 업체 제공이고 식품중량이 100g·100ml가 아닌 값만 쓴다(100이면 영양값 기준량과 같은 값이라
// 메뉴 크기가 아니다. 예: 닭튀김_허니콤보 치킨 100g). ml은 1ml=1g. 가정식·급식·외식 분석 행의 식품중량은 시료 무게라 쓰지 않는다.
const VENDOR_ORIGIN = '외식(프랜차이즈 등 업체 제공 영양정보)'
function publishedWeight(rec, st) {
  if (String(rec['식품기원명'] ?? '').trim() !== VENDOR_ORIGIN) return undefined
  const m = /^(\d+(?:\.\d+)?)\s*(g|ml)$/i.exec(String(rec['식품중량'] ?? '').trim().replace(/,/g, ''))
  if (!m) {
    st.unparsable++
    return undefined
  }
  const unit = m[2].toLowerCase()
  const v = Number(m[1])
  st[unit].rows++
  if (!(v > 0) || v === 100) return undefined
  st[unit].not_100++
  return v
}

// ── 읽기 ──
const { records } = JSON.parse(fs.readFileSync(RAW, 'utf8'))
const stats = {
  source: path.basename(RAW),
  version: VERSION,
  input_rows: records.length,
  by_basis: {},
  raw_null: { carbs: 0, fat: 0 },
  raw_unique_names: new Set(records.map((r) => r['식품명'])).size,
  dropped: {
    missing_energy_or_protein: 0,
    unknown_basis: 0,
    empty_name: 0,
    out_of_range: 0,
    ml_row_has_g_row: 0,
  },
  ml_only_solid_converted: { names: 0, rows: 0 },
  unparsable_values: 0,
  ml_only_names_by_category: {},
  liquid_categories: [...LIQUID_CATEGORIES],
  serving_size_nonempty: 0,
  published_weight_raw: { g: { rows: 0, not_100: 0 }, ml: { rows: 0, not_100: 0 }, unparsable: 0 },
}

// ── 1~3: 숫자 변환, 기준량, 범위 ──
const rows = []
for (const rec of records) {
  const basis = String(rec['영양성분함량기준량'] ?? '').trim()
  inc(stats.by_basis, basis || '(빈 값)')
  const w = publishedWeight(rec, stats.published_weight_raw)
  const cb = num(rec['탄수화물(g)'])
  const f = num(rec['지방(g)'])
  if (cb == null) stats.raw_null.carbs++
  if (f == null) stats.raw_null.fat++
  const k = num(rec['에너지(kcal)'])
  const p = num(rec['단백질(g)'])
  if (basis !== '100g' && basis !== '100ml') {
    stats.dropped.unknown_basis++
    continue
  }
  if (k == null || p == null) {
    stats.dropped.missing_energy_or_protein++
    continue
  }
  const key = normalizeFoodName(rec['식품명'] ?? '')
  if (!key) {
    stats.dropped.empty_name++
    continue
  }
  const bad =
    k < 0 ||
    k > 900 ||
    [p, cb, f].some((x) => x != null && (x < 0 || x > 100)) ||
    p + (cb ?? 0) + (f ?? 0) > 100
  if (bad) {
    stats.dropped.out_of_range++
    continue
  }
  const servingRaw = String(rec['1인(회)분량 참고량'] ?? '').trim()
  if (servingRaw) stats.serving_size_nonempty++
  const sm = /^(\d+(?:\.\d+)?)\s*g$/i.exec(servingRaw)
  rows.push({
    c: rec['식품코드'],
    n: rec['식품명'],
    r: rec['대표식품명'] ?? '',
    k,
    p,
    cb,
    f,
    ml: basis === '100ml',
    s: sm ? Number(sm[1]) : undefined,
    w,
    cat: rec['식품대분류명'] ?? '',
    origin: originRank(rec['식품기원명']),
    date: rec['데이터기준일자'] ?? '',
    key,
    dt: DETAIL_COLS.map(([, col, max]) => detailNum(rec[col], max)),
  })
}

// ── 4: 정규화 이름당 1행 (100ml 처리 4.5.3 (a) 포함) ──
const byKey = groupBy(rows, (r) => r.key)
const reps = []
let merged = 0
for (const rs of byKey.values()) {
  let kept
  if (rs.some((r) => !r.ml)) {
    kept = rs.filter((r) => !r.ml)
    stats.dropped.ml_row_has_g_row += rs.length - kept.length
  } else {
    kept = rs
    const cs = (stats.ml_only_names_by_category[rs[0].cat] ??= { names: 0, liquid: LIQUID_CATEGORIES.has(rs[0].cat) })
    cs.names++
    if (!cs.liquid) {
      stats.ml_only_solid_converted.names++
      stats.ml_only_solid_converted.rows += rs.length
    }
  }
  merged += kept.length - 1
  reps.push(pick(kept))
}
reps.sort((a, b) => cmpStr(a.c, b.c))
const indexOf = new Map(reps.map((r, i) => [r, i]))

// ── 5: 대표식품명 그룹 ──
const groups = {}
for (const [gk, rs] of groupBy(reps.filter((r) => normalizeFoodName(r.r)), (r) => normalizeFoodName(r.r))) {
  groups[gk] = indexOf.get(pick(rs))
}

// ── 세부명 키(4.5.4): 이름 키와 겹치지 않는 것만 파일에 넣는다 ──
const nameKeys = new Set(reps.map((r) => r.key))
const detailRows = new Map()
for (const r of reps) {
  const dk = detailKey(r.key)
  if (!dk || nameKeys.has(dk)) continue
  if (!detailRows.has(dk)) detailRows.set(dk, [])
  detailRows.get(dk).push(r)
}
const d = {}
for (const [dk, rs] of detailRows) d[dk] = indexOf.get(pick(rs))

// ── 쓰기 ──
const foods = reps.map((r) => {
  const o = { c: r.c, n: r.n, r: r.r, k: r.k, p: r.p, cb: r.cb, f: r.f }
  if (r.ml) o.ml = 1
  if (r.s != null) o.s = r.s
  if (r.w != null) o.w = r.w
  return o
})
const text = JSON.stringify({ v: VERSION, src: SRC_LABEL, foods, groups, d })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, text)

// ── 세부 영양소 파일(D4-a): 앱 DB와 같은 행(reps)의 식품코드마다 [당, 나트륨, 포화, 섬유]. 네 값이 모두 빈 행은 넣지 않는다 ──
const detailFoods = {}
for (const r of reps) if (r.dt.some((x) => x != null)) detailFoods[r.c] = r.dt
const detailText = JSON.stringify({ version: VERSION, source: SRC_LABEL, keys: DETAIL_COLS.map(([k]) => k), foods: detailFoods })
fs.writeFileSync(DETAIL_OUT, detailText)
const detailBuf = Buffer.from(detailText)

const buf = Buffer.from(text)
Object.assign(stats, {
  unparsable_values: unparsable,
  rows_after_filters: rows.length,
  merged_same_name: merged,
  foods: foods.length,
  foods_ml_converted: foods.filter((x) => x.ml).length,
  foods_with_w: foods.filter((x) => x.w != null).length,
  foods_carbs_null: foods.filter((x) => x.cb == null).length,
  foods_fat_null: foods.filter((x) => x.f == null).length,
  foods_carbs_and_fat_null: foods.filter((x) => x.cb == null && x.f == null).length,
  unique_normalized_names: byKey.size,
  groups: Object.keys(groups).length,
  detail_keys: Object.keys(d).length,
  file: path.relative(ROOT, OUT).replaceAll('\\', '/'),
  file_bytes: buf.length,
  gzip_bytes: zlib.gzipSync(buf, { level: 9 }).length,
  brotli_bytes: zlib.brotliCompressSync(buf).length,
  detail: {
    file: path.relative(ROOT, DETAIL_OUT).replaceAll('\\', '/'),
    foods: Object.keys(detailFoods).length,
    with_value: Object.fromEntries(DETAIL_COLS.map(([k], i) => [k, reps.filter((r) => r.dt[i] != null).length])),
    rows_unparsable: detailBad.unparsable,
    rows_out_of_range: detailBad.out_of_range,
    file_bytes: detailBuf.length,
    gzip_bytes: zlib.gzipSync(detailBuf, { level: 9 }).length,
    brotli_bytes: zlib.brotliCompressSync(detailBuf).length,
  },
})
stats.excluded_total = Object.values(stats.dropped).reduce((a, b) => a + b, 0)
fs.writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2) + '\n')
console.log(JSON.stringify(stats, null, 2))
