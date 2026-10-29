// 사진 준비 속도(2026-10-29 사용자 결정): 처음부터 작게 디코드할지 정하는 순수 함수 시험. 브라우저·AI 호출 없음: jpegSize·fastDecodeWidth만.
// 실제 브라우저 시간 비교는 _workspace/03_vision_eval.md "사진 준비 시간"(헤드리스 크롬).
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
// compress.ts의 확장자 없는 import('../analysis/errors')를 Node에서 풀기 위해 .ts를 붙인다
registerHooks({ resolve: (spec, ctx, next) => { try { return next(spec, ctx) } catch (e) { if (spec.startsWith('.') && !spec.endsWith('.ts')) return next(spec + '.ts', ctx); throw e } } })
const W = 'C:/Users/kkama/dev/hackathon/'
const { jpegSize, fastDecodeWidth } = await import(pathToFileURL(W + 'web/src/photos/compress.ts').href)
let fail = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
// 실제 JPEG 파일 헤더
eq('bibimbap_1024.jpg', jpegSize(readFileSync(W + 'spike/live/bibimbap_1024.jpg')), { width: 1024, height: 683 })
eq('bibimbap_1280.jpg', jpegSize(readFileSync(W + 'spike/live/bibimbap_1280.jpg')), { width: 1280, height: 854 })
// 손으로 만든 JPEG 머리: SOI, APP1(길이 8), 채움 바이트, SOF2(프로그레시브) 3024×4032
const sof = (m, w, h) => [0xff, m, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
const head = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0, 0xff, ...sof(0xc2, 3024, 4032), 0, 0, 0])
eq('APP1 뒤 SOF2', jpegSize(head), { width: 3024, height: 4032 })
// DHT(C4)는 SOF가 아니다
const dht = Uint8Array.from([0xff, 0xd8, 0xff, 0xc4, 0, 4, 0, 0, ...sof(0xc0, 4000, 3000), 0, 0])
eq('DHT 건너뛰고 SOF0', jpegSize(dht), { width: 4000, height: 3000 })
eq('JPEG 아님(PNG)', jpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), null)
eq('SOF 전에 잘림', jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00, 1, 2, 3, 4, 5, 6])), null)
eq('SOS 먼저(SOF 없음)', jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0])), null)
eq('빈 배열', jpegSize(new Uint8Array(0)), null)
// resizeWidth 정하기: 짧은 변이 1024 이상일 때만 1024, 아니면 null(지금 방식, 확대 없음)
eq('4000×3000 → 1024', fastDecodeWidth({ width: 4000, height: 3000 }), 1024)
eq('3024×4032(세로) → 1024', fastDecodeWidth({ width: 3024, height: 4032 }), 1024)
eq('1024×1024 → 1024', fastDecodeWidth({ width: 1024, height: 1024 }), 1024)
eq('1280×854(짧은 변 작음) → null', fastDecodeWidth({ width: 1280, height: 854 }), null)
eq('800×600 → null', fastDecodeWidth({ width: 800, height: 600 }), null)
eq('크기 모름 → null', fastDecodeWidth(null), null)
eq('maxSide 지정', fastDecodeWidth({ width: 2000, height: 1500 }, 1280), 1280)
console.log(fail ? `FAIL ${fail}` : 'ALL OK')
process.exit(fail ? 1 : 0)
