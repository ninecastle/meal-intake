// 화면 파일 불러오기 실패 처리(lib/chunkReload.ts) 시험: 오류 판별, 60초 안 두 번째 자동 새로고침 막기, sessionStorage 실패.
// 실행: node spike/tests/chunk_reload_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
let reloads = 0
const store = new Map()
globalThis.window = { location: { reload: () => reloads++ } }
globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
const { isChunkLoadError, reloadOnceForNewVersion } = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/chunkReload.ts')).href)

// 판별: Chrome·Firefox·Safari 문구, 일반 오류는 아님
assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/GoalPage-abc.js')), true)
assert.equal(isChunkLoadError(new TypeError('error loading dynamically imported module')), true)
assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true)
assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css')), true)
assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
assert.equal(isChunkLoadError(null), false)

// 처음엔 새로고침, 60초 안에는 다시 안 함, 60초 뒤엔 다시 함
const t0 = 1_000_000
assert.equal(reloadOnceForNewVersion(t0), true)
assert.equal(reloads, 1)
assert.equal(reloadOnceForNewVersion(t0 + 30_000), false)
assert.equal(reloads, 1)
assert.equal(reloadOnceForNewVersion(t0 + 61_000), true)
assert.equal(reloads, 2)

// sessionStorage를 못 쓰면 새로고침하지 않는다(무한 반복 방지)
globalThis.sessionStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => {} }
assert.equal(reloadOnceForNewVersion(t0 + 200_000), false)
assert.equal(reloads, 2)
console.log('모두 통과')
