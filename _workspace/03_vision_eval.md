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
