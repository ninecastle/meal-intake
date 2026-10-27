// firestore.rules v3 테스트(@firebase/rules-unit-testing + node:test).
// 실행: firestore-tests 폴더에서 `npm test` (Firestore 에뮬레이터를 띄워 실행, JDK 21+ 필요, firebase-tools 15 기준).
// 이미 에뮬레이터가 떠 있으면 `npm run test:running`.
// 실제 프로젝트는 건드리지 않는다(demo- 프로젝트 ID). AI 호출 없음.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const MEAL = 'users/alice/meals/m1'

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-meal-intake',
    firestore: {
      rules: RULES,
      ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { host: '127.0.0.1', port: 8080 }),
    },
  })
})
after(async () => {
  await env?.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
})

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const alice = () => db('alice')

function beforeAnalysis() {
  return {
    items: [{ id: 'f1', name: '비빔밥', location: '가운데', before_grams: 450, confidence: 0.8 }],
    warnings: [],
    model: 'gemini-3.5-flash-lite',
    prompt_version: 'before-v1',
  }
}

function analysis({ items = 1, kcal = 520 } = {}) {
  const item = (i) => ({
    id: `f${i}`,
    name: '비빔밥',
    db_food_code: null,
    eaters: 1,
    before_grams: 450,
    remaining_ratio: 0.2,
    consumed_grams: 360,
    nutrition_source: 'ai_estimate',
    consumed: { kcal: 520, carbs_g: 80, protein_g: 15, fat_g: 12 },
    kcal_overridden: false,
    confidence: 0.7,
    needs_review: false,
  })
  return {
    items: Array.from({ length: items }, (_, i) => item(i + 1)),
    totals: { before_kcal: 650, consumed: { kcal, carbs_g: 80, protein_g: 15, fat_g: 12 } },
    warnings: [],
    model: 'gemini-3.5-flash-lite',
    prompt_version: 'after-v1',
  }
}

const awaitingDoc = (extra = {}) => ({
  dateKey: '2026-10-27',
  mealType: 'lunch',
  status: 'awaiting_after',
  beforeAnalysis: beforeAnalysis(),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
})

const doneDoc = (a = analysis(), extra = {}) => ({
  dateKey: '2026-10-27',
  mealType: 'lunch',
  status: 'done',
  analysis: a,
  consumedKcal: a.totals.consumed.kcal,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
})

const reviewFields = (a = analysis()) => ({
  status: 'needs_review',
  analysis: a,
  consumedKcal: a.totals.consumed.kcal,
  updatedAt: serverTimestamp(),
})

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

describe('본인 허용', () => {
  test('정상 흐름: 생성(awaiting_after) → needs_review → done → 읽기 → 삭제', async () => {
    const ref = doc(alice(), MEAL)
    await assertSucceeds(setDoc(ref, awaitingDoc()))
    await assertSucceeds(updateDoc(ref, reviewFields()))
    await assertSucceeds(updateDoc(ref, { ...reviewFields(), status: 'done' }))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(deleteDoc(ref))
  })

  test('awaiting_after → done 바로 저장', async () => {
    await seed(MEAL, awaitingDoc())
    await assertSucceeds(updateDoc(doc(alice(), MEAL), { ...reviewFields(), status: 'done' }))
  })

  test('직접 입력: 없음 → done 생성', async () => {
    await assertSucceeds(setDoc(doc(alice(), MEAL), doneDoc()))
  })

  test('대기 목록·전체 목록 쿼리', async () => {
    await seed(MEAL, awaitingDoc())
    const col = collection(alice(), 'users/alice/meals')
    await assertSucceeds(getDocs(query(col, where('status', 'in', ['awaiting_after', 'needs_review']))))
    await assertSucceeds(getDocs(col))
  })

  test('어느 상태든 삭제', async () => {
    await seed(MEAL, doneDoc())
    await assertSucceeds(deleteDoc(doc(alice(), MEAL)))
  })

  test('항목 30개 허용', async () => {
    await assertSucceeds(setDoc(doc(alice(), MEAL), doneDoc(analysis({ items: 30 }))))
  })
})

describe('다른 사용자·미로그인 거부', () => {
  test('다른 uid: 읽기·목록·생성·수정·삭제 거부', async () => {
    await seed(MEAL, awaitingDoc())
    const bob = db('bob')
    await assertFails(getDoc(doc(bob, MEAL)))
    await assertFails(getDocs(collection(bob, 'users/alice/meals')))
    await assertFails(setDoc(doc(bob, 'users/alice/meals/m2'), awaitingDoc()))
    await assertFails(updateDoc(doc(bob, MEAL), reviewFields()))
    await assertFails(deleteDoc(doc(bob, MEAL)))
  })

  test('미로그인: 읽기·생성·삭제 거부', async () => {
    await seed(MEAL, awaitingDoc())
    const anon = db(null)
    await assertFails(getDoc(doc(anon, MEAL)))
    await assertFails(setDoc(doc(anon, 'users/alice/meals/m2'), awaitingDoc()))
    await assertFails(deleteDoc(doc(anon, MEAL)))
  })

  test('users/{uid} 문서와 goals: 목표 형식이 아닌 쓰기 거부(v3부터 본인 읽기는 허용)', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { timezone: 'Asia/Seoul' }))
    await assertFails(setDoc(doc(alice(), 'users/alice/goals/2026-10-27'), { kcal: 2000 }))
  })
})

describe('형식 검사', () => {
  test('허용 안 된 키(photo) 거부', async () => {
    await assertFails(setDoc(doc(alice(), MEAL), awaitingDoc({ photo: 'data:image/jpeg;base64,AAAA' })))
  })

  test('analysis·beforeAnalysis 안의 사진 키 거부', async () => {
    const a = { ...analysis(), image: 'data:image/jpeg;base64,AAAA' }
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(a)))
    const b = { ...beforeAnalysis(), thumbnail: 'AAAA' }
    await assertFails(setDoc(doc(alice(), MEAL), awaitingDoc({ beforeAnalysis: b })))
  })

  test('잘못된 전이 거부: done → awaiting_after, needs_review로 생성', async () => {
    await seed(MEAL, doneDoc(analysis(), { beforeAnalysis: beforeAnalysis() }))
    const ref = doc(alice(), MEAL)
    await assertFails(updateDoc(ref, { status: 'awaiting_after', updatedAt: serverTimestamp(), editedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), 'users/alice/meals/m2'), { ...doneDoc(), status: 'needs_review' }))
  })

  test('consumedKcal 불일치·범위 밖 거부', async () => {
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(analysis({ kcal: 520 }), { consumedKcal: 999 })))
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(analysis({ kcal: 10001 }))))
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(analysis({ kcal: -1 }))))
  })

  test('항목 31개 거부', async () => {
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(analysis({ items: 31 }))))
  })

  test('열거값·dateKey 형식·필수 필드·createdAt 변경 거부', async () => {
    await assertFails(setDoc(doc(alice(), MEAL), awaitingDoc({ mealType: 'brunch' })))
    await assertFails(setDoc(doc(alice(), MEAL), awaitingDoc({ status: 'deleted' })))
    await assertFails(setDoc(doc(alice(), MEAL), awaitingDoc({ dateKey: '2026-1-27' })))
    const { beforeAnalysis: _omit, ...noBefore } = awaitingDoc()
    await assertFails(setDoc(doc(alice(), MEAL), noBefore))
    await seed(MEAL, awaitingDoc())
    await assertFails(
      updateDoc(doc(alice(), MEAL), { ...reviewFields(), createdAt: new Date('2020-01-01') }),
    )
  })
})

describe('저장한 기록 수정(M16, done → done)', () => {
  const editFields = (a = analysis({ kcal: 300 }), extra = {}) => ({
    dateKey: '2026-10-26',
    mealType: 'dinner',
    status: 'done',
    analysis: a,
    consumedKcal: a.totals.consumed.kcal,
    updatedAt: serverTimestamp(),
    editedAt: serverTimestamp(),
    ...extra,
  })
  const seedDone = () => seed(MEAL, doneDoc(analysis(), { beforeAnalysis: beforeAnalysis() }))

  test('정상 수정: dateKey·mealType·analysis 변경 허용, 다시 수정해도 허용', async () => {
    await seedDone()
    const ref = doc(alice(), MEAL)
    await assertSucceeds(updateDoc(ref, editFields()))
    await assertSucceeds(updateDoc(ref, editFields(analysis({ kcal: 410 }), { mealType: 'snack' })))
  })

  test('잘못된 값으로 수정 거부: consumedKcal 불일치, dateKey 형식, 사진 키', async () => {
    await seedDone()
    const ref = doc(alice(), MEAL)
    await assertFails(updateDoc(ref, editFields(analysis({ kcal: 300 }), { consumedKcal: 999 })))
    await assertFails(updateDoc(ref, editFields(undefined, { dateKey: '2026-10-6' })))
    await assertFails(updateDoc(ref, editFields(undefined, { photo: 'data:image/jpeg;base64,AAAA' })))
  })

  test('done → needs_review 거부', async () => {
    await seedDone()
    await assertFails(updateDoc(doc(alice(), MEAL), editFields(undefined, { status: 'needs_review' })))
  })

  test('수정할 때 createdAt 변경 거부', async () => {
    await seedDone()
    await assertFails(updateDoc(doc(alice(), MEAL), editFields(undefined, { createdAt: new Date('2020-01-01') })))
  })

  test('editedAt이 request.time이 아니거나 없으면 거부', async () => {
    await seedDone()
    const ref = doc(alice(), MEAL)
    await assertFails(updateDoc(ref, editFields(undefined, { editedAt: new Date('2026-10-27T12:00:00Z') })))
    const { editedAt: _omit, ...noEdited } = editFields()
    await assertFails(updateDoc(ref, noEdited))
  })

  test('수정이 아닌 쓰기에 editedAt 넣으면 거부: 생성, awaiting_after → needs_review', async () => {
    await assertFails(setDoc(doc(alice(), MEAL), doneDoc(analysis(), { editedAt: serverTimestamp() })))
    await assertFails(setDoc(doc(alice(), 'users/alice/meals/m2'), awaitingDoc({ editedAt: serverTimestamp() })))
    const m3 = doc(alice(), 'users/alice/meals/m3')
    await seed('users/alice/meals/m3', awaitingDoc())
    await assertFails(updateDoc(m3, { ...reviewFields(), editedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(m3, reviewFields()))
  })
})

describe('목표 설정(users/{uid}.goal, goals/{dateKey}, 스펙 4.7절)', () => {
  const DAY = '2026-10-27'
  const USER = 'users/alice'
  const goalInput = (extra = {}) => ({
    sex: 'male', age: 30, height_cm: 175, weight_kg: 70, activity: 'moderate', goal: 'lose', ...extra,
  })
  const goalResult = () => ({
    bmr: 1650, tdee: 2560, target_kcal: 2060, macros: { carbs_g: 283, protein_g: 103, fat_g: 57 },
    goal_applied: 'lose', clamped: false, minor: false, formula: 'mifflin-st-jeor',
  })
  const goalTargets = (extra = {}) => ({
    target_kcal: 2060, carbs_g: 283, protein_g: 103, fat_g: 57, source: 'recommended', ...extra,
  })
  const userDoc = ({ input = {}, override = null, targets = {}, goal = {}, top = {} } = {}) => ({
    goal: {
      input: goalInput(input), override, result: goalResult(), targets: goalTargets(targets),
      updatedAt: serverTimestamp(), ...goal,
    },
    ...top,
  })
  const datedDoc = (dateKey = DAY, extra = {}) => ({
    dateKey, targets: goalTargets(), updatedAt: serverTimestamp(), ...extra,
  })
  const goalPath = (id) => USER + '/goals/' + id
  /** saveGoal과 같은 모양: users/{uid}(mergeFields goal) + goals/{dateKey}를 한 배치로 */
  const saveBatch = (fs, { user = userDoc(), dated = datedDoc(), id = DAY } = {}) => {
    const b = writeBatch(fs)
    b.set(doc(fs, USER), user, { mergeFields: ['goal'] })
    b.set(doc(fs, goalPath(id)), dated)
    return b.commit()
  }
  const setUser = (data) => setDoc(doc(alice(), USER), data, { mergeFields: ['goal'] })
  const setDated = (id, data) => setDoc(doc(alice(), goalPath(id)), data)

  test('본인 배치 저장(두 문서)·다시 저장·읽기 허용, 다시 저장하면 지난 override 키가 남지 않음', async () => {
    const fs = alice()
    const t = { target_kcal: 2300, fat_g: 70, source: 'custom' }
    const custom = userDoc({ override: { target_kcal: 2300, fat_g: 70 }, targets: t })
    await assertSucceeds(saveBatch(fs, { user: custom, dated: datedDoc(DAY, { targets: goalTargets(t) }) }))
    await assertSucceeds(saveBatch(fs, { user: userDoc({ override: { carbs_g: 250 } }) }))
    const s = await assertSucceeds(getDoc(doc(fs, USER)))
    assert.deepEqual(s.data().goal.override, { carbs_g: 250 })
    await assertSucceeds(getDoc(doc(fs, goalPath(DAY))))
  })

  test('남의 uid·미로그인: 쓰기·읽기·목록 거부', async () => {
    await seed(USER, userDoc())
    await seed(goalPath(DAY), datedDoc())
    for (const fs of [db('bob'), db(null)]) {
      await assertFails(saveBatch(fs))
      await assertFails(setDoc(doc(fs, goalPath('2026-10-28')), datedDoc('2026-10-28')))
      await assertFails(getDoc(doc(fs, USER)))
      await assertFails(getDoc(doc(fs, goalPath(DAY))))
      await assertFails(getDocs(collection(fs, USER + '/goals')))
    }
  })

  test('나이 범위 밖·정수 아님 거부(14·100은 허용)', async () => {
    for (const age of [13, 101, 30.5, '30']) await assertFails(setUser(userDoc({ input: { age } })))
    await assertSucceeds(setUser(userDoc({ input: { age: 14, goal: 'maintain' } })))
    await assertSucceeds(setUser(userDoc({ input: { age: 100 } })))
  })

  test('만 18세 미만 + lose·gain 거부, + maintain 허용', async () => {
    await assertFails(setUser(userDoc({ input: { age: 17, goal: 'lose' } })))
    await assertFails(setUser(userDoc({ input: { age: 17, goal: 'gain' } })))
    await assertSucceeds(setUser(userDoc({ input: { age: 17, goal: 'maintain' } })))
  })

  test('target_kcal 6001·299 거부(두 문서 모두), 300·6000 허용', async () => {
    for (const target_kcal of [6001, 299]) {
      await assertFails(setUser(userDoc({ targets: { target_kcal } })))
      await assertFails(setDated(DAY, datedDoc(DAY, { targets: goalTargets({ target_kcal }) })))
    }
    await assertSucceeds(setDated(DAY, datedDoc(DAY, { targets: goalTargets({ target_kcal: 300 }) })))
    await assertSucceeds(setUser(userDoc({ targets: { target_kcal: 6000 } })))
  })

  test('열거값·범위 오류 거부: sex, activity, goal, height·weight, 탄단지 0~1000, source', async () => {
    const bad = [
      { input: { sex: 'other' } }, { input: { activity: 'extreme' } }, { input: { goal: 'bulk' } },
      { input: { height_cm: 119 } }, { input: { weight_kg: 251 } },
      { targets: { carbs_g: 1001 } }, { targets: { fat_g: -1 } }, { targets: { source: 'auto' } },
    ]
    for (const b of bad) await assertFails(setUser(userDoc(b)))
  })

  test('추가 키·빠진 키 거부: 문서·goal·input·targets·override·goals 문서', async () => {
    await assertFails(setDoc(doc(alice(), USER), userDoc({ top: { timezone: 'Asia/Seoul' } })))
    await assertFails(setUser(userDoc({ goal: { photo: 'data:image/jpeg;base64,AAAA' } })))
    await assertFails(setUser(userDoc({ input: { name: 'alice' } })))
    await assertFails(setUser(userDoc({ targets: { kcal: 2000 } })))
    await assertFails(setUser(userDoc({ override: { sugar_g: 10 } })))
    const { override: _omit, ...noOverride } = userDoc().goal
    await assertFails(setUser({ goal: noOverride }))
    await assertFails(setDated(DAY, datedDoc(DAY, { input: goalInput() })))
    const { source: _s, ...noSource } = goalTargets()
    await assertFails(setDated(DAY, datedDoc(DAY, { targets: noSource })))
  })

  test('updatedAt이 request.time이 아니면 거부(두 문서)', async () => {
    const t = new Date('2026-10-27T12:00:00Z')
    await assertFails(setUser(userDoc({ goal: { updatedAt: t } })))
    await assertFails(setDated(DAY, datedDoc(DAY, { updatedAt: t })))
  })

  test('goals: 문서 id와 dateKey 불일치 거부, 배치 하나가 틀리면 둘 다 거부', async () => {
    await assertFails(setDated(DAY, datedDoc('2026-10-28')))
    await assertFails(saveBatch(alice(), { id: '2026-10-28' }))
    const s = await getDoc(doc(alice(), USER))
    assert.equal(s.exists(), false)
  })

  test('goals: 잘못된 dateKey 형식 거부', async () => {
    for (const k of ['2026-10-6', '20261027', '2026-10-27x']) await assertFails(setDated(k, datedDoc(k)))
  })

  test('본인 dateKey <= D 쿼리(desc, limit 1) 허용, 가장 늦은 기록을 고른다', async () => {
    for (const k of ['2026-10-20', '2026-10-25', '2026-10-30']) await seed(goalPath(k), datedDoc(k))
    const q = query(collection(alice(), USER + '/goals'), where('dateKey', '<=', DAY), orderBy('dateKey', 'desc'), limit(1))
    const snap = await assertSucceeds(getDocs(q))
    assert.deepEqual(snap.docs.map((d) => d.id), ['2026-10-25'])
  })

  test('삭제 거부(users/{uid}, goals)', async () => {
    await seed(USER, userDoc())
    await seed(goalPath(DAY), datedDoc())
    await assertFails(deleteDoc(doc(alice(), USER)))
    await assertFails(deleteDoc(doc(alice(), goalPath(DAY))))
  })
})

describe('달력·주간 추이 조회(3단계 조각 3-1, 스펙 4.7절 "달력")', () => {
  const mealPath = (id) => 'users/alice/meals/' + id
  const goalPath = (id) => 'users/alice/goals/' + id
  const targets = () => ({ target_kcal: 2060, carbs_g: 283, protein_g: 103, fat_g: 57, source: 'recommended' })
  /** subscribeDaysInRange와 같은 쿼리: dateKey 범위 조건 두 개, orderBy·status 조건 없음 */
  const rangeQuery = (fs, uid, start, end) =>
    query(collection(fs, 'users/' + uid + '/meals'), where('dateKey', '>=', start), where('dateKey', '<=', end))
  /** subscribeGoalsUpTo와 같은 쿼리: dateKey <= end, 오름차순 */
  const goalsUpTo = (fs, uid, end) =>
    query(collection(fs, 'users/' + uid + '/goals'), where('dateKey', '<=', end), orderBy('dateKey'))

  test('본인 meals 범위 쿼리 허용: 양 끝 포함, 범위 밖 제외, 상태는 거르지 않음(done은 클라이언트가 거름)', async () => {
    await seed(mealPath('a'), doneDoc(analysis(), { dateKey: '2026-09-30' }))
    await seed(mealPath('b'), doneDoc(analysis(), { dateKey: '2026-10-01' }))
    await seed(mealPath('c'), awaitingDoc({ dateKey: '2026-10-15' }))
    await seed(mealPath('d'), doneDoc(analysis(), { dateKey: '2026-10-31' }))
    await seed(mealPath('e'), doneDoc(analysis(), { dateKey: '2026-11-01' }))
    const snap = await assertSucceeds(getDocs(rangeQuery(alice(), 'alice', '2026-10-01', '2026-10-31')))
    assert.deepEqual(snap.docs.map((d) => d.id).sort(), ['b', 'c', 'd'])
  })

  test('남의 uid·미로그인 meals 범위 쿼리 거부', async () => {
    await seed(mealPath('b'), doneDoc(analysis(), { dateKey: '2026-10-01' }))
    await assertFails(getDocs(rangeQuery(db('bob'), 'alice', '2026-10-01', '2026-10-31')))
    await assertFails(getDocs(rangeQuery(db(), 'alice', '2026-10-01', '2026-10-31')))
  })

  test('본인 goals dateKey <= end 오름차순 쿼리 허용: 끝 날짜 포함, 그 뒤 제외, 그달 1일 전 목표 포함', async () => {
    for (const k of ['2026-10-25', '2026-09-10', '2026-10-31', '2026-11-02']) {
      await seed(goalPath(k), { dateKey: k, targets: targets(), updatedAt: serverTimestamp() })
    }
    const snap = await assertSucceeds(getDocs(goalsUpTo(alice(), 'alice', '2026-10-31')))
    assert.deepEqual(snap.docs.map((d) => d.data().dateKey), ['2026-09-10', '2026-10-25', '2026-10-31'])
  })

  test('남의 uid·미로그인 goals 쿼리 거부', async () => {
    await seed(goalPath('2026-10-25'), { dateKey: '2026-10-25', targets: targets(), updatedAt: serverTimestamp() })
    await assertFails(getDocs(goalsUpTo(db('bob'), 'alice', '2026-10-31')))
    await assertFails(getDocs(goalsUpTo(db(), 'alice', '2026-10-31')))
  })
})

describe('하루 문서 공복 표시(users/{uid}/days/{dateKey}, 디자인 조각 D2-B)', () => {
  const KEY = '2026-10-27'
  const dayPath = (uid = 'alice', key = KEY) => `users/${uid}/days/${key}`
  /** web/src/data/fasting.ts와 같은 쓰기: merge setDoc + arrayUnion/arrayRemove + serverTimestamp */
  const write = (fs, op, path = dayPath(), key = KEY) =>
    setDoc(doc(fs, path), { dateKey: key, fasted: op, updatedAt: serverTimestamp() }, { merge: true })
  const mark = (fs, meal, path, key) => write(fs, arrayUnion(meal), path, key)
  const unmark = (fs, meal, path, key) => write(fs, arrayRemove(meal), path, key)
  const seedDay = (fasted = ['lunch']) => seed(dayPath(), { dateKey: KEY, fasted, updatedAt: serverTimestamp() })

  test('본인: 생성(추가) → 추가 → 같은 끼니 다시 추가 → 빼기 → 읽기 → 삭제', async () => {
    const fs = alice()
    await assertSucceeds(mark(fs, 'breakfast'))
    await assertSucceeds(mark(fs, 'lunch'))
    await assertSucceeds(mark(fs, 'lunch'))
    await assertSucceeds(unmark(fs, 'breakfast'))
    const snap = await assertSucceeds(getDoc(doc(fs, dayPath())))
    assert.deepEqual(snap.data().fasted, ['lunch'])
    assert.equal(snap.data().dateKey, KEY)
    assert.deepEqual(Object.keys(snap.data()).sort(), ['dateKey', 'fasted', 'updatedAt'])
    await assertSucceeds(deleteDoc(doc(fs, dayPath())))
  })

  test('본인: 없는 문서에 빼기(빈 목록으로 생성), 네 끼니 모두 표시', async () => {
    const fs = alice()
    await assertSucceeds(unmark(fs, 'dinner'))
    assert.deepEqual((await getDoc(doc(fs, dayPath()))).data().fasted, [])
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack']) await assertSucceeds(mark(fs, m))
    assert.equal((await getDoc(doc(fs, dayPath()))).data().fasted.length, 4)
  })

  test('남의 uid: 읽기·생성·수정·삭제 거부', async () => {
    await seedDay()
    const bob = db('bob')
    await assertFails(getDoc(doc(bob, dayPath())))
    await assertFails(mark(bob, 'dinner'))
    await assertFails(mark(bob, 'dinner', dayPath('alice', '2026-10-28'), '2026-10-28'))
    await assertFails(deleteDoc(doc(bob, dayPath())))
  })

  test('미로그인: 읽기·생성·수정·삭제 거부', async () => {
    await seedDay()
    const anon = db(null)
    await assertFails(getDoc(doc(anon, dayPath())))
    await assertFails(mark(anon, 'dinner'))
    await assertFails(mark(anon, 'dinner', dayPath('alice', '2026-10-28'), '2026-10-28'))
    await assertFails(deleteDoc(doc(anon, dayPath())))
  })

  test('모르는 필드 거부(생성·병합 수정)', async () => {
    await assertFails(
      setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: [], updatedAt: serverTimestamp(), weight_kg: 60 }),
    )
    await seedDay()
    await assertFails(
      setDoc(doc(alice(), dayPath()), { dateKey: KEY, updatedAt: serverTimestamp(), photo: 'data:image/jpeg;base64,AAAA' }, { merge: true }),
    )
  })

  test('잘못된 끼니 값·목록이 아닌 fasted 거부', async () => {
    await assertFails(mark(alice(), 'brunch'))
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: 'lunch', updatedAt: serverTimestamp() }))
    await seedDay()
    await assertFails(mark(alice(), 'Lunch'))
  })

  test('5개 이상·중복 목록 거부', async () => {
    const full = ['breakfast', 'lunch', 'dinner', 'snack']
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: [...full, 'snack'], updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: ['lunch', 'lunch'], updatedAt: serverTimestamp() }))
  })

  test('dateKey 불일치·빠짐·형식 오류 거부', async () => {
    await assertFails(mark(alice(), 'lunch', dayPath(), '2026-10-28'))
    await assertFails(setDoc(doc(alice(), dayPath()), { fasted: [], updatedAt: serverTimestamp() }))
    for (const bad of ['2026-1027', '26-10-27', '2026-10-27x', '20261027']) {
      await assertFails(mark(alice(), 'lunch', dayPath('alice', bad), bad))
    }
    await seedDay()
    await assertFails(mark(alice(), 'dinner', dayPath(), '2026-10-26'))
  })

  test('updatedAt 위조·빠짐 거부', async () => {
    const fake = Timestamp.fromDate(new Date('2026-10-27T00:00:00Z'))
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: arrayUnion('lunch'), updatedAt: fake }, { merge: true }))
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: ['lunch'] }))
    await seedDay()
    // 옛 updatedAt이 그대로 남는 병합 쓰기
    await assertFails(setDoc(doc(alice(), dayPath()), { dateKey: KEY, fasted: arrayUnion('dinner') }, { merge: true }))
  })
})
