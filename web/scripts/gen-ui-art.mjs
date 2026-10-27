// 디자인 시안의 SVG(선 아이콘 `ico`, 끼니 그림 `icons`, 마스코트 `mascot`)를 TSX 부품으로 옮긴다(조각 D1-a).
// 시안이 바뀌면 다시 돌린다: node web/scripts/gen-ui-art.mjs _workspace/design/diet-app-prototype.html web/src/components/ui
// 만드는 파일: Icon.tsx, MealArt.tsx, Mascot.tsx (손으로 고치지 말고 이 스크립트를 고친다)
import fs from 'node:fs'
import path from 'node:path'

const [, , protoPath, outDir] = process.argv
if (!protoPath || !outDir) throw new Error('사용법: node gen-ui-art.mjs <시안.html> <출력 폴더>')
const src = fs.readFileSync(protoPath, 'utf8')

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
// 바깥 <svg>는 부품이 직접 만든다. 안쪽 태그의 속성 이름만 JSX식(stroke-width → strokeWidth)으로 바꾼다.
const toJsx = (svg) =>
  svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/ ([a-z]+(?:-[a-z]+)+)=/g, (m, n) => (n.startsWith('aria-') ? m : ` ${camel(n)}=`))

const meals = {}
for (const m of src.matchAll(/^ {2}(breakfast|lunch|dinner|snack):`(<svg[\s\S]*?<\/svg>)`/gm)) meals[m[1]] = toJsx(m[2])
const icoBlock = src.match(/const ico=\{([\s\S]*?)\n\};/)
if (!icoBlock) throw new Error('시안에서 ico를 찾지 못했다')
const ico = {}
for (const m of icoBlock[1].matchAll(/^ {2}(\w+):'(<svg viewBox="0 0 24 24">[\s\S]*?<\/svg>)'/gm)) ico[m[1]] = toJsx(m[2])
ico.plus = '<path d="M12 5v14M5 12h14"/>' // 시안 끼니 카드의 + 표시(인라인 SVG)
const mascotM = src.match(/const mascot=`(<svg[\s\S]*?<\/svg>)`/)
if (!mascotM) throw new Error('시안에서 mascot을 찾지 못했다')
const mascot = toJsx(mascotM[1])

const mealKeys = ['breakfast', 'lunch', 'dinner', 'snack']
if (mealKeys.some((k) => !meals[k])) throw new Error('끼니 그림 4개를 모두 찾지 못했다')
for (const [k, v] of [...Object.entries(meals), ...Object.entries(ico), ['mascot', mascot]]) {
  if (/[{}`$]/.test(v)) throw new Error(`${k}: JSX로 그대로 옮길 수 없는 글자가 있다`)
}
const names = Object.keys(ico)
const HEAD = '// web/scripts/gen-ui-art.mjs로 디자인 시안(_workspace/design/diet-app-prototype.html)에서 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다.\n'

const iconTsx = `${HEAD}// 시안 \`ico\`의 선 아이콘(24×24, 선 굵기 2, 둥근 끝). 색은 글자색(currentColor)을 따른다. 장식이라 읽지 않는다(버튼 이름은 IconButton의 label).
import type { ReactNode } from 'react'

export type IconName = ${names.map((n) => `'${n}'`).join(' | ')}

const PATHS: Record<IconName, ReactNode> = {
${names.map((n) => `  ${n}: <>${ico[n]}</>,`).join('\n')}
}

type Props = { name: IconName; size?: number; strokeWidth?: number; className?: string }

export function Icon({ name, size = 24, strokeWidth = 2, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
`

const mealTsx = `${HEAD}// 시안 \`icons\`의 끼니 그림 4개(아침 해, 점심 해와 언덕, 저녁 달, 간식 케이크). 장식이라 읽지 않는다.
import type { ReactNode } from 'react'
import type { MealType } from '../../data/meals'

const ART: Record<MealType, ReactNode> = {
${mealKeys.map((k) => `  ${k}: (\n    <>\n      ${meals[k]}\n    </>\n  ),`).join('\n')}
}

type Props = { meal: MealType; size?: number; framed?: boolean; className?: string }

/** framed: 시안 .micowrap(흰 원 안에 그림, 그림 42 : 원 58 비율). size는 그림 크기(px). */
export function MealArt({ meal, framed = false, size = framed ? 42 : 40, className }: Props) {
  const art = (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={framed ? undefined : className}>
      {ART[meal]}
    </svg>
  )
  if (!framed) return art
  const wrap = Math.round((size * 58) / 42)
  return (
    <span
      className={\`grid flex-none place-items-center rounded-full bg-surface shadow-[0_2px_6px_rgba(31,42,46,.08)] \${className ?? ''}\`}
      style={{ width: wrap, height: wrap }}
    >
      {art}
    </span>
  )
}
`

const mascotTsx = `${HEAD}// 시안 \`mascot\`(흰 밥알 얼굴과 잎). 기본은 그림으로 읽고("앱 마스코트"), decorative면 읽지 않는다.
type Props = { size?: number; label?: string; decorative?: boolean; className?: string }

export function Mascot({ size = 120, label = '앱 마스코트', decorative = false, className }: Props) {
  return (
    <svg
      viewBox="0 0 120 110"
      width={size}
      height={Math.round((size * 110) / 120)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={className}
    >
      ${mascot}
    </svg>
  )
}
`
fs.writeFileSync(path.join(outDir, 'Icon.tsx'), iconTsx)
fs.writeFileSync(path.join(outDir, 'MealArt.tsx'), mealTsx)
fs.writeFileSync(path.join(outDir, 'Mascot.tsx'), mascotTsx)
console.log('icons:', names.join(','), '| meals:', Object.keys(meals).join(','))
