# LIE DETECTOR — Festival

학교 축제에서 실제 거짓말탐지기로 측정한 결과를 공개적으로 박제하고 공유하기 위한 Next.js MVP입니다.

## 페이지

- `/` : 공개된 박제 목록
- `/result/[id]` : 개별 박제 결과 + 공유
- `/search` : 닉네임/검사 번호 검색
- `/admin` : 운영자용 결과 입력 + 질문 및 박제 관리

## 실행

### 예약 화면

- `/reserve`: 대기 현황 → 섹션 선택 → 예약 폼. 부스 안내는 임시 Lorem ipsum입니다.
- `/reserve/admin`: 예약 관리 화면. 섹션·상태 필터와 이름/학번/번호 검색, 예시 예약의 호출·완료·취소·복원을 확인할 수 있습니다. 예시 변경은 저장되지 않습니다.
- 관리자 인증 및 실제 예약 데이터 연결은 아직 구현하지 않았습니다.
- 현재는 UI 미리보기입니다. 대기 현황은 미연결이며 예약 접수 및 개인정보 저장·전송은 하지 않습니다.
- 실제 운영 전 예약 저장, 대기열 조회, 운영자 호출/취소 기능을 연결해야 합니다.
- `npm run build:pages`: 예약 화면만 `.pages-preview/out`에 정적 출력합니다. 기존 동적 결과 페이지는 이 미리보기에서 제외됩니다.
- `feat/reserve` 브랜치에 푸시하면 GitHub Actions가 Pages에 배포합니다. 저장소 Pages 소스를 GitHub Actions로 설정해야 합니다.
- Pages 미리보기 주소: `https://sunrin-algorithm.github.io/sneaky-geotam/reserve/`
- Vercel의 기본 서비스 `/reserve` 반영은 해당 브랜치를 프로덕션에 배포한 뒤 가능합니다.

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
