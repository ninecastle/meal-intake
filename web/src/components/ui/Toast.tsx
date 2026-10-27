// 시안 .toast(조각 D2-S): 아래쪽 가운데 진한 알약, 비어 있으면 hidden(시안 toast()). 모양은 styles/prototype.css 그대로.
// 표시 부품만 있다. 언제 띄우고 지울지(시안은 1.6초)는 부르는 화면이 정한다.
// 화면 읽기 프로그램용 읽기 영역(role="status")은 숨겨 두지 않고 따로 늘 둔다(hidden 요소의 글 바뀜은 읽히지 않을 수 있다).
import type { ReactNode } from 'react'

export function Toast({ message }: { message: ReactNode | null }) {
  const show = message != null && message !== false && message !== ''
  return (
    <>
      <div className="toast" hidden={!show} aria-hidden="true">
        {show ? message : null}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {show ? message : null}
      </div>
    </>
  )
}
