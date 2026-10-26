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
