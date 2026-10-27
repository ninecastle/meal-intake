// 홈 복숭아 띠 "나의 변화"(조각 D2-S, 시안 home() section.band.peach > .weight 마크업·클래스 그대로).
// (g) 체중 기록은 D6이라 "오늘 내 체중은?"·"– kg"·저울·[기록하기]만(2026-10-27 사용자 결정). 저울 그림은 시안 SVG 값 그대로(장식).
// [기록하기]는 시안 button.btn.peach. 부르는 화면이 "준비 중이에요" 토스트를 띄운다(onSoon).
import { Band } from '../ui'

export default function ChangeBand({ onSoon }: { onSoon: () => void }) {
  return (
    <Band tone="peach" label="나의 변화" title="나의 변화">
      <div className="weight">
        <div className="q">오늘 내 체중은?</div>
        <div className="kg num">
          –<span> kg</span>
        </div>
        <svg className="scale" viewBox="0 0 220 210" aria-hidden="true">
          <ellipse cx="110" cy="200" rx="88" ry="8" fill="rgba(201,105,44,.18)" />
          <rect x="14" y="22" width="192" height="178" rx="42" fill="#E9865A" />
          <rect x="14" y="14" width="192" height="170" rx="42" fill="#F29A6B" />
          <path d="M40 30h60" stroke="#F7B48D" strokeWidth="8" strokeLinecap="round" />
          <path d="M58 82a52 52 0 0 1 104 0z" fill="#FFFFFF" />
          <path d="M58 82a52 52 0 0 1 104 0" fill="none" stroke="#FCE3D2" strokeWidth="4" />
          <g stroke="#E9B796" strokeWidth="2.5" strokeLinecap="round">
            <path d="M70 76l4 2M78 58l4 4M94 44l3 5M110 40v6M126 44l-3 5M142 58l-4 4M150 76l-4 2" />
          </g>
          <path d="M110 46l7 24h-14z" fill="#E2552B" />
          <circle cx="110" cy="76" r="5" fill="#E2552B" />
          <rect x="44" y="112" width="52" height="52" rx="20" fill="#F5AE85" />
          <rect x="124" y="112" width="52" height="52" rx="20" fill="#F5AE85" />
        </svg>
        <button type="button" className="btn peach" onClick={onSoon}>
          기록하기
        </button>
      </div>
    </Band>
  )
}
