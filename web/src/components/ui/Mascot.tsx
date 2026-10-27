// web/scripts/gen-ui-art.mjs로 디자인 시안(_workspace/design/diet-app-prototype.html)에서 만든 파일이다. 손으로 고치지 말고 스크립트를 다시 돌린다.
// 시안 `mascot`(흰 밥알 얼굴과 잎). 기본은 그림으로 읽고("앱 마스코트"), decorative면 읽지 않는다.
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
      <ellipse cx="60" cy="98" rx="34" ry="6" fill="rgba(31,42,46,.12)"/><path d="M60 14c22 0 40 18 40 44 0 26-18 38-40 38S20 84 20 58c0-26 18-44 40-44z" fill="#FFFFFF"/><path d="M60 14c6-10 18-10 20-2-8 0-14 2-20 2z" fill="#8CC75A"/><circle cx="47" cy="56" r="4" fill="#1F2A2E"/><circle cx="73" cy="56" r="4" fill="#1F2A2E"/><path d="M54 68q6 5 12 0" stroke="#1F2A2E" strokeWidth="3" fill="none" strokeLinecap="round"/><circle cx="39" cy="66" r="5" fill="#F7BE94" opacity=".8"/><circle cx="81" cy="66" r="5" fill="#F7BE94" opacity=".8"/>
    </svg>
  )
}
