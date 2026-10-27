#!/usr/bin/env node
// 섭취 분석 결과(MealIntakeAnalysis v2)의 필수 필드·범위·출처별 필드·계산 일관성·사진 키를 검사한다.
// 사용법: node validate_analysis.mjs <result.json> [more.json ...]   (종료 코드 0=모두 통과, 1=실패 있음, 2=사용법 오류)
// 앱 안의 같은 규칙: web/src/analysis/validate.ts (checkAnalysis). 규칙을 바꾸면 두 파일을 같이 바꾼다. 외부 의존성 없음.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TOL = 0.02; // 허용 오차 2% 또는 1
const LOW_CONF = 0.6;
const NUTRIENTS = ["kcal", "carbs_g", "protein_g", "fat_g"];
const SOURCES = ["db", "search", "ai_estimate", "user_input"];
const DB_MATCHES = ["name", "group", "partial"];
const REF_MATCHES = ["group", "partial"];
const FILL_KEYS = ["carbs_g", "fat_g"];
const FILL_VALUES = ["ai_estimate", "missing"];
const PHOTO_KEY = /photo|image|thumb|base64|url/i;
const PHOTO_VALUE = /^data:image\//i;
const TOP_KEYS = new Set(["items", "totals", "warnings", "model", "prompt_version"]);
const REQUIRED = ["id", "name", "db_food_code", "eaters", "before_grams", "remaining_ratio", "consumed_grams",
  "per_100g", "nutrition_source", "consumed", "kcal_overridden", "confidence", "needs_review"];
const ITEM_KEYS = new Set([...REQUIRED, "location", "db_name", "db_match", "db_ml_converted", "db_reference",
  "per_100g_fill", "user_edited", "grams_source", "published_g", "unit_count", "ratio_assumed"]);
const REF_KEYS = new Set(["db_food_code", "db_name", "db_match", "kcal_per_100g", "ml_converted"]);

export function checkAnalysis(r) {
  const errors = [];
  const warns = [];
  const isObj = (o) => o !== null && typeof o === "object" && !Array.isArray(o);
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const near = (a, b) => isNum(a) && Math.abs(a - b) <= Math.max(1, Math.abs(b) * TOL);
  const inRange = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
  const isNutrients = (o) => isObj(o) && NUTRIENTS.every((k) => isNum(o[k]) && o[k] >= 0);
  const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";

  if (!isObj(r)) return { errors: ["결과가 객체가 아니다"], warnings: [] };

  // 사진은 저장하지 않는다: 사진처럼 보이는 키나 data:image 값이 있으면 실패
  const scan = (o, at) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (PHOTO_KEY.test(k)) errors.push(`${at}${k}: 사진 관련 필드는 저장하지 않는다`);
      if (typeof v === "string" && PHOTO_VALUE.test(v)) errors.push(`${at}${k}: 사진 데이터(data:image)는 저장하지 않는다`);
      scan(v, `${at}${k}.`);
    }
  };
  scan(r, "");

  for (const k of Object.keys(r)) if (!TOP_KEYS.has(k)) errors.push(`${k}: 스키마에 없는 최상위 필드`);
  if (!Array.isArray(r.items)) errors.push("items 배열이 없다");
  if (!Array.isArray(r.warnings) || !r.warnings.every((w) => typeof w === "string"))
    errors.push("warnings는 문자열 배열이어야 한다");

  const sum = { kcal: 0, carbs_g: 0, protein_g: 0, fat_g: 0 };
  let sumBefore = 0;
  let anyOverride = false;
  const ids = new Set();

  (Array.isArray(r.items) ? r.items : []).forEach((it, i) => {
    if (!isObj(it)) {
      errors.push(`items[${i}]: 객체가 아니다`);
      return;
    }
    const tag = `items[${i}](${it.name ?? "?"})`;
    const src = it.nutrition_source;
    for (const k of REQUIRED) if (!(k in it)) errors.push(`${tag}: ${k} 누락`);
    for (const k of Object.keys(it)) if (!ITEM_KEYS.has(k)) errors.push(`${tag}: ${k}는 스키마에 없는 필드`);
    if (!nonEmpty(it.id)) errors.push(`${tag}: id가 비었다`);
    if (ids.has(it.id)) errors.push(`${tag}: id 중복`);
    ids.add(it.id);
    if (typeof it.name !== "string") errors.push(`${tag}: name은 문자열이어야 한다`);
    if ("location" in it && typeof it.location !== "string") errors.push(`${tag}: location은 문자열이어야 한다`);
    if ("user_edited" in it && typeof it.user_edited !== "boolean") errors.push(`${tag}: user_edited는 boolean이어야 한다`);
    if (typeof it.kcal_overridden !== "boolean") errors.push(`${tag}: kcal_overridden은 boolean이어야 한다`);
    if (typeof it.needs_review !== "boolean") errors.push(`${tag}: needs_review는 boolean이어야 한다`);
    if (!inRange(it.confidence, 0, 1)) errors.push(`${tag}: confidence 범위(0~1) 벗어남`);
    const eatersOk = Number.isInteger(it.eaters) && it.eaters >= 1 && it.eaters <= 20;
    if (!eatersOk) errors.push(`${tag}: eaters는 1~20 정수여야 한다`);
    if (!inRange(it.before_grams, 0, Infinity)) errors.push(`${tag}: before_grams 음수 또는 누락`);
    if (!SOURCES.includes(src)) errors.push(`${tag}: nutrition_source 값 오류`);

    // 출처별 필드(v2): db_* 와 per_100g_fill·db_ml_converted는 db일 때만, db_reference는 ai_estimate일 때만
    if (src === "db") {
      if (!nonEmpty(it.db_food_code)) errors.push(`${tag}: 출처 db인데 db_food_code 없음`);
    } else {
      if (it.db_food_code !== null && "db_food_code" in it) errors.push(`${tag}: 출처 ${src}인데 db_food_code가 null이 아니다`);
      if (it.db_name !== undefined && it.db_name !== null) errors.push(`${tag}: db_name은 출처 db일 때만 넣는다`);
      if ("db_match" in it) errors.push(`${tag}: db_match는 출처 db일 때만 넣는다`);
    }
    if (it.db_name !== undefined && it.db_name !== null && typeof it.db_name !== "string")
      errors.push(`${tag}: db_name은 문자열 또는 null이어야 한다`);
    if ("db_match" in it) {
      if (!DB_MATCHES.includes(it.db_match)) errors.push(`${tag}: db_match 값 오류`);
      if (!nonEmpty(it.db_name)) errors.push(`${tag}: db_match가 있는데 db_name이 비었다`);
    }
    if ("db_ml_converted" in it) {
      if (src !== "db") errors.push(`${tag}: db_ml_converted는 출처 db일 때만 넣는다`);
      if (it.db_ml_converted !== true) errors.push(`${tag}: db_ml_converted는 true일 때만 넣는다`);
    }
    if ("per_100g_fill" in it) {
      if (src !== "db") errors.push(`${tag}: per_100g_fill은 출처 db일 때만 넣는다`);
      const f = it.per_100g_fill;
      if (!isObj(f)) errors.push(`${tag}: per_100g_fill은 객체여야 한다`);
      else
        for (const [k, v] of Object.entries(f)) {
          if (!FILL_KEYS.includes(k)) errors.push(`${tag}: per_100g_fill.${k}는 허용되지 않는 키`);
          else if (!FILL_VALUES.includes(v)) errors.push(`${tag}: per_100g_fill.${k} 값 오류`);
          else if (v === "missing") {
            if (it.per_100g?.[k] !== 0) errors.push(`${tag}: per_100g_fill.${k}=missing인데 per_100g.${k}가 0이 아니다`);
            if (it.consumed?.[k] !== 0) errors.push(`${tag}: per_100g_fill.${k}=missing인데 consumed.${k}가 0이 아니다`);
          }
        }
    }
    if ("db_reference" in it) {
      if (src !== "ai_estimate") errors.push(`${tag}: db_reference는 출처 ai_estimate일 때만 넣는다`);
      const ref = it.db_reference;
      if (!isObj(ref)) errors.push(`${tag}: db_reference는 객체여야 한다`);
      else {
        for (const k of Object.keys(ref)) if (!REF_KEYS.has(k)) errors.push(`${tag}: db_reference.${k}는 스키마에 없는 필드`);
        if (!nonEmpty(ref.db_food_code)) errors.push(`${tag}: db_reference.db_food_code가 비었다`);
        if (!nonEmpty(ref.db_name)) errors.push(`${tag}: db_reference.db_name이 비었다`);
        if (!REF_MATCHES.includes(ref.db_match)) errors.push(`${tag}: db_reference.db_match는 group 또는 partial`);
        if (!inRange(ref.kcal_per_100g, 0, 900)) errors.push(`${tag}: db_reference.kcal_per_100g 범위(0~900) 벗어남`);
        if ("ml_converted" in ref && typeof ref.ml_converted !== "boolean") errors.push(`${tag}: db_reference.ml_converted는 boolean`);
      }
    }

    // 공개 중량(스펙 4.5.5): grams_source·published_g·unit_count는 함께 있거나 함께 없다. published면 before_grams ≈ published_g × unit_count(±1g)
    const pubKeys = ['grams_source', 'published_g', 'unit_count'].filter((k) => k in it);
    if (pubKeys.length > 0 && pubKeys.length < 3) errors.push(`${tag}: grams_source·published_g·unit_count는 함께 넣는다(있는 것: ${pubKeys.join(', ')})`);
    if (pubKeys.length === 3) {
      const pw = it.published_g;
      const uc = it.unit_count;
      const pwOk = typeof pw === 'number' && Number.isFinite(pw) && pw > 0;
      if (it.grams_source !== 'published') errors.push(`${tag}: grams_source는 "published"만 허용`);
      if (!pwOk) errors.push(`${tag}: published_g는 0보다 큰 수`);
      if (!(Number.isInteger(uc) && uc >= 1 && uc <= 10)) errors.push(`${tag}: unit_count는 정수 1~10`);
      else if (pwOk && typeof it.before_grams === 'number' && Math.abs(it.before_grams - pw * uc) > 1)
        errors.push(`${tag}: before_grams(${it.before_grams})가 published_g × unit_count(${pw * uc})와 1g 넘게 다르다`);
    }

    const consumedOk = isNutrients(it.consumed);
    if (!consumedOk) errors.push(`${tag}: consumed 영양소 누락·음수`);
    let perOk = false;
    if (it.per_100g === null) {
      if (src !== "user_input") errors.push(`${tag}: per_100g=null은 user_input일 때만 허용`);
      if (it.kcal_overridden !== true) errors.push(`${tag}: per_100g=null인데 kcal_overridden=false`);
      if (consumedOk && (it.consumed.carbs_g !== 0 || it.consumed.protein_g !== 0 || it.consumed.fat_g !== 0))
        errors.push(`${tag}: 직접 입력 항목의 탄·단·지는 0이어야 한다`);
    } else if (!isNutrients(it.per_100g)) {
      errors.push(`${tag}: per_100g 영양소 누락·음수`);
    } else {
      perOk = true;
      if (src === "user_input") errors.push(`${tag}: 출처 user_input인데 per_100g가 null이 아니다`);
      if (it.per_100g.kcal > 900) errors.push(`${tag}: per_100g.kcal ${it.per_100g.kcal} > 900`);
      const macro = it.per_100g.carbs_g + it.per_100g.protein_g + it.per_100g.fat_g;
      if (macro > 100) errors.push(`${tag}: 100g당 탄+단+지 ${macro.toFixed(1)}g > 100g`);
    }
    if (it.kcal_overridden === true) anyOverride = true;

    // 섭취 중량 = 중량 × (1 − 남긴 비율) ÷ 인원수. 남긴 비율 null은 0으로 계산하고 needs_review=true
    if (it.remaining_ratio === null) {
      if (it.needs_review !== true) errors.push(`${tag}: 매칭 실패(remaining_ratio=null)인데 needs_review=false`);
    } else if (!inRange(it.remaining_ratio, 0, 1)) {
      errors.push(`${tag}: remaining_ratio 범위(0~1) 벗어남`);
    }
    // b3(2026-10-27): ratio_assumed는 not_visible(그릇이 안 보여 다 먹음으로 둠)만, remaining_ratio=0일 때만
    if ('ratio_assumed' in it) {
      if (it.ratio_assumed !== 'not_visible') errors.push(`${tag}: ratio_assumed는 not_visible만 허용(지금 ${String(it.ratio_assumed)})`);
      else if (it.remaining_ratio !== 0) errors.push(`${tag}: ratio_assumed(not_visible)는 remaining_ratio=0일 때만 넣는다(지금 ${String(it.remaining_ratio)})`);
    }
    const ratio = inRange(it.remaining_ratio, 0, 1) ? it.remaining_ratio : 0;
    if (eatersOk && isNum(it.before_grams)) {
      const expGrams = (it.before_grams * (1 - ratio)) / it.eaters;
      if (!near(it.consumed_grams, expGrams))
        errors.push(`${tag}: consumed_grams ${it.consumed_grams} ≠ 중량×(1−남긴 비율)÷인원수 ${expGrams.toFixed(1)}`);
    }

    // 섭취 값 = 100g당 값 × consumed_grams ÷ 100 (칼로리를 직접 고친 항목은 kcal 검사 제외)
    if (perOk && consumedOk && isNum(it.consumed_grams)) {
      for (const k of NUTRIENTS) {
        if (k === "kcal" && it.kcal_overridden === true) continue;
        const exp = (it.per_100g[k] * it.consumed_grams) / 100;
        if (!near(it.consumed[k], exp)) errors.push(`${tag}: consumed.${k} ${it.consumed[k]} ≠ 계산값 ${exp.toFixed(1)}`);
      }
    }
    if (isNum(it.confidence) && it.confidence < LOW_CONF && it.needs_review !== true)
      errors.push(`${tag}: confidence<${LOW_CONF}인데 needs_review=false`);
    if (it.needs_review === true) warns.push(`${tag}: 확인 필요 항목`);

    sumBefore += ((isNum(it.before_grams) ? it.before_grams : 0) * (isNum(it.per_100g?.kcal) ? it.per_100g.kcal : 0)) / 100;
    for (const k of NUTRIENTS) sum[k] += isNum(it.consumed?.[k]) ? it.consumed[k] : 0;
  });

  if (!isObj(r.totals)) errors.push("totals 누락");
  else {
    if (!near(r.totals.before_kcal, sumBefore)) errors.push(`totals.before_kcal ${r.totals.before_kcal} ≠ 항목 합 ${sumBefore.toFixed(1)}`);
    if (!isNutrients(r.totals.consumed)) errors.push("totals.consumed 영양소 누락·음수");
    else
      for (const k of NUTRIENTS)
        if (!near(r.totals.consumed[k], sum[k])) errors.push(`totals.consumed.${k} ${r.totals.consumed[k]} ≠ 항목 합 ${sum[k].toFixed(1)}`);
    if (!anyOverride && isNum(r.totals.consumed?.kcal) && r.totals.consumed.kcal > r.totals.before_kcal + 1)
      errors.push("섭취 kcal이 제공 kcal보다 크다");
  }
  if ("model" in r && typeof r.model !== "string") errors.push("model은 문자열이어야 한다");
  if ("prompt_version" in r && typeof r.prompt_version !== "string") errors.push("prompt_version은 문자열이어야 한다");
  return { errors, warnings: warns };
}

// CLI (import해서 checkAnalysis만 쓸 때는 실행하지 않는다)
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("usage: node validate_analysis.mjs <result.json> [more.json ...]");
    process.exit(2);
  }
  let failed = 0;
  for (const p of paths) {
    let r;
    try {
      r = JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      console.log(`== ${p}\nFAIL  JSON을 읽지 못했다: ${e.message}`);
      failed++;
      continue;
    }
    const { errors, warnings } = checkAnalysis(r);
    console.log(`== ${p}`);
    for (const w of warnings) console.log(`WARN  ${w}`);
    for (const e of errors) console.log(`FAIL  ${e}`);
    console.log(errors.length ? `결과: 실패 (${errors.length}건)` : `결과: 통과 (경고 ${warnings.length}건)`);
    if (errors.length) failed++;
  }
  process.exit(failed ? 1 : 0);
}
