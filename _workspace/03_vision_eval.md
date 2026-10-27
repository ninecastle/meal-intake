# 03 Vision 평가 기록

## 스파이크 (0단계, 2026-10-26 16:32~16:35 KST, vision-ai-engineer)

### 조건
- 스크립트: `spike/ai_spike.mjs` (`node spike/ai_spike.mjs <1..5>`, 실행 1번 = 호출 1회, 재시도 없음). 원시 결과는 `spike/results/callN.json`(커밋 안 함).
- SDK: `web/node_modules`의 `firebase` 13.1.0, `firebase/ai` + `GoogleAIBackend`, Node 24.22.1. 웹 설정 객체(API 키)만 사용, App Check 없음(AI Logic API 강제 꺼짐 상태). 엔드포인트 `firebasevertexai.googleapis.com/v1beta/projects/meal-intake-2026/models/...:generateContent`. **Node에서 SDK가 그대로 동작했다**(REST 대안 불필요).
- 시험 이미지: `spike/bibimbap.jpg` (커밋 안 함). 출처 https://commons.wikimedia.org/wiki/File:Dolsot-bibimbap.jpg (CC BY 2.0, 작성자 Sous Chef), Commons 1280px 썸네일(1280×854 JPEG, 241KB)을 그대로 base64 inline data로 전송.
- 호출 A 축약: 시스템 지시 A 요약 + `"BEFORE 사진"` + 이미지, `responseMimeType: application/json` + `Schema` 클래스 응답 스키마 A(items[id,name,location,before_grams,confidence,per_100g_guess], warnings). thinking은 3.x 모델에 `thinkingConfig.thinkingLevel = LOW`.
- 호출 C 축약: 프롬프트 c1 원문, 음식명 "돌솥비빔밥", `tools: [{ googleSearch: {} }]`, 응답 스키마 없음.

### 결과
| # | 모델 | 요청 | 상태 | 지연 | 응답 요약 | grounding / searchEntryPoint | 토큰(prompt / out / total) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | gemini-3.5-flash-lite | 이미지 + 스키마 A | 성공 (STOP) | 4.2초 | 스키마대로 JSON. 1항목 "돌솥비빔밥", 450g, conf 0.95, 100g당 150kcal·탄22·단5·지4 | 해당 없음 | 1280(이미지 1080) / 140 / 1420 |
| 2 | gemini-3.8-flash | 같은 요청 | 성공 (STOP) | **170.7초** | 스키마대로 JSON. "돌솥비빔밥", 450g, conf 0.85, 140kcal·탄24·단4.5·지3.2 | 해당 없음 | 1280(이미지 1080) / 145 / 1425 |
| 3 | gemini-3.5-flash-lite | googleSearch 그라운딩 | **HTTP 429** | 0.9초 | 아래 원문 | 없음 | 없음 |
| 4 | gemini-2.5-flash-lite | googleSearch 그라운딩 | **HTTP 404** | 1.0초 | 아래 원문 | 없음 | 없음 |
| 5 | gemini-2.5-flash-lite | 그라운딩 + 스키마 | 실행 안 함 | - | 4가 실패해 조건 미충족 | - | - |

오류 원문:
- #3 (429): `[429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit.` errorDetails는 `google.rpc.Help`(링크) 하나뿐이고 **`QuotaFailure`·`quotaId`·`quotaValue`가 없다.** 같은 모델의 이미지 호출(#1)이 2분 전에 성공했고 그 사이 같은 모델 호출은 없었으므로 분당 한도 소진으로 보기 어렵다. 무료 등급에서 3.x 모델의 검색 그라운딩 한도가 0인 것으로 해석한다(R1 예상과 일치, 한도 값 자체는 미확인).
- #4 (404): `[404 Not Found] This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).`

### 관찰
- 두 모델 모두 응답 스키마를 지켰고, 결과(이름·중량)가 같았다. 사진 1장 기준 입력 토큰은 1280(이미지 1080)으로 두 모델이 같다. 끼니당 호출 A+B 합쳐 대략 4천 토큰 안쪽으로 예상.
- 3.8 Flash의 170초는 1회 측정이라 대기열 지연일 수 있지만, 스펙 4.2절의 시도당 20초 제한이면 이 호출은 시간 초과다. thinking 토큰 수는 usageMetadata에 나오지 않았다.
- 무료 한도 값(분당·일일)은 이번에도 알아내지 못했다(429 본문에 quota 정보 없음).
- 3.5 Flash-Lite는 `thinkingLevel: LOW`를 오류 없이 받았다(MINIMAL은 시험 안 함).

### 판정 제안 (결정은 리더·사용자)
- **U1 기본 모델: `gemini-3.5-flash-lite` 유지.** 같은 사진에서 3.8 Flash와 같은 결과를 4.2초에 냈고, 3.8 Flash는 170초로 20초 제한을 크게 넘었다. 3.8 Flash 비교는 10/29 5쌍 측정에서 지연을 다시 보고 판단하되, 운영 후보에서는 사실상 제외를 권한다.
- **U3: `VITE_SEARCH_GROUNDING=off`(기본값).** 기본 모델 그라운딩은 429(무료 등급 한도 없음으로 추정), 2.5 Flash-Lite는 신규 사용자에게 404로 막혀 "호출 C만 2.5로 보내기" 안은 불가. 켜 두면 매 끼니 실패 호출로 지연·한도만 쓴다. 코드는 계약대로 만들어 두고(유료 등급에서 켜면 동작), 출처는 DB → AI 추정 2단계로 운영, 발표 문구는 스펙 U3안("검색 단계는 유료 등급에서 동작")을 쓴다. 이 경우 핸드오프의 "그라운딩 결과 저장 약관 확인"은 불필요해진다. `CLAUDE.md` 문구를 바꿀지는 사용자 결정.
- 참고: 404 문구가 Interactions API를 권하지만, Firebase AI Logic(Spark, 클라이언트) 범위 밖이므로 검토하지 않았다.

## DB 변환 (2026-10-26, 1단계 조각 1)
- `node web/scripts/build-mfds-db.mjs` → `web/public/data/mfds-foods-20261006.json`(스펙 3.5 위치, 정적 파일이라 번들 밖), 통계 `web/scripts/build-mfds-db.stats.json`
- [L] 대조: 입력 19,738행(100g 13,954 · 100ml 5,784), 탄 빈 값 12,777 · 지 빈 값 13,319, 원문 고유 이름 15,658. 모두 일치
- 버린 행 3,874: 범위 밖 19, 같은 이름에 100g 행이 있는 100ml 행 2,165, 고형 분류의 ml 전용 행 1,690(이름 775개). 에너지·단백질 빈 행 0, 숫자 변환 실패 0
- 정규화 고유 이름 11,381 → 같은 이름 병합(4.5.3 (c)) 후 foods 10,606(그중 ml 환산 1,220). 대표 행의 탄 null 7,472 · 지 null 7,813(둘 다 7,398). 그룹 816, 세부명 키 9,704
- 크기 1,710,496B(1.63MB), gzip 275KB, brotli 207KB. 목표(2.5MB / 600KB) 안
- 액체 분류(ml 전용 이름 → 모두 포함): 음료 및 차류 985, 국 및 탕류 126, 찌개 및 전골류 93, 죽 및 스프류 16. 나머지 ml 전용 이름(볶음류 118, 생채·무침류 118, 밥류 92, 나물·숙채류 72, 구이류 66, 면 및 만두류 53, 튀김류 52, 조림류 50, 찜류 47, 전·적 및 부침류 34, 유제품류 및 빙과류 34 외)은 제외

### 스펙과 다르게(또는 새로) 정한 점
1. 정규화: 스펙의 "공백·가운뎃점·쉼표·마침표·하이픈 삭제"를 "글자·숫자·`_` 외 모두 삭제"로 넓혔다(괄호 내용 삭제·NFKC·소문자는 그대로).
2. 세부명 키: `_`가 여러 개면 첫 조각 A와 마지막 조각 B로 만든다("떡볶이_고추장_메추리알" → 메추리알떡볶이). 파일에 `d`(세부명 키 → foods 인덱스, 이름 키와 같은 키는 뺌)로 넣었다(3.5 인터페이스 확장).
3. `s`(1인분 참고량): 원본 `1인(회)분량 참고량`이 19,738행 모두 비어 있어 0건. 음식 추가 때 중량 기본값은 100g 규칙만 남는다.
4. 별칭표는 `aliases.json` 대신 `web/src/analysis/nutrition/aliases.ts`(Node 스크립트와 Vite가 같은 파일을 import). 6개: 공기밥·흰쌀밥·흰밥·밥 → 쌀밥, 김치 → 배추김치, 계란말이 → 달걀말이.
5. 검색: `searchFoods`(정확 → 앞부분 → 포함, 기본 10개, 같은 단계는 그룹 먼저·짧은 이름 먼저, 별칭 대상은 정확 일치)와 스펙 4.3 계약 `searchFoodNames`(앞부분만, 8개)를 같은 내부 함수로 둔다. 같은 행은 한 번만 나온다.
6. 식품기원 순위: 가정식 > 외식(분석) > 급식·외식(재료량 기반) > 업체 제공.

### 위험 (리더 판단 필요)
- 4.5.3 (a)-3 때문에 제육볶음, 달걀후라이, 제육(돼지고기 수육) 같은 흔한 고형 음식 이름 775개가 DB에서 빠진다. 급식·외식 재료량 기반 행이 100ml 기준이라서다. 이 이름들은 AI 추정으로 간다. 10/29 측정에서 DB 일치율로 영향을 보고, 필요하면 분류별 밀도 환산 같은 대안을 정한다.

## 프롬프트 a1 (2026-10-26, 1단계 조각 2: 먹기 전 분석 `analyzeBefore`)
- 프롬프트: `prompt-template.md` 시스템 지시 A 원문 그대로(`web/src/analysis/beforePrompt.ts`, `PROMPT_VERSION_A = 'a1'`). 사용자 파트는 `BEFORE 사진` 텍스트 → 이미지 순서. 응답 스키마 A(Schema 클래스, 템플릿상 모든 필드 필수라 `optionalProperties` 없음), `thinkingLevel: LOW`, `maxOutputTokens: 4096`.
- 시험 호출 1회(18:14 KST, Node, `spike/bibimbap.jpg`, gemini-3.5-flash-lite, App Check 없음): 성공. 6.1초, STOP, 입력 1,394 토큰(이미지 1,080) · 출력 138 토큰. 결과 1개 `돌솥비빔밥` 450g, confidence 0.95, per_100g_guess 150/22/5/4(범위 통과). warnings 없음. 정리 함수(`parseBeforeText`) 통과. 스파이크 call1과 같은 결과(사진에 돌솥 하나만 있음). 반찬 여러 개 상차림은 10/29 샘플 측정에서 본다.

### 스펙과 다르게(또는 새로) 정한 점
1. 응답 정리 규칙(형식 검증): JSON 파싱 실패·`items` 배열 없음·유효 항목 0개는 형식 오류(재시도 대상). `items: []`는 `NO_FOOD_DETECTED`(재시도 안 함). 이름이 비었거나 중량이 0 이하·숫자가 아닌 항목은 빼고 경고. 중량은 정수 반올림 후 1~3000g으로 자르고, 잘랐으면 경고 + confidence 0.5 이하. confidence는 0~1로 자르고 빠지면 0.3, 1 초과 100 이하이면 100으로 나눈다. `per_100g_guess`는 kcal 0~900, 탄·단·지 0~100, 합 100 이하가 아니면 null. 항목 30개, 경고 10개 상한. id는 i1부터 다시 매긴다.
2. 오류 변환 표(스펙 4.4절 요구): 413 → `PHOTO_INVALID` / 429 → quota(오류 상세에 PerDay·daily가 있으면 `quotaScope: 'day'`로 재시도 안 함, 아니면 `'minute'`로 2초 뒤 1회) / 401·403 → app_check / 400·404·그 밖 4xx·`API_NOT_ENABLED`·스키마·설정 오류 → bad_request / 408·시간 초과 → timeout / 5xx → server / 상태 없는 `fetch-error`·`error`·TypeError → network / `parse-failed`·`response-error`·JSON·형식 실패 → invalid_response / promptFeedback 차단·finishReason SAFETY 등·빈 응답 → blocked(재시도 안 함). 재시도 대상은 network·timeout·server·quota(분당)·invalid_response. 사용자 취소는 `AbortError`를 그대로 던진다.
3. `AnalysisError`에 선택 필드 `quotaScope`를 더했다(스펙 5.2.2 "429 분당·일일 구분과 한도 모드"용). 시그니처는 그대로.
4. 시간 제한: 자체 타이머 20초(초과 시 요청 취소). SDK `timeout`은 안전망으로 21초.
5. 같은 사진 캐시: IndexedDB `meal-analysis-cache`, 저장소 `before`(조각 3용 `after`도 v1에서 같이 만듦). 키는 SHA-256(hex), 값은 `{ key, value(결과 JSON), at, model, prompt_version }`. 모델·프롬프트 버전이 다르거나 7일이 지나면 쓰지 않고, 쓰기 때 7일 지난 항목을 지운다. IndexedDB 작업은 1.5초 안에 안 끝나면 캐시 없이 진행. 세션 메모리 캐시도 함께 둔다. `crypto.subtle`이 없으면(비보안 컨텍스트) 캐시를 건너뛴다. 출처는 `getAnalysisOrigin(result)` → `{ source: 'live'|'cache'|'mock', analyzedAt, attempts }`(WeakMap, 반환 타입 그대로).
6. 목업: `VITE_AI_MOCK === '1'`이면 `__fixtures__/before-*.json`(지연 import, 배포 번들에 안 섞임) 중 이름순 첫 파일을 0.6초 뒤 같은 정리 함수로 돌려준다. `model: 'mock'`. 캐시는 쓰지 않는다. `getAnalysisMode()` → `{ mode: 'mock'|'live', model, promptVersions }`.
7. firebase 13.1의 `Part`는 `type` 구분 필드(`'text'`, `'inlineData'`)가 필수다. 앱 코드와 시험 호출 모두 이 필드를 넣었고 호출이 통과했다.

## 프롬프트 b1 (2026-10-26, 1단계 조각 3: 먹은 후 분석 `analyzeAfter`)
- 프롬프트: `prompt-template.md` 시스템 지시 B 원문 그대로(`web/src/analysis/afterPrompt.ts`, `PROMPT_VERSION_B = 'b1'`). 파트 순서: `먹기 전 음식 목록: [{id,name,location,before_grams}…]` → `BEFORE 사진` → 먹기 전 이미지 → `AFTER 사진` → 먹은 후 이미지. 먹기 전 사진이 없거나 읽지 못하면 BEFORE 두 파트를 빼고 `used_before_photo=false`, warnings 맨 앞에 "먹기 전 사진 없이 분석". 응답 스키마 B(`remaining_ratio`만 nullable), `thinkingLevel: LOW`, `maxOutputTokens: 4096`. 20초 제한·재시도·오류 변환은 `aiCall.ts` 그대로.
- 남긴 비율 정의(b1): `remaining_ratio` = 먹기 전 대비 **남은** 양, 0 = 다 먹음, 1 = 그대로. 그릇이 안 보이면 0(+confidence 0.5 이하), 그릇을 특정 못 하면 null.
- 시험 호출 1회(19:52 KST, Node, 먹기 전·먹은 후 모두 `spike/bibimbap.jpg` 같은 사진, 목록은 a1 결과 `i1 돌솥비빔밥 450g`(location은 재구성 "가운데 검은 돌솥"), gemini-3.5-flash-lite, App Check 없음): 성공. 2.4초, STOP, 입력 2,427 토큰(이미지 2장 2,160) · 출력 54 토큰. 결과 `i1 remaining_ratio 1.0, confidence 1.0`, warnings 없음. 기댓값(같은 사진 = 안 먹음 → 1에 가까움)과 일치. 정리 함수(`parseAfterText`) 통과.
- 관찰: 두 사진이 완전히 같아도 경고 없이 confidence 1.0을 줬다. "먹은 후 사진을 다시 찍었는지" 같은 확인은 모델에 기대지 않는다(필요하면 화면에서 두 사진 해시가 같을 때 안내). 반찬 여러 개 상차림·실제 먹은 후 사진은 10/29 샘플 측정에서 본다.

### 스펙과 다르게(또는 새로) 정한 점
1. 응답 정리 규칙: before에 없는 id·중복 id는 버리고 경고. 빠진 id는 `remaining_ratio=null`, `confidence=0` + 경고. 0~1 밖·숫자 아님은 자르지 않고 null + 경고(모델이 준 null은 경고 없이 그대로). confidence는 a1과 같은 규칙. 항목은 before 순서. 형식 오류(재시도 대상): JSON 파싱 실패, `items` 배열 없음, 응답 항목이 있는데 before id와 하나도 안 맞음. `items: []`는 형식 오류가 아니라 전부 null.
2. 먹기 전 목록이 비면 호출하지 않고 `ANALYSIS_UNAVAILABLE`(reason `bad_request`). 먹은 후 사진이 비었거나 이미지가 아니면 `PHOTO_INVALID`. 먹기 전 사진이 읽히지 않으면 오류가 아니라 사진 없는 경로로 간다.
3. 같은 사진 캐시: 저장소 `after`, 키 `SHA-256(먹은 후 압축본):SHA-256(모델에 보내는 먹기 전 목록 JSON)`. 모델·프롬프트 버전·7일 규칙은 a1과 같다. 사진 없이 분석한 캐시는 지금 먹기 전 사진이 있으면 쓰지 않고 다시 분석한다(반대는 그대로 씀: 분석 성공 뒤 먹기 전 사진을 지우므로). `getAnalysisOrigin`은 `BeforeAnalysis | AfterAnalysis`를 받는다.
4. 목업: `__fixtures__/after-bibimbap.json`(before 픽스처 i1~i6, 남긴 비율 0.3/0/1.0/null/0/1.0)을 넘겨받은 before 목록 기준으로 같은 정리 함수에 통과시킨다. 실제 먹기 전 결과(i1 하나)와 섞으면 i2~i6은 "목록에 없는 항목"으로 빠진다. `getAnalysisMode().promptVersions.after = 'b1'`.
5. 먹기 전 사진 IndexedDB 삭제는 `analyzeAfter`가 하지 않는다(호출한 화면이 성공 뒤 지운다).

## 프롬프트 a2·영양값 조회 (2026-10-26, 1단계 조각 4: `resolveNutrition`)
- 프롬프트 a2(`beforePrompt.ts`, `PROMPT_VERSION_A = 'a2'`): a1 + 종류에 따라 칼로리 차이가 큰 음식(햄버거·샌드위치, 치킨, 피자, 떡볶이·라면, 마라탕·샐러드, 카페 음료, 케이크·디저트)은 보이는 특징까지 넣은 구체적인 이름(예: 더블 치즈버거, 양념치킨 순살), `per_100g_guess`는 보이는 구성(패티 수, 치즈·소스·토핑, 튀김옷, 크림·시럽)을 따져 추정. 보이지 않는 특징은 지어내지 않게 했다. 같은 사진 캐시는 `prompt_version`이 키 검사에 들어가 a1 결과를 다시 쓰지 않는다. 응답 스키마 A의 100g당 부분은 `PER100_SCHEMA`로 내보내 호출 D와 같이 쓴다.
- a2 시험 1회(20:13 KST, Node, `spike/bibimbap.jpg`, gemini-3.5-flash-lite, App Check 없음): 성공. 6.0초, STOP, 입력 1,586 토큰(이미지 1,080, 텍스트 314 → 506) · 출력 138. `돌솥비빔밥` 450g, confidence 0.95, guess 150/22/5/5(a1은 지방 4). 일반 음식 이름은 a1과 같다.
- d1 시험 1회(20:13 KST, Node, "양념치킨 순살", 이름만 보내는 텍스트 호출, 응답 스키마 = per_100g_guess, thinking LOW): 성공. 2.7초, STOP, 입력 48 · 출력 42. 245kcal/탄 18.5/단 14/지 12.5, 범위 통과.
- 종류 규칙 키워드(`nutrition/highVariance.ts`, 정규화 이름과 매칭된 DB 행의 대표식품명 `r`에 부분 문자열 검사): 버거, 샌드위치, 치킨, 닭튀김, 닭강정, 피자, 떡볶이, 라면, 마라, 샐러드, 커피, 라떼, 카페, 카푸치노, 마키아토, 마끼아또, 프라푸치노, 프라페, 에이드, 스무디, 버블티, 밀크티, 쉐이크, 셰이크, 케이크, 케익, 마카롱, 빙수, 와플, 크로플, 도넛, 도너츠, 머핀, 타르트, 브라우니, 티라미수, 쿠키, 아이스크림, 젤라또, 파르페. 제외어(이 말 안의 키워드는 세지 않음): 치킨무, 치킨스톡, 치킨파우더, 치킨가스, 치킨까스, 고구마라, 마라톤. DB 대표식품명 1,225개 중 61개가 해당한다. 닭볶음탕·닭갈비·감자튀김·김치볶음밥은 해당하지 않는다.

### 스펙과 다르게(또는 새로) 정한 점
1. 종류 규칙: `isHighVarianceFood`이고 매칭이 `group`·`partial`이면 DB 값을 쓰지 않고 AI 추정(guess, 없으면 호출 D)에 `reference`(DB 행 코드·이름·매칭·kcal·환산 여부)를 붙인다. 매칭이 `name`이거나 `dbCode`로 고른 행이면 DB 값을 쓴다. AI 추정까지 실패하면 DB 값으로 되돌아가지 않고 `user_input`이다(지시대로).
2. 탄·지 빈 값: guess → 호출 D(캐시) → `missing`(0). 채운 값은 탄·단·지 합이 100g을 넘지 않게 자른다.
3. 호출 D: 시도당 10초. `aiCall.ts` `generateWithRetry`에 선택 인자 `timeoutMs`를 더했다(기본 20초 그대로). 재시도·오류 변환은 같다. 결과는 `checkPer100` 범위 검사를 통과해야 쓰고, 실패는 형식 오류로 재시도한다.
4. 호출 D 캐시: 세션 메모리 + IndexedDB `meal-analysis-cache`의 새 저장소 `nutrition`(키 = 정규화 이름, 모델·`d1`·7일 규칙은 cache.ts 그대로). 새 저장소가 필요해 DB 버전을 1 → 2로 올렸다. 업그레이드는 없는 저장소만 만들어 `before`·`after` 항목은 보존된다. 같은 이름 동시 요청은 호출 1회를 함께 기다린다.
5. 의존성 주입: `resolve.ts`의 `createNutritionResolver({ loadIndex, estimate, searchGrounding, cache })`는 import.meta.env·firebase 초기화를 쓰지 않아 Node에서 그대로 시험한다. 앱 연결은 `nutrition/index.ts`(목업이면 `mockEstimate` 고정 값 200/25/8/7, 0.3초, 영구 캐시 없음). 실제 호출 D는 `nutrition/estimate.ts`.
6. 검색 단계: `searchStage`는 자리만 있고 null을 돌려준다(주석 "미구현이라 건너뜀"). 스위치가 off(기본)면 부르지도 않는다.
7. DB JSON을 못 받으면 DB 단계를 건너뛰고 AI 추정으로 간다. 예상 못 한 오류도 `user_input`으로 돌려주고, 사용자 취소(AbortError)만 던진다.

### 관찰
- "생크림 딸기 케이크"는 뒤쪽 일치로 케이크 대표 행 "케이크_클래식 치즈 케이크 (조각)" 306kcal에 붙는다. 규칙이 없으면 치즈케이크 값을 DB로 보였을 것이다. 참고 이름이 실제 음식과 다를 수 있으니 화면은 "DB 대표값 306kcal"처럼 이름보다 값을 앞세우는 편이 낫다.
- "치킨"·"양념치킨 순살"·"후라이드 치킨"은 DB 대표식품명이 "닭튀김"이라 맞는 행이 없어 참고값 없이 AI 추정이 된다. "떡볶이"처럼 일반 이름이 DB 행 이름과 그대로 같으면 `name` 일치라 DB 값을 쓴다. a2가 구체적인 이름을 내면 대개 세부명 키(예: "로제 떡볶이" → "떡볶이_간편조리세트_로제떡볶이", "더블 치즈버거" → "버거_더블치즈 버거")로 `name` 일치가 된다.

## 계산·조립·검증 (2026-10-26, 1단계 조각 4: `compute.ts`·`assemble.ts`·`validate.ts`)
- 공식(4.6): 섭취량 = 100g당 값 × 중량 ÷ 100 × (1 − 남긴 비율) ÷ 인원수. 남긴 비율 null은 0으로 계산하고 `needs_review=true`. 반올림(소수 첫째)은 `buildAnalysis`·`computeTotals`에서만 하고, 합계는 반올림 전 값을 더한다. 인원수는 1~20 정수, 비율은 0~1로 맞춘다.
- `applyNutrition`: 출처가 바뀌면 `db_*`·`per_100g_fill`·`db_ml_converted`·`db_reference`를 지우고 새 출처 필드만 채운다. `fill`이 missing인 영양소는 `per_100g` 0. user_input은 `kcal_overridden=true`이고 `consumed.kcal`은 지금 값을 초안으로 둔다. `buildAnalysis`는 스키마 키만, undefined 없이 만든다(Firestore용).
- `assembleAnalysis`: 항목 confidence는 호출 A·B 가운데 낮은 값. 조회는 동시 4개까지. 조회 예외나 중단 때는 guess가 있으면 AI 추정, 없으면 직접 입력으로 두고 경고를 남긴다. after가 null이면 비율이 모두 null이고 경고 1개. `prompt_version`은 `a1-b1`(after가 없으면 `a1`), 모델이 다르면 `A+B`.
- 스키마 v2(`references/analysis-schema.json`)와 검증기(`scripts/validate_analysis.mjs`, 앱은 `validate.ts`의 `checkAnalysis`, 규칙 같음): 3.3절 규칙 3개, `db_ml_converted`는 db이고 true일 때만, `db_reference`는 ai_estimate일 때만(형식·kcal 0~900 검사). 스펙에 없던 규칙도 더했다. 스키마에 없는 키는 거부하고, db가 아니면 `db_food_code`는 null, user_input이면 `per_100g`가 null이고 탄·단·지는 0이다. `data:image` 값도 거부하고, 비율이 null인 항목의 `consumed_grams`도 r=0으로 검사한다.
- 픽스처(`web/src/analysis/__fixtures__/analysis-v2-*.json`, 실제 DB 행 사용): valid(DB·DB(환산)·DB+fill·AI 추정+DB 참고·직접 입력, 인원 2, 비율 null)는 TS·Node 검증을 모두 통과했다. bad-calc는 2건(kcal 불일치, 합계 불일치), bad-photo는 3건(`photo_base64` 키, data:image 값, 스키마 밖 키)으로 실패했다.
- 조립 시험: 목업 before·after와 가짜 resolve로 돌렸다. 6항목, 최대 동시 4, `a1-b1`, 검증 통과. after가 null인 경우, 중단된 경우(호출 0, 모두 AI 추정), before가 깨진 경우(항목 0)에도 검증을 통과했다. 실제 AI 호출은 0회.

## 별칭·세부 종류 (2026-10-26, 2단계 조각 1 데이터 쪽)
- 근거: DB 이름을 출력해 확인한 것만 넣었다. 치킨 그룹은 없고 대표식품명 "닭튀김" 199행("닭튀김_양념 치킨" 등), "라테" 0건·"라떼" 741건, "쇠고기" 0건, 돈가스 그룹(돈까스는 상품명 1건)·생선까스 그룹, 자장면·간자장과 짜장면이 둘 다 있음, 아메리카노 그룹 없음(커피_* 상품 행만).
- 통째 별칭(`aliases.ts` `FOOD_ALIASES`, 기존 8 + 새 15): 공깃밥→쌀밥, 치킨무→무초절임(치킨무), 닭갈비→닭볶음(닭갈비), 불고기→소불고기, 카레→카레라이스, 짜장→짜장면, 컵라면→라면_용기면, 아메리카노·핫아메리카노→커피_아메리카노 핫(HOT) (R), 아이스아메리카노→커피_아메리카노 아이스(ICED) (R), 삶은달걀→달걀_삶은것, 프렌치프라이→감자튀김_프렌치 프라이, 순댓국→순대국, 떡볶기→떡볶이.
- 단어 치환(`FOOD_WORD_ALIASES` 9개, 조회어와 DB 이름 양쪽에 적용): 까스→가스, 치킨→닭튀김(일반 이름, 제외: 치킨무·치킨스톡·치킨파우더·치킨가스·치킨데리야끼·먼치킨), 계란→달걀, 프라이→후라이, 짜장→자장, 라테→라떼, 야채→채소, 쇠고기→소고기, 오뎅→어묵(제외: 오뎅식당).
- 매칭 순서(4.5.4에 끼움): 직접 일치 → 통째 별칭 → 표기 치환 → 일반 이름 치환(치킨) → 뒤쪽 일치(원래 이름, 치환한 이름 순).
  - 표기 치환은 직접 일치와 같은 순서(이름 → 치환 키 → 세부명 → 그룹)라 "돈까스"와 "돈가스", "카페라테"와 "카페라떼"가 같은 결과다.
  - 일반 이름 치환으로 대표식품명에 맞으면 `group`(이름이 같은 행이 있으면 그 행): "치킨" → AI 추정 + 참고 "닭튀김" 301kcal.
  - 세부 종류 행까지 맞으면 `name`: 양념치킨 → 닭튀김_양념 치킨 248, 간장치킨 → 닭튀김_간장 치킨 275.
  - 치환 키: DB 이름을 치환해 만든 이름 키·세부명 키(`byAlt`). 단어 치환 조회에서는 원래 세부명 키보다 먼저 본다. 원래 키 "양념닭튀김"은 "닭튀김_양념"(284)이고, "후라이드닭튀김"·"순살닭튀김"은 간편조리세트 행이다.
  - 단어 치환 조회는 간편조리세트 행의 세부명 키를 쓰지 않는다. 3조각 이름의 첫·마지막 조각 키가 일반 이름을 가로채기 때문이다(반반치킨 → …간장양념치킨_매운맛_반반 330). 치환 키끼리 겹치면 밀키트가 아닌 행 가운데 kcal 중앙값에 가장 가까운 행을 고른다.
- 결과(guess 있음, 호출 D 목업 0회): 치킨=AI 추정(참고 닭튀김 301, group), 후라이드 치킨=DB name 닭튀김_후라이드 치킨 282, 순살 양념치킨=AI 추정(참고 닭튀김_날개 307, partial), 치킨무=DB 무초절임(치킨무) 17. 오탐 점검에서 치킨가스·치킨까스=DB 치킨가스, 먼치킨 도넛=도넛 쪽, 치킨버거=DB 버거_치킨 버거로 나왔다. 앞서 쓰던 이름(김치찌개·공기밥·떡볶이·로제 떡볶이·더블 치즈버거·아이스 카페라떼 등)은 결과가 바뀌지 않았다.
- `listFoodVariants(name, { dbCode?, limit=30 })`: 맞은 행의 대표식품명 그룹 전체를 돌려준다(`byRep`). 정렬은 그룹 이름과 같은 기본 행 → 브랜드 없는 일반 이름 → 간편조리세트 → 나머지 순이고, 같은 단계는 세부 이름이 짧은 순이다. 일반 이름은 외식 업체 상품 코드(D2…)가 아닌 행, 또는 업체 행이라도 낱말이 모두 비업체 행에 나오는 경우다(양념·간장·후라이드는 해당, 꿀잼은 아님). 이름이 같은 행은 하나만 남긴다. 치킨 상위 10: 닭튀김, 목, 윙(5조각), 날개, 너겟, 다리, 양념, 간장 치킨, 순살치킨, 양념 치킨. 부위 행이 맛 이름보다 앞에 온다.
- `FoodSuggestion.mlConverted`를 추가했고 `searchFoodNames`와 `listFoodVariants`가 채운다.
- 남은 일
  - 뒤쪽 일치(partial)의 참고 행은 대표 행이라 "닭튀김_날개"처럼 이름이 어색하다. 기본 행("닭튀김")을 쓰는 쪽은 다른 음식 값도 바꾸므로 4단계 평가에서 정한다.
  - "후라이드 치킨"은 세부 행이 있어 DB 값을 쓴다(리더 예시의 group과 다르다).

## 공개 중량·프롬프트 a3 (2026-10-26)
- 규칙(스펙 4.5.5): 호출 A가 `whole_count`(정수 1~10, 한 개·한 마리·한 판·1인분이 통째로 보일 때만)를 주고, DB 이름 일치(`db_match = name`)이고, 매칭 행에 공개 중량 `w`가 있으면 `before_grams = w × whole_count`, `grams_source: "published"`. 하나라도 없으면 AI 추정 무게를 그대로 쓴다.
- DB 변환: 업체 제공 행 식품중량 g 12,625 중 100g 아님 11,897, ml 2,600 중 100ml 아님 2,599(리더 확인값과 같음). 대표 행 11,381개 중 `w` 있음 8,668. JSON 1,818,902 → 1,889,359 B(+3.9%), gzip 298,036 → 316,523, brotli 224,131 → 237,715.
- 별칭: `빅맥 → 버거_빅맥 버거`(223g)만 추가. 치즈와퍼는 DB에 `햄버거_치즈와퍼`(310g)와 `버거_치즈와퍼 버거`(303g) 두 행이 있어 넣지 않았다("치즈와퍼 버거"는 이름 일치). 허니콤보는 "허니콤보 치킨"으로 맞지만 식품중량 100g이라 `w` 없음.
- 프롬프트 a3: 호출 A 지시 7번(`whole_count`), 응답 스키마 A에 `whole_count: integer, nullable`. 정리 함수는 정수 1~10이 아니면 null.
- 시험 `spike/tests/published_test.mjs`(모두 통과): 빅맥 ×1 → 223g, ×2 → 446g, null → AI 180g, 김치찌개(w 없음) → AI, `db_match` group·partial → 적용 안 함, v2 검증(TS·mjs) 통과, 세 필드 일부 누락·무게 불일치는 검증 오류.
- 실제 호출 1회(gemini-3.5-flash-lite, `spike/bibimbap.jpg`, a3): 스파이크 스크립트의 20초 시간 초과(AbortError)로 응답을 받지 못했다. `whole_count` 출력과 nullable 정수 스키마 수용은 아직 확인 못 함. 다음 호출(10/29 측정 첫 장) 때 확인한다.
- 10/29 측정에서 공개 중량 적용 항목의 무게 오차를 따로 본다.

## 호출 시간 제한·재시도 조정 (2026-10-27, 사용자 결정)
- 근거: 2026-10-26 23시 KST 리더 실측에서 같은 사진이 a3 40.1초·16.8초, a2 12.9초(낮에는 4~6초). 20초 제한이면 느린 시간대에 시간 초과 → 재시도까지 호출 2회를 쓰고 실패할 수 있다.
- `aiCall.ts`: 시도당 제한 `ATTEMPT_TIMEOUT_MS` 20초 → 40초(SDK 안전망 41초). 시간 초과(자체 타이머, SDK AbortError, HTTP 408)는 `retryable: false`로 바꿔 재시도하지 않는다. 네트워크 오류·5xx·분당 429·형식 오류는 그대로 2초 뒤 1회 재시도. 호출 D(10초)도 같은 규칙.
- 화면: 분석 중 10초가 지나면 "조금 더 걸려요"와 [직접 입력]이 나오는 것은 그대로다.

## 프롬프트 a4·b2 (2026-10-27, 사용자 결정)
- 문제(결과 화면 확인 중): ① "확인해 주세요" 경고가 영어로 나옴 ② 먹은 후 사진이 다른 음식처럼 보이자 모델이 "버거는 그대로"로 가정해 남긴 비율 100%·섭취 0kcal ③ 분당 429를 2초 뒤 다시 보내 같은 분에 또 막힘.
- a4(호출 A): name·location·warnings를 모두 한국어로(브랜드·메뉴도 한글 표기, 경고는 "음식 이름: 이유"). 응답 정리에서 모델 warnings를 `koreanWarnings`로 거른다.
- b2(호출 B): 먼저 같은 식사인지 확인. 남은 양을 직접 볼 수 있을 때만 숫자(빈 그릇·포장지 → 0, 손대지 않음 → 1). 다른 음식·그릇·식탁처럼 보이거나, 그릇이 안 보이거나, 판단할 수 없으면 1·0으로 가정하지 말고 null + 한국어 경고. 모든 id를 결과에 넣는다.
- "그릇이 안 보이면 0(confidence 0.5 이하)" 규칙은 없앴다. 다 먹고 치운 것과 사진 밖에 있는 것을 구분할 수 없고, 장면이 다른 사진이면 모든 그릇이 "안 보임"이 되어 전부 다 먹은 것으로 조용히 계산된다(②의 반대 방향 같은 오류). 대가는 치운 그릇마다 사용자가 한 번 고르는 것. 스킬 "판단 기준"의 "먹은 후 사진에 없는 음식 → 0" 줄은 이 결정과 다르다(스킬 수정은 리더 판단).
- 코드 안전장치(`normalizeAfterResponse`): confidence < 0.6이고 remaining_ratio ≥ 0.95 또는 ≤ 0.05이면 null + "{이름}: 먹은 후 사진에서 남은 양을 판단하기 어려워요. 남긴 양을 직접 골라 주세요". 0.6은 needs_review 기준과 같은 값. 아래쪽(≤ 0.05)도 넣었다(요청 "100% 남김(또는 0%)으로 가정하지 말 것"). 0.9·0.1처럼 실제로 본 양일 수 있는 값은 그대로 둔다. 모델의 null은 그대로 두고, 모델 경고에 그 이름이 없으면 같은 한국어 경고를 넣는다.
- `aiCall.ts`: 분당 429도 `retryable: false`(`quotaScope: 'minute'`은 그대로 넘김). 재시도는 네트워크·5xx·형식 오류만.
- 호출 D(d1)는 숫자만 받으므로 그대로.
- 응답 스키마 제안(이번에는 넣지 않음): 호출 B 항목에 `match: "same" | "different" | "not_visible" | "unclear"`를 받으면 null 이유를 코드가 문구로 정하고, 모델 경고 언어에 기대지 않아도 된다. 픽스처·검증·after_test까지 바뀌므로 4단계 평가 때 정한다.
- 시험 `spike/tests/korean_unsure_test.mjs`(19개 통과, 실제 호출 없음, 가짜 모델) + 기존 시험 모두 통과, `tsc -b` 통과. a3·b1 캐시는 prompt_version이 달라 다시 분석된다. 실제 응답 확인은 10/29 측정 때.

## 프롬프트 b3 (2026-10-27, 사용자 결정)
- 결정: 같은 식사 장면인데 그 그릇만 먹은 후 사진에 안 보이면 "모름"으로 막지 않고 남긴 비율 0(다 먹음)으로 미리 골라 둔다. 화면은 노란 표시 "그릇이 안 보여서 다 드신 걸로 했어요. 아니면 바꿔 주세요"를 보이고 저장을 허용한다. 다른 음식·다른 장면·판단 불가는 b2처럼 null("확인 필요", 고르기 전 저장 막음). 계약은 리더가 정했다(`d747fe6`: `MealItem`·`AfterItem.ratio_assumed?: 'not_visible'`, `setRemainingRatio`).
- 프롬프트 b3·응답 스키마 B: 맨 위 `same_scene: boolean`, 항목마다 `match: same | not_visible | different | unclear`(`Schema.enumString`, 모두 필수). 모델은 match가 same일 때만 숫자를 쓰고 나머지는 null. not_visible은 warnings에 적지 않게 했다(화면이 항목마다 노란 표시로 알린다). 0·null은 코드가 정하므로 null 이유가 모델 경고 언어에 기대지 않는다.
- 정리 규칙(`normalizeAfterResponse`):
  - `same_scene=false`: 모든 항목 null, 경고는 "먹은 후 사진이 먹기 전과 다른 장면처럼 보여요. 음식마다 남긴 양을 직접 골라 주세요" 한 줄만(모델 경고·항목별 경고는 버린다). items 배열이 빠져도 형식 오류로 다시 호출하지 않는다(결론이 이미 나와 한도를 아낀다).
  - `not_visible`: remaining_ratio 0 + `ratio_assumed: 'not_visible'`(모델 숫자 무시, confidence는 모델 값).
  - `different`·`unclear`: null + `unsureRatioWarning`(모델 숫자 무시).
  - `same`, 그리고 4개 값 밖이거나 빠진 match: b2 규칙(0~1 밖이면 null, 확신 < 0.6이고 ≥0.95·≤0.05면 null, 모델 null 유지).
  - same_scene·match가 하나도 없는 응답: b2 동작 그대로(`korean_unsure_test`의 b2 사례가 b3 코드에서 그대로 통과).
- 같은 그릇(same)이 하나도 없을 때(판단): same이 0개인데 not_visible이 있으면 not_visible도 모두 null + "먹은 후 사진에서 먹기 전 그릇을 하나도 찾지 못했어요. 음식마다 남긴 양을 직접 골라 주세요". 근거: ① not_visible은 "같은 장면"이 전제인데, 먹기 전 그릇이 하나도 안 보이면 같은 장면이라는 근거가 식탁·배경뿐이라 약하다. ② 다른 사진인데 모델이 same_scene을 true로 잘못 주면 모든 그릇이 not_visible → 전부 다 먹음(칼로리 최대)으로 조용히 저장된다. b2가 막은 오류(전부 그대로·0kcal)의 반대 방향이다. ③ 대가는 다 먹고 그릇을 모두 치운 뒤 찍은 경우에 음식마다 한 번 고르는 것이다. 빈 그릇이 보이면 same(0)이라 여기에 걸리지 않는다. 지시 예("모든 그릇이 not_visible")보다 조금 넓혀, not_visible에 different·unclear만 섞인 경우도 같게 처리한다. 같은 그릇을 하나도 못 찾았다는 점이 같기 때문이다. 한 그릇 식사에서 그 그릇이 안 보이는 경우도 여기에 들어간다.
- 캐시 호환: 캐시는 정리 결과(AfterAnalysis)를 저장했다가 `normalizeAfterResponse`로 다시 읽는다. match 없이 `ratio_assumed`가 붙은 항목은 이 함수가 만든 결과이므로 0과 표시를 그대로 둔다(확신이 낮아도 안전장치를 다시 걸지 않는다). 다시 읽어도 결과가 같은지 시험했다. b1·b2 캐시는 prompt_version이 달라 다시 분석한다.
- 계산 경로: `assembleAnalysis`가 `AfterItem.ratio_assumed`(remaining_ratio=0일 때만)를 `MealItem`으로 옮긴다. `toStoredItem`(buildAnalysis)이 표시를 저장한다. 키를 하나씩 골라 담는 함수라 넣지 않으면 저장할 때 빠졌다. `recomputeItem`은 remaining_ratio가 0이 아니면 표시를 지운다(`setRemainingRatio`를 거치지 않고 비율이 바뀐 경우 대비). applyNutrition(이름 변경)·setBeforeGrams·setKcalOverride·인원수 변경은 표시를 유지한다. needs_review 공식은 그대로다(not_visible이어도 확신 < 0.6이면 true).
- 검증: `validate.ts`·`validate_analysis.mjs`·`analysis-schema.json`(`const: "not_visible"`, 있으면 `remaining_ratio const 0`)이 표시를 remaining_ratio=0일 때만 허용한다.
- 목업 픽스처 `after-bibimbap.json`을 b3 형식으로 바꿨다: same_scene true, i4 배추김치 unclear → null, i5 콩나물무침 not_visible → 0 + 표시(목업 화면에서 노란 표시를 확인할 수 있다). `run-tests`·`piece4_integration`은 픽스처 원본을 정리 없이 넣으므로 i5가 null로 들어간다(출력만 바뀌고 검증은 통과).
- 시험: `spike/tests/b3_test.mjs` 38개 통과(가짜 응답, 실제 호출 없음). 기존 시험 11개 모두 통과(`korean_unsure_test`는 버전 b3와 픽스처 기대값만 바꿈), `tsc -b` 통과. 실제 응답 확인은 10/29 측정 때 한다. 확인할 것: 모델이 same_scene을 먼저 판단하는지, 치운 그릇을 not_visible로 답하는지, 다른 사진에서 same_scene=false를 주는지.
- 스킬 문서: `SKILL.md` 판단 기준의 b2 줄을 b3 규칙으로 바꾸고, `prompt-template.md` 호출 B를 b3 원문, 스키마, 정리 표로 바꿨다.

## 세부 영양소·프롬프트 a5 (2026-10-28, 디자인 조각 D4-a·D4-b, 사용자 결정 "세부 영양소는 당류·나트륨·포화지방·식이섬유 네 가지만")
- D4-a(`dd2b02c`): 식약처 원본의 당류·나트륨·포화지방산·식이섬유를 앱 DB와 같은 행 선택으로 `web/public/data/mfds-detail-20261006.json`(475,648 B, gzip 101,820 B)에 따로 냈다. 앱 DB 파일은 그대로다. 값 있는 음식: 당류 11,284 · 나트륨 11,351 · 포화지방 11,082 · 식이섬유 2,052 / 11,381(식이섬유는 원본에도 4,460행만 있다). 계산은 탄단지와 같은 공식(`compute.ts`), 저장 반올림은 g 0.1·나트륨 정수, 합계는 값 있는 음식만 + 음식 수.
- a5(호출 A): a4 + 지시 8번 "detail_guess에 그 음식 100g당 당류(g), 나트륨(mg), 포화지방(g), 식이섬유(g) 추정값. 1인분·그릇 전체 값이 아니라 100g당. 한국에서 흔히 먹는 조리 기준으로 보이는 구성을 따져 추정, 짐작할 수 없는 값은 null". 응답 스키마 A 항목에 `detail_guess`(4키 모두 필수, 값은 `Schema.number({ nullable: true })`). 같은 호출이라 호출 수는 그대로, 출력 토큰은 음식당 수십 개 늘어난다.
- **실제 호출 1회 확인(2026-10-28, 리더, 사용자 식판 사진 1장 → 긴 변 1280px·JPEG 0.8, gemini-3.5-flash-lite):** 6초, finishReason STOP, 입력 1,892·출력 1,134토큰(음식 6개 → 음식당 약 190토큰, maxOutputTokens 4096이면 약 20개까지 안전 — 30개 상한 근처의 큰 상은 잘릴 수 있음). 6개 모두 detail_guess를 100g당으로 줌(쌀밥 나트륨 2mg, 칼국수 국물 600mg·면 350mg, 닭볶음탕 450mg, 떡갈비 550mg·포화 5g, 어묵볶음 당 6g — 1인분 값이 아님), 나트륨 mg 단위, null 없음(모두 숫자), 정리(checkDetail) 통과. 인식: 감자·어묵 조림을 "어묵볶음"으로 묶음(D4 범위 밖).
- 정리(`checkDetail`): 허용 키 중 0~상한(g 100, 나트륨 40000mg) 수만 남기고 반올림, 하나도 없으면 null. a4 캐시는 prompt_version이 달라 다시 분석하고, 예전 결과(Firestore의 먹기 전 결과 포함)에 detail_guess가 없으면 null로 본다.
- 조립(`assembleAnalysis`): `applyNutrition` 뒤 `applyDetail(item, 출처 db이면 detailFor(db_food_code), detail_guess)`. 영양소마다 DB 값 → 없으면 추정("추정" 배지). 종류별 차이가 큰 음식(ai_estimate + db_reference)은 DB 대표값의 세부 값을 쓰지 않고 추정만(리더 결정). 취소된 signal이면 DB 세부 조회 없이 추정만.
- 호출 D(d1)는 그대로(숫자 4개만). 이름을 바꾼 음식(결과 수정 화면)은 DB 세부 값만 채워지고, DB에 없는 이름은 "–". 호출 D에 세부 4가지를 붙이려면 NutritionResult·캐시 값 모양·resolve.ts까지 바뀌어 이번에는 하지 않았다.
- 시험: `spike/tests/detail_test.mjs`(10개), `spike/tests/detail_guess_test.mjs`(8개) 통과, 기존 시험 모두 통과. 실제 응답 확인은 리더가 앱에서 1~2회: 모델이 detail_guess를 100g당으로 주는지(1인분 값을 주면 나트륨이 수천 mg으로 커진다), 나트륨을 mg로 주는지(g로 주면 0.x), null을 쓰는지, 출력이 잘리지 않는지(maxOutputTokens 4096).

## 세부 영양소 9가지·프롬프트 a6 (2026-10-28, 디자인 조각 D4-c, 사용자 결정 f708492)
- 키(화면 순서): sugar_g, fiber_g, satfat_g, transfat_g, polyunsat_g, monounsat_g, cholesterol_mg, sodium_mg, potassium_mg. 범위: g 키 0~100, 콜레스테롤 0~5000mg, 나트륨 0~40000mg, 칼륨 0~10000mg. 반올림: g 0.1, mg 정수. 대체감미료는 넣지 않는다. 키는 모두 선택이라 4가지로 저장된 D4-a·a5 기록·캐시도 그대로 통과한다(시험).
- 세부 JSON 9키: 753,724 B(gzip 125,634, brotli 103,267). 값 있는 음식 / 11,381: 당류 11,284 · 식이섬유 2,052 · 포화지방 11,082 · 트랜스지방 2,279 · 다불포화 0 · 단일불포화 0(원본에 열 없음, 호출 A 추정만) · 콜레스테롤 3,396 · 나트륨 11,351 · 칼륨 2,063. 앱 DB 파일은 그대로다.
- a6(호출 A): 지시 8번을 9가지로, 응답 스키마 detail_guess 9키(모두 필수, nullable). maxOutputTokens 4096 → 8192: a5 실제 호출에서 음식 6개 출력 1,134토큰(음식당 약 190). 9가지면 음식당 약 260으로 보고 30개면 8천 가까이 된다. 잘리면 형식 오류 → 재시도로 한도를 두 번 쓰므로 넉넉히 뒀다. a5 캐시는 다시 분석한다.
- 실제 응답 확인(리더 1회): 다불포화·단일불포화·트랜스지방에 값을 주는지 null을 주는지, 콜레스테롤·칼륨을 mg로 주는지, 음식당 출력 토큰 수.
