// firestore.rules v1 테스트(@firebase/rules-unit-testing + node:test).
// 실행: firestore-tests 폴더에서 `npm test` (Firestore 에뮬레이터를 띄워 실행, JDK 21+ 필요, firebase-tools 15 기준).
// 이미 에뮬레이터가 떠 있으면 `npm run test:running`.
// 실제 프로젝트는 건드리지 않는다(demo- 프로젝트 ID). AI 호출 없음.
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

  test('users/{uid} 문서와 goals는 아직 거부(3단계)', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { timezone: 'Asia/Seoul' }))
    await assertFails(getDoc(doc(alice(), 'users/alice')))
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

  test('잘못된 전이 거부: done → awaiting_after, needs_review로 생성, done → done', async () => {
    await seed(MEAL, doneDoc(analysis(), { beforeAnalysis: beforeAnalysis() }))
    const ref = doc(alice(), MEAL)
    await assertFails(updateDoc(ref, { status: 'awaiting_after', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { mealType: 'dinner', updatedAt: serverTimestamp() }))
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
