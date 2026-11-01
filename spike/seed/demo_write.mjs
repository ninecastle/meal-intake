// demo_seed.mjs가 만든 JSON을 Firestore에 쓴다(심사위원용 테스트 계정, 2026-11-01 사용자 요청). AI 호출 없음.
// 쓰는 법: node spike/seed/demo_write.mjs <seed.json> <uid> <emulator|production>
// - emulator: 127.0.0.1:8080, Bearer owner(규칙 무시)
// - production: 이 PC의 firebase-tools 로그인(배포에 쓰는 것)으로 받은 접근 토큰(관리자 권한, 규칙 무시). 비밀번호는 쓰지 않는다.
// 사용자 문서는 goal·targetWeightKg·prefs.keepPhotos·prefs.tutorialDone만 바꾼다(동의 등 다른 필드는 그대로).
// 같은 문서 id로 다시 쓰면 덮어쓴다(이어 채우기·다시 만들기 안전).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const PROJECT = 'meal-intake-2026'
const [SEED, UID, TARGET] = process.argv.slice(2)
if (!SEED || !UID || !['emulator', 'production'].includes(TARGET)) throw new Error('쓰는 법: demo_write.mjs seed.json uid emulator|production')

const BASE = TARGET === 'emulator' ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'
const DOCS = `projects/${PROJECT}/databases/(default)/documents`

async function token() {
  if (TARGET === 'emulator') return 'owner'
  const npmRoot = process.env.APPDATA ? path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools') : '/usr/local/lib/node_modules/firebase-tools'
  const req = createRequire(path.join(npmRoot, 'package.json'))
  const auth = req('./lib/auth.js')
  const scopes = req('./lib/scopes.js')
  const { configstore } = req('./lib/configstore.js')
  const t = await auth.getAccessToken(configstore.get('tokens').refresh_token, [scopes.CLOUD_PLATFORM, scopes.EMAIL, scopes.OPENID])
  return t.access_token
}

/** JS 값 → Firestore REST 값. { $ts: ISO } = 시각, { $bytes: base64 } = 바이트 */
function val(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } }
  if (typeof v === 'object') {
    if ('$ts' in v) return { timestampValue: v.$ts }
    if ('$bytes' in v) return { bytesValue: v.$bytes }
    return { mapValue: { fields: fieldsOf(v) } }
  }
  throw new Error(`지원하지 않는 값: ${typeof v}`)
}
const fieldsOf = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, val(v)]))

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'))
const tk = await token()
const writes = seed.docs.map((d) => ({ update: { name: `${DOCS}/users/${UID}/${d.path}`, fields: fieldsOf(d.fields) } }))
if (seed.user && Object.keys(seed.user).length) {
  writes.unshift({
    update: { name: `${DOCS}/users/${UID}`, fields: fieldsOf({ ...seed.user, prefs: { keepPhotos: true, tutorialDone: true } }) },
    updateMask: { fieldPaths: ['goal', 'targetWeightKg', 'prefs.keepPhotos', 'prefs.tutorialDone'] },
  })
}

// 사진 문서가 커서(장당 약 30KB) 한 번에 80개씩
const CHUNK = 80
let done = 0
for (let i = 0; i < writes.length; i += CHUNK) {
  const r = await fetch(`${BASE}/v1/${DOCS}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: writes.slice(i, i + CHUNK) }),
  })
  if (!r.ok) throw new Error(`쓰기 실패 ${r.status}: ${(await r.text()).slice(0, 300)}`)
  done += Math.min(CHUNK, writes.length - i)
}
console.log(`${TARGET}: ${done}개 문서를 users/${UID.slice(0, 6)}… 아래에 썼어요`)
