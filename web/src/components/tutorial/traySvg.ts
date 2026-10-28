// 튜토리얼(D11)용 가상 음식 사진 SVG 문자열(위에서 내려다본 한식 쟁반: 밥·된장국·제육볶음·김치·시금치나물). after=true면 먹은 후(남긴 양).
// 사용자 확인 모양(_workspace/design/mock/tut_3_photo.png)을 그린 스크립트 tray_svg.mjs를 그대로 옮겼다. 시안 사진 비율 5:4(400×320).
// id는 그라데이션·필터 이름 앞에 붙는다(한 화면에 여러 장일 때 겹치지 않게). 고정 값만 넣으므로 innerHTML로 넣어도 안전하다.
export function traySvg(after = false, id = 't'): string {
  const R = (seed: number) => { let x = seed; return () => (x = (x * 9301 + 49297) % 233280) / 233280 }
  const rnd = R(after ? 7 : 3)
  const grains = (cx: number, cy: number, r: number, n: number, color: string, w = 3.2, h = 1.6) =>
    Array.from({ length: n }, () => {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r
      return `<ellipse cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" rx="${w}" ry="${h}" transform="rotate(${Math.round(rnd() * 180)} ${(cx + Math.cos(a) * d).toFixed(1)} ${(cy + Math.sin(a) * d).toFixed(1)})" fill="${color}"/>`
    }).join('')
  const bowl = (cx: number, cy: number, r: number, inner: string) => `
    <circle cx="${cx + 4}" cy="${cy + 6}" r="${r + 2}" fill="rgba(60,40,20,.28)" filter="url(#${id}b)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}bowl)"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 7}" fill="url(#${id}in)"/>${inner}`
  const plate = (cx: number, cy: number, rx: number, ry: number, inner: string) => `
    <ellipse cx="${cx + 4}" cy="${cy + 6}" rx="${rx + 2}" ry="${ry + 2}" fill="rgba(60,40,20,.25)" filter="url(#${id}b)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}bowl)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx - 8}" ry="${ry - 8}" fill="#F4F1EA"/>${inner}`
  // 밥(먹은 후 1/4 남음)
  const rice = after
    ? `<path d="M88 104 a30 30 0 0 1 22 -18 l6 26 z" fill="#FBFAF6"/>${grains(104, 98, 12, 40, '#EDE9DF', 3, 1.4)}`
    : `<circle cx="96" cy="112" r="40" fill="#FBFAF6"/>${grains(96, 112, 38, 260, '#ECE7DB', 3, 1.4)}<circle cx="86" cy="100" r="14" fill="rgba(255,255,255,.6)"/>`
  // 된장국(먹은 후 바닥에 조금)
  const soup = after
    ? `<circle cx="304" cy="112" r="20" fill="url(#${id}soup)" opacity=".85"/>`
    : `<circle cx="304" cy="112" r="40" fill="url(#${id}soup)"/>${grains(304, 112, 30, 16, '#F2E7C9', 5, 4)}${grains(304, 112, 30, 10, '#5E8C3A', 4, 2.4)}<rect x="312" y="96" width="14" height="10" rx="2" fill="#EFE6D2" transform="rotate(18 319 101)"/><rect x="286" y="118" width="12" height="9" rx="2" fill="#EFE6D2" transform="rotate(-12 292 122)"/>`
  // 제육볶음(먹은 후 반)
  const pork = Array.from({ length: after ? 6 : 14 }, (_, i) => {
    const x = 160 + (i % 5) * 18 + rnd() * 8, y = 214 + Math.floor(i / 5) * 16 + rnd() * 6
    return `<path d="M${x} ${y} q8 -7 18 -2 q4 7 -5 11 q-10 3 -13 -9z" fill="url(#${id}pork)"/>`
  }).join('') + grains(200, 228, after ? 18 : 34, after ? 6 : 16, '#F3EEDD', 5, 1.8) + grains(200, 228, after ? 16 : 30, after ? 4 : 10, '#4E8A3C', 4, 1.3)
  // 김치(먹은 후 다 먹음 → 빈 그릇에 국물 자국)
  const kimchi = after
    ? `<ellipse cx="96" cy="236" rx="16" ry="10" fill="rgba(200,70,40,.25)"/>`
    : Array.from({ length: 9 }, () => { const x = 82 + rnd() * 26, y = 222 + rnd() * 26; return `<path d="M${x} ${y} l14 -4 l3 12 l-14 4z" fill="${rnd() > .5 ? '#D9502E' : '#E8743F'}" stroke="#F6D7B8" stroke-width="1.4"/>` }).join('')
  // 시금치나물(그대로 남김)
  const spinach = Array.from({ length: 14 }, () => { const x = 284 + rnd() * 40, y = 220 + rnd() * 30; return `<path d="M${x} ${y} q8 -10 18 -4 q-6 8 -18 4z" fill="${rnd() > .5 ? '#3F7A2E' : '#5B9A3A'}"/>` }).join('') + grains(304, 236, 20, 18, '#F1E6C2', 1.4, 1.4)
  return `<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${after ? '먹은 후' : '먹기 전'} 식판 사진">
  <defs>
    <linearGradient id="${id}wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C99A6B"/><stop offset=".5" stop-color="#B78757"/><stop offset="1" stop-color="#A67646"/></linearGradient>
    <radialGradient id="${id}bowl" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".8" stop-color="#E9E5DC"/><stop offset="1" stop-color="#CFC9BC"/></radialGradient>
    <radialGradient id="${id}in" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#F7F4EE"/><stop offset="1" stop-color="#E3DED3"/></radialGradient>
    <radialGradient id="${id}soup" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#C79A55"/><stop offset="1" stop-color="#8F6530"/></radialGradient>
    <linearGradient id="${id}pork" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C8452A"/><stop offset="1" stop-color="#8E2A17"/></linearGradient>
    <linearGradient id="${id}tray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3EFE6"/><stop offset="1" stop-color="#E2DCCF"/></linearGradient>
    <filter id="${id}b"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="400" height="320" fill="url(#${id}wood)"/>
  ${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${18 + i * 36} q200 ${i % 2 ? 8 : -8} 400 0" stroke="rgba(90,55,25,.18)" stroke-width="2" fill="none"/>`).join('')}
  <rect x="22" y="22" width="356" height="276" rx="26" fill="rgba(60,40,20,.25)" filter="url(#${id}b)"/>
  <rect x="18" y="16" width="356" height="276" rx="26" fill="url(#${id}tray)"/>
  ${bowl(96, 112, 54, rice)}
  ${bowl(304, 112, 54, soup)}
  ${plate(200, 230, 66, 46, pork)}
  ${plate(96, 236, 40, 34, kimchi)}
  ${plate(304, 236, 40, 34, spinach)}
  <rect x="196" y="60" width="6" height="104" rx="3" fill="#B9B4AA" transform="rotate(8 199 112)"/><ellipse cx="206" cy="58" rx="13" ry="18" fill="#C7C2B8" transform="rotate(8 206 58)"/>
  <rect x="214" y="64" width="4" height="100" rx="2" fill="#A8A398" transform="rotate(5 216 114)"/>
  <rect width="400" height="320" fill="url(#${id}light)" opacity=".0"/>
</svg>`
}
