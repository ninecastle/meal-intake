// 먹기 전 사진(압축본) 기기 임시 보관. 서버에는 올리지 않는다(CLAUDE.md 확정 결정 사항).
// IndexedDB `meal-photos` / 저장소 `before` / 키 mealId / 값 { blob, createdAt }.
// IndexedDB를 못 쓰면(사생활 보호 모드 등) 메모리에만 둔다. localStorage·sessionStorage는 쓰지 않는다.
// 모든 메서드는 던지지 않는다(실패는 콘솔에 기록).

export interface BeforePhotoStore {
  put(mealId: string, photo: Blob): Promise<'idb' | 'memory'>
  get(mealId: string): Promise<Blob | null>
  remove(mealId: string): Promise<void>
  cleanup(keepMealIds: string[], maxAgeMs?: number): Promise<number>
  clearAll(): Promise<void>
}

type Entry = { blob: Blob; createdAt: number }

const DB_NAME = 'meal-photos'
const STORE = 'before'
const DB_VERSION = 1
const DAY_MS = 24 * 60 * 60 * 1000

const memory = new Map<string, Entry>()
let dbPromise: Promise<IDBDatabase | null> | null = null

function warn(op: string, e?: unknown) {
  console.warn(`[beforePhotoStore] ${op} 실패`, e)
}

function isEntry(v: unknown): v is Entry {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Entry).blob instanceof Blob &&
    typeof (v as Entry).createdAt === 'number'
  )
}

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(null)
          return
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
        }
        req.onsuccess = () => {
          const db = req.result
          db.onversionchange = () => {
            db.close()
            dbPromise = null
          }
          resolve(db)
        }
        req.onerror = () => {
          warn('open', req.error)
          resolve(null)
        }
        req.onblocked = () => warn('open(blocked)')
      } catch (e) {
        warn('open', e)
        resolve(null)
      }
    })
  }
  return dbPromise
}

/** 저장소 하나에 대한 트랜잭션. 완료(oncomplete)되어야 성공으로 본다. */
async function withStore(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  return new Promise<boolean>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, mode)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
      run(tx.objectStore(STORE))
    } catch (e) {
      reject(e)
    }
  })
}

export const beforePhotoStore: BeforePhotoStore = {
  async put(mealId, photo) {
    const entry: Entry = { blob: photo, createdAt: Date.now() }
    try {
      if (await withStore('readwrite', (s) => s.put(entry, mealId))) {
        memory.delete(mealId)
        return 'idb'
      }
    } catch (e) {
      warn('put', e) // 용량 초과 등 → 메모리로
    }
    memory.set(mealId, entry)
    return 'memory'
  },

  async get(mealId) {
    const mem = memory.get(mealId)
    if (mem) return mem.blob
    try {
      let value: unknown
      const ok = await withStore('readonly', (s) => {
        const req = s.get(mealId)
        req.onsuccess = () => {
          value = req.result
        }
      })
      return ok && isEntry(value) ? value.blob : null
    } catch (e) {
      warn('get', e)
      return null
    }
  },

  async remove(mealId) {
    memory.delete(mealId)
    try {
      await withStore('readwrite', (s) => s.delete(mealId))
    } catch (e) {
      warn('remove', e)
    }
  },

  // keepMealIds(awaiting_after 식사)에 없거나 maxAgeMs보다 오래된 항목을 지운다.
  async cleanup(keepMealIds, maxAgeMs = DAY_MS) {
    const keep = new Set(keepMealIds)
    const cutoff = Date.now() - maxAgeMs
    const stale = (id: string, v: unknown) => !keep.has(id) || !isEntry(v) || v.createdAt < cutoff
    let removed = 0

    for (const [id, entry] of memory) {
      if (stale(id, entry)) {
        memory.delete(id)
        removed++
      }
    }

    try {
      let idbRemoved = 0
      const ok = await withStore('readwrite', (s) => {
        const req = s.openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) return
          if (stale(String(cursor.key), cursor.value)) {
            cursor.delete()
            idbRemoved++
          }
          cursor.continue()
        }
      })
      if (ok) removed += idbRemoved
    } catch (e) {
      warn('cleanup', e)
    }
    return removed
  },

  async clearAll() {
    memory.clear()
    try {
      await withStore('readwrite', (s) => s.clear())
    } catch (e) {
      warn('clearAll', e)
    }
  },
}
