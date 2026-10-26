// 0단계 스파이크: Firebase AI Logic(Gemini Developer API) 호출 가능 여부 확인.
// 사용: node spike/ai_spike.mjs <1|2|3|4|5>   (한 번 실행 = 호출 1회, 재시도 없음)
// 결과는 spike/results/call<N>.json 에 남긴다(이미지 base64는 남기지 않는다).
// 시험 이미지: spike/bibimbap.jpg (커밋하지 않음)
//   출처 https://commons.wikimedia.org/wiki/File:Dolsot-bibimbap.jpg (CC BY 2.0, Sous Chef), 1280px 썸네일
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'web', 'package.json'));
const { initializeApp } = require('firebase/app');
const { getAI, getGenerativeModel, GoogleAIBackend, Schema, ThinkingLevel } = require('firebase/ai');

// 웹 설정값(_workspace/02_firebase_notes.md). 웹 API 키는 공개 값이다.
const app = initializeApp({
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain: 'meal-intake-2026.firebaseapp.com',
  projectId: 'meal-intake-2026',
  appId: '1:686292653830:web:87f810922b0016e244f087',
});
const ai = getAI(app, { backend: new GoogleAIBackend() });

// 호출 A 축약 스키마
const per100 = Schema.object({
  properties: { kcal: Schema.number(), carbs_g: Schema.number(), protein_g: Schema.number(), fat_g: Schema.number() },
});
const schemaA = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(), name: Schema.string(), location: Schema.string(),
          before_grams: Schema.number(), confidence: Schema.number(), per_100g_guess: per100,
        },
      }),
    }),
    warnings: Schema.array({ items: Schema.string() }),
  },
});
const sysA = `당신은 식사 사진을 분석하는 영양 보조 도구다. 먹기 전 식탁 사진 한 장이 주어진다.
1. 보이는 음식을 그릇 단위로 나열하고 i1, i2 … id를 붙인다.
2. name은 한국 식품영양성분 DB에 있을 법한 일반 음식명으로 쓴다.
3. location에 그릇 위치와 모양을 짧게 적는다.
4. 먹기 전 중량(g)을 추정한다(수저, 표준 밥공기 210g, 접시 크기를 단서로).
5. per_100g_guess에 100g당 kcal, 탄수화물·단백질·지방(g) 추정값을 적는다.
섭취량이나 총 칼로리는 계산하지 않는다. 확신이 없으면 confidence를 낮게 준다.`;
const promptC = (name) => `"${name}"의 100g당 열량(kcal), 탄수화물(g), 단백질(g), 지방(g)을 웹 검색으로 찾아라.
조리된 일반적인 1인분 기준 자료를 우선한다. 찾지 못하면 "NOT_FOUND"만 답한다.
찾았으면 다른 말 없이 다음 JSON 한 줄로만 답한다:
{"kcal": 0, "carbs_g": 0, "protein_g": 0, "fat_g": 0}`;
const FOOD_C = '돌솥비빔밥';

const imagePart = () => ({
  inlineData: { mimeType: 'image/jpeg', data: readFileSync(join(here, 'bibimbap.jpg')).toString('base64') },
});

const calls = {
  1: { model: 'gemini-3.5-flash-lite', kind: 'A', thinking: { thinkingLevel: ThinkingLevel.LOW } },
  2: { model: 'gemini-3.8-flash', kind: 'A', thinking: { thinkingLevel: ThinkingLevel.LOW } },
  3: { model: 'gemini-3.5-flash-lite', kind: 'C', thinking: { thinkingLevel: ThinkingLevel.LOW } },
  4: { model: 'gemini-2.5-flash-lite', kind: 'C' },
  5: { model: 'gemini-2.5-flash-lite', kind: 'C+schema' },
};

const n = process.argv[2];
const c = calls[n];
if (!c) { console.error('usage: node spike/ai_spike.mjs <1..5>'); process.exit(2); }

const generationConfig = {};
if (c.thinking) generationConfig.thinkingConfig = c.thinking;
let params = { model: c.model, generationConfig };
let request;
if (c.kind === 'A') {
  Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: schemaA });
  params.systemInstruction = sysA;
  request = [{ text: 'BEFORE 사진' }, imagePart()];
} else {
  params.tools = [{ googleSearch: {} }];
  if (c.kind === 'C+schema') Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: per100 });
  request = promptC(FOOD_C);
}

const out = { call: Number(n), model: c.model, kind: c.kind, at: new Date().toISOString() };
const t0 = performance.now();
try {
  const model = getGenerativeModel(ai, params);
  const res = await model.generateContent(request);
  out.latency_ms = Math.round(performance.now() - t0);
  const r = res.response;
  const cand = r.candidates?.[0];
  out.status = 'ok';
  out.finishReason = cand?.finishReason;
  try { out.text = r.text(); } catch (e) { out.text_error = String(e.message); }
  out.usageMetadata = r.usageMetadata;
  const gm = cand?.groundingMetadata;
  out.has_groundingMetadata = !!gm;
  out.has_searchEntryPoint = !!gm?.searchEntryPoint?.renderedContent;
  out.groundingChunks = gm?.groundingChunks?.length ?? 0;
  out.webSearchQueries = gm?.webSearchQueries;
} catch (e) {
  out.latency_ms = Math.round(performance.now() - t0);
  out.status = 'error';
  out.error_code = e.code;
  out.error_message = e.message;
  out.customErrorData = e.customErrorData;
}
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(join(here, 'results', `call${n}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
