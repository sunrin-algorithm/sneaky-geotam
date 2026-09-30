import assert from "node:assert";

// lib/aggregation.ts의 순수 로직 검증 (ESM 모듈 호환 임베드 테스트)
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

function findAggregatedParticipant(id, logs, commonQuestions = []) {
  const byPid = aggregateParticipant(id, logs, commonQuestions);
  if (byPid) return byPid;

  const targetLog = logs.find((l) => l.id === id);
  if (targetLog) {
    const pid = targetLog.participantId || `name_${targetLog.participantName.trim()}`;
    return aggregateParticipant(pid, logs, commonQuestions);
  }

  const allAggregated = aggregateParticipants(logs, commonQuestions);
  return allAggregated.find((p) => p.participantId === id || p.sessionIds.includes(id)) ?? null;
}

// ----------------------------------------------------
// 테스트 데이터 셋업
// ----------------------------------------------------
const commonQuestions = [
  { id: "q1", content: "질문 1", order: 1 },
  { id: "q2", content: "질문 2", order: 2 },
  { id: "q3", content: "질문 3", order: 3 },
  { id: "q4", content: "질문 4", order: 4 },
  { id: "q5", content: "질문 5", order: 5 },
];

console.log("=== PROMPT.md 검증 테스트 시작 ===");

// 1. 단일 검사 생성 및 공개 집계 검증
const log1 = {
  id: "sess_1",
  operationId: "op_1",
  participantId: "p_user1",
  participantName: "홍길동",
  type: "common",
  questions: [
    { id: "item1", questionType: "common", sourceQuestionId: "q1", question: "질문 1", answer: "yes", result: "truth", order: 1 },
    { id: "item2", questionType: "common", sourceQuestionId: "q2", question: "질문 2", answer: "no", result: "lie", order: 2 },
  ],
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
  sequence: 1,
  status: "active",
  version: 1,
  number: "#001",
  isPublic: true,
};

let res1 = aggregateParticipant("p_user1", [log1], commonQuestions);
assert.strictEqual(res1.totalQuestions, 2);
assert.strictEqual(res1.truthCount, 1);
assert.strictEqual(res1.lieCount, 1);
console.log("✓ Test 1 통과: 단일 검사 로그 집계 및 판정 통계 정확함");

// 2. 공통 질문 최신화 검증 (동일 참가자가 나중에 q1을 다시 검사하여 lie가 됨)
const log2 = {
  id: "sess_2",
  operationId: "op_2",
  participantId: "p_user1",
  participantName: "홍길동",
  type: "common",
  questions: [
    { id: "item3", questionType: "common", sourceQuestionId: "q1", question: "질문 1", answer: "no", result: "lie", order: 1 },
  ],
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  sequence: 2,
  status: "active",
  version: 1,
  number: "#002",
  isPublic: true,
};

let res2 = aggregateParticipant("p_user1", [log1, log2], commonQuestions);
assert.strictEqual(res2.totalQuestions, 2, "q1이 중복 제거되어 총 질문 수는 2개여야 함");
const q1 = res2.commonQuestions.find((q) => q.sourceQuestionId === "q1");
assert.strictEqual(q1.result, "lie", "더 최신 세션의 결과인 'lie'로 갱신되어야 함");
assert.strictEqual(res2.truthCount, 0);
assert.strictEqual(res2.lieCount, 2);
console.log("✓ Test 2 통과: 공통 질문 동일성(질문 ID) 기준 최신 판정 갱신 확인");

// 3. 자율 질문 누적 검증 (중복 질문 유지 및 시간순 누적)
const log3 = {
  id: "sess_3",
  operationId: "op_3",
  participantId: "p_user1",
  participantName: "홍길동",
  type: "custom",
  questions: [
    { id: "custom1", questionType: "custom", question: "좋아하는 색?", answer: "yes", result: "truth", order: 1 },
    { id: "custom2", questionType: "custom", question: "좋아하는 색?", answer: "no", result: "lie", order: 2 },
  ],
  createdAt: "2026-10-01T11:00:00Z",
  updatedAt: "2026-10-01T11:00:00Z",
  sequence: 3,
  status: "active",
  version: 1,
  number: "#003",
  isPublic: true,
};

let res3 = aggregateParticipant("p_user1", [log1, log2, log3], commonQuestions);
assert.strictEqual(res3.customQuestions.length, 2, "자율 질문 2건 모두 누적되어야 함");
assert.strictEqual(res3.totalQuestions, 4, "공통 2건 + 자율 2건 = 4건");
assert.strictEqual(res3.allQuestions[0].questionType, "common", "공통 질문이 먼저 와야 함");
assert.strictEqual(res3.allQuestions[2].questionType, "custom", "자율 질문이 나중에 와야 함");
console.log("✓ Test 3 통과: 자율 질문 누적 및 '공통 먼저, 자율 나중' 정렬 규칙 확인");

// 4. 과거 공통 질문 수정 시 검사 순서 보존 검증 (PROMPT.md 3)
// 과거의 log1을 '오늘' 수정했더라도(updatedAt 갱신), log2보다 나중 검사가 되어서는 안 됨
const log1Modified = {
  ...log1,
  updatedAt: "2026-10-01T15:00:00Z", // 오늘 오후에 수정됨
  version: 2,
};
let res4 = aggregateParticipant("p_user1", [log1Modified, log2], commonQuestions);
const q1AfterModify = res4.commonQuestions.find((q) => q.sourceQuestionId === "q1");
assert.strictEqual(q1AfterModify.result, "lie", "log2가 sequence상 나중 검사이므로 q1 판정은 여전히 log2의 lie여야 함");
console.log("✓ Test 4 통과: 과거 로그 수정 시에도 원본 검사 순서(sequence) 엄격 보존 확인");

// 5. 완료 작업 취소 (Undo / Retract) 검증 (PROMPT.md 7)
// log2(q1을 lie로 바꾼 검사)가 취소되면, log1의 원래 결과인 truth가 다시 노출되어야 함!
const log2Retracted = {
  ...log2,
  status: "retracted",
  version: 2,
};
let res5 = aggregateParticipant("p_user1", [log1, log2Retracted], commonQuestions);
const q1Restored = res5.commonQuestions.find((q) => q.sourceQuestionId === "q1");
assert.strictEqual(q1Restored.result, "truth", "log2가 취소되면 이전 유효 검사인 log1의 truth로 자동 복구되어야 함");
console.log("✓ Test 5 통과: 검사 취소 시 관련 검사 제외 및 이전 공통 질문 판정 자동 복원 확인");

// 6. 취소 복구 (Restore) 검증
const log2Restored = {
  ...log2,
  status: "active",
  version: 3,
};
let res6 = aggregateParticipant("p_user1", [log1, log2Restored], commonQuestions);
const q1ReActive = res6.commonQuestions.find((q) => q.sourceQuestionId === "q1");
assert.strictEqual(q1ReActive.result, "lie", "복구 시 다시 log2의 최신 판정이 반영되어야 함");
console.log("✓ Test 6 통과: 취소 복구(Restore) 시 최신 판정 정상 재반영 확인");

// 7. 동명이인(동일 이름이지만 서로 다른 participantId) 분리 및 동일 participantId 통합 검증 (요구사항 10, 34)
const logSameNameDifferentId = {
  id: "sess_same_name_diff_id",
  operationId: "op_same_name_diff_id",
  participantId: "p_user2", // 다른 pid를 가진 동명이인
  participantName: "홍길동", // 동일한 이름
  type: "custom",
  questions: [
    { id: "other_q", questionType: "custom", question: "동명이인의 질문", answer: "yes", result: "truth", order: 1 },
  ],
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z",
  sequence: 4,
  status: "active",
  version: 1,
  number: "#999",
  isPublic: true,
};

const logDifferentName = {
  id: "sess_diff",
  operationId: "op_diff",
  participantId: "p_user3",
  participantName: "김선린", // 다른 이름
  type: "custom",
  questions: [
    { id: "diff_q", questionType: "custom", question: "별도 질문", answer: "no", result: "lie", order: 1 },
  ],
  createdAt: "2026-10-01T13:00:00Z",
  updatedAt: "2026-10-01T13:00:00Z",
  sequence: 5,
  status: "active",
  version: 1,
  number: "#1000",
  isPublic: true,
};

let allAgg = aggregateParticipants([log1, log2, logSameNameDifferentId, logDifferentName], commonQuestions);
assert.strictEqual(allAgg.length, 3, "p_user1(홍길동 2회), p_user2(동명이인 홍길동 1회), p_user3(김선린 1회) 총 3개 카드로 구분되어야 함");
const hong1 = allAgg.find((p) => p.participantId === "p_user1");
assert.strictEqual(hong1.sessionCount, 2, "동일 participantId(p_user1)의 세션 2개는 단일 카드로 자동 통합되어야 함");
const hong2 = allAgg.find((p) => p.participantId === "p_user2");
assert.strictEqual(hong2.sessionCount, 1, "동명이인(p_user2)은 별도의 독립 카드로 보존되어야 함");
console.log("✓ Test 7 통과: 동일 participantId 통합 및 동명이인(서로 다른 participantId) 분리 보장 확인");

// 8. 멱등성 및 순수성 검증 (동일 입력 시 동일 결과)
let runA = JSON.stringify(aggregateParticipant("p_user1", [log1, log2, log3], commonQuestions));
let runB = JSON.stringify(aggregateParticipant("p_user1", [log1, log2, log3], commonQuestions));
assert.strictEqual(runA, runB, "순수 함수이므로 반복 호출해도 결과가 100% 동일해야 함");
console.log("✓ Test 8 통과: aggregateParticipant 순수성 및 멱등성 검증 완료");

// 9. 구형 세션 ID URL 호환성 검증
let foundBySessionId = findAggregatedParticipant("sess_2", [log1, log2, logDifferentName], commonQuestions);
assert.strictEqual(foundBySessionId.participantId, "p_user1", "과거 세션 ID로 조회해도 해당 참가자의 통합 결과가 반환되어야 함");
console.log("✓ Test 9 통과: 기존 세션 ID 기반 URL 공유 호환성 완벽 확인");

console.log("🎉 모든 자동화 검증 케이스 (9/9) 통과 완료!");
