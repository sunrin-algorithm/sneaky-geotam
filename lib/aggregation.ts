import { AggregatedParticipant, CommonQuestion, InspectionLog, QuestionRecord } from "./types";

/**
 * 특정 검사 로그의 원본 시퀀스/시간 타임스탬프를 반환합니다.
 * 수정 시각(updatedAt)이 아닌 최초 원본 순서(sequence 또는 createdAt)를 보존합니다.
 */
function getOriginalLogOrder(log: InspectionLog): number {
  if (typeof log.sequence === "number" && !isNaN(log.sequence)) {
    return log.sequence;
  }
  return new Date(log.createdAt).getTime();
}

/**
 * 단일 참가자의 유효 검사 로그들을 집계(Aggregation)하는 순수 함수입니다. (PROMPT.md 5)
 * - 취소된 검사 세션(status === "retracted")은 제외
 * - 공통 질문: 원본 검사 순서(sequence/createdAt) 기준 가장 최근 세션의 답변/판정 반영, 관리자 순서(order)대로 정렬
 * - 자율 질문: 모든 세션의 질문을 원본 시간순으로 누적
 * - 통합 질문: 공통 질문 먼저, 자율 질문 나중에 배치
 * - 통계: 중복 제거된 최신 공통 질문 + 누적된 모든 자율 질문 기준
 */
export function aggregateParticipant(
  participantId: string,
  allLogs: InspectionLog[],
  commonQuestions: CommonQuestion[] = []
): AggregatedParticipant | null {
  // 1. 해당 참가자의 활성(active) 로그 필터링 (participantId 일치 기준, 취소된 로그 제외)
  const activeLogs = allLogs.filter((log) => {
    if (log.status === "retracted") return false;
    const pid = log.participantId || `name_${log.participantName.trim()}`;
    return pid === participantId;
  });

  if (activeLogs.length === 0) {
    return null;
  }

  // 2. 원본 검사 진행 순서(sequence/createdAt 오름차순: 오래된 것 -> 최신 것)로 정렬
  const chronologicallyOrderedLogs = [...activeLogs].sort(
    (a, b) => getOriginalLogOrder(a) - getOriginalLogOrder(b)
  );

  // 가장 최근 검사 로그 (메타데이터용)
  const latestLog = chronologicallyOrderedLogs[chronologicallyOrderedLogs.length - 1];
  const participantName = latestLog.participantName.trim();
  const sessionIds = chronologicallyOrderedLogs.map((l) => l.id);
  const isPublic = chronologicallyOrderedLogs.some((l) => l.isPublic);

  // 공통 질문 순서 맵 (id -> order)
  const commonOrderMap = new Map<string, number>();
  commonQuestions.forEach((cq) => {
    commonOrderMap.set(cq.id, cq.order);
  });

  // 3. 공통 질문 최신화:
  // 시간순(오래된 것 -> 최신 것)으로 순회하면서 최신 세션의 질문으로 덮어씀
  const commonQuestionMap = new Map<string, QuestionRecord>();

  // 4. 자율 질문 전체 누적:
  // 원본 기록 순서대로 누적
  const customQuestions: QuestionRecord[] = [];

  for (const log of chronologicallyOrderedLogs) {
    // 세션 내 질문 순서(q.order) 정렬
    const sortedQuestions = [...log.questions].sort((a, b) => a.order - b.order);

    for (const q of sortedQuestions) {
      if (q.questionType === "common") {
        const key = q.sourceQuestionId || q.question.trim();
        // 더 최신 검사의 질문으로 갱신
        commonQuestionMap.set(key, q);
      } else {
        // 자율 질문은 중복 유지하며 모두 누적
        customQuestions.push(q);
      }
    }
  }

  // 공통 질문 정렬: 관리자 지정 order 기준 (없으면 원래 order)
  const integratedCommonQuestions = Array.from(commonQuestionMap.values())
    .map((q) => {
      const mappedOrder = q.sourceQuestionId ? commonOrderMap.get(q.sourceQuestionId) : undefined;
      return {
        ...q,
        order: mappedOrder ?? q.order,
      };
    })
    .sort((a, b) => a.order - b.order);

  // 자율 질문 순번 재지정 (1부터 순차)
  const integratedCustomQuestions = customQuestions.map((q, idx) => ({
    ...q,
    order: idx + 1,
  }));

  // 전체 질문: 공통 질문 먼저, 자율 질문 나중에
  const allQuestions = [...integratedCommonQuestions, ...integratedCustomQuestions];

  // 판정 통계 계산
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

/**
 * 전체 검사 로그들을 참가자별로 집계(Aggregation)합니다.
 */
export function aggregateParticipants(
  logs: InspectionLog[],
  commonQuestions: CommonQuestion[] = []
): AggregatedParticipant[] {
  // participantId 기준으로 고유 참가자 식별 (동명이인 분리 보장, 이름만으로 병합 금지)
  const uniqueParticipantIds = new Set<string>();
  for (const log of logs) {
    if (log.status !== "retracted") {
      const pid = log.participantId || `name_${log.participantName.trim()}`;
      uniqueParticipantIds.add(pid);
    }
  }

  const results: AggregatedParticipant[] = [];
  for (const pid of uniqueParticipantIds) {
    const aggregated = aggregateParticipant(pid, logs, commonQuestions);
    if (aggregated) {
      results.push(aggregated);
    }
  }

  // 최신 검사 일시 기준 내림차순 정렬
  return results.sort((a, b) => {
    return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
  });
}

/**
 * participantId 또는 sessionId로 참가자 통합 데이터를 조회합니다.
 * 구형 URL(/result/sessionId) 호환성 완벽 지원.
 */
export function findAggregatedParticipant(
  id: string,
  logs: InspectionLog[],
  commonQuestions: CommonQuestion[] = []
): AggregatedParticipant | null {
  // 1. participantId 직접 조회 시도
  const byPid = aggregateParticipant(id, logs, commonQuestions);
  if (byPid) return byPid;

  // 2. target sessionId를 가진 로그 탐색
  const targetLog = logs.find((l) => l.id === id);
  if (targetLog) {
    const pid = targetLog.participantId || `name_${targetLog.participantName.trim()}`;
    return aggregateParticipant(pid, logs, commonQuestions);
  }

  // 3. 전체 목록에서 매칭 시도
  const allAggregated = aggregateParticipants(logs, commonQuestions);
  return allAggregated.find((p) => p.participantId === id || p.sessionIds.includes(id)) ?? null;
}
