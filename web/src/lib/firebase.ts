import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// 웹 앱 설정 값은 공개 값이다(_workspace/02_firebase_notes.md).
// Cloud Storage를 쓰지 않으므로 storageBucket은 넣지 않는다.
const firebaseConfig = {
  apiKey: 'AIzaSyA6KZYiJiGbBjX_qJVcLhWn-4b6U3Jk1_s',
  authDomain: 'meal-intake-2026.firebaseapp.com',
  projectId: 'meal-intake-2026',
  messagingSenderId: '686292653830',
  appId: '1:686292653830:web:87f810922b0016e244f087',
}

export const app = initializeApp(firebaseConfig)
// App Check·AI Logic 초기화는 다음 작업에서 이 사이에 넣는다(스펙 5절 초기화 순서).
export const auth = getAuth(app)
export const db = getFirestore(app)

export const usingEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'on'

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
