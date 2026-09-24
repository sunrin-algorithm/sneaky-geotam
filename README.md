# LIE DETECTOR — Festival

학교 축제에서 실제 거짓말탐지기로 측정한 결과를 공개적으로 박제하고 공유하기 위한 Next.js MVP입니다.

## 페이지

- `/` : 공개된 박제 목록
- `/result/[id]` : 개별 박제 결과 + 공유
- `/record` : 운영자용 측정 결과 입력
- `/search` : 닉네임/검사 번호 검색
- `/admin` : 질문 및 박제 관리

## 실행

```bash
npm install
npm run dev
```

## Firebase (Firestore) 연동

현재 localStorage 기반이지만 Firebase가 구성되어 있으면 Firestore가 정답 소스가 되고, localStorage는 캐시로 유지되며 실시간(onSnapshot)으로 여러 기기 간 동기화됩니다. Firebase 없이도 localStorage로 그대로 동작합니다.

1. `.env.example`을 `.env.local`로 복사하고 Firebase 프로젝트의 설정값을 채웁니다.
2. Firestore 콜렉션 `questions` / `records`를 생성합니다.
3. 콘솔에서 Firestore에 인증 없이 접근하는 규칙을 설정합니다 (축제 운영 환경):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

웹에서 거짓말 여부를 판단하지 않고, 실제 기기 측정 결과를 운영자가 기록합니다.
