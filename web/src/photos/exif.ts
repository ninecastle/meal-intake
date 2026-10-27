// 앨범 사진의 찍은 시각(EXIF DateTimeOriginal) 읽기(스펙 4.8절 "HEIC·EXIF").
// 런타임 import가 없는 순수 모듈이다(node가 .ts를 바로 불러 시험: spike/tests/exif_test.mjs).
// 찍은 시각 태그만 읽는다. 위치 등 다른 태그는 읽지 않고, 결과를 어디에도 저장하지 않는다.

const JPEG_SCAN = 1024 * 1024 // JPEG: APP 구간은 파일 앞쪽에 있다(APP 세그먼트는 하나에 64KB 이하)
const MAX_SCAN = 32 * 1024 * 1024 // 그 밖(HEIC 등): 앞 32MB까지 Exif 아이템을 찾는다
const DEFAULT_OFFSET_MIN = 9 * 60 // OffsetTimeOriginal이 없으면 Asia/Seoul(+09:00)
const MAX_IFD_ENTRIES = 1000
const MAX_ASCII = 64

const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_OFFSET_TIME_ORIGINAL = 0x9011
const TYPE_ASCII = 2
const TYPE_UNDEFINED = 7
const TYPE_LONG = 4
const TYPE_IFD = 13

/** bytes[start, end) 가 TIFF 구간(헤더 'II*\0' 또는 'MM\0*'부터) */
type TiffRange = { bytes: Uint8Array; start: number; end: number }

/**
 * 사진 파일의 찍은 시각. JPEG(APP1 Exif)·HEIC(Exif 아이템)를 읽는다.
 * DateTimeOriginal을 OffsetTimeOriginal(없으면 +09:00)로 해석한다.
 * EXIF가 없거나 깨졌거나, 말이 안 되는 날짜(2000년 이전·없는 날짜)거나 `now`보다 미래면 null. 예외를 던지지 않는다.
 */
export async function readTakenAt(file: Blob, now: Date = new Date()): Promise<Date | null> {
  try {
    if (!file || !(file.size > 0)) return null
    const first = await readHead(file, JPEG_SCAN)
    let tiff: TiffRange | null
    if (first.length >= 2 && first[0] === 0xff && first[1] === 0xd8) {
      tiff = findTiffInJpeg(first)
    } else {
      const bytes = file.size > first.length ? await readHead(file, MAX_SCAN) : first
      tiff = findTiffByScan(bytes)
    }
    if (!tiff) return null
    const raw = readDateTags(tiff)
    if (!raw) return null
    const taken = parseExifDate(raw.date, raw.offset)
    if (!taken) return null
    if (!(taken.getTime() <= now.getTime())) return null // 미래 시각(또는 now가 잘못된 값)
    return taken
  } catch {
    return null
  }
}

async function readHead(file: Blob, max: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, Math.min(file.size, max)).arrayBuffer())
}

function isExifHeader(b: Uint8Array, i: number): boolean {
  // "Exif\0\0"
  return (
    i >= 0 &&
    i + 6 <= b.length &&
    b[i] === 0x45 &&
    b[i + 1] === 0x78 &&
    b[i + 2] === 0x69 &&
    b[i + 3] === 0x66 &&
    b[i + 4] === 0 &&
    b[i + 5] === 0
  )
}

function isTiffHeader(b: Uint8Array, i: number): boolean {
  if (i < 0 || i + 8 > b.length) return false
  const ii = b[i] === 0x49 && b[i + 1] === 0x49 && b[i + 2] === 0x2a && b[i + 3] === 0
  const mm = b[i] === 0x4d && b[i + 1] === 0x4d && b[i + 2] === 0 && b[i + 3] === 0x2a
  return ii || mm
}

/** JPEG: 세그먼트를 따라가며 APP1 "Exif\0\0" 바로 뒤 TIFF를 찾는다. 영상 데이터(SOS) 전까지만 본다. */
function findTiffInJpeg(b: Uint8Array): TiffRange | null {
  let p = 2
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null // 세그먼트 경계가 깨짐
    const marker = b[p + 1]
    if (marker === 0xff) {
      p += 1 // 채움 바이트
      continue
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2 // 길이가 없는 표시
      continue
    }
    if (marker === 0xda || marker === 0xd9) return null // 영상 데이터 시작·파일 끝: APP 구간이 끝났다
    const len = (b[p + 2] << 8) | b[p + 3]
    if (len < 2) return null
    const segStart = p + 4
    const segEnd = p + 2 + len
    if (segEnd > b.length) return null // 길이가 파일(또는 읽은 범위)을 넘는다
    if (marker === 0xe1 && isExifHeader(b, segStart) && isTiffHeader(b, segStart + 6) && segStart + 6 + 8 <= segEnd) {
      return { bytes: b, start: segStart + 6, end: segEnd }
    }
    p = segEnd
  }
  return null
}

/** HEIC 등: "Exif\0\0" 바로 뒤에 TIFF 헤더가 오는 곳을 찾는다(앞 32MB 안). */
function findTiffByScan(b: Uint8Array): TiffRange | null {
  let i = 0
  while (i < b.length) {
    i = b.indexOf(0x45, i)
    if (i < 0 || i + 14 > b.length) return null
    if (isExifHeader(b, i) && isTiffHeader(b, i + 6)) return { bytes: b, start: i + 6, end: b.length }
    i += 1
  }
  return null
}

/** IFD0 → ExifIFD(0x8769) → DateTimeOriginal(0x9003)·OffsetTimeOriginal(0x9011). 모든 읽기에 범위 검사. */
function readDateTags(r: TiffRange): { date: string; offset: string | null } | null {
  const { bytes: b, start, end } = r
  const size = end - start
  const le = b[start] === 0x49

  // off는 TIFF 시작 기준. 범위를 벗어나면 null
  const u16 = (off: number): number | null => {
    if (!Number.isInteger(off) || off < 0 || off + 2 > size) return null
    const p = start + off
    return le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]
  }
  const u32 = (off: number): number | null => {
    if (!Number.isInteger(off) || off < 0 || off + 4 > size) return null
    const p = start + off
    const v = le
      ? b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)
      : (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]
    return v >>> 0
  }

  /** IFD에서 tag 항목의 위치(TIFF 기준). 없거나 깨졌으면 null */
  const findEntry = (ifd: number, tag: number): number | null => {
    const count = u16(ifd)
    if (count === null || count === 0 || count > MAX_IFD_ENTRIES) return null
    if (ifd + 2 + count * 12 > size) return null
    for (let k = 0; k < count; k++) {
      const e = ifd + 2 + k * 12
      if (u16(e) === tag) return e
    }
    return null
  }

  const readAscii = (e: number | null): string | null => {
    if (e === null) return null
    const type = u16(e + 2)
    const count = u32(e + 4)
    if (type !== TYPE_ASCII && type !== TYPE_UNDEFINED) return null
    if (count === null || count === 0 || count > MAX_ASCII) return null
    const at = count <= 4 ? e + 8 : u32(e + 8)
    if (at === null || at < 0 || at + count > size) return null
    let s = ''
    for (let k = 0; k < count; k++) {
      const c = b[start + at + k]
      if (c === 0) break
      if (c < 0x20 || c > 0x7e) return null // 글자가 아닌 바이트: 깨진 값
      s += String.fromCharCode(c)
    }
    return s
  }

  const ifd0 = u32(4)
  if (ifd0 === null) return null
  const ptr = findEntry(ifd0, TAG_EXIF_IFD)
  if (ptr === null) return null
  const ptrType = u16(ptr + 2)
  if (ptrType !== TYPE_LONG && ptrType !== TYPE_IFD) return null
  const exifIfd = u32(ptr + 8)
  if (exifIfd === null) return null

  const date = readAscii(findEntry(exifIfd, TAG_DATETIME_ORIGINAL))
  if (!date) return null
  return { date, offset: readAscii(findEntry(exifIfd, TAG_OFFSET_TIME_ORIGINAL)) }
}

/** "YYYY:MM:DD HH:MM:SS" + 오프셋("+09:00", 없거나 이상하면 +09:00) → Date. 말이 안 되면 null */
function parseExifDate(date: string, offset: string | null): Date | null {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(date.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const utc = Date.UTC(y, mo - 1, d, h, mi, s)
  const check = new Date(utc)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null // 2월 30일 등
  const offMin = parseOffset(offset) ?? DEFAULT_OFFSET_MIN
  return new Date(utc - offMin * 60_000)
}

function parseOffset(offset: string | null): number | null {
  if (!offset) return null
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim())
  if (!m) return null
  const hh = Number(m[2])
  const mm = Number(m[3])
  if (hh > 14 || mm > 59) return null
  return (m[1] === '-' ? -1 : 1) * (hh * 60 + mm)
}
