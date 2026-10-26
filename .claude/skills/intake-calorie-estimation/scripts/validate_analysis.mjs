#!/usr/bin/env node
// 섭취 분석 결과(MealIntakeAnalysis)의 필수 필드·범위·계산 일관성을 검사한다.
// 사용법: node validate_analysis.mjs <result.json>   (종료 코드 0=통과, 1=실패)
import { readFileSync } from "node:fs";

const TOL = 0.02; // 반올림 허용 오차(2%)
const LOW_CONF = 0.6;
const NUTRIENTS = ["kcal", "carbs_g", "protein_g", "fat_g"];
const SOURCES = ["db", "search", "ai_estimate", "user_input"];
const PHOTO_KEY = /photo|image|thumb|base64|url/i;

const path = process.argv[2];
if (!path) {
  console.error("usage: node validate_analysis.mjs <result.json>");
  process.exit(2);
}
const r = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const warns = [];
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * TOL);
const inRange = (v, lo, hi) => typeof v === "number" && v >= lo && v <= hi;
const isNutrients = (o) => o && NUTRIENTS.every((k) => typeof o[k] === "number" && o[k] >= 0);

// 사진은 저장하지 않는다: 사진처럼 보이는 키가 있으면 실패
(function scan(o, at) {
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (PHOTO_KEY.test(k)) errors.push(`${at}${k}: 사진 관련 필드는 저장하지 않는다`);
    scan(v, `${at}${k}.`);
  }
})(r, "");

if (!Array.isArray(r.items)) errors.push("items 배열이 없다");
if (!Array.isArray(r.warnings)) errors.push("warnings 배열이 없다");

const REQUIRED = ["id", "name", "db_food_code", "eaters", "before_grams", "remaining_ratio",
  "consumed_grams", "per_100g", "nutrition_source", "consumed", "kcal_overridden", "confidence", "needs_review"];
const sum = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
let sumBefore = 0, anyOverride = false;
const ids = new Set();

(r.items ?? []).forEach((it, i) => {
  const tag = `items[${i}](${it.name ?? "?"})`;
  for (const k of REQUIRED) if (!(k in it)) errors.push(`${tag}: ${k} 누락`);
  if (ids.has(it.id)) errors.push(`${tag}: id 중복`);
  ids.add(it.id);
  if (!inRange(it.confidence, 0, 1)) errors.push(`${tag}: confidence 범위(0~1) 벗어남`);
  if (!Number.isInteger(it.eaters) || it.eaters < 1 || it.eaters > 20) errors.push(`${tag}: eaters는 1~20 정수여야 한다`);
  if (!(it.before_grams >= 0)) errors.push(`${tag}: before_grams 음수 또는 누락`);
  if (!SOURCES.includes(it.nutrition_source)) errors.push(`${tag}: nutrition_source 값 오류`);
  if (it.nutrition_source === "db" && !it.db_food_code) errors.push(`${tag}: 출처 db인데 db_food_code 없음`);
  if (!isNutrients(it.consumed)) errors.push(`${tag}: consumed 영양소 누락·음수`);
  if (it.per_100g === null) {
    if (it.nutrition_source !== "user_input") errors.push(`${tag}: per_100g=null은 user_input일 때만 허용`);
    if (!it.kcal_overridden) errors.push(`${tag}: per_100g=null인데 kcal_overridden=false`);
  } else if (!isNutrients(it.per_100g)) {
    errors.push(`${tag}: per_100g 영양소 누락·음수`);
  } else {
    if (it.per_100g.kcal > 900) errors.push(`${tag}: per_100g.kcal ${it.per_100g.kcal} > 900`);
    const macro = it.per_100g.carbs_g + it.per_100g.protein_g + it.per_100g.fat_g;
    if (macro > 100) errors.push(`${tag}: 100g당 탄+단+지 ${macro.toFixed(1)}g > 100g`);
  }
  if (it.kcal_overridden) anyOverride = true;

  if (it.remaining_ratio === null) {
    if (!it.needs_review) errors.push(`${tag}: 매칭 실패(remaining_ratio=null)인데 needs_review=false`);
  } else if (!inRange(it.remaining_ratio, 0, 1)) {
    errors.push(`${tag}: remaining_ratio 범위(0~1) 벗어남`);
  } else {
    const expGrams = it.before_grams * (1 - it.remaining_ratio) / it.eaters;
    if (!near(it.consumed_grams, expGrams))
      errors.push(`${tag}: consumed_grams ${it.consumed_grams} ≠ 중량×(1−남긴 비율)÷eaters ${expGrams.toFixed(1)}`);
  }

  // 섭취 값 = 100g당 값 × consumed_grams ÷ 100 (칼로리를 직접 고친 항목은 kcal 검사 제외)
  if (it.per_100g && isNutrients(it.per_100g) && isNutrients(it.consumed)) {
    for (const k of NUTRIENTS) {
      if (k === "kcal" && it.kcal_overridden) continue;
      const exp = it.per_100g[k] * it.consumed_grams / 100;
      if (!near(it.consumed[k], exp))
        errors.push(`${tag}: consumed.${k} ${it.consumed[k]} ≠ 계산값 ${exp.toFixed(1)}`);
    }
  }
  if (it.confidence < LOW_CONF && !it.needs_review)
    errors.push(`${tag}: confidence<${LOW_CONF}인데 needs_review=false`);

  sumBefore += (it.before_grams ?? 0) * (it.per_100g?.kcal ?? 0) / 100;
  for (const k of NUTRIENTS) sum[k] += it.consumed?.[k] ?? 0;
});

if (!r.totals) errors.push("totals 누락");
else {
  if (!near(r.totals.before_kcal, sumBefore)) errors.push(`totals.before_kcal ${r.totals.before_kcal} ≠ 항목 합 ${sumBefore.toFixed(1)}`);
  if (!isNutrients(r.totals.consumed)) errors.push("totals.consumed 영양소 누락·음수");
  else for (const k of NUTRIENTS)
    if (!near(r.totals.consumed[k], sum[k])) errors.push(`totals.consumed.${k} ${r.totals.consumed[k]} ≠ 항목 합 ${sum[k].toFixed(1)}`);
  if (!anyOverride && r.totals.consumed?.kcal > r.totals.before_kcal + 1) errors.push("섭취 kcal이 제공 kcal보다 크다");
}

for (const w of warns) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(errors.length ? `결과: 실패 (${errors.length}건)` : `결과: 통과 (경고 ${warns.length}건)`);
process.exit(errors.length ? 1 : 0);
