// firestore.rules v9 테스트(@firebase/rules-unit-testing + node:test).
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
  Bytes,
  collection,
  deleteDoc,
  deleteField,
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

  describe('설정 prefs(users/{uid}.prefs, 규칙 v6)', () => {
    /** 클라이언트 쓰기(리더 계약): setDoc(userRef, { prefs }, { merge: true }) */
    const setPrefs = (fs, prefs, top = {}) => setDoc(doc(fs, USER), { prefs, ...top }, { merge: true })
    const readUser = async () => (await getDoc(doc(alice(), USER))).data()

    test('본인: 목표 없이 prefs만 생성 → 읽기, true/false 바꾸기, 삭제는 거부', async () => {
      await assertSucceeds(setPrefs(alice(), { shareEaters: true }))
      assert.deepEqual(await readUser(), { prefs: { shareEaters: true } })
      await assertSucceeds(setPrefs(alice(), { shareEaters: false }))
      assert.deepEqual(await readUser(), { prefs: { shareEaters: false } })
      await assertSucceeds(setPrefs(alice(), { shareEaters: true }))
      assert.deepEqual(await readUser(), { prefs: { shareEaters: true } })
      await assertFails(deleteDoc(doc(alice(), USER)))
    })

    test('본인: 목표 있는 문서에 merge로 prefs 추가, goal은 그대로', async () => {
      await assertSucceeds(saveBatch(alice()))
      const before = (await readUser()).goal
      await assertSucceeds(setPrefs(alice(), { shareEaters: true }))
      const data = await readUser()
      assert.deepEqual(Object.keys(data).sort(), ['goal', 'prefs'])
      assert.deepEqual(data.prefs, { shareEaters: true })
      assert.deepEqual(data.goal.targets, before.targets)
      assert.ok(data.goal.updatedAt.isEqual(before.updatedAt))
      await assertSucceeds(setPrefs(alice(), { shareEaters: false }))
      assert.deepEqual((await readUser()).prefs, { shareEaters: false })
    })

    test('본인: prefs 있는 문서에 목표 저장(mergeFields goal 배치)·다시 저장, prefs는 그대로', async () => {
      await assertSucceeds(setPrefs(alice(), { shareEaters: true }))
      await assertSucceeds(saveBatch(alice()))
      const data = await readUser()
      assert.deepEqual(Object.keys(data).sort(), ['goal', 'prefs'])
      assert.deepEqual(data.prefs, { shareEaters: true })
      await assertSucceeds(saveBatch(alice(), { user: userDoc({ override: { carbs_g: 250 } }) }))
      const again = await readUser()
      assert.deepEqual(again.goal.override, { carbs_g: 250 })
      assert.deepEqual(again.prefs, { shareEaters: true })
    })

    test('설정만 쓸 때 기존 goal은 다시 검사하지 않지만, goal을 건드리면 검사한다', async () => {
      await assertSucceeds(saveBatch(alice()))
      // goal 일부만 병합으로 바꾸면 updatedAt이 지난 시각 그대로라 거부
      await assertFails(setDoc(doc(alice(), USER), { goal: { override: { carbs_g: 1 } } }, { merge: true }))
      // prefs와 함께 틀린 goal을 쓰면 거부
      await assertFails(setPrefs(alice(), { shareEaters: true }, { goal: userDoc({ input: { age: 13 } }).goal }))
      assert.equal((await readUser()).prefs, undefined)
    })

    test('남의 uid·미로그인: prefs 생성·수정·읽기 거부', async () => {
      for (const fs of [db('bob'), db(null)]) await assertFails(setPrefs(fs, { shareEaters: true }))
      await seed(USER, { prefs: { shareEaters: false } })
      for (const fs of [db('bob'), db(null)]) {
        await assertFails(setPrefs(fs, { shareEaters: true }))
        await assertFails(getDoc(doc(fs, USER)))
      }
      assert.deepEqual(await readUser(), { prefs: { shareEaters: false } })
    })

    test('prefs에 모르는 키 거부(생성·병합 수정)', async () => {
      for (const bad of [{ shareEaters: true, theme: 'dark' }, { share_eaters: true }, { photo: 'data:image/jpeg;base64,AAAA' }]) {
        await assertFails(setPrefs(alice(), bad))
      }
      await seed(USER, { prefs: { shareEaters: true } })
      await assertFails(setPrefs(alice(), { theme: 'dark' }))
      assert.deepEqual((await readUser()).prefs, { shareEaters: true })
    })

    test('shareEaters가 bool이 아님 거부: 문자열·숫자·null·map·목록', async () => {
      for (const v of ['true', 'false', '', 1, 0, null, { on: true }, [true]]) {
        await assertFails(setPrefs(alice(), { shareEaters: v }))
      }
      await seed(USER, { prefs: { shareEaters: false } })
      await assertFails(setPrefs(alice(), { shareEaters: 'true' }))
      await assertFails(setPrefs(alice(), { shareEaters: 1 }))
    })

    test('prefs가 map이 아님 거부', async () => {
      for (const bad of [true, false, 'on', 1, null, ['shareEaters']]) {
        await assertFails(setPrefs(alice(), bad))
      }
      await seed(USER, { prefs: { shareEaters: true } })
      await assertFails(setPrefs(alice(), false))
    })

    test('모르는 최상위 키 거부(prefs와 함께·병합으로 추가·목표와 함께)', async () => {
      await assertFails(setPrefs(alice(), { shareEaters: true }, { theme: 'dark' }))
      await assertFails(setPrefs(alice(), { shareEaters: true }, { thumbnail: 'data:image/jpeg;base64,AAAA' }))
      await seed(USER, { prefs: { shareEaters: true } })
      await assertFails(setDoc(doc(alice(), USER), { timezone: 'Asia/Seoul' }, { merge: true }))
      await assertFails(setDoc(doc(alice(), USER), userDoc({ top: { prefs: { shareEaters: true }, timezone: 'Asia/Seoul' } })))
      assert.deepEqual(await readUser(), { prefs: { shareEaters: true } })
    })
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

  test('v11 자동 공복: fastAuto true와 함께 공복 병합, 기록 저장 때 updateDoc으로 빼기, fastAuto는 bool만', async () => {
    const fs = alice()
    await assertSucceeds(setDoc(doc(fs, dayPath()), { dateKey: KEY, fastAuto: true, fasted: arrayUnion('breakfast', 'dinner'), updatedAt: serverTimestamp() }, { merge: true }))
    await assertSucceeds(setDoc(doc(fs, dayPath()), { dateKey: KEY, fastAuto: true, updatedAt: serverTimestamp() }, { merge: true }))
    await assertSucceeds(updateDoc(doc(fs, dayPath()), { fasted: arrayRemove('dinner'), updatedAt: serverTimestamp() }))
    const d = (await getDoc(doc(fs, dayPath()))).data()
    assert.deepEqual(d.fasted, ['breakfast'])
    assert.equal(d.fastAuto, true)
    await assertFails(setDoc(doc(fs, dayPath()), { dateKey: KEY, fastAuto: 'yes', updatedAt: serverTimestamp() }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), dayPath()), { dateKey: KEY, fastAuto: true, updatedAt: serverTimestamp() }, { merge: true }))
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

describe('하루 문서 끼니별 먹은 시간(mealTimes, 규칙 v5, 디자인 조각 D3)', () => {
  const KEY = '2026-10-27'
  const dayPath = (uid = 'alice', key = KEY) => `users/${uid}/days/${key}`
  /** 클라이언트 쓰기(리더 계약): merge setDoc + serverTimestamp. 병합 결과 전체를 규칙이 검사한다. */
  const setTimes = (fs, mealTimes, path = dayPath(), key = KEY) =>
    setDoc(doc(fs, path), { dateKey: key, mealTimes, updatedAt: serverTimestamp() }, { merge: true })
  const seedDay = (extra = { mealTimes: { lunch: '12:40' } }) =>
    seed(dayPath(), { dateKey: KEY, updatedAt: serverTimestamp(), ...extra })
  const readDay = async (fs = alice()) => (await getDoc(doc(fs, dayPath()))).data()

  test('본인: 한 끼 생성 → 읽기 → 삭제', async () => {
    const fs = alice()
    await assertSucceeds(setTimes(fs, { lunch: '12:40' }))
    const data = await readDay(fs)
    assert.deepEqual(data.mealTimes, { lunch: '12:40' })
    assert.deepEqual(Object.keys(data).sort(), ['dateKey', 'mealTimes', 'updatedAt'])
    await assertSucceeds(deleteDoc(doc(fs, dayPath())))
  })

  test('본인: 네 끼 한 번에, 경계값 00:00·23:59·09:05·20:30', async () => {
    const all = { breakfast: '00:00', lunch: '09:05', dinner: '20:30', snack: '23:59' }
    await assertSucceeds(setTimes(alice(), all))
    assert.deepEqual((await readDay()).mealTimes, all)
  })

  test('본인: fasted와 함께(한 쓰기에 둘 다, 공복 표시 문서에 시각 병합)', async () => {
    const fs = alice()
    await assertSucceeds(
      setDoc(doc(fs, dayPath()), { dateKey: KEY, fasted: arrayUnion('breakfast'), mealTimes: { lunch: '12:40' }, updatedAt: serverTimestamp() }, { merge: true }),
    )
    await assertSucceeds(setTimes(fs, { dinner: '19:05' }))
    // 공복 표시 쓰기(mealTimes 없이)도 그대로 된다
    await assertSucceeds(setDoc(doc(fs, dayPath()), { dateKey: KEY, fasted: arrayUnion('snack'), updatedAt: serverTimestamp() }, { merge: true }))
    const data = await readDay(fs)
    assert.deepEqual(data.fasted, ['breakfast', 'snack'])
    assert.deepEqual(data.mealTimes, { lunch: '12:40', dinner: '19:05' })
    assert.deepEqual(Object.keys(data).sort(), ['dateKey', 'fasted', 'mealTimes', 'updatedAt'])
  })

  test('본인: 기존 문서에 merge로 다른 끼니 추가, 같은 끼니 시각 바꾸기', async () => {
    await seedDay({ fasted: ['snack'], mealTimes: { lunch: '12:40' } })
    const fs = alice()
    await assertSucceeds(setTimes(fs, { dinner: '19:05' }))
    assert.deepEqual((await readDay(fs)).mealTimes, { lunch: '12:40', dinner: '19:05' })
    await assertSucceeds(setTimes(fs, { lunch: '13:15' }))
    const data = await readDay(fs)
    assert.deepEqual(data.mealTimes, { lunch: '13:15', dinner: '19:05' })
    assert.deepEqual(data.fasted, ['snack'])
  })

  test('남의 uid·미로그인: 생성·수정 거부', async () => {
    for (const other of [db('bob'), db(null)]) {
      await assertFails(setTimes(other, { lunch: '12:40' }, dayPath('alice', '2026-10-28'), '2026-10-28'))
    }
    await seedDay()
    for (const other of [db('bob'), db(null)]) {
      await assertFails(setTimes(other, { dinner: '19:05' }))
      await assertFails(getDoc(doc(other, dayPath())))
    }
  })

  test('모르는 끼니 키 거부(생성·병합 수정)', async () => {
    for (const bad of [{ brunch: '10:00' }, { Lunch: '12:40' }, { lunch: '12:40', late_night: '23:30' }]) {
      await assertFails(setTimes(alice(), bad))
    }
    await seedDay()
    await assertFails(setTimes(alice(), { brunch: '10:00' }))
  })

  test('형식이 틀린 시각 거부: 24:00·7:05·12:60 등', async () => {
    for (const bad of ['24:00', '7:05', '12:60', '12:4', '12:40:00', ' 12:40', '12:40 ', '1240', '12-40', '오후 12:40', '']) {
      await assertFails(setTimes(alice(), { lunch: bad }))
    }
    await seedDay()
    await assertFails(setTimes(alice(), { dinner: '24:00' }))
  })

  test('문자열이 아닌 값 거부: 숫자·map·목록·null·불리언·시각', async () => {
    const at = Timestamp.fromDate(new Date('2026-10-27T03:40:00Z'))
    for (const bad of [1240, 12.4, { h: 12, m: 40 }, ['12:40'], null, true, at]) {
      await assertFails(setTimes(alice(), { lunch: bad }))
    }
    await seedDay()
    await assertFails(setTimes(alice(), { dinner: 1905 }))
  })

  test('mealTimes가 map이 아님 거부', async () => {
    for (const bad of ['12:40', ['lunch', '12:40'], 1240, null, true]) {
      await assertFails(setTimes(alice(), bad))
    }
    await seedDay()
    await assertFails(setTimes(alice(), '19:05'))
  })

  test('키 5개 이상 거부(생성·병합으로 다섯째 키)', async () => {
    const all = { breakfast: '08:00', lunch: '12:40', dinner: '19:05', snack: '15:30' }
    await assertFails(setTimes(alice(), { ...all, brunch: '10:00' }))
    await seedDay({ mealTimes: all })
    await assertFails(setTimes(alice(), { midnight: '00:30' }))
    assert.deepEqual((await readDay()).mealTimes, all)
  })

  test('병합 결과 전체 검사: 기존 문서에 틀린 시각이 있으면 다른 끼니를 써도 거부', async () => {
    await seedDay({ mealTimes: { lunch: '25:00' } })
    await assertFails(setTimes(alice(), { dinner: '19:05' }))
    // 틀린 값을 올바른 값으로 덮어쓰면 허용
    await assertSucceeds(setTimes(alice(), { lunch: '12:40', dinner: '19:05' }))
  })
})

describe('체중 기록·목표 몸무게(규칙 v7, 디자인 조각 D6)', () => {
  const USER = 'users/alice'
  const wPath = (key, uid = 'alice') => `users/${uid}/weights/${key}`
  /** web/src/data/weights.ts와 같은 쓰기: setDoc 덮어쓰기 + serverTimestamp */
  const setW = (fs, key, kg, extra = {}) => setDoc(doc(fs, wPath(key)), { dateKey: key, kg, updatedAt: serverTimestamp(), ...extra })
  const readUser = async () => (await getDoc(doc(alice(), USER))).data()

  test('본인: 기록 → 같은 날 덮어쓰기 → 읽기 → 지우기, 경계값 30·250·소수', async () => {
    const fs = alice()
    await assertSucceeds(setW(fs, '2026-10-28', 58.4))
    await assertSucceeds(setW(fs, '2026-10-28', 58.1))
    const snap = await assertSucceeds(getDoc(doc(fs, wPath('2026-10-28'))))
    assert.equal(snap.data().kg, 58.1)
    assert.deepEqual(Object.keys(snap.data()).sort(), ['dateKey', 'kg', 'updatedAt'])
    await assertSucceeds(setW(fs, '2026-10-01', 30))
    await assertSucceeds(setW(fs, '2026-10-02', 250))
    await assertSucceeds(deleteDoc(doc(fs, wPath('2026-10-28'))))
  })

  test('지난 기록·최근 기록 조회(dateKey 범위 + 내림차순 + limit 1)', async () => {
    await seed(wPath('2026-10-20'), { dateKey: '2026-10-20', kg: 59, updatedAt: serverTimestamp() })
    await seed(wPath('2026-10-25'), { dateKey: '2026-10-25', kg: 58.7, updatedAt: serverTimestamp() })
    await seed(wPath('2026-10-28'), { dateKey: '2026-10-28', kg: 58.4, updatedAt: serverTimestamp() })
    const col = collection(alice(), 'users/alice/weights')
    const before = await assertSucceeds(getDocs(query(col, where('dateKey', '<', '2026-10-28'), orderBy('dateKey', 'desc'), limit(1))))
    assert.deepEqual(before.docs.map((d) => d.id), ['2026-10-25'])
    const latest = await assertSucceeds(getDocs(query(col, where('dateKey', '<=', '2026-10-28'), orderBy('dateKey', 'desc'), limit(1))))
    assert.deepEqual(latest.docs.map((d) => d.data().kg), [58.4])
  })

  test('남의 uid·미로그인: 읽기·쓰기·지우기·조회 거부', async () => {
    await seed(wPath('2026-10-28'), { dateKey: '2026-10-28', kg: 58.4, updatedAt: serverTimestamp() })
    for (const fs of [db('bob'), db(null)]) {
      await assertFails(getDoc(doc(fs, wPath('2026-10-28'))))
      await assertFails(setW(fs, '2026-10-28', 60))
      await assertFails(deleteDoc(doc(fs, wPath('2026-10-28'))))
      await assertFails(getDocs(query(collection(fs, 'users/alice/weights'), orderBy('dateKey', 'desc'), limit(1))))
    }
  })

  test('kg 범위·형식 거부: 29.9·250.1·0·음수·문자열·null·빠짐', async () => {
    for (const v of [29.9, 250.1, 0, -58, '58.4', null, { kg: 58 }]) {
      await assertFails(setW(alice(), '2026-10-28', v))
    }
    await assertFails(setDoc(doc(alice(), wPath('2026-10-28')), { dateKey: '2026-10-28', updatedAt: serverTimestamp() }))
  })

  test('dateKey 불일치·형식 오류·모르는 키·updatedAt 위조 거부', async () => {
    await assertFails(setDoc(doc(alice(), wPath('2026-10-28')), { dateKey: '2026-10-27', kg: 58, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), wPath('20261028')), { dateKey: '20261028', kg: 58, updatedAt: serverTimestamp() }))
    await assertFails(setW(alice(), '2026-10-28', 58, { photo: 'data:image/jpeg;base64,AAAA' }))
    await assertFails(setW(alice(), '2026-10-28', 58, { updatedAt: Timestamp.fromDate(new Date('2026-01-01')) }))
  })

  test('목표 몸무게 targetWeightKg: 본인 생성·바꾸기·지우기(deleteField), prefs와 함께', async () => {
    await assertSucceeds(setDoc(doc(alice(), USER), { targetWeightKg: 54 }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { shareEaters: true } }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { targetWeightKg: 54.5 }, { merge: true }))
    assert.deepEqual(await readUser(), { prefs: { shareEaters: true }, targetWeightKg: 54.5 })
    await assertSucceeds(setDoc(doc(alice(), USER), { targetWeightKg: deleteField() }, { merge: true }))
    assert.deepEqual(await readUser(), { prefs: { shareEaters: true } })
    for (const v of [29.9, 250.1, '54', null, true]) {
      await assertFails(setDoc(doc(alice(), USER), { targetWeightKg: v }, { merge: true }))
    }
    await assertFails(setDoc(doc(db('bob'), USER), { targetWeightKg: 54 }, { merge: true }))
  })

  test('prefs.weightAskSkipKg: 본인 쓰기 허용, 범위·형식 거부', async () => {
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { shareEaters: false, weightAskSkipKg: 56.2 } }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { weightAskSkipKg: 55 } }, { merge: true }))
    assert.deepEqual((await readUser()).prefs, { shareEaters: false, weightAskSkipKg: 55 })
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { weightAskSkipKg: deleteField() } }, { merge: true }))
    assert.deepEqual((await readUser()).prefs, { shareEaters: false })
    for (const v of [10, 300, '55', null, [55]]) {
      await assertFails(setDoc(doc(alice(), USER), { prefs: { weightAskSkipKg: v } }, { merge: true }))
    }
  })
})

describe('식사 사진 보관(users/{uid}/mealPhotos/{mealId}, prefs.keepPhotos, 규칙 v8, 스펙 4.12절)', () => {
  const USER = 'users/alice'
  const pPath = (uid = 'alice', id = 'm1') => `users/${uid}/mealPhotos/${id}`
  const jpeg = (n) => Bytes.fromUint8Array(new Uint8Array(n).fill(7))
  /** 클라이언트 쓰기(mealPhotos.ts saveMealPhoto): 한 쪽씩 merge, 먹기 전만 createdAt */
  const save = (fs, side, { n = 30000, w = 360, h = 288, extra = {}, uid = 'alice', id = 'm1' } = {}) =>
    setDoc(
      doc(fs, pPath(uid, id)),
      { [side]: jpeg(n), w, h, ...(side === 'before' ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp(), ...extra },
      { merge: true },
    )

  test('본인: 먹기 전 → 먹은 후 merge 저장, 읽기, 삭제', async () => {
    await assertSucceeds(save(alice(), 'before'))
    await assertSucceeds(save(alice(), 'after'))
    const d = (await getDoc(doc(alice(), pPath()))).data()
    assert.deepEqual(Object.keys(d).sort(), ['after', 'before', 'createdAt', 'h', 'updatedAt', 'w'])
    assert.equal(d.before.toUint8Array().length, 30000)
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/mealPhotos')))
    await assertSucceeds(deleteDoc(doc(alice(), pPath())))
  })

  test('먹은 후 사진만(createdAt 없음) 허용, 먹기 전 사진 다시 쓰기 허용, 경계 100000B·w/h 1·1000 허용', async () => {
    await assertSucceeds(save(alice(), 'after'))
    await assertSucceeds(save(alice(), 'before'))
    await assertSucceeds(save(alice(), 'before', { id: 'm2', n: 100000, w: 1, h: 1000 }))
  })

  test('100KB 초과·빈 bytes·문자열(base64) 거부', async () => {
    await assertFails(save(alice(), 'before', { n: 100001 }))
    await assertFails(save(alice(), 'after', { n: 0 }))
    await assertFails(
      setDoc(doc(alice(), pPath()), { before: 'data:image/jpeg;base64,AAAA', w: 360, h: 288, updatedAt: serverTimestamp() }),
    )
  })

  test('w·h 범위·형식, 모르는 키, 사진 없음, 필수 키 빠짐, 시각 위조 거부', async () => {
    for (const [w, h] of [[0, 288], [360, 1001], ['360', 288], [360, null]]) {
      await assertFails(save(alice(), 'before', { w, h }))
    }
    await assertFails(save(alice(), 'before', { extra: { thumb: jpeg(10) } }))
    await assertFails(save(alice(), 'before', { extra: { exif: 'GPS' } }))
    await assertFails(setDoc(doc(alice(), pPath()), { w: 360, h: 288, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), pPath()), { before: jpeg(10), h: 288, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(alice(), pPath()), { before: jpeg(10), w: 360, h: 288 }))
    await assertFails(save(alice(), 'before', { extra: { updatedAt: Timestamp.fromDate(new Date('2026-01-01')) } }))
    await assertFails(save(alice(), 'before', { extra: { createdAt: Timestamp.fromDate(new Date('2026-01-01')) } }))
    await assertSucceeds(save(alice(), 'before'))
    // 수정 때 createdAt을 지난 다른 시각으로 바꾸기 거부
    await assertFails(save(alice(), 'after', { extra: { createdAt: Timestamp.fromDate(new Date('2026-01-01')) } }))
  })

  test('다른 사용자·미로그인: 읽기·목록·쓰기·삭제 거부', async () => {
    await seed(pPath(), { before: jpeg(10), w: 360, h: 288, updatedAt: Timestamp.now() })
    for (const fs of [db('bob'), db(null)]) {
      await assertFails(getDoc(doc(fs, pPath())))
      await assertFails(getDocs(collection(fs, 'users/alice/mealPhotos')))
      await assertFails(save(fs, 'after'))
      await assertFails(deleteDoc(doc(fs, pPath())))
    }
  })

  test('기록 삭제와 사진 삭제를 한 배치로(deleteMeal), 사진 전체 삭제 배치', async () => {
    await seed(MEAL, doneDoc())
    await seed(pPath(), { before: jpeg(10), w: 360, h: 288, updatedAt: Timestamp.now() })
    await seed(pPath('alice', 'm2'), { after: jpeg(10), w: 360, h: 288, updatedAt: Timestamp.now() })
    const fs = alice()
    const b = writeBatch(fs)
    b.delete(doc(fs, MEAL))
    b.delete(doc(fs, pPath()))
    await assertSucceeds(b.commit())
    const rest = await getDocs(collection(fs, 'users/alice/mealPhotos'))
    assert.deepEqual(rest.docs.map((d) => d.id), ['m2'])
    const b2 = writeBatch(fs)
    rest.docs.forEach((d) => b2.delete(d.ref))
    await assertSucceeds(b2.commit())
    assert.equal((await getDocs(collection(alice(), 'users/alice/mealPhotos'))).size, 0)
  })

  test('prefs.keepPhotos: 본인 bool 허용(다른 설정과 함께), bool 아니면 거부', async () => {
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { keepPhotos: true } }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { shareEaters: true, weightAskSkipKg: 56 } }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { keepPhotos: false } }, { merge: true }))
    assert.deepEqual((await getDoc(doc(alice(), USER))).data().prefs, { keepPhotos: false, shareEaters: true, weightAskSkipKg: 56 })
    for (const v of ['true', 1, null, { on: true }]) {
      await assertFails(setDoc(doc(alice(), USER), { prefs: { keepPhotos: v } }, { merge: true }))
    }
    await assertFails(setDoc(doc(alice(), USER), { prefs: { keepPhotoz: true } }, { merge: true }))
    await assertFails(setDoc(doc(db('bob'), USER), { prefs: { keepPhotos: true } }, { merge: true }))
  })
})

describe('처음 동의(users/{uid}.consent, 규칙 v9, 디자인 조각 D10)', () => {
  const USER = 'users/alice'
  const consent = (extra = {}) => ({
    version: '2026-10-28', agreedAt: serverTimestamp(), required: true, photoKeep: false, school: false, ...extra,
  })
  /** saveConsent와 같은 모양 */
  const save = (fs, c = consent(), keepPhotos = c.photoKeep) =>
    setDoc(doc(fs, USER), { consent: c, prefs: { keepPhotos } }, { merge: true })
  const stored = () => ({
    version: '2026-10-28', agreedAt: Timestamp.fromDate(new Date('2026-10-28T03:00:00Z')),
    required: true, photoKeep: true, school: false,
  })
  const goal = () => ({
    input: { sex: 'female', age: 25, height_cm: 160, weight_kg: 55, activity: 'light', goal: 'maintain' },
    override: null,
    result: { bmr: 1300, tdee: 1790, target_kcal: 1790 },
    targets: { target_kcal: 1790, carbs_g: 246, protein_g: 90, fat_g: 50, source: 'recommended' },
    updatedAt: serverTimestamp(),
  })

  test('정상 저장(새 문서·기존 prefs 문서·다시 동의)과 읽기 허용', async () => {
    await assertSucceeds(save(alice(), consent({ photoKeep: true, school: true })))
    const c = (await assertSucceeds(getDoc(doc(alice(), USER)))).data()
    assert.equal(c.consent.required, true)
    assert.equal(c.prefs.keepPhotos, true)
    await assertSucceeds(save(alice(), consent({ version: '2026-11-01' })))
    await seed('users/carol', { prefs: { shareEaters: true } })
    await assertSucceeds(setDoc(doc(db('carol'), 'users/carol'), { consent: consent(), prefs: { keepPhotos: false } }, { merge: true }))
  })

  test('키 빠짐·키 더함 거부', async () => {
    for (const k of ['version', 'agreedAt', 'required', 'photoKeep', 'school']) {
      const c = consent()
      delete c[k]
      await assertFails(save(alice(), c, false))
    }
    await assertFails(save(alice(), consent({ photo: 'data:image/jpeg;base64,AAAA' })))
    await assertFails(save(alice(), consent({ marketing: true })))
  })

  test('required가 true가 아니면 거부, photoKeep·school은 bool만', async () => {
    for (const v of [false, 'true', 1, null]) await assertFails(save(alice(), consent({ required: v })))
    for (const v of ['yes', 1, null]) {
      await assertFails(save(alice(), consent({ photoKeep: v }), false))
      await assertFails(save(alice(), consent({ school: v })))
    }
  })

  test('version 형식: 1~20자 문자열만', async () => {
    await assertSucceeds(save(alice(), consent({ version: 'v' })))
    await assertSucceeds(save(alice(), consent({ version: 'x'.repeat(20) })))
    for (const v of ['', 'x'.repeat(21), 20261028, null, ['2026-10-28']]) {
      await assertFails(save(alice(), consent({ version: v })))
    }
  })

  test('agreedAt이 이번 요청 시각이 아니면 거부(지난 시각·문자열)', async () => {
    await assertFails(save(alice(), consent({ agreedAt: Timestamp.fromDate(new Date('2026-10-28T03:00:00Z')) })))
    await assertFails(save(alice(), consent({ agreedAt: '2026-10-28T03:00:00Z' })))
    // 저장된 consent의 한 칸만 바꾸면서 agreedAt을 그대로 두는 것도 거부
    await seed(USER, { consent: stored() })
    await assertFails(updateDoc(doc(alice(), USER), { 'consent.school': true }))
  })

  test('다른 uid·미로그인: 쓰기·읽기 거부', async () => {
    await seed(USER, { consent: stored() })
    for (const fs of [db('bob'), db(null)]) {
      await assertFails(save(fs))
      await assertFails(getDoc(doc(fs, USER)))
    }
  })

  test('consent 있는 문서에 prefs·goal·targetWeightKg만 병합하면 허용(consent 그대로)', async () => {
    await seed(USER, { consent: stored(), prefs: { keepPhotos: true } })
    await assertSucceeds(setDoc(doc(alice(), USER), { prefs: { shareEaters: true } }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), USER), { goal: goal() }, { mergeFields: ['goal'] }))
    await assertSucceeds(setDoc(doc(alice(), USER), { targetWeightKg: 52 }, { merge: true }))
    const d = (await getDoc(doc(alice(), USER))).data()
    assert.deepEqual(d.consent, stored())
    assert.deepEqual(d.prefs, { keepPhotos: true, shareEaters: true })
  })

  test('consent 지우기 거부(deleteField·덮어쓰기), 동의 없는 문서는 그대로 허용', async () => {
    await seed(USER, { consent: stored(), prefs: { keepPhotos: true } })
    await assertFails(updateDoc(doc(alice(), USER), { consent: deleteField() }))
    await assertFails(setDoc(doc(alice(), USER), { prefs: { keepPhotos: false } }))
    await assertFails(deleteDoc(doc(alice(), USER)))
    await seed('users/carol', { prefs: { shareEaters: true } })
    await assertSucceeds(setDoc(doc(db('carol'), 'users/carol'), { prefs: { shareEaters: false } }))
  })
})

describe('첫 홈 튜토리얼(users/{uid}.prefs.tutorialDone, 규칙 v10, 디자인 조각 D11)', () => {
  const USER = 'users/alice'
  /** setTutorialDone(web/src/data/prefs.ts)과 같은 모양 */
  const save = (fs, v = true, path = USER) => setDoc(doc(fs, path), { prefs: { tutorialDone: v } }, { merge: true })

  test('본인 true·false 허용(다른 설정은 그대로)', async () => {
    await seed(USER, { prefs: { shareEaters: true, keepPhotos: false } })
    await assertSucceeds(save(alice(), true))
    assert.deepEqual((await getDoc(doc(alice(), USER))).data().prefs, { shareEaters: true, keepPhotos: false, tutorialDone: true })
    await assertSucceeds(save(alice(), false))
    assert.equal((await getDoc(doc(alice(), USER))).data().prefs.tutorialDone, false)
    // 새 문서에도 허용
    await assertSucceeds(save(db('carol'), true, 'users/carol'))
  })

  test('bool이 아니면 거부(문자열·숫자·null·map)', async () => {
    for (const v of ['true', 'yes', 1, 0, null, { done: true }]) await assertFails(save(alice(), v))
  })

  test('다른 uid·미로그인 거부', async () => {
    await assertFails(save(db('bob'), true))
    await assertFails(save(db(null), true))
  })

  test('consent·goal 있는 문서에 병합 허용(consent·goal 그대로)', async () => {
    const consent = {
      version: '2026-10-28', agreedAt: Timestamp.fromDate(new Date('2026-10-28T03:00:00Z')),
      required: true, photoKeep: false, school: false,
    }
    const goal = {
      input: { sex: 'female', age: 25, height_cm: 160, weight_kg: 55, activity: 'light', goal: 'maintain' },
      override: null,
      result: { bmr: 1300, tdee: 1790, target_kcal: 1790 },
      targets: { target_kcal: 1790, carbs_g: 246, protein_g: 90, fat_g: 50, source: 'recommended' },
      updatedAt: Timestamp.fromDate(new Date('2026-10-27T03:00:00Z')),
    }
    await seed(USER, { consent, goal, prefs: { keepPhotos: false } })
    await assertSucceeds(save(alice(), true))
    const d = (await getDoc(doc(alice(), USER))).data()
    assert.deepEqual(d.consent, consent)
    assert.deepEqual(d.goal, goal)
    assert.deepEqual(d.prefs, { keepPhotos: false, tutorialDone: true })
  })
})
