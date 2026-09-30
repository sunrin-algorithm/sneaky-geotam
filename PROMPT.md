# SNEAKY GEOTAM — Firebase 프로덕션 백엔드 전환

현재 완성되어 있는 SNEAKY GEOTAM 프로젝트의 백엔드를 **localStorage 기반 개발 구조에서 Firebase 기반 실제 프로덕션 구조로 전환하라.**

이번 작업은 단순히 `localStorage → Firestore`로 저장 위치만 바꾸는 작업이 아니다.

현재 구현된:

- 참가자 identity
- 공통/자율 검사
- participant aggregate
- 전체 LOG
- audit history
- 수정/취소/복구
- 예약 queue
- queue Undo
- 실시간 UI
- 관리자 기능
- 공개 조회

의 의미와 불변식을 그대로 보존하면서 Firebase에 적합한 데이터 구조, 보안 경계, 원자성, 실시간 동기화 구조로 전환해야 한다.

---

# 0. 가장 중요한 작업 원칙

**기존 UI를 재설계하지 않는다.**

이번 작업의 주목적은 BACKEND MIGRATION이다.

현재 정상 동작하는 UI/UX를 가능한 한 그대로 유지한다.

특히 다음 확정 UI 규칙을 절대 회귀시키지 않는다.

```text
/ 메인 페이지
- 관리자 버튼 없음
- 검색 버튼 없음
- 헤더 유지
- 공개 기록 조회

검정/어두운 selected UI
- 반드시 흰색 주요 텍스트

/admin
- 공통/자율 검사 선택 카드의 확대된 높이 유지

LOG 알림
- 고정 badge 아님
- LOG 버튼 주변에서 잠깐 나타났다가 사라지는 notification

participant identity
- participantId 기준
- participantName 기준 병합 금지
```

Firebase 작업을 이유로 UI를 임의로 원상복구하거나 디자인을 변경하지 않는다.

SMS 기능도 추가하지 않는다.

별도 요청이 없는 한 commit/push하지 않는다.

---

# 1. 작업 전 현재 코드 전체 분석

코드를 수정하기 전에 현재 프로젝트를 먼저 분석한다.

특히 다음 파일/구조를 찾는다.

- Firebase initialization
- storage abstraction
- localStorage repository
- Firestore repository
- hooks
- aggregation
- types
- participant model
- inspection/session model
- audit log model
- common questions
- reservations
- queue
- admin auth
- AdminAuthGuard
- `/`
- `/admin`
- `/reserve`
- `/reserve/admin`
- `/log`
- result/detail
- search 관련 내부 코드
- 환경변수
- Firebase 관련 기존 코드
- 기존 테스트

현재 코드에서 이미 정상 구현된 Firebase 코드가 있다면 무조건 다시 작성하지 않는다.

재사용 가능한 부분은 재사용한다.

---

# 2. 작업 전 회귀 기준 확보

Firebase 코드를 수정하기 전에 현재 테스트를 실행한다.

가능한 경우:

```bash
npm run build
```

및 기존 테스트 suite를 실행한다.

현재 PASS 상태를 기록한다.

Firebase 전환 후 동일 기능이 유지되는지 비교한다.

---

# 3. 최종 아키텍처

프로덕션에서는 다음 구조를 목표로 한다.

```text
GitHub Pages / Next.js static frontend
        │
        ├── Firebase Auth
        │
        ├── Firestore realtime READ
        │
        └── Firebase Callable Functions
                 │
                 ▼
           Firebase Admin SDK
                 │
                 ▼
              Firestore
```

역할은 명확하게 나눈다.

## Client

담당:

- UI
- form state
- draft state
- public Firestore listener
- admin Firestore listener
- Firebase Authentication
- Callable Function 호출

## Cloud Functions

담당:

- 신뢰가 필요한 write
- 예약번호/queue sequence 생성
- 검사 완료
- 로그 수정
- 로그 취소
- 로그 복구
- participant rename
- aggregate rebuild
- 예약 queue 처리
- reservation Undo
- audit log 생성
- 여러 문서에 걸친 원자적 작업

## Firestore

담당:

- 영구 데이터
- realtime source
- raw logs
- audit
- derived participant result
- reservations
- questions

---

# 4. localStorage의 역할 변경

프로덕션 데이터의 source of truth에서 localStorage를 제거한다.

다음 데이터를 더 이상 localStorage를 영구 저장소로 사용하지 않는다.

- participants
- inspection logs
- participant results
- audit logs
- common questions
- reservations
- reservation queue

Firestore가 유일한 영구 source of truth가 되어야 한다.

단 localStorage/sessionStorage는 다음처럼 브라우저 전용 임시 상태에는 사용할 수 있다.

```text
작성 중 draft
UI preference
LOG notification UI state
임시 form recovery
```

하지만 localStorage의 값이 Firestore의 실제 데이터를 덮어쓰면 안 된다.

---

# 5. 기존 테스트용 local 데이터

기존 localStorage 테스트 fixture를 프로덕션 Firebase로 자동 migration할 필요는 없다.

기존 테스트 데이터는 개발 데이터로 취급한다.

**실제 Firestore를 기존 테스트 데이터로 오염시키지 않는다.**

필요하면 Firebase Emulator용 seed 데이터로 별도 재사용한다.

---

# 6. Firestore 컬렉션 설계

현재 실제 타입을 분석한 뒤 아래 논리 구조를 기준으로 맞춘다.

```text
participants/
inspectionLogs/
auditLogs/
participantResults/
commonQuestions/
reservations/
publicQueueStats/
admins/
system/
```

불필요한 컬렉션을 억지로 만들지는 않는다.

현재 데이터 모델과 맞춰 최종 설계를 결정한다.

---

# 7. participants

예시:

```text
participants/{participantId}

{
  id,
  displayName,
  createdAt,
  updatedAt
}
```

핵심 identity:

```text
participantId
```

이다.

절대로:

```text
participantName
```

을 identity로 사용하지 않는다.

동명이인은 정상적으로 존재할 수 있다.

---

# 8. participant rename

사용자 이름 수정은:

```text
participantId 유지
displayName 변경
```

이다.

이름 변경 때문에 새로운 participant를 만들지 않는다.

이름 변경 시:

```text
participants
↓
affected aggregate
↓
UI realtime update
```

가 이루어져야 한다.

rename 자체도 audit log에 남긴다.

---

# 9. inspectionLogs

검사의 원본 데이터는 append-oriented raw log로 유지한다.

예시:

```text
inspectionLogs/{inspectionId}

{
  id,
  operationId,

  participantId,
  participantNameSnapshot,

  type: "common" | "custom",

  questions: [...],

  sequence,

  status: "active" | "retracted",

  version,

  createdAt,
  updatedAt
}
```

`createdAt`과 원래 `sequence`는 역사적 검사 순서를 결정한다.

수정/복구 시각 때문에 sequence를 변경하지 않는다.

---

# 10. common question invariant

공통 질문은 participant별로:

```text
sourceQuestionId
```

기준으로 병합한다.

공개 결과에서는 해당 질문에 대해:

**원래 검사 sequence 기준 가장 최근 ACTIVE 결과**

를 사용한다.

과거 검사를 오늘 수정했다고 해서 최신 검사가 되어서는 안 된다.

---

# 11. custom question invariant

자율 질문은:

**모든 ACTIVE 자율 질문을 원래 chronological sequence 순서대로 누적한다.**

같은 질문 텍스트가 반복되어도 제거하지 않는다.

deduplication 금지.

---

# 12. participantResults

공개 페이지에서 raw logs 전체를 매번 다운로드해서 브라우저에서 aggregate하지 않는다.

다음 derived collection을 사용한다.

```text
participantResults/{participantId}
```

예시:

```text
{
  participantId,
  displayName,

  commonQuestions: [...],
  customQuestions: [...],

  totalQuestions,
  truthCount,
  lieCount,
  unknownCount,

  updatedAt
}
```

이 컬렉션은 **derived/materialized view**이다.

원본은:

```text
inspectionLogs
participants
commonQuestions
```

이다.

participantResults가 손상되어도 원본 로그에서 다시 만들 수 있어야 한다.

---

# 13. Pure aggregation function 유지

현재 `aggregation.ts`의 핵심 aggregate 로직을 가능한 한 pure function으로 유지한다.

개념적으로:

```text
raw inspections
+ participant
+ common question config

↓

aggregateParticipant()

↓

ParticipantResult
```

Firebase SDK 호출을 aggregation 함수 내부에 섞지 않는다.

이를 통해:

- 테스트
- participant scoped rebuild
- full rebuild
- emulator validation

이 가능해야 한다.

---

# 14. participant scoped reaggregation

검사 수정 등 일반 작업마다 전체 DB를 재집계하지 않는다.

해당 participant만 재계산한다.

예:

```text
edit inspection
↓
participantId 확인
↓
해당 participant raw logs 조회
↓
aggregateParticipant()
↓
participantResults/{participantId} 갱신
```

participant 연결 자체가 바뀌면:

```text
old participant
+
new participant
```

둘 다 재집계한다.

---

# 15. Full rebuild 기능

관리자용/개발용으로 전체 participantResults를 원본 로그에서 재생성할 수 있는 backend 기능을 제공한다.

개념:

```text
rebuildAllParticipantResults()
```

단 일반 공개 UI에 버튼을 추가하지 않는다.

필요하면 관리자 개발 명령 또는 안전한 admin-only function으로 구현한다.

---

# 16. Audit logs

다음과 같은 변경은 audit log로 남긴다.

```text
inspection.create
inspection.update
inspection.retract
inspection.restore

participant.rename
participant.reassign

reservation.create
reservation.process
reservation.restore
```

예시:

```text
auditLogs/{auditId}

{
  operationId,
  targetType,
  targetId,
  action,

  actorUid,

  before,
  after,

  createdAt
}
```

전화번호 같은 PII를 audit log에 반복 복제하지 않는다.

---

# 17. Audit log 불변성

audit log는 일반 클라이언트에서 직접 수정/삭제할 수 없게 한다.

가능하면 append-only로 만든다.

관리자가 `/log`에서 과거 기록을 수정한다는 의미는:

```text
audit document 수정
```

이 아니라

```text
새로운 update/retract/restore operation 생성
```

이어야 한다.

---

# 18. Firebase Authentication 도입

기존 프런트의:

```text
qwertyno1
```

하드코딩 prompt를 실제 데이터 보안 수단으로 사용하지 않는다.

프로덕션 관리자 권한은:

```text
Firebase Authentication
+
Firestore authorization
```

으로 보호한다.

관리자 로그인에는 Firebase Auth의 Email/Password 방식을 우선 사용한다.

---

# 19. 관리자 권한

단순히:

```text
request.auth != null
```

이면 모든 관리자가 되는 구조를 만들지 않는다.

관리자 UID를 명시적으로 구분한다.

예:

```text
admins/{uid}
```

문서 존재 여부를 통해 admin 여부를 판단할 수 있다.

Security Rules에서 개념적으로:

```text
isAdmin()
```

helper를 사용한다.

admins 컬렉션은 일반 사용자가 생성/수정할 수 없어야 한다.

---

# 20. 관리자 UX

현재 `/admin`, `/reserve/admin`, `/log`의 접근 구조를 가능한 한 유지한다.

단 실제 authorization은 Firebase Auth를 사용한다.

인증되지 않은 사용자가 관리자 URL에 직접 접근하면:

- 관리자 데이터 렌더링 금지
- Firestore admin query 실행 금지
- 로그인 요구

로그인 후:

```text
/admin
/reserve/admin
/log
```

간 이동에서는 Firebase Auth session을 공유한다.

---

# 21. Firestore Security Rules

`allow read, write: if true` 같은 규칙은 절대 사용하지 않는다.

기본 전략:

```text
DENY BY DEFAULT
```

로 한다.

각 컬렉션별 필요한 권한만 허용한다.

---

# 22. participantResults 권한

공개 사용자는 공개 결과만 읽을 수 있다.

클라이언트가 participantResults를 직접 생성/수정/삭제하면 안 된다.

write는 trusted backend/admin operation으로 제한한다.

공개 query와 Security Rules가 서로 호환되게 한다.

Security Rules를 필터처럼 사용하지 않는다.

---

# 23. participants 권한

participant 원본 데이터는 기본적으로 admin 전용으로 한다.

공개 페이지에 필요한 participant 이름은 `participantResults`에 materialize하여 제공한다.

공개 사용자가 전체 participants 컬렉션을 읽을 이유가 없도록 한다.

---

# 24. inspectionLogs 권한

raw 검사 로그는 관리자만 읽을 수 있다.

공개 사용자가 inspectionLogs를 직접 읽으면 안 된다.

write도 trusted backend를 통해 수행한다.

---

# 25. auditLogs 권한

auditLogs:

```text
public read: DENY
public write: DENY

admin read: ALLOW
direct client mutation: 가능하면 DENY
backend append: ALLOW
```

구조로 한다.

---

# 26. commonQuestions 권한

공통 질문 관리:

```text
admin read/write
```

를 기본으로 한다.

공개 페이지에서 필요하다면 participantResults 안의 question snapshot을 사용한다.

공통 질문을 수정해도 기존 `sourceQuestionId`를 유지한다.

순서 변경 역시 ID 변경이 아니다.

---

# 27. reservations 보안

reservations에는 전화번호가 포함되어 있다.

따라서 공개 사용자가:

```text
reservations 전체 조회
```

를 할 수 있으면 안 된다.

절대 다음 구조를 만들지 않는다.

```text
/reserve
↓
reservations collection 전체 read
↓
브라우저에서 자기 것만 filter
```

이는 금지한다.

---

# 28. 예약 생성은 Callable Function

공개 예약 생성은 가능한 한:

```text
createReservation
```

Firebase Callable Function으로 처리한다.

흐름:

```text
/reserve
↓
createReservation()
↓
서버 validation
↓
Firestore transaction
↓
reservation 저장
↓
queue sequence 발급
↓
public queue stats update
↓
응답
```

으로 한다.

---

# 29. 예약번호 동시성

동시에 여러 사람이 예약해도 같은 예약번호/queue sequence가 발급되면 안 된다.

Firestore transaction을 사용한다.

예:

```text
system/reservationCounter
```

에서 현재 sequence를 읽고 증가시키는 방식 등을 사용할 수 있다.

현재 축제 규모에 맞는 단순하고 정확한 방식을 선택한다.

불필요한 distributed counter를 도입하지 않는다.

---

# 30. 예약 생성 validation

서버에서 반드시 검증한다.

현재 실제 form schema를 분석하여:

```text
이름
전화번호
필요한 예약 필드
```

의 길이/형식/필수값을 검증한다.

클라이언트 validation만 믿지 않는다.

---

# 31. public queue stats

공개 `/reserve`에서 대기 인원 같은 정보가 필요하다면 예약 원본을 공개하지 않는다.

별도의:

```text
publicQueueStats/current
```

같은 문서를 사용한다.

예:

```text
{
  waitingCount,
  updatedAt
}
```

이 문서에는:

- 이름
- 전화번호
- 개인 예약정보

를 넣지 않는다.

공개 read 가능, client write 금지.

---

# 32. 예약 관리자

`/reserve/admin`에서는 인증된 admin만 reservations를 읽을 수 있다.

현재 기능 유지:

- waiting 상위 5명
- 전화번호 복사
- queue 처리
- 처리 후 검사
- 5초 Undo

Firestore realtime listener를 사용하여 다른 관리자 기기에서 상태가 변경되어도 즉시 반영되게 한다.

---

# 33. queue query

상위 5명은 Firestore query로 가져온다.

개념:

```text
status == waiting
orderBy(queueSequence)
limit(5)
```

필요한 Firestore index가 있다면 생성한다.

index 설정을 프로젝트에 포함한다.

---

# 34. queue 처리

큐 처리는 물리 DELETE가 아니다.

```text
waiting
→
completed
```

또는 현재 확정 status를 사용한다.

원래:

```text
queueSequence
createdAt
```

를 보존한다.

그래야 restore가 원래 위치로 돌아갈 수 있다.

---

# 35. 예약 Undo

5초 Undo는 UI 기능이다.

실제 backend에서는:

```text
reservation.process
reservation.restore
```

operation으로 처리한다.

5초가 지나도 `/log`에서 장기 복구 가능해야 한다.

restore 시:

**현재 시각 기준 queue 맨 뒤에 추가하지 않는다.**

기존 queueSequence를 그대로 사용한다.

---

# 36. 처리 후 검사

`처리 후 검사`:

```text
reservation process
↓
audit
↓
/admin
↓
검사 participant 준비
```

기능을 유지한다.

예약자의 이름이 기존 participant와 같다고 해서 자동으로 기존 participant에 병합하지 않는다.

participantId 규칙을 유지한다.

---

# 37. Callable Functions

현재 데이터 무결성을 보호하기 위해 다음과 같은 mutation을 backend function으로 이동하는 것을 우선 검토한다.

```text
createReservation

completeInspection

updateInspection
retractInspection
restoreInspection

renameParticipant
reassignInspection

processReservation
restoreReservation

rebuildParticipant
rebuildAllParticipants
```

실제 코드 구조상 일부를 안전한 Firestore admin client transaction으로 통합하는 것이 더 합리적이면 조정 가능하다.

그러나 중요한 원칙은:

**신뢰가 필요한 multi-document write를 브라우저 임의 write에 맡기지 않는다.**

---

# 38. operationId / idempotency

더블클릭이나 네트워크 재시도로 동일 작업이 두 번 저장되지 않게 한다.

mutation에는 가능한 한:

```text
operationId
```

를 사용한다.

같은 operationId가 이미 처리되었다면 duplicate mutation을 생성하지 않는다.

특히:

- 검사 완료
- 예약 생성
- queue 처리
- restore

를 보호한다.

---

# 39. 원자성

다음과 같은 작업은 중간 상태가 생기지 않도록 한다.

예:

```text
검사 저장 성공
audit 저장 실패
aggregate 갱신 실패
```

같은 반쪽짜리 상태를 가능한 한 방지한다.

Firestore transaction 또는 batched write를 적절하게 사용한다.

---

# 40. Server timestamp

신뢰해야 하는 생성/수정 시각은 브라우저의:

```text
Date.now()
```

만 믿지 않는다.

Firestore server timestamp를 사용한다.

단 기존 historical sequence와 restore semantics를 깨지 않는다.

`createdAt`과 `updatedAt`을 명확히 분리한다.

---

# 41. sequence와 updatedAt 분리

절대 다음을 하지 않는다.

```text
수정
→ updatedAt 최신
→ 이것을 최신 검사라고 판단
```

최신 검사 판단은 기존의 원래 검사 sequence를 따른다.

즉:

```text
sequence = 역사적 검사 순서
updatedAt = 마지막 수정 시각
```

이다.

---

# 42. Firestore realtime listener

현재 live hook 구조를 Firestore `onSnapshot` 기반으로 구현한다.

최소:

- participantResults
- commonQuestions
- reservation queue
- audit/log
- 필요한 admin collections

가 실시간으로 반영되게 한다.

listener cleanup을 반드시 구현한다.

---

# 43. 빈 Firestore 상태

이전에 있었던:

```text
if (!items.length) return;
```

같은 패턴을 다시 만들지 않는다.

Firestore 결과가:

```text
[]
```

이면 UI 역시 빈 배열 상태로 업데이트되어야 한다.

Firestore에서 마지막 문서가 삭제/제외되었는데 과거 UI 데이터가 그대로 남는 stale-state 문제를 금지한다.

---

# 44. 공통 질문 초기화 규칙

Firebase 전환 후에도:

**공통 질문은 일반 데이터 초기화로 삭제하지 않는다.**

초기 Firebase에 commonQuestions가 전혀 없을 때만 명시적인 seed 절차를 제공한다.

기존 default question을 매 페이지 로드마다 자동 overwrite하지 않는다.

Firestore의 실제 설정이 존재하면 그것을 source of truth로 사용한다.

---

# 45. App Check

공개 웹에서 callable/backend 남용을 줄이기 위해 Firebase App Check 도입을 준비한다.

Web에서는 현재 Firebase가 권장하는 provider를 검토한다.

처음부터 enforcement를 무작정 켜서 서비스 전체를 차단하지 않는다.

개발/테스트 후 enforcement를 활성화할 수 있도록 구조화한다.

---

# 46. Firebase Emulator Suite

프로덕션 Firestore에서 직접 위험한 테스트를 하지 않는다.

Firebase Emulator Suite를 설정한다.

최소:

```text
Firestore Emulator
Authentication Emulator
Functions Emulator
```

를 테스트에 사용할 수 있게 한다.

---

# 47. Security Rules 자동 테스트

`@firebase/rules-unit-testing` 등을 이용해 Security Rules를 실제로 테스트한다.

반드시 최소 다음을 검증한다.

```text
unauthenticated user
→ public participantResults read ALLOW

unauthenticated user
→ inspectionLogs read DENY

unauthenticated user
→ reservations read DENY

unauthenticated user
→ auditLogs read DENY

unauthenticated user
→ admin write DENY

normal authenticated non-admin
→ admin data DENY

admin
→ 필요한 admin read ALLOW

public
→ participantResults direct write DENY
```

Rules 파일이 존재한다는 이유만으로 PASS 처리하지 않는다.

실제로 emulator에서 permission 결과를 검증한다.

---

# 48. 예약 보안 테스트

특히 다음 공격 시나리오를 테스트한다.

```text
공개 브라우저에서 reservations 전체 query
→ DENY

다른 사람 전화번호 read
→ DENY

reservation status 직접 변경
→ DENY

queueSequence 조작
→ DENY

publicQueueStats 직접 변경
→ DENY
```

정상 `createReservation` callable은 성공해야 한다.

---

# 49. 관리자 보안 테스트

인증되지 않은 사용자가 직접:

```text
/admin
/reserve/admin
/log
```

에 접근한다.

관리자 데이터가 순간적으로라도 렌더링되지 않게 한다.

Firestore admin listener도 인증 전에 시작하지 않는다.

---

# 50. Firebase config

브라우저용 Firebase config와 서버 secret을 구분한다.

Firebase Web config를 서버 비밀키처럼 취급하지 않는다.

반대로:

- Admin SDK credential
- private key
- service account
- server secret

등을 프런트 번들에 넣지 않는다.

`.env.example`도 실제 secret 값을 포함하지 않는다.

---

# 51. Firebase Admin SDK

Admin SDK는 Cloud Functions/backend에서만 사용한다.

클라이언트 코드에:

```text
firebase-admin
```

을 import하지 않는다.

---

# 52. Repository abstraction 정리

기존 repository abstraction이 있다면 최대한 유지한다.

최종 production repository:

```text
FirestoreRepository
```

를 실제 구현으로 사용한다.

UI 컴포넌트가 직접 collection path를 난립시키지 않게 한다.

예:

```text
UI
↓
service/repository
↓
Firebase SDK / Callable
```

구조를 유지한다.

---

# 53. local mode 처리

기존 local mode가 자동 테스트에 유용하다면 삭제하지 않아도 된다.

그러나 명확하게:

```text
local = development/test only
firebase = production
```

으로 구분한다.

production 환경에서 Firebase 오류가 발생했다고 localStorage로 자동 fallback하면 안 된다.

금지:

```text
Firebase write failed
↓
silently save localStorage
```

오류를 명시적으로 처리한다.

---

# 54. 기존 LOG notification 유지

Firebase realtime log가 들어오면 기존 UI 규칙대로:

```text
LOG
→ "{참가자} +1" 초록 notification
→ slide/fade
→ 자동 사라짐
```

을 유지한다.

Firestore listener를 사용한다고 고정 badge 방식으로 되돌리지 않는다.

notification UI와 audit data는 분리한다.

---

# 55. 이름 변경 버그 회귀 방지

Firebase 전환 후에도 `/log`에서 participant rename이 정상 작동해야 한다.

테스트:

```text
participantId = A
displayName = 김철수

rename

displayName = 김철수2
participantId = A
```

그 후:

- main
- detail
- admin participant selector
- log
- aggregate

에 새 이름이 실시간 반영되어야 한다.

동명이인은 계속 분리되어야 한다.

---

# 56. 메인 페이지 보안/구조

`/`에서는 공개 participantResults만 읽는다.

raw logs를 읽어서 클라이언트에서 aggregate하지 않는다.

그리고 다시 강조한다.

메인 헤더에:

```text
관리자 버튼
검색 버튼
```

을 추가하지 않는다.

Firebase 전환 과정에서도 절대 복원하지 않는다.

---

# 57. 기존 UI 회귀 금지

Firebase migration 후 다음을 시각적으로 다시 검사한다.

```text
selected black box
→ white text

/admin 공통/자율 카드
→ 확대된 높이 유지

final confirmation
→ 사용자 답변/거탐 판별 정렬 유지

common/custom
→ 회색 톤 구분 유지

LOG
→ 일시적 notification 유지
```

Backend 작업이므로 필요 없는 CSS 수정은 하지 않는다.

---

# 58. Firestore indexes

실제 query를 분석해서 필요한 composite index를 정의한다.

예:

```text
reservations
status == waiting
orderBy(queueSequence)
```

등.

`firestore.indexes.json`에 필요한 index를 관리한다.

Emulator가 index를 강제하지 않는다고 해서 production index 검증을 생략하지 않는다.

---

# 59. Firebase 설정 파일

필요에 따라 다음을 프로젝트에 정리한다.

```text
firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
functions/
```

기존 파일이 있다면 덮어쓰기 전에 내용을 확인한다.

---

# 60. Firebase agent tooling

현재 Antigravity 환경에서 Firebase 공식 agent skill/tooling을 사용할 수 있다면 먼저 확인하고 활용한다.

단 agent tool이 자동으로 production Firebase에 위험한 변경을 배포하도록 두지 않는다.

먼저 local/emulator에서 검증한다.

---

# 61. Production deploy 금지 조건

다음 중 하나라도 만족하지 못하면 production rules/functions 배포를 진행하지 않는다.

```text
build FAIL
rules tests FAIL
emulator integration FAIL
security invariant FAIL
required Firebase config missing
```

문제를 보고하고 중단한다.

보안을 낮춰서 억지로 성공시키지 않는다.

---

# 62. Cloud Functions 비용/프로젝트 상태

Cloud Functions production deployment에 필요한 Firebase project plan/configuration을 먼저 확인한다.

현재 프로젝트가 Functions production deploy 조건을 충족하지 못한다면:

**임의로 요금제 변경을 시도하지 않는다.**

필요한 사용자 작업을 정확히 보고한다.

---

# 63. Emulator 종합 시뮬레이션

이전에 수행한 전체 SNEAKY GEOTAM 테스트 시나리오를 Firebase Emulator 기반으로 다시 수행한다.

최소 다음 전체 흐름을 실제 Firebase backend 기준으로 검증한다.

```text
공개 페이지 접속

↓

예약 생성

↓

Firestore reservation 저장

↓

queue 상위 5명 realtime 반영

↓

관리자 로그인

↓

queue 처리

↓

5초 Undo

↓

다시 처리

↓

처리 후 검사

↓

공통 검사

↓

같은 참가자로 자율 검사

↓

검사 완료

↓

inspectionLogs 생성

↓

auditLogs 생성

↓

participantResults 재집계

↓

메인 공개 결과 realtime 반영

↓

/log에서 과거 기록 수정

↓

participantResults 재계산

↓

retract

↓

이전 결과 fallback

↓

restore

↓

원래 sequence 기준 결과 복원
```

---

# 64. 동시 예약 테스트

최소 여러 개의 예약 요청을 거의 동시에 실행한다.

검증:

```text
중복 reservation number 없음
중복 queueSequence 없음
누락 없음
순서 일관성
```

transaction conflict가 발생해도 안전하게 retry되거나 사용자에게 명확한 오류를 반환해야 한다.

---

# 65. 동시 관리자 작업

가능하면 두 admin client를 가정하여 같은 reservation 또는 inspection을 동시에 변경하는 상황을 테스트한다.

silent overwrite로 데이터가 손상되지 않게 한다.

필요하면 version 필드 또는 transaction precondition을 사용한다.

---

# 66. 전체 재집계 검증

Firestore raw logs를 기준으로 모든 participantResults를 다시 생성한다.

재생성 전/후 결과를 비교한다.

동일해야 한다.

특히:

```text
동명이인
과거 로그 수정
retract
restore
common latest sequence
custom accumulation
rename
```

을 포함한다.

---

# 67. Firebase 전환 완료 조건

다음이 모두 만족되어야 Firebase 전환 완료로 판단한다.

```text
Firestore = production source of truth

localStorage = durable production DB 아님

Firebase Auth 적용

Security Rules 검증 완료

PII reservation public read 차단

raw inspection public read 차단

audit public read 차단

participantResults public read 정상

reservation callable 정상

queue realtime 정상

inspection mutation 정상

participant aggregate 정상

LOG 정상

rename 정상

retract/restore 정상

동명이인 정상

double submit 방지

Emulator test PASS

npm run build PASS
```

---

# 68. 최종 Production Smoke Test 계획

Emulator가 모두 PASS한 뒤 production Firebase 연결 상태에서 최소 smoke test 계획을 작성한다.

Emulator와 production Firestore는 완전히 동일하다고 가정하지 않는다.

특히:

- indexes
- real auth
- real security rules
- real function deployment
- realtime listener

를 확인할 계획을 제시한다.

사용자 승인 없이 production test data를 대량 생성하지 않는다.

---

# 69. 최종 보고서

작업이 끝나면 다음 내용을 보고한다.

## Architecture

변경 전:

```text
UI
→ localStorage
```

변경 후 실제 구조를 표시한다.

## Firestore schema

실제로 생성한 collections와 핵심 fields.

## Authentication

관리자 인증 방식과 authorization 방식.

## Security Rules

각 collection의:

```text
public read
public write
admin read
admin write
backend write
```

권한 요약.

## Cloud Functions

실제로 구현한 function 목록과 역할.

## Transactions

transaction/batch가 사용되는 작업.

## Realtime

onSnapshot/listener를 사용하는 기능.

## Migration

기존 localStorage 코드 중:

- 제거
- 유지
- test-only 전환

된 부분.

## Tests

실제로 수행한:

- unit
- rules
- emulator
- integration
- build

결과.

## Security

실제로 확인한 denied access 시나리오.

## Remaining Setup

사용자가 Firebase Console에서 직접 해야 하는 설정이 있다면 정확히 적는다.

예:

```text
Authentication provider 활성화
admin 계정 생성
admin UID 등록
App Check 설정
Firebase plan 확인
functions deploy
rules deploy
indexes deploy
```

실제로 필요한 것만 보고한다.

---

# 70. 절대 금지

다음 방식으로 작업을 쉽게 끝내지 않는다.

```text
allow read, write: if true
```

금지.

```text
Firebase 실패 → localStorage 자동 fallback
```

금지.

```text
전화번호 포함 reservations public read
```

금지.

```text
qwertyno1 client prompt = 실제 DB authorization
```

금지.

```text
participantName으로 participant grouping
```

금지.

```text
수정 시각으로 common 최신 결과 판단
```

금지.

```text
retract 시 원본 물리 삭제
```

금지.

```text
restore 시 queue 맨 뒤로 이동
```

금지.

```text
Firestore에 테스트 fixture 자동 업로드
```

금지.

```text
Firebase migration 명목으로 UI 재설계
```

금지.

```text
메인에 관리자 버튼 재추가
```

금지.

```text
메인에 검색 버튼 재추가
```

금지.

```text
검정 selected 박스 + 검정 글씨
```

금지.

```text
SMS API 추가
```

금지.

---

# 71. 실행 순서

반드시 다음 순서로 진행한다.

```text
1. 현재 코드 분석
2. 현재 build/test baseline 확보
3. Firebase schema 설계
4. Auth 설계
5. Security Rules 작성
6. Emulator 설정
7. Firestore repository 구현
8. Callable Functions 구현
9. realtime listener 연결
10. localStorage production dependency 제거
11. Rules unit test
12. Firebase integration test
13. 전체 축제 시뮬레이션
14. aggregate integrity 검증
15. UI regression 확인
16. npm run build
17. 최종 보고
```

작업 도중 실제 Firebase credential/configuration 또는 사용자 작업이 반드시 필요한 지점에 도달하면 임의의 값을 만들지 않는다.

그 시점까지 안전하게 완료할 수 있는 작업을 끝낸 뒤, 사용자에게 필요한 값을 정확하게 요청한다.

**보안 규칙을 낮추거나 임시 공개 DB로 만들어 진행하지 않는다.**

별도 요청이 없는 한 commit 또는 push하지 않는다.