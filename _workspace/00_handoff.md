# 인계 메모 — 0단계 진행 상황 (2026-10-26)

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
