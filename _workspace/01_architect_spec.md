# 식단 기록 웹앱 MVP 스펙

- 문서: `_workspace/01_architect_spec.md` · 작성 2026-10-26(0단계) · architect
- 상태: **사용자 결정(7.1절) 반영본(2026-10-26).** 리더가 해시를 고정하면 구현을 시작한다(diet-app-orchestrator 절차 B-3·B-4). 0단계 환경 확인(6절)은 구현이 아니므로 먼저 해도 된다.
- 우선순위: 프로젝트 `CLAUDE.md` "확정 결정 사항" > 이 스펙 > 스킬 문서. 이 스펙은 확정 결정 사항을 바꾸지 않는다. 결정 사항과 어긋나는 외부 사실은 7.2절에 위험으로 적었다.
- 근거 표기: `[S숫자]`는 공식 문서(부록 A, 2026-10-26 확인), `[X숫자]`는 검증하지 못한 제3자 자료, `[L]`은 리더가 식약처 원본을 분석해 전달한 사실이다.
- 다시 쓰지 않고 참조만 하는 문서
  - 프롬프트 원문(호출 A~D): `.claude/skills/intake-calorie-estimation/references/prompt-template.md`
  - 결과 검증 규칙: `.claude/skills/intake-calorie-estimation/scripts/validate_analysis.mjs`
  - 이미지 압축, IndexedDB 임시 보관·정리 규칙: `.claude/skills/meal-log-frontend/SKILL.md`의 "구현 규칙"
  - 보안 규칙 원칙, 배포 절차, 자주 막히는 지점: `.claude/skills/firebase-stack/SKILL.md`
  - 점검표 A~F: `.claude/skills/hackathon-qa/SKILL.md`

---

## 1. MVP 범위 / 제외 범위

판단 기준은 두 가지다. **입력 단계를 줄이는가, 섭취량 정확도를 높이는가.**

### 1.1 MVP: 11/4 기능 동결 전에 동작해야 하는 것

| ID | 기능 | 기준과의 관계 | 담당 |
| --- | --- | --- | --- |
| M1 | Google 로그인·로그아웃(팝업이 막히면 리디렉션, 인앱 브라우저는 외부 브라우저 안내) | 기기를 바꿔도 기록이 남는다 | firebase-engineer(함수), frontend-dev(화면) |
| M2 | 먹기 전 촬영 → 즉시 먹기 전 분석(호출 A) → `awaiting_after` 문서 저장, 사진은 IndexedDB에 임시 보관 | 입력은 사진 한 장 | frontend-dev, vision-ai-engineer, firebase-engineer |
| M3 | 먹은 후 촬영 → 즉시 먹은 후 분석(호출 B, 두 장 함께) → 영양값 3단계 조회 + 코드 계산 → `needs_review` 저장 → IndexedDB 사진 삭제 | 남긴 양을 빼서 실제 섭취량을 계산한다 | vision-ai-engineer, frontend-dev, firebase-engineer |
| M4 | 결과 확인·수정(2.3절 규칙 전부) | AI 오차를 한 화면에서 바로잡는다 | frontend-dev(계산은 vision 모듈) |
| M5 | 저장(`done`) → 하루 요약으로 이동 | - | frontend-dev, firebase-engineer |
| M6 | 하루 요약: 클라이언트 합산(kcal·탄·단·지), 끼니별(아침·점심·저녁·간식) 기록 목록(음식 이름·kcal)과 끼니 합계, 기록을 누르면 상세 보기(S7), 날짜 이동(◀ 전날 / 다음 날 ▶, 오늘이 아니면 [오늘로], 지난 날짜의 기록과 요약), 기록 삭제(확인 후). **축소 대상 아님**(2026-10-26 사용자 결정) | 핵심 기능 2 | frontend-dev, firebase-engineer |
| M7 | 식약처 DB JSON: 변환, 지연 로드, 이름 매칭, 자동완성(3.5절, 4.5절) | 공식 값을 먼저 써서 정확도를 높인다 | vision-ai-engineer |
| M8 | 출처 배지(DB·검색 기반·AI 추정·직접 입력). 검색 기반이면 검색 추천도 표시 | 사용자가 신뢰도를 판단한다 | frontend-dev |
| M9 | 실패 대체 경로(5절): 자동 재시도 1회, 직접 입력, 남긴 비율 직접 고르기, 샘플 체험 | 녹화와 심사 기간에 흐름이 끊기지 않는다 | 전원 |
| M10 | 사진 전송 고지: 첫 촬영 전 1회 + 촬영 화면에 한 줄(문구는 7.1절 U4) | 약관 대응(7.2절 R2) | frontend-dev |
| M11 | Hosting 배포, App Check, 개발용 AI 목업 스위치 | 운영, 무료 한도 절약 | firebase-engineer, frontend-dev |
| M12 | 샘플 체험: 실제 모델로 미리 분석한 결과(정적 JSON)로 촬영 없이 전체 흐름을 체험. AI 호출 0회, 화면에 "미리 분석한 결과" 표시(7.1절 U6) | 음식·카메라가 없는 심사위원도 체험하고 한도를 지킨다 | vision-ai-engineer(결과), frontend-dev(화면) |
| M17 | 주간 추이(S9): 최근 7일 일별 꺾은선그래프, 탭(칼로리·탄·단·지), 그날 목표 점선, 기록 없는 날 빈칸, 지난주/다음 주 이동(4.7절 끝). AI 호출 없음 | 하루 기록을 일주일 흐름으로 본다(2026-10-26 사용자 결정, 3단계 조각 4) | firebase-engineer(조회), frontend-dev(화면) |
| M16 | 저장한 기록 수정(S8): 기록 상세 → [수정] → 결과 수정 규칙 그대로 음식별 값·음식 추가·삭제, 끼니, 날짜(오늘과 지난 날짜만). 사진 재분석 없음. `done → done` 전이, `editedAt` 기록. **3단계가 밀리면 가장 먼저 4단계로 미룬다**(삭제는 남긴다) | 실수로 저장한 값을 삭제하지 않고 바로잡는다(2026-10-26 사용자 결정) | firebase-engineer(규칙·저장), frontend-dev(화면) |
| M14 | 목표 설정(S6): 성별·나이·키·몸무게·활동량·목표 → Mifflin-St Jeor로 기초대사량·하루 소모량 → 목표 kcal·탄단지 추천(4.7절). AI 호출 없음. 안전 장치(기초대사량 하한, 만 18세 미만 유지, 의학적 조언 아님 고지) | 하루 요약을 "얼마나 먹었나"에서 "목표 대비 얼마나 남았나"로 바꾼다(2026-10-26 사용자 결정, 3단계) | vision-ai-engineer(계산), firebase-engineer(저장·규칙), frontend-dev(화면) |
| M15 | 하루 요약 목표 비교: kcal·탄·단·지 "먹은 양/목표" 막대와 남은 양(4.7절) | 같음 | frontend-dev |
| M13 | 호출 절약 장치(5.2.2절): 같은 사진 결과 캐시, 분석 중 잠금, 429 분당·일일 구분과 한도 모드, 호출 D 결과 캐시, 사용자별 하루 실시간 분석 상한 | 심사 기간 내내 동작한다 | vision-ai-engineer, frontend-dev, firebase-engineer |

### 1.2 있으면 좋음: 4단계(11/2~3)에 시간이 남을 때 위에서부터

| 순위 | 기능 | 이유 |
| --- | --- | --- |
| P1 | 먹은 후 촬영 화면에서 먹기 전 사진을 반투명으로 겹치기(`getUserMedia` 카메라) | 같은 각도로 찍게 해 남긴 비율 정확도를 높인다. MVP는 먹기 전 사진을 화면 위쪽에 보여 주는 것으로 대신한다 |
| P2 | 호출 A 프롬프트에 DB 대표식품명 목록 넣기 | DB 적중률이 오른다. 토큰·지연이 늘어나는지 평가로 확인한 뒤 적용 |
| P3 | "남김 없이 다 먹었어요" 버튼(먹은 후 촬영 생략, 남긴 비율 0) | 입력 단계와 호출 수가 준다 |
| P4 | PWA 매니페스트(홈 화면 설치) | 시연 인상 |
| P5 | (MVP M16으로 옮김, 2026-10-26 사용자 결정) | - |
| P6 | (MVP M14·M15로 옮김, 2026-10-26 사용자 결정) | - |

### 1.3 만들지 않는 것
- 사진·썸네일·이미지 URL·base64 저장(Storage, Firestore, localStorage), 먹은 후 사진 보관: 확정 결정 사항
- Cloud Functions, Cloud Storage, 별도 서버, 서버 집계(`daily/*`), Blaze가 필요한 기능: 확정 결정 사항
- Firebase AI 모니터링: 켜면 프롬프트(사진이 들어갈 수 있음)가 저장된다(7.2절 R3)
- 월간 통계, 푸시 알림, 바코드, 공유, 다국어: 기준 두 가지에 기여하지 않는다(주간 추이는 M17로 만든다)
- 남은 영양소 기반 음식 추천, 월간 그래프, 리포트: 프리미엄 기능. 3단계가 끝난 뒤 따로 다룬다(그전에는 만들지 않는다). 발표에서는 프리미엄 계획으로 소개한다(2026-10-26 사용자 결정)

### 1.4 스킬 기본값과 다르게 정한 것

| 스킬 기본값 | 이 스펙의 결정 | 이유 |
| --- | --- | --- |
| meal-log-frontend: 홈과 하루 요약이 다른 화면 | 홈 = 오늘의 하루 요약(날짜 이동 포함) | 흐름의 끝(하루 요약)이 다음 기록을 시작하는 화면과 같아져 화면과 탭이 준다 |
| meal-log-frontend: 홈에 "섭취 / 목표" | (2026-10-26 변경) 목표가 있으면 "먹은 양/목표" 막대와 남은 양, 없으면 합계와 "목표 설정하기" 카드 | 목표 설정을 3단계 MVP(M14·M15)로 넣었다 |
| meal-log-frontend: 먹은 후 촬영 때 반투명 겹치기 | MVP는 먹기 전 사진을 위쪽에 표시 | `<input capture>`로는 겹칠 수 없고, 카메라를 직접 만드는 일은 P1 |
| firebase-stack: `users/{uid}` 프로필 문서 | (2026-10-26 변경) 3단계 목표 설정용 `goal` 필드 하나만 둔다(4.7절). 시간대는 계속 상수 `Asia/Seoul` | 목표를 기기와 상관없이 쓰려면 서버에 있어야 한다 |
| firebase-stack: 규칙에서 항목별 `eaters` 1~20 검사 | 규칙은 문서 최상위 필드·열거값·범위·항목 수만 본다. 항목별 검사는 클라이언트 `validateAnalysis`가 한다 | Firestore 규칙 언어에는 배열을 순회하는 문법이 없다 |
| firebase-stack: App Check는 디버그 확인 뒤 적용 | 처음부터 적용된 상태로 보고 0단계에 디버그 토큰을 등록한다 | 2026년 7월 초부터 AI Logic 설정 과정이 App Check를 자동으로 적용한다 [S1] |
| intake-calorie-estimation: 이름 정확 일치 → 별칭 → 부분 일치 | 이름·세부명·대표식품명 일치 → 별칭 → **뒤쪽 일치만**. 국물·건더기는 부분 일치에서 뺀다 | 앞·중간 일치를 허용하면 "김치"가 "김치찌개"로 잘못 매칭되고, 그 값이 "DB" 출처로 표시된다 |
| meal-log-frontend: "데모 사진 사용"(데모 사진도 실제 분석 호출) | 샘플 체험은 미리 분석한 결과로 AI 호출 0회, 화면에 그렇다고 표시. 자기 사진만 실시간 분석 | 심사위원 대부분이 음식 없이 체험하고, 심사 기간 내내 한도를 지켜야 한다(U5·U6) |
| analysis-schema.json(v1) | v2: 선택 필드 3개 추가(3.3절) | 식약처 행의 탄·지 빈 값과 매칭 근거를 표시하기 위해 |

---

## 2. 사용자 흐름과 화면 목록

### 2.1 흐름과 문서 상태

```
S0 로그인 → S1 홈(=오늘의 하루 요약) ─"식사 기록"→ S2 먹기 전 촬영
   └ 호출 A 성공 → meals 문서 생성(status: awaiting_after), 먹기 전 사진은 IndexedDB
→ S3 먹은 후 촬영 ─ 호출 B 성공 → analysis 저장(status: needs_review) → IndexedDB 사진 삭제
→ S4 결과 확인·수정 ─"저장"→ status: done → S1(그 식사의 dateKey)
```

| 상태 | 뜻 | 들어오는 때 | 하루 요약에 합산 |
| --- | --- | --- | --- |
| (문서 없음) | 촬영 전, 또는 호출 A 실패 | - | 아니요 |
| `awaiting_after` | 먹기 전 분석만 끝났다. 먹기 전 사진은 IndexedDB에 있다 | 호출 A 성공 직후 | 아니요 |
| `needs_review` | 먹은 후 분석까지 끝났고 사용자가 아직 확인하지 않았다 | 호출 B 성공 직후. 앱을 닫아도 결과가 남는다 | 아니요 |
| `done` | 사용자가 저장했다 | S4에서 저장 | **예(이 상태만)** |

- 허용하는 전이: 없음→`awaiting_after`, 없음→`done`(직접 입력), `awaiting_after`→`needs_review`·`done`, `needs_review`→`done`, `done`→`done`(저장한 기록 수정, M16. `editedAt` 함께 기록). `done`에서 다른 상태로 되돌리지 않는다. 삭제는 모든 상태에서 할 수 있다.
- 샘플 체험(S5)도 같은 상태 흐름을 탄다. 호출 A·B 대신 미리 분석한 결과를 쓰고(AI 호출 0회), 문서에는 `entry: "sample"`을 남긴다(3.2절).
- 기본 경로에서 앱 안 탭은 3번이다(식사 기록 → 남은 음식 찍기 → 저장). 여기에 카메라 셔터와 확인이 더해진다. QA 점검표 F의 목표는 촬영부터 저장까지(식사 시간 제외) 60초 이내다.

### 2.2 화면 목록

| ID | 경로 | 화면 | 주요 요소 | 주 버튼 |
| --- | --- | --- | --- | --- |
| S0 | `/login` | 로그인 | Google 버튼 하나. 이미 로그인했으면 바로 S1. 인앱 브라우저면 "Chrome·Safari로 열어 주세요" | Google로 로그인 |
| S1 | `/`(`?date=YYYY-MM-DD`) | 홈 = 하루 요약 | 맨 위 대기 카드(`awaiting_after`: "다 드셨나요? 남은 음식 찍기", `needs_review`: "확인하고 저장하기"). 합계 kcal·탄·단·지, 끼니별(아침·점심·저녁·간식 순서, 기록 없는 끼니는 숨김) 기록 목록: 기록마다 음식 이름 요약과 섭취 kcal, 끼니 합계(사진 없음). 기록을 누르면 S7. 날짜 이동 "◀ 전날"·"다음 날 ▶"(오늘이면 "다음 날 ▶" 비활성, 오늘이 아니면 [오늘로], 지난 날짜도 같은 요약·목록), 영양 정보 출처 한 줄. 목표가 있으면 kcal·탄·단·지 "먹은 양/목표" 막대와 남은 양, 없으면 "목표 설정하기" 카드(3단계, 4.7절) | 식사 기록 |
| S2 | `/capture/before` | 먹기 전 촬영 | "수저를 함께, 위에서 찍어 주세요", 사진 전송 고지 한 줄, "데모 사진 사용" | 촬영 |
| S3 | `/meal/:mealId/after` | 먹은 후 촬영 | 먹기 전 사진(IndexedDB에 있을 때), 인식한 음식 목록(이름·g, 읽기 전용), "같은 위치·각도로", "데모 사진 사용", "기록 취소" | 남은 음식 찍기 |
| S7 | `/meal/:mealId` | 기록 상세(3단계, 읽기 전용) | 날짜·끼니·저장 시각, 음식별 이름·먹기 전 무게(g)·남긴 비율·같이 먹은 인원·섭취 kcal·탄·단·지·출처 배지(DB·DB(환산)·AI 추정·직접 입력, 참고 DB 대표값), 끼니 합계, [삭제]("이 기록을 삭제할까요?" 확인 → `deleteMeal` → 그 날짜 S1). [수정](S8)·[삭제]("이 기록을 삭제할까요?" 확인 → `deleteMeal` → 그 날짜 S1). 수정한 기록이면 "수정됨 · 시각" | 수정·삭제 |
| S8 | `/meal/:mealId/edit` | 기록 수정(3단계, M16) | S4 편집기를 수정 모드로 다시 쓴다: 음식별 이름·무게·남긴 비율·인원·kcal, 음식 추가·삭제(2.3절 규칙 그대로), 끼니 칩, 날짜 선택(오늘과 지난 날짜만). 사진은 다시 분석하지 않는다. 음식이 0개면 저장하지 않고 기록 삭제를 안내한다. 나가기 전 "저장하지 않고 나갈까요?". 저장 → S7("수정했어요"). 브라우저 뒤로 가기·‹·저장 뒤 모두 S7로 가고, 방문 기록에 S7이 두 번 쌓이지 않는다(2026-10-27 사용자 결정) | 수정 저장 |
| S9 | `/week`(`?end=YYYY-MM-DD`) | 주간 추이(3단계, M17) | 탭(칼로리·탄·단·지), 최근 7일 일별 꺾은선, 그날 목표 점선, 기록 없는 날 빈칸, ◀ 지난주 / 다음 주 ▶, 점을 누르면 그날 값·목표·그날 홈 링크(4.7절 끝) | - |
| S6 | `/goal` | 목표 설정(3단계, 언제든 수정) | 성별·나이·키·몸무게·활동량·목표 입력(바꾸면 바로 재계산) → 기초대사량·하루 소모량·목표 kcal·탄단지 추천 표시, 추천값 직접 조정과 [추천값으로], 안전 장치 문구, 의학적 조언 아님 고지(4.7절). AI 호출 없음 | 저장 |
| S4 | `/meal/:mealId/review` | 결과 확인·수정 | 음식 카드(2.3절), 끼니 칩, 경고, 합계. 직접 입력은 같은 화면을 빈 목록으로 연다(`/meal/new/review?date=`) | 저장 |
| - | S2·S3 위에 덮는 상태 | 분석 중 | 진행 표시. 10초가 지나면 "조금 더 걸려요"와 "직접 입력" 링크. 실패하면 5절 선택지 | - |

- 끼니 자동 선택(먹기 전 촬영 시각, Asia/Seoul): 05~10시 아침, 11~15시 점심, 17~21시 저녁, 그 밖(16시, 22~04시)은 간식. S4의 끼니 칩으로 한 번에 바꾼다.
- `dateKey`는 먹기 전 촬영 시각 기준이다(저장 시각이 아니다). 직접 입력은 S1에서 보고 있던 날짜를 쓴다.

### 2.3 결과 확인·수정 화면(S4) 규칙

카드 필드: 이름(자동완성), 중량(g), 남긴 비율 슬라이더(0~100%, 5% 단위), 같이 먹은 인원수(1·2·3·4·5+, 5+를 고르면 6~20 입력), 섭취 kcal(직접 수정 가능), 탄·단·지(읽기 전용), 출처 배지, DB 일치 이름(`db_name`, 대표값이면 그렇다고 표시). `needs_review` 항목과 AI 추정 항목을 먼저, 노란 테두리로 보여 준다. 계산은 모두 4.3절의 vision 모듈 함수로 한다. 화면 코드에서 다시 구현하지 않는다.

| 조작 | 동작 | 그대로 두는 값 | 바뀌는 필드 |
| --- | --- | --- | --- |
| 이름 확정(`kcal_overridden=false`) | `resolveNutrition(새 이름)`, 자동완성에서 골랐으면 `{ dbCode }`도 넘김 → `applyNutrition`. 사진은 다시 분석하지 않는다 | `before_grams`, `remaining_ratio`, `eaters` | `name`, `per_100g`, `per_100g_fill`, `nutrition_source`, `db_*`, `consumed*`, `user_edited=true` |
| 이름 확정(`kcal_overridden=true`) | "다시 계산할까요?" 확인. 예: 위 행과 같고 `kcal_overridden=false`. 아니요: 이름만 바꾼다 | 아니요를 고르면 영양값과 직접 입력한 kcal 모두 | 예: 위 행과 같음. 아니요: `name`, `user_edited=true` |
| 중량·남긴 비율·인원수 변경 | `recomputeItem`. `kcal_overridden`이면 kcal은 그대로 두고 탄·단·지만 다시 계산 | 영양값 | 바꾼 값, `consumed_grams`, `consumed`, `user_edited=true`(인원수만 바꿨으면 그대로) |
| 섭취 kcal 직접 입력 | `setKcalOverride(item, 값)`. 표시는 "직접 입력" | 탄·단·지 | `consumed.kcal`, `kcal_overridden=true` |
| 직접 입력한 kcal 옆 "자동 계산" | `setKcalOverride(item, null)` | - | `kcal_overridden=false`, `consumed.kcal` |
| 음식 추가 | `newUserItem` → 이름 입력 → `resolveNutrition`. 중량 기본값은 DB 1인분 참고량(`s`), 없으면 100g으로 두고 중량 입력란에 포커스. 남긴 비율 0, 인원수 1 | - | 새 항목(`id` `u1`, `u2`…, `confidence=1`) |
| 음식 삭제 | 삭제 버튼(3초 되돌리기) → `computeTotals` | - | `items` |
| 3단계 조회가 모두 실패 | `nutrition_source="user_input"`, `per_100g=null`, kcal 입력란에 포커스, 탄·단·지는 "–" | - | - |
| 저장 | `validateAnalysis` 통과 → `saveMeal`(done) → S1(그 dateKey) | - | `status`, `analysis`, `consumedKcal`, `mealType` |

추가 표시 규칙
- `remaining_ratio=null`(매칭 실패): 다 먹은 것(0)으로 계산하고 카드에 "남긴 양 확인 필요(다 먹은 것으로 계산 중)"을 띄운다. 저장은 막지 않고 `warnings`에 남긴다.
- `per_100g_fill`: 해당 영양소 옆에 작은 "AI 추정" 표시. 값이 `missing`이면 숫자 대신 "–".
- 검색 기반: 카드 안에 `searchSuggestionHtml`을 Shadow DOM으로 원문 그대로 넣는다. 스타일 변경, 숨김, 다른 내용 끼워 넣기는 하지 않는다 [S5][S23]. 이 HTML은 저장하지 않으므로, 나중에 다시 연 `needs_review` 식사에는 배지만 보인다.
- 출처 문구(S1·S4 아래쪽): "영양 정보: 식품의약품안전처 식품영양성분 DB(2026-10-06 갱신본)".

---

## 3. 데이터 모델

### 3.1 경로

```
users/{uid}                     3단계부터 목표 설정 `goal` 필드 하나(4.7절). 본인만 읽기·쓰기
users/{uid}/goals/{dateKey}     3단계부터 날짜별 목표 기록(그날부터 쓰는 목표값, 4.7절). 본인만 읽기·쓰기
users/{uid}/meals/{mealId}      식사 1건. mealId는 클라이언트가 먼저 만든다(IndexedDB 키와 같다)
```
사진·썸네일·이미지 URL·base64 필드는 어디에도 두지 않는다. `daily/*` 문서도 없다.

### 3.2 meals 문서 필드

| 필드 | 타입 | 언제 있는가 | 설명 |
| --- | --- | --- | --- |
| `dateKey` | string, `^\d{4}-\d{2}-\d{2}$` | 항상 | Asia/Seoul 기준 먹기 전 촬영 날짜 |
| `mealType` | `breakfast`·`lunch`·`dinner`·`snack` | 항상 | |
| `status` | `awaiting_after`·`needs_review`·`done` | 항상 | 2.1절 |
| `beforeAnalysis` | BeforeAnalysis(4.3절) | `awaiting_after`부터 계속 유지. 직접 입력 식사에는 없다 | 호출 A 결과. `per_100g_guess`는 3단계(AI 추정)의 예비값이다 |
| `analysis` | MealIntakeAnalysis v2 | `needs_review`, `done` | `analysis-schema.json` v2(3.3절) |
| `consumedKcal` | number 0~10000 | `needs_review`, `done` | `analysis.totals.consumed.kcal`의 사본 |
| `createdAt`, `updatedAt` | timestamp(serverTimestamp) | 항상 | 목록 정렬은 클라이언트에서 한다(복합 인덱스가 필요 없다) |
| `editedAt` | timestamp(serverTimestamp) | 저장한(`done`) 기록을 수정했을 때부터(M16) | 마지막 수정 시각. 목록·상세에 "수정됨" 표시. 수정할 때마다 `request.time` |

보안 규칙에 넣을 결정(세부 원칙은 firebase-stack)
- 본인 uid만 읽기·쓰기
- 문서 키는 위 9개만 허용(`hasOnly`, `editedAt` 포함). `createdAt`은 바꿀 수 없다. `done → done`이면 `editedAt == request.time`, 그 밖의 전이에서는 `editedAt`을 새로 넣지 않는다. `analysis` 키는 `items`, `totals`, `warnings`, `model`, `prompt_version`만 허용
- `status`·`mealType` 열거값, `dateKey` 형식, 2.1절 상태 전이
- `analysis.items.size() <= 30`. `consumedKcal`은 0~10000이고 `analysis.totals.consumed.kcal`과 같아야 한다
- 항목 안의 필드는 규칙으로 검사하지 않는다(1.4절)

쿼리
- 하루 요약: `where("dateKey","==",d)`, `where("status","==","done")`
- 대기 카드: `where("status","in",["awaiting_after","needs_review"])`
- 둘 다 단일 필드 인덱스로 동작한다. `orderBy`는 쓰지 않고 정렬은 클라이언트에서 한다.

### 3.3 analysis-schema.json v2 (변경 제안: vision-ai-engineer 합의 후 10/27에 반영)

출처 필드(`nutrition_source`)와 사용자 수정 표시(`kcal_overridden`, `user_edited`)는 v1에 이미 있으므로 그대로 쓴다. 식약처 DB의 실제 형태[L] 때문에 아래 선택 필드 세 개만 추가한다.

| 추가 필드 | 위치·타입 | 언제 넣는가 | 이유 |
| --- | --- | --- | --- |
| `per_100g_fill` | `items[]`, `{ carbs_g?, fat_g? }`. 값은 `ai_estimate` 또는 `missing` | `nutrition_source=db`이고 DB 행에 그 값이 비어 있을 때만 | 식약처 행 상당수가 탄·지 빈 값이다[L]. 영양소 단위로 출처를 보여 준다 |
| `db_name` | `items[]`, string 또는 null | db일 때 채운다 | 무엇과 매칭됐는지 사용자가 보고 판단한다 |
| `db_match` | `items[]`, `name`·`group`·`partial` | db일 때 | 대표값·부분 일치 표시, 출처 평가 지표 |
| `grams_source`, `published_g`, `unit_count` | `items[]`, `"published"`·숫자·정수(공개 중량을 썼을 때만 넣음) | 4.5.5절 조건을 모두 만족해 `before_grams = published_g × unit_count`로 정했을 때 | 먹기 전 무게가 AI 추정이 아니라 업체 공개 중량임을 보인다(2026-10-26 사용자 결정) |
| `db_ml_converted` | `items[]`, boolean(true일 때만 넣음) | db이고 매칭된 행이 100ml 기준을 1g/ml로 환산한 행(`ml: 1`)일 때 | 화면 출처를 "DB(환산)"으로 구분한다(4.5.3 (a)-4, 2026-10-26 사용자 결정) |

추가할 검증 규칙(vision-ai-engineer가 `validate_analysis.mjs`와 TS 함수에 반영)
1. `per_100g_fill`은 `nutrition_source="db"`일 때만 허용한다.
2. `per_100g_fill.k`가 `missing`이면 `per_100g.k = 0`, `consumed.k = 0`이어야 한다.
3. `db_match`가 있으면 `db_name`은 비어 있으면 안 된다.

바꾸지 않는 것: 영양소 네 값은 계속 필수 숫자다. 그래서 합계·규칙·하루 요약 코드는 바뀌지 않는다.

영향을 받는 에이전트
- vision-ai-engineer: 스키마, 검증기, `web/src/types/analysis.ts`(10/27 첫 작업)
- frontend-dev: 표시
- firebase-engineer: 영향 없음(항목 안은 규칙 검사 대상이 아니다)
- qa-integrator: 픽스처, 검증 실행
- 이견이 있으면 vision-ai-engineer가 10/27 작업 시작 전에 리더에게 알린다.

### 3.4 Firestore 문서 예시

숫자와 식품코드는 형식을 보여 주기 위한 예시다(쌀밥 166kcal/100g만 [L]의 실제 값). 타임스탬프는 `<serverTimestamp>`로 적었다.

**(1) 먹기 전 분석 직후 `awaiting_after`**
```json
{
  "dateKey": "2026-10-27",
  "mealType": "lunch",
  "status": "awaiting_after",
  "beforeAnalysis": {
    "items": [
      { "id": "i1", "name": "쌀밥", "location": "왼쪽 아래 흰 밥공기", "before_grams": 210, "confidence": 0.9,
        "per_100g_guess": { "kcal": 150, "carbs_g": 33.0, "protein_g": 2.7, "fat_g": 0.3 } },
      { "id": "i2", "name": "제육볶음", "location": "가운데 큰 흰 접시", "before_grams": 300, "confidence": 0.75,
        "per_100g_guess": { "kcal": 180, "carbs_g": 8.0, "protein_g": 13.0, "fat_g": 10.0 } },
      { "id": "i3", "name": "배추김치", "location": "오른쪽 위 작은 종지", "before_grams": 80, "confidence": 0.8,
        "per_100g_guess": { "kcal": 20, "carbs_g": 3.5, "protein_g": 1.5, "fat_g": 0.5 } },
      { "id": "i4", "name": "김치찌개 국물", "location": "오른쪽 아래 뚝배기", "before_grams": 250, "confidence": 0.55,
        "per_100g_guess": { "kcal": 20, "carbs_g": 1.5, "protein_g": 1.2, "fat_g": 1.0 } },
      { "id": "i5", "name": "김치찌개 건더기", "location": "오른쪽 아래 뚝배기", "before_grams": 120, "confidence": 0.7,
        "per_100g_guess": { "kcal": 85, "carbs_g": 4.0, "protein_g": 7.0, "fat_g": 4.5 } }
    ],
    "warnings": [],
    "model": "gemini-3.5-flash-lite",
    "prompt_version": "a1"
  },
  "createdAt": "<serverTimestamp>",
  "updatedAt": "<serverTimestamp>"
}
```

**(2) 저장한 `done` 문서**: `beforeAnalysis`는 (1)과 같아서 생략했다. `analysis`는 v2 검증기를 통과하는 값이다(QA 픽스처로 써도 된다). i2·i3은 둘이 나눠 먹었고, u1은 사용자가 추가한 음식이다.
```json
{
  "dateKey": "2026-10-27",
  "mealType": "lunch",
  "status": "done",
  "consumedKcal": 677.1,
  "analysis": {
    "items": [
      { "id": "i1", "name": "쌀밥", "location": "왼쪽 아래 흰 밥공기",
        "db_food_code": "D-EXAMPLE-0001", "db_name": "쌀밥", "db_match": "name",
        "eaters": 1, "before_grams": 210, "remaining_ratio": 0.1, "consumed_grams": 189,
        "per_100g": { "kcal": 166, "carbs_g": 36.0, "protein_g": 3.0, "fat_g": 0.5 },
        "nutrition_source": "db",
        "consumed": { "kcal": 313.7, "carbs_g": 68.0, "protein_g": 5.7, "fat_g": 0.9 },
        "kcal_overridden": false, "confidence": 0.9, "needs_review": false, "user_edited": false },
      { "id": "i2", "name": "제육볶음", "location": "가운데 큰 흰 접시",
        "db_food_code": "D-EXAMPLE-0002", "db_name": "제육볶음", "db_match": "name",
        "eaters": 2, "before_grams": 300, "remaining_ratio": 0.2, "consumed_grams": 120,
        "per_100g": { "kcal": 140, "carbs_g": 6.0, "protein_g": 12.0, "fat_g": 7.5 },
        "nutrition_source": "db",
        "consumed": { "kcal": 168.0, "carbs_g": 7.2, "protein_g": 14.4, "fat_g": 9.0 },
        "kcal_overridden": false, "confidence": 0.75, "needs_review": false, "user_edited": true },
      { "id": "i3", "name": "배추김치", "location": "오른쪽 위 작은 종지",
        "db_food_code": "D-EXAMPLE-0003", "db_name": "배추김치", "db_match": "name",
        "eaters": 2, "before_grams": 80, "remaining_ratio": 0.5, "consumed_grams": 20,
        "per_100g": { "kcal": 18, "carbs_g": 3.5, "protein_g": 1.5, "fat_g": 0.4 },
        "nutrition_source": "db",
        "consumed": { "kcal": 3.6, "carbs_g": 0.7, "protein_g": 0.3, "fat_g": 0.1 },
        "kcal_overridden": false, "confidence": 0.8, "needs_review": false, "user_edited": false },
      { "id": "i4", "name": "김치찌개 국물", "location": "오른쪽 아래 뚝배기",
        "db_food_code": null, "db_name": null,
        "eaters": 1, "before_grams": 250, "remaining_ratio": 0.8, "consumed_grams": 50,
        "per_100g": { "kcal": 20, "carbs_g": 1.5, "protein_g": 1.2, "fat_g": 1.0 },
        "nutrition_source": "ai_estimate",
        "consumed": { "kcal": 10.0, "carbs_g": 0.8, "protein_g": 0.6, "fat_g": 0.5 },
        "kcal_overridden": false, "confidence": 0.55, "needs_review": true, "user_edited": false },
      { "id": "i5", "name": "김치찌개 건더기", "location": "오른쪽 아래 뚝배기",
        "db_food_code": null, "db_name": null,
        "eaters": 1, "before_grams": 120, "remaining_ratio": 0.1, "consumed_grams": 108,
        "per_100g": { "kcal": 85, "carbs_g": 4.0, "protein_g": 7.0, "fat_g": 4.5 },
        "nutrition_source": "ai_estimate",
        "consumed": { "kcal": 91.8, "carbs_g": 4.3, "protein_g": 7.6, "fat_g": 4.9 },
        "kcal_overridden": false, "confidence": 0.7, "needs_review": false, "user_edited": false },
      { "id": "u1", "name": "계란말이",
        "db_food_code": "D-EXAMPLE-0004", "db_name": "계란말이", "db_match": "name",
        "eaters": 1, "before_grams": 60, "remaining_ratio": 0, "consumed_grams": 60,
        "per_100g": { "kcal": 150, "carbs_g": 2.0, "protein_g": 10.5, "fat_g": 11.0 },
        "nutrition_source": "db",
        "consumed": { "kcal": 90.0, "carbs_g": 1.2, "protein_g": 6.3, "fat_g": 6.6 },
        "kcal_overridden": false, "confidence": 1, "needs_review": false, "user_edited": true }
    ],
    "totals": {
      "before_kcal": 1025.0,
      "consumed": { "kcal": 677.1, "carbs_g": 82.2, "protein_g": 34.8, "fat_g": 22.0 }
    },
    "warnings": ["먹은 후 사진에 새로 보이는 음료 캔은 계산에서 뺐어요"],
    "model": "gemini-3.5-flash-lite",
    "prompt_version": "a1-b1"
  },
  "createdAt": "<serverTimestamp>",
  "updatedAt": "<serverTimestamp>"
}
```

**(3) v2 필드를 보여 주는 항목 하나**: 업체 제공 행이라 탄·지가 비어 있어 호출 D로 채웠고, 사용자가 포장지 칼로리를 직접 입력한 경우다.
```json
{ "id": "u2", "name": "치즈피자",
  "db_food_code": "D-EXAMPLE-0099", "db_name": "피자_치즈 피자 (L)", "db_match": "name",
  "eaters": 1, "before_grams": 150, "remaining_ratio": 0, "consumed_grams": 150,
  "per_100g": { "kcal": 260, "carbs_g": 30.0, "protein_g": 11.0, "fat_g": 10.0 },
  "per_100g_fill": { "carbs_g": "ai_estimate", "fat_g": "ai_estimate" },
  "nutrition_source": "db",
  "consumed": { "kcal": 420, "carbs_g": 45.0, "protein_g": 16.5, "fat_g": 15.0 },
  "kcal_overridden": true, "confidence": 1, "needs_review": false, "user_edited": true }
```

### 3.5 앱에 포함하는 식약처 DB JSON (리더 요청 e)

- 원본: 공공데이터포털 "전국통합식품영양성분정보(음식)표준데이터"(15100070, 2026-10-06 갱신), 19,738행, 52개 항목[L]. 파일은 `_workspace/00_input/mfds/mfds_food_std_raw.json`, `SOURCE.json`.
- 출력 위치: `web/public/data/mfds-foods-20261006.json`. 파일 이름에 원본 갱신일을 넣는다. 첫 번들에는 넣지 않는다.

```ts
interface MfdsDb {
  v: string;                       // "2026-10-06", 원본 갱신일
  src: string;                     // "식품의약품안전처 전국통합식품영양성분정보(음식)표준데이터(15100070)"
  foods: MfdsFood[];               // 정규화한 식품명당 1행(4.5.3 (c)로 고른 대표 행)
  groups: Record<string, number>;  // 정규화한 대표식품명 → foods 인덱스(그룹 대표 행)
}
interface MfdsFood {
  c: string;          // 식품코드 → db_food_code
  n: string;          // 식품명 원문 → db_name, 자동완성 표시
  r: string;          // 대표식품명
  k: number;          // 에너지 kcal/100g
  p: number;          // 단백질 g/100g
  cb: number | null;  // 탄수화물 g/100g, 원본이 비어 있으면 null
  f: number | null;   // 지방 g/100g, 원본이 비어 있으면 null
  ml?: 1;             // 원본 기준량 100ml를 밀도 1.0으로 환산한 행
  s?: number;         // 1인(회)분량 참고량(g). g 숫자로 바꿀 수 있을 때만(원본이 모두 비어 있어 실제로는 없음)
  w?: number;         // 공개 중량(g, 4.5.5절). 업체 제공 행의 식품중량이 100g·100ml가 아닐 때만, ml은 1ml=1g
}
```
- 원본의 나머지 항목(당류, 나트륨 등 40여 개)은 넣지 않는다. 세부명 키(4.5.4)는 파일에 넣을지, 로드 직후 앱에서 만들지 vision-ai-engineer가 정한다. 어느 쪽이든 아래 크기 목표를 지켜야 한다.
- 크기 목표
  - 파일 2.5MB 이하
  - 전송량 600KB 이하(Hosting은 gzip이나 Brotli로 압축해 보낸다 [S24])
  - 중급 휴대폰 4G에서 받기·파싱·색인까지 1초 이내
  - 목표를 넘으면 `s`부터 뺀다
- 불러오는 때: S2에 들어가는 순간 `loadNutritionDb()`를 시작한다(호출 A와 동시). 그래서 결과 화면에서 기다리지 않는다. 자동완성도 같은 함수를 쓴다.
- 캐시: 파일 이름에 버전이 있으므로 `firebase.json`에서 `/data/**`에 `Cache-Control: public, max-age=31536000, immutable`을 준다(firebase-engineer).
- 확인: `vite build` 결과에서 DB JSON이 첫 번들에 없는지, 배포 URL에서 DevTools 전송 크기가 목표 안인지(qa-integrator).
- `.claude/skills/intake-calorie-estimation/references/korean-food-kcal.json`은 개발·테스트 전용이다. 배포 빌드에 넣지 않고, 이 값을 쓴 항목은 출처를 `db`로 표시하지 않는다.

### 3.6 브라우저 저장(서버 아님)

| 저장소 | 내용 | 규칙 |
| --- | --- | --- |
| IndexedDB `meal-photos`, 저장소 `before` | 먹기 전 사진(압축본) | meal-log-frontend SKILL.md의 "먹기 전 사진 IndexedDB 임시 보관"을 그대로 따른다 |
| Firestore 영구 캐시(IndexedDB) | meals 문서(분석 결과만) | 오프라인 저장 대기용 |
| 메모리 | `resolveNutrition` 캐시, 검색 차단 상태, 먹은 후 사진(재시도용, 화면을 떠나면 버린다) | - |

localStorage와 sessionStorage에는 이미지를 넣지 않는다.

---

## 4. 인터페이스 계약

### 4.1 모듈 위치와 담당

| 경로 | 내용 | 담당 |
| --- | --- | --- |
| `web/src/types/analysis.ts` | 4.3절 타입(analysis-schema v2와 1:1) | vision-ai-engineer 작성, frontend-dev 검토 |
| `web/src/analysis/` | 호출 A·B·C·D, 결과 조립, 계산, 검증, 설정, 목업 픽스처 | vision-ai-engineer |
| `web/src/analysis/nutrition/` | DB 로드, 정규화, 매칭, 자동완성, `resolveNutrition`, 별칭표 | vision-ai-engineer |
| `web/scripts/build-mfds-db.mjs` | 식약처 원본 → 앱 JSON 변환 | vision-ai-engineer |
| `web/src/photos/` | 압축, IndexedDB 보관 | frontend-dev |
| `web/src/firebase.ts`, `web/src/data/`, `web/src/lib/time.ts` | 초기화(App Check·AI 포함), 로그인, meals 읽기·쓰기, 하루 요약, dateKey | firebase-engineer |
| `web/src/pages/`, `web/src/components/` | 화면 | frontend-dev |

### 4.2 AI 호출 공통 설정 (vision-ai-engineer. 초기화 코드는 firebase-engineer)

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| SDK | npm `firebase`(모듈식). `getAI(app, { backend: new GoogleAIBackend() })`, `getGenerativeModel(ai, {...})`. Gemini API 키는 코드에 없다(Firebase 설정 객체만 쓴다) | [S1] |
| 초기화 순서 | `initializeApp` → `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(KEY), isTokenAutoRefreshEnabled: true })` → `getAuth`·`getFirestore`(영구 캐시)·`getAI`. 개발 빌드에서만 그보다 먼저 `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` | [S3][S11]. App Check와 `getAI`의 순서는 문서에 없다. 첫 AI 요청 전에 App Check가 초기화되도록 이 순서로 고정한다 |
| 재전송 방지 토큰 | 쓰지 않는다(`useLimitedUseAppCheckTokens` 끔) | 지연이 늘고 웹 v12.14.0 이상이 필요하다 [S3] |
| 모델 | 설정값 `AI_MODEL_ID` 하나(env `VITE_AI_MODEL`). 기본 `gemini-3.5-flash-lite`, 비교 후보 `gemini-3.8-flash`(7.1절 U1) | [S4][S18][S19][S20] |
| 응답 형식 | 호출 A·B·D는 `responseMimeType: "application/json"` + `responseSchema`(`Schema` 클래스). 선택 필드는 `optionalProperties`에 넣는다(넣지 않으면 모두 필수로 본다) | [S6] |
| 호출 C | `tools: [{ googleSearch: {} }]`. 응답 스키마 없이 텍스트를 받아 JSON을 추출하고 범위를 검사한다. `groundingMetadata.searchEntryPoint.renderedContent`를 함께 돌려준다 | [S5]. Firebase 문서에는 그라운딩과 스키마를 함께 쓰는 방법이 없다 |
| 이미지 | `compressPhoto` 결과(JPEG, 긴 변 1280px, 품질 0.8)를 base64 inline data로 보낸다. 두 장을 합쳐도 1MB 안팎이라 요청 한도 20MB보다 훨씬 작다. 입력 해상도는 설정할 수 없다 | [S7] |
| thinking | 모델이 허용하는 가장 낮은 수준(3.8 Flash는 low, minimal을 주면 오류). SDK 필드 이름은 vision-ai-engineer가 확인한다 | [S20]. SDK 필드는 확인 못 함 |
| 시간 제한 | 호출 A·B는 시도당 40초(2026-10-27 사용자 결정, 처음 20초), C는 8초, D는 10초 | 녹화·심사 중 대기 상한. 밤 시간대 실측 13~40초(03_vision_eval.md) |
| 자동 재시도 | 2초 뒤 1회. 대상: 네트워크 오류, 5xx, 분당 한도 429, 형식 검증 실패. 재시도하지 않음: 시간 초과(408 포함, 2026-10-27 사용자 결정: 느린 시간대에 호출만 2번 쓰고 실패하지 않게), 400(요청·모델 ID 오류), 401·403(App Check), 안전 필터 차단, 일일 한도 429 | vision-ai-engineer 정의의 "재시도 1회 후 `ANALYSIS_UNAVAILABLE`" |
| 목업 | env `VITE_AI_MOCK=1`이면 `web/src/analysis/__fixtures__/`의 응답을 돌려준다. 개발 기본값 1, 배포 빌드 0 | 무료 한도 절약 |
| 검색 단계 스위치 | env `VITE_SEARCH_GROUNDING`(`on`·`off`). 기본값은 0단계 실측 결과로 정한다(7.1절 U3) | 7.2절 R1 |
| 프롬프트 | `prompt-template.md`의 호출 A~D를 v1(`a1`·`b1`·`c1`·`d1`)으로 그대로 쓴다. 바꾸면 버전을 올려 `_workspace/03_vision_eval.md`에 기록하고, `analysis.prompt_version`에 `a1-b1`처럼 남긴다 | intake-calorie-estimation |

### 4.3 함수 시그니처 (선언 파일 형태)

```ts
// ── web/src/types/analysis.ts ── 담당: vision-ai-engineer (analysis-schema.json v2와 1:1)
export type Nutrients = { kcal: number; carbs_g: number; protein_g: number; fat_g: number };
export type NutritionSource = "db" | "search" | "ai_estimate" | "user_input"; // 화면: DB / 검색 기반 / AI 추정 / 직접 입력
export type FillSource = "ai_estimate" | "missing";
export type DbMatch = "name" | "group" | "partial";
export interface MealItem {
  id: string;                         // 모델 항목 "i1"…, 사용자 추가 "u1"…
  name: string;
  location?: string;
  db_food_code: string | null;
  db_name?: string | null;            // v2
  db_match?: DbMatch;                 // v2
  eaters: number;                     // 정수 1~20, 기본 1
  before_grams: number;
  remaining_ratio: number | null;     // 0~1, null = 매칭 실패
  consumed_grams: number;
  per_100g: Nutrients | null;         // user_input일 때만 null
  per_100g_fill?: Partial<Record<"carbs_g" | "fat_g", FillSource>>;  // v2
  nutrition_source: NutritionSource;
  consumed: Nutrients;
  kcal_overridden: boolean;
  confidence: number;                 // 0~1, 사용자 추가 항목은 1
  needs_review: boolean;              // confidence < 0.6 또는 remaining_ratio === null
  user_edited?: boolean;
}
export interface MealIntakeAnalysis {
  items: MealItem[];
  totals: { before_kcal: number; consumed: Nutrients };
  warnings: string[];
  model?: string;
  prompt_version?: string;
}
// 호출 A·B 결과(응답 스키마 A·B + 메타). Firestore에는 BeforeAnalysis만 저장한다.
export interface BeforeItem { id: string; name: string; location: string; before_grams: number;
  confidence: number; per_100g_guess: Nutrients | null /* 범위 검사에 실패하면 null */;
  whole_count: number | null /* a3: 한 개·한 마리·한 판·1인분이 통째로 보이는 개수(1~10), 일부면 null. 4.5.5절 */ }
export interface BeforeAnalysis { items: BeforeItem[]; warnings: string[]; model: string; prompt_version: string }
export interface AfterItem { id: string; remaining_ratio: number | null; confidence: number }
export interface AfterAnalysis { items: AfterItem[]; warnings: string[]; used_before_photo: boolean;
  model: string; prompt_version: string }

// ── web/src/analysis/errors.ts ── 담당: vision-ai-engineer
export type AnalysisErrorCode = "ANALYSIS_UNAVAILABLE" | "NO_FOOD_DETECTED" | "PHOTO_INVALID";
export type AnalysisFailReason = "quota" | "app_check" | "network" | "timeout" | "server"
  | "invalid_response" | "blocked" | "bad_request";
export class AnalysisError extends Error { code: AnalysisErrorCode; reason?: AnalysisFailReason }

// ── web/src/analysis/analyze.ts ── 담당: vision-ai-engineer
/** 먹기 전 분석(호출 A). 음식이 1개 이상이고 id는 i1부터 다시 매긴다.
 *  오류: ANALYSIS_UNAVAILABLE(재시도 후), NO_FOOD_DETECTED(음식 0개), PHOTO_INVALID(413·디코드 실패) */
export function analyzeBefore(photo: Blob, opts?: { signal?: AbortSignal }): Promise<BeforeAnalysis>;

/** 먹은 후 분석(호출 B). beforePhoto가 null이면 텍스트만으로 호출하고 used_before_photo=false,
 *  warnings에 "먹기 전 사진 없이 분석"을 넣는다. before에 없는 id는 버리고 경고, 빠진 id는 remaining_ratio=null.
 *  오류: ANALYSIS_UNAVAILABLE, PHOTO_INVALID */
export function analyzeAfter(input: { before: BeforeAnalysis; beforePhoto: Blob | null; afterPhoto: Blob },
                             opts?: { signal?: AbortSignal }): Promise<AfterAnalysis>;

/** A·B를 id로 합치고 항목마다 resolveNutrition(name, { guess: per_100g_guess }) → 계산 → v2 결과를 만든다.
 *  after가 null이면 remaining_ratio를 모두 null로 둔다(남긴 비율 직접 고르기 경로). 오류를 던지지 않는다. */
export function assembleAnalysis(before: BeforeAnalysis, after: AfterAnalysis | null,
                                 opts?: { signal?: AbortSignal }): Promise<MealIntakeAnalysis>;

// ── web/src/analysis/nutrition/index.ts ── 담당: vision-ai-engineer
export type NutritionResult =
  | { source: "db"; per_100g: Nutrients; fill?: Partial<Record<"carbs_g" | "fat_g", FillSource>>;
      db_food_code: string; db_name: string; db_match: DbMatch; ml_converted?: true; published_g?: number /* 4.5.5절 */ }  // ml_converted: 화면 출처 "DB(환산)"
  | { source: "search"; per_100g: Nutrients; searchSuggestionHtml: string | null;
      groundingSources: { title?: string; uri: string }[] }        // 화면 표시용. 저장하지 않는다
  | { source: "ai_estimate"; per_100g: Nutrients; via: "guess" | "call_d" }
  | { source: "user_input"; per_100g: null };                        // 3단계가 모두 실패
/** 순서: 1 DB → 2 검색(스위치가 on이고 차단되지 않았을 때) → 3 AI 추정(guess, 없으면 호출 D) → user_input.
 *  guess는 '그 이름'에 대해 호출 A가 낸 값일 때만 넘긴다(이름을 고친 뒤에는 넘기지 않는다).
 *  dbCode가 있으면(자동완성에서 고름) 그 행을 바로 쓴다. 오류를 던지지 않는다(AbortError만 예외). */
export function resolveNutrition(name: string,
  opts?: { guess?: Nutrients | null; dbCode?: string; signal?: AbortSignal }): Promise<NutritionResult>;

/** DB JSON 지연 로드. 여러 번 불러도 한 번만 받는다. 실패하면 1회 재시도 후 reject("NUTRITION_DB_UNAVAILABLE"). */
export function loadNutritionDb(): Promise<void>;

export interface FoodSuggestion { dbCode: string; label: string; dbName: string; kcalPer100g: number; kind: "group" | "name" }
/** 자동완성. 앞부분 일치, 대표식품명(그룹)을 먼저, 최대 limit개(기본 8). DB가 아직 없으면 로드를 기다린다.
 *  오류: NUTRITION_DB_UNAVAILABLE */
export function searchFoodNames(query: string, limit?: number): Promise<FoodSuggestion[]>;

/** 변환 스크립트와 앱이 같이 쓰는 이름 정규화(4.5.4) */
export function normalizeFoodName(s: string): string;

// ── web/src/analysis/compute.ts ── 담당: vision-ai-engineer (순수 함수. 프런트 수정 화면도 이것만 쓴다)
export function recomputeItem(item: MealItem): MealItem;           // 4.6절 공식. kcal_overridden이면 consumed.kcal 유지, needs_review 다시 판정
export function applyNutrition(item: MealItem, r: NutritionResult): MealItem;  // 영양값·출처 교체 → kcal_overridden=false(user_input이면 true) → 재계산
export function setKcalOverride(item: MealItem, kcal: number | null): MealItem; // 숫자면 직접 입력, null이면 해제 후 재계산
export function newUserItem(existing: MealItem[]): MealItem;      // id uN, name "", 중량 100, 비율 0, 인원 1, confidence 1, user_input 초안
export function computeTotals(items: MealItem[]): MealIntakeAnalysis["totals"];
export function buildAnalysis(items: MealItem[], warnings: string[],
                              meta?: { model?: string; prompt_version?: string }): MealIntakeAnalysis;  // 반올림 포함

// ── web/src/analysis/validate.ts ── 담당: vision-ai-engineer
/** validate_analysis.mjs와 같은 규칙 + v2 규칙(3.3절). 사진처럼 보이는 키가 있으면 실패. 던지지 않는다. */
export function validateAnalysis(a: unknown):
  { ok: true; value: MealIntakeAnalysis; warnings: string[] } | { ok: false; errors: string[] };

// ── web/src/photos/compress.ts ── 담당: frontend-dev
/** 긴 변 1280px, JPEG 품질 0.8, EXIF 회전 반영(meal-log-frontend 구현 규칙). 오류: AnalysisError(PHOTO_INVALID) */
export function compressPhoto(file: Blob): Promise<Blob>;

// ── web/src/photos/beforePhotoStore.ts ── 담당: frontend-dev (보관·정리 규칙은 meal-log-frontend SKILL.md)
export interface BeforePhotoStore {
  put(mealId: string, photo: Blob): Promise<"idb" | "memory">;   // IndexedDB를 못 쓰면 메모리
  get(mealId: string): Promise<Blob | null>;
  remove(mealId: string): Promise<void>;
  cleanup(keepMealIds: string[], maxAgeMs?: number /* 기본 24시간 */): Promise<number>;  // 지운 개수
  clearAll(): Promise<void>;                                      // 로그아웃할 때
}
export const beforePhotoStore: BeforePhotoStore;                  // 모든 메서드가 던지지 않는다(실패는 콘솔에 기록)

// ── web/src/firebase.ts ── 담당: firebase-engineer
export const app: FirebaseApp;
export const auth: Auth;
export const db: Firestore;
export const ai: AI;
export type AuthErrorCode = "AUTH_CANCELLED" | "AUTH_INAPP_BROWSER" | "AUTH_FAILED";
export function signInWithGoogle(): Promise<void>;   // 팝업, popup-blocked면 리디렉션으로 전환. 오류: AuthError(code)
export function signOutAndClear(): Promise<void>;    // beforePhotoStore.clearAll() 후 signOut

// ── web/src/lib/time.ts ── 담당: firebase-engineer
export const APP_TIMEZONE = "Asia/Seoul";
export function toDateKey(d: Date, tz?: string): string;          // Intl.DateTimeFormat("en-CA", { timeZone })
export function guessMealType(d: Date, tz?: string): MealType;    // 2.2절 시간대

// ── web/src/data/meals.ts ── 담당: firebase-engineer
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealStatus = "awaiting_after" | "needs_review" | "done";
export interface MealDoc { dateKey: string; mealType: MealType; status: MealStatus;
  beforeAnalysis?: BeforeAnalysis; analysis?: MealIntakeAnalysis; consumedKcal?: number;
  createdAt: Timestamp | null; updatedAt: Timestamp | null }
export type MealStoreErrorCode = "MEAL_SAVE_REJECTED" | "MEAL_NOT_FOUND" | "MEAL_STORE_UNAVAILABLE";
export function newMealId(uid: string): string;
export function createAwaitingMeal(uid: string, mealId: string,
  v: { dateKey: string; mealType: MealType; beforeAnalysis: BeforeAnalysis }): Promise<void>;
export function saveReview(uid: string, mealId: string, analysis: MealIntakeAnalysis): Promise<void>;  // needs_review
export function saveMeal(uid: string, mealId: string,
  v: { dateKey: string; mealType: MealType; analysis: MealIntakeAnalysis }): Promise<void>;  // done, consumedKcal 자동, 문서가 없으면 만든다. 이미 done이면 수정(M16): dateKey·mealType·analysis·consumedKcal을 바꾸고 editedAt 기록
export function deleteMeal(uid: string, mealId: string): Promise<void>;   // 호출하는 쪽이 beforePhotoStore.remove도 부른다
export function getMeal(uid: string, mealId: string): Promise<(MealDoc & { id: string }) | null>;
export function subscribePending(uid: string, cb: (meals: (MealDoc & { id: string })[]) => void,
  onError?: (code: MealStoreErrorCode) => void): () => void;       // awaiting_after·needs_review
export function subscribeDay(uid: string, dateKey: string, cb: (s: DaySummary) => void,
  onError?: (code: MealStoreErrorCode) => void): () => void;       // done만, onSnapshot

// ── web/src/data/summary.ts ── 담당: firebase-engineer (순수 함수)
export interface DaySummary {
  dateKey: string;
  totals: Nutrients;                                       // 그날 done 문서들의 analysis.totals.consumed 합
  byMealType: Record<MealType, Nutrients & { count: number }>;
  meals: { id: string; mealType: MealType; createdAt: Date | null; consumed: Nutrients; itemNames: string[] }[];  // createdAt 오름차순
  incompleteMacros: boolean;                               // user_input이나 fill missing 항목이 하나라도 있으면 true
  hasPendingWrites: boolean;                               // 오프라인 저장 대기
}
export function summarizeDay(dateKey: string, meals: (MealDoc & { id: string })[]): DaySummary;
```

호출 순서(화면 기준)
- S2: `newMealId` → `compressPhoto` → `beforePhotoStore.put` → `analyzeBefore` → `createAwaitingMeal` → S3. `loadNutritionDb()`는 S2에 들어갈 때 미리 시작한다.
- S3: `beforePhotoStore.get` → `compressPhoto`(먹은 후) → `analyzeAfter` → `assembleAnalysis` → `saveReview`(기다리지 않음) → `beforePhotoStore.remove` → S4.
- S4: 2.3절 표의 함수 → `validateAnalysis` → `saveMeal` → S1.
- 앱 시작(로그인 후): `subscribePending` 결과의 `awaiting_after` id로 `beforePhotoStore.cleanup`.

### 4.4 오류 코드

| 코드 | 내는 곳 | 뜻 | 화면 처리 |
| --- | --- | --- | --- |
| `ANALYSIS_UNAVAILABLE` | `analyzeBefore`, `analyzeAfter` | 자동 재시도 1회 뒤에도 실패. `reason`: quota(429), app_check(401·403), network, timeout, server(5xx), invalid_response(형식 검증 2회 실패), blocked(안전 필터 차단·빈 응답), bad_request(400, 모델 ID 오류 포함) | 5절 F1·F2·F4·F10 |
| `NO_FOOD_DETECTED` | `analyzeBefore` | 음식 0개 | 다시 찍기 / 직접 입력 |
| `PHOTO_INVALID` | `compressPhoto`, `analyze*` | 이미지 디코드 실패, 413 | 다시 찍기 |
| `NUTRITION_DB_UNAVAILABLE` | `loadNutritionDb`, `searchFoodNames` | DB JSON 로드 실패(재시도 뒤) | DB 단계를 건너뛰고, 자동완성 대신 자유 입력 |
| `MEAL_SAVE_REJECTED` | meals.ts의 쓰기 함수 | 규칙 거부(permission-denied) | 오류 표시, S4 내용 유지 |
| `MEAL_NOT_FOUND` | `getMeal` | 문서 없음(삭제됨) | S1로 이동 |
| `MEAL_STORE_UNAVAILABLE` | `subscribe*` | 네트워크·내부 오류 | 캐시 값 표시 + 배너 |
| `AUTH_CANCELLED`, `AUTH_INAPP_BROWSER`, `AUTH_FAILED` | `signInWithGoogle` | 사용자 취소, 인앱 브라우저, 그 밖의 실패 | 안내 문구 |

Firebase AI SDK 오류를 `reason`으로 바꾸는 표는 vision-ai-engineer가 구현하면서 `_workspace/03_vision_eval.md`에 남긴다.

### 4.5 영양값 조회(`resolveNutrition`)와 식약처 DB 처리 규칙

#### 4.5.1 조회 순서

| 단계 | 조건 | 성공하면 | 실패하면 |
| --- | --- | --- | --- |
| 1 DB | 매칭 규칙 4.5.4 | `db`. 비어 있는 탄·지는 4.5.3 (b)로 채운다 | 2로 |
| 2 검색(호출 C) | `VITE_SEARCH_GROUNDING=on`이고 이번 세션에서 차단되지 않았다. 끼니당 최대 3회, 8초 | 네 값이 모두 범위 안(kcal 0~900/100g, 탄·단·지 각 0~100, 세 값 합 100 이하) → `search` + 검색 추천 HTML | NOT_FOUND, 파싱·범위 실패, 시간 초과 → 3으로. 400·403·429 → 3으로 가고 세션 동안 2단계 차단 |
| 3 AI 추정 | `guess`가 있으면 호출 없이 쓴다. 없으면 호출 D(10초, 응답 스키마 D) | `ai_estimate` | 4로 |
| 4 직접 입력 | - | `user_input`, `per_100g=null`, kcal 입력란 포커스 | - |

- 캐시: 세션 메모리 `Map(정규화 이름 → 결과)`에 2·3단계(호출 C·D) 결과를 넣는다. 같은 이름은 두 번째부터 호출하지 않는다.

#### 4.5.2 변환 스크립트 (vision-ai-engineer, 10/27)

`web/scripts/build-mfds-db.mjs`: 입력 `_workspace/00_input/mfds/mfds_food_std_raw.json`(`{fields, records}`)과 `SOURCE.json`, 출력 3.5절 JSON.
1. 숫자로 바꾼다. 빈 값은 0이 아니라 null로 둔다. 에너지나 단백질이 빈 행은 버린다(현재 0건[L]).
2. 기준량이 100ml인 행은 4.5.3 (a)를 따른다.
3. 범위 밖 행(kcal 900/100g 초과, 영양소 음수나 100 초과, 탄·단·지 합 100 초과)은 버린다.
4. 정규화한 식품명이 같은 행들은 4.5.3 (c)로 1행만 남긴다.
5. 대표식품명 그룹마다 4.5.3 (c)로 대표 행을 골라 `groups`에 넣는다.
6. `1인(회)분량 참고량`을 g 숫자로 바꿀 수 있으면 `s`, 아니면 생략한다.
7. 통계를 출력하고 `_workspace/03_vision_eval.md`의 "DB 변환" 절에 적는다. 입력 행 수, 기준량별 행 수, 버린 행(이유별), 대표 행 선택 후 탄·지 null 수, 고유 이름 수, 그룹 수, 파일 크기와 gzip 크기. qa-integrator는 [L] 수치(19,738행, 100g 13,954행·100ml 5,784행, 탄 빈 값 12,777행·지 빈 값 13,319행, 고유 이름 15,658개)와 대조한다.

#### 4.5.3 리더 요청 (a)~(c)

**(a) 100ml 기준 행**
1. 정규화한 이름이 같은 100g 행이 있으면 그 이름의 100ml 행은 모두 버린다. 예를 들어 쌀밥은 100g 행(166kcal)을 쓰고 100ml 행(120kcal)은 버린다[L].
2. 100ml 행만 있는 이름은 분류와 상관없이(액체·고형 모두) 밀도를 1.0g/ml로 보고 100ml 값을 그대로 100g 값으로 쓰며 `ml: 1`을 붙인다. 액체 분류 목록(음료 및 차류, 국 및 탕류, 찌개 및 전골류, 죽 및 스프류)은 통계에서 고형·액체를 나눠 세는 데만 쓴다.
3. (2026-10-26 사용자 결정으로 삭제) 고형 음식의 ml 전용 행을 빼던 규칙. 이 규칙으로 제육볶음·달걀후라이 같은 흔한 이름 775개(1,690행)가 빠져 AI 추정으로 넘어갔다.
4. 화면 출처 표시: `ml: 1` 행에서 온 값은 "DB"가 아니라 **"DB(환산)"**으로 보여 준다. 결과에는 `nutrition_source="db"`에 `db_ml_converted: true`를 붙인다(3.3절 선택 필드, `NutritionResult`의 db 분기에 `ml_converted?: true`).
- 이유: 고형 음식은 부피 밀도가 1과 달라(리더 수치로 쌀밥은 약 0.72g/ml) 30% 가까이 틀릴 수 있다. 그래도 사진만으로 하는 AI 추정보다 나을 가능성이 크다고 보고 넣되, 출처를 "DB(환산)"으로 구분해 일반 DB 값처럼 보이지 않게 한다. 10/29 측정에서 환산 DB 값과 AI 추정 값을 함께 계산해 비교한다(`_workspace/00_handoff.md` "10/29 모델 비교 계획").

**(b) 탄수화물·지방 빈 값** (7.1절 U2 확인 전까지는 이 안으로 구현한다)
1. 변환에서는 null로 둔다. 0으로 채우지 않는다.
2. 대표 행을 고를 때 탄·지가 모두 있는 행을 우선한다((c)의 2).
3. 조회할 때 null인 영양소만 채운다. 순서는 호출 A의 `per_100g_guess`(추가 호출 없음) → 없으면 호출 D(캐시) → 그것도 안 되면 0으로 두고 `missing`.
4. `nutrition_source`는 `db` 그대로 둔다(kcal과 단백질은 DB 값이다). 채운 영양소는 `per_100g_fill`에 `ai_estimate` 또는 `missing`으로 적는다. 화면은 그 영양소 옆에 "AI 추정"을, `missing`이면 "–"를 보이고, 하루 요약에는 "일부 음식의 탄·단·지가 빠져 있어요"를 띄운다.

**(c) 같은 이름이 여러 건일 때** (정규화 식품명 그룹, 대표식품명 그룹 모두 같은 규칙)
1. 100g 행을 우선한다((a)).
2. 탄·지가 모두 있는 행이 하나라도 있으면 그 행들만 남긴다.
3. 남은 행 가운데 kcal이 중앙값에 가장 가까운 실제 행 하나를 고른다. 동률이면 식품기원(가정식 분석 > 외식 분석 > 급식·외식 재료량 기반 산출 > 외식 업체 제공) → 데이터기준일자가 최신인 행 → 식품코드 사전순으로 정한다.
- 이유
  - 값이 실제 한 행에서 오므로 `db_food_code`로 추적할 수 있고 "DB" 표시가 정직하다. 평균을 내면 DB에 없는 값이 생긴다.
  - 중앙값은 업체별 편차(제육볶음 103~168kcal[L])에 덜 흔들린다.
  - 결과가 결정적이라 테스트하기 쉽다.
- 4단계에 vision-ai-engineer가 "가정식 우선"과 평가로 비교할 수 있다. 측정해서 나아질 때만 바꾼다.

#### 4.5.4 이름 매칭 순서 (리더 요청 d)

정규화 `normalizeFoodName`(변환 스크립트와 앱이 같은 함수를 쓴다): NFKC → 괄호류 `()[]{}`와 그 안 내용 삭제 → 공백·가운뎃점·쉼표·마침표·하이픈 삭제 → 영문 소문자. `_`는 남긴다.

키 세 가지
- 이름 키: 정규화한 식품명(예: `쌀밥`, `김치찌개_햄`)
- 세부명 키: "A_B" 형식일 때, B에 A가 들어 있으면 B, 아니면 B+A(예: "피자_치즈 피자 (L)" → `치즈피자`, "김치찌개_햄" → `햄김치찌개`). 여러 행이 같은 키를 가지면 (c)로 고른다.
- 그룹 키: 정규화한 대표식품명 → (c)로 고른 대표 행

조회어 q(모델이나 사용자가 낸 이름을 정규화한 것)
0. `dbCode`가 있으면(자동완성에서 고름) 그 행 → `db_match: name`
1. 이름 키 = q → `name`
2. 세부명 키 = q → `name`
3. 그룹 키 = q → `group`(예: 모델이 "김치찌개"라고 했는데 그 이름의 행이 없으면 "김치찌개_*"의 대표 행)
4. 별칭표 `web/src/analysis/nutrition/aliases.json`으로 q를 바꿔 1~3을 다시 본다. 별칭표는 vision-ai-engineer가 샘플·평가에서 자주 어긋난 이름 위주로 관리한다(예: 공기밥·흰쌀밥 → 쌀밥, 김치 → 배추김치).
5. 뒤쪽 일치: q가 어떤 그룹 키(2글자 이상)로 끝나면 가장 긴 것 → `partial`(예: 돼지고기김치찌개 → 김치찌개). 앞·중간 일치는 하지 않는다. q가 "국물"이나 "건더기"로 끝나면 이 단계를 건너뛴다.
6. 그래도 없으면 DB 실패로 보고 2단계로 간다.

- 국물·건더기: 호출 A는 국·찌개를 건더기와 국물로 나누는데(intake-calorie-estimation), DB 값은 완성 음식 기준이다. 그래서 1~4의 정확 일치만 허용하고 부분 일치로 완성 음식 값을 붙이지 않는다. 이런 항목은 대개 AI 추정이 되며, 평가에서 따로 측정한다(7.2절 R7).
- 자동완성(`searchFoodNames`): 세 키의 앞부분 일치. 그룹을 먼저("김치찌개 · 대표값"), 다음은 이름이 짧은 순으로 최대 8개. 고르면 `dbCode`로 조회한다.

#### 4.5.5 공개 중량으로 먹기 전 무게 정하기 (2026-10-26 사용자 결정)

프랜차이즈처럼 크기가 정해진 메뉴(예: 빅맥 한 개, 싸이버거 한 개, 피자 한 판)는 업체가 공개한 중량이 사진 추정보다 정확하다.

- **공개 중량(`w`)**: 식약처 원본 `식품중량` 가운데 식품기원이 "외식(프랜차이즈 등 업체 제공 영양정보)"이고 값이 100g·100ml가 아닌 것만 쓴다(100이면 영양값 기준량과 같은 값이라 메뉴 크기가 아니다. 예: `닭튀김_허니콤보 치킨` 식품중량 100g → 공개 중량 없음). ml이면 1ml=1g으로 바꾼다(DB(환산)과 같은 가정). 가정식·급식·외식 분석 행의 식품중량은 분석 시료 무게라 쓰지 않는다. 원본 확인(2026-10-26): 업체 제공 g 행 12,625 중 100g이 아닌 것 11,897, ml 행 2,600 중 100ml가 아닌 것 2,599.
- **적용 조건(모두 만족)**
  1. 호출 A가 그 음식을 "한 개·한 마리·한 판·1인분이 통째로 보인다"고 답했다: `whole_count`(정수 1~10). 일부만 덜어 왔거나, 잘라 놓은 조각이거나, 나눠 담겼으면 `null`.
  2. DB 매칭이 세부 종류까지 일치(`db_match: "name"`, 자동완성 dbCode 포함)했다.
  3. 매칭된 DB 행에 공개 중량 `w`가 있다.
- **적용하면** `before_grams = w × whole_count`, 항목에 `grams_source: "published"`, `published_g: w`, `unit_count: whole_count`. 화면은 무게 옆에 "공개 중량 223g × 1" 표시.
- **적용하지 않으면** 지금처럼 호출 A의 추정 무게(AI 추정).
- 남긴 비율은 그대로 사진 비교(호출 B). 섭취량 공식은 4.6절 그대로.
- 결과 수정에서 사용자가 무게를 고치면 `grams_source` 등을 지우고 사용자 값으로 둔다. 이름을 바꿔도 무게는 유지한다(공개 중량을 다시 적용하지 않는다, 결과 수정 규칙).
- 프롬프트는 a3(호출 A에 `whole_count` 추가). 버전이 바뀌므로 같은 사진 캐시는 다시 분석한다.
- 일정: 3단계 조각 1-2와 함께 분석 쪽에서 넣고(10/29 측정 전), 화면 표시("공개 중량")는 리더가 붙인다. 10/29 측정에서 공개 중량 적용 항목의 무게 오차를 따로 본다.

### 4.6 칼로리 계산식 (`compute.ts`)

```
r = remaining_ratio ?? 0                      // null(매칭 실패)은 다 먹은 것으로 계산, needs_review=true
consumed_grams = before_grams × (1 − r) ÷ eaters
consumed.X     = per_100g.X × consumed_grams ÷ 100        (X = kcal, carbs_g, protein_g, fat_g)
               = 100g당 값 × 추정 중량 ÷ 100 × (1 − 남긴 비율) ÷ 같이 먹은 인원수   ← CLAUDE.md 공식
```
- `kcal_overridden=true`: `consumed.kcal`은 사용자가 입력한 값. 탄·단·지는 공식대로 계산한다.
- `user_input`(`per_100g=null`): `consumed.kcal`은 사용자가 입력한 값, 탄·단·지는 0으로 두고 화면에는 "–".
- `per_100g_fill.X = missing`: `per_100g.X = 0`이므로 `consumed.X = 0`, 화면에는 "–".
- `needs_review = confidence < 0.6 || remaining_ratio === null`
- `totals.consumed.X = Σ items.consumed.X`, `totals.before_kcal = Σ before_grams × (per_100g?.kcal ?? 0) ÷ 100`(인원수로 나누지 않는다).
- 반올림: 계산은 원래 정밀도로 하고 저장 직전에 소수 첫째 자리로 반올림한다. 합계도 반올림 전 값을 더한 뒤 반올림한다. 화면 표시는 kcal 정수, g 소수 첫째 자리.
- 하루 요약: 그날 `done` 문서들의 `analysis.totals.consumed`를 더한다. 끼니별 합계는 `mealType`으로 묶는다.
- 검증 허용 오차는 `validate_analysis.mjs`를 따른다(2% 또는 1).

### 4.7 목표 설정과 목표 대비 비교 (3단계, 2026-10-26 사용자 결정)

AI 호출 없이 공식으로만 계산한다. 담당: 계산 함수 vision-ai-engineer(`web/src/analysis/goal.ts`, 순수 함수), 저장·규칙 firebase-engineer, 화면 frontend-dev.

**입력(S6)**
| 필드 | 값 | 범위 |
| --- | --- | --- |
| `sex` | `male`·`female` | 공식의 성별 상수에만 쓴다 |
| `age` | 정수(만 나이) | 14~100 |
| `height_cm` | 숫자 | 120~220 |
| `weight_kg` | 숫자 | 30~250 |
| `activity` | `sedentary`(거의 안 움직임) 1.2 · `light`(주 1~3회 가벼운 운동) 1.375 · `moderate`(주 3~5회) 1.55 · `active`(주 6~7회) 1.725 · `very_active`(매일 고강도·육체노동) 1.9 | |
| `goal` | `lose`(감량)·`maintain`(유지)·`gain`(증량) | 만 18세 미만은 `maintain`만 |

**계산**
```
BMR  = 10 × weight_kg + 6.25 × height_cm − 5 × age + (male ? 5 : −161)     // Mifflin-St Jeor
TDEE = BMR × activity 계수
target_kcal = TDEE − 500 (lose) | TDEE (maintain) | TDEE + 300 (gain)
target_kcal = max(target_kcal, BMR)            // 안전 장치: 기초대사량 아래로 내리지 않는다. 내렸으면 clamped=true
carbs_g = target_kcal × 0.55 ÷ 4, protein_g = target_kcal × 0.20 ÷ 4, fat_g = target_kcal × 0.25 ÷ 9
```
- 손 계산 예시(QA 대조용, 반올림 전 → 표시값)
  - 남 30세 175cm 70kg, 주 3~5회(1.55), 감량: BMR 1648.75 → 1650, TDEE 2555.56 → 2560, 목표 2055.56 → 2060kcal, 탄 282.6 → 283g, 단 102.8 → 103g, 지 57.1 → 57g, clamped=false
  - 여 25세 160cm 50kg, 거의 안 움직임(1.2), 감량: BMR 1214 → 1210, TDEE 1456.8 → 1460, 감량 계산값 956.8이 BMR보다 낮아 목표 1214 → 1210kcal(clamped=true), 탄 166.9 → 167g, 단 60.7 → 61g, 지 33.7 → 34g
- 탄·단·지 비율 55:20:25는 한국인 영양소 섭취기준(2020)의 에너지 적정비율(탄 55~65%, 단 7~20%, 지 15~30%) 안에서 고른 고정값이다. 사용자가 비율을 고치는 기능은 없다.
- 반올림: BMR·TDEE·목표 kcal은 10kcal 단위, 탄·단·지는 g 정수. 계산은 원래 정밀도로 하고 표시·저장 직전에 반올림한다.
- 만 18세 미만: 감량·증량을 고를 수 없고 목표는 유지로 계산한다. 안내 문구: "성장기에는 감량·증량보다 고르게 잘 먹는 것이 중요해요. 목표는 유지 기준으로 보여 드려요."
- `clamped=true`면: "목표 칼로리가 기초대사량보다 낮아지지 않게 맞췄어요."
- 모든 목표 화면과 하루 요약의 목표 영역에 고지: "이 목표는 일반 공식(Mifflin-St Jeor)으로 계산한 참고값이며 의학적 조언이 아니에요. 질환이 있거나 임신·수유 중이면 전문가와 상의하세요."

**함수(`web/src/analysis/goal.ts`)**
```ts
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";
export interface GoalInput { sex: Sex; age: number; height_cm: number; weight_kg: number; activity: Activity; goal: GoalType }
export interface GoalResult { bmr: number; tdee: number; target_kcal: number;
  macros: { carbs_g: number; protein_g: number; fat_g: number };
  goal_applied: GoalType;            // 만 18세 미만이면 maintain
  clamped: boolean; minor: boolean; formula: "mifflin-st-jeor" }
export function validateGoalInput(x: unknown): { ok: true; value: GoalInput } | { ok: false; errors: string[] };
export function computeGoal(input: GoalInput): GoalResult;
/** 사용자가 직접 조정한 값(없는 키는 추천값). */
export interface GoalOverride { target_kcal?: number; carbs_g?: number; protein_g?: number; fat_g?: number }
export interface GoalTargets { target_kcal: number; carbs_g: number; protein_g: number; fat_g: number;
  source: "recommended" | "custom" }   // 하나라도 직접 조정했으면 custom
/** 추천값 + 직접 조정 → 실제로 쓰는 목표. kcal 하한(성인 BMR, 만 18세 미만 TDEE)을 지키고, 어기면 errors에 이유. */
export function applyOverride(result: GoalResult, o: GoalOverride | null):
  { targets: GoalTargets; errors: string[] };
export function compareToGoal(consumed: Nutrients, targets: GoalTargets):   // 하루 요약 막대용
  Record<"kcal" | "carbs_g" | "protein_g" | "fat_g", { eaten: number; target: number; remaining: number; ratio: number }>;  // remaining<0이면 초과
```

**수정과 직접 조정(2026-10-26 사용자 추가)**
- 키·몸무게·나이·활동량·목표(성별 포함)는 S6에서 언제든 고칠 수 있다. S1에서 S6으로 가는 링크를 둔다. 입력을 바꾸면 저장 전에도 화면의 추천값을 바로 다시 계산한다(`computeGoal`).
- 추천값(목표 kcal, 탄·단·지 g)은 사용자가 직접 조정할 수 있다(`GoalOverride`). 조정한 값 옆에 "직접 조정" 표시와 [추천값으로] 버튼을 둔다.
- 직접 조정 규칙: 목표 kcal 하한은 성인이면 기초대사량, 만 18세 미만이면 하루 소모량(유지 중심). 상한 6000. 하한보다 낮게 입력하면 저장하지 않고 이유를 보인다. 탄·단·지는 각 0~1000g이고, kcal만 조정하면 탄·단·지는 55:20:25로 다시 나눈다(탄·단·지를 직접 조정했으면 그 값을 유지).
- 입력을 바꿔 추천값이 바뀌어도 직접 조정한 값은 남긴다. 다만 새 하한보다 낮아지면 "새 기초대사량보다 낮아요" 경고를 띄우고 저장 전에 고치게 한다.

**저장**
- 현재 설정: `users/{uid}` 문서의 `goal: { input: GoalInput, override: GoalOverride | null, result: GoalResult, targets: GoalTargets, updatedAt }`. 다른 기기에서도 같은 목표를 쓰려고 Firestore에 둔다(본인만 읽기·쓰기).
- **날짜별 목표 기록(2026-10-26 사용자 추가):** 목표를 저장할 때마다 `users/{uid}/goals/{dateKey}`(Asia/Seoul 오늘 날짜)에 `{ dateKey, targets: GoalTargets, updatedAt }`을 같은 배치로 쓴다. 같은 날 여러 번 바꾸면 그날 문서를 덮어쓴다. 신체 정보(input)는 기록에 넣지 않는다.
  - 어떤 날 D의 비교 목표 = `dateKey <= D`인 기록 가운데 가장 늦은 것(`where("dateKey","<=",D)`, `orderBy("dateKey","desc")`, `limit(1)`, 단일 필드 인덱스). 그래서 나중에 목표를 바꿔도 지난 날은 그때 목표로 비교된다.
  - D 이전 기록이 없으면(목표를 처음 정하기 전의 날) 그날은 목표 없이 합계만 보인다.
  - 서버 집계 문서(`daily/*`)가 아니다. 목표 값만 날짜로 남긴다.
- 규칙: 본인 uid만. `users/{uid}`는 키 `hasOnly(["goal"])`, `goal.input`의 열거값과 범위(위 표), `targets.target_kcal` 800~6000. `goals/{dateKey}`는 문서 id와 `dateKey` 필드가 같고 형식 `^\d{4}-\d{2}-\d{2}$`, 키 `hasOnly(["dateKey","targets","updatedAt"])`.
- 목표가 없으면 하루 요약은 지금처럼 합계만 보이고 "목표 설정하기" 카드를 띄운다.

**하루 요약(S1) 목표 비교**
- 그날의 목표(위 "날짜별 목표 기록")로 비교한다. 오늘은 현재 목표와 같다.
- kcal·탄·단·지 네 줄: "먹은 양 / 목표" 막대와 "남은 양 ○○"(넘으면 "○○ 초과", 막대 색 바꿈). 막대 길이는 `ratio`(100%에서 자른다).
- 대기 상태 식사는 합계와 마찬가지로 빼고 `done`만 비교한다.

**주간 추이(S9 `/week`, M17, 2026-10-26 사용자 결정)**
- 홈에서 "주간 추이" 링크로 연다. 주소 `/week?end=YYYY-MM-DD`(없으면 오늘). 7일 = end − 6일 ~ end.
- 위쪽 탭: 칼로리 | 탄 | 단 | 지. 탭마다 일별 꺾은선그래프(가로 7일, 세로 그날 `done` 기록 합계).
- 그날의 목표값(4.7절 "날짜별 목표 기록"으로 고른 값)을 점선으로 겹친다. 목표 기록이 없는 날은 점선도 끊긴다.
- 기록 없는 날은 0으로 그리지 않고 빈칸(선이 끊김)으로 둔다. 오늘 이후 날짜는 그리지 않는다.
- "◀ 지난주" / "다음 주 ▶"로 7일씩 옮긴다. end가 오늘이면 "다음 주 ▶" 비활성.
- 점을 누르면 그날 값과 목표, 그날 홈(`/?date=`)으로 가는 링크.
- 데이터: `where("dateKey", ">=", 시작)`, `where("dateKey", "<=", end)` 범위 쿼리 하나(단일 필드 인덱스), `done`만 클라이언트에서 거른다. 하루 합산은 `summarizeDay`를 그대로 쓴다. 목표는 `goals`에서 `dateKey <= end`인 기록을 읽어 날마다 고른다. AI 호출 없음.
- 그래프는 가벼운 SVG(외부 차트 라이브러리를 쓰면 첫 화면 번들에서 빼고 lazy로).
- 월간 그래프·리포트·음식 추천은 프리미엄 기능으로 3단계가 끝난 뒤 따로 다룬다(지금은 만들지 않음).

**프리미엄 기능(3단계가 끝난 뒤 따로, 지금은 만들지 않음):** 남은 영양소 기반 음식 추천, 월간 그래프, 리포트. 발표에서는 프리미엄 계획으로 소개한다.

---

## 5. 실패 대체 경로

### 5.1 상황별 처리

| ID | 상황 | 자동 처리 | 사용자에게 보이는 것 | 담당 |
| --- | --- | --- | --- | --- |
| F1 | 호출 A 실패(네트워크, 5xx, 429, 시간 초과, 형식 오류) | 2초 뒤 1회 재시도(시간 초과는 재시도 없이 바로) → 그래도 실패하면 `ANALYSIS_UNAVAILABLE` | "다시 시도"(IndexedDB의 같은 사진으로), "직접 입력"(S4 빈 목록, 사진 삭제), "데모 사진 사용" | vision-ai-engineer, frontend-dev |
| F2 | App Check 거부(401·403) | 재시도하지 않는다 | "앱 확인에 실패했어요" + 직접 입력. 개발 빌드에서는 디버그 토큰 안내 | firebase-engineer, frontend-dev |
| F3 | 음식을 못 찾음(`NO_FOOD_DETECTED`) | - | "음식을 찾지 못했어요": 다시 찍기, 직접 입력 | frontend-dev |
| F4 | 호출 B 실패 | 1회 재시도. 먹기 전 사진은 IndexedDB에 남긴다 | "다시 시도"(먹은 후 사진이 이 화면 메모리에 있을 때만, 없으면 다시 촬영), "남긴 비율 직접 고르기"(`assembleAnalysis(before, null)` → S4) | vision-ai-engineer, frontend-dev |
| F5 | 먹기 전 사진 없음(브라우저 데이터 삭제, 사생활 보호 모드, 다른 기기) | 텍스트만으로 호출 B | S4 위쪽에 "먹기 전 사진 없이 분석해 정확도가 낮을 수 있어요" | vision-ai-engineer, frontend-dev |
| F6 | DB에 없는 이름 | 검색(켜져 있을 때) → AI 추정 → 직접 입력 | 출처 배지 | vision-ai-engineer |
| F7 | 검색 불가(무료 등급 미제공, 400·403·429) | 그 세션 동안 2단계를 건너뛴다 | AI 추정 배지 | vision-ai-engineer |
| F8 | 신뢰도 낮음(`confidence<0.6`), 매칭 실패(`null`) | `needs_review=true`. null은 0으로 계산 | 맨 앞에 정렬, 노란 테두리, "남긴 양 확인 필요" | vision-ai-engineer, frontend-dev |
| F9 | 느린 응답 | 시도당 40초 제한, 시간 초과는 재시도하지 않음 | 10초에 "조금 더 걸려요" + "직접 입력" 링크 | frontend-dev |
| F10 | 일일 한도 소진(재시도 뒤에도 429) | 그 세션은 "AI 한도 모드": 촬영 대신 직접 입력을 먼저 보여 준다 | "오늘 AI 분석 한도를 다 썼어요. 16:00(11/2부터는 17:00)에 다시 열려요" + 직접 입력 | frontend-dev |
| F11 | DB JSON 로드 실패 | 1회 재시도 → DB 단계 건너뜀 | 자동완성 대신 자유 입력 | vision-ai-engineer, frontend-dev |
| F12 | 오프라인이거나 저장이 느림 | Firestore 영구 캐시 대기열에 넣는다. 화면은 3초까지 기다리고 S1로 이동 | "저장 대기 중"(`hasPendingWrites`) | firebase-engineer, frontend-dev |
| F13 | 규칙 거부(`MEAL_SAVE_REJECTED`) | - | 오류 표시. S4 내용을 유지해 다시 저장할 수 있다. qa-integrator에 결함으로 보고 | firebase-engineer |
| F14 | 로그인 팝업 차단, 인앱 브라우저 | 리디렉션으로 전환 | 외부 브라우저 안내 | firebase-engineer, frontend-dev |
| F15 | 영상 녹화 중 조명·네트워크·한도 문제 | - | 샘플 체험(M12) → 미리 분석한 실제 결과 재생(화면에 표시, 영상에서도 밝힌다, U6) → 11/5 17:00 전에 다시 녹화 | pitch-writer, qa-integrator |

### 5.2 무료 한도 운용 (녹화·심사 기간 포함)

#### 5.2.1 한도와 시간표
- 한도는 프로젝트 단위이고 일일 한도는 태평양 시간 자정에 초기화된다 [S16]. 미국 서머타임이 2026-11-01에 끝나므로, 10/26~11/1에는 16:00 KST, 11/2 이후에는 17:00 KST에 초기화된다.
- firebase-engineer는 0단계에 모델별 실제 한도를 확인해 `_workspace/02_firebase_notes.md`에 적는다. 아래 계산은 그 값으로 다시 한다.
- 계획용 가정(미검증 [X1]): 3.5 Flash-Lite 분당 10회·하루 500회, 3.8 Flash 분당 5회·하루 20회. 운영 모델(U1)은 정확도와 함께 **실측 무료 일일 한도**를 기준으로 고른다. 심사위원 여러 명이 며칠 동안 쓰므로 일일 한도가 작은 모델은 운영에 쓰지 않는다.
- 한 끼에 드는 호출: A 1회 + B 1회, 여기에 이름 수정·추가 항목의 호출 D와 재시도를 더하면 약 2.5회. 샘플 체험(M12)은 0회.
- 화면 개발은 `VITE_AI_MOCK=1`로 한다. 실제 호출은 vision-ai-engineer 평가와 qa-integrator 점검에만 쓴다. 평가 1회(10쌍)에 20회 이상 든다. 개발 기간 하루 예산은 약 100회로 잡는다(평가 2회 약 50회 + 점검 약 30회 + 수동 확인 약 20회).
- 제출·심사 시간표(`CLAUDE.md` "제출·심사"): 현장 시연은 없다. 영상 녹화는 11/4~11/5 17:00 전에 끝낸다(11/4 17:00~11/5 17:00이 한 한도 창이다). **11/5 17:00 이후 새로 채워지는 한도는 심사위원용**이라 그 뒤로는 개발·QA·녹화에서 실제 AI 호출을 하지 않는다. 11/5 18:00까지 영상과 URL을 제출한다.
- 심사 기간에는 배포본을 바꾸지 않는다. firebase-engineer가 하루 한 번 사용량만 확인해 `_workspace/02_firebase_notes.md`에 적는다.
- 녹화 직전에 남은 한도를 확인한다(qa-integrator, 점검표 F).

#### 5.2.2 호출 절약 장치 (M13)
세부 시그니처와 저장 구조는 1단계에서 담당 에이전트가 정해 4.3절·3.6절에 반영한다.

| 장치 | 내용 | 담당 |
| --- | --- | --- |
| 같은 사진 결과 캐시 | 압축본 SHA-256을 키로 호출 A·B 결과를 기기 IndexedDB에 보관한다. 재시도·뒤로 가기·두 번 누르기·같은 사진 다시 고르기에 다시 호출하지 않는다. 해시는 Firestore에 넣지 않는다 | vision-ai-engineer, frontend-dev |
| 샘플 체험 | M12. 미리 분석한 결과(정적 JSON)로 AI 호출 0회. 운영 빌드에서 홈과 촬영 화면에 잘 보이게 둔다 | vision-ai-engineer, frontend-dev |
| 분석 중 잠금 | 분석 중에는 버튼을 잠그고 식사당 진행 중 요청을 1개로 제한한다 | frontend-dev |
| 429 구분 | 분당 한도는 잠깐 뒤 1회 재시도, 일일 한도 소진은 재시도 없이 한도 모드(F10) | vision-ai-engineer |
| 영양값 캐시 | DB → 호출 A의 `per_100g_guess` 재사용 → 이름별 IndexedDB 영구 캐시. 호출 D는 이름을 확정할 때만 | vision-ai-engineer |
| 검색 단계 고정 | 0단계 스파이크 판정 결과를 설정값으로 고정한다. 불가면 호출 C를 하지 않는다. 가능하면 호출 C만 무료 그라운딩이 있는 모델(예: `gemini-2.5-flash-lite`)로 보낸다 | vision-ai-engineer |
| 사용자별 상한 | 하루 실시간 분석 상한(기본 6끼, 오늘 `meals` 문서 수로 클라이언트가 판단, 실측 한도를 보고 4단계에 조정)을 넘으면 샘플 체험·직접 입력을 안내한다. AI Logic 사용자별 분당 요청 한도를 기본 100에서 10으로 낮춘다 [S8] | frontend-dev, firebase-engineer(4단계) |

---

## 6. 일정표

기능 동결 11/4(수), 최종 배포 11/5(목). 날짜는 `CLAUDE.md` 개발 순서와 같다.

### 6.1 단계별 작업과 완료 기준

**0단계 · 10/26(월) · 환경 준비**

| 담당 | 작업 |
| --- | --- |
| architect | 이 스펙 초안. 사용자가 확인하면 리더가 해시를 고정한다(`_workspace/freeze_01.sha`) |
| 리더·사용자 | 7.1절 U0(폴더, 계정, 프로젝트 ID, Firestore 위치)와 나머지 U 항목 확인. 폴더가 정해지면 `git init`을 권장한다(여러 에이전트가 며칠 동안 나란히 작업하므로 되돌리기와 추적이 필요하다) |
| firebase-engineer | Spark 프로젝트 생성(결제 계정 연결 없음) → Google 로그인 사용 → Firestore 생성 → AI Logic 설정(Gemini Developer API) → App Check(reCAPTCHA Enterprise 키 생성 시도. 결제 수단을 요구하면 멈추고 보고, U8) → 개발 브라우저 디버그 토큰 등록 → AI 모니터링이 꺼져 있는지 확인(R3) → 모델별 실제 무료 한도(RPM·RPD)를 AI Studio나 Cloud 콘솔에서 확인 → `_workspace/02_firebase_notes.md`에 기록. 저장소 골격(`web/` Vite+React+TS, `firebase.json`, 에뮬레이터 auth·firestore·hosting) |
| vision-ai-engineer | 스파이크(프로젝트가 준비되면 바로, 늦어도 10/27 오전): ① 이미지 1장 + 응답 스키마 A 호출(후보 모델 두 개 각 1회) ② `googleSearch` 호출 C(기본 모델 1회 + `gemini-2.5-flash-lite` 1회, 응답 스키마와 함께 쓸 수 있는지도 본다). 상태 코드와 오류 문구를 `_workspace/03_vision_eval.md` "스파이크" 절에 기록한다(R1 판정) |
| 사용자 | 샘플 전·후 사진 촬영 시작(10/29까지 5쌍, 11/1까지 10쌍), `expected.json` 작성 |

완료 기준: 사용자가 스펙을 확인했다. localhost에서 App Check 디버그 토큰으로 AI 호출이 1회 성공했다. 실제 무료 한도와 그라운딩 가능 여부가 기록됐다. U1·U3가 정해졌다.

**1단계 · 10/27(화)~10/29(목) · 사진 두 장 → 칼로리 핵심 기능 연결**

| 담당 | 작업 |
| --- | --- |
| vision-ai-engineer | 10/27: analysis-schema v2, `validate_analysis.mjs`, `web/src/types/analysis.ts`(3.3절), DB 변환 스크립트·JSON·변환 통계, 정규화·매칭·자동완성. 10/28: `analyzeBefore`·`analyzeAfter`(프롬프트 v1), `resolveNutrition`, 계산·조립·검증, 목업 픽스처. 10/29: 5쌍 첫 측정(끼니 kcal MAPE, 음식 식별 정확도, 남긴 비율 오차, 출처별 비율), U1 모델 비교 |
| frontend-dev | 10/27: `web/` 화면 골격(라우팅, Tailwind), 목업 스위치, `compressPhoto`, `beforePhotoStore`. 10/28: S2·S3·분석 중 화면(목업으로). 10/29: 실제 분석 모듈 연결, S4 읽기 전용 |
| firebase-engineer | 10/27: `firebase.ts`(4.2절 초기화 순서), 에뮬레이터, `signInWithGoogle`. 10/28: `meals.ts` 읽기·쓰기, 규칙 v1과 규칙 테스트. 10/29: `time.ts`(23:50 KST 테스트), `subscribePending` |
| qa-integrator | 점검표 A·B(모듈이 완성될 때마다), DB 변환 통계 대조(R10) |

완료 기준(10/29 끝): 실제 사진 두 장 → 호출 A·B → S4 결과 표시가 한 번 이어졌다. 그 결과 JSON이 v2 검증을 통과했다. 5쌍 첫 측정이 기록됐다. 이뤄지지 않았으면 리더가 6.3절 축소안을 사용자에게 제시한다.

**2단계 · 10/30(금) · 로그인·저장·결과 수정 화면·첫 배포**

| 담당 | 작업 |
| --- | --- |
| frontend-dev | S0 로그인, S4 수정 규칙 전부(2.3절), 저장 → S1(임시 목록) |
| firebase-engineer | 규칙 v2(상태 전이, 허용 필드, 범위), Firestore 영구 캐시, Hosting 첫 배포. Auth 승인 도메인과 reCAPTCHA 키 도메인에 `<id>.web.app`·`<id>.firebaseapp.com` 추가, 배포 URL 기록 |
| vision-ai-engineer | `per_100g_fill` 채우기, 자동완성 다듬기, 별칭표 v1, 프런트 연동 지원 |
| qa-integrator | 점검표 C(규칙 테스트, 사진 필드 없음, Spark 준수 grep), D(수정 규칙) |

완료 기준: 배포 URL에서 휴대폰으로 로그인 → 기록 → 수정 → 저장이 된다. Firestore에 `done` 문서가 있고 사진 필드가 없다. IndexedDB 항목이 먹은 후 분석 직후 사라진다.

**3단계 · 10/31(토)~11/1(일) · 하루 요약**

| 담당 | 작업 |
| --- | --- |
| firebase-engineer | `subscribeDay`, `summarizeDay`, 쿼리 인덱스 확인, 기록 수정용 규칙(`done → done`, `editedAt`)·규칙 테스트·`saveMeal` 수정 경로(M16), `users/{uid}.goal`과 `users/{uid}/goals/{dateKey}` 읽기·쓰기(같은 배치), 그날 목표 조회, 규칙과 규칙 테스트(4.7절) |
| frontend-dev | S1 홈 = 하루 요약(합계, 끼니별 기록 목록·끼니 합계, 날짜 이동 ◀▶, 대기 카드, 목표 비교 막대·남은 양), S7 기록 상세(삭제), S8 기록 수정(M16), S6 목표 설정, S9 주간 추이(M17). 앱 시작 시 `beforePhotoStore.cleanup`은 2단계에 이미 넣었다 |
| vision-ai-engineer | 10쌍 측정(사진이 모이면), 별칭표 보강, `goal.ts`(4.7절 공식·안전 장치·직접 조정 `applyOverride`, 단위 시험) |
| qa-integrator | 점검표 E, 점검표 C의 IndexedDB 정리 항목 |

완료 기준: 홈에 오늘 기록이 끼니별로 음식 이름·kcal과 함께 보이고, 기록을 누르면 음식별 무게·남긴 비율·kcal·탄단지·출처가 보인다. ◀▶로 지난 날짜의 기록과 요약을 볼 수 있다. 삭제는 확인 후 되고 바로 사라진다. 저장한 기록을 고치면(끼니·날짜 포함) 그 날짜 요약에 바로 반영되고 "수정됨"이 보인다(M16, 밀리면 4단계). 주간 추이의 날짜별 값이 각 날 홈 합계와 같고, 기록 없는 날은 빈칸, 목표 점선은 그날 목표와 같다. 저장·삭제 직후 새로고침 없이 반영된다. 화면 합계가 그날 `done` 문서들의 합과 같다(Firestore에서 직접 대조). 대기 상태 식사는 빠진다. 날짜를 옮겨도 다른 날 기록이 섞이지 않는다. 목표 계산이 손 계산 예시와 같고(감량 목표가 기초대사량 아래로 내려가지 않음, 만 18세 미만은 유지), 하루 요약의 남은 양이 그날 목표 − 합계와 같다. 목표를 바꾼 뒤 지난 날을 열면 그때 목표로 비교된다. 직접 조정은 하한을 어기면 저장되지 않는다.

**4단계 · 11/2(월)~11/3(화) · 정확도 개선·화면 다듬기**

| 담당 | 작업 |
| --- | --- |
| vision-ai-engineer | 프롬프트 v2(오차가 큰 유형부터. 개선 폭이 두 번 연속 2%p 미만이면 멈춘다), 먹기 전 사진 없는 경로의 오차 측정, P2 검토 |
| frontend-dev | 5절 실패 경로 UI 전부, 데모 사진(`web/public/demo/`), 사진 전송 고지(U4), 첫 로딩 2초와 DB 첫 번들 제외 확인. 여유가 있으면 P1 → P3 → P4 |
| firebase-engineer | AI Logic 사용자별 분당 한도 낮추기(5.2절), 재배포, 한도 사용량 기록 |
| qa-integrator | 점검표 A~E 다시 실행, 실패 모의(429, 403, 시간 초과, IndexedDB 불가, 오프라인, DB 로드 실패) |

완료 기준: 모든 실패 모의에서 저장까지 흐름이 끊기지 않는다. 10쌍 측정값과 출처별 비율이 기록됐다.

**5단계 · 11/4(수) · 기능 동결·문서**

| 담당 | 작업 |
| --- | --- |
| 전원 | 새 기능은 넣지 않는다. 녹화·심사 흐름에 걸린 결함만 고친다 |
| pitch-writer | README(심사위원 체험 안내 포함), 피칭 영상 대본, 녹화 시나리오, 제출 점검표(입력 `_workspace/01~04`). R1·R2 문구 반영 |
| qa-integrator | 점검표 F 녹화 전·심사위원 관점 점검(17:00 KST 전에 끝낸다, 5.2.1절), `_workspace/04_qa_report.md` |
| 리더·사용자 | 영상 녹화 시작(최종 배포본과 달라질 화면은 11/5에 다시 찍는다) |
| firebase-engineer | 동결본 배포 |

완료 기준: 열린 치명 결함이 0건이다. 녹화 경로에서 한 끼 기록이 60초 이내다. 샘플 체험이 AI 호출 0회로 재현된다. 심사위원 관점 점검(팀과 무관한 일반 Google 계정 로그인, 카메라 없는 PC에서 사진 파일 선택, 한도 소진 안내)을 통과했다. 문서가 완성됐다(URL만 빼고).

**6단계 · 11/5(목) · 최종 배포**

| 담당 | 작업 |
| --- | --- |
| firebase-engineer | 오전에 최종 배포, URL 기록. 심사 기간에는 배포본을 바꾸지 않고 하루 한 번 사용량만 기록 |
| qa-integrator | 배포본으로 점검표 F 재점검(17:00 전, 실제 AI 호출은 최소로) |
| pitch-writer | 최종 URL 반영 |
| 리더·사용자 | 17:00 전 녹화 완료 → 18:00 전 영상·URL 제출. 17:00 이후 실제 AI 호출 금지(심사위원용 한도) |

완료 기준: 18:00 전에 영상과 URL을 제출했다. 배포본에서 일반 Google 계정으로 로그인부터 하루 요약까지 한 번 통과한다. 17:00 이후 실제 AI 호출을 하지 않았다.

### 6.2 확인 시점
- 10/29 끝: "촬영 → 분석 → 결과 표시"가 이어졌는가
- 10/30 끝: "로그인 → 저장 → 배포"가 이어졌는가
- 어느 하나라도 안 됐으면 리더가 6.3절 축소안을 사용자에게 제시한다.

### 6.3 축소안 (일정이 밀리면 위에서부터 뺀다)
0. (3단계에서 가장 먼저) M16 저장한 기록 수정(S8) → 4단계로 미룬다. 기록 상세(S7)와 삭제는 남긴다
0-1. (3단계 두 번째) M17 주간 추이 → 칼로리 탭만(탄·단·지 탭 생략), 목표 점선은 남긴다
1. 1.2절 P1~P6 전부
2. (검색 단계가 꺼져 있을 때만) 검색 추천 렌더링 구현
3. 목표 비교 막대 → kcal 한 줄만(탄·단·지 막대 생략). 목표 설정 화면과 안전 장치·고지는 남긴다
4. 자동완성 → 자유 입력 + 정확 일치(4.5.4의 1~3)
5. `needs_review` 상태 저장 → 메모리 보관(앱을 닫으면 먹은 후 분석 결과를 잃는 것을 감수)

끝까지 지킬 것: 확정 결정 사항의 흐름, 계산식, 결과 수정 규칙, 오늘 합계, 직접 입력 대체 경로, 하루 요약의 끼니별 기록 목록·기록 상세(S7)·날짜 이동·기록 삭제(2026-10-26 사용자 결정으로 축소안에서 뺐다).

---

## 7. 결정 사항과 위험 (2026-10-26 사용자 확인 완료)

### 7.1 결정 (2026-10-26)

U0·U3·U5는 결정 내용으로 바꿨다. 나머지(U1·U2·U4·U6·U7·U8)는 추천안대로 확정했다.

| ID | 항목 | 결정 | 이유(한 줄) |
| --- | --- | --- | --- |
| U0 | 프로젝트 폴더 위치, Firebase 계정·프로젝트 ID·Firestore 위치 | 폴더는 `C:\Users\kkama\dev\hackathon`으로 옮긴다. Firebase 프로젝트 `meal-intake-2026`(Spark, CLI 로그인 계정), Firestore `asia-northeast3`(0단계에 생성 완료) | 사용자 결정 |
| U1 | 기본 AI 모델 | `gemini-3.5-flash-lite`로 시작하고, 10/29 5쌍 측정에서 `gemini-3.8-flash`와 비교해 확정한다(0단계에 실제 한도를 보고 다시 판단) | 3.8 Flash의 무료 일일 한도(미검증 20회)로는 개발·평가·녹화·심사 기간을 한 프로젝트 한도로 감당하지 못한다 |
| U2 | 식약처 행의 탄·지 빈 값 표시 | 호출 A 추정값(없으면 호출 D)으로 채우고 그 영양소 옆에 "AI 추정" 표시. AI도 안 되면 "–" | 하루 요약의 탄·지 합계가 비지 않으면서 출처도 숨기지 않는다 |
| U3 | 검색 그라운딩(2단계) 운용 | 결정 사항의 순서는 그대로 둔다. 0단계 스파이크에서 `gemini-2.5-flash-lite` 그라운딩도 시험해, 되면 호출 C만 그 모델로 보낸다(무료 하루 500회, 2.5 Flash와 공유). 0단계 실측에서 무료 등급 호출이 막히면 설정값으로 2단계를 바로 실패 처리해 AI 추정으로 넘긴다. 발표에서는 "DB → 검색 → AI 추정, 검색 단계는 유료 등급에서 동작"으로 설명한다 | 무료 등급에서 매번 실패할 호출이 지연과 한도만 쓴다(R1) |
| U4 | 사진 전송 고지 문구 | 첫 촬영 전 1회 + 촬영 화면 한 줄: "사진은 앱 서버에 저장하지 않아요. 분석을 위해 Google Gemini로 보내며, 무료 등급 약관에 따라 Google이 서비스 개선에 쓸 수 있어요. 얼굴이나 개인정보가 나오지 않게 찍어 주세요." | 무료 등급 약관(개선에 사용, 사람 검토, 개인정보 제출 금지)과 앱 설명을 맞춘다(R2) |
| U5 | 제출·심사 방식(시연 시각 질문을 대체) | 현장 시연은 없다. 11/5 18:00까지 피칭 영상(시연 녹화 포함)과 URL을 제출하고, 심사위원이 며칠 동안 직접 쓴다. 녹화는 11/5 17:00 전에 끝내고, 그 뒤 한도는 심사위원용으로 남긴다. 호출 절약 장치를 넣는다(5.2절) | 사용자 결정 |
| U6 | 최후 대체 경로: 미리 분석해 둔 실제 결과 재생 | 허용한다. 화면에 "미리 분석한 결과"라고 표시하고 발표에서도 밝힌다 | 녹화 중이나 심사 기간에 네트워크·한도 문제로 흐름이 끊기는 것을 막으면서 신뢰는 잃지 않는다 |
| U7 | MVP 제외 항목(1.2절 P1~P6) | 그대로 제외 | 10일 일정에서는 핵심 두 기능의 완성도가 먼저다 |
| U8 | (조건부) reCAPTCHA가 결제 수단을 요구하는 경우 | reCAPTCHA v3로 대체를 시도한다. 그것도 결제 수단을 요구하면 AI Logic의 App Check 강제를 끄고 사용자별 분당 한도를 낮춰 운영하며, URL은 심사위원에게만 알리고 심사 기간이 끝나면 내린다 | Blaze·결제 연결 금지 조건에서 녹화·심사를 가능하게 하는 유일한 경로다(R5) |

### 7.2 위험

| ID | 위험 | 근거 | 대응 |
| --- | --- | --- | --- |
| R1 | **확정 결정 2단계(검색 그라운딩)를 무료 등급에서 쓸 수 없다.** Gemini 3 이후 Flash·Flash-Lite 모델은 무료 등급 그라운딩이 "Not available"이다. 무료 그라운딩(하루 500회)이 있는 2.5 계열은 예전에 쓰던 프로젝트에만 열려 있다. 그래서 "검색 기반" 출처와 검색 추천 UI가 영상과 심사에 나오지 않을 가능성이 높다. 검색 값을 저장한 뒤 하루 요약에서 검색 추천 없이 보여 주는 것이 표시 조건에 맞는지도 확인하지 못했다(검색을 켤 때만 해당) | [S15][S18][S2][S23] | U3. 코드는 계약대로 만들어 켜면 동작하게 하고, 0단계 스파이크로 판정한다. DB 매칭을 강화해(4.5절) AI 추정 비율을 낮춘다. 발표 문구를 조정한다. `CLAUDE.md` 문구를 바꿀지는 사용자가 정한다 |
| R2 | "사진을 우리 서버에 저장하지 않는다"는 Firebase 기준으로는 맞다. 하지만 사진은 Gemini 무료 등급으로 전송되고, 약관상 Google이 제품 개선에 쓰고 사람이 검토할 수 있으며, 무료 등급의 보관 기간은 적혀 있지 않다. 단서 없이 말하면 오해를 살 수 있다 | [S23][S15] | 발표·README 문구: "사진은 우리 서버(Firebase)에 저장하지 않습니다. 분석을 위해 Google Gemini API로만 보내며, 무료 등급 약관상 Google이 서비스 개선에 사용할 수 있습니다." + U4 고지 |
| R3 | Firebase AI 모니터링을 켜면 기본으로 실제 프롬프트와 응답을 우리 프로젝트의 Cloud Logging에 저장한다. 이미지가 들어가는지는 문서에 없다. 켜는 순간 "사진 미저장"이 깨질 수 있다 | [S9] | 켜지 않는다. 이미 켜져 있으면 `_Default` 싱크에 제외 필터 `resource.type="firebasevertexai.googleapis.com/Model"`을 추가한다. firebase-engineer가 0단계에 확인하고 기록한다 |
| R4 | 무료 등급 수치(RPM·RPD)가 공식 문서에 없다(AI Studio에서만 보인다). 게다가 개발·QA·녹화·심사위원 접속이 프로젝트 하나의 한도를 나눠 쓴다 | [S16][S17][X1] | 0단계에 실제 값을 기록한다. 개발은 목업이 기본이다. 평가 횟수를 계획하고, 사용자별 분당 한도를 낮추고, 녹화·심사 기간 예산을 잡는다(5.2절) |
| R5 | AI Logic 설정 과정이 App Check를 자동으로 강제한다(2026년 7월부터). 웹 제공자 reCAPTCHA Enterprise는 Firebase 문서상 월 1만 건 무료인데, Google Cloud reCAPTCHA 문서는 무료 등급에도 결제 수단이 필요하다고 적어 두 문서가 충돌한다 | [S1][S11][S13][S14] | 0단계에 결제 수단 없이 키를 만들 수 있는지 직접 확인한다. 요구하면 결제를 연결하지 않고 U8로 간다 |
| R6 | 식약처 DB 품질: 100ml 기준 행, 탄·지 빈 값, 같은 이름 중복. 잘못 고르면 "DB" 출처를 단 채 틀린 값이 나간다 | [L] | 4.5절 규칙, 변환 통계 대조(qa-integrator) |
| R7 | 국·찌개를 건더기와 국물로 나누면 완성 음식 기준인 DB와 맞지 않아 AI 추정으로 간다. 국물 음식은 AI 추정 비율이 높아진다 | 스킬 판단 기준, DB 형식 | 평가에서 출처별 비율과 국물 음식 오차를 따로 측정하고, 4단계에 프롬프트 조정 여부를 정한다(vision-ai-engineer) |
| R8 | 후보 모델 중 3.8·3.6 Flash는 "Stable (short-term)"이라 종료일이 미정이다. 3.5 Flash-Lite는 2027-07-21 전에는 종료하지 않는다 | [S4] | 기본은 3.5 Flash-Lite. 모델 ID는 설정값 하나만 바꾸면 된다 |
| R9 | 약관상 API 사용자는 18세 이상이어야 하고, EEA·스위스·영국 사용자에게는 유료 서비스만 제공할 수 있다 | [S23] | 국내 심사에는 영향이 없다. 팀원 나이만 확인한다 |
| R10 | 식약처 원본이 3MB가 넘는 한 줄 JSON이라 architect가 레코드를 직접 대조하지 못했다(리더 통계 [L]를 썼다) | - | 변환 스크립트가 같은 통계를 출력하고 qa-integrator가 대조한다 |

### 7.3 필요할 때 확인 (해당 작업을 할 때만)
사용자 요청으로 0단계의 추가 조사는 여기서 멈췄다. 아래는 그 작업을 할 때 확인한다.

| 항목 | 언제 | 누가 |
| --- | --- | --- |
| `gemini-2.5-flash-lite` 접근 가능 여부와 무료 그라운딩, 그라운딩과 응답 스키마 동시 사용 | 0단계 스파이크 | vision-ai-engineer |
| 모델별 실제 무료 한도(분당·일일 요청 수) | 0단계(AI Studio) | firebase-engineer |
| reCAPTCHA 키 생성에 결제 수단이 필요한지 | 0단계 App Check 설정 | firebase-engineer |
| 검색 그라운딩으로 얻은 값을 Firestore에 저장하고, 나중에 검색 추천 없이 보여 줘도 되는지(그라운딩 약관의 저장 예외 조건) | 검색 단계를 켜기로 판정한 경우에만 | vision-ai-engineer |
| OAuth 동의 화면 게시 상태(팀과 무관한 일반 계정 로그인 가능 여부) | 2단계 첫 배포 전 | firebase-engineer |
| AI Logic 사용자별 분당 요청 한도 설정 위치 | 4단계 | firebase-engineer |
| Gemini 무료 등급의 데이터 보관 기간 | 확인 보류. 발표·고지 문구는 R2·U4처럼 보수적으로 둔다 | - |

---

## 부록 A. 공식 문서 확인 결과 (2026-10-26)

확인 방법: 아래 문서를 2026-10-26에 웹으로 읽었다. 도구가 요약해 준 원문 요지라 표현이 원문과 조금 다를 수 있다. 결론을 좌우하는 문장(무료 등급 그라운딩, 2.5 제한, AI 모니터링, App Check 자동 강제)은 질문을 바꿔 두 번 이상 확인했다.

### A.1 확인 항목 1: Spark에서 AI Logic + Gemini Developer API, 웹 SDK, App Check
- 확인함
  - Gemini Developer API 무료 등급은 결제 수단 없이 쓸 수 있고, 결제 계정을 연결하지 않으면 프로젝트는 Spark에 남는다 [S2].
  - Flash 계열은 "Gemini Developer API를 쓰면 Blaze가 필요 없다" [S4]. Vertex AI(지금 이름은 Agent Platform Gemini API)는 결제가 필요하다 [S1].
  - 웹 SDK: `npm install firebase`, `import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai"`, `getAI(app, { backend: new GoogleAIBackend() })` [S1]. 문서 코드에는 Gemini 키가 없고 Firebase 설정 객체만 쓴다 [S1].
  - App Check: 웹 운영 제공자는 reCAPTCHA Enterprise다 [S3]. `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(KEY), isTokenAutoRefreshEnabled: true })`, 점수 기반 키, localhost를 키 도메인에 넣지 말 것 [S11]. 개발할 때는 `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`로 토큰을 받아 콘솔(App Check → Apps → Manage debug tokens)에 등록한다 [S3]. 강제 설정은 콘솔 Security → App Check → APIs → Firebase AI Logic에서 한다 [S3].
  - 2026년 7월 초부터 AI Logic 설정 과정이 App Check를 자동으로 강제하므로, 로컬 개발에는 디버그 제공자가 필요하다 [S1].
  - reCAPTCHA Enterprise는 월 1만 건까지 무료 [S13]. Spark 프로젝트는 점수 단계 11개 중 4개만 쓸 수 있다 [S11]. reCAPTCHA v3도 쓸 수 있지만 새로 붙인다면 Enterprise를 쓰라고 권한다 [S12].
- 확인 못 함 / 문서 충돌
  - reCAPTCHA 무료 등급에 결제 수단이 필요한지: Google Cloud 문서 [S14]는 필요하다고 하고, Firebase 문서는 Spark에서 쓰는 것을 전제로 설명한다. 0단계에 직접 확인한다.
  - App Check 초기화와 `getAI` 사이의 순서는 문서에 없다.

### A.2 확인 항목 2: 추천 모델과 무료 한도
- 확인함
  - 새 프로젝트에는 "3.5 Flash-Lite 또는 3.8 Flash"를 권하고, 2.5 계열은 예전에 쓰던 사용자에게만 연다 [S18][S2].
  - 두 모델 모두 입력으로 텍스트·이미지·영상·오디오·PDF를 받고, 구조화 출력과 검색 그라운딩 기능을 지원한다 [S19][S20]. 무료 등급에서 입출력이 무료다 [S15].
  - 3.5 Flash-Lite는 Stable이고 2027-07-21 전에는 종료하지 않는다. 3.8 Flash는 Stable(short-term)이고 종료일이 미정이다 [S4].
  - 한도는 프로젝트 단위로 적용되고, 일일 한도는 태평양 시간 자정에 초기화되며, 수치는 AI Studio에서 확인하게 되어 있다 [S16][S17]. AI Logic 자체 한도는 기본 사용자별 분당 100회다 [S8].
- 확인 못 함
  - 무료 등급 RPM·RPD 수치. 공식 문서에 표가 없다. 제3자 [X1](AI Studio를 인용)은 3.8 Flash 분당 5회·하루 20회, 3.5 Flash-Lite 분당 10회·하루 500회라고 한다. 다른 제3자 [X2]는 분당 10회·하루 1,500회 등으로 서로 다르다.
- 끼니 수 환산(가정 [X1], 프로젝트 전체 합산): 한 끼에 최소 2회(A+B), 재시도와 호출 D를 넣으면 약 2.5회 든다.
  - 3.5 Flash-Lite: 하루 200~250끼
  - 3.8 Flash: 하루 8~10끼
  - 그라운딩은 무료 등급에서 쓸 수 없어 별도 한도를 계산하지 않았다. 2.5 계열의 무료 그라운딩 하루 500회는 새 프로젝트에는 해당하지 않는다.

### A.3 확인 항목 3: Google 검색 그라운딩
- 켜는 법: `getGenerativeModel(ai, { model, tools: [{ googleSearch: {} }] })`. 응답의 `response.candidates[0].groundingMetadata`에 `searchEntryPoint.renderedContent`(HTML·CSS, 라이트·다크 모드 자동 대응), `groundingChunks`, `groundingSupports`가 온다 [S5].
- 표시·저장 조건
  - 검색 추천과 출처를 반드시 표시해야 한다 [S5].
  - 그라운딩 결과는 프롬프트를 보낸 사용자에게 검색 추천과 함께 보여 줘야 한다 [S23].
  - 서면 허락 없이 결과나 검색 추천을 수정하거나 다른 내용을 끼워 넣으면 안 된다 [S23].
  - 링크와 목적지 사이에 중간 화면을 두거나 리디렉션하면 안 된다 [S23].
  - 결과를 캐시하거나 학습·분석에 쓰면 안 된다. 저장은 제한된 경우에만 허용된다 [S23].
  - Google은 그라운딩 프롬프트·맥락·출력을 30일 동안 보관한다 [S23].
- 무료 등급
  - Gemini 3 이후 모든 Flash·Flash-Lite에서 "Not available"이다. 일부는 AI Studio에서 시험만 해 볼 수 있다 [S15].
  - 유료 등급은 월 5,000회까지 무료이고 그 뒤 1,000회당 14달러다 [S15]. Gemini 3 이후는 모델이 실행한 검색 쿼리마다 과금한다 [S22].
- 응답 스키마와 함께 쓸 수 있는지: Gemini API 문서는 "Gemini 3 계열에서 구조화 출력과 Google 검색 같은 내장 도구를 함께 쓸 수 있다(미리보기)"고 하지만, 다른 API 형식(`response_format`)으로 설명한다 [S21]. Firebase AI Logic 문서(구조화 출력, 그라운딩)에는 함께 쓰는 설명이 없어 [S5][S6] 확인하지 못했다. 그래서 이 스펙은 호출 C를 텍스트 응답 + JSON 추출로 둔다.

### A.4 확인 항목 4: 무료 등급 데이터 약관
- 무료 서비스(Unpaid Services)
  - Google은 제출된 콘텐츠(이미지 등 파일 포함)와 생성된 응답을 제품·서비스·ML 기술을 제공하고 개선하고 개발하는 데 쓴다 [S23].
  - 사람 검토자가 API 입력과 출력을 읽고 주석을 달 수 있다. 검토 전에 계정·키·프로젝트 정보와는 분리한다 [S23].
  - 약관은 "민감하거나 기밀이거나 개인적인 정보를 무료 서비스에 보내지 말라"고 한다 [S23].
  - 가격표의 "제품 개선에 사용" 항목은 무료 "예", 유료 "아니요"다 [S15].
  - 무료 등급의 보관 기간은 적혀 있지 않다 [S23]. AI Logic 데이터 거버넌스 문서는 무료 플랜이면 이 약관을 보라고만 한다 [S10].
- 그 밖: API 사용자는 18세 이상이어야 하고, EEA·스위스·영국 사용자에게는 유료 서비스만 제공할 수 있다 [S23]. 약관은 2026-03-23 시행, 2026-04-28 갱신.
- 결론: "사진을 우리 서버에 저장하지 않는다"는 표현에는 단서가 필요하다(7.2절 R2).

### A.5 출처

| 번호 | 문서 | URL | 표시된 갱신일 |
| --- | --- | --- | --- |
| S1 | Firebase AI Logic 시작하기(웹) | https://firebase.google.com/docs/ai-logic/get-started?platform=web | 2026-10-23 |
| S2 | Firebase AI Logic 가격 | https://firebase.google.com/docs/ai-logic/pricing | 2026-10-20 |
| S3 | Firebase AI Logic App Check | https://firebase.google.com/docs/ai-logic/app-check | 2026-10-20 |
| S4 | Firebase AI Logic 지원 모델 | https://firebase.google.com/docs/ai-logic/models | 2026-10-20 |
| S5 | Firebase AI Logic Google 검색 그라운딩 | https://firebase.google.com/docs/ai-logic/grounding-google-search | 2026-10-20 |
| S6 | Firebase AI Logic 구조화 출력(웹) | https://firebase.google.com/docs/ai-logic/generate-structured-output?platform=web | 2026-10-20 |
| S7 | Firebase AI Logic 이미지 분석(웹) | https://firebase.google.com/docs/ai-logic/analyze-images?platform=web | 2026-10-20 |
| S8 | Firebase AI Logic 할당량 | https://firebase.google.com/docs/ai-logic/quotas | 2026-10-20 |
| S9 | Firebase AI Logic AI 모니터링 | https://firebase.google.com/docs/ai-logic/monitoring | 2026-10-20 |
| S10 | Firebase AI Logic 데이터 거버넌스 | https://firebase.google.com/docs/ai-logic/data-governance | 2026-10-20 |
| S11 | App Check reCAPTCHA Enterprise(웹) | https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider | 2026-10-21 |
| S12 | App Check reCAPTCHA v3(웹) | https://firebase.google.com/docs/app-check/web/recaptcha-provider | 2026-10-21 |
| S13 | App Check 개요 | https://firebase.google.com/docs/app-check | 2026-10-20 |
| S14 | reCAPTCHA 등급 비교 | https://docs.cloud.google.com/recaptcha/docs/compare-tiers | 2026-10-23 |
| S15 | Gemini API 가격 | https://ai.google.dev/gemini-api/docs/pricing | 2026-10-22 |
| S16 | Gemini API 비율 제한 | https://ai.google.dev/gemini-api/docs/rate-limits | 2026-10-15 |
| S17 | AI Studio 비율 제한 안내 | https://aistudio.google.com/docs/rate-limits | 표시 없음 |
| S18 | Gemini API 모델 목록 | https://ai.google.dev/gemini-api/docs/models | 2026-10-22 |
| S19 | Gemini 3.5 Flash-Lite | https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite | 2026-10-22 |
| S20 | Gemini 3.8 Flash | https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash | 2026-10-22 |
| S21 | Gemini API 구조화 출력 | https://ai.google.dev/gemini-api/docs/structured-output | 2026-10-21 |
| S22 | Gemini API Google 검색 그라운딩 | https://ai.google.dev/gemini-api/docs/google-search | 2026-10-13 |
| S23 | Gemini API 추가 서비스 약관 | https://ai.google.dev/gemini-api/terms | 시행 2026-03-23, 갱신 2026-04-28 |
| S24 | Firebase Hosting 개요(gzip·Brotli 전송) | https://firebase.google.com/docs/hosting | - |
| X1 | (제3자, 미검증) ScriptByAI 무료 등급 표, AI Studio 인용 | https://www.scriptbyai.com/gemini-api-free-tier-limits/ | 표시 없음 |
| X2 | (제3자, 미검증) 무료 등급 정리, 커뮤니티 집계 | https://klymentiev.com/blog/gemini-api-free-tier | 2026-10 |

---

## 변경 기록

| 날짜 | 변경 내용 | 절 | 영향을 받는 에이전트 |
| --- | --- | --- | --- |
| 2026-10-26 | 초안 작성(0단계). 리더 요청에 따라 식약처 DB 처리 규칙(100ml 행, 탄·지 빈 값, 같은 이름 중복, 이름 매칭, 앱 JSON 필드·크기)을 반영하고 analysis-schema v2(선택 필드 `per_100g_fill`·`db_name`·`db_match`)를 제안. 공식 문서 확인 결과(그라운딩 무료 등급 미제공, App Check 자동 강제, AI 모니터링 프롬프트 저장, 무료 등급 데이터 약관)를 7.2절 위험과 부록 A에 기록 | 전체 | vision-ai-engineer, frontend-dev, firebase-engineer, qa-integrator, pitch-writer |
| 2026-10-27 | (리더, 사용자 결정) 호출 A·B 시도당 제한 20초 → 40초, 시간 초과는 재시도하지 않음(네트워크·5xx·분당 429·형식 오류만 재시도). S8에서 브라우저 뒤로 가기도 S7로(상세에서 push로 들어와 나갈 때 한 칸 뒤로, 주소로 바로 열었으면 replace) | 2.2, 4.2, 5.1 | vision-ai-engineer, frontend-dev, qa-integrator |
| 2026-10-26 | (리더, 사용자 결정) 공개 중량 4.5.5절: 업체 제공 식품중량(100g·100ml 제외)을 DB JSON `w`로 넣고, 통째로 보인 메뉴(`whole_count`)가 세부 종류까지 일치하면 먹기 전 무게 = 공개 중량 × 개수, `grams_source` 표시. 프롬프트 a3. 홈 날짜 이동 문구 ◀ 전날 / 다음 날 ▶, 오늘이 아니면 [오늘로] | 2.2, 3.3, 3.5, 4.3, 4.5.5 | vision-ai-engineer, frontend-dev, qa-integrator |
| 2026-10-26 | (리더, 사용자 결정) 3단계 조각을 사용자 순서로 확정(1 홈 기록 보기 → 2 목표 설정 → 3 목표 대비 비교 → 4 주간 추이 → 5 배포). 주간 추이 M17·S9 `/week` 추가, 1.3절 "주간 통계 안 만듦"을 월간으로 좁힘, 프리미엄 기능(음식 추천·월간 그래프·리포트)은 3단계 뒤 따로. 축소안 0-1 | 1.1, 1.3, 2.2, 4.7, 6.1, 6.3 | firebase-engineer, frontend-dev, qa-integrator, pitch-writer |
| 2026-10-26 | (리더, 사용자 결정) 저장한 기록 수정 M16: S8 `/meal/:mealId/edit`(결과 수정 규칙 그대로 + 끼니·날짜(오늘과 지난 날짜만)), 전이 `done → done`, 필드 `editedAt`, P5를 MVP로 옮김. 3단계에서 기록 보기·상세 바로 다음 순서, 밀리면 가장 먼저 4단계로 | 1.1, 1.2, 2.1, 2.2, 3.2, 4.3, 6.1, 6.3 | firebase-engineer, frontend-dev, qa-integrator |
| 2026-10-26 | (리더, 사용자 결정) 하루 요약 필수 항목: 끼니별 기록 목록(음식 이름·kcal), 기록 상세 S7 `/meal/:mealId`(읽기 전용, 삭제), 날짜 이동 ◀▶, 삭제 확인. 축소안에서 "끼니별 합계 → 목록만"·"날짜 이동 → 오늘만"을 빼고 끝까지 지킬 것에 넣음 | 1.1, 2.2, 6.1, 6.3 | frontend-dev, firebase-engineer, qa-integrator |
| 2026-10-26 | (리더, 사용자 결정) 4.7절에 언제든 수정·즉시 재계산·추천값 직접 조정(`GoalOverride`, `applyOverride`, kcal 하한), 날짜별 목표 기록 `users/{uid}/goals/{dateKey}`(지난 날은 그때 목표로 비교) 추가 | 2.2, 3.1, 4.7, 6.1 | vision-ai-engineer, firebase-engineer, frontend-dev, qa-integrator |
| 2026-10-26 | (리더, 사용자 결정) 3단계에 목표 설정 추가: M14·M15, S6, `users/{uid}.goal`, 4.7절(Mifflin-St Jeor, 안전 장치, 고지), 3단계 작업·완료 기준, 축소안 3. P6은 MVP로 옮김. 음식 추천·주간/월간 리포트는 프리미엄 계획(발표에서만) | 1, 2.2, 3.1, 4.7, 6.1, 6.3 | vision-ai-engineer, firebase-engineer, frontend-dev, qa-integrator, pitch-writer |
| 2026-10-26 | (리더, 사용자 결정) 4.5.3 (a): 고형 음식의 100ml 전용 행도 1g/ml로 환산해 넣고 출처를 "DB(환산)"으로 구분. 3.3절에 `db_ml_converted`, 4.3절 `NutritionResult`에 `ml_converted` 추가 | 3.3, 4.3, 4.5.3 | vision-ai-engineer, frontend-dev, qa-integrator |
| 2026-10-26 | 사용자 결정 반영(U0~U8, U5는 제출·심사 방식으로 대체): 샘플 체험 M12, 호출 절약 M13, 5.2절을 녹화·심사 기간 기준으로 다시 쓰고 5.2.2 호출 절약 장치 추가, F15 녹화 기준, 0·5·6단계 일정, 7.3 필요할 때 확인 목록. 사용자 요청으로 추가 조사를 멈추고, architect가 1절을 반영한 뒤 리더가 나머지를 마무리 | 1, 5, 6, 7 | 전원 |
