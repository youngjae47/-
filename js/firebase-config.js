// Firebase 연결 설정
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 에 나오는 firebaseConfig 값을 그대로 붙여넣으세요.
// 비워두면(null) 일정이 이 기기에만 저장됩니다.
//
// 이 값은 공개되어도 괜찮은 값입니다. 실제 보호는 firestore.rules(보안 규칙)와
// 가족 코드(각 기기에만 저장, 리포지토리에 올라가지 않음)가 맡습니다.

const FIREBASE_CONFIG = null;

// 예시:
// const FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "our-family-xxxx.firebaseapp.com",
//   projectId: "our-family-xxxx",
//   storageBucket: "our-family-xxxx.appspot.com",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abcdef",
// };
