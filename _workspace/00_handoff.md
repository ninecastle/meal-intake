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
- 무료 한도 값은 미확인(AI Studio 권한 없음, 429 본문에 quota 정보 없음). 계획용 추정치로 관리.
- 남은 0단계 완료 기준: 사용자가 localhost에서 디버그 토큰 등록 후 "AI 연결 시험" 버튼 1회 성공.
- 첫 배포 전 할 일: AI Logic App Check 강제 켜기, 배포 빌드에 `VITE_RECAPTCHA_SITE_KEY` 들어 있는지 확인.

## 0단계 완료 정리 (2026-10-26)
### 완료 기준 확인
| 기준 | 결과 |
| --- | --- |
| 사용자 스펙 확인 | 완료. 해시 `_workspace/freeze_01.sha` |
| localhost AI 호출 1회 성공 | 완료. `npm --prefix web run dev` → "AI 연결 시험" → "성공: 빨강"(사용자 보고). 디버그 토큰 등록함(이름은 사용자 메시지에 `kkama-pc`·`kkamang-pc` 두 가지로 적혀 있어 확인 필요) |
| 무료 한도·그라운딩 가능 여부 기록 | 그라운딩: 무료 등급 불가(`03_vision_eval.md`). 한도 값: 확인 불가(AI Studio 권한 없음, 429 본문에 값 없음) → 계획용 추정치로 관리 |
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
