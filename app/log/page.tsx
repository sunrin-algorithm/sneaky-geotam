"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import AdminNav from "@/components/AdminNav";
import { useLiveAuditLogs, useLiveCommonQuestions, useLiveInspections, useLiveReservations } from "@/lib/hooks";
import { inspectionRepo, recordAuditLog, reservationRepo } from "@/lib/storage";
import { AuditLog, InspectionSession } from "@/lib/types";
import { aggregateParticipants } from "@/lib/aggregation";

type LogTab = "inspections" | "reservations" | "audits";

export default function LogPage() {
  const { data: inspections, refetch: refetchInspections } = useLiveInspections();
  const { data: commonQuestions } = useLiveCommonQuestions();
  const { data: auditLogs, refetch: refetchAuditLogs } = useLiveAuditLogs();
  const { data: reservations, refetch: refetchReservations } = useLiveReservations();

  // 탭 상태
  const [tab, setTab] = useState<LogTab>("inspections");

  // 진입 시 새 로그 알림 읽음 처리 (PROMPT.md 18)
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("admin_last_seen_log_time", new Date().toISOString());
    }
  }, []);

  // 검색 및 필터 상태
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState<"all" | "common" | "custom">("all");
  const [logStatusFilter, setLogStatusFilter] = useState<"all" | "active" | "retracted">("all");

  // 모달 상태
  const [viewingLogDetail, setViewingLogDetail] = useState<InspectionSession | null>(null);
  const [editingSession, setEditingSession] = useState<InspectionSession | null>(null);
  const [retractingLogId, setRetractingLogId] = useState<string | null>(null);
  const [retractReason, setRetractReason] = useState("");

  // 필터링된 검사 로그 목록
  const filteredLogs = useMemo(() => {
    return inspections.filter((log) => {
      const q = logSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        log.participantName.toLowerCase().includes(q) ||
        log.number.toLowerCase().includes(q) ||
        log.id.toLowerCase().includes(q) ||
        log.operationId.toLowerCase().includes(q);

      const matchesType = logTypeFilter === "all" || log.type === logTypeFilter;
      const matchesStatus = logStatusFilter === "all" || log.status === logStatusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [inspections, logSearchQuery, logTypeFilter, logStatusFilter]);

  // 예약 관련 감사 로그 및 예약 처리 내역
  const reservationAudits = useMemo(() => {
    return auditLogs.filter((a) => a.targetType === "reservation");
  }, [auditLogs]);

  // 공개 / 비공개 토글
  async function toggleSessionPublic(session: InspectionSession) {
    try {
      await inspectionRepo.update(
        session.id,
        { isPublic: !session.isPublic },
        `공개 상태 변경: ${!session.isPublic ? "공개" : "비공개"}`
      );
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("공개 상태 변경에 실패했습니다.");
    }
  }

  // 취소 (Retract) 실행
  async function executeRetract(id: string, reason: string) {
    if (!reason.trim()) {
      alert("취소 사유를 반드시 입력해 주세요.");
      return;
    }
    try {
      await inspectionRepo.retract(id, reason.trim());
      setRetractingLogId(null);
      setRetractReason("");
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("취소 처리에 실패했습니다.");
    }
  }

  // 복구 (Restore) 실행
  async function executeRestore(id: string) {
    if (!confirm("취소된 검사 로그를 다시 복구하시겠습니까?")) return;
    try {
      await inspectionRepo.restore(id, "관리자 복구");
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("복구 처리에 실패했습니다.");
    }
  }

  // 예약 대기열 복구 (취소/완료된 예약을 대기로 복원)
  async function restoreReservationToWaiting(resId: number, resName: string) {
    if (!confirm(`'${resName}' 님의 예약을 다시 '대기' 상태로 복구하시겠습니까?`)) return;
    try {
      await reservationRepo.update(resId, { status: "대기" });
      await recordAuditLog({
        operationId: `restore_res_${resId}_${Date.now()}`,
        targetType: "reservation",
        targetId: String(resId),
        action: "restore",
        beforeVersion: null,
        afterVersion: 1,
        changes: { status: "대기" },
        reason: "/log 화면에서 예약 대기로 복구",
      });
      refetchReservations();
      refetchAuditLogs();
      alert("예약이 '대기' 상태로 복구되었습니다.");
    } catch (e) {
      console.error(e);
      alert("예약 복구에 실패했습니다.");
    }
  }

  // 로그 수정 저장
  async function saveEditedSession() {
    if (!editingSession) return;
    try {
      await inspectionRepo.update(
        editingSession.id,
        {
          participantName: editingSession.participantName.trim(),
          questions: editingSession.questions,
        },
        "관리자 질문 및 결과 수정"
      );
      setEditingSession(null);
      refetchInspections();
      refetchAuditLogs();
    } catch (e) {
      console.error(e);
      alert("로그 수정에 실패했습니다.");
    }
  }

  // 전체 재집계 실행
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
            <h1 className="mt-2 text-3xl font-bold tracking-tight">전체 기록 관리 (/log)</h1>
            <p className="mt-2 text-sm text-neutral-600 sm:text-base">
              검사 로그, 예약 처리 이력, 기록 수정, 취소 및 복구를 관리합니다.
            </p>
          </div>
          <AdminNav active="log" />
        </div>

        {/* 탭 네비게이션 */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
          <button
            onClick={() => setTab("inspections")}
            className={`rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-bold transition ${
              tab === "inspections"
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
            }`}
          >
            검사 로그 관리 ({inspections.length})
          </button>
          <button
            onClick={() => setTab("reservations")}
            className={`rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-bold transition ${
              tab === "reservations"
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
            }`}
          >
            예약 처리 로그 ({reservations.length})
          </button>
          <button
            onClick={() => setTab("audits")}
            className={`rounded-lg border px-3.5 py-2 text-xs sm:text-sm font-bold transition ${
              tab === "audits"
                ? "border-black bg-black text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
            }`}
          >
            전체 감사 이력 ({auditLogs.length})
          </button>
        </div>

        {/* ==================================================== */}
        {/* 1. 검사 로그 탭                                      */}
        {/* ==================================================== */}
        {tab === "inspections" && (
          <section className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder="참가자명 · 검사번호 검색"
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

            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="p-3.5 font-medium">검사번호</th>
                    <th className="p-3.5 font-medium">참가자</th>
                    <th className="p-3.5 font-medium">유형</th>
                    <th className="p-3.5 font-medium">문항수</th>
                    <th className="p-3.5 font-medium">공개여부</th>
                    <th className="p-3.5 font-medium">상태</th>
                    <th className="p-3.5 font-medium">검사 일시</th>
                    <th className="p-3.5 font-medium text-right">기록 관리</th>
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
                        <td className="p-3.5 font-semibold text-neutral-900">{log.number}</td>
                        <td className="p-3.5">
                          <span className="font-bold text-neutral-900">{log.participantName}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                            {log.type === "common" ? "공통" : "자율"}
                          </span>
                        </td>
                        <td className="p-3.5">{log.questions.length}문항</td>
                        <td className="p-3.5">
                          <button
                            onClick={() => toggleSessionPublic(log)}
                            className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                              log.isPublic
                                ? "border-green-300 bg-green-50 text-green-700"
                                : "border-neutral-300 bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {log.isPublic ? "공개 중" : "비공개"}
                          </button>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              isRetracted
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {isRetracted ? "취소됨" : "정상"}
                          </span>
                        </td>
                        <td className="p-3.5 text-xs text-neutral-500">
                          {new Date(log.createdAt).toLocaleString("ko-KR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setViewingLogDetail(log)}
                              className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => setEditingSession(log)}
                              className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:bg-neutral-50"
                            >
                              수정
                            </button>
                            {!isRetracted ? (
                              <button
                                onClick={() => {
                                  setRetractingLogId(log.id);
                                  setRetractReason("");
                                }}
                                className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                취소
                              </button>
                            ) : (
                              <button
                                onClick={() => executeRestore(log.id)}
                                className="rounded border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              >
                                복구
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-sm text-neutral-400">
                        조건에 해당하는 검사 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 2. 예약 처리 로그 탭                                 */}
        {/* ==================================================== */}
        {tab === "reservations" && (
          <section className="mt-6 space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm text-neutral-700">
                현장 대기열 처리 및 완료/취소된 예약 내역입니다. 실수로 처리되었거나 취소된 예약은 여기서 언제든 <strong>대기</strong>로 복구할 수 있습니다.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="p-3.5 font-medium">예약번호</th>
                    <th className="p-3.5 font-medium">섹션</th>
                    <th className="p-3.5 font-medium">예약자</th>
                    <th className="p-3.5 font-medium">인원</th>
                    <th className="p-3.5 font-medium">상태</th>
                    <th className="p-3.5 font-medium">등록 일시</th>
                    <th className="p-3.5 font-medium text-right">복구 관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {reservations.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="p-3.5 font-bold">#{String(r.id).padStart(3, "0")}</td>
                      <td className="p-3.5">
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                          {r.section}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="font-semibold text-neutral-900">{r.name}</span>
                        <span className="ml-1 text-xs text-neutral-400">({r.studentId})</span>
                      </td>
                      <td className="p-3.5">{r.people}명</td>
                      <td className="p-3.5">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold ${
                            r.status === "대기"
                              ? "bg-blue-50 text-blue-700"
                              : r.status === "완료"
                              ? "bg-neutral-100 text-neutral-700"
                              : r.status === "호출"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-xs text-neutral-500">
                        {new Date(r.createdAt).toLocaleString("ko-KR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="p-3.5 text-right">
                        {r.status !== "대기" && (
                          <button
                            onClick={() => restoreReservationToWaiting(r.id, r.name)}
                            className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                          >
                            대기로 복구
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {reservations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-sm text-neutral-400">
                        등록된 예약 내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* 3. 전체 감사 이력 탭                                 */}
        {/* ==================================================== */}
        {tab === "audits" && (
          <section className="mt-6 space-y-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              검사 생성, 수정, 취소, 복구 및 예약 대기열 처리 등 시스템 내 모든 변경 작업의 변경 감사 이력입니다.
            </div>

            <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white max-h-[600px] overflow-y-auto">
              {auditLogs.map((audit) => (
                <div key={audit.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-neutral-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-bold ${
                          audit.action === "create"
                            ? "bg-blue-100 text-blue-800"
                            : audit.action === "update"
                            ? "bg-amber-100 text-amber-800"
                            : audit.action === "retract"
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {audit.action.toUpperCase()}
                      </span>
                      <span className="font-bold text-neutral-800">
                        {audit.targetType === "inspection" ? "검사 세션" : "예약"}
                      </span>
                      <span className="font-mono text-neutral-400">#{audit.targetId.slice(0, 10)}</span>
                    </div>
                    {audit.reason && (
                      <p className="mt-1 text-neutral-600">사유: {audit.reason}</p>
                    )}
                  </div>
                  <span className="text-neutral-400">
                    {new Date(audit.timestamp).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <div className="p-12 text-center text-sm text-neutral-400">
                  감사 로그가 아직 기록되지 않았습니다.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 1: 로그 상세 모달                     */}
        {/* ------------------------------------------ */}
        {viewingLogDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-xl font-bold text-neutral-900">
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
                    <span className="text-neutral-400">작업 ID:</span>{" "}
                    <span className="font-mono">{viewingLogDetail.operationId.slice(0, 16)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400">버전:</span> v{viewingLogDetail.version}
                  </div>
                  <div>
                    <span className="text-neutral-400">검사 유형:</span>{" "}
                    {viewingLogDetail.type === "common" ? "공통 질문" : "자율 질문"}
                  </div>
                  <div>
                    <span className="text-neutral-400">로그 상태:</span>{" "}
                    <span className={viewingLogDetail.status === "active" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {viewingLogDetail.status === "active" ? "정상" : "취소됨"}
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
                              ? "border border-neutral-900 bg-neutral-900 text-white"
                              : "border border-neutral-300 bg-white text-neutral-900"
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
                  className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 2: 로그 수정 모달                     */}
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
                        className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm"
                      />

                      <div className="mt-2 flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-2">
                          <span>답변:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = q.answer === "yes" ? "no" : "yes";
                              setEditingSession({
                                ...editingSession,
                                questions: editingSession.questions.map((item) =>
                                  item.id === q.id ? { ...item, answer: next } : item
                                ),
                              });
                            }}
                            className={`rounded px-2 py-1 font-bold ${
                              q.answer === "yes"
                                ? "bg-neutral-900 text-white"
                                : "border border-neutral-400 bg-white text-neutral-900"
                            }`}
                          >
                            {q.answer === "yes" ? "예" : "아니오"}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span>판정:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = q.result === "truth" ? "lie" : "truth";
                              setEditingSession({
                                ...editingSession,
                                questions: editingSession.questions.map((item) =>
                                  item.id === q.id ? { ...item, result: next } : item
                                ),
                              });
                            }}
                            className={`rounded px-2 py-1 font-bold ${
                              q.result === "truth"
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {q.result === "truth" ? "진실" : "거짓"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setEditingSession(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium hover:bg-neutral-50"
                >
                  취소
                </button>
                <button
                  onClick={saveEditedSession}
                  className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 transition"
                >
                  수정 내용 저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ */}
        {/* 모달 3: 취소 사유 입력 모달                */}
        {/* ------------------------------------------ */}
        {retractingLogId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold">검사 세션 취소 (Retract)</h3>
              <p className="mt-1 text-xs text-neutral-500">
                취소된 검사는 공개 집계에서 제외되며 감사 로그에 기록됩니다.
              </p>

              <textarea
                value={retractReason}
                onChange={(e) => setRetractReason(e.target.value)}
                placeholder="취소 사유를 입력하세요 (예: 측정기 오류, 본인 요청 등)"
                className="mt-4 w-full rounded-lg border border-neutral-300 p-2.5 text-sm outline-none focus:border-black"
                rows={3}
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setRetractingLogId(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium hover:bg-neutral-50"
                >
                  닫기
                </button>
                <button
                  onClick={() => executeRetract(retractingLogId, retractReason)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition"
                >
                  취소 확정
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AdminAuthGuard>
  );
}
