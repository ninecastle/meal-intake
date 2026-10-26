// 촬영 화면(S2·S3) 공용 문구: 사진 전송 고지(스펙 7.1 U4), 분석 오류 안내(스펙 4.4·5.1).
import { AnalysisError } from '../../analysis/errors'
import { toDateKey } from '../../lib/time'

/** 스펙 7.1 U4 문구 그대로. 첫 촬영 전 1회 확인 + 촬영 화면에 늘 보인다. */
export const PHOTO_NOTICE =
  '사진은 앱 서버에 저장하지 않아요. 분석을 위해 Google Gemini로 보내며, 무료 등급 약관에 따라 Google이 서비스 개선에 쓸 수 있어요. 얼굴이나 개인정보가 나오지 않게 찍어 주세요.'

/** 확인 여부만 기록한다(사진은 넣지 않는다). */
const NOTICE_ACK_KEY = 'photoNoticeAck.v1'

export function readNoticeAck(): boolean {
  try {
    return localStorage.getItem(NOTICE_ACK_KEY) === '1'
  } catch {
    return false
  }
}

export function writeNoticeAck(): void {
  try {
    localStorage.setItem(NOTICE_ACK_KEY, '1')
  } catch {
    // 저장하지 못해도 이번 촬영은 진행한다(다음에 한 번 더 묻는다).
  }
}

export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

export interface ErrorView {
  title: string
  detail: string
  /** true면 [직접 입력]을 주 버튼으로 보인다(다시 찍어도 소용없는 경우). */
  preferManual: boolean
  /** 개발 빌드에서만 보이는 오류 코드 */
  devCode?: string
}

/** Gemini 일일 한도는 태평양 시간 자정에 다시 열린다: 11/1까지 16:00, 11/2부터 17:00(KST, 스펙 5.1 F10). */
function quotaResetText(): string {
  return toDateKey(new Date()) >= '2026-11-02' ? '17:00' : '16:00'
}

export function describeAnalysisError(e: unknown): ErrorView {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  if (!(e instanceof AnalysisError)) {
    if (offline) return { title: '인터넷에 연결되어 있지 않아요', detail: '연결된 뒤 다시 찍어 주세요.', preferManual: false }
    return {
      title: '사진을 처리하지 못했어요',
      detail: '다시 찍거나 직접 입력해 주세요.',
      preferManual: false,
      devCode: e instanceof Error ? e.message : String(e),
    }
  }
  const devCode = `${e.code}${e.reason ? `/${e.reason}` : ''}${e.quotaScope ? `/${e.quotaScope}` : ''}`
  if (e.code === 'NO_FOOD_DETECTED') {
    return { title: '음식을 찾지 못했어요', detail: '음식이 잘 보이게 위에서 다시 찍어 주세요.', preferManual: false, devCode }
  }
  if (e.code === 'PHOTO_INVALID') {
    return { title: '사진을 읽지 못했어요', detail: '다른 사진으로 다시 해 주세요.', preferManual: false, devCode }
  }
  switch (e.reason) {
    case 'quota':
      return e.quotaScope === 'day'
        ? {
            title: '오늘 AI 분석 한도를 다 썼어요',
            detail: `매일 ${quotaResetText()}(한국 시간)에 다시 열려요. 지금은 직접 입력으로 기록해 주세요.`,
            preferManual: true,
            devCode,
          }
        : { title: '분석 요청이 잠시 몰렸어요', detail: '1분쯤 뒤에 다시 찍어 주세요.', preferManual: false, devCode }
    case 'network':
      return { title: '인터넷 연결을 확인해 주세요', detail: '연결된 뒤 다시 찍어 주세요.', preferManual: false, devCode }
    case 'timeout':
      return { title: '분석이 너무 오래 걸렸어요', detail: '다시 찍거나 직접 입력해 주세요.', preferManual: false, devCode }
    case 'app_check':
      return {
        title: '앱 확인에 실패했어요',
        detail: import.meta.env.DEV ? '개발 빌드: App Check 디버그 토큰을 확인하세요.' : '직접 입력으로 기록해 주세요.',
        preferManual: true,
        devCode,
      }
    default:
      if (offline) return { title: '인터넷에 연결되어 있지 않아요', detail: '연결된 뒤 다시 찍어 주세요.', preferManual: false, devCode }
      return { title: '지금은 사진을 분석하지 못했어요', detail: '다시 찍거나 직접 입력해 주세요.', preferManual: false, devCode }
  }
}
