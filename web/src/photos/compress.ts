import { AnalysisError } from '../analysis/errors'

// 분석 호출 전 사진 압축: 긴 변 1024px(2026-10-29 속도 결정으로 1280에서 줄임), JPEG 0.8, EXIF 회전 반영 (스펙 4.2·4.3절, meal-log-frontend 구현 규칙)
const MAX_SIDE = 1024
const JPEG_QUALITY = 0.8

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void }

// 1순위: createImageBitmap + imageOrientation 'from-image' (EXIF 회전을 디코드 단계에서 반영)
async function decodeWithBitmap(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== 'function') return null
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
async function decodeNative(file: Blob): Promise<Decoded | null> {
  const bmp = await decodeWithBitmap(file)
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

/** 긴 변 1024px, JPEG 품질 0.8, EXIF 회전 반영. HEIC/HEIF는 브라우저가 못 열 때만 변환. 오류: AnalysisError(PHOTO_INVALID, HEIC 변환 실패는 reason 'unsupported_format') */
export async function compressPhoto(file: Blob): Promise<Blob> {
  if (!file || file.size === 0) throw invalid('빈 파일')

  let decoded = await decodeNative(file)
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
