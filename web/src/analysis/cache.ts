// 같은 사진 결과 캐시(스펙 5.2.2). 키: 압축본 Blob의 SHA-256(hex). 값: 결과 JSON·시각·모델·프롬프트 버전.
// 사진 자체는 넣지 않는다. 해시는 Firestore에 넣지 않는다. IndexedDB가 실패하면 캐시 없이 동작한다.
const DB_NAME = 'meal-analysis-cache'
const DB_VERSION = 1
export type CacheStoreName = 'before' | 'after'
// 'after'는 조각 3(호출 B)용으로 미리 만든다(DB 버전 올리기를 피한다).
const STORES: CacheStoreName[] = ['before', 'after']
const OP_TIMEOUT_MS = 1_500
/** 이보다 오래된 항목은 쓰지 않고, 쓰기 때 지운다 */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface CacheEntry<T> { key: string; value: T; at: number; model: string; prompt_version: string }

let dbPromise: Promise<IDBDatabase | null> | null = null

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), OP_TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      },
    )
  })
}

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    const open = new Promise<IDBDatabase | null>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'key' })
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
    })
    dbPromise = withTimeout(open, null)
  }
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 모델·프롬프트 버전이 같고 기한 안인 항목만 돌려준다. 실패하면 null */
export async function cacheGet<T>(
  store: CacheStoreName,
  key: string,
  expect: { model: string; prompt_version: string },
): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const req = db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<CacheEntry<T> | undefined>
    const entry = await withTimeout(reqToPromise(req), undefined)
    if (!entry || entry.model !== expect.model || entry.prompt_version !== expect.prompt_version) return null
    if (Date.now() - entry.at > CACHE_MAX_AGE_MS) return null
    return entry
  } catch {
    return null
  }
}

/** 저장하면서 기한이 지난 항목을 지운다. 실패는 무시한다 */
export async function cachePut<T>(store: CacheStoreName, entry: CacheEntry<T>): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const done = new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      const os = tx.objectStore(store)
      os.put(entry)
      const cutoff = Date.now() - CACHE_MAX_AGE_MS
      const cur = os.openCursor()
      cur.onsuccess = () => {
        const c = cur.result
        if (!c) return
        if ((c.value as CacheEntry<unknown>).at < cutoff) c.delete()
        c.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    await withTimeout(done, undefined)
  } catch {
    // 캐시 없이 동작
  }
}

/** crypto.subtle이 없으면(비보안 컨텍스트) null */
export async function sha256Hex(data: ArrayBuffer): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
