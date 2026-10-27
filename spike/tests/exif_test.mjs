// 앨범 사진 찍은 시각 readTakenAt 시험(스펙 4.8절 "HEIC·EXIF"). 바이트로 직접 만든 JPEG·HEIC 흉내로 확인한다.
// 실행: node spike/tests/exif_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href)
const { readTakenAt } = await load('web/src/photos/exif.ts')
const { guessMealType, toDateKey } = await load('web/src/lib/time.ts')

const NOW = new Date('2026-10-27T12:00:00+09:00')
const ascii = (s) => [...s].map((c) => c.charCodeAt(0))
const cat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]))

/** TIFF: IFD0(Model 인라인, DateTime 0x0132 = 다른 값, ExifIFD 포인터) → ExifIFD(0x9003, 있으면 0x9011) */
function makeTiff({ le = true, date = '2026:10:25 12:30:00', offset = null } = {}) {
  const exifEntries = offset ? 2 : 1
  const ifd0 = 8
  const ifd0Size = 2 + 3 * 12 + 4
  const exifIfd = ifd0 + ifd0Size
  const exifSize = 2 + exifEntries * 12 + 4
  const data = exifIfd + exifSize
  const dt0 = data // IFD0 DateTime(읽으면 안 되는 값)
  const dto = dt0 + 20
  const oto = dto + 20
  const size = oto + (offset ? 8 : 0)
  const buf = new Uint8Array(size)
  const v = new DataView(buf.buffer)
  const w16 = (o, x) => v.setUint16(o, x, le)
  const w32 = (o, x) => v.setUint32(o, x, le)
  const str = (o, s, n) => ascii(s).slice(0, n - 1).forEach((c, i) => (buf[o + i] = c))
  buf.set(le ? [0x49, 0x49, 0x2a, 0] : [0x4d, 0x4d, 0, 0x2a], 0)
  w32(4, ifd0)
  w16(ifd0, 3)
  const entry = (at, tag, type, count, value) => (w16(at, tag), w16(at + 2, type), w32(at + 4, count), w32(at + 8, value))
  entry(ifd0 + 2, 0x0110, 2, 4, 0) // Model "abc" 인라인
  str(ifd0 + 2 + 8, 'abc', 4)
  entry(ifd0 + 14, 0x0132, 2, 20, dt0)
  entry(ifd0 + 26, 0x8769, 4, 1, exifIfd)
  w32(ifd0 + 38, 0)
  w16(exifIfd, exifEntries)
  entry(exifIfd + 2, 0x9003, 2, 20, dto)
  if (offset) entry(exifIfd + 14, 0x9011, 2, 7, oto)
  str(dt0, '2020:01:01 00:00:00', 20)
  str(dto, date, 20)
  if (offset) str(oto, offset, 7)
  return buf
}

function makeJpeg(tiff, { app1Len } = {}) {
  const app0 = cat([0xff, 0xe0, 0, 16], ascii('JFIF\0'), [1, 1, 0, 0, 1, 0, 1, 0, 0])
  const xmp = cat([0xff, 0xe1, 0, 2 + 10], ascii('http://ns.')) // Exif가 아닌 APP1은 건너뛴다
  const body = tiff ? cat(ascii('Exif\0\0'), tiff) : new Uint8Array()
  const len = app1Len ?? 2 + body.length
  const app1 = tiff ? cat([0xff, 0xe1, (len >> 8) & 0xff, len & 0xff], body) : new Uint8Array()
  const rest = cat([0xff, 0xdb, 0, 4, 1, 2], [0xff, 0xda, 0, 2], [9, 9, 9], [0xff, 0xd9])
  return cat([0xff, 0xd8], app0, xmp, app1, rest)
}

function makeHeic(tiff) {
  const ftyp = cat([0, 0, 0, 24], ascii('ftypheic'), [0, 0, 0, 0], ascii('mif1heic'))
  const junk = Uint8Array.from({ length: 5000 }, (_, i) => (i * 37 + 11) & 0xff)
  const fake = cat(ascii('Exif\0\0'), [1, 2, 3, 4]) // iinf의 item_type 같은 가짜 "Exif": TIFF가 아니면 계속 찾는다
  return cat(ftyp, junk, fake, junk, [0, 0, 0, 6], ascii('Exif\0\0'), tiff, junk)
}

const blob = (bytes, type = '') => new Blob([bytes], { type })
const read = (bytes, now = NOW) => readTakenAt(blob(bytes), now)
const iso = (d) => (d ? d.toISOString() : null)

let n = 0
const eq = async (bytes, want, label, now) => {
  assert.equal(iso(await read(bytes, now)), want, label)
  n++
}

// JPEG(APP1): little·big endian, 오프셋 있음·없음
await eq(makeJpeg(makeTiff({ le: true })), '2026-10-25T03:30:00.000Z', 'JPEG LE 오프셋 없음 → +09:00')
await eq(makeJpeg(makeTiff({ le: false })), '2026-10-25T03:30:00.000Z', 'JPEG BE 오프셋 없음 → +09:00')
await eq(makeJpeg(makeTiff({ le: true, date: '2026:10:20 08:15:30', offset: '+02:00' })), '2026-10-20T06:15:30.000Z', 'JPEG LE +02:00')
await eq(makeJpeg(makeTiff({ le: false, date: '2026:10:20 08:15:30', offset: '-05:30' })), '2026-10-20T13:45:30.000Z', 'JPEG BE -05:30')
await eq(makeJpeg(makeTiff({ offset: '  :  ' })), '2026-10-25T03:30:00.000Z', '오프셋 값이 비어 있으면 +09:00')

// HEIC 흉내: ftyp + 임의 바이트(가짜 Exif 포함) + Exif\0\0 + TIFF
await eq(makeHeic(makeTiff({ le: false })), '2026-10-25T03:30:00.000Z', 'HEIC BE 오프셋 없음')
await eq(makeHeic(makeTiff({ le: true, date: '2026:10:26 19:05:00', offset: '+09:00' })), '2026-10-26T10:05:00.000Z', 'HEIC LE +09:00')

// EXIF 없음
await eq(makeJpeg(null), null, 'JPEG EXIF 없음')
await eq(makeHeic(new Uint8Array(0)).slice(0, 10000), null, 'HEIC EXIF 없음')
await eq(new Uint8Array(0), null, '빈 파일')
await eq(Uint8Array.from(ascii('hello, not an image')), null, '이미지가 아님')

// 길이가 깨진 파일
await eq(makeJpeg(makeTiff(), { app1Len: 60000 }), null, 'APP1 길이가 파일보다 김')
await eq(makeJpeg(makeTiff(), { app1Len: 1 }), null, 'APP1 길이 1')
{
  const t = makeTiff()
  new DataView(t.buffer).setUint32(4, 0xfffffff0, true) // IFD0 위치가 범위 밖
  await eq(makeJpeg(t), null, 'IFD0 위치 범위 밖')
  const t2 = makeTiff()
  new DataView(t2.buffer).setUint16(8, 0xffff, true) // IFD0 항목 수가 터무니없음
  await eq(makeJpeg(t2), null, 'IFD0 항목 수 깨짐')
  const t3 = makeTiff()
  new DataView(t3.buffer).setUint32(8 + 2 + 24 + 8, 0x7fffffff, true) // ExifIFD 위치 범위 밖
  await eq(makeHeic(t3), null, 'ExifIFD 위치 범위 밖')
}
// 모든 길이로 잘라도, 바이트를 바꿔도 예외 없이 null 또는 날짜
{
  const files = [makeJpeg(makeTiff({ offset: '+02:00' })), makeHeic(makeTiff({ le: false })).slice(0, 5200 + 5000 + 200)]
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  for (const f of files) {
    for (let len = 0; len <= f.length; len += f.length > 1000 ? 13 : 1) {
      const d = await read(f.slice(0, len))
      assert.ok(d === null || d instanceof Date, `잘림 ${len}`)
    }
    for (let k = 0; k < 300; k++) {
      const g = f.slice()
      for (let j = 0; j < 4; j++) g[Math.floor(rnd() * g.length)] = Math.floor(rnd() * 256)
      const d = await read(g)
      assert.ok(d === null || (d instanceof Date && !Number.isNaN(d.getTime())), `바이트 변경 ${k}`)
    }
  }
  n++
}

// 말이 안 되는 날짜·미래 시각
for (const bad of ['0000:00:00 00:00:00', '1999:12:31 23:59:59', '2026:02:30 12:00:00', '2026:13:01 00:00:00', '2026:10:25 24:00:00', '    :  :     :  :  ']) {
  await eq(makeJpeg(makeTiff({ date: bad })), null, `이상한 날짜 ${bad}`)
}
await eq(makeJpeg(makeTiff({ date: '2026:10:28 10:00:00' })), null, '미래 시각')
await eq(makeJpeg(makeTiff({ date: '2026:10:27 12:00:01' })), null, 'now보다 1초 뒤')
await eq(makeJpeg(makeTiff({ date: '2026:10:27 12:00:00' })), '2026-10-27T03:00:00.000Z', 'now와 같은 시각은 허용')
await eq(makeJpeg(makeTiff({ date: '2026:10:28 10:00:00' })), '2026-10-28T01:00:00.000Z', 'now를 넘기면 그날도 허용', new Date('2026-10-29T00:00:00Z'))

// guessMealType·toDateKey와 엮기: "2026:10:25 12:30:00"(오프셋 없음) → 2026-10-25, 점심
{
  const d = await read(makeJpeg(makeTiff({ date: '2026:10:25 12:30:00' })))
  assert.equal(toDateKey(d), '2026-10-25')
  assert.equal(guessMealType(d), 'lunch')
  const late = await read(makeHeic(makeTiff({ date: '2026:10:25 23:40:00' })))
  assert.equal(toDateKey(late), '2026-10-25', '밤 11시 40분은 그날')
  assert.equal(guessMealType(late), 'snack')
  const abroad = await read(makeJpeg(makeTiff({ date: '2026:10:25 18:30:00', offset: '-07:00' }))) // 한국 시각 10/26 10:30
  assert.equal(toDateKey(abroad), '2026-10-26')
  assert.equal(guessMealType(abroad), 'lunch')
  n++
}

console.log(`모두 통과 (${n}개)`)
