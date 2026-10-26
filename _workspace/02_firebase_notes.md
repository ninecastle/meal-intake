# Firebase 작업 기록

## 0단계 환경 준비 (2026-10-26, 리더 기록)

### 만든 것
| 항목 | 값 | 상태 |
| --- | --- | --- |
| Firebase 프로젝트 | `meal-intake-2026` (표시 이름 "Meal Intake 2026"), 소유 계정: Firebase CLI 로그인 계정 | 완료, Spark(결제 계정 없음) |
| 웹 앱 | `meal-intake-web`, App ID `1:686292653830:web:87f810922b0016e244f087` | 완료 |
| Hosting 사이트 | `meal-intake-2026` → https://meal-intake-2026.web.app | 기본 사이트 있음(아직 배포 전) |
| Firestore | `(default)`, `asia-northeast3`(서울), Standard(FIRESTORE_NATIVE), 삭제 보호 켬, PITR 끔 | 완료(2026-10-26 06:28 UTC). 기본 규칙은 외부 접근 전부 차단 — 규칙 v1 배포 전까지 클라이언트 읽기·쓰기 불가 |
| Authentication Google 로그인 | Google 제공업체 사용 설정 | 완료(사용자 보고, 콘솔) |
| Firebase AI Logic | Gemini Developer API 백엔드 | 완료(사용자 보고, 콘솔). App Check 자동 적용 여부·reCAPTCHA 키 상태는 저장소 골격 작업 때 확인 |
| App Check | — | 확인 필요: AI Logic 설정 과정에서 자동 적용됐을 수 있음(스펙 R5). 개발 브라우저 디버그 토큰 등록 필요. reCAPTCHA가 결제 수단을 요구하면 스펙 U8 |
| AI 모니터링 | 켜지 않음 | 확인 필요(스펙 R3) |

Firestore 생성 명령(기록용, 실행 완료):
```
firebase firestore:databases:create "(default)" --location asia-northeast3 --edition standard --delete-protection ENABLED --project meal-intake-2026
```

### 웹 앱 설정 값 (공개 값, 코드에 넣어도 됨)
```json
{
  "projectId": "meal-intake-2026",
  "appId": "1:686292653830:web:87f810922b0016e244f087",
  "apiKey": "AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s",
  "authDomain": "meal-intake-2026.firebaseapp.com",
  "messagingSenderId": "686292653830"
}
```
- `storageBucket` 값도 내려오지만 Cloud Storage는 쓰지 않으므로 앱 설정에 넣지 않는다.
- 이 웹 API 키로 AI Logic(Gemini)도 호출되므로, 공개 배포 전에 App Check를 켜야 남이 무료 할당량을 써 버리는 것을 막을 수 있다.

### 확인한 환경
- Node v24.22.1, npm 11.19.1, firebase-tools 15.34.1, git 2.56, Python 3.13. `gcloud` 없음(API 켜기는 콘솔에서).
- 같은 계정에 다른 Firebase 프로젝트 4개가 있다(이 앱과 무관).

### 남은 이슈
- 프로젝트 폴더를 `C:\Users\kkama\dev\hackathon`으로 옮길 예정(사용자 결정). 옮긴 뒤 `.firebaserc`는 새 위치에서 만든다.

## 저장소 골격 (2026-10-26, firebase-engineer)

### 만든 것
- 루트: `.gitignore`(원본 31MB·샘플 사진·빌드·로그·`.env.local` 제외), `.gitattributes`(LF 고정 — `freeze_01.sha` 해시가 CRLF 변환으로 깨지지 않게), `firebase.json`(hosting `web/dist` + SPA rewrite, firestore 규칙·인덱스, 에뮬레이터 auth 9099·firestore 8080·hosting 5000·UI 4000, Storage·Functions 없음), `.firebaserc`(default `meal-intake-2026`), `firestore.rules`(전부 차단, v1은 2단계), `firestore.indexes.json`(비어 있음)
- `web/`: Vite 8.3.4, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.3(`@tailwindcss/vite`), firebase 13.1.0 — 모두 정확한 버전 고정
- `web/src/lib/firebase.ts`: 위 웹 설정 값으로 초기화(storageBucket 없음), `import.meta.env.DEV && VITE_USE_EMULATORS==='on'`일 때만 Auth·Firestore 에뮬레이터 연결. App Check·AI Logic은 아직 없음
- `web/.env.example`: `VITE_AI_MODEL`, `VITE_AI_MOCK`, `VITE_SEARCH_GROUNDING`, `VITE_USE_EMULATORS`

### 명령
- 빌드: `npm --prefix web run build` (성공, JS 707KB/gzip 216KB — 청크 500KB 경고만)
- 개발: `web/.env.example` → `web/.env.local` 복사 후 `firebase emulators:start --only auth,firestore` + `npm --prefix web run dev`
- 배포(아직 안 함): `firebase deploy --only firestore:rules,firestore:indexes,hosting`

### 남은 일
- App Check(reCAPTCHA Enterprise 키, 디버그 토큰)와 `firebase.ts` 초기화 순서(스펙 5절) 반영, AI 모니터링 꺼짐 확인, 모델별 무료 한도 기록
- Firestore 영구 캐시, 규칙 v1·규칙 테스트(`@firebase/rules-unit-testing`)는 2단계
- 번들 크기: 화면이 생기면 firebase 모듈을 지연 로딩하거나 청크 분리 검토
- npm 11이 설치 스크립트를 기본 차단한다(경고만, 빌드에는 영향 없음)

## 콘솔 확인 결과 (2026-10-26, 사용자 보고)
| 항목 | 결과 |
| --- | --- |
| App Check 제공자 | `meal-intake-web`에 reCAPTCHA Enterprise(Essentials, 무료) 사이트 키 등록. 결제 수단 요구 없음 → U8 불필요. 도메인: `meal-intake-2026.web.app`, `meal-intake-2026.firebaseapp.com`, `localhost` |
| App Check 강제(AI Logic API) | **아직 끔.** 스파이크·디버그 토큰 확인 뒤, 첫 배포(2단계) 전에 켠다 |
| AI 모니터링 | 켜져 있던 것을 끔(R3 충족) |
| 모델별 무료 한도 | (처음에는 AI Studio 권한 문제로 확인 불가였으나 이후 사용자가 확인) 3.5 Flash-Lite 분당 15·하루 500, 3.8 Flash 분당 5·하루 20. 프로젝트 전체 공유. 세부는 `00_handoff.md` "무료 한도 확인" |

## App Check 코드 (2026-10-26, firebase-engineer)
- `web/src/lib/firebase.ts`: `initializeApp` → (DEV만) `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` → `initializeAppCheck(ReCaptchaEnterpriseProvider(VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true)` → `getAuth`·`getFirestore`. 사이트 키가 비면 콘솔 경고만 내고 App Check 없이 앱은 뜬다(`appCheck === null`).
- `web/src/lib/ai.ts`: `getAI(app, GoogleAIBackend)` + `getModel(modelId = VITE_AI_MODEL)`만. 프롬프트·스키마는 `web/src/analysis/`(vision 담당).
- `App.tsx`: DEV에서만 "AI 연결 시험" 버튼. 누를 때 1회 호출, 재시도 없음. 배포 빌드에서는 코드가 빠진다.
- `.env.example`·`vite-env.d.ts`에 `VITE_RECAPTCHA_SITE_KEY` 추가(값 비움).

### 사용자가 할 일 (디버그 토큰 등록, AI 호출 1회)
1. `web/.env.example`을 `web/.env.local`로 복사(이미 있으면 줄만 추가)하고 `VITE_RECAPTCHA_SITE_KEY=`에 App Check 콘솔의 reCAPTCHA Enterprise 사이트 키를 넣는다.
2. `npm --prefix web run dev` 실행 → 브라우저로 localhost 접속.
3. 브라우저 개발자 도구 콘솔에 찍힌 "App Check debug token: ..." 값을 복사해 Firebase 콘솔 App Check → 앱(`meal-intake-web`) 메뉴 → '디버그 토큰 관리'에 등록한다. 같은 브라우저 프로필이면 토큰은 유지된다.
4. 화면의 "AI 연결 시험" 버튼을 1회 누른다. "성공: 빨간색" 류가 나오면 완료. 401·403이면 토큰 등록·사이트 키를 확인하고, 다시 누르기 전에 원인을 먼저 본다.

## 디버그 토큰·연결 확인 (2026-10-26, 사용자 보고)
- 개발 PC 디버그 토큰을 App Check 콘솔에 등록함(이름 `kkamang-pc`).
- localhost "AI 연결 시험" → "성공: 빨강". 단, AI Logic 강제가 꺼져 있어 토큰 유효성은 미검증. 강제는 10/29 측정 뒤, 첫 배포 전에 켜고 버튼으로 다시 확인.

## 구글 로그인 (2026-10-26, 2단계 조각 2, firebase-engineer)
- 코드: `web/src/lib/auth.ts`(`signInWithGoogle`·`signOutAndClear`·`useAuthUser`·`consumeRedirectResult`·`isInAppBrowser`·`AuthError{code, originalCode}`), `web/src/pages/LoginPage.tsx`(S0), `App.tsx`(로그인 전 S0, 로그인 후 "로그인: 이름(이메일) [로그아웃]" 한 줄. DEV에서 로그아웃하면 콘솔에 먹기 전 사진 IndexedDB 장수 전→후).
- 흐름: 인앱 브라우저 UA면 호출 전 `AUTH_INAPP_BROWSER` → 팝업 → `auth/popup-blocked`면 리디렉션. 닫기·취소는 `AUTH_CANCELLED`, 그 밖은 `AUTH_FAILED`(원래 코드 보존). 리디렉션 결과는 앱 시작 때 한 번 처리.
- 로그아웃: `beforePhotoStore.clearAll()` → `signOut`. 분석 결과 캐시 `meal-analysis-cache`는 지우지 않는다(사진 없음, 사진 해시·음식 이름 키, 7일 만료, 재로그인 때 호출 절약).
- authDomain: `location.hostname`이 `meal-intake-2026.web.app`·`meal-intake-2026.firebaseapp.com`이면 그 도메인, 아니면(localhost) `meal-intake-2026.firebaseapp.com`(`lib/firebase.ts`). 근거: 공식 문서 "redirect-best-practices" 옵션 1. 출처가 다르면 서드 파티 저장소 차단(Chrome 115+, Safari 16.1+, Firefox 109+)으로 리디렉션 결과를 못 읽는다. Hosting은 두 도메인 모두 `/__/auth/*`를 제공한다.
- CLI 확인(읽기만, 2026-10-26): 로그인 계정 `kkamang2362@gmail.com`, 웹 앱 SDK 설정 authDomain = `meal-intake-2026.firebaseapp.com`, Hosting 사이트 `meal-intake-2026` → `https://meal-intake-2026.web.app`. 승인된 도메인·OAuth 동의 화면은 CLI로 볼 수 없다.

### 사용자 콘솔 확인 (조각 5 배포 전)
1. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 `localhost`, `meal-intake-2026.web.app`, `meal-intake-2026.firebaseapp.com`이 있는지.
2. Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보 → "Web client (auto created by Google Service)" → 승인된 리디렉션 URI에 `https://meal-intake-2026.web.app/__/auth/handler`가 있는지(없으면 추가). **없으면 배포본에서 팝업·리디렉션 로그인이 모두 `redirect_uri_mismatch`로 실패한다.**
3. OAuth 동의 화면(Google 인증 플랫폼 → 대상)이 "프로덕션"인지. "테스트"면 등록한 테스트 사용자만 로그인된다(심사위원 불가).

## Firestore 저장·규칙 (2단계 조각 3, 2026-10-26, firebase-engineer)

### 만든 것
- `web/src/data/meals.ts`: 스펙 4.3절 `newMealId`, `createAwaitingMeal`, `saveReview`, `saveMeal`, `deleteMeal`, `getMeal`, `subscribePending` + 확인용 `listRecentMeals(uid, n)`(전체 읽고 클라이언트 정렬). 오류는 `MealStoreError`(`code: MealStoreErrorCode`)로 던진다. 저장 전 `validateAnalysis` 필수, analysis·beforeAnalysis는 규칙 허용 키만 골라 JSON 왕복(undefined 제거) 후 저장. `subscribeDay`·`summarizeDay`는 3단계.
- `web/src/lib/firebase.ts`(영구 캐시), `web/src/lib/time.ts`(`toDateKey` 등)는 이전 작업분 그대로 커밋.

### 규칙 v1 요약 (`firestore.rules`)
- `users/{uid}/meals/{mealId}`만 본인 읽기·쓰기. `users/{uid}` 문서·`goals`·그 밖 경로는 규칙이 없어 거부(3단계에 추가).
- 문서 키 8개 `hasOnly`(dateKey, mealType, status, beforeAnalysis, analysis, consumedKcal, createdAt, updatedAt). `analysis` 키는 items·totals·warnings·model·prompt_version, `beforeAnalysis` 키는 items·warnings·model·prompt_version만.
- 열거값(status·mealType), dateKey `[0-9]{4}-[0-9]{2}-[0-9]{2}`, items ≤ 30, consumedKcal 0~10000이고 `analysis.totals.consumed.kcal`과 같음, analysis와 consumedKcal은 함께 있거나 함께 없음. awaiting_after는 beforeAnalysis 필수, needs_review·done은 analysis 필수.
- 생성은 awaiting_after·done만, createdAt·updatedAt = request.time. 수정은 awaiting_after→needs_review·done, needs_review→done만(같은 상태 유지·되돌리기 거부), createdAt 불변. 삭제는 모든 상태.
- 배포: 2026-10-26 `firebase deploy --only firestore:rules --project meal-intake-2026` 성공(규칙만, 인덱스·Hosting 배포 안 함).

### 규칙 테스트
- `firestore-tests/rules.test.mjs`(node:test + `@firebase/rules-unit-testing` 6.0.0 + firebase 13.1.0, 프로젝트 ID `demo-meal-intake`). 실행: `cd firestore-tests && npm install && npm test`(에뮬레이터 자동 실행) 또는 에뮬레이터를 띄운 뒤 `npm run test:running`.
- 상태: **작성만, 실행 안 함** — 이 PC에 Java가 없다(Firestore 에뮬레이터는 JDK 21+ 필요). `node --check` 문법 확인만 통과.

### 남은 이슈
- 스펙 2.1절은 샘플 체험 문서에 `entry: "sample"`을 남긴다고 하지만 3.2절 허용 키 8개에는 없다. 지금 규칙은 `entry`를 거부한다. 샘플 체험을 구현할 때 3.2절에 넣기로 정하면 규칙에 `entry`(값 'sample')를 추가해 다시 배포한다.
- done → done(저장된 식사 다시 수정)은 거부된다. 저장 뒤 수정 기능을 넣으면 전이를 추가한다.
- 쓰기 Promise는 서버 확인 뒤에 끝난다. 오프라인에서는 화면이 기다리지 않게 한다(프런트).
