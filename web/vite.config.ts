import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** 미리 받아 두지 않는 큰 화면 파일(아이폰 HEIC 변환기 약 3MB 등). 처음 쓸 때 서비스 워커가 받아서 저장한다 */
const PRECACHE_MAX_BYTES = 1024 * 1024

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? filesUnder(p) : [p]
  })
}

function hashOf(paths: string[], base: string): string {
  const h = createHash('sha256')
  for (const p of paths) h.update(relative(base, p)).update(readFileSync(p))
  return h.digest('hex').slice(0, 12)
}

/**
 * PWA 서비스 워커(2026-11-01 사용자 요청). 빌드가 끝나면 pwa/sw.template.js에 미리 받을 파일 목록과 버전을 채워 dist/sw.js로 쓴다.
 * 미리 받기: index.html, manifest, 맨 위 아이콘, /assets/* 가운데 1MB 이하. 데이터(/data/*.json)는 처음 쓸 때 받고, 내용 해시로 데이터 캐시 버전을 정한다.
 * 버전은 미리 받는 파일 내용의 해시라 바뀐 것이 없으면 sw.js도 그대로다(새로 설치하지 않음).
 */
function pwaServiceWorker(): Plugin {
  let outDir = ''
  let root = ''
  return {
    name: 'pwa-service-worker',
    apply: 'build',
    configResolved(c) {
      root = c.root
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      const all = filesUnder(outDir).sort()
      const rel = (p: string) => '/' + relative(outDir, p).split('\\').join('/')
      const precache = all.filter((p) => {
        const u = rel(p)
        if (u === '/index.html' || u === '/manifest.webmanifest') return true
        if (/^\/[^/]+\.(png|svg)$/.test(u)) return true
        return u.startsWith('/assets/') && !u.endsWith('.map') && statSync(p).size <= PRECACHE_MAX_BYTES
      })
      const data = all.filter((p) => rel(p).startsWith('/data/'))
      const sw = readFileSync(resolve(root, 'pwa/sw.template.js'), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(hashOf(precache, outDir)))
        .replace('__PRECACHE__', JSON.stringify(precache.map(rel)))
        .replace("'__DATA_VERSION__'", JSON.stringify(hashOf(data, outDir)))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pwaServiceWorker()],
})
