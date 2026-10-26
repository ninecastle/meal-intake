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
