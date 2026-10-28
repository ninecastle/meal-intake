// AI 주간 리포트 저장소(디자인 조각 D14, 스펙 4.11절). 보안 규칙 v13(firestore.rules)이 키·genCount를 막는다.
// users/{uid}/reports/{weekStart} { weekStart, inputHash, stats, text, model, promptVersion, genCount, createdAt, updatedAt }
// - weekStart: 그 주 월요일 dateKey(문서 id와 같음)
// - inputHash: 만들 때 그 주 기록 요약 해시(analysis/weeklyReport computeWeekStats). 지금 값과 다르면 화면이 [다시 만들기]를 보인다.
// - stats: 만들 때의 코드 계산 값(참고용 보관, 화면 숫자 칸은 늘 지금 기록으로 다시 계산한다)
// - genCount: 만들 때 1, 다시 만들 때마다 1씩, 3까지(주당 AI 호출 3회, 규칙이 막는다)
// 쓰기는 setDoc 덮어쓰기. createdAt은 처음 만들 때 serverTimestamp, 다시 만들 때 읽어 온 값 그대로(규칙: 바꾸면 거부).
import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore'
import type { ReportText, WeekStats } from '../analysis/weeklyReport'
import { db } from '../lib/firebase'

export type { ReportText }

/** 주당 만들기 상한(규칙 v13 genCount <= 3) */
export const REPORT_MAX_GEN = 3

export interface StoredReport {
  weekStart: string
  inputHash: string
  stats: WeekStats
  text: ReportText
  model: string | null
  promptVersion: string | null
  genCount: number
  createdAt: Timestamp | null
}

const reportRef = (uid: string, weekStart: string) => doc(db, 'users', uid, 'reports', weekStart)

/** 그 주 저장된 리포트(없거나 형식이 틀리면 null). 오프라인이면 기기 캐시, 그것도 없으면 오류를 던진다. */
export async function getReport(uid: string, weekStart: string): Promise<StoredReport | null> {
  const s = await getDoc(reportRef(uid, weekStart))
  if (!s.exists()) return null
  const d = s.data()
  if (typeof d.inputHash !== 'string' || typeof d.genCount !== 'number' || !d.text || !d.stats) return null
  return {
    weekStart,
    inputHash: d.inputHash,
    stats: d.stats as WeekStats,
    text: d.text as ReportText,
    model: typeof d.model === 'string' ? d.model : null,
    promptVersion: typeof d.promptVersion === 'string' ? d.promptVersion : null,
    genCount: d.genCount,
    createdAt: (d.createdAt as Timestamp | undefined) ?? null,
  }
}

/** Firestore가 받지 않는 undefined를 빼고(JSON 왕복) 순수 값만 남긴다 */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * 새로 만든 리포트를 저장한다. prev = 지금 저장된 리포트(처음이면 null). genCount는 prev + 1(처음 1).
 * 상한(3)을 넘으면 쓰지 않고 오류. 반환값은 저장한 내용(화면이 바로 보인다, 서버 확인은 기다리지 않음).
 */
export function saveReport(
  uid: string,
  weekStart: string,
  r: { inputHash: string; stats: WeekStats; text: ReportText; model: string; promptVersion: string },
  prev: StoredReport | null,
): { saved: StoredReport; committed: Promise<void> } {
  const genCount = (prev?.genCount ?? 0) + 1
  if (genCount > REPORT_MAX_GEN) throw new Error('REPORT_GEN_LIMIT')
  const createdAt = prev?.createdAt ?? null
  const committed = setDoc(reportRef(uid, weekStart), {
    weekStart,
    inputHash: r.inputHash,
    stats: plain(r.stats),
    text: plain(r.text),
    model: r.model.slice(0, 60),
    promptVersion: r.promptVersion.slice(0, 40),
    genCount,
    createdAt: prev && createdAt ? createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return {
    saved: { weekStart, inputHash: r.inputHash, stats: r.stats, text: r.text, model: r.model, promptVersion: r.promptVersion, genCount, createdAt },
    committed,
  }
}
