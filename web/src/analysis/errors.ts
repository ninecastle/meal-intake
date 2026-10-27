// 분석 모듈 오류(스펙 4.3·4.4절).

export type AnalysisErrorCode = 'ANALYSIS_UNAVAILABLE' | 'NO_FOOD_DETECTED' | 'PHOTO_INVALID'
export type AnalysisFailReason =
  | 'quota'
  | 'app_check'
  | 'network'
  | 'timeout'
  | 'server'
  | 'invalid_response'
  | 'blocked'
  | 'bad_request'
  /** PHOTO_INVALID 중 HEIC/HEIF를 브라우저도 변환 라이브러리도 열지 못한 경우("이 사진 형식을 열지 못했어요", 스펙 4.8절) */
  | 'unsupported_format'
/** 429일 때만: 분당 한도(minute)인지 일일 한도 소진(day)인지. 둘 다 재시도하지 않는다(minute은 "잠시 후 다시 시도해 주세요", day는 한도 모드 판단용). */
export type QuotaScope = 'minute' | 'day'

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode
  readonly reason?: AnalysisFailReason
  readonly quotaScope?: QuotaScope

  constructor(
    code: AnalysisErrorCode,
    message: string,
    opts?: { reason?: AnalysisFailReason; quotaScope?: QuotaScope; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'AnalysisError'
    this.code = code
    this.reason = opts?.reason
    this.quotaScope = opts?.quotaScope
  }
}

export function isAnalysisError(e: unknown): e is AnalysisError {
  return e instanceof AnalysisError
}
