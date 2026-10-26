# 인계 메모 — 0단계 완료 (2026-10-26)

> **상태: 0단계 완료(2026-10-26).** 다음은 1단계(10/27~10/29). 아래 "0단계 완료 정리"부터 읽는다. 그 아래 절들은 진행 기록이다.

이 프로젝트는 `C:\Users\kkama\$HOME\Desktop\hackathon`(폴더 이름에 `$HOME`이 글자 그대로 들어간 잘못된 위치)에서 `C:\Users\kkama\dev\hackathon`으로 복사해 옮겼다(사용자 결정).
새 세션은 이 메모 → `CLAUDE.md` → `_workspace/01_architect_spec.md` 순서로 읽고 이어 간다. 결정은 모두 파일에 있다. 이전 대화 기록은 넘어오지 않는다.

## 끝난 것
| 항목 | 위치 |
| --- | --- |
| 하네스(에이전트 6개, 스킬 6개, `CLAUDE.md`)를 사용자 결정에 맞춰 수정 | `.claude/`, `CLAUDE.md` |
| 브리프 | `_workspace/00_input/brief.md` |
| 식약처 음식 DB 원본(19,738건, 52개 항목, 2026-10-06 갱신본) | `_workspace/00_input/mfds/mfds_food_std_raw.json`, 출처 `SOURCE.json`, 다시 받는 스크립트 `_workspace/00_input/fetch_mfds_food.py` |
| 샘플 사진 촬영 안내 | `_workspace/00_input/samples/README.md` |
| Firebase 프로젝트 `meal-intake-2026`(Spark), 웹 앱, Hosting 사이트, Firestore(서울), Google 로그인, AI Logic(Gemini Developer API) | `_workspace/02_firebase_notes.md` |
| MVP 스펙 확정본과 사용자 결정(U0~U8, 제출·심사 방식) | `_workspace/01_architect_spec.md`, 해시 `_workspace/freeze_01.sha`(프로젝트 루트에서 `sha256sum -c _workspace/freeze_01.sha`로 확인) |

## 0단계에 남은 것 (새 세션에서 진행)
스펙 6.1절 "0단계" 표와 완료 기준을 따른다.
1. 저장소 골격(firebase-engineer): `git init`, `.gitignore`(`node_modules/`, 빌드 결과, `_workspace/00_input/mfds/mfds_food_std_raw.json` 원본 31MB, `_workspace/00_input/samples/`의 사진 파일), `web/` Vite + React + TypeScript + Tailwind, `firebase.json`, `.firebaserc`(`meal-intake-2026`), 에뮬레이터(auth, firestore, hosting)
2. App Check: AI Logic 설정 과정에서 자동 적용됐는지 확인, reCAPTCHA 키 생성(결제 수단을 요구하면 결제를 연결하지 말고 스펙 U8), 개발 브라우저 디버그 토큰 등록
3. Firebase AI 모니터링이 꺼져 있는지 확인(스펙 R3)
4. 모델별 실제 무료 한도(분당·일일 요청 수)를 AI Studio에서 확인해 `_workspace/02_firebase_notes.md`에 기록
5. 스파이크(vision-ai-engineer): 이미지 + 응답 스키마 호출(`gemini-3.5-flash-lite`, `gemini-3.8-flash` 각 1회), Google 검색 그라운딩 호출(`gemini-2.5-flash-lite` 포함) → `_workspace/03_vision_eval.md` "스파이크" 절. 결과로 U3(검색 단계 켜기/끄기)를 판정

## 1단계에서 필요할 때 확인
사용자 요청으로 0단계의 약관·세부 조사는 멈췄다. 설계 에이전트는 마무리 도중 멈췄고, 남은 스펙 수정은 리더가 끝냈다. 아래는 그 작업을 할 때만 확인한다(스펙 7.3절과 같다).

| 항목 | 언제 | 누가 |
| --- | --- | --- |
| `gemini-2.5-flash-lite` 접근 가능 여부와 무료 그라운딩, 그라운딩과 응답 스키마 동시 사용 | 0단계 스파이크 | vision-ai-engineer |
| 모델별 실제 무료 한도(분당·일일 요청 수) | 0단계(AI Studio) | firebase-engineer |
| reCAPTCHA 키 생성에 결제 수단이 필요한지 | 0단계 App Check 설정 | firebase-engineer |
| 검색 그라운딩 결과값을 Firestore에 저장하고 나중에 검색 추천 없이 보여 줘도 되는지(그라운딩 약관의 저장 예외 조건) | 검색 단계를 켜기로 판정한 경우에만 | vision-ai-engineer |
| OAuth 동의 화면 게시 상태(팀과 무관한 일반 계정 로그인 가능 여부) | 2단계 첫 배포 전 | firebase-engineer |
| AI Logic 사용자별 분당 요청 한도 설정 위치 | 4단계 | firebase-engineer |
| Gemini 무료 등급의 데이터 보관 기간 | 확인 보류. 발표·고지 문구는 스펙 R2·U4처럼 보수적으로 둔다 | - |

## 작업 방식 (사용자 요청)
에이전트 작업은 짧게 나눈다. 한 번에 산출물 하나, 범위와 도구 호출 상한(대략 20회)을 정해 맡기고, 당장 필요 없는 조사는 위 목록처럼 미룬다. 세부 규칙은 `diet-app-orchestrator` 스킬의 "에이전트 작업 크기".

## 사용자 할 일
- 샘플 전·후 사진 촬영: 10/29까지 5쌍, 11/1까지 10쌍. `expected.json` 작성(안내는 samples/README.md)

## 새 세션 시작 방법
1. `C:\Users\kkama\dev\hackathon`에서 Claude Code를 연다.
2. "0단계 이어서 진행해줘"라고 요청한다. `diet-app-orchestrator` 절차 A가 `_workspace/`를 확인하고 위 "남은 것"부터 진행한다.
3. 새 폴더에서 정상 동작을 확인한 뒤 이전 폴더(`C:\Users\kkama\$HOME\Desktop\hackathon`)는 사용자가 직접 지운다.

## 주의
- 사진은 서버(Storage·Firestore)에 저장하지 않는다. 먹기 전 사진만 IndexedDB에 임시 보관한다(`CLAUDE.md`).
- 11/5 17:00 이후 Gemini 무료 한도는 심사위원용이다. 그 뒤로는 실제 AI 호출을 하지 않는다(`CLAUDE.md` "제출·심사").

## 0단계 진행 (2026-10-26 오후)
- 저장소 골격 `a11eb1c`, App Check 코드 `78e5aed`, 스파이크 `0c06a4f`(결과 `_workspace/03_vision_eval.md`).
- 사용자 결정: U1 = `gemini-3.5-flash-lite`, U3 = 검색 단계 코드 유지·기본 off(`CLAUDE.md` 반영). 그라운딩 결과 저장 약관 확인은 불필요해졌다.
- 무료 한도 값은 이 시점에 미확인이었다 → 아래 "무료 한도 확인" 절에서 확인함.
- 남은 0단계 완료 기준: 사용자가 localhost에서 디버그 토큰 등록 후 "AI 연결 시험" 버튼 1회 성공.
- 첫 배포 전 할 일: AI Logic App Check 강제 켜기, 배포 빌드에 `VITE_RECAPTCHA_SITE_KEY` 들어 있는지 확인.

## 0단계 완료 정리 (2026-10-26)
### 완료 기준 확인
| 기준 | 결과 |
| --- | --- |
| 사용자 스펙 확인 | 완료. 해시 `_workspace/freeze_01.sha` |
| localhost AI 호출 1회 성공 | 완료. `npm --prefix web run dev` → "AI 연결 시험" → "성공: 빨강"(사용자 보고). 디버그 토큰 등록함(이름 `kkamang-pc`) |
| 무료 한도·그라운딩 가능 여부 기록 | 그라운딩: 무료 등급 불가(`03_vision_eval.md`). 한도 값: AI Studio에서 확인(사용자, 아래 "무료 한도 확인" 절) |
| U1·U3 결정 | U1 `gemini-3.5-flash-lite`, U3 검색 코드 유지·기본 off(`CLAUDE.md` 반영) |

### 주의: App Check는 아직 검증되지 않았다
AI Logic API에 App Check 강제가 꺼져 있어서 "성공: 빨강"은 디버그 토큰 없이도 성공했을 호출이다. 디버그 토큰이 유효한지는 아직 모른다.
→ 2단계 첫 배포 전에 강제(Enforce)를 켜고, localhost에서 버튼을 1회 다시 눌러 확인한다. 강제를 켜면 `spike/ai_spike.mjs` 같은 Node 스크립트 호출은 막히므로, 실제 사진으로 측정하는 1단계(10/29)가 끝난 뒤에 켠다.

### 저장소·환경
- 커밋: `a11eb1c` 골격 → `78e5aed` App Check 코드 → `0c06a4f` 스파이크 → `d0ff5f3` 결정 반영 → (이 메모 커밋)
- `web/.env.local`(git 제외): `VITE_RECAPTCHA_SITE_KEY`, `VITE_USE_EMULATORS=off`. 모델은 코드 기본값 `gemini-3.5-flash-lite`
- 스파이크 스크립트 `node spike/ai_spike.mjs <1..5>`(1번 실행에 호출 1회). 시험 이미지 `spike/bibimbap.jpg`(CC BY 2.0, git 제외)
- 빌드 청크 경고(gzip 약 219KB): 4단계에서 청크 분리 검토
- 사고 기록: 스파이크 중 Wikimedia Commons 요청 1회의 User-Agent에 사용자 이메일이 들어갔다(사용자에게 알림). 이후 외부 요청에 사용자 정보를 넣지 않는다

### 1단계(10/27~10/29) 시작점
스펙 6.1절 1단계 표를 따른다. 10/29 끝에 "촬영 → 분석 → 결과 표시"를 한 번 연결한다.
- vision-ai-engineer: 10/27 analysis-schema v2·`validate_analysis.mjs`·`web/src/types/analysis.ts`, 식약처 DB 변환 스크립트·JSON → 10/28 `analyzeBefore`·`analyzeAfter`, `resolveNutrition`(검색 off 경로 포함), 계산·검증, 목업 픽스처 → 10/29 5쌍 측정
- frontend-dev: 목업 JSON으로 촬영 화면·IndexedDB 임시 보관부터
- 작업은 짧게 나눈다(산출물 하나, 도구 호출 약 20회)
- 사용자: 10/29까지 샘플 5쌍과 `expected.json`(`_workspace/00_input/samples/README.md`)

### 2단계 전 할 일
App Check 강제 켜고 버튼으로 재확인, 배포 빌드에 사이트 키가 들어 있는지 확인, OAuth 동의 화면 게시 상태 확인, Firestore 규칙 v1·규칙 테스트

## 무료 한도 확인 (2026-10-26, 사용자가 AI Studio에서 확인)
| 모델 | 분당(RPM) | 하루(RPD) | 비고 |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` (기본 모델) | 15 | 500 | 스펙 7절 계획용 가정(분당 10)보다 넉넉함 |
| `gemini-3.8-flash` | 5 | 20 | 개발·평가·녹화·심사를 감당할 수 없어 운영 모델로 쓰지 않는다(U1과 같음) |
- **한도는 프로젝트 전체 공유다.** 개발 PC, Node 스크립트, 배포본, 심사위원이 같은 한도를 쓴다. 한 끼 기록 = 먹기 전 1회 + 먹은 후 1회(+ DB에 없는 음식의 AI 추정 호출).
- 일일 한도는 미국 태평양 시간 자정에 다시 채워진다(Gemini API 문서 기준). 한국 시간으로 10/26~10/31은 16:00, 11/1 서머타임 종료 뒤로는 17:00이다. `CLAUDE.md`의 "11/5 17:00 이후 새로 채워지는 한도"와 맞는다. 실제 리셋 시각은 첫 측정 때 사용량 화면으로 한 번 확인한다.

## 10/29 모델 비교 계획 (3.8 Flash는 하루 20회 안에서)
대상: 샘플 5쌍(`_workspace/00_input/samples/`), 같은 프롬프트 v1·같은 사진으로 두 모델 비교. 지표는 스펙 6.1절 10/29(끼니 kcal MAPE, 음식 식별 정확도, 남긴 비율 오차, 출처별 비율) + **호출당 지연 시간**.

| 모델 | 호출 수 | 상한 | 방법 |
| --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | 5쌍 × 2(먹기 전·후) = 10회 + AI 추정 호출 | 하루 500회 중 측정에 40회 이내 | 호출 사이 5초 이상 |
| `gemini-3.8-flash` | 5쌍 × 2 = **10회** | **최대 15회**(20회 중 5회는 실패·확인용 여유) | 호출 사이 15초 이상(분당 5회). 재시도 금지. 영양값 AI 추정 호출은 3.8로 보내지 않고 3.5 Flash-Lite 결과를 공유 |

규칙
1. 스크립트에 모델별 호출 카운터를 두고, 3.8 Flash가 15회에 닿으면 멈추게 한다. 호출마다 시각·모델·상태·지연을 결과 파일에 남긴다(같은 날 다시 돌릴 때 이어서 센다).
2. 측정은 리셋 직후(10/29 16:00 KST 이후)가 아니라 리셋 창 하나 안에서 끝낸다. 10/28 16:00~10/29 16:00 창에서 3.8을 다른 용도로 쓰지 않는다.
3. 3.8 Flash는 0단계에서 1회에 170초가 걸렸다. 시도당 제한(스펙 4.2, 20초)과 별개로 측정 스크립트는 호출당 200초까지 기다리고, 시간 초과도 결과로 기록한다. 첫 쌍에서 2회 모두 60초를 넘으면 나머지 쌍은 3.8 비교를 멈추고(한도·시간 절약) "지연 때문에 운영 부적합"으로 결론 낸다.
4. 결과는 `_workspace/03_vision_eval.md` "10/29 모델 비교" 절. U1 최종 확정은 리더·사용자.
5. **환산 DB 값과 AI 추정 값 비교(사용자 요청):** 샘플에 출처가 "DB(환산)"인 음식이 나오면, 그 음식마다 환산 DB 값과 AI 추정 값(호출 D, `gemini-3.5-flash-lite`)을 둘 다 계산해 `expected.json` 실제값과 어느 쪽이 가까운지 기록한다. 호출 D는 이 비교에만 음식당 1회(5쌍 기준 약 5~10회, 3.5 Flash-Lite 측정 상한 40회 안). 결과로 "DB(환산)"을 계속 1순위로 둘지 정한다.
6. **액체 음식 오차 확인:** Gemini는 지금처럼 중량을 g으로 추정한다. 국·찌개 국물·음료처럼 액체 음식의 오차가 크면 그때 ml로 추정하게 할지 검토한다(오늘은 바꾸지 않음).

## 1단계 진행 기록 (2026-10-26, 오늘 1단계 전체를 조각 4개로 진행 중)
사용자 방식: 조각 하나씩 진행 → 조각마다 브라우저 확인 방법 안내 → 사용자가 "다음"이라고 하면 다음 조각. 로그인·Firestore 저장·결과 수정 화면·디자인은 2단계, 정확도 측정은 10/29(샘플이 모이면).
| 조각 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 식약처 DB JSON 변환 + 이름 검색 | 완료(`75b24a5`). 사용자 확인. 사용자 결정으로 100ml 전용 고형 음식 775개를 1ml=1g 환산해 추가, 출처 "DB(환산)"(foods 11,381행, 그중 환산 1,995행, 1.82MB·gzip 298KB). 별칭 `계란후라이→달걀후라이` 추가 |
| 2 | 먹기 전 사진 → Gemini 음식 이름·중량(g) JSON → 목록 표시, 먹기 전 사진 IndexedDB 임시 저장 | 다음 |
| 3 | 먹은 후 사진 + 먹기 전 사진·결과 → 남긴 비율 → IndexedDB 사진 삭제 | - |
| 4 | DB → AI 추정으로 100g당 값 결정 → 섭취량(인원수 기본 1) → 음식별 값·출처(DB/DB(환산)/AI 추정) 표시 | - |
- 스펙과 실제 경로 차이: 스펙 4.1절은 `web/src/firebase.ts`지만 실제는 `web/src/lib/firebase.ts`(AI는 `web/src/lib/ai.ts`). 실제 경로를 따른다.
