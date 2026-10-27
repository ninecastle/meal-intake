// 화면 일부를 PNG 그림으로 만들어 공유(디자인 조각 D5, 시안 [오늘 하루 공유하기]·[오늘 식단 공유하기]).
// 폰은 Web Share(파일)로 공유 창을 열고, 안 되면(PC·지원 안 함·거부) PNG를 내려받는다. 시안 토스트 "이미지로 저장했어요".
// html-to-image는 처음 누를 때만 불러온다(첫 화면 번들에 넣지 않는다). 그림에는 화면 글자·그림만 들어간다(사진 없음).

export type ShareResult = 'shared' | 'saved' | 'cancelled'

export async function shareElementImage(el: HTMLElement, fileName: string, title: string): Promise<ShareResult> {
  const { toBlob } = await import('html-to-image')
  // backgroundColor는 그리는 요소 자체의 바탕을 덮어쓴다(.gcard 하늘색이 흰색이 됨). 바탕이 투명한 요소(식단 목록)에만 흰 바탕을 준다.
  const bg = getComputedStyle(el).backgroundColor
  const transparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)'
  const blob = await toBlob(el, { pixelRatio: 2, ...(transparent ? { backgroundColor: '#FFFFFF' } : {}) })
  if (!blob) throw new Error('이미지를 만들지 못했어요')
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled'
      // 공유가 막히면(누른 지 오래 지남 등) 내려받기로
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'saved'
}
