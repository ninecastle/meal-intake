// 식사 사진 보관 썸네일(디자인 조각 D9, 스펙 4.12, 2026-10-28 사용자 확인 _workspace/design/mock/d9_*). AI 호출 없음.
// 분석에 쓴 압축본(compressPhoto, 긴 변 1280px·회전 반영)을 받아 가운데를 5:4 가로(시안 .shot 200×160과 같은 비율)로 자르고
// 긴 변 360px로 줄여 캔버스에 다시 그린 JPEG를 만든다. 캔버스로 다시 그리므로 EXIF(위치 등)는 남지 않는다.
// 목표 20~40KB, 규칙 v8 상한 100KB를 넘으면 품질을 낮춰 다시 만들고, 그래도 넘으면 실패(저장하지 않음).
import type { Thumb } from '../data/mealPhotos'

/** 가로:세로 = 5:4 */
const RATIO = 5 / 4
const LONG_SIDE = 360
const MAX_BYTES = 100_000
const QUALITIES = [0.7, 0.6, 0.5, 0.4]

export type Rect = { x: number; y: number; w: number; h: number }

/** 원본 w×h에서 가운데 5:4 영역(정수 픽셀). 순수 함수(시험용으로 내보낸다) */
export function cropRect(w: number, h: number): Rect {
  if (w / h > RATIO) {
    const cw = Math.min(w, Math.round(h * RATIO))
    return { x: Math.floor((w - cw) / 2), y: 0, w: cw, h }
  }
  const ch = Math.min(h, Math.round(w / RATIO))
  return { x: 0, y: Math.floor((h - ch) / 2), w, h: ch }
}

/** 자른 영역을 줄일 크기: 긴 변(가로) 360px, 원본이 더 작으면 키우지 않는다 */
export function thumbSize(crop: Rect): { w: number; h: number } {
  const w = Math.min(LONG_SIDE, crop.w)
  return { w, h: Math.max(1, Math.round(w / RATIO)) }
}

async function decode(src: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(src)
      return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
    } catch {
      // <img>로 한 번 더
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src)
    const img = new Image()
    img.onload = () =>
      resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('thumbnail: 사진을 읽지 못했어요'))
    }
    img.src = url
  })
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumbnail: JPEG 만들기 실패'))), 'image/jpeg', quality),
  )
}

/** 분석용 압축본 → 보관용 썸네일(5:4, 긴 변 360px, JPEG, 100KB 이하) */
export async function makeThumbnail(src: Blob): Promise<Thumb> {
  const d = await decode(src)
  try {
    if (!d.width || !d.height) throw new Error('thumbnail: 크기가 0인 사진')
    const crop = cropRect(d.width, d.height)
    const size = thumbSize(crop)
    const canvas = document.createElement('canvas')
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('thumbnail: 캔버스를 쓸 수 없어요')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(d.image, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h)
    for (const q of QUALITIES) {
      const blob = await toJpeg(canvas, q)
      if (blob.size <= MAX_BYTES) return { bytes: new Uint8Array(await blob.arrayBuffer()), w: size.w, h: size.h }
    }
    throw new Error('thumbnail: 100KB 아래로 줄이지 못했어요')
  } finally {
    d.release()
  }
}
