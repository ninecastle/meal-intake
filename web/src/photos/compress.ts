import { AnalysisError } from '../analysis/errors'

// 분석 호출 전 사진 압축: 긴 변 1280px, JPEG 0.8, EXIF 회전 반영 (스펙 4.2·4.3절, meal-log-frontend 구현 규칙)
const MAX_SIDE = 1280
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

function invalid(detail: string): AnalysisError {
  return new AnalysisError('PHOTO_INVALID', `사진을 읽을 수 없어요 (${detail})`)
}

/** 긴 변 1280px, JPEG 품질 0.8, EXIF 회전 반영. 오류: AnalysisError(PHOTO_INVALID) */
export async function compressPhoto(file: Blob): Promise<Blob> {
  if (!file || file.size === 0) throw invalid('빈 파일')

  let decoded = await decodeWithBitmap(file)
  if (!decoded) {
    try {
      decoded = await decodeWithImg(file)
    } catch {
      throw invalid('디코드 실패')
    }
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
