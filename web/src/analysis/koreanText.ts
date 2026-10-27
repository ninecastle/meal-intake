// Gemini가 쓴 메모·경고가 한국어가 아니면 일반 안내 문구로 바꾼다(2026-10-27 사용자 결정).
// 프롬프트(a4·b2)가 한국어로 쓰게 하지만, 그래도 영어가 오면 화면에 그대로 보이지 않게 한다.
// 응답 정리(beforePrompt·afterPrompt)와 결과 화면 표시 두 곳에서 쓴다(예전에 저장·캐시된 분석도 화면에서 걸러진다).

/** 한글 음절이 하나라도 있으면 한국어로 본다(음식 이름에 영어가 섞인 한국어 문장은 그대로 둔다). */
const HANGUL = /[가-힣]/

export const GENERIC_MODEL_NOTE = 'AI 분석 메모를 한국어로 받지 못했어요. 음식 이름과 양을 한 번 더 확인해 주세요.'

export function isKoreanText(s: string): boolean {
  return HANGUL.test(s)
}

/** 한국어가 아닌 경고는 GENERIC_MODEL_NOTE 하나로 바꾸고, 같은 문구는 한 번만 남긴다(순서 유지). */
export function koreanWarnings(list: readonly string[]): string[] {
  const out: string[] = []
  for (const w of list) {
    const t = typeof w === 'string' ? w.trim() : ''
    if (!t) continue
    const v = isKoreanText(t) ? t : GENERIC_MODEL_NOTE
    if (!out.includes(v)) out.push(v)
  }
  return out
}
