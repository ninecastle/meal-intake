# 섭취량 분석 프롬프트 템플릿

모든 호출은 Firebase AI Logic(`getGenerativeModel`)으로 클라이언트에서 한다. 이미지는 긴 변 1280px JPEG로 압축해 inline data로 넣는다. 먹기 전 사진은 IndexedDB에 임시 보관했다가 호출 B가 끝나면 지운다.

| 호출 | 시점 | 입력 | 설정 |
| --- | --- | --- | --- |
| A. 먹기 전 분석 | 먹기 전 촬영 직후 | `[시스템 지시 A]` → `[텍스트: "BEFORE 사진"]` → `[이미지]` | 응답 스키마 A |
| B. 먹은 후 분석 | 먹은 후 촬영 직후 | `[시스템 지시 B]` → `[텍스트: 먹기 전 결과 JSON]` → `[텍스트: "BEFORE 사진"]` → `[IndexedDB의 먹기 전 이미지]`(없으면 생략) → `[텍스트: "AFTER 사진"]` → `[이미지]` | 응답 스키마 B |
| C. 검색 기반 영양값 | DB에 없는 이름 | 텍스트만 | `tools: [{ googleSearch: {} }]` |
| D. AI 추정 영양값 | 검색 실패·한도 초과이고 A의 추정값이 없을 때(이름 수정 등) | 텍스트만 | 응답 스키마 D |

## 시스템 지시 A (먹기 전)

```
당신은 식사 사진을 분석하는 영양 보조 도구다. 먹기 전 식탁 사진 한 장이 주어진다.

할 일:
1. 보이는 음식을 그릇 단위로 모두 나열하고 i1, i2 … 순서로 id를 붙인다.
2. name은 한국 식품영양성분 DB에 있을 법한 일반 음식명으로 쓴다(예: "김치찌개", "제육볶음", "쌀밥").
3. location에 그릇 위치와 모양을 짧게 적는다(예: "왼쪽 위 흰 밥공기"). 나중에 먹은 후 사진에서 같은 그릇을 찾는 데 쓴다.
4. 각 음식의 먹기 전 중량(g)을 추정한다. 수저, 표준 밥공기(밥 약 210g), 접시 크기를 단서로 쓴다.
5. 국·찌개는 건더기와 국물을 별도 항목으로 나눈다.
6. per_100g_guess에 100g당 kcal, 탄수화물·단백질·지방(g) 추정값을 적는다. DB에 없을 때만 쓰이는 예비값이다.

규칙:
- 섭취량이나 총 칼로리를 계산하지 않는다.
- 확신이 없으면 confidence를 낮게 준다. 추측을 사실처럼 쓰지 않는다.
```

### 응답 스키마 A
```json
{
  "type": "object",
  "required": ["items", "warnings"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "location", "before_grams", "confidence", "per_100g_guess"],
        "properties": {
          "id": {"type": "string"},
          "name": {"type": "string"},
          "location": {"type": "string"},
          "before_grams": {"type": "number"},
          "confidence": {"type": "number"},
          "per_100g_guess": {
            "type": "object",
            "required": ["kcal", "carbs_g", "protein_g", "fat_g"],
            "properties": {
              "kcal": {"type": "number"}, "carbs_g": {"type": "number"},
              "protein_g": {"type": "number"}, "fat_g": {"type": "number"}
            }
          }
        }
      }
    },
    "warnings": {"type": "array", "items": {"type": "string"}}
  }
}
```

## 시스템 지시 B (먹은 후)

```
당신은 식사 사진을 분석하는 영양 보조 도구다.
먹기 전에 분석한 음식 목록(JSON), 먹기 전 사진, 먹은 후 같은 식탁 사진이 주어진다. 먹기 전 사진이 빠질 수도 있다.

할 일:
1. 목록의 각 id에 대해 먹은 후 사진에서 같은 그릇을 location을 단서로 찾는다.
2. 남은 비율 remaining_ratio를 추정한다(0=다 먹음, 1=그대로).

규칙:
- 칼로리를 계산하지 않는다. 비율만 추정한다.
- 먹은 후 사진에서 그릇이 안 보이면 remaining_ratio=0, confidence를 0.5 이하로 두고 warnings에 적는다.
- 어느 그릇인지 판단할 수 없으면 remaining_ratio=null로 두고 warnings에 적는다.
- 목록에 없는데 먹은 후 사진에만 있는 음식은 결과에 넣지 말고 warnings에 적는다.
- 확신이 없으면 confidence를 낮게 준다.
```

추가 정보 텍스트:
```
먹기 전 음식 목록: {BEFORE_ITEMS_JSON}
```

### 응답 스키마 B
```json
{
  "type": "object",
  "required": ["items", "warnings"],
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "remaining_ratio", "confidence"],
        "properties": {
          "id": {"type": "string"},
          "remaining_ratio": {"type": "number", "nullable": true},
          "confidence": {"type": "number"}
        }
      }
    },
    "warnings": {"type": "array", "items": {"type": "string"}}
  }
}
```

## 호출 C (검색 기반)

```
"{NAME}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 웹 검색으로 찾아라.
조리된 일반적인 1인분 기준 자료를 우선한다. 찾지 못하면 "NOT_FOUND"만 답한다.
찾았으면 다른 말 없이 다음 JSON 한 줄로만 답한다:
{"kcal": 0, "carbs_g": 0, "protein_g": 0, "fat_g": 0}
```
- 응답 텍스트에서 JSON을 추출해 범위를 검사한다. `NOT_FOUND`·파싱 실패·범위 밖이면 AI 추정으로 넘어간다.
- `groundingMetadata.searchEntryPoint.renderedContent`(검색 추천)와 출처 정보를 결과와 함께 프런트에 넘긴다. 그라운딩 응답을 보여 줄 때 검색 추천을 함께 표시하는 것이 사용 조건이다.

## 호출 D (AI 추정)

```
"{NAME}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 일반적인 조리 기준으로 추정하라.
```
응답 스키마는 호출 A의 `per_100g_guess`와 같다.

## 최종 결과 만들기
코드가 A·B 결과를 `id`로 합치고, `resolveNutrition`으로 100g당 값과 출처를 붙이고, 계산을 더해 `analysis-schema.json` 형식의 최종 결과를 만든다.
