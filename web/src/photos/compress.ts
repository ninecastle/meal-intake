import { AnalysisError } from '../analysis/errors'

// 분석 호출 전 사진 압축: 긴 변 1024px(2026-10-29 속도 결정으로 1280에서 줄임), JPEG 0.8, EXIF 회전 반영 (스펙 4.2·4.3절, meal-log-frontend 구현 규칙)
const MAX_SIDE = 1024
const JPEG_QUALITY = 0.8

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void }

// ── 처음부터 작게 디코드(2026-10-29 속도, 사용자 결정) ──
// 휴대폰 사진(예: 4000×3000)을 원래 크기로 디코드하면 갤럭시에서 사진 준비만 약 2초 걸렸다. JPEG는 헤더(SOF)에서 저장된 가로·세로를
// 디코드 없이 읽고, 줄일 사진이면 createImageBitmap에 resizeWidth를 줘 디코드 단계에서 바로 줄인다(Chrome은 JPEG를 축소 디코드).
// 회전 전·후 어느 쪽 가로인지 몰라도 되게 resizeWidth만 준다(비율 유지): 가로가 긴 변이면 바로 1024, 짧은 변이면 긴 변이 1024보다
// 조금 커지고 아래 canvas 단계가 지금처럼 긴 변 1024로 한 번 더 줄인다. 짧은 변이 1024 이상일 때만 써서 확대는 생기지 않는다.
// 옵션을 모르는 브라우저(구형 Safari 등)는 옵션을 무시하거나(원래 크기 → canvas가 줄임) 오류를 내므로(→ 지금 방식) 결과는 같다.
const HEAD_BYTES = 256 * 1024 // EXIF(최대 64KB)·썸네일 뒤에 SOF가 오므로 넉넉히

/** JPEG 헤더(SOF)의 저장된 가로·세로(EXIF 회전 전). JPEG가 아니거나 앞부분에서 못 찾으면 null. 순수 함수(단위 시험) */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    if (m === 0xff) { i++; continue } // 채움 바이트
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue } // 길이 없는 표지
    if (m === 0xd9 || m === 0xda) return null // 이미지 끝·스캔 시작 전까지 SOF가 없었음
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2) return null
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const height = (b[i + 5] << 8) | b[i + 6]
      const width = (b[i + 7] << 8) | b[i + 8]
      return width > 0 && height > 0 ? { width, height } : null
    }
    i += 2 + len
  }
  return null
}

/** 처음부터 줄여 디코드할 resizeWidth. 짧은 변이 maxSide보다 작으면(확대가 생길 수 있음)·크기를 모르면 null(지금 방식). 순수 함수(단위 시험) */
export function fastDecodeWidth(size: { width: number; height: number } | null, maxSide: number = MAX_SIDE): number | null {
  if (!size) return null
  return Math.min(size.width, size.height) >= maxSide ? maxSide : null
}

async function readResizeWidth(file: Blob): Promise<number | null> {
  try {
    return fastDecodeWidth(jpegSize(new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())))
  } catch {
    return null
  }
}

// 1순위: createImageBitmap + imageOrientation 'from-image' (EXIF 회전을 디코드 단계에서 반영). resizeWidth가 있으면 처음부터 작게.
async function decodeWithBitmap(file: Blob, resizeWidth: number | null = null): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null
  if (resizeWidth) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth, resizeQuality: 'high' })
      return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
    } catch {
      // resize 옵션 미지원 → 아래 지금 방식
    }
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
  } catch {
    return null // 옵션 미지원·디코드 실패 → <img> 경로로 한 번 더 시도
  }
}

// 2순위: <img> 디코드. 최신 브라우저는 <img>와 drawImage에 EXIF 회전을 기본 적용한다.
function decodeWithImg(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () =>
      resolve({
        image: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

/** 브라우저 디코드: createImageBitmap → <img>. 둘 다 실패하면 null */
async function decodeNative(file: Blob, resizeWidth: number | null = null): Promise<Decoded | null> {
  const bmp = await decodeWithBitmap(file, resizeWidth)
  if (bmp) return bmp
  try {
    return await decodeWithImg(file)
  } catch {
    return null
  }
}

// HEIC/HEIF 판별(스펙 4.8절): MIME, 또는 바이트 4~8이 'ftyp'이고 주 브랜드(8~12)가 아래 중 하나
const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

async function isHeicFile(file: Blob): Promise<boolean> {
  if (HEIC_MIME.has((file.type || '').toLowerCase())) return true
  try {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (b.length < 12) return false
    const four = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])
    return four(4) === 'ftyp' && HEIC_BRANDS.has(four(8))
  } catch {
    return false
  }
}

// 3순위(HEIC/HEIF만): 브라우저 디코드가 모두 실패했을 때만 변환 라이브러리를 그때 불러와 JPEG로 바꾸고 다시 디코드한다.
// heic-to는 LGPL-3.0이라 정적 import 없이 동적 import로만 쓴다(별도 청크, 첫 화면 번들에 넣지 않음).
async function decodeHeic(file: Blob): Promise<Decoded | null> {
  const { heicTo } = await import('heic-to')
  const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
  return decodeNative(jpeg)
}

function invalid(detail: string): AnalysisError {
  return new AnalysisError('PHOTO_INVALID', `사진을 읽을 수 없어요 (${detail})`)
}

function unsupported(cause?: unknown): AnalysisError {
  return new AnalysisError('PHOTO_INVALID', '이 사진 형식을 열지 못했어요 (HEIC 변환 실패)', {
    reason: 'unsupported_format',
    cause,
  })
}

/** 긴 변 1024px, JPEG 품질 0.8, EXIF 회전 반영. 큰 JPEG는 처음부터 작게 디코드(fastDecodeWidth). HEIC/HEIF는 브라우저가 못 열 때만 변환. 오류: AnalysisError(PHOTO_INVALID, HEIC 변환 실패는 reason 'unsupported_format') */
export async function compressPhoto(file: Blob): Promise<Blob> {
  if (!file || file.size === 0) throw invalid('빈 파일')

  let decoded = await decodeNative(file, await readResizeWidth(file))
  if (!decoded) {
    if (!(await isHeicFile(file))) throw invalid('디코드 실패') // HEIC가 아닌 파일은 지금 문구 그대로
    try {
      decoded = await decodeHeic(file)
    } catch (e) {
      throw unsupported(e)
    }
    if (!decoded) throw unsupported()
  }

  try {
    const { width, height } = decoded
    if (!width || !height) throw invalid('크기 0')

    const scale = Math.min(1, MAX_SIDE / Math.max(width, height)) // 확대는 하지 않는다
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw invalid('canvas 사용 불가')
    ctx.fillStyle = '#fff' // 투명 PNG가 JPEG에서 검게 나오지 않도록
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(decoded.image, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    canvas.width = 0 // 큰 canvas 메모리를 바로 돌려준다(iOS Safari)
    canvas.height = 0
    if (!blob || blob.size === 0) throw invalid('JPEG 변환 실패')
    return blob
  } finally {
    decoded.release()
  }
}
