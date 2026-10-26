import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel, type ModelParams } from 'firebase/ai'
import { app } from './firebase' // firebase.ts가 App Check를 먼저 초기화한다(스펙 5절 순서)

// Gemini Developer API 백엔드(Spark 무료 등급). Gemini 키는 코드에 없다.
export const ai = getAI(app, { backend: new GoogleAIBackend() })

/** 설정값 AI_MODEL_ID(스펙 4.2절). env VITE_AI_MODEL, 비어 있으면 gemini-3.5-flash-lite */
export const AI_MODEL_ID: string = import.meta.env.VITE_AI_MODEL || 'gemini-3.5-flash-lite'

/** 모델 인스턴스를 만든다. 프롬프트·응답 스키마·thinking 설정은 web/src/analysis/에서 넘긴다. */
export function getModel(modelId: string = AI_MODEL_ID, params?: Omit<ModelParams, 'model'>): GenerativeModel {
  return getGenerativeModel(ai, { ...params, model: modelId })
}
