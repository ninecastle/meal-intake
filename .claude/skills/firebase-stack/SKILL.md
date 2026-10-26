---
name: firebase-stack
description: "식단 기록 웹앱의 Firebase 기본 구성(Spark 무료 요금제, Google 로그인, Firestore 데이터 모델, 보안 규칙, Firebase AI Logic·App Check, 클라이언트 하루 요약 쿼리, Hosting 배포, 에뮬레이터)을 정한다. Firebase 설정·규칙·데이터 구조·배포를 작성하거나 고칠 때 반드시 사용한다. AI 프롬프트·칼로리 계산 방법은 intake-calorie-estimation, 화면 구현은 meal-log-frontend를 쓴다."
---

# Firebase 스택 기본값 (Spark 무료 요금제)

해커톤 10일 안에 끝내려면 결정을 미리 해 두고 구현에 시간을 써야 한다. 아래는 프로젝트 `CLAUDE.md` "확정 결정 사항"을 구현 수준으로 옮긴 기본값이다. 결정 사항을 벗어나는 변경은 사용자 확인 없이 하지 않는다.

## 요금제 원칙
- **Spark(무료)만 쓴다.** Blaze 업그레이드, 결제 계정 연결은 금지한다. 콘솔이나 CLI가 업그레이드를 요구하면 그 기능을 쓰지 않고 대안을 찾는다.
- **쓰지 않는 것:** Cloud Functions, Cloud Storage(Spark에서 사용 불가), 별도 서버.
- 무료 할당량(Firestore 일일 읽기·쓰기, Hosting 전송량, Gemini 무료 등급 요청 수)은 구현 시점에 공식 문서로 확인해 `_workspace/02_firebase_notes.md`에 적는다.

## 구성
| 영역 | 기본값 | 이유 |
| --- | --- | --- |
| 인증 | Firebase Auth Google 로그인(`signInWithPopup`, 팝업이 막히는 환경은 `signInWithRedirect`) | 사용자 흐름의 첫 단계. 기기를 바꿔도 기록 유지 |
| DB | Cloud Firestore | 분석 결과만 저장. `onSnapshot`으로 요약 화면 즉시 갱신 |
| 사진 | **서버에 저장하지 않는다** | 촬영 즉시 Gemini에 보내 분석한다. 먹기 전 사진만 폰 브라우저 IndexedDB에 임시 보관했다가 먹은 후 분석 뒤 지운다(meal-log-frontend 담당). Storage를 쓸 수 없고, 사진을 서버에 남기지 않는 편이 개인정보 측면에서도 낫다 |
| AI 호출 | Firebase AI Logic(`firebase/ai`) + Gemini Developer API 백엔드(`GoogleAIBackend`), 클라이언트에서 호출 | Spark에서 쓸 수 있고 API 키를 코드에 넣지 않아도 된다 |
| 호출 보호 | App Check(reCAPTCHA) | 공개 웹앱에서 AI 무료 할당량 남용 방지 |
| AI 모델 | 무료 등급에서 쓸 수 있는 Gemini flash 계열(멀티모달·구조화 출력·Google 검색 그라운딩 지원) | 구현 시점에 최신 모델 ID와 무료 한도를 공식 문서로 확인한다 |
| 호스팅 | Firebase Hosting | 배포 한 명령, HTTPS 기본(카메라 접근에 필요) |
| 로컬 | Emulator Suite(auth, firestore, hosting) | 실서버 오염·할당량 소모 방지. AI Logic은 에뮬레이터가 없으므로 화면 개발은 목업 JSON으로 한다 |

## 데이터 모델
```
users/{uid}
  { displayName?, dailyTargetKcal?, timezone: "Asia/Seoul", createdAt }

users/{uid}/meals/{mealId}
  { dateKey: "2026-10-27", mealType: "breakfast|lunch|dinner|snack",
    status: "awaiting_after|needs_review|done",
    analysis: <MealIntakeAnalysis>,   // 음식 이름·중량·남긴 비율·칼로리·영양소·출처
    consumedKcal,                     // analysis.totals.consumed.kcal 사본(요약 합산용)
    createdAt, updatedAt }
```
- `analysis`는 `intake-calorie-estimation/references/analysis-schema.json` 형식이다.
- **사진·썸네일·이미지 URL·base64 필드는 두지 않는다.** Firestore에는 분석 결과만 저장한다.
- 하루 요약 문서(`daily/*`)는 두지 않는다. 요약은 아래 쿼리로 클라이언트에서 합산한다.
- 먹기 전 분석만 끝난 상태(`awaiting_after`)를 저장해 둔다. 먹기 전 사진은 IndexedDB에 있고 분석 결과는 Firestore에 있으므로, 앱을 닫았다가 돌아와도 먹은 후 사진만 찍으면 된다.

## 하루 요약 (클라이언트 합산)
```ts
const q = query(collection(db, "users", uid, "meals"),
  where("dateKey", "==", dateKey), where("status", "==", "done"));
onSnapshot(q, (snap) => {
  const sum = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };
  snap.forEach((d) => { const c = d.data().analysis.totals.consumed;
    for (const k in sum) sum[k] += c[k] ?? 0; });
  // 끼니별 합계도 mealType으로 묶어 계산
});
```
- 등호 조건 두 개는 단일 필드 인덱스로 동작한다. `orderBy("createdAt")`를 붙이면 복합 인덱스가 필요하므로 `firestore.indexes.json`에 추가한다.
- 식사 저장·수정·삭제 후 따로 집계를 고칠 필요가 없다. 구독 중인 쿼리가 자동으로 다시 합산한다.
- `dateKey`는 클라이언트가 `Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone })`으로 만든다. 기기 시간대가 아니라 프로필 시간대(기본 `Asia/Seoul`)를 써서 자정 전후 식사가 다른 날로 잡히지 않게 한다.

## 보안 규칙 원칙
- `request.auth.uid == uid`인 `users/{uid}/**`만 읽기·쓰기.
- 클라이언트가 칼로리를 직접 쓰므로 규칙에서 형식과 범위를 검사한다: `status`·`mealType` 열거값, `dateKey` 형식(`^\d{4}-\d{2}-\d{2}$`), 항목별 `eaters` 1~20, `analysis.items` 개수 상한(예: 30), `consumedKcal` 0~10000.
- 허용 필드 목록(`keys().hasOnly([...])`)으로 사진 같은 예상 밖 필드가 들어오지 않게 한다.
- 함수가 없으므로 위조를 완전히 막을 수는 없다. 본인 기록만 영향을 받으므로 해커톤 범위에서 받아들인다.

## 배포 절차
1. `firebase emulators:start --only auth,firestore,hosting`로 규칙과 화면 흐름 확인(규칙 테스트는 `@firebase/rules-unit-testing`)
2. `npm --prefix web run build`
3. `firebase deploy --only firestore:rules,firestore:indexes,hosting`
4. 배포 URL을 `_workspace/02_firebase_notes.md`에 기록한다. 첫 배포는 2단계(10/30), 최종 배포는 6단계(11/5).

## 자주 막히는 지점
- 카메라 입력은 HTTPS나 localhost에서만 동작한다.
- 콘솔에서 AI Logic을 켤 때 백엔드로 **Gemini Developer API**를 고른다(Vertex AI 백엔드는 Blaze가 필요하다).
- 카카오톡 같은 인앱 브라우저에서는 Google 로그인 팝업이 막힌다. 시연은 Chrome·Safari에서 하고, 인앱 브라우저면 외부 브라우저로 열라는 안내를 띄운다.
- 배포 도메인이 Auth 승인 도메인에 있는지 확인한다(Hosting 기본 도메인은 자동 등록, 커스텀 도메인은 직접 추가).
- AI Logic 설정 과정이 App Check를 자동으로 적용한다(2026년 7월부터, 스펙 R5). 개발 브라우저 디버그 토큰을 0단계에 등록하지 않으면 개발 중 AI 호출이 모두 거부된다. reCAPTCHA 키 생성이 결제 수단을 요구하면 결제를 연결하지 말고 스펙 U8 순서(reCAPTCHA v3 → App Check 강제 해제 + 사용자별 분당 한도 낮춤)를 따른다.
- Firebase AI 모니터링은 켜지 않는다. 켜면 프롬프트·응답이 프로젝트 로그에 저장돼 사진 서버 미저장이 깨질 수 있다(스펙 R3).

## 심사 기간 운영 (11/5 제출 뒤)
- 심사위원이 며칠 동안 배포 URL을 직접 쓴다. 배포본은 바꾸지 않고 Firebase·AI Studio 콘솔에서 사용량만 확인한다.
- 11/5 17:00 이후 새로 채워지는 Gemini 무료 한도는 심사위원용이다. 그 뒤로는 개발·QA에서 실제 AI 호출을 하지 않는다.
- AI Logic의 사용자별 분당 요청 한도를 낮춰(스펙 5.2절) 한 사람이 한도를 다 쓰지 못하게 한다.
- 배포 전에 팀과 무관한 일반 Google 계정으로 로그인이 되는지 확인한다(OAuth 동의 화면이 테스트 사용자로 제한돼 있지 않은지).
