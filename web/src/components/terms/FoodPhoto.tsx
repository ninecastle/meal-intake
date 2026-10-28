// 시안 foodPhoto(after): 식판 예시 그림(먹기 전·먹은 후). 소개 슬라이드 1(디자인 조각 D10)에서 쓴다.
// 시안 함수를 그대로 옮겨 SVG 안쪽 마크업 문자열을 만든다(고정 값만 들어가는 그림이라 사용자 입력이 섞이지 않는다).
function inner(after: boolean): string {
  const grains = (cx: number, cy: number, r: number, n: number) => {
    let s = ''
    for (let i = 0; i < n; i++) {
      const a = i * 2.4,
        d = r * Math.sqrt((i + 0.5) / n),
        x = (cx + Math.cos(a) * d).toFixed(1),
        y = (cy + Math.sin(a) * d).toFixed(1)
      s += `<ellipse cx="${x}" cy="${y}" rx="2.3" ry="1.3" transform="rotate(${(i * 47) % 180} ${x} ${y})" fill="#FFFFFF"/>`
    }
    return s
  }
  const kimchi = after
    ? '<path d="M38 46l6-4 4 5-6 3z" fill="#E2603D"/>'
    : '<g fill="#E2603D"><path d="M30 40l10-6 6 8-9 6z"/><path d="M42 50l10-5 5 7-10 5z"/><path d="M44 34l9-2 2 8-8 2z"/><path d="M30 52l7-3 4 6-7 3z"/></g><g fill="#F49A6E"><circle cx="38" cy="39" r="2"/><circle cx="50" cy="47" r="2"/></g>'
  const spinach = after
    ? '<path d="M96 48q4-4 8 0" stroke="#4E8A2E" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<g stroke="#4E8A2E" stroke-width="3.2" fill="none" stroke-linecap="round"><path d="M86 40q6-8 12 0t12 0"/><path d="M88 48q6-6 12 0t10 0"/><path d="M92 34q5-4 10 0"/><path d="M90 54q5-4 12 0"/></g><g fill="#EBDDA8"><circle cx="96" cy="42" r="1.4"/><circle cx="104" cy="50" r="1.4"/><circle cx="100" cy="36" r="1.4"/></g>'
  const sprout = after
    ? '<path d="M148 46q6 2 10-4"/><path d="M152 52q5 0 8-6"/>'
    : '<path d="M142 38q8 4 14-4"/><path d="M146 46q8 3 16-6"/><path d="M144 52q7 2 14-3"/><path d="M152 34q6 3 12-2"/><path d="M150 56q6 1 12-5"/><path d="M158 44q4 3 8-2"/>'
  const heads = after
    ? '<circle cx="158" cy="42" r="2"/>'
    : '<circle cx="156" cy="32" r="2.2"/><circle cx="162" cy="46" r="2.2"/><circle cx="148" cy="52" r="2.2"/><circle cx="142" cy="38" r="2"/>'
  const rice = after
    ? `<path d="M44 114q8-16 24-6q6 10-8 13q-12 2-16-7z" fill="#EFE7D3"/>${grains(57, 113, 9, 9)}`
    : `<circle cx="62" cy="108" r="26" fill="#EFE7D3"/>${grains(62, 108, 23, 42)}`
  const soup = after
    ? '<circle cx="140" cy="110" r="16" fill="#E2B47B"/><rect x="136" y="106" width="7" height="7" rx="1.5" fill="#FFF6E2"/>'
    : '<circle cx="140" cy="108" r="26" fill="#D6964D"/><g fill="#FFF6E2"><rect x="128" y="98" width="9" height="9" rx="2"/><rect x="143" y="104" width="9" height="9" rx="2"/><rect x="132" y="114" width="9" height="9" rx="2"/></g><g fill="#7DBA4F"><circle cx="148" cy="96" r="2.4"/><circle cx="126" cy="112" r="2.4"/><circle cx="150" cy="118" r="2.4"/><circle cx="140" cy="94" r="2"/></g><path d="M124 100q4-6 10-6" stroke="#EDBE87" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
  return `<rect width="200" height="160" fill="#E6CDAA"/><path d="M0 30h200M0 80h200M0 130h200" stroke="#DCBF97" stroke-width="2"/><rect x="10" y="10" width="180" height="142" rx="16" fill="#F4F1EA" stroke="#E0D9CB" stroke-width="2"/><circle cx="44" cy="44" r="22" fill="#FFFFFF" stroke="#E6E1D6"/>${kimchi}<circle cx="100" cy="44" r="22" fill="#FFFFFF" stroke="#E6E1D6"/>${spinach}<circle cx="156" cy="44" r="22" fill="#FFFFFF" stroke="#E6E1D6"/><g stroke="#F1D27C" stroke-width="2.4" stroke-linecap="round" fill="none">${sprout}</g><g fill="#E8C25A">${heads}</g><circle cx="62" cy="108" r="32" fill="#FFFFFF" stroke="#E6E1D6"/><circle cx="62" cy="108" r="27" fill="#F6F3EC"/>${rice}<circle cx="140" cy="108" r="32" fill="#FFFFFF" stroke="#E6E1D6"/><circle cx="140" cy="108" r="27" fill="#F6F1E8"/>${soup}<g transform="rotate(-6 100 146)"><rect x="42" y="141" width="84" height="4" rx="2" fill="#C9A26B"/><rect x="42" y="147" width="84" height="4" rx="2" fill="#B88F57"/></g>`
}

const BEFORE = inner(false)
const AFTER = inner(true)

export default function FoodPhoto({ after = false }: { after?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 160"
      role="img"
      aria-label={`${after ? '먹은 후' : '먹기 전'} 식판 예시 사진`}
      dangerouslySetInnerHTML={{ __html: after ? AFTER : BEFORE }}
    />
  )
}
