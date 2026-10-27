/** 클래스 이름 잇기(거짓 값은 뺀다). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
