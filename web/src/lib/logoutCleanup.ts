// 로그아웃 때 이 기기에 남은 계정 자료를 지운다(공용 기기에서 다음 사람이 보지 않게).
// - 먹기 전 사진 IndexedDB(meal-photos)
// - Firestore 영구 캐시(IndexedDB firestore/...): terminate(db) 뒤 clearIndexedDbPersistence(db). 그 뒤 db는 못 쓰므로 페이지를 새로 불러온다.
// - 계정에 딸린 localStorage·sessionStorage 키(ACCOUNT_* 아래). 기기 전체 설정(겹쳐 보기 진하기, 기록 보기 칩, 새 버전 새로고침 시각)은 남긴다.
// 순서: signOut → 지우기 → /welcome 새로 불러오기. 지우기가 실패해도 로그아웃은 된다.
// 다 지우지 못하면(다른 탭이 캐시를 잡고 있음·오프라인 등) 표시 키를 남겨 다음 시작 때(화면을 그리기 전) 한 번 더 지운다.
// 분석 결과 캐시(meal-analysis-cache)는 사진 해시·음식 이름 키라 계정 정보가 아니어서 남긴다(lib/auth.ts 설명).
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore'
import { beforePhotoStore } from '../photos/beforePhotoStore'
import { db } from './firebase'

/** 다 못 지웠음 표시(다음 시작 때 다시 지운다) */
export const CLEANUP_PENDING_KEY = 'logoutCleanup.pending'

/** 계정에 딸린 localStorage 키(정확히 같은 이름) */
const ACCOUNT_LOCAL_KEYS = ['onboardingDraft.v1']
/** 계정에 딸린 localStorage 키 앞부분 */
const ACCOUNT_LOCAL_PREFIXES = ['neisMeal.v1:', 'schoolMealOf.v1:', 'fastAuto.v1:', 'demoFresh.v1:']
/** 계정에 딸린 sessionStorage 키 */
const ACCOUNT_SESSION_KEYS = ['scrollMemory.v1', 'welcome.loginStart', 'timing']

const STEP_TIMEOUT_MS = 3000

function withTimeout<T>(p: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

function setPending(on: boolean) {
  try {
    if (on) localStorage.setItem(CLEANUP_PENDING_KEY, '1')
    else localStorage.removeItem(CLEANUP_PENDING_KEY)
  } catch {
    // 저장소를 못 쓰면 표시도 못 남긴다
  }
}

export function cleanupPending(): boolean {
  try {
    return localStorage.getItem(CLEANUP_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

/** 계정 localStorage·sessionStorage 키를 지운다(던지지 않는다) */
export function clearAccountStorage(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (ACCOUNT_LOCAL_KEYS.includes(k) || ACCOUNT_LOCAL_PREFIXES.some((p) => k.startsWith(p)))) localStorage.removeItem(k)
    }
  } catch {
    // 무시
  }
  try {
    for (const k of ACCOUNT_SESSION_KEYS) sessionStorage.removeItem(k)
  } catch {
    // 무시
  }
}

/**
 * 로그아웃 직후 부른다: 계정 키·먹기 전 사진·Firestore 캐시를 지운다. 다 지웠으면 true.
 * db를 terminate하므로 부른 뒤에는 반드시 페이지를 새로 불러온다.
 */
export async function clearDeviceDataAfterSignOut(): Promise<boolean> {
  setPending(true)
  clearAccountStorage()
  let ok = true
  try {
    await withTimeout(beforePhotoStore.clearAll())
  } catch (e) {
    ok = false
    console.warn('[logout] 먹기 전 사진 지우기 실패', e)
  }
  try {
    await withTimeout(terminate(db))
    await withTimeout(clearIndexedDbPersistence(db))
  } catch (e) {
    ok = false
    console.warn('[logout] Firestore 캐시 지우기 실패(다음 시작 때 다시)', e)
  }
  if (ok) setPending(false)
  return ok
}

/**
 * 앱 시작 때 화면을 그리기 전에 한 번: 지난 로그아웃 때 다 못 지웠으면 다시 지운다.
 * db를 아직 쓰기 전(시작 전)이라 clearIndexedDbPersistence를 부를 수 있다. 오래 걸리면 기다리지 않고 시작한다.
 */
export async function retryPendingCleanup(): Promise<void> {
  if (!cleanupPending()) return
  clearAccountStorage()
  let ok = true
  try {
    await withTimeout(beforePhotoStore.clearAll(), 1500)
  } catch {
    ok = false
  }
  try {
    await withTimeout(clearIndexedDbPersistence(db), 1500)
  } catch (e) {
    ok = false
    console.warn('[logout] 시작 때 Firestore 캐시 지우기 실패', e)
  }
  if (ok) setPending(false)
}
