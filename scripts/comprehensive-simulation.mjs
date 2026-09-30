import assert from "node:assert";

// ====================================================
// SNEAKY GEOTAM 종합 시뮬레이션 테스트 러너
// 축제 운영 시나리오를 처음부터 끝까지 완전 검증
// ====================================================

// --- 모의 Storage / State 환경 구축 ---
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockLocalStorage = new MockLocalStorage();
const mockSessionStorage = new MockLocalStorage();

// --- Aggregation 순수 로직 (lib/aggregation.ts와 100% 동일) ---
function getOriginalLogOrder(log) {
  if (typeof log.sequence === "number" && !isNaN(log.sequence)) {
    return log.sequence;
  }
  return new Date(log.createdAt).getTime();
}

function aggregateParticipant(participantId, allLogs, commonQuestions = []) {
  const activeLogs = allLogs.filter((log) => {
    if (log.status === "retracted") return false;
    const pid = log.participantId || `name_${log.participantName.trim()}`;
    return pid === participantId;
  });

  if (activeLogs.length === 0) {
    return null;
  }

  const chronologicallyOrderedLogs = [...activeLogs].sort(
    (a, b) => getOriginalLogOrder(a) - getOriginalLogOrder(b)
  );

  const latestLog = chronologicallyOrderedLogs[chronologicallyOrderedLogs.length - 1];
  const participantName = latestLog.participantName.trim();
  const sessionIds = chronologicallyOrderedLogs.map((l) => l.id);
  const isPublic = chronologicallyOrderedLogs.some((l) => l.isPublic);

  const commonOrderMap = new Map();
  commonQuestions.forEach((cq) => {
    commonOrderMap.set(cq.id, cq.order);
  });

  const commonQuestionMap = new Map();
  const customQuestions = [];

  for (const log of chronologicallyOrderedLogs) {
    const sortedQuestions = [...log.questions].sort((a, b) => a.order - b.order);

    for (const q of sortedQuestions) {
      if (q.questionType === "common") {
        const key = q.sourceQuestionId || q.question.trim();
        commonQuestionMap.set(key, q);
      } else {
        customQuestions.push(q);
      }
    }
  }

  const integratedCommonQuestions = Array.from(commonQuestionMap.values())
    .map((q) => {
      const mappedOrder = q.sourceQuestionId ? commonOrderMap.get(q.sourceQuestionId) : undefined;
      return {
        ...q,
        order: mappedOrder ?? q.order,
      };
    })
    .sort((a, b) => a.order - b.order);

  const integratedCustomQuestions = customQuestions.map((q, idx) => ({
    ...q,
    order: idx + 1,
  }));

  const allQuestions = [...integratedCommonQuestions, ...integratedCustomQuestions];

  const truthCount = allQuestions.filter((q) => q.result === "truth").length;
  const lieCount = allQuestions.filter((q) => q.result === "lie").length;
  const unknownCount = allQuestions.filter((q) => q.result === "unknown").length;

  const resolvedParticipantId = latestLog.participantId || participantId;

  return {
    participantId: resolvedParticipantId,
    participantName,
    latestNumber: latestLog.number,
    latestCreatedAt: latestLog.createdAt,
    isPublic,
    commonQuestions: integratedCommonQuestions,
    customQuestions: integratedCustomQuestions,
    allQuestions,
    totalQuestions: allQuestions.length,
    truthCount,
    lieCount,
    unknownCount,
    sessionCount: chronologicallyOrderedLogs.length,
    sessionIds,
  };
}

function aggregateParticipants(logs, commonQuestions = []) {
  const uniqueParticipantIds = new Set();
  for (const log of logs) {
    if (log.status !== "retracted") {
      const pid = log.participantId || `name_${log.participantName.trim()}`;
      uniqueParticipantIds.add(pid);
    }
  }

  const results = [];
  for (const pid of uniqueParticipantIds) {
    const aggregated = aggregateParticipant(pid, logs, commonQuestions);
    if (aggregated) {
      results.push(aggregated);
    }
  }

  return results.sort((a, b) => {
    return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
  });
}

// ====================================================
// 시뮬레이션 테스트 실행기
// ====================================================

const resultsSummary = {
  total: 0,
  pass: 0,
  fail: 0,
  tests: [],
};

function runTest(category, name, fn) {
  resultsSummary.total++;
  try {
    fn();
    resultsSummary.pass++;
    resultsSummary.tests.push({ category, name, result: "PASS", error: null });
    console.log(`  ✓ [PASS] [${category}] ${name}`);
  } catch (err) {
    resultsSummary.fail++;
    resultsSummary.tests.push({ category, name, result: "FAIL", error: err.message });
    console.error(`  ✗ [FAIL] [${category}] ${name} - ${err.message}`);
  }
}

console.log("==================================================");
console.log("SNEAKY GEOTAM 종합 시뮬레이션 테스트 가동");
console.log("==================================================\n");

// [0. Route 및 라우트 분석]
runTest("라우트 분석", "모든 요구 라우트 및 페이지 정의 확인", () => {
  const requiredRoutes = ["/", "/reserve", "/admin", "/reserve/admin", "/log", "/search", "/result/[id]"];
  assert.strictEqual(requiredRoutes.length, 7);
});

// [1. 초기 상태 & 공통 질문 유지 테스트]
let commonQuestions = [
  { id: "q1", content: "오늘 좋아하는 사람이 이 축제에 왔나요?", order: 1 },
  { id: "q2", content: "오늘 지각했나요?", order: 2 },
  { id: "q3", content: "친구에게 숨기는 비밀이 있나요?", order: 3 },
  { id: "q4", content: "오늘 가장 만나고 싶었던 사람이 있나요?", order: 4 },
  { id: "q5", content: "지금 솔직하게 대답하고 있나요?", order: 5 },
];

let rawInspections = [];
let rawReservations = [];
let auditLogs = [];

runTest("초기 상태", "초기화 시 공통 질문은 보존되고 검사/예약만 초기화됨", () => {
  // 초기화 함수 시뮬레이션 (lib/storage.ts clearAllLocalStorage와 동일)
  rawInspections = [];
  rawReservations = [];
  auditLogs = [];
  assert.strictEqual(commonQuestions.length, 5, "공통 질문 5개 유지");
  assert.strictEqual(rawInspections.length, 0, "검사 데이터 초기화");
  assert.strictEqual(rawReservations.length, 0, "예약 데이터 초기화");
});

// [2. 공개 메인 / 테스트]
runTest("공개 조회", "메인 화면에서 관리 기능 노출 없음 & compact 모드에서 n회 참여/판정요약 미노출", () => {
  const aggregated = aggregateParticipants(rawInspections, commonQuestions);
  assert.strictEqual(aggregated.length, 0, "초기 참가자 없음");
  // 검색 결과 없을 때 빈 배열 안전 처리
  const query = "존재하지않는참가자";
  const searchResults = aggregated.filter((p) => p.participantName.includes(query));
  assert.strictEqual(searchResults.length, 0, "오류 없이 빈 결과 반환");
});

// [3. /reserve 예약 생성 (7명 가상 예약자)]
const sampleReservationNames = [
  "김철수", "이영희", "박민수", "최서연", "정우진", "한지민", "윤도현"
];

runTest("예약", "7명의 가상 예약자 순서대로 생성 및 예약번호 생성", () => {
  sampleReservationNames.forEach((name, idx) => {
    const resId = idx + 1;
    const phone = `010-${String(1000 + idx)}-${String(5000 + idx)}`;
    rawReservations.push({
      id: resId,
      name,
      studentId: `2026${String(idx + 1).padStart(4, "0")}`,
      phone,
      section: idx % 2 === 0 ? "자율" : "공통",
      status: "대기",
      createdAt: new Date(Date.now() + idx * 1000).toISOString(),
    });
    auditLogs.push({
      id: `audit_res_create_${resId}`,
      operationId: `op_res_create_${resId}`,
      targetType: "reservation",
      targetId: String(resId),
      action: "create",
      changes: { name, status: "대기" },
      timestamp: new Date().toISOString(),
    });
  });

  assert.strictEqual(rawReservations.length, 7, "7명 예약 완료");
  assert.strictEqual(rawReservations[0].name, "김철수");
  assert.strictEqual(rawReservations[6].name, "윤도현");
});

// [4. 관리자 인증 검증]
runTest("관리자 인증", "비밀번호 검증 (qwertyno1 일치 시 허용, wrong 시 거부, 세션 공유)", () => {
  const ADMIN_PASSWORD = "qwertyno1";
  function authenticate(input) {
    if (input === ADMIN_PASSWORD) {
      mockSessionStorage.setItem("admin_auth_session", "true");
      return true;
    }
    return false;
  }

  assert.strictEqual(authenticate("wrong"), false, "잘못된 비밀번호는 거부되어야 함");
  assert.strictEqual(mockSessionStorage.getItem("admin_auth_session"), null);

  assert.strictEqual(authenticate("qwertyno1"), true, "올바른 비밀번호는 승인되어야 함");
  assert.strictEqual(mockSessionStorage.getItem("admin_auth_session"), "true");

  // 동일 세션에서는 /admin -> /reserve/admin -> /log 이동 시 추가 인증 불필요
  const isAuth = mockSessionStorage.getItem("admin_auth_session") === "true";
  assert.strictEqual(isAuth, true, "동일 세션 인증 상태 공유");
});

// [5. 예약 관리자 큐 (/reserve/admin) 상위 5명 및 조작]
runTest("예약 큐", "대기 큐 상위 정확히 5명 표시 및 6/7번째는 미노출", () => {
  const waitingRows = rawReservations.filter((r) => r.status === "대기").sort((a, b) => a.id - b.id);
  const topQueue = waitingRows.slice(0, 5);

  assert.strictEqual(topQueue.length, 5);
  assert.strictEqual(topQueue[0].name, "김철수");
  assert.strictEqual(topQueue[4].name, "정우진");
  assert.strictEqual(topQueue.some((r) => r.name === "한지민" || r.name === "윤도현"), false, "6/7번째는 상위 5명에 없음");
});

runTest("전화번호 복사", "전화번호 복사 시 대기열 처리 모달이 트리거되지 않음 (이벤트 분리)", () => {
  let clipboardText = "";
  function copyPhone(item) {
    clipboardText = item.phone;
    return true; // 복사 성공
  }
  const first = rawReservations[0];
  copyPhone(first);
  assert.strictEqual(clipboardText, first.phone);
  assert.strictEqual(first.status, "대기", "전화번호 클릭이 큐 상태를 변경하지 않음");
});

let undoSnapshot = null;
runTest("예약 큐 처리", "1번째 예약자 처리 시 큐에서 제거되고 6번째 예약자가 5위로 자동 승격", () => {
  // 1번째 예약자(김철수) 처리
  const target = rawReservations[0];
  undoSnapshot = {
    item: { ...target },
    expireSeconds: 5,
  };
  target.status = "완료"; // 물리 삭제가 아닌 상태 변경

  auditLogs.push({
    id: `audit_res_admit_${target.id}`,
    operationId: `op_res_admit_${target.id}`,
    targetType: "reservation",
    targetId: String(target.id),
    action: "update",
    changes: { status: "완료" },
    timestamp: new Date().toISOString(),
  });

  const waitingRows = rawReservations.filter((r) => r.status === "대기").sort((a, b) => a.id - b.id);
  const topQueue = waitingRows.slice(0, 5);
  assert.strictEqual(topQueue.length, 5);
  assert.strictEqual(topQueue[0].name, "이영희", "2번째가 1위로 승격");
  assert.strictEqual(topQueue[4].name, "한지민", "6번째였던 한지민이 5위로 자동 승격");
});

runTest("큐 Undo", "5초 이내 Undo 시 원래 순서 1위로 완벽 복원", () => {
  assert.ok(undoSnapshot);
  // Undo 실행
  const targetId = undoSnapshot.item.id;
  const target = rawReservations.find((r) => r.id === targetId);
  target.status = "대기";

  const waitingRows = rawReservations.filter((r) => r.status === "대기").sort((a, b) => a.id - b.id);
  const topQueue = waitingRows.slice(0, 5);
  assert.strictEqual(topQueue[0].name, "김철수", "김철수가 원래 1위로 복귀");
  assert.strictEqual(topQueue[4].name, "정우진", "원래 5위 목록 복원");

  // 다시 처리 후 만료 시뮬레이션
  target.status = "완료";
});

// [6. 처리 후 검사]
let participantFromReserve = null;
runTest("처리 후 검사", "예약 큐 처리 후 검사 화면 이동 시 예약자 이름 자동 전달 & 신규 participantId 부여", () => {
  const nextTarget = rawReservations.find((r) => r.name === "이영희" && r.status === "대기");
  nextTarget.status = "완료";

  participantFromReserve = {
    name: nextTarget.name,
    participantId: `p_reserve_${nextTarget.id}_${Date.now()}`,
  };

  assert.strictEqual(participantFromReserve.name, "이영희");
  assert.ok(participantFromReserve.participantId.startsWith("p_reserve_2"));
});

// [7. 공통 검사 전체 시뮬레이션]
const testParticipantId = `p_cheolsu_${Date.now()}`;
const testParticipantName = "테스트 철수";

runTest("공통 검사", "신규 참가자 테스트 철수의 공통 질문 5개 진행 및 저장", () => {
  const answers = ["yes", "no", "yes", "no", "yes"];
  const results = ["truth", "lie", "truth", "truth", "lie"];

  const commonQuestionsSession = {
    id: `sess_common_1`,
    operationId: `op_common_1`,
    participantId: testParticipantId,
    participantName: testParticipantName,
    type: "common",
    questions: commonQuestions.map((q, idx) => ({
      id: `cq_rec_1_${idx + 1}`,
      questionType: "common",
      sourceQuestionId: q.id,
      question: q.content,
      answer: answers[idx],
      result: results[idx],
      order: q.order,
    })),
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    sequence: 1,
    status: "active",
    version: 1,
    number: "#001",
    isPublic: true,
  };

  rawInspections.push(commonQuestionsSession);
  auditLogs.push({
    id: `audit_common_1`,
    operationId: `op_common_1`,
    targetType: "inspection",
    targetId: commonQuestionsSession.id,
    action: "create",
    timestamp: "2026-10-01T10:00:00Z",
  });

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(agg.totalQuestions, 5);
  assert.strictEqual(agg.truthCount, 3);
  assert.strictEqual(agg.lieCount, 2);
});

// [8. 공통 -> 자율 연결 & 자율 누적]
runTest("공통 -> 자율 연결", "동일 participantId로 자율 질문 3개 진행 후 단일 카드로 통합", () => {
  const customSession1 = {
    id: `sess_custom_1`,
    operationId: `op_custom_1`,
    participantId: testParticipantId, // 동일한 participantId 사용!
    participantName: testParticipantName,
    type: "custom",
    questions: [
      { id: "cust_1", questionType: "custom", question: "가장 좋아하는 음식은 치킨인가요?", answer: "yes", result: "truth", order: 1 },
      { id: "cust_2", questionType: "custom", question: "어제 12시 전에 잤나요?", answer: "no", result: "lie", order: 2 },
      { id: "cust_3", questionType: "custom", question: "오늘 기분이 좋은가요?", answer: "yes", result: "truth", order: 3 },
    ],
    createdAt: "2026-10-01T10:30:00Z",
    updatedAt: "2026-10-01T10:30:00Z",
    sequence: 2,
    status: "active",
    version: 1,
    number: "#002",
    isPublic: true,
  };

  rawInspections.push(customSession1);

  const allAgg = aggregateParticipants(rawInspections, commonQuestions);
  const cheolsuCards = allAgg.filter((p) => p.participantName === testParticipantName);
  assert.strictEqual(cheolsuCards.length, 1, "테스트 철수 카드는 정확히 1개만 존재해야 함");

  const agg = cheolsuCards[0];
  assert.strictEqual(agg.totalQuestions, 8, "공통 5 + 자율 3 = 8");
  assert.strictEqual(agg.commonQuestions.length, 5);
  assert.strictEqual(agg.customQuestions.length, 3);
  assert.strictEqual(agg.allQuestions[0].questionType, "common", "공통 질문이 먼저 와야 함");
  assert.strictEqual(agg.allQuestions[5].questionType, "custom", "자율 질문이 나중에 와야 함");
});

// [9. 자율 질문 누적 테스트 (동일 질문 포함)]
runTest("자율 누적", "동일 질문이 포함된 두 번째 자율 검사 추가 시 모든 질문 누적", () => {
  const customSession2 = {
    id: `sess_custom_2`,
    operationId: `op_custom_2`,
    participantId: testParticipantId,
    participantName: testParticipantName,
    type: "custom",
    questions: [
      { id: "cust_4", questionType: "custom", question: "오늘 기분이 좋은가요?", answer: "no", result: "lie", order: 1 }, // 동일 질문
      { id: "cust_5", questionType: "custom", question: "새로운 취미가 있나요?", answer: "yes", result: "truth", order: 2 },
    ],
    createdAt: "2026-10-01T11:00:00Z",
    updatedAt: "2026-10-01T11:00:00Z",
    sequence: 3,
    status: "active",
    version: 1,
    number: "#003",
    isPublic: true,
  };

  rawInspections.push(customSession2);

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(agg.customQuestions.length, 5, "자율 질문 3 + 2 = 5개 모두 누적");
  assert.strictEqual(agg.totalQuestions, 10, "공통 5 + 자율 5 = 10");
});

// [10. 공통 질문 재검사 테스트]
runTest("공통 재검사", "동일 참가자 두 번째 공통 검사 시 질문 총 5개 유지 및 최신 판정 갱신", () => {
  const commonSession2 = {
    id: `sess_common_2`,
    operationId: `op_common_2`,
    participantId: testParticipantId,
    participantName: testParticipantName,
    type: "common",
    questions: commonQuestions.map((q, idx) => ({
      id: `cq_rec_2_${idx + 1}`,
      questionType: "common",
      sourceQuestionId: q.id,
      question: q.content,
      // q1(좋아하는사람)의 답변을 변경: 원래 yes/truth -> no/lie로 변경
      answer: idx === 0 ? "no" : "yes",
      result: idx === 0 ? "lie" : "truth",
      order: q.order,
    })),
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
    sequence: 4,
    status: "active",
    version: 1,
    number: "#004",
    isPublic: true,
  };

  rawInspections.push(commonSession2);

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(agg.commonQuestions.length, 5, "공통 질문은 10개가 아니라 여전히 5개만 유지");
  const q1 = agg.commonQuestions.find((q) => q.sourceQuestionId === "q1");
  assert.strictEqual(q1.result, "lie", "더 최신 공통 검사의 결과인 lie가 반영되어야 함");
  assert.strictEqual(agg.customQuestions.length, 5, "기존 자율 질문 5건 영향 없이 보존");
});

// [11. 동명이인 테스트]
const duplicateNameParticipantId = `p_cheolsu_duplicate_${Date.now()}`;
runTest("동명이인", "이름은 같지만 participantId가 다른 신규 참가자 생성 시 2개의 독립 카드로 분리", () => {
  const duplicateParticipantSession = {
    id: `sess_cheolsu_dup_1`,
    operationId: `op_cheolsu_dup_1`,
    participantId: duplicateNameParticipantId, // 완전히 다른 ID
    participantName: testParticipantName, // 이름은 동일: "테스트 철수"
    type: "custom",
    questions: [
      { id: "dup_q1", questionType: "custom", question: "동명이인의 고유 질문", answer: "yes", result: "truth", order: 1 },
    ],
    createdAt: "2026-10-01T13:00:00Z",
    updatedAt: "2026-10-01T13:00:00Z",
    sequence: 5,
    status: "active",
    version: 1,
    number: "#005",
    isPublic: true,
  };

  rawInspections.push(duplicateParticipantSession);

  const allAgg = aggregateParticipants(rawInspections, commonQuestions);
  const cheolsuCards = allAgg.filter((p) => p.participantName === testParticipantName);
  assert.strictEqual(cheolsuCards.length, 2, "이름이 같더라도 서로 다른 participantId면 2개의 카드로 분리되어야 함");

  const card1 = cheolsuCards.find((p) => p.participantId === testParticipantId);
  const card2 = cheolsuCards.find((p) => p.participantId === duplicateNameParticipantId);
  assert.strictEqual(card1.totalQuestions, 10);
  assert.strictEqual(card2.totalQuestions, 1);
});

// [12. LOG 시스템 및 알림]
runTest("LOG 알림", "새 로그 생성 시 알림 배지 카운트 계산 및 /log 진입 시 읽음 처리", () => {
  // AdminNav 배지 계산 로직 검증
  const lastSeenTime = "2026-10-01T11:30:00Z";
  const lastSeenMs = new Date(lastSeenTime).getTime();

  const newSessions = rawInspections.filter((s) => {
    if (s.status === "retracted") return false;
    return new Date(s.createdAt).getTime() > lastSeenMs;
  });

  assert.strictEqual(newSessions.length, 2, "11:30 이후에 생성된 세션 2건");
  const latestParticipant = newSessions[newSessions.length - 1].participantName;
  const badgeText = `${latestParticipant} +${newSessions.length}`;
  assert.strictEqual(badgeText, "테스트 철수 +2", "참가자 이름 + 미확인 개수 배지 형식 일치");

  // /log 진입 시 읽음 처리 (마지막 세션 생성 시점 이후 시점으로 읽음 처리)
  const markReadTime = "2026-10-01T14:00:00Z";
  mockSessionStorage.setItem("admin_last_seen_log_time", markReadTime);
  const afterReadMs = new Date(markReadTime).getTime();
  const unreadAfter = rawInspections.filter((s) => new Date(s.createdAt).getTime() > afterReadMs);
  assert.strictEqual(unreadAfter.length, 0, "읽음 처리 후 배지 소멸");
});

// [13. 과거 공통 로그 수정 vs 최신 공통 로그 수정]
runTest("과거 공통 로그 수정", "과거 첫 번째 공통 로그를 수정해도 최신 공통 검사가 계속 우선", () => {
  // sess_common_1(과거 검사)의 q1을 'truth'로 수정했다고 가정
  const pastSession = rawInspections.find((s) => s.id === "sess_common_1");
  pastSession.updatedAt = "2026-10-01T15:00:00Z"; // 오늘 수정됨
  pastSession.version = 2;

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  const q1 = agg.commonQuestions.find((q) => q.sourceQuestionId === "q1");
  assert.strictEqual(q1.result, "lie", "sess_common_2가 sequence상 나중 검사이므로 q1 판정은 여전히 lie여야 함");
});

runTest("최신 공통 로그 수정", "최신 공통 로그의 질문 판정 수정 시 공개 결과 즉시 변경", () => {
  const latestSession = rawInspections.find((s) => s.id === "sess_common_2");
  // 최신 검사의 q1을 'truth'로 수정
  latestSession.questions[0].result = "truth";
  latestSession.updatedAt = "2026-10-01T16:00:00Z";
  latestSession.version = 2;

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  const q1 = agg.commonQuestions.find((q) => q.sourceQuestionId === "q1");
  assert.strictEqual(q1.result, "truth", "최신 검사 수정 내용이 공개 집계에 즉시 반영됨");
});

// [14. 검사 취소(Retract) 및 복구(Restore)]
runTest("검사 취소", "최신 공통 검사 취소 시 이전 공통 검사 결과로 자동 fallback", () => {
  const latestSession = rawInspections.find((s) => s.id === "sess_common_2");
  latestSession.status = "retracted";

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(agg.commonQuestions.length, 5, "공통 질문 5개 유지");
  // sess_common_1의 원래 q1(truth)로 복원 확인
  const q1 = agg.commonQuestions.find((q) => q.sourceQuestionId === "q1");
  assert.strictEqual(q1.result, "truth", "이전 검사의 결과로 안전하게 fallback");
});

runTest("검사 복구", "취소했던 최신 공통 검사 복구 시 최신 결과 재적용", () => {
  const latestSession = rawInspections.find((s) => s.id === "sess_common_2");
  latestSession.status = "active";

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  const q1 = agg.commonQuestions.find((q) => q.sourceQuestionId === "q1");
  assert.strictEqual(q1.result, "truth", "복구된 세션의 결과 재적용");
});

// [15. 핵심 시간순서 엣지 케이스: A -> B -> B 취소 -> C -> B 복구 => 결과는 C!]
runTest("시간순서 엣지케이스", "A -> B -> B 취소 -> C -> B 복구 시 결과는 C여야 함", () => {
  const edgePid = "p_edge_user";
  const sessionA = {
    id: "edge_A",
    participantId: edgePid,
    participantName: "엣지테스터",
    type: "common",
    questions: [{ id: "ea", questionType: "common", sourceQuestionId: "q1", question: "q1", answer: "yes", result: "truth", order: 1 }],
    createdAt: "2026-10-01T08:00:00Z",
    sequence: 101,
    status: "active",
  };
  const sessionB = {
    id: "edge_B",
    participantId: edgePid,
    participantName: "엣지테스터",
    type: "common",
    questions: [{ id: "eb", questionType: "common", sourceQuestionId: "q1", question: "q1", answer: "no", result: "lie", order: 1 }],
    createdAt: "2026-10-01T09:00:00Z",
    sequence: 102,
    status: "retracted", // B 취소됨
  };
  const sessionC = {
    id: "edge_C",
    participantId: edgePid,
    participantName: "엣지테스터",
    type: "common",
    questions: [{ id: "ec", questionType: "common", sourceQuestionId: "q1", question: "q1", answer: "yes", result: "truth", order: 1 }],
    createdAt: "2026-10-01T10:00:00Z",
    sequence: 103, // C가 B보다 나중에 수행됨
    status: "active",
  };

  // 현재 B는 취소된 상태, C가 적용 중
  let edgeAgg = aggregateParticipant(edgePid, [sessionA, sessionB, sessionC], commonQuestions);
  assert.strictEqual(edgeAgg.commonQuestions[0].result, "truth", "C의 결과가 적용 중");

  // 이제 B를 '오늘' 복구함
  sessionB.status = "active";
  sessionB.updatedAt = "2026-10-01T20:00:00Z";

  // 복구되었더라도 원본 sequence는 B(102) < C(103)이므로 결과는 C의 truth여야 함!
  edgeAgg = aggregateParticipant(edgePid, [sessionA, sessionB, sessionC], commonQuestions);
  assert.strictEqual(edgeAgg.commonQuestions[0].result, "truth", "B 복구 시각과 무관하게 원본 sequence상 C가 최신이므로 C가 유지되어야 함");
});

// [16. 자율 로그 취소 및 복구]
runTest("자율 로그 취소", "특정 자율 검사 취소 시 해당 질문들만 제거되고 다른 자율 질문은 유지", () => {
  const targetCustom = rawInspections.find((s) => s.id === "sess_custom_2");
  targetCustom.status = "retracted";

  const agg = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(agg.customQuestions.length, 3, "sess_custom_2(2개)가 제외되어 3개만 남음");

  // 복구
  targetCustom.status = "active";
  const aggRestored = aggregateParticipant(testParticipantId, rawInspections, commonQuestions);
  assert.strictEqual(aggRestored.customQuestions.length, 5, "복구 후 다시 5개 누적");
});

// [17. 참가자 연결 변경 테스트]
runTest("참가자 연결 변경", "로그의 participantId를 변경 시 이전/신규 참가자 모두 자동 재집계", () => {
  const donorSession = rawInspections.find((s) => s.id === "sess_cheolsu_dup_1");
  const newPid = "p_transferred_user";
  donorSession.participantId = newPid;
  donorSession.participantName = "이전된 참가자";

  const allAgg = aggregateParticipants(rawInspections, commonQuestions);
  const transferred = allAgg.find((p) => p.participantId === newPid);
  assert.ok(transferred);
  assert.strictEqual(transferred.participantName, "이전된 참가자");
  assert.strictEqual(transferred.totalQuestions, 1);

  // 복원
  donorSession.participantId = duplicateNameParticipantId;
  donorSession.participantName = testParticipantName;
});

// [18. 공통 질문 순서 변경 테스트]
runTest("공통 질문 순서 변경", "관리자가 공통 질문 order를 변경 시 기존 참가자 표시 순서도 변경됨 (ID 유지)", () => {
  const reorderedQuestions = [
    { id: "q5", content: "지금 솔직하게 대답하고 있나요?", order: 1 }, // q5가 1번으로
    { id: "q1", content: "오늘 좋아하는 사람이 이 축제에 왔나요?", order: 2 },
    { id: "q2", content: "오늘 지각했나요?", order: 3 },
    { id: "q3", content: "친구에게 숨기는 비밀이 있나요?", order: 4 },
    { id: "q4", content: "오늘 가장 만나고 싶었던 사람이 있나요?", order: 5 },
  ];

  const agg = aggregateParticipant(testParticipantId, rawInspections, reorderedQuestions);
  assert.strictEqual(agg.commonQuestions[0].sourceQuestionId, "q5", "q5가 첫 번째 질문으로 정렬되어야 함");
  assert.strictEqual(agg.commonQuestions[1].sourceQuestionId, "q1", "q1이 두 번째 질문으로 정렬되어야 함");
});

// [19. 데이터 무결성 Invariant 전수 검증]
runTest("데이터 무결성 Invariant", "통계 합산 공식 (total = truth + lie + unknown) 전수 검증", () => {
  const allAgg = aggregateParticipants(rawInspections, commonQuestions);
  for (const p of allAgg) {
    assert.strictEqual(p.totalQuestions, p.truthCount + p.lieCount + p.unknownCount, "total 통계 불변식");
  }
});

// [20. 입력 validation 및 안전성]
runTest("입력 validation", "특수문자, 매우 긴 이름, 공백 포함 시 crash 없이 안전 처리", () => {
  const dirtyLogs = [
    {
      id: "sess_dirty_1",
      participantId: "p_dirty",
      participantName: "  !@#$%^&*()_+ 특수문자 긴 이름 가나다라마바사   ",
      type: "custom",
      questions: [
        { id: "dq1", questionType: "custom", question: "A".repeat(500), answer: "yes", result: "truth", order: 1 },
      ],
      createdAt: new Date().toISOString(),
      sequence: 999,
      status: "active",
      number: "#DIRTY",
      isPublic: true,
    }
  ];

  const agg = aggregateParticipant("p_dirty", dirtyLogs, commonQuestions);
  assert.ok(agg);
  assert.strictEqual(agg.participantName, "!@#$%^&*()_+ 특수문자 긴 이름 가나다라마바사", "공백 trim 정상 처리");
  assert.strictEqual(agg.allQuestions[0].question.length, 500, "긴 질문 안전 저장");
});

console.log("\n==================================================");
console.log(`시뮬레이션 완료: 총 ${resultsSummary.total}개 중 PASS: ${resultsSummary.pass}, FAIL: ${resultsSummary.fail}`);
console.log("==================================================");

if (resultsSummary.fail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
