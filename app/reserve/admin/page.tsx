"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import AdminAuthGuard from "@/components/AdminAuthGuard";
import AdminNav from "@/components/AdminNav";
import { useLiveReservations } from "@/lib/hooks";
import { recordAuditLog, reservationRepo } from "@/lib/storage";
import { Reservation, ReservationStatus } from "@/lib/types";

function ReservationActions({
  row,
  onUpdate,
  onDelete,
}: {
  row: Reservation;
  onUpdate: (id: number, status: ReservationStatus) => void;
  onDelete: (id: number, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.status === "대기" && (
        <button
          onClick={() => onUpdate(row.id, "호출")}
          aria-label={`${row.id}번 호출`}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          호출
        </button>
      )}
      {row.status === "호출" && (
        <button
          onClick={() => onUpdate(row.id, "완료")}
          aria-label={`${row.id}번 완료`}
          className="rounded-lg border border-black bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          완료
        </button>
      )}
      {(row.status === "대기" || row.status === "호출") && (
        <button
          onClick={() => onUpdate(row.id, "취소")}
          aria-label={`${row.id}번 취소`}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
        >
          취소
        </button>
      )}
      {(row.status === "완료" || row.status === "취소") && (
        <button
          onClick={() => onUpdate(row.id, "대기")}
          aria-label={`${row.id}번 대기로 복원`}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
        >
          대기로 복원
        </button>
      )}
      <button
        onClick={() => onDelete(row.id, row.name)}
        aria-label={`${row.id}번 삭제`}
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        삭제
      </button>
    </div>
  );
}

export default function ReservationAdmin() {
  const router = useRouter();
  const { data: rows, refetch } = useLiveReservations();

  // 대기열 큐 상태
  const [copiedPhoneId, setCopiedPhoneId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Reservation | null>(null);

  // 5초 Undo 토스트 상태 (PROMPT.md 10)
  const [undoItem, setUndoItem] = useState<{
    id: number;
    name: string;
    section: string;
    expireSeconds: number;
  } | null>(null);

  // 필터 및 검색
  const [section, setSection] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

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

  // 대기 중인 예약 상위 5명 (순서: id 오름차순 / 등록순)
  const topQueue = useMemo(() => {
    return rows
      .filter((r) => r.status === "대기")
      .slice(0, 5);
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchSection = section === "전체" || section === row.section;
      const matchStatus = status === "전체" || status === row.status;
      const matchQuery = `${row.name} ${row.studentId} ${row.id}`.includes(query.trim());
      return matchSection && matchStatus && matchQuery;
    });
  }, [rows, section, status, query]);

  // 전화번호 복사 헬퍼 (PROMPT.md 8)
  async function copyPhone(e: React.MouseEvent, row: Reservation) {
    e.stopPropagation(); // 카드 클릭(처리 확인) 이벤트 전파 방지
    try {
      await navigator.clipboard.writeText(row.phone);
      setCopiedPhoneId(row.id);
      setTimeout(() => setCopiedPhoneId(null), 1500);
    } catch {
      // 복사 실패 폴백
      window.prompt("전화번호를 복사하세요:", row.phone);
    }
  }

  // 큐 처리 (입장 처리) (PROMPT.md 8, 9, 21, 22)
  async function processQueueItem(item: Reservation, thenInspect: boolean = false) {
    try {
      await reservationRepo.update(item.id, { status: "완료" });

      // 감사 로그 기록
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
      refetch();

      if (thenInspect) {
        // 처리 후 검사: /admin으로 이동하며 참가자 이름 전달
        router.push(`/admin?participantName=${encodeURIComponent(item.name)}`);
      } else {
        // 일반 처리: 5초 Undo 토스트 가동
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

  // 5초 Undo 실행 (PROMPT.md 10, 11)
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
      refetch();
    } catch (e) {
      console.error(e);
      alert("실행 취소에 실패했습니다.");
    }
  }

  // 일반 상태 업데이트
  async function updateStatus(id: number, next: ReservationStatus) {
    try {
      const patch: Partial<Reservation> = {
        status: next,
        calledAt:
          next === "호출"
            ? new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
            : undefined,
      };
      await reservationRepo.update(id, patch);

      await recordAuditLog({
        operationId: `status_${id}_${Date.now()}`,
        targetType: "reservation",
        targetId: String(id),
        action: next === "대기" ? "restore" : "update",
        beforeVersion: null,
        afterVersion: 1,
        changes: { status: next },
        reason: `예약 상태 '${next}'(으)로 변경`,
      });

      setMessage(`예약 #${String(id).padStart(3, "0")}을(를) '${next}' 상태로 변경했습니다.`);
      refetch();
    } catch (e) {
      console.error(e);
      alert("예약 상태 변경에 실패했습니다.");
    }
  }

  async function deleteReservation(id: number, name: string) {
    if (!confirm(`'${name}' 님의 예약 #${String(id).padStart(3, "0")}을(를) 삭제하시겠습니까?`)) return;
    try {
      await reservationRepo.delete(id);

      await recordAuditLog({
        operationId: `del_${id}_${Date.now()}`,
        targetType: "reservation",
        targetId: String(id),
        action: "retract",
        beforeVersion: 1,
        afterVersion: 2,
        changes: { status: "취소", deleted: true },
        reason: `관리자 삭제 요청`,
      });

      setMessage(`예약 #${String(id).padStart(3, "0")}이(가) 삭제되었습니다.`);
      refetch();
    } catch (e) {
      console.error(e);
      alert("예약 삭제에 실패했습니다.");
    }
  }

  return (
    <AdminAuthGuard>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">예약 관리</h1>
            <p className="mt-2 text-sm text-neutral-600 sm:text-base">
              현장 대기열 상위 5명을 실시간으로 처리하고 예약 현황을 관리합니다.
            </p>
          </div>
          <AdminNav active="reserve" />
        </div>

        {/* ==================================================== */}
        {/* 핵심 섹션: 현재 대기열 상위 5명 (PROMPT.md 7, 8, 9)     */}
        {/* ==================================================== */}
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
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
              총 대기 {rows.filter((r) => r.status === "대기").length}팀
            </span>
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
                  {/* 전화번호 클릭 영역 (복사 ONLY, stopPropagation) */}
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

        {/* ==================================================== */}
        {/* 대기열 처리 확인 모달 (PROMPT.md 8, 9)                */}
        {/* ==================================================== */}
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
                  처리 후 검사
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

        {/* ==================================================== */}
        {/* 5초 실행취소(Undo) 토스트 (PROMPT.md 10)              */}
        {/* ==================================================== */}
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

        {/* ==================================================== */}
        {/* 전체 예약 통계 카드                                  */}
        {/* ==================================================== */}
        <section className="mt-8" aria-label="섹션별 대기 현황">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["자율", "공통"] as const).map((value) => {
              const waitingCount = rows.filter((r) => r.section === value && r.status === "대기").length;
              const callingCount = rows.filter((r) => r.section === value && r.status === "호출").length;
              return (
                <div key={value} className="rounded-xl border border-neutral-200 bg-white p-5">
                  <h2 className="text-sm font-semibold text-neutral-600">{value} 섹션</h2>
                  <p className="mt-3 text-3xl font-bold">
                    {waitingCount}
                    <span className="ml-2 text-sm font-normal text-neutral-600">팀 대기 중</span>
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    현재 호출 중: <strong>{callingCount}</strong>팀
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================================================== */}
        {/* 전체 예약 목록 테이블                                 */}
        {/* ==================================================== */}
        <section className="mt-10" aria-labelledby="list-title">
          <div className="flex items-center justify-between">
            <h2 id="list-title" className="text-xl font-bold">
              전체 예약 목록
            </h2>
            <span className="text-xs text-neutral-500">총 {rows.length}건</span>
          </div>

          {/* 섹션 필터 */}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="섹션 필터">
            {["전체", "자율", "공통"].map((value) => (
              <button
                key={value}
                aria-pressed={section === value}
                onClick={() => setSection(value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  section === value
                    ? "border-black bg-black text-white"
                    : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700"
                }`}
              >
                {value === "전체" ? "전체 섹션" : `${value} 섹션`}
              </button>
            ))}
          </div>

          {/* 상태 & 검색 */}
          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            <select
              id="reservation-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-black"
            >
              {["전체", "대기", "호출", "완료", "취소"].map((value) => (
                <option key={value} value={value}>
                  {value === "전체" ? "모든 상태" : value}
                </option>
              ))}
            </select>
            <input
              id="reservation-search"
              type="search"
              placeholder="이름 · 학번 · 예약 번호로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 w-full rounded-lg border border-neutral-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-black"
            />
          </div>

          {/* 테이블 뷰 */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  {["번호", "섹션", "예약자", "연락처", "인원", "상태", "관리"].map((value) => (
                    <th key={value} scope="col" className="p-4 font-medium">
                      {value}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50">
                    <td className="p-4 font-bold">#{String(row.id).padStart(3, "0")}</td>
                    <td className="p-4">
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700">
                        {row.section}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-neutral-900">{row.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-400">{row.studentId}</span>
                    </td>
                    <td className="p-4 font-mono text-neutral-600">
                      <button
                        type="button"
                        onClick={(e) => copyPhone(e, row)}
                        className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100"
                        title="전화번호 복사"
                      >
                        {row.phone}
                      </button>
                    </td>
                    <td className="p-4">{row.people}명</td>
                    <td className="p-4">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                          row.status === "호출"
                            ? "bg-amber-100 text-amber-800"
                            : row.status === "대기"
                            ? "bg-blue-50 text-blue-700"
                            : row.status === "완료"
                            ? "bg-neutral-100 text-neutral-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {row.status}
                      </span>
                      {row.calledAt && (
                        <span className="mt-0.5 block text-xs text-neutral-400">
                          호출: {row.calledAt}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <ReservationActions
                        row={row}
                        onUpdate={updateStatus}
                        onDelete={deleteReservation}
                      />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-neutral-500">
                      조건에 맞는 예약이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {message && (
            <p className="mt-3 text-sm text-neutral-700 font-medium" role="status">
              {message}
            </p>
          )}

          <p className="mt-6 text-xs leading-5 text-neutral-400">
            * 전화번호 클릭 시 클립보드에 복사되며, SMS 자동 발송은 제공하지 않습니다. 대기열 처리는 5초 동안 우측 하단에서 즉시 실행취소할 수 있으며 이후에는 /log에서 관리할 수 있습니다.
          </p>
        </section>
      </main>
    </AdminAuthGuard>
  );
}
