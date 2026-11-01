// 서비스 워커(PWA, 2026-11-01 사용자 요청). 빌드 때 vite.config.ts의 pwaServiceWorker가 아래 자리표시(__…__)를 채워 dist/sw.js로 쓴다.
// - 캐시하는 것: 이 사이트의 앱 화면 파일(index.html, /assets/*, 아이콘·manifest)과 음식 데이터(/data/*.json)뿐.
// - 캐시하지 않는 것: 다른 주소로 가는 요청 전부(Firestore·Gemini·구글 로그인·App Check·글꼴·나이스 급식),
//   이 사이트의 로그인 처리 경로(/__/), GET이 아닌 요청. 이런 요청은 서비스 워커가 손대지 않고 브라우저가 그대로 보낸다.
// - 화면 열기(index.html): 늘 네트워크 먼저(새 배포를 바로 받음). 3초 안에 안 오거나 오프라인이면 이 버전에 미리 받아 둔 index.html.
//   index.html은 firebase.json에서 no-cache라 브라우저 캐시와도 부딪히지 않는다.
// - /assets/*: 파일 이름에 내용 해시가 있어 바뀌지 않으므로 저장본 먼저, 없으면 받아서 저장(아이폰 HEIC 변환기처럼 큰 파일은 처음 쓸 때).
// - /data/*.json: 저장본 먼저. 데이터 파일이 바뀌면 DATA_VERSION이 바뀌어 옛 저장본을 지우고 새로 받는다.
// - 새 버전: 배포하면 이 파일 내용(VERSION)이 바뀌어 브라우저가 새 서비스 워커를 설치하고 바로 활성화한다.
//   바로 앞 버전 캐시 하나는 남겨, 열려 있던 화면이 옛 화면 파일을 계속 불러올 수 있게 한다.
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const DATA_VERSION = '__DATA_VERSION__'

const APP_PREFIX = 'app-'
const APP_CACHE = APP_PREFIX + VERSION
const DATA_CACHE = 'data-' + DATA_VERSION
const META_CACHE = 'sw-meta'
const META_KEY = '/__sw-meta/current'
const NAV_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const meta = await caches.open(META_CACHE)
      const prevRes = await meta.match(META_KEY)
      const prev = prevRes ? await prevRes.text() : null
      const keep = new Set([APP_CACHE, DATA_CACHE, META_CACHE])
      if (prev && prev !== VERSION) keep.add(APP_PREFIX + prev)
      await meta.put(META_KEY, new Response(VERSION))
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/__/') || url.pathname === '/sw.js') return
  if (req.mode === 'navigate') {
    event.respondWith(openPage(req))
    return
  }
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(cacheFirst(req, DATA_CACHE))
    return
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(req, APP_CACHE))
  }
})

/** 화면 열기: 네트워크 먼저, 늦거나 안 되면 미리 받아 둔 index.html. 받은 index.html은 저장하지 않는다(이 버전 화면 파일과 짝이 맞는 것만 쓴다) */
async function openPage(req) {
  try {
    return await withTimeout(fetch(req), NAV_TIMEOUT_MS)
  } catch {
    const cached = (await caches.match('/index.html', { cacheName: APP_CACHE })) ?? (await caches.match('/index.html'))
    return cached ?? Response.error()
  }
}

/** 저장본 먼저(앞 버전 캐시까지 찾는다), 없으면 받아서 cacheName에 저장 */
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && res.type === 'basic') {
    const copy = res.clone()
    caches
      .open(cacheName)
      .then((c) => c.put(req, copy))
      .catch(() => undefined)
  }
  return res
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}
