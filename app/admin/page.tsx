"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import AdminNav from "@/components/AdminNav";
import { useLiveAuditLogs, useLiveCommonQuestions, useLiveInspections, useLiveReservations } from "@/lib/hooks";
import {
  clearDraft,
  getDraft,
  inspectionRepo,
  recordAuditLog,
  reservationRepo,
  saveDraft,
} from "@/lib/storage";
import {
  Answer,
  DetectionResult,
  InspectionSession,
  QuestionRecord,
  Reservation,
} from "@/lib/types";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramParticipantName = searchParams.get("participantName");

  const { data: inspections, refetch: refetchInspections } = useLiveInspections();
  const { data: commonQuestions } = useLiveCommonQuestions();
  const { data: auditLogs, refetch: refetchAuditLogs } = useLiveAuditLogs();
  const { data: reservations } = useLiveReservations();

  const [inspectionMode, setInspectionMode] = useState<InspectionMode>("none");

  // 예약 대기열 상위 5명
  const topQueue = useMemo(() => {
    return reservations
      .filter((r) => r.status === "대기")
      .slice(0, 5);
  }, [reservations]);

  // 예약 처리 관련 상태
  const [copiedPhoneId, setCopiedPhoneId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Reservation | null>(null);
  const [undoItem, setUndoItem] = useState<{
    id: number;
    name: string;
    section: string;
    expireSeconds: number;
  } | null>(null);

  // 5초 Undo 카운트다운 타이머
  useEffect(() => {
    if (!undoItem) return;
    const timer = setInterval(() => {
      setUndoItem((prev) => {
        if (!prev) return null;
        if (prev.expireSeconds <= 1) return null;
        return { ...prev, expireSeconds: prev.expireSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [undoItem]);

  // 전화번호 복사 헬퍼
  async function copyPhone(e: React.MouseEvent, row: Reservation) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(row.phone);
      setCopiedPhoneId(row.id);
      setTimeout(() => setCopiedPhoneId(null), 1500);
    } catch {
      window.prompt("전화번호를 복사하세요:", row.phone);
    }
  }

  // 큐 처리 (입장 처리)
  async function processQueueItem(item: Reservation, thenInspect: boolean = false) {
    try {
      await reservationRepo.update(item.id, { status: "완료" });

      await recordAuditLog({
        operationId: `queue_${item.id}_${Date.now()}`,
        targetType: "reservation",
        targetId: String(item.id),
        action: "update",
        beforeVersion: 1,
        afterVersion: 2,
        changes: {
          status: "완료",
          previousStatus: "대기",
          name: item.name,
          section: item.section,
        },
        reason: thenInspect ? "대기열 처리 후 검사 시작" : "대기열 입장 처리",
      });

      setConfirmTarget(null);

      if (thenInspect) {
        router.push(`/admin?participantName=${encodeURIComponent(item.name)}`);
      } else {
        setUndoItem({
          id: item.id,
          name: item.name,
          section: item.section,
          expireSeconds: 5,
        });
      }
    } catch (e) {
      console.error(e);
      alert("대기열 처리에 실패했습니다.");
    }
  }

  // 5초 Undo 실행
  async function handleQueueUndo() {
    if (!undoItem) return;
    const target = undoItem;
    try {
      await reservationRepo.update(target.id, { status: "대기" });

      await recordAuditLog({
        operationId: `undo_${target.id}_${Date.now()}`,
        targetType: "reservation",
        targetId: String(target.id),
        action: "restore",
        beforeVersion: 2,
        afterVersion: 3,
        changes: {
          status: "대기",
          restoredFrom: "완료",
          name: target.name,
        },
        reason: "대기열 처리 즉시 실행취소(Undo)",
      });

      setUndoItem(null);
    } catch (e) {
      console.error(e);
      alert("실행 취소에 실패했습니다.");
    }
  }

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
        {/* 현재 대기열 상위 5명                       */}
        {/* ------------------------------------------ */}
        <section className="mt-8 rounded-2xl border-2 border-black bg-white p-6 sm:p-7 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900">
                  현재 대기열 상위 5명
                </h2>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                카드를 클릭하여 입장 처리하고, 전화번호를 클릭하여 번호를 바로 복사할 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                총 대기 {reservations.filter((r) => r.status === "대기").length}팀
              </span>
              <Link
                href="/reserve/admin"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-black hover:bg-neutral-50"
              >
                <span>전체 예약자 조회</span>
                <span className="text-sm">→</span>
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {topQueue.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setConfirmTarget(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setConfirmTarget(item);
                  }
                }}
                className="group relative flex flex-col justify-between rounded-xl border border-neutral-300 bg-neutral-50/70 p-4 transition hover:border-black hover:bg-neutral-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-400">
                      순번 {idx + 1}
                    </span>
                    <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-neutral-900 border border-neutral-200">
                      #{String(item.id).padStart(3, "0")}
                    </span>
                  </div>

                  <div className="mt-3">
                    <p className="text-lg font-bold text-neutral-900 group-hover:text-black">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {item.section} 섹션 · {item.people}명 ({item.studentId})
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-neutral-200/80 pt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={(e) => copyPhone(e, item)}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-mono font-bold text-neutral-800 hover:bg-neutral-100 transition active:scale-95"
                    title="클릭하여 전화번호 복사"
                  >
                    <span>{item.phone}</span>
                    <span className="text-[10px] text-neutral-400">복사</span>
                  </button>

                  {copiedPhoneId === item.id ? (
                    <span className="text-xs font-bold text-emerald-600 animate-in fade-in">
                      복사됨!
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-neutral-500 underline underline-offset-2">
                      처리 →
                    </span>
                  )}
                </div>
              </div>
            ))}

            {topQueue.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">
                현재 대기 중인 예약자가 없습니다.
              </div>
            )}
          </div>
        </section>

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

        {/* 대기열 처리 확인 모달 */}
        {confirmTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
              <h3 className="text-lg font-bold text-neutral-900">
                {confirmTarget.name} 님을 대기열에서 처리할까요?
              </h3>
              <p className="mt-2 text-xs text-neutral-500">
                #{String(confirmTarget.id).padStart(3, "0")} · {confirmTarget.section} 섹션 · {confirmTarget.people}명
              </p>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => processQueueItem(confirmTarget, true)}
                  className="w-full rounded-lg bg-black px-4 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 transition"
                >
                  검사
                </button>
                <button
                  type="button"
                  onClick={() => processQueueItem(confirmTarget, false)}
                  className="w-full rounded-lg border border-black bg-white px-4 py-2.5 text-xs font-bold text-black hover:bg-neutral-50 transition"
                >
                  처리
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  className="w-full rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5초 실행취소(Undo) 토스트 */}
        {undoItem && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border-2 border-black bg-neutral-900 p-4 text-white shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 border border-neutral-700 text-xs font-bold text-white">
                {undoItem.expireSeconds}s
              </span>
              <p className="text-sm font-semibold text-white">
                {undoItem.name} 대기열 처리됨
              </p>
            </div>
            <button
              onClick={handleQueueUndo}
              className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition"
            >
              실행취소
            </button>
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
