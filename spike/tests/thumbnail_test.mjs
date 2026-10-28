// 식사 사진 보관 썸네일 자르기 계산 시험(D9, 스펙 4.12). 브라우저·AI 호출 없음: cropRect·thumbSize만.
import { pathToFileURL } from 'node:url'
const W = 'C:/Users/kkama/dev/hackathon/web/'
const { cropRect, thumbSize } = await import(pathToFileURL(W + 'src/photos/thumbnail.ts').href)
let fail = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
// 4:3 가로(1280×960) → 가운데 1200×960
eq('4:3 가로', cropRect(1280, 960), { x: 40, y: 0, w: 1200, h: 960 })
// 3:4 세로(960×1280) → 가운데 960×768
eq('3:4 세로', cropRect(960, 1280), { x: 0, y: 256, w: 960, h: 768 })
// 16:9 가로(1280×720) → 900×720
eq('16:9 가로', cropRect(1280, 720), { x: 190, y: 0, w: 900, h: 720 })
// 이미 5:4
eq('5:4 그대로', cropRect(1000, 800), { x: 0, y: 0, w: 1000, h: 800 })
// 정사각
eq('정사각', cropRect(1000, 1000), { x: 0, y: 100, w: 1000, h: 800 })
// 줄인 크기: 긴 변 360, 5:4
eq('크기 360×288', thumbSize(cropRect(1280, 960)), { w: 360, h: 288 })
// 작은 원본은 키우지 않는다
eq('작은 원본', thumbSize(cropRect(200, 160)), { w: 200, h: 160 })
// 비율 검사(여러 크기)
for (const [w, h] of [[1280, 853], [853, 1280], [1279, 1, ], [1, 1279], [37, 1000]]) {
  const r = cropRect(w, h)
  const inside = r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h && r.w >= 1 && r.h >= 1
  if (!inside) fail++
  console.log(`${inside ? 'OK ' : 'FAIL'} 안쪽 ${w}×${h}: ${JSON.stringify(r)}`)
}
console.log(fail ? `실패 ${fail}` : '모두 통과')
process.exit(fail ? 1 : 0)
