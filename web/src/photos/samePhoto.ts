// 먹은 후 사진이 먹기 전 사진과 같은지 확인한다(압축본끼리 SHA-256 비교).
// 같으면 화면이 "먹기 전과 같은 사진이에요"를 띄우고, 사용자가 [그대로 분석]을 고르기 전에는 분석을 호출하지 않는다.
import { sha256Hex } from '../analysis/cache'

/** 두 압축본의 바이트가 같으면 true. 크기가 다르면 바로 false, 해시를 못 구하면(비보안 컨텍스트 등) false. */
export async function isSamePhoto(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false
  try {
    const [ha, hb] = await Promise.all([a.arrayBuffer().then(sha256Hex), b.arrayBuffer().then(sha256Hex)])
    return ha !== null && hb !== null && ha === hb
  } catch {
    return false
  }
}
