// Firebase 연결 설정 (프로젝트: suhyun-house)
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 에 나오는 firebaseConfig 값입니다.
// null로 바꾸면 일정이 이 기기에만 저장됩니다.
//
// 이 값은 공개되어도 괜찮은 값입니다. 실제 보호는 firestore.rules(보안 규칙)와
// 가족 코드(각 기기에만 저장, 리포지토리에 올라가지 않음)가 맡습니다.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCag9VIxtrjFkOiMeiqaM08ZssyNrDqa9Y",
  authDomain: "suhyun-house.firebaseapp.com",
  projectId: "suhyun-house",
  storageBucket: "suhyun-house.firebasestorage.app",
  messagingSenderId: "1076402670686",
  appId: "1:1076402670686:web:6e5454a1dd8a2288e7b8cf",
};
