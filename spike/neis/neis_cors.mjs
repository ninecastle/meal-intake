// 배포본 도메인(https://meal-intake-2026.web.app)에서 브라우저 fetch로 NEIS API를 직접 부를 수 있는지(CORS) 확인. 로그인 없음. playwright-core가 필요하다(스크래치패드에서 실행).
import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const page = await b.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
await page.goto('https://meal-intake-2026.web.app/login')
const r = await page.evaluate(async () => {
  const q = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '5', ATPT_OFCDC_SC_CODE: 'B10', SD_SCHUL_CODE: '7010083', MLSV_YMD: '20261027', MMEAL_SC_CODE: '2' })
  const s = new URLSearchParams({ Type: 'json', pIndex: '1', pSize: '5', SCHUL_NM: '서울고등학교' })
  const out = { origin: location.origin }
  try {
    const res = await fetch(`https://open.neis.go.kr/hub/mealServiceDietInfo?${q}`)
    const j = await res.json()
    const row = j.mealServiceDietInfo?.[1]?.row?.[0]
    out.meal = { status: res.status, acao: res.headers.get('access-control-allow-origin'), name: row?.DDISH_NM, cal: row?.CAL_INFO, ntr: row?.NTR_INFO?.split('<br/>').slice(0, 3) }
  } catch (e) { out.mealError = String(e) }
  try {
    const res = await fetch(`https://open.neis.go.kr/hub/schoolInfo?${s}`)
    const j = await res.json()
    const row = j.schoolInfo?.[1]?.row?.[0]
    out.school = { status: res.status, name: row?.SCHUL_NM, atpt: row?.ATPT_OFCDC_SC_CODE, code: row?.SD_SCHUL_CODE }
  } catch (e) { out.schoolError = String(e) }
  return out
})
console.log('[cors]', JSON.stringify(r, null, 1))
console.log('[cors] 콘솔 오류:', errors.filter((e) => /neis|CORS|blocked/i.test(e)))
await b.close()
