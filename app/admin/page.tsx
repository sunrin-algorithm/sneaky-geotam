"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import AdminNav from "@/components/AdminNav";
import { useLiveAuditLogs, useLiveCommonQuestions, useLiveInspections } from "@/lib/hooks";
import {
  clearDraft,
  getDraft,
  inspectionRepo,
  questionRepo,
  saveDraft,
} from "@/lib/storage";
import {
  Answer,
  AuditLog,
  CommonQuestion,
  DetectionResult,
  InspectionSession,
  QuestionRecord,
} from "@/lib/types";
import { aggregateParticipants } from "@/lib/aggregation";

type AdminTab = "sessions" | "logs" | "questions";
type InspectionMode = "none" | "common" | "custom";
type CommonStep = "init" | "running" | "confirm" | "done";
type CustomStep = "running" | "confirm" | "done";

function generateNumber(): string {
  return `#${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function generateParticipantId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function AdminPageContent() {
  const searchParams = useSearchParams();
  const paramParticipantName = searchParams.get("participantName");

  const { data: inspections, refetch: refetchInspections } = useLiveInspections();
  const { data: commonQuestions, refetch: refetchQuestions } = useLiveCommonQuestions();
  const { data: auditLogs, refetch: refetchAuditLogs } = useLiveAuditLogs();

  // 상단 탭
  const [tab, setTab] = useState<AdminTab>("sessions");
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("none");

  // 예약 대기열에서 "처리 후 검사"로 넘어온 경우 참가자 자동 세팅 (PROMPT.md 9)
  useEffect(() => {
    if (paramParticipantName) {
      const trimmed = paramParticipantName.trim();
      if (trimmed) {
        setInspectionMode("common");
        setCommonStep("init");
        setCommonParticipant(trimmed);
        // 예약자 이름과 동일한 기존 참가자가 있더라도 임의로 잘못 병합하지 않도록 신규 식별자 부여
        setCommonParticipantId(generateParticipantId());
        setCustomParticipant(trimmed);
        setCustomParticipantId(generateParticipantId());
      }
    }
  }, [paramParticipantName]);

  // 15초 간편 Undo 토스트 상태 (PROMPT.md 7)
  const [lastUndoOp, setLastUndoOp] = useState<{
    opId: string;
    title: string;
    sessions: InspectionSession[];
    expireSeconds: number;
  } | null>(null);

  useEffect(() => {
    if (!lastUndoOp) return;
    const interval = setInterval(() => {
      setLastUndoOp((prev) => {
        if (!prev) return null;
        if (prev.expireSeconds <= 1) return null;
        return { ...prev, expireSeconds: prev.expireSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUndoOp]);

  // 동일한 이름(문자열)을 가진 기존 참가자가 있다면 해당 ID를 반환, 없으면 신규 ID 생성 (자동 인식 및 통합)
  function resolveParticipantIdByName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return generateParticipantId();
    const matched = inspections.find(
      (s) => s.participantName.trim() === trimmed && s.participantId
    );
    return matched?.participantId || generateParticipantId();
  }

  // 기존 동일 이름 참가자 정보 조회 (자동 인식 피드백용)
  function getExistingParticipantInfo(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const sessions = inspections.filter(
      (s) => s.participantName.trim() === trimmed && s.status !== "retracted"
    );
    if (sessions.length === 0) return null;
    return {
      participantId: sessions[0].participantId || `name_${trimmed}`,
      count: sessions.length,
    };
  }

  // 기록 관리 탭 검색 및 수정 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSession, setEditingSession] = useState<InspectionSession | null>(null);

  // 전체 로그 탭 상태 (PROMPT.md 8)
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState<"all" | "common" | "custom">("all");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "active" | "retracted">("all");
  const [viewingLogDetail, setViewingLogDetail] = useState<InspectionSession | null>(null);
  const [viewingAuditLogTargetId, setViewingAuditLogTargetId] = useState<string | null>(null);
  const [retractingLogId, setRetractingLogId] = useState<string | null>(null);
  const [retractReason, setRetractReason] = useState("");

  // 공통 질문 관리 탭 상태
  const [newQuestionText, setNewQuestionText] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");

  // ==========================================
  // [공통 질문 검사] 상태
  // ==========================================
  const [commonStep, setCommonStep] = useState<CommonStep>("init");
  const [commonParticipant, setCommonParticipant] = useState("");
  const [commonParticipantId, setCommonParticipantId] = useState("");
  const [commonCurrentIndex, setCommonCurrentIndex] = useState(0); // 0 ~ 4
  const [commonAnswer, setCommonAnswer] = useState<Answer | "">("");
  const [commonResult, setCommonResult] = useState<DetectionResult | "">("");
  const [commonRecords, setCommonRecords] = useState<QuestionRecord[]>([]);
  const [editingCommonRecordIndex, setEditingCommonRecordIndex] = useState<number | null>(null);

  // ==========================================
  // [자율 질문 검사] 상태
  // ==========================================
  const [customStep, setCustomStep] = useState<CustomStep>("running");
  const [customParticipant, setCustomParticipant] = useState("");
  const [customParticipantId, setCustomParticipantId] = useState("");
  const [currentGroupId, setCurrentGroupId] = useState("");
  const [lastAssignedName, setLastAssignedName] = useState("");
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [customAnswer, setCustomAnswer] = useState<Answer | "">("");
  const [customResult, setCustomResult] = useState<DetectionResult | "">("");
  type CustomDraftItem = QuestionRecord & {
    participantName: string;
    participantId: string;
    participantGroupId: string;
  };
  const [customRecords, setCustomRecords] = useState<CustomDraftItem[]>([]);
  const [editingCustomRecordId, setEditingCustomRecordId] = useState<string | null>(null);

  // Draft 알림
  const [hasDraftNotice, setHasDraftNotice] = useState<"common" | "custom" | null>(null);

  // ------------------------------------------
  // Draft 체크
  // ------------------------------------------
  useEffect(() => {
    const cDraft = getDraft<{
      participant: string;
      participantId?: string;
      records: QuestionRecord[];
      index: number;
    }>("common");
    const custDraft = getDraft<{
      records: CustomDraftItem[];
      currentParticipant: string;
      currentParticipantId?: string;
    }>("custom");

    if (cDraft && cDraft.records?.length > 0) {
      setHasDraftNotice("common");
    } else if (custDraft && custDraft.records?.length > 0) {
      setHasDraftNotice("custom");
    }
  }, []);

  function restoreCommonDraft() {
    const draft = getDraft<{
      participant: string;
      participantId?: string;
      records: QuestionRecord[];
      index: number;
    }>("common");
    if (draft) {
      setCommonParticipant(draft.participant);
      setCommonParticipantId(draft.participantId || generateParticipantId());
      setCommonRecords(draft.records);
      setCommonCurrentIndex(draft.index);
      setCommonStep("running");
      setInspectionMode("common");
    }
    setHasDraftNotice(null);
  }

  function discardCommonDraft() {
    clearDraft("common");
    setHasDraftNotice(null);
  }

  function restoreCustomDraft() {
    const draft = getDraft<{
      records: CustomDraftItem[];
      currentParticipant: string;
      currentParticipantId?: string;
      currentGroupId: string;
    }>("custom");
    if (draft) {
      setCustomRecords(draft.records);
      setCustomParticipant(draft.currentParticipant || "");
      setCustomParticipantId(draft.currentParticipantId || generateParticipantId());
      setCurrentGroupId(draft.currentGroupId || crypto.randomUUID());
      setLastAssignedName(draft.currentParticipant || "");
      setCustomStep("running");
      setInspectionMode("custom");
    }
    setHasDraftNotice(null);
  }

  function discardCustomDraft() {
    clearDraft("custom");
    setHasDraftNotice(null);
  }

  // ==========================================
  // [공통 질문 검사] 핸들러
  // ==========================================
  function startCommonInspection() {
    const trimmed = commonParticipant.trim();
    if (!trimmed) return;
    if (commonQuestions.length < 5) {
      alert(
        "공통 질문이 5개 설정되어 있어야 검사를 시작할 수 있습니다. [공통 질문 관리] 탭에서 질문을 5개로 확정해주세요."
      );
      return;
    }

    const pid = resolveParticipantIdByName(trimmed);
    setCommonParticipantId(pid);

    setCommonCurrentIndex(0);
    setCommonRecords([]);
    setCommonAnswer("");
    setCommonResult("");
    setCommonStep("running");
  }

  function addCommonQuestionRecord() {
    if (!commonAnswer || !commonResult) return;
    const currentQ = commonQuestions[commonCurrentIndex];
    if (!currentQ) return;

    const newRecord: QuestionRecord = {
      id: crypto.randomUUID(),
      questionType: "common",
      sourceQuestionId: currentQ.id,
      question: currentQ.content,
      answer: commonAnswer,
      result: commonResult,
      order: commonCurrentIndex + 1,
    };

    const nextRecords = [...commonRecords, newRecord];
    setCommonRecords(nextRecords);
    setCommonAnswer("");
    setCommonResult("");

    saveDraft("common", {
      participant: commonParticipant,
      participantId: commonParticipantId,
      records: nextRecords,
      index: commonCurrentIndex + 1,
    });

    if (commonCurrentIndex + 1 >= 5) {
      setCommonStep("confirm");
    } else {
      setCommonCurrentIndex(commonCurrentIndex + 1);
    }
  }

  async function saveFinalCommonInspection() {
    if (commonRecords.length < 5) return;
    try {
      const opId = crypto.randomUUID();
      const session: InspectionSession = {
        id: crypto.randomUUID(),
        operationId: opId,
        number: generateNumber(),
        participantId: commonParticipantId || generateParticipantId(),
        participantName: commonParticipant.trim(),
        participantGroupId: crypto.randomUUID(),
        type: "common",
        questions: commonRecords,
        isPublic: true,
        sequence: Date.now(),
        status: "active",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await inspectionRepo.create(session);
      clearDraft("common");
      setCommonStep("done");
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("검사 기록 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  // 공통 질문 완료 후 동일한 참가자로 자율 질문 시작 (PROMPT.md 1)
  function startCustomWithSameParticipant() {
    const targetName = commonParticipant.trim();
    const targetPid = commonParticipantId;
    const newGroupId = crypto.randomUUID();

    // 1. 자율 질문 입력 모드로 자동 전환 및 참가자 정보 계승
    setInspectionMode("custom");
    setCustomStep("running");
    setCustomParticipant(targetName);
    setCustomParticipantId(targetPid);
    setCurrentGroupId(newGroupId);
    setLastAssignedName(targetName);

    // 2. 자율 질문 입력 폼 초기화
    setCustomRecords([]);
    setCustomQuestionInput("");
    setCustomAnswer("");
    setCustomResult("");

    // 3. 공통 질문 작성 상태 초기화
    setCommonStep("init");
    setCommonParticipant("");
    setCommonParticipantId("");
    setCommonRecords([]);
  }

  // ==========================================
  // [자율 질문 검사] 핸들러
  // ==========================================
  function addCustomQuestionRecord() {
    if (!customParticipant.trim()) {
      alert("참가자 이름을 입력해 주세요.");
      return;
    }
    if (!customQuestionInput.trim()) {
      alert("질문 내용을 입력해 주세요.");
      return;
    }
    if (!customAnswer || !customResult) {
      alert("참가자 답변과 거짓말탐지기 판정을 모두 선택해 주세요.");
      return;
    }

    const trimmedCustomName = customParticipant.trim();
    let targetGroupId = currentGroupId;
    let targetParticipantId = customParticipantId;
    if (!targetGroupId || trimmedCustomName !== lastAssignedName) {
      targetGroupId = crypto.randomUUID();
      setCurrentGroupId(targetGroupId);
      setLastAssignedName(trimmedCustomName);
      targetParticipantId = resolveParticipantIdByName(trimmedCustomName);
      setCustomParticipantId(targetParticipantId);
    } else if (!targetParticipantId) {
      targetParticipantId = resolveParticipantIdByName(trimmedCustomName);
      setCustomParticipantId(targetParticipantId);
    }

    const newRecord: CustomDraftItem = {
      id: crypto.randomUUID(),
      questionType: "custom",
      question: customQuestionInput.trim(),
      answer: customAnswer,
      result: customResult,
      order: customRecords.length + 1,
      participantName: customParticipant.trim(),
      participantId: targetParticipantId,
      participantGroupId: targetGroupId,
    };

    const nextRecords = [...customRecords, newRecord];
    setCustomRecords(nextRecords);

    setCustomQuestionInput("");
    setCustomAnswer("");
    setCustomResult("");

    saveDraft("custom", {
      records: nextRecords,
      currentParticipant: customParticipant.trim(),
      currentParticipantId: targetParticipantId,
      currentGroupId: targetGroupId,
    });
  }

  async function saveFinalCustomInspection() {
    if (customRecords.length === 0) return;

    const groupMap = new Map<
      string,
      { name: string; participantId: string; questions: QuestionRecord[] }
    >();
    customRecords.forEach((r) => {
      if (!groupMap.has(r.participantGroupId)) {
        groupMap.set(r.participantGroupId, {
          name: r.participantName,
          participantId: r.participantId,
          questions: [],
        });
      }
      groupMap.get(r.participantGroupId)!.questions.push({
        id: r.id,
        questionType: "custom",
        question: r.question,
        answer: r.answer,
        result: r.result,
        order: groupMap.get(r.participantGroupId)!.questions.length + 1,
      });
    });

    try {
      const opId = crypto.randomUUID();
      const sessionsToCreate: InspectionSession[] = [];
      const now = new Date().toISOString();
      let seqOffset = 0;

      for (const [groupId, group] of groupMap.entries()) {
        sessionsToCreate.push({
          id: crypto.randomUUID(),
          operationId: opId,
          number: generateNumber(),
          participantId: group.participantId || generateParticipantId(),
          participantName: group.name,
          participantGroupId: groupId,
          type: "custom",
          questions: group.questions,
          isPublic: true,
          sequence: Date.now() + seqOffset++,
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const session of sessionsToCreate) {
        await inspectionRepo.create(session);
      }

      clearDraft("custom");
      setCustomStep("done");
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("자율 검사 기록 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  // ==========================================
  // [완료 취소 및 복구 핸들러] (PROMPT.md 7)
  // ==========================================
  async function handleQuickUndo() {
    if (!lastUndoOp) return;
    const op = lastUndoOp;
    if (!confirm(`'${op.title}' 저장을 실행 취소하시겠습니까? 관련 검사 세션이 비활성화됩니다.`))
      return;

    try {
      await inspectionRepo.undoOperation(op.opId, "저장 직후 간편 실행 취소");
      setLastUndoOp(null);
      refetchInspections();
      refetchAuditLogs();
      alert("검사 기록이 취소되었습니다.");
    } catch (e) {
      console.error(e);
      alert("취소 처리에 실패했습니다.");
    }
  }

  // 취소된 검사 내용을 작성 화면으로 복구 (PROMPT.md 7.4)
  function restoreToDraftFromUndo(op: typeof lastUndoOp) {
    if (!op || op.sessions.length === 0) return;
    const s = op.sessions[0];
    if (s.type === "common") {
      setCommonParticipant(s.participantName);
      setCommonParticipantId(s.participantId || generateParticipantId());
      setCommonRecords(s.questions);
      setCommonCurrentIndex(s.questions.length >= 5 ? 4 : s.questions.length);
      setCommonStep("confirm");
      setInspectionMode("common");
    } else {
      const draftItems: CustomDraftItem[] = [];
      for (const sess of op.sessions) {
        for (const q of sess.questions) {
          draftItems.push({
            ...q,
            participantName: sess.participantName,
            participantId: sess.participantId || generateParticipantId(),
            participantGroupId: sess.participantGroupId,
          });
        }
      }
      setCustomRecords(draftItems);
      setCustomParticipant(op.sessions[op.sessions.length - 1].participantName);
      setCustomParticipantId(
        op.sessions[op.sessions.length - 1].participantId || generateParticipantId()
      );
      setCustomStep("running");
      setInspectionMode("custom");
    }
    setLastUndoOp(null);
  }

  // ==========================================
  // [공통 질문 관리] 핸들러
  // ==========================================
  async function addCommonQuestion() {
    if (!newQuestionText.trim()) return;
    const nextOrder =
      commonQuestions.length > 0 ? Math.max(...commonQuestions.map((q) => q.order)) + 1 : 1;
    const newQ: CommonQuestion = {
      id: crypto.randomUUID(),
      content: newQuestionText.trim(),
      order: nextOrder,
    };
    await questionRepo.create(newQ);
    setNewQuestionText("");
    refetchQuestions();
  }

  async function deleteCommonQuestion(id: string) {
    if (!confirm("정말 이 질문을 삭제하시겠습니까?")) return;
    await questionRepo.delete(id);
    refetchQuestions();
  }

  async function moveCommonQuestion(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= commonQuestions.length) return;

    const list = [...commonQuestions];
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const reordered = list.map((q, i) => ({ ...q, order: i + 1 }));
    await questionRepo.setAll(reordered);
    refetchQuestions();
  }

  async function saveEditedQuestion(id: string) {
    if (!editingQuestionText.trim()) return;
    await questionRepo.update(id, { content: editingQuestionText.trim() });
    setEditingQuestionId(null);
    setEditingQuestionText("");
    refetchQuestions();
  }

  // ==========================================
  // [세션 및 전체 로그 필터링]
  // ==========================================
  const activeSessions = useMemo(() => {
    return inspections.filter((s) => s.status !== "retracted");
  }, [inspections]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeSessions;
    return activeSessions.filter(
      (s) =>
        s.participantName.toLowerCase().includes(q) ||
        s.number.toLowerCase().includes(q) ||
        (s.participantId && s.participantId.toLowerCase().includes(q))
    );
  }, [activeSessions, searchQuery]);

  // 전체 로그 탭 필터링 (PROMPT.md 8)
  const filteredLogs = useMemo(() => {
    const q = logSearchQuery.trim().toLowerCase();
    return inspections.filter((log) => {
      const matchQuery =
        !q ||
        log.participantName.toLowerCase().includes(q) ||
        log.number.toLowerCase().includes(q) ||
        log.operationId.toLowerCase().includes(q) ||
        (log.participantId && log.participantId.toLowerCase().includes(q));

      const matchType = logTypeFilter === "all" || log.type === logTypeFilter;
      const matchStatus = logStatusFilter === "all" || log.status === logStatusFilter;

      return matchQuery && matchType && matchStatus;
    });
  }, [inspections, logSearchQuery, logTypeFilter, logStatusFilter]);

  async function toggleSessionPublic(session: InspectionSession) {
    await inspectionRepo.update(session.id, { isPublic: !session.isPublic });
    refetchInspections();
    refetchAuditLogs();
  }

  async function executeRetract(id: string) {
    try {
      await inspectionRepo.retract(id, retractReason.trim() || "관리자 취소");
      setRetractingLogId(null);
      setRetractReason("");
      refetchInspections();
      refetchAuditLogs();
      alert("검사 로그가 취소(비활성화)되었습니다. 공개 결과가 자동 재계산됩니다.");
    } catch (e) {
      console.error(e);
      alert("취소 처리에 실패했습니다.");
    }
  }

  async function executeRestore(id: string) {
    if (!confirm("취소된 검사 로그를 다시 복구하시겠습니까?")) return;
    try {
      await inspectionRepo.restore(id, "관리자 복구");
      refetchInspections();
      refetchAuditLogs();
      alert("검사 로그가 복구되었습니다. 공개 결과가 자동 재계산됩니다.");
    } catch (e) {
      console.error(e);
      alert("복구 처리에 실패했습니다.");
    }
  }

  // 전체 재집계 유지보수 도구 (PROMPT.md 13)
  function handleRecalculateAll() {
    const aggregated = aggregateParticipants(inspections, commonQuestions);
    inspectionRepo.recalculateAll();
    refetchInspections();
    alert(
      `전체 로그 기준 재집계 완료!\n- 총 활성 참가자 수: ${aggregated.length}명\n- 전체 누적 질문 수: ${aggregated.reduce((acc, p) => acc + p.totalQuestions, 0)}건`
    );
  }

  return (
    <AdminAuthGuard>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">관리자 대시보드</h1>
            <p className="mt-2 text-sm text-neutral-600 sm:text-base">
              거짓말탐지기 검사 기록을 등록하고 전체 검사 로그 및 감사 이력을 관리합니다.
            </p>
          </div>
          <AdminNav active="admin" />
        </div>

        {/* 15초 간편 실행 취소(Undo) 배너 (PROMPT.md 7) */}
        {lastUndoOp && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-black bg-neutral-900 p-4 text-white shadow-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 border border-neutral-700 text-xs font-bold text-white">
                {lastUndoOp.expireSeconds}s
              </span>
              <div>
                <p className="font-bold text-sm text-white">
                  {lastUndoOp.title} 저장 완료
                </p>
                <p className="text-xs text-neutral-300">
                  실수로 완료하셨다면 즉시 취소하거나 작성 화면으로 복구할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleQuickUndo}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition"
              >
                실행 취소 (Undo)
              </button>
              <button
                onClick={() => restoreToDraftFromUndo(lastUndoOp)}
                className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition"
              >
                작성 화면으로 복구
              </button>
              <button
                onClick={() => setLastUndoOp(null)}
                className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition"
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* 임시 기록 복구 알림 */}
        {hasDraftNotice && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <span>
              이전에 작성 중이던{" "}
              <strong>{hasDraftNotice === "common" ? "공통 질문" : "자율 질문"}</strong> 검사 임시
              기록이 있습니다. 이어서 작성하시겠습니까?
            </span>
            <div className="flex gap-2">
              <button
                onClick={hasDraftNotice === "common" ? restoreCommonDraft : restoreCustomDraft}
                className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
              >
                기록 복구
              </button>
              <button
                onClick={hasDraftNotice === "common" ? discardCommonDraft : discardCustomDraft}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                삭제(폐기)
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 새 검사 등록 섹션                         */}
        {/* ------------------------------------------ */}
        <section className="mt-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">새 검사 기록 시작</h2>
              <p className="mt-1 text-sm text-neutral-500">
                원하는 검사 방식을 선택하여 기록을 시작하세요.
              </p>
            </div>
            {inspectionMode !== "none" && (
              <button
                onClick={() => {
                  if (confirm("현재 진행 중인 검사 화면을 닫으시겠습니까?")) {
                    setInspectionMode("none");
                  }
                }}
                className="text-xs text-neutral-500 underline underline-offset-4"
              >
                닫기
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => {
                setInspectionMode("common");
                setCommonStep("init");
                setCommonParticipant("");
                setCommonParticipantId("");
              }}
              className={`rounded-xl border p-4 text-left transition flex flex-col justify-center min-h-[160px] ${
                inspectionMode === "common"
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100"
              }`}
            >
              <span className="text-base font-bold">공통 질문 검사 (5문항)</span>
              <span
                className={`mt-1 block text-xs ${
                  inspectionMode === "common" ? "text-white/80" : "text-neutral-600"
                }`}
              >
                사전 선정된 5개 질문을 순서대로 진행합니다.
              </span>
            </button>

            <button
              onClick={() => {
                setInspectionMode("custom");
                setCustomStep("running");
                setCurrentGroupId(crypto.randomUUID());
              }}
              className={`rounded-xl border p-4 text-left transition flex flex-col justify-center min-h-[160px] ${
                inspectionMode === "custom"
                  ? "border-black bg-black text-white"
                  : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100"
              }`}
            >
              <span className="text-base font-bold">자율 질문 검사 (연속 기록)</span>
              <span
                className={`mt-1 block text-xs ${
                  inspectionMode === "custom" ? "text-white/80" : "text-neutral-600"
                }`}
              >
                직접 질문을 입력하며 여러 참가자를 연속으로 기록합니다.
              </span>
            </button>
          </div>
        </section>

        {/* ==================================================== */}
        {/* [검사 화면] 공통 질문 검사                           */}
        {/* ==================================================== */}
        {inspectionMode === "common" && (
          <section className="mt-6 rounded-2xl border-2 border-black bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                공통 질문 검사 모드
              </span>
              <button
                onClick={() => setInspectionMode("none")}
                className="text-xs text-neutral-400 hover:text-black"
              >
                ✕ 취소
              </button>
            </div>

            {/* 단계 1: 참가자 입력 */}
            {commonStep === "init" && (
              <div className="mt-6 max-w-lg space-y-4">
                <h3 className="text-xl font-bold">참가자 이름을 입력해 주세요</h3>
                <p className="text-sm text-neutral-500">
                  기존에 참여했던 참가자라면 자동으로 인식되어 동일한 기록에 통합됩니다.
                </p>

                {commonQuestions.length < 5 && (
                  <p className="rounded-lg bg-red-50 p-3 text-xs text-red-600">
                    현재 등록된 공통 질문이 {commonQuestions.length}개입니다. 5개 질문이 모두
                    확정되어야 검사를 진행할 수 있습니다.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">
                    참가자 이름
                  </label>
                  <input
                    value={commonParticipant}
                    onChange={(e) => setCommonParticipant(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startCommonInspection()}
                    placeholder="예: 홍길동"
                    className="w-full rounded-lg border border-neutral-300 p-3 outline-none focus:border-black"
                  />
                  {(() => {
                    const info = getExistingParticipantInfo(commonParticipant);
                    if (info) {
                      return (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                          <span>✓</span>
                          <span>
                            기존 참가자 자동 인식됨 (기존 검사 {info.count}회 기록에 자동 통합)
                          </span>
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                <button
                  onClick={startCommonInspection}
                  disabled={!commonParticipant.trim() || commonQuestions.length < 5}
                  className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-30 hover:bg-neutral-800 transition"
                >
                  검사 시작 ({commonParticipant.trim() || "이름 미입력"})
                </button>
              </div>
            )}

            {/* 단계 2: 질문 진행 (1~5번) */}
            {commonStep === "running" && (
              <div className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-400">
                      진행 순서 {commonCurrentIndex + 1} / 5
                    </span>
                    <h3 className="mt-1 text-2xl font-bold">참가자: {commonParticipant}</h3>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                    질문 {commonCurrentIndex + 1}
                  </span>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
                  <p className="text-xs font-medium text-neutral-500">질문 내용</p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900">
                    {commonQuestions[commonCurrentIndex]?.content}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold">참가자 답변</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCommonAnswer("yes")}
                        className={`rounded-lg border p-4 text-base font-bold transition ${
                          commonAnswer === "yes"
                            ? "border-black bg-black text-white"
                            : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        예
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommonAnswer("no")}
                        className={`rounded-lg border p-4 text-base font-bold transition ${
                          commonAnswer === "no"
                            ? "border-black bg-black text-white"
                            : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        아니오
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold">거짓말탐지기 판정</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCommonResult("truth")}
                        className={`rounded-lg border p-4 text-base font-bold transition ${
                          commonResult === "truth"
                            ? "border-green-600 bg-green-600 text-white"
                            : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        진실
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommonResult("lie")}
                        className={`rounded-lg border p-4 text-base font-bold transition ${
                          commonResult === "lie"
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-neutral-300 bg-white hover:bg-neutral-50"
                        }`}
                      >
                        거짓
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addCommonQuestionRecord}
                  disabled={!commonAnswer || !commonResult}
                  className="w-full rounded-xl bg-black py-4 text-base font-bold text-white transition disabled:opacity-30 hover:bg-neutral-800"
                >
                  {commonCurrentIndex + 1 === 5
                    ? "5번째 질문 완료 및 최종 확인"
                    : "질문 기록 후 다음 질문 →"}
                </button>

                {commonRecords.length > 0 && (
                  <div className="mt-8 border-t border-neutral-200 pt-6">
                    <h4 className="text-sm font-bold text-neutral-700">현재까지 작성된 기록</h4>
                    <div className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                      {commonRecords.map((r, idx) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-4"
                        >
                          <div>
                            <span className="text-xs font-semibold text-neutral-400">
                              질문 {idx + 1}
                            </span>
                            <p className="font-medium text-neutral-900">{r.question}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                              <span>답변:</span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-bold ${
                                  r.answer === "yes"
                                    ? "border border-neutral-900 bg-neutral-900 text-white"
                                    : "border border-neutral-400 bg-white text-neutral-900"
                                }`}
                              >
                                {r.answer === "yes" ? "예" : "아니오"}
                              </span>
                              <span className="text-neutral-300">|</span>
                              <span>판정:</span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-bold ${
                                  r.result === "truth"
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border border-rose-200 bg-rose-50 text-rose-700"
                                }`}
                              >
                                {r.result === "truth" ? "진실" : "거짓"}
                              </span>
                            </p>
                          </div>
                          <button
                            onClick={() => setEditingCommonRecordIndex(idx)}
                            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                          >
                            수정
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 단계 3: 최종 확인 화면 */}
            {commonStep === "confirm" && (
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-2xl font-bold">최종 검사 결과 확인</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    참가자: <strong>{commonParticipant}</strong> (총 5개 질문)
                  </p>
                </div>

                <div className="space-y-4">
                  {commonRecords.map((r, idx) => (
                    <div
                      key={r.id}
                      className="flex flex-col justify-between min-h-[140px] p-5 sm:p-6 rounded-xl border border-neutral-200 bg-white"
                    >
                      {/* 상단: 질문 텍스트 */}
                      <div>
                        <span className="text-xs font-semibold text-neutral-400">
                          질문 {idx + 1}
                        </span>
                        <p className="mt-2 text-base sm:text-lg font-medium leading-relaxed text-neutral-900 break-words">
                          {r.question}
                        </p>
                      </div>

                      {/* 하단: 사용자 답변 및 거탐 판별 영역 (CSS Grid 정렬 그룹) */}
                      <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-4">
                        <div className="inline-grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 rounded-xl bg-neutral-50 px-4 py-3 border border-neutral-200/60 shadow-2xs">
                          <span className="text-xs sm:text-sm font-medium text-neutral-600 text-left">
                            사용자 답변:
                          </span>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const nextAnswer = r.answer === "yes" ? "no" : "yes";
                                setCommonRecords((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, answer: nextAnswer } : item
                                  )
                                );
                              }}
                              className={`w-28 text-center rounded-lg border py-1.5 text-xs font-bold transition shadow-xs ${
                                r.answer === "yes"
                                  ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800"
                                  : "border-neutral-400 bg-white text-neutral-900 hover:bg-neutral-50"
                              }`}
                            >
                              {r.answer === "yes" ? "예" : "아니오"}
                            </button>
                          </div>

                          <span className="text-xs sm:text-sm font-medium text-neutral-600 text-left">
                            거탐 판별:
                          </span>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const nextRes = r.result === "truth" ? "lie" : "truth";
                                setCommonRecords((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, result: nextRes } : item
                                  )
                                );
                              }}
                              className={`w-28 text-center rounded-lg border py-1.5 text-xs font-bold transition shadow-xs ${
                                r.result === "truth"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                            >
                              {r.result === "truth" ? "진실" : "거짓"}
                            </button>
                          </div>
                        </div>

                        <span className="text-xs text-neutral-400">
                          * 버튼을 클릭하여 답변과 판정을 변경할 수 있습니다.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCommonStep("running")}
                    className="rounded-xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    ← 뒤로 돌아가기
                  </button>
                  <button
                    type="button"
                    onClick={saveFinalCommonInspection}
                    className="flex-1 rounded-xl bg-black py-3 font-bold text-white hover:bg-neutral-800"
                  >
                    최종 저장 및 완료
                  </button>
                </div>
              </div>
            )}

            {/* 단계 4: 완료 */}
            {commonStep === "done" && (
              <div className="mt-6 py-6 text-center">
                <h3 className="text-xl font-bold">{commonParticipant}님의 공통 검사 완료</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  다음 진행할 작업을 선택해 주세요.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    onClick={startCustomWithSameParticipant}
                    className="rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white hover:bg-neutral-800 shadow-sm transition"
                  >
                    같은 참가자로 자율 질문 시작하기
                  </button>
                  <button
                    onClick={() => setInspectionMode("none")}
                    className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50 transition"
                  >
                    대시보드로 나가기
                  </button>
                </div>
              </div>
            )}

            {/* 개별 질문 수정 모달 */}
            {editingCommonRecordIndex !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <h4 className="text-lg font-bold">
                    질문 {editingCommonRecordIndex + 1} 수정
                  </h4>

                  <div className="mt-4 space-y-4">
                    <label className="block text-sm font-medium">
                      공통 질문 선택
                      <select
                        value={commonRecords[editingCommonRecordIndex]?.sourceQuestionId || ""}
                        onChange={(e) => {
                          const selected = commonQuestions.find((q) => q.id === e.target.value);
                          if (selected) {
                            setCommonRecords((prev) =>
                              prev.map((item, i) =>
                                i === editingCommonRecordIndex
                                  ? {
                                      ...item,
                                      sourceQuestionId: selected.id,
                                      question: selected.content,
                                    }
                                  : item
                              )
                            );
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-sm"
                      >
                        {commonQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.content}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block text-sm font-medium">
                      참가자 답변
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCommonRecords((prev) =>
                              prev.map((item, i) =>
                                i === editingCommonRecordIndex ? { ...item, answer: "yes" } : item
                              )
                            );
                          }}
                          className={`rounded-lg border p-2 text-sm font-bold transition ${
                            commonRecords[editingCommonRecordIndex]?.answer === "yes"
                              ? "border-black bg-black text-white"
                              : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          예
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCommonRecords((prev) =>
                              prev.map((item, i) =>
                                i === editingCommonRecordIndex ? { ...item, answer: "no" } : item
                              )
                            );
                          }}
                          className={`rounded-lg border p-2 text-sm font-bold transition ${
                            commonRecords[editingCommonRecordIndex]?.answer === "no"
                              ? "border-black bg-black text-white"
                              : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                          }`}
                        >
                          아니오
                        </button>
                      </div>
                    </label>

                    <label className="block text-sm font-medium">
                      탐지기 판정
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCommonRecords((prev) =>
                              prev.map((item, i) =>
                                i === editingCommonRecordIndex
                                  ? { ...item, result: "truth" }
                                  : item
                              )
                            );
                          }}
                          className={`rounded-lg border p-2 text-sm font-bold ${
                            commonRecords[editingCommonRecordIndex]?.result === "truth"
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-neutral-300"
                          }`}
                        >
                          진실
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCommonRecords((prev) =>
                              prev.map((item, i) =>
                                i === editingCommonRecordIndex
                                  ? { ...item, result: "lie" }
                                  : item
                              )
                            );
                          }}
                          className={`rounded-lg border p-2 text-sm font-bold ${
                            commonRecords[editingCommonRecordIndex]?.result === "lie"
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-neutral-300"
                          }`}
                        >
                          거짓
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setEditingCommonRecordIndex(null)}
                      className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white"
                    >
                      수정 완료
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* [검사 화면] 자율 질문 검사 (연속 기록)               */}
        {/* ==================================================== */}
        {inspectionMode === "custom" && (
          <section className="mt-6 rounded-2xl border-2 border-black bg-white p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                자율 질문 검사 모드 (연속 기록)
              </span>
              <button
                onClick={() => setInspectionMode("none")}
                className="text-xs text-neutral-400 hover:text-black"
              >
                ✕ 취소
              </button>
            </div>

            {customStep === "running" && (
              <div className="mt-6 space-y-6">
                <p className="text-sm text-neutral-500">
                  참가자 이름을 입력하고 질문을 연속으로 추가하세요. 참가자 이름을 변경하면 다음 질문부터 새 참가자에게 적용됩니다.
                </p>

                {/* 입력 폼 */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 space-y-4">
                  {/* 참가자 입력 */}
                  <div>
                    <label className="block text-sm font-semibold">
                      현재 참가자 이름
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        (변경 시 다음 질문부터 새 참가자로 기록됩니다)
                      </span>
                    </label>
                    <input
                      value={customParticipant}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomParticipant(val);
                        if (val.trim() !== lastAssignedName) {
                          setCustomParticipantId(resolveParticipantIdByName(val));
                        }
                      }}
                      placeholder="예: 김선린"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3 outline-none focus:border-black"
                    />
                    {(() => {
                      const info = getExistingParticipantInfo(customParticipant);
                      if (info) {
                        return (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                            <span>✓</span>
                            <span>
                              기존 참가자 자동 인식됨 ({info.count}회 검사 기록에 통합)
                            </span>
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* 질문 내용 직접 입력 */}
                  <div>
                    <label className="block text-sm font-semibold">질문 내용 (직접 입력)</label>
                    <input
                      value={customQuestionInput}
                      onChange={(e) => setCustomQuestionInput(e.target.value)}
                      placeholder="질문을 입력하세요"
                      className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3 outline-none focus:border-black"
                    />
                  </div>

                  {/* 답변 & 판정 */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold">참가자 답변</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomAnswer("yes")}
                          className={`rounded-lg border p-3 font-bold transition ${
                            customAnswer === "yes"
                              ? "border-black bg-black text-white"
                              : "border-neutral-300 bg-white hover:bg-neutral-100"
                          }`}
                        >
                          예
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomAnswer("no")}
                          className={`rounded-lg border p-3 font-bold transition ${
                            customAnswer === "no"
                              ? "border-black bg-black text-white"
                              : "border-neutral-300 bg-white hover:bg-neutral-100"
                          }`}
                        >
                          아니오
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold">거짓말탐지기 판정</label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomResult("truth")}
                          className={`rounded-lg border p-3 font-bold transition ${
                            customResult === "truth"
                              ? "border-green-600 bg-green-600 text-white"
                              : "border-neutral-300 bg-white hover:bg-neutral-100"
                          }`}
                        >
                          진실
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomResult("lie")}
                          className={`rounded-lg border p-3 font-bold transition ${
                            customResult === "lie"
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-neutral-300 bg-white hover:bg-neutral-100"
                          }`}
                        >
                          거짓
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addCustomQuestionRecord}
                    disabled={
                      !customParticipant.trim() ||
                      !customQuestionInput.trim() ||
                      !customAnswer ||
                      !customResult
                    }
                    className="w-full rounded-xl bg-black py-3.5 font-bold text-white transition disabled:opacity-30 hover:bg-neutral-800"
                  >
                    + 질문 기록 추가
                  </button>
                </div>

                {/* 현재까지 작성된 기록 목록 */}
                {customRecords.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-neutral-800">
                        현재까지 작성된 기록 ({customRecords.length}건)
                      </h4>
                      <button
                        onClick={() => setCustomStep("confirm")}
                        className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800"
                      >
                        최종 확인 및 완료 →
                      </button>
                    </div>

                    <div className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                      {customRecords.map((r, idx) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-4"
                        >
                          <div>
                            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                              {r.participantName}
                            </span>
                            <span className="ml-2 text-xs text-neutral-400">#{idx + 1}</span>
                            <p className="mt-1 font-medium text-neutral-900">{r.question}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                              <span>답변:</span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-bold ${
                                  r.answer === "yes"
                                    ? "border border-neutral-900 bg-neutral-900 text-white"
                                    : "border border-neutral-400 bg-white text-neutral-900"
                                }`}
                              >
                                {r.answer === "yes" ? "예" : "아니오"}
                              </span>
                              <span className="text-neutral-300">|</span>
                              <span>판정:</span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-bold ${
                                  r.result === "truth"
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border border-rose-200 bg-rose-50 text-rose-700"
                                }`}
                              >
                                {r.result === "truth" ? "진실" : "거짓"}
                              </span>
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingCustomRecordId(r.id)}
                              className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => {
                                setCustomRecords((prev) => prev.filter((item) => item.id !== r.id));
                              }}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 최종 확인 화면 */}
            {customStep === "confirm" && (
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-2xl font-bold">최종 자율 검사 결과 확인</h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    작성된 전체 {customRecords.length}개의 질문을 검사 세션으로 저장합니다.
                  </p>
                </div>

                <div className="space-y-4">
                  {customRecords.map((r, idx) => (
                    <div
                      key={r.id}
                      className="flex flex-col justify-between min-h-[140px] p-5 sm:p-6 rounded-xl border border-neutral-200 bg-white"
                    >
                      {/* 상단: 참가자명 및 질문 텍스트 */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-800">
                            {r.participantName}
                          </span>
                          <span className="text-xs text-neutral-400 font-semibold">#{idx + 1}</span>
                        </div>
                        <p className="mt-2 text-base sm:text-lg font-medium leading-relaxed text-neutral-900 break-words">
                          {r.question}
                        </p>
                      </div>

                      {/* 하단: 사용자 답변 및 거탐 판별 영역 (CSS Grid 정렬 그룹) */}
                      <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-4">
                        <div className="inline-grid grid-cols-[auto_auto] items-center gap-x-4 gap-y-2 rounded-xl bg-neutral-50 px-4 py-3 border border-neutral-200/60 shadow-2xs">
                          <span className="text-xs sm:text-sm font-medium text-neutral-600 text-left">
                            사용자 답변:
                          </span>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const nextAnswer = r.answer === "yes" ? "no" : "yes";
                                setCustomRecords((prev) =>
                                  prev.map((item) =>
                                    item.id === r.id ? { ...item, answer: nextAnswer } : item
                                  )
                                );
                              }}
                              className={`w-28 text-center rounded-lg border py-1.5 text-xs font-bold transition shadow-xs ${
                                r.answer === "yes"
                                  ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800"
                                  : "border-neutral-400 bg-white text-neutral-900 hover:bg-neutral-50"
                              }`}
                            >
                              {r.answer === "yes" ? "예" : "아니오"}
                            </button>
                          </div>

                          <span className="text-xs sm:text-sm font-medium text-neutral-600 text-left">
                            거탐 판별:
                          </span>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                const nextRes = r.result === "truth" ? "lie" : "truth";
                                setCustomRecords((prev) =>
                                  prev.map((item) =>
                                    item.id === r.id ? { ...item, result: nextRes } : item
                                  )
                                );
                              }}
                              className={`w-28 text-center rounded-lg border py-1.5 text-xs font-bold transition shadow-xs ${
                                r.result === "truth"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                            >
                              {r.result === "truth" ? "진실" : "거짓"}
                            </button>
                          </div>
                        </div>

                        <span className="text-xs text-neutral-400">
                          * 버튼을 클릭하여 답변과 판정을 변경할 수 있습니다.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCustomStep("running")}
                    className="rounded-xl border border-neutral-300 px-5 py-3 font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    ← 뒤로 돌아가기
                  </button>
                  <button
                    type="button"
                    onClick={saveFinalCustomInspection}
                    className="flex-1 rounded-xl bg-black py-3 font-bold text-white hover:bg-neutral-800"
                  >
                    최종 저장 및 완료
                  </button>
                </div>
              </div>
            )}

            {/* 완료 */}
            {customStep === "done" && (
              <div className="mt-6 py-6 text-center">
                <h3 className="text-xl font-bold">자율 질문 검사 완료</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  모든 참가자의 자율 검사 결과 저장이 완료되었습니다.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => {
                      setCustomStep("running");
                      setCustomParticipant("");
                      setCustomParticipantId("");
                      setCustomRecords([]);
                      setCurrentGroupId(crypto.randomUUID());
                    }}
                    className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    새 자율 질문 검사 시작
                  </button>
                  <button
                    onClick={() => setInspectionMode("none")}
                    className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50"
                  >
                    대시보드로 나가기
                  </button>
                </div>
              </div>
            )}

            {/* 자율 질문 수정 모달 */}
            {editingCustomRecordId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <h4 className="text-lg font-bold">자율 질문 기록 수정</h4>
                  {(() => {
                    const item = customRecords.find((r) => r.id === editingCustomRecordId);
                    if (!item) return null;
                    return (
                      <div className="mt-4 space-y-4">
                        <label className="block text-sm font-medium">
                          참가자 이름
                          <input
                            value={item.participantName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomRecords((prev) =>
                                prev.map((r) =>
                                  r.id === item.id ? { ...r, participantName: val } : r
                                )
                              );
                            }}
                            className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          질문 내용
                          <input
                            value={item.question}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomRecords((prev) =>
                                prev.map((r) =>
                                  r.id === item.id ? { ...r, question: val } : r
                                )
                              );
                            }}
                            className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm outline-none"
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          참가자 답변
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomRecords((prev) =>
                                  prev.map((r) => (r.id === item.id ? { ...r, answer: "yes" } : r))
                                );
                              }}
                              className={`rounded-lg border p-2 text-sm font-bold transition ${
                                item.answer === "yes"
                                  ? "border-black bg-black text-white"
                                  : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                              }`}
                            >
                              예
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomRecords((prev) =>
                                  prev.map((r) => (r.id === item.id ? { ...r, answer: "no" } : r))
                                );
                              }}
                              className={`rounded-lg border p-2 text-sm font-bold transition ${
                                item.answer === "no"
                                  ? "border-black bg-black text-white"
                                  : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                              }`}
                            >
                              아니오
                            </button>
                          </div>
                        </label>
                        <label className="block text-sm font-medium">
                          탐지기 판정
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomRecords((prev) =>
                                  prev.map((r) =>
                                    r.id === item.id ? { ...r, result: "truth" } : r
                                  )
                                );
                              }}
                              className={`rounded-lg border p-2 text-sm font-bold ${
                                item.result === "truth"
                                  ? "border-green-600 bg-green-600 text-white"
                                  : "border-neutral-300"
                              }`}
                            >
                              진실
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomRecords((prev) =>
                                  prev.map((r) =>
                                    r.id === item.id ? { ...r, result: "lie" } : r
                                  )
                                );
                              }}
                              className={`rounded-lg border p-2 text-sm font-bold ${
                                item.result === "lie"
                                  ? "border-red-600 bg-red-600 text-white"
                                  : "border-neutral-300"
                              }`}
                            >
                              거짓
                            </button>
                          </div>
                        </label>
                      </div>
                    );
                  })()}
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setEditingCustomRecordId(null)}
                      className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white"
                    >
                      완료
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------ */}
        {/* 관리 탭 네비게이션                        */}
        {/* ------------------------------------------ */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTab("sessions")}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                tab === "sessions"
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
              }`}
            >
              검사 세션 관리 ({activeSessions.length})
            </button>
            <button
              onClick={() => setTab("questions")}
              className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${
                tab === "questions"
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
              }`}
            >
              공통 질문 관리 ({commonQuestions.length}/5)
            </button>
          </div>
          <Link
            href="/log"
            className="text-xs sm:text-sm font-semibold text-neutral-600 hover:text-black underline underline-offset-4"
          >
            전체 로그 및 감사 이력 (/log) →
          </Link>
        </div>

        {/* ==================================================== */}
        {/* [탭 1] 검사 세션 관리 (활성 세션 중심)              */}
        {/* ==================================================== */}
        {tab === "sessions" && (
          <section className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="참가자 이름 또는 검사 번호 검색"
                className="w-full sm:w-80 rounded-lg border border-neutral-300 p-2.5 text-sm outline-none focus:border-black"
              />
              <span className="text-xs text-neutral-500">
                총 {filteredSessions.length}건
              </span>
            </div>

            <div className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-neutral-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900">{session.number}</span>
                      <span className="font-bold text-lg">{session.participantName}</span>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 font-medium">
                        {session.type === "common" ? "공통" : "자율"} ({session.questions.length}문항)
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      {new Date(session.createdAt).toLocaleString("ko-KR")}
                      {session.participantId && (
                        <span className="ml-2 font-mono text-neutral-400">
                          ID: {session.participantId.slice(0, 10)}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSessionPublic(session)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        session.isPublic
                          ? "border-green-300 bg-green-50 text-green-700"
                          : "border-neutral-300 bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {session.isPublic ? "공개 중" : "비공개"}
                    </button>
                    <button
                      onClick={() => setEditingSession(session)}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100"
                    >
                      질문 수정
                    </button>
                    <button
                      onClick={() => {
                        setRetractingLogId(session.id);
                        setRetractReason("");
                      }}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      취소 (Retract)
                    </button>
                  </div>
                </div>
              ))}

              {filteredSessions.length === 0 && (
                <div className="p-12 text-center text-sm text-neutral-400">
                  등록된 검사 세션이 없습니다.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* [탭 2] 전체 로그 및 감사 이력 (PROMPT.md 8)          */}
        {/* ==================================================== */}
        {tab === "logs" && (
          <section className="mt-6 space-y-6">
            {/* 상단 툴바: 필터 및 전체 재집계 유지보수 버튼 */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="참가자명 · 검사번호 · 작업ID"
                  className="rounded-lg border border-neutral-300 bg-white p-2 text-sm outline-none w-56 focus:border-black"
                />

                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value as any)}
                  className="rounded-lg border border-neutral-300 bg-white p-2 text-sm outline-none"
                >
                  <option value="all">모든 검사 유형</option>
                  <option value="common">공통 질문 검사</option>
                  <option value="custom">자율 질문 검사</option>
                </select>

                <select
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-neutral-300 bg-white p-2 text-sm outline-none"
                >
                  <option value="all">모든 로그 상태</option>
                  <option value="active">정상 (Active)</option>
                  <option value="retracted">취소됨 (Retracted)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleRecalculateAll}
                className="rounded-lg border border-neutral-800 bg-white px-3.5 py-2 text-xs font-bold text-neutral-900 hover:bg-neutral-100 transition"
              >
                ↻ 전체 로그 재집계 실행
              </button>
            </div>

            {/* 전체 검사 로그 테이블 (PROMPT.md 8) */}
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="p-3.5 font-medium">검사번호</th>
                    <th className="p-3.5 font-medium">참가자 (ID)</th>
                    <th className="p-3.5 font-medium">유형</th>
                    <th className="p-3.5 font-medium">문항수</th>
                    <th className="p-3.5 font-medium">버전</th>
                    <th className="p-3.5 font-medium">상태</th>
                    <th className="p-3.5 font-medium">검사 일시</th>
                    <th className="p-3.5 font-medium text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {filteredLogs.map((log) => {
                    const isRetracted = log.status === "retracted";
                    return (
                      <tr
                        key={log.id}
                        className={isRetracted ? "bg-neutral-50/70 text-neutral-400" : "hover:bg-neutral-50"}
                      >
                        <td className="p-3.5 font-semibold text-neutral-900">
                          {log.number}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-neutral-900">{log.participantName}</span>
                          <span className="ml-1.5 block text-xs font-mono text-neutral-400">
                            {log.participantId?.slice(0, 12)}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                            {log.type === "common" ? "공통" : "자율"}
                          </span>
                        </td>
                        <td className="p-3.5">{log.questions.length}문항</td>
                        <td className="p-3.5 font-mono text-xs">v{log.version || 1}</td>
                        <td className="p-3.5">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              isRetracted
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {isRetracted ? "취소됨 (retracted)" : "정상 (active)"}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs text-neutral-500">
                          {new Date(log.createdAt).toLocaleString("ko-KR")}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setViewingLogDetail(log)}
                              className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 text-neutral-700"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => setEditingSession(log)}
                              className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 text-neutral-700"
                            >
                              수정
                            </button>
                            {isRetracted ? (
                              <button
                                onClick={() => executeRestore(log.id)}
                                className="rounded border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                              >
                                복구
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setRetractingLogId(log.id);
                                  setRetractReason("");
                                }}
                                className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                취소
                              </button>
                            )}
                            <button
                              onClick={() => setViewingAuditLogTargetId(log.id)}
                              className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-mono text-neutral-500 hover:bg-neutral-200"
                              title="변경 이력 보기"
                            >
                              이력
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-neutral-400">
                        조건에 맞는 검사 로그가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 감사 이력 타임라인 (PROMPT.md 8.3) */}
            <div className="mt-8 rounded-xl border border-neutral-200 p-5">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-base">최근 작업 감사 로그 (Audit History)</h3>
                <span className="text-xs text-neutral-400">총 {auditLogs.length}건</span>
              </div>
              <div className="mt-4 divide-y divide-neutral-100 max-h-80 overflow-y-auto">
                {auditLogs.slice(0, 30).map((audit) => (
                  <div key={audit.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold uppercase tracking-wider text-neutral-700 mr-2">
                        [{audit.action}]
                      </span>
                      <span className="text-neutral-500 mr-2">
                        {audit.targetType} #{audit.targetId.slice(0, 8)}
                      </span>
                      {audit.reason && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
                          {audit.reason}
                        </span>
                      )}
                    </div>
                    <span className="text-neutral-400 font-mono">
                      {new Date(audit.timestamp).toLocaleTimeString("ko-KR")}
                    </span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="py-6 text-center text-neutral-400 text-xs">
                    감사 로그가 아직 기록되지 않았습니다.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* [탭 3] 공통 질문 관리                                */}
        {/* ==================================================== */}
        {tab === "questions" && (
          <section className="mt-6 space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm text-neutral-700">
                공통 질문 검사는 사전에 확정된 <strong>정확히 5개의 질문</strong>으로 순서대로
                진행됩니다.
                {commonQuestions.length === 5 ? (
                  <span className="ml-2 font-bold text-green-700">
                    ✓ 5개 질문이 정상 확정되어 있습니다.
                  </span>
                ) : (
                  <span className="ml-2 font-bold text-red-600">
                    (현재 {commonQuestions.length}개 / 5개가 필요합니다)
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <input
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCommonQuestion()}
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 p-3 outline-none focus:border-black"
                placeholder="추가할 공통 질문 내용 입력"
              />
              <button
                onClick={addCommonQuestion}
                className="rounded-lg bg-black px-5 font-medium text-white hover:bg-neutral-800"
              >
                + 질문 추가
              </button>
            </div>

            <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
              {commonQuestions.map((q, idx) => (
                <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">
                      {idx + 1}
                    </span>
                    {editingQuestionId === q.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editingQuestionText}
                          onChange={(e) => setEditingQuestionText(e.target.value)}
                          className="rounded-lg border border-neutral-300 p-2 text-sm outline-none"
                        />
                        <button
                          onClick={() => saveEditedQuestion(q.id)}
                          className="rounded bg-black px-3 py-1 text-xs text-white"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setEditingQuestionId(null)}
                          className="rounded border border-neutral-300 px-3 py-1 text-xs"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-neutral-900">{q.content}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveCommonQuestion(idx, "up")}
                      disabled={idx === 0}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30 hover:bg-neutral-50"
                      title="위로 이동"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveCommonQuestion(idx, "down")}
                      disabled={idx === commonQuestions.length - 1}
                      className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30 hover:bg-neutral-50"
                    >
                      ▼
                    </button>
                    {editingQuestionId !== q.id && (
                      <button
                        onClick={() => {
                          setEditingQuestionId(q.id);
                          setEditingQuestionText(q.content);
                        }}
                        className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50"
                      >
                        수정
                      </button>
                    )}
                    <button
                      onClick={() => deleteCommonQuestion(q.id)}
                      className="rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}

              {commonQuestions.length === 0 && (
                <div className="p-8 text-center text-sm text-neutral-400">
                  공통 질문이 등록되어 있지 않습니다.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 1: 로그 상세 모달 (PROMPT.md 8)       */}
        {/* ------------------------------------------ */}
        {viewingLogDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-xl font-bold">
                  {viewingLogDetail.number} 검사 원본 로그 상세
                </h3>
                <button
                  onClick={() => setViewingLogDetail(null)}
                  className="text-neutral-400 hover:text-black"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 p-3 text-xs">
                  <div>
                    <span className="text-neutral-400">참가자명:</span>{" "}
                    <strong>{viewingLogDetail.participantName}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-400">참가자 ID:</span>{" "}
                    <span className="font-mono">{viewingLogDetail.participantId}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">작업 ID (opId):</span>{" "}
                    <span className="font-mono">{viewingLogDetail.operationId.slice(0, 16)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">현재 버전:</span> v{viewingLogDetail.version}
                  </div>
                  <div>
                    <span className="text-neutral-400">검사 유형:</span>{" "}
                    {viewingLogDetail.type === "common" ? "공통 질문" : "자율 질문"}
                  </div>
                  <div>
                    <span className="text-neutral-400">로그 상태:</span>{" "}
                    <span className={viewingLogDetail.status === "active" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {viewingLogDetail.status}
                    </span>
                  </div>
                </div>

                <h4 className="font-bold pt-2 text-neutral-800">포함된 질문 목록</h4>
                <div className="space-y-2">
                  {viewingLogDetail.questions.map((q, idx) => (
                    <div key={q.id} className="rounded-lg border border-neutral-200 p-3 text-xs">
                      <div className="flex items-center justify-between font-semibold text-neutral-400">
                        <span>질문 {idx + 1}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                            q.result === "truth"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {q.result === "truth" ? "진실" : "거짓"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-neutral-900">{q.question}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-neutral-500">
                        <span>답변:</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                            q.answer === "yes"
                              ? "border border-blue-200 bg-blue-50 text-blue-700"
                              : "border border-neutral-300 bg-neutral-100 text-neutral-700"
                          }`}
                        >
                          {q.answer === "yes" ? "예" : "아니오"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setViewingLogDetail(null)}
                  className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 2: 로그 수정 모달 (PROMPT.md 3, 8.1)  */}
        {/* ------------------------------------------ */}
        {editingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-xl font-bold">
                  {editingSession.number} · {editingSession.participantName} 검사 수정
                </h3>
                <button
                  onClick={() => setEditingSession(null)}
                  className="text-neutral-400 hover:text-black"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium">
                  참가자 이름
                  <input
                    value={editingSession.participantName}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        participantName: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm outline-none"
                  />
                </label>

                <h4 className="pt-2 text-sm font-bold text-neutral-700">질문별 내용 수정</h4>
                <div className="space-y-3">
                  {editingSession.questions.map((q) => (
                    <div key={q.id} className="rounded-xl border border-neutral-200 p-3">
                      <span className="text-xs font-bold text-neutral-400">질문</span>
                      <input
                        value={q.question}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingSession({
                            ...editingSession,
                            questions: editingSession.questions.map((item) =>
                              item.id === q.id ? { ...item, question: val } : item
                            ),
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm outline-none"
                      />
                      <div className="mt-2 flex gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const nextAns = q.answer === "yes" ? "no" : "yes";
                            setEditingSession({
                              ...editingSession,
                              questions: editingSession.questions.map((item) =>
                                item.id === q.id ? { ...item, answer: nextAns } : item
                              ),
                            });
                          }}
                          className="rounded border border-neutral-300 px-2.5 py-1"
                        >
                          답변: <strong>{q.answer === "yes" ? "예" : "아니오"}</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextRes = q.result === "truth" ? "lie" : "truth";
                            setEditingSession({
                              ...editingSession,
                              questions: editingSession.questions.map((item) =>
                                item.id === q.id ? { ...item, result: nextRes } : item
                              ),
                            });
                          }}
                          className="rounded border border-neutral-300 px-2.5 py-1"
                        >
                          판정: <strong>{q.result === "truth" ? "진실" : "거짓"}</strong>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                <button
                  onClick={() => setEditingSession(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    await inspectionRepo.update(
                      editingSession.id,
                      editingSession,
                      "관리자 UI 질문/참가자 수정"
                    );
                    setEditingSession(null);
                    refetchInspections();
                    refetchAuditLogs();
                    alert("수정 완료! 변경 이력이 감사 로그에 기록되었습니다.");
                  }}
                  className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  새 버전으로 저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 3: 취소(Retract) 사유 입력 모달 (PROMPT.md 8.2) */}
        {/* ------------------------------------------ */}
        {retractingLogId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-red-600">검사 로그 취소 (Retract)</h3>
              <p className="mt-2 text-xs text-neutral-500 leading-5">
                검사 기록을 취소(비활성화)하면 공개 집계 결과에서 제외되며, 감사 로그에 사유가 영구 보존됩니다.
              </p>

              <label className="block text-sm font-medium mt-4">
                취소 사유 입력
                <input
                  value={retractReason}
                  onChange={(e) => setRetractReason(e.target.value)}
                  placeholder="예: 참가자 요청 / 오입력 취소"
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-sm outline-none focus:border-black"
                />
              </label>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setRetractingLogId(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium hover:bg-neutral-50"
                >
                  닫기
                </button>
                <button
                  onClick={() => executeRetract(retractingLogId)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  확인 및 취소 실행
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 4: 특정 대상 감사 이력 뷰어 (PROMPT.md 8.3) */}
        {/* ------------------------------------------ */}
        {viewingAuditLogTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-base font-bold">
                  #{viewingAuditLogTargetId.slice(0, 10)} 변경 감사 이력
                </h3>
                <button
                  onClick={() => setViewingAuditLogTargetId(null)}
                  className="text-neutral-400 hover:text-black"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {auditLogs
                  .filter((a) => a.targetId === viewingAuditLogTargetId)
                  .map((a) => (
                    <div key={a.id} className="rounded-xl border border-neutral-200 p-3 text-xs space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="uppercase text-neutral-800">액션: {a.action}</span>
                        <span className="font-mono text-neutral-400">{new Date(a.timestamp).toLocaleString("ko-KR")}</span>
                      </div>
                      <div className="text-neutral-500">
                        버전: v{a.beforeVersion ?? "최초"} → v{a.afterVersion} | 작업자: {a.actorId}
                      </div>
                      {a.reason && (
                        <div className="text-neutral-700 bg-neutral-50 p-1.5 rounded">
                          사유: {a.reason}
                        </div>
                      )}
                    </div>
                  ))}

                {auditLogs.filter((a) => a.targetId === viewingAuditLogTargetId).length === 0 && (
                  <p className="text-center text-xs text-neutral-400 py-6">
                    기록된 상세 감사 로그가 없습니다.
                  </p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setViewingAuditLogTargetId(null)}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AdminAuthGuard>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageContent />
    </Suspense>
  );
}
