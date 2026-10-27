---
name: intake-calorie-estimation
description: "먹기 전·후 음식 사진을 촬영 즉시 Gemini(Firebase AI Logic)로 분석해 음식별 추정 중량, 남긴 비율을 얻고, 식약처 DB → Google 검색 그라운딩 → AI 추정 순서로 100g당 영양값을 찾아 실제 섭취 칼로리·탄·단·지를 계산하는 방법과 결과 스키마, 검증 스크립트를 제공한다. 이미지 분석 프롬프트 작성, 모델 호출 코드, 영양값 조회, 칼로리 계산 로직, 나눠 먹는 반찬 처리, 분석 결과 검증, 정확도 평가를 할 때 반드시 사용한다. 화면 UI나 Firebase 설정 자체는 meal-log-frontend, firebase-stack을 쓴다."
---

# 섭취 칼로리 추정 (먹기 전·후 비교)

## 왜 이 방식인가
일반 식단 앱은 "제공된 음식"의 칼로리를 기록한다. 이 앱의 차별점은 **남긴 양을 빼서 실제 섭취량**을 계산하는 것이다. 정확도를 좌우하는 것은 (1) 전·후 음식 매칭, (2) 남긴 비율 추정, (3) 신뢰할 수 있는 100g당 영양값이다. 아래 절차는 이 세 가지를 각각 가장 잘하는 주체에게 맡긴다.

## 전제 (프로젝트 `CLAUDE.md` 확정 결정 사항)
- 모든 모델 호출은 클라이언트에서 Firebase AI Logic + Gemini Developer API(무료 등급)로 한다. Cloud Functions는 없다.
- **사진은 서버에 저장하지 않는다.** 촬영 즉시 압축해 모델에 보내고, 결과만 Firestore에 남긴다. 먹기 전 사진만 폰 브라우저 IndexedDB에 임시 보관했다가 먹은 후 분석이 끝나면 지운다.
- 영양값 출처 순서는 식약처 DB → 검색 기반 → AI 추정이며, 화면에 출처를 표시한다.

## 역할 분담: 모델은 보고, 코드는 계산한다
| 단계 | 담당 | 이유 |
| --- | --- | --- |
| 음식 식별, 먹기 전 중량(g) 추정 | 모델(먹기 전 분석) | 시각 인식이 필요 |
| 전·후 음식 매칭, 남긴 비율(0~1) 추정 | 모델(먹은 후 분석) | 먹은 후 사진과 먹기 전 결과를 함께 봐야 함 |
| 100g당 영양값 | 코드(DB) → 모델(검색) → 모델(추정) | 공식 값을 먼저 쓰고, 없을 때만 모델에 맡긴다 |
| 섭취 중량·영양소·합계 계산 | 코드 | 모델의 산술 오류 방지 |
| 나눠 먹은 반찬 분배 | 코드 + 사용자 입력(음식별 같이 먹은 인원수) | 사진만으로는 누가 먹었는지 알 수 없음 |

## 절차
**촬영할 때마다 바로 분석**한다. 먹기 전 분석 결과는 Firestore에, 먹기 전 사진은 IndexedDB에 남으므로 앱을 닫아도 이어서 기록할 수 있다.

1. **먹기 전 분석(호출 A)**: 먹기 전 사진 한 장 → 음식 목록(`id`, `name`, `location`, `before_grams`, `confidence`, `per_100g_guess`). 프롬프트는 `references/prompt-template.md`의 호출 A. 결과를 `awaiting_after` 상태로 Firestore에 저장하고, 사진은 IndexedDB에 임시 보관한다.
   - `location`(예: "왼쪽 위 밥공기")은 먹은 후 분석에서 그릇을 찾는 단서다.
   - `per_100g_guess`를 미리 받아 두면 3단계(AI 추정)에 추가 호출이 필요 없다.
2. **먹은 후 분석(호출 B)**: IndexedDB의 먹기 전 사진 + 먹은 후 사진 + 호출 A 결과 JSON(텍스트) → `same_scene`, 항목별 `match`·`remaining_ratio`·`confidence`, `warnings`(b3, 0·null은 코드가 정한다. "판단 기준" 참고). 두 장을 함께 보내 매칭 정확도를 높인다. 성공하면 IndexedDB의 먹기 전 사진을 지운다. 먹기 전 사진이 없으면 텍스트만으로 호출하고 `warnings`에 "먹기 전 사진 없이 분석"을 남긴다.
3. **영양값 조회 `resolveNutrition(name)`** — 항목마다 다음 순서로 100g당 kcal·탄수화물·단백질·지방(g)을 구한다.
   1. **DB**: 앱에 포함한 식약처 식품영양성분 DB JSON(음식 표준데이터 전체)에서 이름 정규화(공백·괄호 제거) 후 정확 일치 → 별칭 → 부분 일치 순으로 찾는다. 찾으면 `nutrition_source: "db"`, `db_food_code` 기록.
   2. **검색 기반**: DB에 없으면 Gemini + Google 검색 그라운딩(`tools: [{ googleSearch: {} }]`, 호출 C)으로 찾는다. 성공하면 `nutrition_source: "search"`. 응답의 `groundingMetadata.searchEntryPoint.renderedContent`를 화면에 넘겨 사용 조건대로 검색 추천을 표시하게 한다.
   3. **AI 추정**: 검색이 실패하거나(값 없음, 파싱·범위 검사 실패) 무료 한도 초과(429)면 호출 A의 `per_100g_guess`를 쓴다. 이름이 바뀌어 추정값이 없으면 호출 D로 추정한다. `nutrition_source: "ai_estimate"`.
   4. 모두 실패하면 사용자가 칼로리를 직접 입력한다. `nutrition_source: "user_input"`, `kcal_overridden: true`.
   - 같은 이름의 조회 결과는 세션 안에서 캐시해 무료 한도를 아낀다.
4. **계산(코드)** — kcal·탄·단·지 모두 같은 함수로 계산한다.
   - `consumed_grams = before_grams × (1 − remaining_ratio) ÷ eaters`
   - `consumed.X = per_100g.X × consumed_grams / 100` (X = kcal, carbs_g, protein_g, fat_g)
   - `eaters`는 사용자가 음식별로 고른 "같이 먹은 인원수"(정수 1~20, 기본 1). 1이면 확정 공식 "100g당 값 × 중량 ÷ 100 × (1 − 남긴 비율)"과 같다.
   - `kcal_overridden: true`인 항목은 `consumed.kcal`에 사용자가 입력한 값을 그대로 둔다.
   - 합계는 항목 합으로 계산한다.
5. **검증**: `node scripts/validate_analysis.mjs <result.json>`(앱 안에서는 같은 규칙의 TS 함수). 모델 출력이 형식에 안 맞으면 한 번 다시 호출하고, 또 실패하면 수동 수정으로 넘긴다.
6. **저신뢰 표시**: `confidence < 0.6`인 항목, 매칭 실패 항목(`remaining_ratio: null`)은 `needs_review: true`.

## 이름 수정 시 재계산
- 사용자가 이름을 바꾸면 3번 `resolveNutrition`만 다시 실행하고 `before_grams`·`remaining_ratio`·`eaters`는 유지한다. 사진 재분석은 없다.
- `kcal_overridden: true`인 항목은 프런트가 "다시 계산할까요?"를 확인한 뒤에만 재계산한다.

## 호출 절약 (심사 기간 한도 보전)
11/5 17:00 이후 새로 채워지는 무료 한도는 심사위원용이다(`CLAUDE.md` "제출·심사"). 모듈은 호출 수를 줄이도록 만든다. 수치와 시그니처는 스펙 5.2절·4.3절.
- 같은 입력은 다시 호출하지 않는다: 압축본 SHA-256을 키로 호출 A·B 결과를 기기 IndexedDB에 캐시한다. 해시는 Firestore에 넣지 않는다.
- 샘플 사진은 실제 모델로 미리 분석한 결과(정적 JSON)를 쓰고 호출하지 않는다. 화면에 "미리 분석한 결과"라고 밝힌다.
- 429는 분당 한도(잠깐 뒤 1회 재시도)와 일일 한도 소진(재시도 없이 한도 모드)을 구분한다.
- 영양값은 DB → 호출 A의 `per_100g_guess` 재사용 → 이름별 IndexedDB 캐시 순으로 찾고, 이름을 확정할 때만 호출 D를 한다.
- 검색 단계 가능 여부는 0단계 시험 결과를 설정값으로 고정한다. 불가면 호출 C를 아예 하지 않는다. 가능하면 호출 C만 무료 그라운딩이 있는 모델(시험한 `gemini-2.5-flash-lite` 등)로 보낸다.
- 운영 모델은 실측 무료 일일 한도가 큰 쪽으로 고른다.

## 판단 기준
- **나눠 먹은 반찬**: 모델은 공유 여부를 판단하지 않는다. 모든 음식의 `eaters` 기본값은 1이고, 사용자가 결과 수정 화면에서 반찬별로 인원수만 고른다. 전·후 차이가 여러 사람의 섭취량이므로 인원수로 나눈다.
- **먹은 후 사진에서 그릇을 찾은 결과(2026-10-27 사용자 결정, 프롬프트 b3)**: 호출 B는 맨 위 `same_scene`(같은 식사 장면인가)과 항목마다 `match`(`same`·`not_visible`·`different`·`unclear`)를 답하고, 남긴 비율 0·null은 코드가 정한다.
  - **같은 장면인데 그 그릇만 안 보임(`not_visible`)**: "모름"으로 막지 않는다. `remaining_ratio: 0`(다 먹음)으로 미리 골라 두고 `ratio_assumed: "not_visible"`을 붙인다. 화면은 노란 표시 "그릇이 안 보여서 다 드신 걸로 했어요. 아니면 바꿔 주세요"를 보이고 저장을 허용한다. 사용자가 비율을 고르면 `setRemainingRatio`가 표시를 지운다.
  - **다른 음식·그릇(`different`), 판단할 수 없음(`unclear`), 다른 장면(`same_scene: false`)**: 0(다 먹음)이나 1(그대로)로 가정하지 않고 `remaining_ratio: null`과 한국어 경고를 남긴다. 화면은 "확인 필요"로 보이고 사용자가 남긴 양을 고르기 전에는 저장하지 않는다.
  - **같은 그릇(`same`)을 하나도 못 찾았는데 안 보이는 그릇이 있을 때**: 같은 장면이라는 근거가 식탁·배경뿐이라 다른 사진일 가능성이 크다. 안 보이는 그릇도 null로 둔다(전부 다 먹음으로 조용히 저장되는 것을 막는다).
- **먹은 후 사진에 새로 생긴 음식**: 리필·추가 주문일 수 있다. 계산에서 빼고 경고로 알린다.
- **크기 기준**: 숟가락·젓가락·표준 공기(밥 210g 기준)를 크기 단서로 쓰라고 프롬프트에 적는다. 촬영 안내 화면에서 "같은 위치·각도, 수저를 함께"를 요청한다.
- **국물 음식**: 건더기와 국물을 나눠 추정한다. 국물은 대부분 남기므로 한 덩어리로 보면 칼로리가 크게 틀린다.
- **음식 이름**: 모델에게 식약처 음식 표준데이터에 있을 법한 일반 음식명(예: "김치찌개", "제육볶음")으로 답하게 한다. DB 일치율이 출처 신뢰도를 좌우한다.
- **그라운딩 응답**: 모델에 따라 검색 그라운딩과 구조화 출력(응답 스키마)을 함께 쓰지 못할 수 있다. 텍스트에서 JSON을 추출하고 범위(kcal 0~900/100g, 탄·단·지 각 0~100g/100g, 탄+단+지 ≤ 100)를 검사한다.

## 영양 DB 준비
- 원본: 식품의약품안전처 식품영양성분 DB "음식" 표준데이터(공공데이터포털 파일 내려받기). API 호출은 쓰지 않는다.
- 변환 스크립트로 앱용 JSON을 만든다: `{ code, name, aliases?, per_100g: { kcal, carbs_g, protein_g, fat_g } }[]`. 원본의 영양성분 기준량이 100g이 아니면 100g 기준으로 환산하고, 값이 빈 항목은 0이 아니라 null로 둔다.
- 위치는 `web/public/data/mfds-foods.json`(지연 로드)처럼 첫 번들 밖에 둔다. 크기가 크면 필요한 필드만 남기고 압축 전송을 확인한다.
- `references/korean-food-kcal.json`은 변환 전 개발·테스트용 대략값이다. 이 값으로 계산한 항목은 출처를 "DB"로 표시하지 않는다.

## 결과 형식
계약은 `references/analysis-schema.json`(JSON Schema)이다. 핵심 필드:
`items[].{id, name, db_food_code, eaters, before_grams, remaining_ratio, consumed_grams, per_100g{kcal,carbs_g,protein_g,fat_g}, nutrition_source, consumed{kcal,carbs_g,protein_g,fat_g}, kcal_overridden, confidence, needs_review}`, `totals.{before_kcal, consumed{...}}`, `warnings[]`.
이 객체가 Firestore `meals/{id}.analysis`에 그대로 저장된다. 사진 관련 필드는 없다(먹기 전 사진은 IndexedDB에만 임시로 있다).

## 정확도 평가
- 샘플 세트: 직접 찍은 전·후 사진 10쌍 이상, 각 쌍에 기대값(저울로 잰 g 또는 합리적 추정)을 `_workspace/00_input/samples/expected.json`에 기록한다. 샘플 사진은 평가용 로컬 파일이며 앱에 저장하지 않는다.
- 지표: 끼니 섭취 kcal 절대 오차율(MAPE), 음식 식별 정확도, 남긴 비율 평균 절대 오차, 출처별 비율(DB / 검색 기반 / AI 추정).
- 프롬프트를 바꿀 때마다 같은 세트로 다시 측정하고 `_workspace/03_vision_eval.md`에 버전별로 기록한다. 한 샘플만 맞추는 수정은 다른 샘플을 망가뜨리기 쉽다.
- 먹은 후 분석을 기본 경로("두 장 함께")와 대체 경로("먹기 전 결과 텍스트만")로 각각 측정해 차이를 기록한다. 대체 경로 오차가 크면 화면에서 그 사실을 알린다.

## 참고 파일
- `references/prompt-template.md` — 호출 A~D 프롬프트와 응답 스키마
- `references/analysis-schema.json` — 최종 결과 계약
- `references/korean-food-kcal.json` — 개발·테스트용 대략값(출처 "DB" 아님)
- `scripts/validate_analysis.mjs` — 스키마·계산 일관성 검사
