// D13 학교 급식: 나이스 응답 정리 함수(web/src/lib/neisParse.ts) 단위 시험. 외부 호출 없음.
// 실행: node spike/tests/neis_test.mjs <repo 루트>
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = process.argv[2] ?? process.cwd()
const P = await import(pathToFileURL(path.join(ROOT, 'web/src/lib/neisParse.ts')).href)

// 1. 급식(06_neis_meal_spike.md 실제 예: 서울고 2026-10-27 중식)
const meal = {
  mealServiceDietInfo: [
    { head: [{ list_total_count: 1 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다.' } }] },
    {
      row: [
        {
          MMEAL_SC_CODE: '2',
          MLSV_YMD: '20261027',
          DDISH_NM: '마제소바 (5.6.10.13.18)<br/>두부장국 (5.6)<br/>참나물무침 (5.6)<br/>*야끼만두버무리 (1.5.6.10)<br/>함박스테이크&소스 (1.2.5.6.10.16)<br/>파김치 (9.13)<br/>두부장국 (5.6)',
          CAL_INFO: '932.2 Kcal',
          NTR_INFO: '탄수화물(g) : 133.4<br/>단백질(g) : 40.6<br/>지방(g) : 25.4<br/>비타민A(R.E) : 120.5<br/>칼슘(mg) : 300.1',
        },
      ],
    },
  ],
}
assert.deepEqual(P.parseMeal(meal), {
  menu: ['마제소바', '두부장국', '참나물무침', '야끼만두버무리', '함박스테이크&소스', '파김치'],
  kcal: 932.2,
  carbs_g: 133.4,
  protein_g: 40.6,
  fat_g: 25.4,
})
// 자료 없음(INFO-200)·이상한 응답
assert.equal(P.parseMeal({ RESULT: { CODE: 'INFO-200', MESSAGE: '해당하는 데이터가 없습니다.' } }), null)
assert.equal(P.parseMeal(null), null)
assert.equal(P.parseMeal({ mealServiceDietInfo: [{ head: [] }, { row: [{ DDISH_NM: '' }] }] }), null)

// 2. 메뉴 이름 정리
assert.equal(P.cleanMenuName('흑미밥 '), '흑미밥')
assert.equal(P.cleanMenuName('배추김치9.13.'), '배추김치')
assert.equal(P.cleanMenuName('★수제돈까스(1.2.5.6)'), '수제돈까스')
assert.deepEqual(P.parseMenu('우유<br>요구르트 (2)<BR/>'), ['우유', '요구르트'])

// 3. 합계 파싱·참고 범위(300~1,500kcal)
assert.equal(P.parseKcal('1,024.5 Kcal'), 1024.5)
assert.equal(P.parseKcal(''), null)
assert.deepEqual(P.parseNutrients(''), { carbs_g: null, protein_g: null, fat_g: null })
assert.equal(P.plausibleSchoolKcal(932.2), 932)
assert.equal(P.plausibleSchoolKcal(2964), null)
assert.equal(P.plausibleSchoolKcal(299.9), null)
assert.equal(P.plausibleSchoolKcal(1500), 1500)
assert.equal(P.plausibleSchoolKcal(null), null)

// 4. 끼니 코드
assert.equal(P.mealCode('breakfast'), '1')
assert.equal(P.mealCode('lunch'), '2')
assert.equal(P.mealCode('dinner'), '3')
assert.equal(P.mealCode('snack'), null)

// 5. 학교 검색: 코드 형식이 맞는 줄만
const schools = P.parseSchools({
  schoolInfo: [
    { head: [] },
    {
      row: [
        { ATPT_OFCDC_SC_CODE: 'B10', SD_SCHUL_CODE: '7010083', SCHUL_NM: '서울고등학교', LCTN_SC_NM: '서울특별시', SCHUL_KND_SC_NM: '고등학교' },
        { ATPT_OFCDC_SC_CODE: 'b10', SD_SCHUL_CODE: '7010083', SCHUL_NM: '잘못된 코드' },
        { ATPT_OFCDC_SC_CODE: 'J10', SD_SCHUL_CODE: '123', SCHUL_NM: '짧은 코드' },
      ],
    },
  ],
})
assert.deepEqual(schools, [{ atpt: 'B10', code: '7010083', name: '서울고등학교', region: '서울특별시', kind: '고등학교' }])
assert.deepEqual(P.parseSchools({ RESULT: { CODE: 'INFO-200' } }), [])

console.log('neis_test: 모두 통과')
