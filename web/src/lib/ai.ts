import { getAI, getGenerativeModel, GoogleAIBackend, type GenerativeModel } from 'firebase/ai'
import { app } from './firebase' // firebase.ts가 App Check를 먼저 초기화한다(스펙 5절 순서)

// Gemini Developer API 백엔드(Spark 무료 등급). Gemini 키는 코드에 없다.
export const ai = getAI(app, { backend: new GoogleAIBackend() })

/** 모델 인스턴스만 만든다. 프롬프트·응답 스키마는 web/src/analysis/에서 정한다. */
export function getModel(modelId: string = import.meta.env.VITE_AI_MODEL ?? 'gemini-3.5-flash-lite'): GenerativeModel {
  return getGenerativeModel(ai, { model: modelId })
}
