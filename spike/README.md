# spike/ — 개발용 Node 시험 스크립트

앱 코드가 아니다. 배포·빌드에 들어가지 않는다. 결과 파일은 `spike/results/`(git 제외)에 쓴다.
스크립트 안에 `C:/Users/kkama/dev/hackathon` 절대 경로가 들어 있다. 다른 위치에서 쓰려면 고친다.

## tests/ — 실제 AI 호출 없음(호출 D는 `mockEstimate`)
| 파일 | 내용 | 실행 |
| --- | --- | --- |
| `piece4_integration.mjs` | 목업 먹기 전·후 픽스처 + 실제 식약처 DB → `assembleAnalysis` → `validateAnalysis`, 인원수 1→2 | `node spike/tests/piece4_integration.mjs C:/Users/kkama/dev/hackathon` |
| `run-tests.mjs` | compute·assemble·validate 시험(가짜 resolve) | `node spike/tests/run-tests.mjs` |
| `resolve_test.mjs`, `extra.mjs` | `resolveNutrition` 조회 결과 표(종류 규칙, DB(환산), 빈 값 채우기) | `node spike/tests/resolve_test.mjs` |
| `alias_test.mjs` | 별칭·단어 치환·`listFoodVariants` | `node spike/tests/alias_test.mjs [extra]` |
| `search_test.mjs` | DB 이름 검색 | `node spike/tests/search_test.mjs` |
| `summary_test.mjs` | 하루 합산 `summarizeDay`(done만, 끼니별, 날짜 섞임 없음) | `node spike/tests/summary_test.mjs .` |
| `published_test.mjs` | 공개 중량(스펙 4.5.5)·프롬프트 a3 | `node spike/tests/published_test.mjs` |
| `goal_test.mjs` | 목표 계산 `goal.ts`(스펙 4.7 손 계산, 미성년, 직접 조정 하한, 목표 비교) | `node spike/tests/goal_test.mjs .` |
| `chunk_reload_test.mjs` | 화면 파일 불러오기 실패 판별·60초 1회 자동 새로고침(`lib/chunkReload.ts`) | `node spike/tests/chunk_reload_test.mjs .` |
| `korean_unsure_test.mjs` | 프롬프트 a4·b2: 영어 경고 → 일반 안내, 확신 낮은 끝값(≥0.95·≤0.05) → null, 모델 null 유지, 분당 429 재시도 없음(가짜 모델로 `aiCall.ts`) | `node spike/tests/korean_unsure_test.mjs` |
| `b3_test.mjs` | 프롬프트 b3: `same_scene`·`match` 규칙(같은 장면 + 안 보임 → 0과 `ratio_assumed`, 다른 그릇·판단 불가·다른 장면 → null, 같은 그릇 0개면 안 보임도 null, match 없음 → b2), 캐시 다시 읽기, assemble·compute 전달, `setRemainingRatio`, validate.ts·`validate_analysis.mjs`·스키마 | `node spike/tests/b3_test.mjs` |

`assemble.ts`처럼 앱용 `nutrition/index.ts`·`lib/ai`(import.meta.env)를 따라가는 모듈은 Node에서 바로 못 불러온다.
`piece4_integration.mjs`는 `module.registerHooks`로 두 모듈을 빈 모듈로 바꿔 돌린다. 10/29 측정 스크립트도 이 방식을 쓴다.

## live/ — 실제 Gemini 호출(프로젝트 무료 한도를 쓴다)
| 파일 | 내용 |
| --- | --- |
| `call_a1.mjs` | 호출 A(먹기 전) 1회. `spike/bibimbap.jpg` |
| `after_test.mjs` | 호출 B(먹은 후) 정리 규칙 오프라인 검사, `LIVE=1`이면 실제 1회 |
| `live.mjs` | `a`(호출 A) 또는 `d`(호출 D) 1회 |
| `../ai_spike.mjs` | 0단계 스파이크(모델·그라운딩 시험) |
- 1번 실행 = 호출 1회, 재시도 없음. 11/5 17:00 이후에는 돌리지 않는다(`CLAUDE.md` "제출·심사").
- AI Logic에 App Check 적용(Enforce)을 켜면 Node 호출은 막힌다(적용은 10/29 측정 뒤).
- 시험 이미지 `bibimbap.jpg`: https://commons.wikimedia.org/wiki/File:Dolsot-bibimbap.jpg (CC BY 2.0, Sous Chef). git 제외.
