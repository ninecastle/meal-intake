---
name: diet-app-orchestrator
description: "먹기 전·후 사진으로 실제 섭취 칼로리를 계산하는 식단 기록 웹앱의 해커톤 개발 전체(설계 → 구현 → 검증 → 배포 → 발표 준비)를 에이전트 팀으로 조율한다. '앱 만들기 시작', '개발 진행해줘', '오늘 작업 진행', '다음 단계', 'MVP 구현', '배포까지' 요청에 사용하며, 스펙 수정, 특정 기능만 다시 구현, 정확도 개선, QA 재실행, 발표 자료 업데이트·보완, 이전 결과를 바탕으로 이어서 작업 같은 후속 요청에도 사용한다. 단순 질문이나 한 파일의 작은 수정은 직접 처리한다."
---

# 식단 기록 웹앱 오케스트레이터

## 실행 모드: 혼합
| 단계 | 실행 모드 | 이유 |
| --- | --- | --- |
| 1. 설계 | 서브에이전트 위임 (architect) | 스펙 한 번 받고 사용자가 검토 |
| 2. 구현 | 지속형 에이전트 협업 (vision-ai-engineer, firebase-engineer, frontend-dev, qa-integrator) | 인터페이스 계약을 두고 피드백을 주고받으며 여러 날 이어서 작업 |
| 3. 정확도 개선 | 지속형 (vision-ai-engineer ↔ qa-integrator) | 같은 샘플 세트로 반복 측정, 이전 시도 맥락 필요 |
| 4. 발표 준비 | 서브에이전트 위임 (pitch-writer) | 확정 자료를 정리하는 단발 작업 |

## 에이전트 구성
| 이름 | `subagent_type` | 스킬 | 산출물 |
| --- | --- | --- | --- |
| architect | architect | firebase-stack, intake-calorie-estimation | `_workspace/01_architect_spec.md` |
| vision | vision-ai-engineer | intake-calorie-estimation | `web/src/analysis/`, 영양 DB JSON·변환 스크립트, `_workspace/03_vision_eval.md` |
| backend | firebase-engineer | firebase-stack | `firebase.json`, `firestore.rules`, 인덱스, 규칙 테스트, `_workspace/02_firebase_notes.md` |
| frontend | frontend-dev | meal-log-frontend | `web/`, `_workspace/02_frontend_notes.md` |
| qa | qa-integrator | hackathon-qa, intake-calorie-estimation | `_workspace/04_qa_report.md` |
| pitch | pitch-writer | demo-pitch | `README.md`, `_workspace/05_*.md` |

에이전트 프롬프트에는 사용할 스킬 이름과 "프로젝트 `CLAUDE.md`의 확정 결정 사항을 먼저 읽어라"를 적어 첫 작업 전에 불러오게 한다.

## 고정 전제 (프로젝트 `CLAUDE.md` 확정 결정 사항)
- Firebase Spark(무료) 요금제만 쓴다. Blaze 업그레이드·결제 계정 연결 금지. Cloud Functions·Cloud Storage 없음.
- AI는 Firebase AI Logic + Gemini Developer API(무료 등급)를 클라이언트에서 호출한다.
- 사진은 서버에 저장하지 않는다. 촬영 즉시 Gemini로 분석하고 Firestore에는 분석 결과(음식 이름, 중량, 남긴 비율, 같이 먹은 인원수, 칼로리·영양소, 출처)만 저장한다. 먹기 전 사진만 IndexedDB에 임시 보관했다가 먹은 후 분석(두 장 함께) 뒤 지운다.
- 영양값은 식약처 DB(JSON 포함) → 검색 기반 → AI 추정 순서, 하루 요약은 클라이언트 합산.
- 현장 시연은 없다. 11/5 18:00까지 피칭 영상(시연 녹화 포함)과 배포 URL을 제출하고, 심사위원이 며칠 동안 직접 써 본다. 녹화는 11/5 17:00 전에 끝내고, 그 뒤 새로 채워지는 무료 한도는 심사위원용으로 남긴다(개발·QA 실제 AI 호출 금지).
- 이 전제를 바꾸는 요청은 사용자에게 확인한 뒤 `CLAUDE.md`부터 고친다.

## 일정 (확정, 0~6단계)
| 단계 | 날짜 | 목표 |
| --- | --- | --- |
| 0 | 10/26 | 환경 준비: 스펙 확정, Firebase 프로젝트(Spark)·AI Logic(Gemini Developer API)·Google 로그인 활성화, 저장소 골격, 식약처 DB 내려받기, 샘플 사진 10쌍 촬영 시작 |
| 1 | 10/27~10/29 | 사진 두 장 → 칼로리 핵심 기능 연결: 먹기 전·후 분석 v1, 영양 DB JSON 변환·`resolveNutrition`, 계산 함수, 촬영 화면 — 10/29 끝에 촬영 → 분석 → 결과 표시 한 번 연결 |
| 2 | 10/30 | 로그인·저장·결과 수정 화면·첫 배포 |
| 3 | 10/31~11/1 | 하루 요약(클라이언트 합산) |
| 4 | 11/2~11/3 | 정확도 개선·화면 다듬기, 데모 사진 경로, 오류 대체 경로 |
| 5 | 11/4 | **기능 동결**·문서(README·영상 대본·심사위원 안내), 녹화 전 점검(QA 점검표 F), 영상 녹화 시작, 버그 수정만 |
| 6 | 11/5 | 오전 최종 배포 → 17:00 전 녹화 완료 → 18:00 전 영상·URL 제출 → 심사 기간 운영(배포본 유지·변경 없음·사용량만 확인) |

기능 동결 이후 새 기능 요청을 받으면 사용자에게 동결 상태임을 알리고 진행 여부를 확인한다.

## 에이전트 작업 크기 (사용량 절약, 사용자 요청)
에이전트 작업은 짧게 나눈다. 0단계에서 설계 에이전트 한 번에 30분 넘게 걸려 사용자가 사용량을 걱정했다.
- 한 번 호출(또는 한 번의 SendMessage 지시)에 산출물 하나만 맡기고, 끝났다고 볼 기준을 함께 준다.
- 프롬프트에 범위와 상한을 적는다: 다룰 절·파일, 웹 조사 항목 수, 도구 호출 수(대략 20회 안팎). 상한에 닿으면 멈추고 그때까지의 결과와 남은 일을 보고하게 한다.
- 웹 조사는 그 작업에 바로 필요한 사실만 한다. 약관·정책 세부처럼 당장 구현에 영향이 없는 확인은 "필요할 때 확인" 목록에 올리고 넘어간다.
- 그날 작업에 필요한 팀원만 띄운다. 처음부터 네 명을 한꺼번에 띄우지 않는다.
- 산출물 파일이 20분 넘게 바뀌지 않으면 리더가 범위를 줄이거나 마무리를 지시한다.
- 리더가 직접 확인할 수 있는 몇 번의 도구 호출은 위임하지 않는다.

## 작업 절차

### 절차 A: 기존 작업 확인
1. `_workspace/`와 `_workspace/01_architect_spec.md`가 있는지 확인한다.
   - 없음 → 절차 B부터 실행
   - 있고 일부 수정 요청(예: "요약 화면만 다시") → 해당 담당 에이전트만 실행하고 관련 산출물 경로를 프롬프트에 넣는다
   - 있고 스펙 자체를 바꾸는 요청 → architect를 다시 호출해 스펙의 해당 절만 고치고, 영향을 받는 에이전트에게 변경을 알린다
2. 오늘 날짜를 일정표와 비교해 현재 목표를 사용자에게 한 줄로 알린다.

### 절차 B: 설계 (서브에이전트 위임)
1. 사용자 요구를 `_workspace/00_input/brief.md`에 저장한다.
2. `Agent(subagent_type: "architect", prompt: "brief.md를 읽고 firebase-stack, intake-calorie-estimation 스킬 기본값을 바탕으로 스펙을 _workspace/01_architect_spec.md에 써라")`
3. 스펙의 "미결정 사항"과 요약을 사용자에게 보여 주고 확인받는다. **확인 전에는 구현을 시작하지 않는다.** 범위 결정은 사용자의 몫이다.
4. 확정 후 스펙 해시를 기록한다: `sha256sum _workspace/01_architect_spec.md > _workspace/freeze_01.sha`

### 절차 C: 구현 (지속형 에이전트 협업)
1. 그날 작업에 필요한 팀원만, 위 "에이전트 작업 크기"에 맞춘 작은 작업으로 실행한다. 서로 기다리지 않는 작업만 한 메시지에서 병렬로 띄운다.
   - `Agent(name: "vision", subagent_type: "vision-ai-engineer", prompt: "스펙과 intake-calorie-estimation 스킬로 분석 모듈 v1을 구현하라 ...")`
   - `Agent(name: "backend", subagent_type: "firebase-engineer", ...)`
   - `Agent(name: "frontend", subagent_type: "frontend-dev", ...)`
   - `Agent(name: "qa", subagent_type: "qa-integrator", prompt: "모듈 완성 요청이 오면 hackathon-qa 점검표로 검증하라 ...")`
2. 공유 작업 목록을 등록한다(팀원당 3~6개, 의존 관계 명시). 예:
   - backend: 프로젝트 골격·에뮬레이터·AI Logic·App Check → Google 로그인 → 규칙·규칙 테스트 → 하루 요약 쿼리·인덱스 → 첫 배포(10/30)
   - vision: 영양 DB JSON 변환 → 먹기 전·후 프롬프트 v1 → `resolveNutrition`(DB → 검색 → AI 추정) → 계산·검증 함수
   - frontend: 골격·로그인 → 촬영·즉시 분석 호출 → 결과 확인·수정 화면 → 저장 → 하루 요약 (vision 모듈 인터페이스에 의존, 그 전에는 목업 JSON)
   - qa: 점검표 A~E (각 구현 작업에 의존)
3. 첫 보고에서 각 팀원이 알린 사용 가능 도구를 확인한다. 필요한 도구가 없으면 정의 파일을 고친 뒤 다시 실행한다.
4. 조율 규칙
   - 계약 변경 요청은 리더가 받아 architect 스펙에 반영할지 결정하고, 영향을 받는 팀원에게 SendMessage로 알린다.
   - qa가 보낸 결함은 담당자가 고친 뒤 qa에게 재검사를 요청한다.
   - 10/29 끝에 "촬영 → 분석 → 결과 표시"가, 10/30 끝에 "로그인 → 저장 → 배포"가 연결됐는지 확인한다. 안 됐으면 사용자에게 범위 축소안을 제시한다.

### 절차 D: 정확도 개선 (지속형)
1. 사용자에게 샘플 전·후 사진과 기대값을 `_workspace/00_input/samples/`에 넣어 달라고 요청한다(실제 사진이 없으면 측정할 수 없다).
2. `SendMessage({to: "vision"}, "샘플 세트로 측정하고 오차가 큰 유형부터 개선하라. 매 버전 03_vision_eval.md에 기록")`
3. 개선 폭이 두 번 연속 2%p 미만이면 멈추고 보정 UI 다듬기로 시간을 돌린다.

### 절차 E: 배포와 리허설
1. backend에 배포를 지시하고 URL을 `02_firebase_notes.md`에서 확인한다.
2. qa에 점검표 F(녹화 전·심사위원 관점 점검)를 지시한다. 11/4 기능 동결 뒤에는 녹화·심사 흐름에 걸린 결함만 고치고, 11/5 최종 배포 직후(17:00 전) 한 번 더 점검한다. 11/5 17:00 이후에는 실제 AI 호출을 하지 않는다.

### 절차 F: 발표 준비 (서브에이전트 위임)
`Agent(subagent_type: "pitch-writer", prompt: "demo-pitch 스킬로 README(심사위원 체험 안내 포함), 피칭 영상 대본, 녹화 시나리오, 제출 점검표를 작성하라. 입력: _workspace/01·02·03·04")`

### 절차 G: 마무리
`_workspace/`는 남긴다. 11/5 18:00 전에 영상·URL 제출을 사용자와 확인한다. 제출 뒤 심사 기간에는 배포본을 바꾸지 않고 사용량만 확인한다. 사용자에게 완료 항목, 열린 결함, 다음 할 일을 요약한다.

## 데이터 전달
| 경로 | 방법 |
| --- | --- |
| 스펙 → 모든 구현자 | 파일 `_workspace/01_architect_spec.md` + 해시 |
| 분석 결과 계약 | `intake-calorie-estimation/references/analysis-schema.json` |
| 구현자 ↔ qa | SendMessage(검증 요청·결함), 결과는 `_workspace/04_qa_report.md` |
| 진행 상태 | TaskCreate / TaskUpdate / TaskList |
| 발표 자료 입력 | `_workspace/01~04` 파일 |

파일 이름은 `{phase}_{agent}_{artifact}.{ext}` 형식을 따른다.

## 오류 처리
| 상황 | 대응 |
| --- | --- |
| 팀원 무응답 | SendMessage로 상태 확인 후 재지시. 그래도 실패하면 같은 유형을 새 이름(`frontend2` 등)으로 실행하고 notes 파일 경로를 넘긴다 |
| Firebase 로그인 만료·권한 거부 | 재시도하지 않는다. 사용자에게 `! firebase login` 또는 콘솔 조치를 요청하고 그동안 에뮬레이터로 진행 |
| 어떤 기능이 Blaze를 요구 | 업그레이드하지 않는다. 그 기능을 빼거나 Spark 안의 대안을 찾아 사용자에게 보고 |
| Gemini 무료 한도 초과·App Check 오류 | 재시도하지 않고 사용자에게 알린다. 앱은 AI 추정·수동 입력 경로로 계속 동작해야 하며, 개발은 목업 JSON으로 계속 |
| 심사 기간 한도 부족 우려 | 11/5 17:00 이후 개발·QA·녹화 실제 호출 금지. 호출 절약 설계(스펙 5.2절)가 동작하는지 qa가 점검표 F로 확인 |
| 사용량 한도 소진 | 부분 산출물을 직접 확인하고 누락을 `_workspace/`에 기록, 풀리는 시각과 함께 보고 |
| 일정 지연 | 핵심 두 기능 외 항목부터 제외하는 축소안을 사용자에게 제시 |
| 스펙과 구현 충돌 | 삭제하지 않고 양쪽 근거를 스펙 "변경 기록"에 남긴 뒤 리더가 결정 |

멈춘 에이전트의 빈 곳은 직접 확인한 사실만 대신 채우고, 그 에이전트의 판단은 추측해 쓰지 않는다.

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "앱 만들기 시작"을 요청 → `_workspace/` 없음 → 절차 B architect 스펙 작성 → 사용자 확인
2. 절차 C에서 팀원 4명 실행, 작업 12~16건 등록 → qa가 점검표 A~E 점검
3. 예상 결과: 배포 URL에서 구글 로그인 후 전·후 사진으로 한 끼 기록(사진은 서버에 저장되지 않음), 하루 요약 표시, `04_qa_report.md`에 열린 치명 결함 0건, 11/5 18:00 전 영상·URL 제출

### 오류 흐름
1. 절차 C에서 backend가 `firebase deploy` 중 권한 오류를 보고
2. 재시도하지 않고 사용자에게 `! firebase login`을 요청, 다른 팀원은 에뮬레이터로 계속. 오류가 요금제 관련이면 업그레이드하지 않고 Spark 안의 대안을 보고
3. 사용자 조치 후 backend에 SendMessage로 배포 재지시, 보고서에 지연 사유 기록

### 후속 요청 흐름
1. 사용자가 "남은 반찬 인식이 자꾸 틀려, 정확도 개선해줘" 요청
2. 절차 A: `_workspace/03_vision_eval.md` 존재 → 절차 D만 실행, vision에게 이전 평가 기록을 읽고 이어서 개선하게 한다
