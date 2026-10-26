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
