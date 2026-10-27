# 프런트엔드 작업 기록

## 2단계 조각 1 (2026-10-26): 결과 수정 편집기, 같은 사진 안내
커밋 `e96c8ed`. 실제 AI 호출 0회, 개발 서버로는 시험하지 않음(사용자가 시험).

### 컴포넌트 구조
- `web/src/components/review/ReviewEditor.tsx`: 제어형 `{ analysis, onChange }`. 상태는 이름 편집 중인 카드, 조회 중인 카드(id → 새 이름), "다시 계산할까요?" 질문, 3초 되돌리기, kcal 포커스 요청, 검색 추천 HTML(id별, 저장 안 함). 바뀔 때마다 `buildAnalysis(items, warnings, { model, prompt_version })`로 올린다. 비동기 조회가 끝나면 ref에 둔 최신 분석 위에 `applyNutrition`을 적용한다(그 사이 다른 카드를 고친 값이 사라지지 않게).
- `web/src/components/review/FoodCard.tsx`: 카드 한 장 + 내부 `NameEditor`(자동완성 200ms, `listFoodVariants` 세부 종류와 걸러 보기), `NumField`, `Macro`, `SearchSuggestion`(Shadow DOM). 계산은 하지 않는다.
- `web/src/photos/samePhoto.ts`: `isSamePhoto(a, b)`. 크기가 다르면 바로 false, 같으면 `sha256Hex` 두 개를 비교. 해시를 못 구하면 false.
- `web/src/dev/FlowTest.tsx`: 먹은 후 단계를 `onPickAfter`(압축 → 먹기 전 사진 꺼내기 → 같은 사진 확인)와 `runAfter`(분석 → 사진 삭제 → 영양값)로 나눴다. 같은 사진이면 압축본 두 장을 메모리에만 두고 [다른 사진 고르기]/[그대로 분석]을 기다린다. 읽기 전용 표 `MealResult`는 지우고 `ReviewEditor`로 바꿨다. 검증 한 줄은 남기고 "직접 입력으로 시작"(빈 분석)을 추가했다.

### 스펙과 다르게 정한 점
1. **음식 추가 포커스·중량:** 스펙 2.3절은 "DB 1인분 참고량(없으면 100g), 중량 입력란 포커스"인데, 리더 지시대로 이름 입력칸에 포커스, 중량은 100g(`DEFAULT_USER_GRAMS`)으로 했다. `FoodSuggestion`에 1인분 값이 없다.
2. **"5+" 인원수:** 스펙은 "5+를 고르면 6~20 입력"이다. 5+를 누르면 5로 정하고 5~20 입력칸을 보인다(5를 고를 방법이 따로 없어서).
3. **"다시 계산할까요?" 조건:** `kcal_overridden && (per_100g !== null || consumed.kcal > 0)`. 새로 추가한 빈 항목(직접 입력 출처라 kcal_overridden=true)에 묻지 않고, 직접 입력 항목에 kcal을 적어 둔 경우에는 묻는다.
4. **카드 순서:** 처음 받은 순간에 정하고 고정한다(확인 필요·AI 추정 먼저). 고치는 중에 `needs_review`가 풀려도 카드가 움직이지 않는다. 테두리 색은 지금 상태를 따른다. 추가한 항목은 맨 아래.
5. **kcal 직접 입력의 `user_edited`:** 스펙 표대로 바꾸지 않는다(이름·중량·비율만 true, 인원수만 바꾸면 그대로).
6. **남긴 비율 모름(null):** 슬라이더가 0에 있어서 0으로 확정할 방법이 없으므로 "다 먹음" 버튼을 두었다.
7. **취소:** 이름을 하나도 쓰지 않은 새 항목에서 취소를 누르면 그 항목을 없앤다(되돌리기 없음).
8. **이름 확정 방식:** 입력은 [확인] 또는 Enter로 확정한다(blur 확정은 목록 탭과 겹쳐서 쓰지 않음). 목록에서 고르면 바로 확정한다. 자동완성·세부 종류에서 고르면 이름은 `label`, `dbCode`를 넘긴다.

### 남은 이슈
- `listFoodVariants`와 `FoodSuggestion.mlConverted`는 vision-ai-engineer가 추가하기 전까지 `tsc -b` 오류 2개(TS2305, TS2339)가 남는다. 그 외 오류는 없다.
- 저장(`saveMeal`), 실제 화면 흐름·라우팅은 다음 조각에서 한다.
- 개발 서버에서 직접 확인할 것: 슬라이더·인원수 버튼 터치 영역, 삭제 3초 되돌리기, 같은 사진 안내에서 [다른 사진 고르기]가 파일 선택 창을 여는지(모바일 브라우저).

## 2단계 조각 4-B (2026-10-26): 결과 확인·수정 화면(S4)과 저장
`web/src/pages/ReviewPage.tsx`(기본 export, props 없음). AI 호출 0회, 개발 서버로는 시험하지 않음. `tsc -b` 오류 없음.

### 구조
- 들어오기: `location.state {analysis, dateKey, mealType}` → 없으면 `getMeal`(`needs_review`면 편집, `awaiting_after`면 [남은 음식 찍기], `done`·없음이면 홈). 불러오기 실패는 [다시 시도]. 직접 입력(`/meal/new/review`, `:mealId`가 `new`여도 같음)은 `newMealId` + `buildAnalysis([], [])`, `?date`가 틀리면 오늘, 끼니는 `guessMealType(지금)`. 처음 들어올 때의 state·date만 쓴다.
- 화면: 헤더(‹ 홈), 날짜 + 끼니 칩 4개, 경고 목록(`analysis.warnings`), `ReviewEditor`(합계·출처 문구는 편집기 것을 그대로 쓰고 중복하지 않음), 아래 고정 [저장]. 본문만 스크롤해서 편집기의 되돌리기 알림(sticky)이 저장 버튼 위에 보인다.
- 저장: `validateAnalysis` 통과 + 음식 1개 이상일 때만 활성. 저장 중에는 버튼과 편집기(`fieldset disabled`)를 잠근다. 성공 → `beforePhotoStore.remove` → `navigate('/', {replace, state:{saved:{dateKey, consumedKcal}}})`. 실패 → `MealStoreError.code`별 안내 + [다시 시도].
- 오프라인: 10초(브라우저가 오프라인이라고 알리면 1.5초)가 지나도 끝나지 않으면 "연결이 느려요. 연결되면 자동으로 저장돼요."와 [홈으로]. 자동으로 보내지 않고 한 번 누르게 했다. Firestore가 `persistentLocalCache`라 쓰기는 기기에 남아 앱을 닫아도 연결되면 올라간다.
- 나가기 확인: 바뀐 값(끼니 또는 분석 JSON)이 있을 때만. ‹ 홈 버튼은 `confirm`, 새로 고침·탭 닫기는 `useBeforeUnload`, 브라우저 뒤로 가기는 `useBlocker`인데 데이터 라우터(`createBrowserRouter`)일 때만 켜진다(`UNSAFE_DataRouterContext`로 판별).

### 스펙과 다르게 정한 점
1. 날짜는 표시만 한다(바꾸기 없음). 스펙대로 dateKey는 먹기 전 촬영 시각·홈에서 보던 날짜.
2. ‹ 버튼은 이전 화면(S3)이 아니라 홈으로 간다(S3로 돌아가 다시 찍으면 AI 호출이 또 난다).
3. 오프라인 저장은 자동 이동 대신 [홈으로] 한 번 누르기.

### 남은 이슈
- 편집기가 이름 조회 중(`resolveNutrition` 대기)이거나 이름을 입력하고 확정하지 않은 상태를 페이지가 알 수 없다. 그때 저장하면 조회 전 값이 저장된다. 편집기에 `onBusyChange` 같은 알림을 두면 저장을 잠글 수 있다.
- 연결 대기 중 [홈으로]로 나간 뒤 서버가 거부하면(규칙) 알릴 곳이 없다(콘솔만). 식사는 `needs_review`로 남아 홈 대기 카드에 다시 보인다.
- 라우터가 `<BrowserRouter>`면 브라우저·안드로이드 뒤로 가기는 확인 없이 나간다(값은 `needs_review`로 서버에 남아 있음, 직접 입력은 사라짐).
- S3에서 S4로 갈 때 `replace`로 가야 저장 뒤 뒤로 가기에서 촬영 화면이 다시 나오지 않는다.

## 2단계 조각 4-A (2026-10-26): 라우팅, 홈(S1 최소판), 먹기 전·후 촬영(S2·S3)
- `react-router` 8.5.0(고정). `App.tsx`가 `BrowserRouter`. 로그인 전이면 어느 경로든 `/login`(가려던 경로는 state `from`으로 기억해 로그인 뒤 돌려보냄).
- 경로: `/login`, `/`(HomePage), `/capture/before`, `/meal/:mealId/after`, `/meal/new/review`·`/meal/:mealId/review`(ReviewPage, lazy), `/dev`(DEV에서만 등록, 배포 `dist/`에 DevPage·FlowTest 문자열 없음 확인). 그 밖은 `/`.
- 촬영 화면·ReviewPage는 lazy(분석 모듈이 첫 번들에 안 들어감). 공용: `components/capture/AnalyzingOverlay.tsx`(10초 뒤 "조금 더 걸려요"+직접 입력), `captureText.ts`(U4 문구, 고지 확인 플래그 `localStorage photoNoticeAck.v1`, 오류 코드별 안내).
- 스펙과 다르게 정한 점
  - S2→S3도 navigate state `{ beforeAnalysis, dateKey, mealType }`를 넘긴다. `createAwaitingMeal`을 기다리지 않으므로 S3가 바로 `getMeal`하면 느리거나(오프라인) 비어 보일 수 있어서. state가 없을 때만 `getMeal`.
  - S2 분석이 실패·중단되면 문서가 없으므로 IndexedDB 먹기 전 사진을 바로 지운다(F1의 "같은 사진으로 다시 시도" 대신 [다시 찍기]).
  - S3 [남긴 양 직접 고르기]는 `saveReview`를 부르지 않고 S4로만 간다(문서는 `awaiting_after` 유지, 먹기 전 사진도 남김 → 앱 시작 정리 때 상태에 맞춰 지워짐).
  - 홈 첫 대기 목록 수신 때 세션당 1회 `beforePhotoStore.cleanup(awaiting_after id들)`(스펙 4.3 "앱 시작").
  - 일일 한도 안내 시각: 11/1까지 16:00, 11/2부터 17:00(KST).
- 남은 이슈: F10 "AI 한도 모드"(세션 동안 직접 입력 먼저), 데모 사진·샘플 체험, 사용자별 하루 상한은 미구현. 첫 번들 `index-*.js` 937KB(gzip 288KB, 대부분 Firebase SDK) → 4단계 번들 점검. S3 먹기 전 사진은 나란히 표시(반투명 겹치기 아님).

## 3단계 조각 1 (2026-10-26): 홈 하루 요약(S1), 기록 상세(S7)
`pages/HomePage.tsx`(하루 요약 추가), `pages/MealDetailPage.tsx`(새, `/meal/:mealId`, lazy), `App.tsx`(라우트 1개), 공용 `components/mealText.ts`(끼니 이름·순서, 출처 문구·배지 색·라벨, 숫자 형식, 날짜 키 `isDateKey`·`shiftDateKey`·`dateKeyLabel`·`homeHref`), `components/review/SourceBadge.tsx`(FoodCard에서 뺀 출처 배지, 편집기 표시는 그대로). `tsc -b` 오류 없음, AI 호출 0회, 개발 서버 시험 안 함.

### 구조
- 홈: `?date`(없거나 틀리거나 미래면 오늘). 날짜 이동은 `replace`(뒤로 가기가 날짜를 하나씩 되짚지 않게). 저장 뒤 `state.saved.dateKey`가 지난 날짜면 `?date=`로 옮긴다. 대기 카드는 날짜와 무관하게 맨 위. `subscribeDay` 결과는 `dateKey`가 맞을 때만 보인다(날짜를 바꾼 직후 이전 날 숫자가 안 보이게).
- 상세: `subscribeMeal`. 불러오는 중 / 불러오기 실패 / 문서 없음 / `done` 아님(`/after`·`/review` 안내) / `done` 다섯 경우. 탄·단·지가 없는 항목(직접 입력, fill missing)은 "–". [삭제]는 확인 뒤 서버 확인을 기다리지 않고 `deleteMeal` → 그 날짜 홈(replace). ‹ 홈도 그 날짜 홈(replace).

### 스펙과 다르게 정한 점
1. 기록 없는 오늘: 두 번째 [식사 기록] 버튼 대신 "아래 [식사 기록]을 눌러 시작하세요" 문구(아래 고정 버튼과 겹침, "한 화면에 주요 버튼 하나").
2. 상세의 끼니 합계를 음식 카드 위에 둔다.
3. 지난 날짜에서 [직접 입력] 문구는 "10월 25일 (토) 기록 직접 입력". [식사 기록](사진)은 보고 있는 날짜와 무관하게 지금 시각으로 기록된다.
4. 출처 한 줄에 "DB에 없는 음식은 AI 추정값이에요"를 덧붙였다.

### 남은 이슈
- 상세에서 삭제가 서버에서 거부되면(규칙) 콘솔에만 남고 홈에 기록이 다시 나타난다.
- "◀ 어제"/"내일 ▶" 문구는 지난 날짜를 볼 때도 같다(뜻은 전날·다음 날).
- 자정을 넘겨 화면을 켜 두면 다음 렌더 때에야 오늘이 바뀐다(타이머 없음).

## 3단계 조각 1-2 (2026-10-26): 기록 수정(S8) 화면
`pages/ReviewPage.tsx`(수정 모드 `mode="edit"` 추가, 새 페이지 없음), `App.tsx`(`/meal/:mealId/edit` 1개), `pages/MealDetailPage.tsx`([수정] 버튼, "수정했어요" 3초). `tsc -b`·`npm run build` 통과, AI 호출 0회, 개발 서버 시험 안 함.

### 구조
- 수정 모드: 넘겨받은 state는 쓰지 않고 `getMeal` 1회 → `done`이면 편집기, 아니면(없음 포함) 상세로 replace. 편집기·`onBusyChange` 잠금·검증·오프라인 안내·나가기 확인은 결과 확인과 같은 코드. 다른 점만 분기: 제목 "기록 수정", 날짜 입력(`type=date`, `max=오늘`, 미래 값은 onChange에서 버림), 음식 0개 문구, [수정 저장], 나가기·저장 뒤 목적지가 상세(`state.edited`), `beforePhotoStore.remove` 생략. dirty에 날짜 변경 포함.
- 상세: [수정]·[삭제] 2칸. [수정]은 push(`state.fromDetail`)로 이동(아래 1번).

### 스펙과 다르게 정한 점
1. (2026-10-27 사용자 결정으로 바꿈) [수정]은 push(`state.fromDetail`)로 들어간다. 수정 화면에서 브라우저 뒤로 가기·‹·저장 모두 상세로 가고, 상세에서 들어왔으면 `navigate(-1)`로 한 칸 뒤의 상세로 돌아가 기록이 [홈, 상세]로 남는다. 저장 뒤 "수정했어요"는 `lib/flash.ts`(메모리, 한 번만)로 넘긴다. 주소로 바로 연 수정 화면은 상세로 replace(`state.edited`).

### 남은 이슈
- 저장 성공은 `saveMeal`의 done → done 수정(`editedAt`)과 규칙 변경(firebase-engineer 동시 작업)에 달려 있다. 그전에는 `MEAL_SAVE_REJECTED`.
- "수정했어요"는 history state라 상세에서 새로 고침하면 다시 3초 보인다.

## 3단계 조각 2 (2026-10-27): 목표 설정 화면(S6)
`pages/GoalPage.tsx`(새 파일, `/goal`, lazy), `App.tsx`(경로 1개), `pages/HomePage.tsx`(목표 구독·카드·안내). 계산은 `analysis/goal.ts`, 저장·구독은 `data/goals.ts`(firebase-engineer 구현) 그대로 쓴다. `tsc -b`·`npm run build` 통과, AI 호출 0회, 개발 서버 시험 안 함.

### 화면 구성
- 위에서부터 성별(남성·여성) → 나이(만)·키·몸무게(문자열로 들고 계산 때만 파싱, inputMode numeric·decimal, 칸 아래 이유) → 활동량 5개(세로 버튼) → 목표 감량·유지·증량 → 추천 목표 카드(기초대사량·하루 소모량, 목표 kcal·탄·단·지 입력칸) → 고지 문구 → 아래 고정 [저장].
- 매 렌더 `validateGoalInput → computeGoal → applyOverride`로 바로 재계산. 입력이 다 차기 전에는 "성별·나이·키·몸무게를 넣으면 바로 계산해 드려요".
- 직접 조정: 칸을 고치면 그 키가 override(문자열)로 남고 "직접 조정" 배지와 "추천 ○○"를 보인다. 조정이 하나라도 있으면 [추천값으로](override 전부 지우기). 목표 kcal 칸 아래에 "최소 ○○kcal(기초대사량|하루 소모량)"(`targetKcalFloor`). `applyOverride`의 errors는 카드 아래 빨간 글씨, 있으면 [저장] 비활성.
- 만 18세 미만(나이 칸만 맞아도): 감량·증량 비활성, 선택 표시는 유지, 스펙 안내 문구. clamped면 스펙 문구.
- 처음 열 때 `subscribeGoal` 첫 값으로만 폼을 채운다(`filled` ref). 오류면 빈 폼 + "저장된 목표를 불러오지 못했어요". 기본값: 성별 없음, 활동량 주 1~3회, 목표 유지.
- 저장: `saveGoal(uid, 검사한 input, override)`. 10초(오프라인이면 1.5초) 넘으면 "연결이 느려요. 연결되면 자동으로 저장돼요." + [홈으로]. 오류 코드 3개별 문구(`GOAL_INVALID`는 이유도).
- 방문 기록: 홈의 링크는 push + `state.fromHome`. 저장·‹는 `fromHome`이면 `navigate(-1)`, 아니면 `navigate('/', { replace: true })`. 안내는 `setFlash('goal:saved' | 'goal:pending')`.
- 홈: `subscribeGoal` 구독. 첫 값 전에는 아무것도 안 보임. 목표 없음 → 합계 아래 "목표 설정하기" 카드(한 줄 설명), 있음 → 오른쪽 정렬 작은 줄 "하루 목표 ○○kcal · 수정". 구독 오류(첫 값 전) → "목표를 불러오지 못했어요 · 목표 설정". flash를 읽어 "목표를 저장했어요"(대기 중이면 "… 연결되면 올라가요.")를 3초.

### 스펙과 다르게 정한 점
1. 칸별 이유는 `validateGoalInput`의 문구를 칸에 나누지 않고 `INPUT_RANGE`로 화면에서 칸마다 따로 만든다(문구 앞 "나이는/키는"을 빼고 칸 아래에 둔다). 계산 여부는 여전히 `validateGoalInput` 결과로 정한다.
2. 오프라인 대기 중 [홈으로]로 나가면 안내를 "목표를 저장했어요. 연결되면 올라가요."로 구분했다.
3. [추천값으로]는 칸별이 아니라 하나(조정 전부 지우기)다.
4. 홈의 목표 줄은 보고 있는 날짜와 관계없이 현재 목표를 보인다(지난 날 비교 목표는 다음 조각의 막대에서 `subscribeGoalForDate`로).

### 남은 이슈
- 홈 목표 영역의 고지 문구는 다음 조각(먹은 양/목표 막대)과 함께 넣는다.
- `subscribeGoal`이 첫 값을 주지 않으면 S6은 "불러오는 중…"에 머문다(자리표시 상태일 때). 구현 뒤 브라우저 확인 필요.
- 나가기 확인은 넣지 않았다(지시대로).

## 2026-10-27 결과 화면 수정
사용자가 결과 화면에서 찾은 문제 3개 중 화면 쪽. `ReviewPage`·`CaptureAfterPage`·`CaptureBeforePage`·`FoodCard`·`ReviewEditor`·`captureText.ts`·`data/meals.ts`. `tsc -b`·`npm run build` 통과, AI 호출 0회, 개발 서버 시험 안 함.

### 바꾼 것
- **영어 경고:** "확인해 주세요" 목록은 `koreanWarnings(analysis.warnings)`로 거른다(예전에 저장·캐시된 분석 포함). 화면에 보이는 Gemini 글은 이것뿐이다(`location`은 어느 화면에도 보이지 않음). 저장되는 `warnings`는 바꾸지 않는다.
- **불확실한 남긴 비율(null):** 카드 안내를 "사진이 먹기 전과 달라 보여요. 다시 찍거나 남긴 양을 직접 골라 주세요"(먹은 후 분석이 있었음) / "남긴 양을 직접 골라 주세요"(`WARN_NO_AFTER` 또는 수정 모드)로. `ReviewEditor`가 `mode`와 `warnings`로 정해 `FoodCard`에 `ratioHint`로 넘긴다. 빠른 선택 [다 먹음 0%]·[반 남김 50%]·[그대로 100%] + 슬라이더. 비율 표시는 "아직 안 고름", 합계 상자에 "남긴 양을 고르면 합계가 바뀌어요(n개 남음)".
- **저장 막기:** `ReviewPage.canSave`는 null 항목이 있으면 false, 바닥에 "남긴 양을 고르지 않은 음식이 n개 있어요…". `saveMeal`도 같은 조건이면 `MEAL_SAVE_REJECTED`. `saveReview`는 null 허용 그대로.
- **다시 찍기:** `CaptureAfterPage.runAfter`는 분석 → 조립 뒤 null 항목이 있으면 먹기 전 사진을 지우지 않고 `saveReview`도 하지 않는다(문서 awaiting_after 그대로). S4에 state `retake: true`. S4는 `retake` + null 항목 + 결과 확인 모드면 [먹은 후 사진 다시 찍기](바뀐 값 있으면 "저장하지 않고 나갈까요?" 뒤 `/meal/:id/after`로 replace). 이 상태에서 저장하면 awaiting_after → done, 저장 뒤 `beforePhotoStore.remove`.
- **분당 한도:** `describeAnalysisError`가 `quota`+`minute`이면 "잠시 후 다시 시도해 주세요" + `retry: true`. S2·S3은 이때 [다시 시도](같은 압축본을 화면 메모리에서 다시 보냄, 누를 때만)·[다시 찍기]·[직접 입력|남긴 양 직접 고르기]. 일일 한도 문구는 그대로.

### 스펙과 다르게 정한 점
1. 먹기 전 사진 삭제를 "먹은 후 분석 성공 직후"에서 "분석과 영양값 조립이 끝나고 null 항목이 없을 때"로 옮겼다. 조립이 실패·중단되면 사진이 남아 다시 시도할 수 있다.
2. `quotaScope`가 없는 429는 예전 문구("분석 요청이 잠시 몰렸어요")와 [다시 찍기] 그대로 둔다.
3. 빠른 선택 [반 남김]을 더했다(지시는 [다 먹음]·[그대로]).

### 확인한 것·남은 이슈
- 새로고침: react-router가 `location.state`를 history에 두므로 새로고침해도 `readEntryState`·`retake`가 그대로 읽힌다(awaiting 안내로 빠지지 않는다). state 없이 주소로 열면(새 탭 등) 문서가 awaiting_after라 "먹은 후 사진을 아직 안 찍었어요 → 남은 음식 찍기"가 나오고, 먹은 후 분석 결과는 저장되지 않았으니 다시 찍게 된다(의도한 회복 경로).
- 예전 needs_review 문서에 null 항목이 있으면 "다시 찍거나…" 안내가 나오지만 [다시 찍기]는 없다(먹기 전 사진이 이미 지워졌고 needs_review → awaiting_after는 규칙에 없음). 고르면 저장된다.
- 같은 먹은 후 사진을 다시 고르면 분석 결과 캐시가 같은 null 결과를 돌려줄 수 있다(분석 모듈 쪽 판단).
- 브라우저 확인 필요: 빠른 선택 3개 버튼 폭(작은 폰), 다시 찍기 → S3 → 다시 S4 흐름, 분당 한도 [다시 시도].

### 덧붙임: 남긴 비율 안내 나누기 (2026-10-27, 계약 `d747fe6`)
- 그릇이 먹은 후 사진에 안 보임(`ratio_assumed: 'not_visible'`, `remaining_ratio` 0): 남긴 비율 칸 아래 노란 안내 "그릇이 안 보여서 다 드신 걸로 했어요. 아니면 바꿔 주세요", 0%·[다 먹음] 선택 상태로 보임. 저장은 막지 않음. 노란 테두리·먼저 보이기(`isFlagged`)에 포함.
- 다른 음식·장면처럼 보임(`remaining_ratio` null): 기존 그대로 "확인 필요" + 저장 막음. `CaptureAfterPage` 다시 찍기 판단도 null만 봄(안 바꿈).
- 고르는 경로(슬라이더·빠른 선택)는 모두 `setRemainingRatio`(분석 모듈)로 바꿈. 같은 0%를 다시 눌러도 표시를 지움. 슬라이더는 값이 안 바뀌면 onChange가 없어 `onPointerUp`에서 미리 고른 상태일 때만 같은 값으로 한 번 더 부름.
- "확인 필요" 배지는 지금처럼 `needs_review`만 봄. `ratio_assumed`면 `remaining_ratio`가 0이라 배지는 확신 낮음(confidence < 0.6)일 때만 붙음.
- 기록 상세(S7) `FoodRow`: 저장된 기록에 `ratio_assumed`가 남아 있으면 남긴 비율 옆에 작게 "(그릇이 안 보여 다 먹음으로 둠)". `Field` 값을 ReactNode로 넓히고 오른쪽 정렬.
- 남은 이슈: 브라우저 확인 안 함(샘플 결과에 `ratio_assumed` 항목이 아직 없음). 기록 수정(S8)에서도 같은 카드라 표시가 남아 있으면 그대로 보임.

## 3단계 조각 3 (2026-10-27): 하루 요약 목표 대비 비교(S1)
`components/GoalBars.tsx`(새 파일), `pages/HomePage.tsx`. 계산은 `analysis/goal.ts`의 `compareToGoal`, 그날 목표는 `data/goals.ts`의 `subscribeGoalForDate` 그대로 쓴다. `tsc -b`·`npm run build` 통과, AI 호출 0회, 개발 서버 시험 안 함.

### 화면 구성
- 합계 카드 아래 목표 카드: 머리줄 "하루 목표 ○○kcal"(오늘) / "이 날 목표 ○○kcal"(지난 날) + 오른쪽 [목표 수정](`/goal`, push + `state.fromHome`, 높이 44px). 그 아래 `GoalBars`, 작은 글씨 고지(스펙 4.7절 문구).
- `GoalBars`: 칼로리·탄수화물·단백질·지방 네 줄. 줄마다 "먹은 양 / 목표"(kcal 정수 `formatKcal`, g `formatMacro`), 막대(길이 `min(ratio, 1)`, 초록), 오른쪽 아래 "남은 양 ○○" 또는 "○○ 초과"(막대·글씨 주황, 글씨 굵게). `role="progressbar"` + `aria-valuenow`(0~100%) + `aria-valuetext`("1,200 / 2,060kcal, 남은 양 860kcal").
- 그날 목표: `subscribeGoalForDate(uid, dateKey)`를 `[uid, dateKey]`로 구독(날짜가 바뀌면 다시 구독, 결과에 `forDate`를 붙여 이전 날짜 값은 첫 값 전으로 본다). 비교 값은 `summary.totals`(done만)이라 남은 양 = 그날 목표 − 합계.
- 그날 목표 기록 없음: 현재 목표도 없으면 "목표 설정하기" 카드(그대로), 현재 목표가 있으면 작은 글씨 "이 날은 목표를 정하기 전이라 합계만 보여요".
- 깜빡임 방지: 그날 목표의 첫 값과 합계의 첫 값이 모두 오기 전에는 목표 영역을 비운다(기록 없음 갈래는 현재 목표 첫 값도 기다린다). 구독 오류면 "목표를 불러오지 못했어요 · 목표 설정".
- 목표 저장 뒤: `saveGoal`이 `goals/{오늘}`을 같은 배치로 쓰므로 오늘 구독(`dateKey <= 오늘` 가장 늦은 것)에 그대로 들어온다(오프라인 대기 쓰기도 로컬 쿼리에 보인다). "목표를 저장했어요" flash는 그대로.

### 스펙과 다르게 정한 점
1. 오늘인데 날짜별 기록이 없고 현재 목표는 있으면(날짜별 기록을 쓰기 전에 저장한 예전 데이터) 현재 목표로 비교한다. 스펙 "오늘은 현재 목표와 같다"를 지키려는 것이고, 지난 날에는 쓰지 않는다.
2. 보이는 자리에서 0이 되는 초과(예: 0.3kcal)는 초과로 치지 않고 "남은 양 0kcal"로 둔다. 목표가 0g인데 먹었으면 막대를 꽉 채우고 초과로 보인다.
3. 지난 날의 [목표 수정]도 현재 목표를 고치는 S6으로 간다(저장하면 오늘부터 쓰는 목표. 지난 날 목표는 바뀌지 않는다).
4. 고지 문구는 `GoalPage`의 상수를 가져오지 않고 `HomePage`에 같은 문구로 따로 뒀다(`GoalPage`는 lazy라 홈 번들에 끌어오지 않으려고).

### 남은 이슈
- 브라우저 확인 필요: 막대 네 줄의 높이(작은 폰에서 기록 목록이 화면 아래로 밀림), 지난 날 → 목표 정하기 전 날 문구, 목표 저장 직후 오늘 막대 반영.
- 끼니별 목표 비교는 없다(스펙에도 없음).

## 3단계 조각 3-1 (2026-10-27): 달력(S10 `/calendar?month=YYYY-MM`)
`pages/CalendarPage.tsx`(새 파일), `App.tsx`(lazy 경로), `pages/HomePage.tsx`(날짜 글자·달력 아이콘). 계산은 `lib/calendar.ts`, 조회는 `subscribeDaysInRange`·`subscribeGoalsUpTo`(작성 시점 자리표시라 화면은 "불러오는 중…"에 머문다) 그대로 쓴다. `tsc -b`·`npm run build` 통과, AI 호출 0회, 개발 서버 시험 안 함.

### 화면 구성
- 헤더: ‹(aria-label "홈으로") + 작은 "달력". 아래 줄 "◀ 지난달" · 제목 "2026년 10월"(h1) · "다음 달 ▶"(이번 달이면 비활성). 달 이동은 `?month`만 replace, `location.state`를 그대로 넘겨 `fromHome`을 지킨다.
- 격자: 일~토 머리줄(일 빨강·토 파랑) + `monthCells` 칸. 칸은 정사각(`aspect-square`, 최소 44px) 버튼으로 날짜 숫자 위, 그날 kcal(`formatKcal`, 기록 없으면 빈칸) 아래. kcal 6자 이상(예: "12,345")은 9px, 그 밖은 11px(sm 이상 한 단계 큼).
- 색: `calendarTone(kcal ?? null, goalForDate(goals, D)?.target_kcal ?? null)` → 초록 `emerald-100`·주황 `orange-100`·파랑 `sky-100`·회색 `gray-200`, null이면 흰 바탕. 오늘은 안쪽 초록 테두리(`ring-2`)와 굵은 숫자, `aria-current="date"`. 오늘 이후는 `opacity-40` + `disabled`(누르기 함수에서도 막음), 색 없음.
- aria-label: "10월 27일 (화), 오늘, 1,850kcal, 목표 근처" 꼴(상태: 목표 근처·목표 초과·목표 미달·기록 없음·아직 오지 않은 날·불러오는 중).
- 범례: 초록 "목표 근처 90~110%"·주황 "초과"·파랑 "미달"·회색 "기록 없음" + 한 줄 설명("숫자는 그날 먹은 kcal… 목표가 없으면 색 없이 숫자만…").
- 불러오기: 두 구독 결과에 `forMonth`를 붙여 달을 옮긴 직후 이전 달 값은 첫 값 전으로 본다. 두 구독의 첫 값(또는 오류)이 모두 와야 숫자·색을 보인다(숫자 먼저, 색 나중으로 깜빡이지 않게). 그전에는 `role="status"` 줄에 "불러오는 중…". 기록 오류면 "기록을 불러오지 못했어요…" + 숫자·색 없음, 목표 오류만 나면 "목표를 불러오지 못해 색 없이 보여요" + 숫자만.
- 홈(S1): 날짜 글자 묶음("오늘" + "10월 27일 (화)", 지난 날은 날짜)이 링크. 달력 아이콘(인라인 SVG, aria-label "달력", 44px)은 오늘이면 날짜 묶음 오른쪽, 지난 날이면 [오늘로] 오른쪽(작은 폰에서 긴 날짜 h1 옆에 두면 가운데 칸 160px을 넘어서). 날짜 줄 높이는 전과 같다. 둘 다 `/calendar?month=<보고 있는 날짜의 달>`, push + `state.fromHome`.

### 방문 기록
- 홈 → 달력: push(`state.fromHome`). 달 이동: replace(쌓이지 않음).
- ‹: 홈에서 왔으면 `navigate(-1)`, 주소로 바로 열었으면 `navigate('/', { replace: true })`(GoalPage와 같음).
- 날짜 누르기: 홈에서 왔으면 `await navigate(-1)` 뒤 `navigate(homeHref(D), { replace: true })` → 기록은 [..., 홈(D)] 한 칸. 주소로 바로 열었으면 달력 자리를 `homeHref(D)`로 replace.
  - 근거: 달력 자리를 바로 replace하면 [홈(X), 홈(D)]로 홈이 두 칸 쌓이고 뒤로 가기 때 홈(X)가 한 번 더 나온다(홈 날짜 이동은 원래 replace라 홈은 한 칸이 맞다). react-router 8.5의 `router.navigate(-1)`은 POP 이동이 끝날 때 풀리는 promise를 돌려주고(`pendingPopstateNavigationDfd`, `useNavigate`도 그걸 await) 그 뒤 replace는 돌아간 홈 자리를 바꾼다. 경쟁 상태가 없고, flash(값 하나짜리 boolean 키라 날짜를 못 넘김)나 popstate 리스너가 필요 없다. 이동 중 두 번 누름은 ref로 막는다.
  - 대가: 돌아간 홈(X)가 한 프레임 그려질 수 있다(같은 날짜면 replace도 같은 주소라 무해).

### 다르게 정한 점
1. 기록 오류 때는 회색 칸도 그리지 않는다(기록 없음으로 잘못 보이지 않게). 목표 오류 때는 숫자만.
2. 미래 날짜에는 색을 넣지 않는다(목표가 있어도 회색 "기록 없음"이 아님).
3. "이번 달로" 버튼은 두지 않았다(지시에 없음, 다음 달 ▶ 비활성으로 충분하다고 봄).

### 남은 이슈
- data 쪽 구현(firebase-engineer)이 들어온 뒤 브라우저 확인 필요: 360px에서 7칸·kcal 글씨, 날짜 누르기 → 홈(D) → 뒤로 가기 때 홈이 한 칸인지, 달 이동 뒤 새로고침해도 ‹가 홈 한 칸인지, 오프라인 대기 기록이 달력 숫자에 들어오는지.
- 그날 목표 기록이 없고 현재 목표만 있는 오늘(예전 데이터)은 홈은 현재 목표로 비교하지만 달력은 색 없이 숫자만 보인다(`goalForDate`만 씀).

## 기록 보기 히트맵 (2026-10-27, S10 `/calendar?month=YYYY-MM` 다시 만듦)
`pages/CalendarPage.tsx`(상태·조회·방문 기록), 새 컴포넌트 `components/record/MonthNav.tsx`·`MetricToggle.tsx`·`RecordHeatmap.tsx`, `pages/HomePage.tsx`(접근성 이름만). 계산은 `lib/calendar.ts`(`heatLevelFor`·`monthGrid`·`gridRange`·`monthSummary`·`goalForDate`·`targetOf`·`metricOf`) 그대로, 옛 `calendarTone`·`monthCells`는 더 쓰지 않는다. `tsc -b`·`npm run build` 통과, AI 호출 0회, 브라우저 확인 안 함.

### 구조(아래 섹션에 넘기기)
- 페이지가 상태를 갖는다: 보고 있는 달 = `?month`(`parseMonth`), 고른 항목 `metric` = `useState(readMetric)`(localStorage `record-view-metric`, 읽기·쓰기 try/catch, 못 읽거나 모르는 값이면 `kcal`).
- 조회도 페이지: `subscribeDaysInRange(uid, gridRange.start, gridRange.end)` → 날짜별 `totals`(Nutrients) Map, `subscribeGoalsUpTo(uid, gridRange.end)`. `forMonth` 처리·두 구독 첫 값 뒤에만 숫자·색은 전과 같다.
- `RecordHeatmap`은 그리기만(props: `month`·`today`·`metric`·`ready`·`days`·`goals`·`onOpenDay`). 아래 섹션(① 주간 추이 ② PREMIUM 주간 리포트 ③ PREMIUM 월간)은 페이지 `</main>` 앞 주석 자리에 같은 `metric`·`month`를 props로 받아 붙인다.

### 화면 구성
- 헤더: ‹(aria-label "홈으로") + h1 "기록 보기".
- 조작 줄(`flex-wrap justify-between`): 왼쪽 `MonthNav` "◀ 10월 ▶"(◀·▶ 44px, aria-label "지난달"·"다음 달", 이번 달이면 ▶ 비활성, 올해가 아니면 h2 위에 작은 "2025년"), 오른쪽 `MetricToggle` [칼로리|탄|단|지](`role="group"` "항목 선택", 버튼 `aria-pressed`, aria-label 칼로리·탄수화물·단백질·지방, 고른 것 `bg-emerald-600` 흰 글자). 달 이동은 전과 같이 `?month` replace + `state` 유지.
- 격자: 월~일 머리줄(토 `text-blue-600`, 일 `text-red-600`) + `monthGrid` 칸(앞뒤 달 날짜 포함, 빈칸 없음). 칸 = `aspect-square min-h-11` 버튼, 위에 날짜 숫자(`text-xs`, sm `text-sm`), 아래 둥근 상자(`rounded-full bg-white/90 ring-1 ring-black/5 text-gray-900`, `whitespace-nowrap tabular-nums`, 6자 이상 9px·그 밖 10px, sm 11px)에 그날 값(kcal `formatKcal`, g `formatGrams` 정수). 기록 없으면 상자 없음. 목표 범위면 오른쪽 위 작은 ✓(aria-hidden).
- 360px 폭: 격자 칸 약 45px, "12,345"도 상자 약 35px. 조작 줄은 약 320px/328px로 한 줄, 넘치면 항목 선택이 다음 줄로(가로 스크롤 없음).
- 아래: 왼쪽 범례 4칸(진하기 1~4 바탕·글자색 그대로, "0~50%"·"50~90%"·"90~110% ✓"·"110%+", `ul` aria-label "진하기: 그날 목표 대비") + "목표가 없는 날은 기준량(2,000kcal) 대비"(g 항목은 275g·100g·56g). 오른쪽 월 요약 두 줄 "10월 · 기록 12일" / "하루 평균 1,850kcal"(g 항목은 g, 기록 0일이면 평균 줄 없음, 앞뒤 달 날짜 제외 = `monthSummary`).
- 상태 줄(`role="status"`): 불러오는 중… / 기록 오류 / 목표 오류("목표를 불러오지 못해 색 없이 보여요.") 전과 같다.
- aria-label: "10월 27일 (화), 오늘, 1,850kcal, 목표의 90%, 목표 범위" / g 항목 "…, 탄수화물 230g, 기준량의 84%" / "…, 기록 없음" / "…, 아직 오지 않은 날" / "…, 불러오는 중". 오늘 `aria-current="date"`.
- 홈: 달력 아이콘 aria-label "달력" → "기록 보기". 날짜 글자 링크는 h1을 그대로 두고 안에 `sr-only` ", 기록 보기"를 붙였다(링크 이름 "오늘 10월 27일 (화), 기록 보기").

### 색·진하기(Tailwind v4 emerald)
| 단계 | 기준 | 칸 바탕 | 글자 |
| --- | --- | --- | --- |
| 0 기록 없음 | - | `bg-gray-100` | `text-gray-700` |
| 1 | 50% 미만 | `bg-emerald-100` | `text-emerald-950` |
| 2 | 50~90% | `bg-emerald-300` | `text-emerald-950` |
| 3 목표 범위 ✓ | 90~110% | `bg-emerald-500` | `text-emerald-950`(약 6:1) |
| 4 | 110% 초과 | `bg-emerald-700` | `text-white`(약 5.4:1) |
- 오늘 테두리 `ring-2 ring-inset ring-gray-900`(가장 진한 칸 위에서도 약 3.3:1) + 굵은 숫자.
- 앞뒤 달의 지난 날짜: 값·색 그대로 `opacity-40`, 누르면 그날 홈. 미래 날짜(이번 달 남은 날, 다음 달 날짜): 바탕 없이 `text-gray-300`, `disabled`.
- 불러오는 중·기록 오류: 흰 칸(`ring-1 ring-inset ring-gray-100`), 숫자·색 없음. 목표 오류: 바탕 0단계(회색) + 값 상자만.

### 다르게 정한 점
1. 올해가 아닌 달의 연도는 "12월" 위 작은 글자 줄로 둔다(한 줄 "2025년 12월"이면 360px에서 항목 선택과 한 줄에 안 들어감). 제목 h2의 글자는 "2025년 12월"로 읽힌다.
2. 월 요약을 두 줄로 나눴다(범례와 나란히 두려고). 화면 읽기에는 둘째 줄 앞에 "·"를 숨겨 넣었다.
3. 칸 값 상자에 단위를 붙이지 않았다(46px 칸). 단위는 항목 선택·범례·월 요약·aria-label에 있다.
4. 목표를 못 불러오면 기준량으로도 칠하지 않는다(목표가 있는 사람의 날이 기준량 색으로 잘못 보이지 않게).
5. 오늘 테두리를 emerald-600에서 gray-900으로 바꿨다(emerald-500·700 칸 위에서 안 보여서).
6. 옛 안내 문구("숫자는 그날 먹은 kcal이에요…")는 뺐다. 조작 줄은 sticky가 아니다(아래 섹션이 생길 때 정한다).

### 남은 이슈
- 브라우저 확인 필요: 360px에서 조작 줄 한 줄·칸 숫자·범례와 요약 나란히, 진하기 4단계 구분, 앞뒤 달 칸 누르기 → 그날 홈 → 뒤로 가기 때 홈 한 칸, 항목 바꾼 뒤 새로고침해도 기억되는지, 사생활 보호 모드에서 칼로리로 시작하는지.
- 전과 같이 그날 목표 기록이 없고 현재 목표만 있는 날(예전 데이터)은 기준량 대비로 칠하고 ✓가 없다(`goalForDate`만 씀).
