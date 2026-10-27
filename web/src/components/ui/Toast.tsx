// 시안 .toast: 아래쪽 가운데 진한 알약. 표시 부품만 있다. 언제 띄우고 지울지는 부르는 화면이 정한다
// (lib/flash.ts는 "다음 화면에서 한 번" 보일 안내 키를 넘기는 저장소라 역할이 다르다. 그 안내를 이 부품으로 보여도 된다).
// 읽기 영역(role="status")은 늘 두고 글만 바꾼다. 비어 있으면 화면에서 숨긴다.
import type { ReactNode } from 'react'

export function Toast({ message }: { message: ReactNode | null }) {
  const show = message != null && message !== false && message !== ''
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        show
          ? 'fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] left-1/2 z-60 w-max max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-center text-sm text-white'
          : 'sr-only'
      }
    >
      {show ? message : null}
    </div>
  )
}
