// 튜토리얼(D11) 가상 식판 사진. 시안 .shot(둥근 14px, 왼쪽 위 흰 글자 표) 안에 traySvg를 넣는다.
// SVG 안 그라데이션·필터 id가 다른 사진과 겹치지 않게 useId로 앞말을 만든다(useId의 특수 문자는 url(#…)에 못 쓰므로 뺀다).
import { useId, useMemo } from 'react'
import { traySvg } from './traySvg'

export function TrayPhoto({ after = false, label }: { after?: boolean; label: string }) {
  const raw = useId()
  const id = 'tray' + raw.replace(/[^a-zA-Z0-9]/g, '')
  const html = useMemo(() => traySvg(after, id), [after, id])
  return (
    <div className="shot">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <span>{label}</span>
    </div>
  )
}
