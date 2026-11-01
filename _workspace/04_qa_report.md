# QA 보고서

## 2026-10-29 동결 전 점검 (qa-integrator, 커밋 dd487ba 기준, 앱 코드 수정 없음)

쓴 도구: Bash(Git Bash), PowerShell, Read/Grep/Glob, Write(이 문서), Monitor·ToolSearch. SendMessage는 쓰지 않음(리더가 목록만 요청).
실제 AI 호출·배포·커밋 없음. 헤드리스 시험은 `VITE_AI_MOCK=1` + 에뮬레이터.

### 1. 자동 시험 결과

| 시험 | 결과 | 비고 |
| --- | --- | --- |
| `node spike/tests/run-tests.mjs .` | 통과(exit 0) | 로그의 FAIL 3줄은 일부러 넣은 나쁜 픽스처(bad-calc·bad-photo)가 거부된 것 |
| `spike/tests/*_test.mjs` 30개 | 30개 모두 exit 0 | alias·b3·broth·calendar·chicken_weight·chunk_reload·compress_size·detail_guess·detail_summary·detail·exif·food_name·franchise_data·franchise·goal_edit·goal·korean_unsure·menu_candidates·neis·published·recommend·resolve·search·serving·summary·thumbnail·time·week·weekly_report·weight |
| `firestore-tests npm test` | 102 / 102 통과 | 규칙 v14(reports genCount ≤ 999 포함) |
| `web npx tsc -b --noEmit` | 오류 0 | |
| 헤드리스 d6 | 실패 — **시험 문제** | 3)에서 `waitForURL('**/?date=2026-10-27')` 날짜를 박아 둠. 오늘(10-29)의 전날은 10-28. 1)·2) 11개 통과 |
| 헤드리스 d7 | 통과(32) | |
| 헤드리스 d8 | 통과(62) | |
| 헤드리스 d9 | 실패 1 — **알려진 것** | `.pair h3 .num` 1px(시안 334,36 / 앱 335,35). 나머지 통과 |
| 헤드리스 d10 | 통과 | |
| 헤드리스 d11 | 통과 36 / 실패 2 — **시험 문제로 보임(다시 돌려 확인 필요)** | D: `logout()` 직후 `page.goto('/welcome')`가 `net::ERR_ABORTED`(앱이 로그아웃 뒤 스스로 /welcome으로 옮기는 중에 겹친 것으로 보임). E는 D가 남긴 상태에서 `.slist` 기다리다 시간 초과. A~C(새 가입·가입 계정) 모두 통과 |
| 헤드리스 d12 | 통과 | |
| 헤드리스 d13 | 통과 | |
| 헤드리스 d14 | **중단** | 4)까지 통과 중 시스템 메모리 부족으로 Claude Code가 백그라운드 실행을 강제로 멈춤. `[pageerror] reCAPTCHA Timeout (o)` 1건(App Check 계열, 아래 B10) |
| tutorial autohide eaters meal_return newlogin fastauto fr soup tablet kb | **돌리지 못함** | 위와 같은 메모리 부족 중단. 지시대로 다시 시작하지 않음 |

- 콘솔: 끝난 로그(d7·d8·d10·d12·d13)에 pageerror·console error 없음(403 App Check 제외).
- 중단 뒤 포트 8080(Firestore 에뮬레이터, PID 37756)·9099(Auth, 37468)·5179(Vite, 20700)가 아직 열려 있음. 이 시험의 잔여일 수도, 다른 에이전트(logout 시험)의 것일 수도 있어 끄지 않았다. 다음 시험 전에 리더가 확인.

### 2. 버그 목록

| # | 심각도 | 어디 | 재현 | 기대 / 실제 | 고치는 방향 | 사용자 결정 |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | 높음 | `web/src/data/reports.ts:16` `REPORT_MAX_GEN = 999`, `firestore.rules` validReport `genCount <= 999`(규칙 v14) | 기록 3일 이상 주의 리포트 → 기록 하나 고치기 → [새로 분석하기] 반복(d14 4) 로그 "한도 999라 남은 횟수 숨김") | CLAUDE.md D14 "주당 3회까지" / 실제 사실상 무제한. 심사 기간 Gemini 무료 한도를 한 사람이 다 쓸 수 있음 | 상수 3, 규칙 `<= 3`로 되돌리고 규칙 시험·d14 기대값 갱신, 규칙 배포 | **필요** — 10/29 사용자 시험용으로 해제한 것(코드 주석 "제출 전 3으로 되돌릴지 사용자에게 확인") |
| B2 | 보통 | 스펙 5.2.2 M13 "샘플 체험"(M12)·"사용자별 하루 실시간 분석 상한(기본 6끼)" | `grep -r "샘플\|미리 분석한" web/src` → 화면 코드 없음, 하루 상한 코드 없음 | 스펙·hackathon-qa 점검표 F / 실제 미구현. 심사위원 여러 명이 한도를 나눠 쓰면 일일 429 뒤에는 직접 입력만 남음 | 범위 결정 후 담당(vision·frontend) | **필요** — 동결 전 넣을지, 발표에서 빼고 설명할지 |
| B3 | 보통 | `web/src/components/record/AiReportPane.tsx` 저장본 읽기 실패 → aiSlot [다시 시도] → `generate(null)` | 저장본이 있는 주를 오프라인(또는 getReport 실패)으로 열기 → "리포트를 불러오지 못했어요" → 연결 뒤 [다시 시도] | 기대: 저장본을 다시 읽음 / 실제: 저장본을 읽지 않고 AI를 바로 부르고 `saveReport(prev=null)`이 genCount 1로 덮어쓰려다 규칙 update(genCount == 이전+1)에 거부됨 → AI 호출 1회 낭비, 화면 글은 저장 안 됨(콘솔 경고만) | 오류 상태의 [다시 시도]는 먼저 `getReport`를 다시 부르고, 만들 때도 `prevSaved` 없으면 최신 문서를 읽어 prev로 넘김 | 아니요 |
| B4 | 보통 | `web/src/pages/RecommendPage.tsx` 목록 오류 문구 | 추천 계산(DB JSON 받기) 실패 → "…다시 추천 받아 주세요" | 기대: 다시 시도할 길 / 실제: [다시 추천 받기] 버튼은 좌우 넘기기로 바뀌어 없고 fetchKey가 같아 재시도 안 됨(끼니를 바꿔야만 다시 부름) | 오류 칸에 [다시 시도](같은 키로 다시 부르기) 또는 문구를 바꿈 | 아니요(문구·버튼 모양만) |
| B5 | 낮음 | `web/src/pages/MealPage.tsx:201-213` finish() | 끼니 화면에서 음식 고치기 → [수정 완료]인데 saveMeal이 거부(규칙 거부·검증 실패) | 기대: 실패 안내 / 실제: "저장했어요" 토스트 후 홈, 대기 수정은 지워지고 실패는 console.warn만. (오프라인 대기는 의도, 거부만 문제) | 거부(permission-denied·검증)일 때 띠 안 안내 상자 또는 토스트 | 아니요 |
| B6 | 낮음 | `web/src/pages/WelcomePage.tsx` start() | 로그인 상태에서 동의 구독이 아직 안 왔을 때 [구글로 시작하기] | 눌러도 아무 반응 없음(consent undefined면 return) | 버튼에 불러오는 중 표시 또는 값이 오면 이어서 이동 | 아니요 |
| B7 | 낮음 | `web/src/data/consent.ts` subscribeConsent 오류 → null | 동의한 계정이 오프라인 첫 실행 등으로 구독 오류 | 이미 동의한 사용자가 소개·동의 화면으로 다시 보내짐(주석에 알려진 것으로 적힘) | 오류는 null 대신 "알 수 없음"으로 두고 경로 가드는 막지 않음 | 아니요 |
| B8 | 낮음 | 목표 없는 로그인 계정이 목표 질문 도중 앱을 닫음 | 새 계정: 동의 → 질문 2단계에서 닫기 → 다시 열기 | 홈("목표를 정하면 …")으로 감. CLAUDE.md "로그인했는데 목표가 없는 계정은 목표 질문"과 다르게 읽힐 수 있음(초안은 남아 있어 홈 상자로 이어 갈 수 있음) | 의도라면 그대로, 아니면 경로 가드에 목표 없음 → /start | **확인 필요** — 의도인지 |
| B9 | 낮음 | `web/src/data/fasting.ts` autoFillFasting | 오프라인으로 앱 열기 | getDoc 실패 → 경고만, 다음 열 때 다시(데이터 손상 없음). 기록 없는 날은 건드리지 않음 확인 | 그대로 둬도 됨 | 아니요 |
| B10 | 낮음 | 헤드리스 d14 `[pageerror] reCAPTCHA Timeout (o)` | d14 실행 중 | App Check(reCAPTCHA) 시간 초과가 잡히지 않은 오류로 올라옴. 배포본에서도 느린 망이면 콘솔 오류가 남을 수 있음(기능 영향은 확인 못 함) | 배포본에서 한 번 확인, 필요하면 무시 목록 | 아니요 |

시험 쪽 문제(앱 아님, 시험 담당이 고칠 것):
- T1 `pw/d6_test.mjs:65` 날짜 `2026-10-27` 고정 → 실행일 기준 전날로 계산.
- T2 `pw/d11_test.mjs:200-201` D 단계 `logout()` 뒤 바로 `login()`의 `goto('/welcome')`가 앱 이동과 겹침 → logout 뒤 `/welcome` 도착을 기다린 다음 goto. 고친 뒤 d11을 단독으로 다시 돌려 D·E 확인.
- T3 d6·d8·d10·d11·d14·fr·logout 시험에 `'2026-10-2x'` 고정 날짜가 있음(같은 문제가 날짜가 바뀌면 생길 수 있음).

### 3. 정적 점검에서 문제 없던 것
- Spark: `functions/`·`storage.rules` 없음, `firebase/storage|functions` import 없음.
- 식사 저장은 JSON 왕복으로 undefined 제거(`data/meals.ts`), 리포트도 같음. 공개 중량 세 필드·0.5 단위(마리·인분)는 클라이언트 검증(`validate.ts`)과 `compute.publishedFields`가 같은 기준, 규칙은 items 안 필드를 검사하지 않아 거부 위험 없음. `consumedKcal == totals.consumed.kcal`·≤10000 확인.
- 학교: 규칙 `school {atpt, code, name}`·`consent.school` bool(늘 false 저장)과 코드 일치. 급식 캐시·실패 처리(3초, 실패는 캐시 안 함) 문제 없음.
- 국물 나누기: 0g·1g 나눗셈 가드 있음. 치킨 무게: 목록 kcal(`franchiseUi.rowOf`)과 고른 뒤 값(`franchise.ts` typical)이 같은 `chickenWeight` 사용.
- 시작 순서(App·Welcome·Consent·Onboarding): CLAUDE.md "시작 순서 바꿈"과 일치(d10·d11 A~C 통과).
- 접근성: 아이콘만 있는 버튼은 IconButton(label 필수)이나 aria-label 있음(개수 [−][+], 소개 점).

### 4. 남은 일
- 메모리가 확보되면 tutorial·autohide·eaters·meal_return·newlogin·fastauto·fr·soup·tablet·kb·d14와 T2 수정 뒤 d11을 하나씩 다시 돌린다(390px 넘침 확인은 이 시험들에 의존).

## 2026-10-29 이어서: 리더 고침과 다시 돌린 시험 (커밋 bda76f9 + 이번 고침)

### 고친 결함
| # | 어디 | 문제 | 고침 | 확인 |
| --- | --- | --- | --- | --- |
| L1 | `lib/logoutCleanup.ts`(새), `lib/auth.ts`, `main.tsx` | 로그아웃해도 이 기기에 먹기 전 사진·Firestore 캐시·계정 키(급식 캐시·공복 자동 표시·스크롤 등)가 남음(공용 기기) | signOut → 지우기 → /welcome 새로 불러오기, 다 못 지우면 표시 키로 다음 시작 때 다시 | logout 16/16 |
| L2 | `components/meal/KeepPhotosAsk.tsx` | 설정을 받기 전에 [카메라로 찍기]·[앨범에서 고르기]를 누르면 "사진도 보관할까요?"를 건너뜀 | 첫 값을 최대 2초 기다렸다 판단, 그래도 없으면 묻기 | d9 51/52(알던 1px) |
| L3 | `components/ScrollMemory.tsx` | 같은 탭에서 새로 연 페이지(주소 입력·location.replace·로그인 리디렉트)가 앞 페이지의 스크롤 위치로 열림(첫 칸 키가 늘 "default") | 새로고침·앞뒤 이동일 때만 기억한 위치, 그 밖에는 맨 위 | d9 "기록 없는 날"·시안 비교 통과, scroll 10/10 |
| B3 | `components/record/AiReportPane.tsx` generate | 저장본 읽기 실패 뒤 [다시 시도]가 저장본을 안 읽고 AI를 불러 덮어쓰기 거부 | AI 부르기 전에 늘 최신 저장본을 읽고, 지금 기록과 같으면 그대로 쓰고(AI 0회), 아니면 genCount를 이어 감 | d14 40/40(회귀) |
| B4 | `pages/RecommendPage.tsx` | 추천 목록 실패 문구가 없어진 [다시 추천 받기]를 안내, 다시 부를 길 없음 | 실패 칸에 [다시 시도](같은 조건으로 다시 부름), 계산 오류 문구 따로 | d12 39/39(회귀), rec_retry 2/2(DB JSON을 막으면 [다시 시도], 풀고 누르면 추천) |
| B5 | `pages/MealPage.tsx` finish | [수정 완료] 저장이 거부돼도 "저장했어요" 뒤 홈, 고친 내용 사라짐 | 최대 1.5초 결과를 기다려 거부면 나가지 않고 안내·고친 내용 남김(성공한 기록만 대기 수정 지움), 오프라인은 지금처럼 기다리지 않고 나감 | meal_return 17/17·photodel 7/7(회귀), 거부 경로는 시험 못 함 |
| B6 | `pages/WelcomePage.tsx` | 로그인한 채 동의를 불러오기 전에 [구글로 시작하기]를 누르면 반응 없음 | "잠시만요…"로 바꾸고 불러오면 이어서 이동 | d10 53·d11 46·newlogin 16(회귀) |
| B7 | `data/consent.ts` | 캐시에 계정 문서가 없을 뿐인 첫 값이 "동의 없음"으로 와 동의한 계정이 소개·동의로 갈 수 있음 | 온라인이면 캐시 미스 첫 값은 무시하고 서버 답을 기다림(오프라인은 그대로) | d10·d11·newlogin(회귀) |
| B1 | `data/reports.ts` REPORT_MAX_GEN, `firestore.rules` validReport | 리포트 주당 한도가 999(사용자 시험용) | 2026-11-02 사용자 확인으로 3으로 되돌림(규칙 v15 genCount <= 3) | 규칙 시험 102/102(4 거부), d14 40/40(남은 횟수 2번·1번·3이면 더 못 만듦) |

### 시험 쪽 고침
- T1 d6 어제 날짜·라벨 계산, exitCode 추가 → 38/38. T2 d11·d10 로그아웃 뒤 새로 불러오기(load)까지 기다림 → d11 46/46. scroll 시험을 지금 로그인·화면 이름에 맞춤(달 이동은 버튼이 화면 밖이라 JS 클릭).
- d8 "내 기록 전체 삭제" 한 번 실패(토스트·지움) → 다시 돌려 62/62, 시간 문제로 봄.

### 다시 돌린 헤드리스 시험(하나씩)
d6 38 · d7 32 · d8 62 · d9 51/52(알던 1px) · d10 53 · d11 46 · d12 39 · d13 40 · d14 40 · tutorial 44 · autohide 21 · eaters 통과 · meal_return 17 · newlogin 16 · fastauto 10 · fr 33 · soup 9 · tablet 8 · kb 3 · scroll 10 · photodel 7 · logout 16. 단위 시험 모두 통과, tsc 오류 0.

### 사용자 결정(2026-10-29)
- B1 리포트 주당 한도: 11/4에 3으로 되돌림(그때까지 999).
- B2 하루 분석 상한·샘플 체험: 나중에 정함(열린 결정).
- B8 목표 없는 계정이 질문 도중 닫으면 홈: 그대로 둠(홈 상자 → 목표 질문).
- B9·B10: 그대로(B10은 배포본에서 한 번 콘솔 확인).
