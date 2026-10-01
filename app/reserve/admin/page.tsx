"use client";

import { useMemo, useState } from "react";
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
  const { data: rows, refetch } = useLiveReservations();

  // 필터 및 검색
  const [section, setSection] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchSection = section === "전체" || section === row.section;
      const matchStatus = status === "전체" || status === row.status;
      const matchQuery = `${row.name} ${row.studentId} ${row.id}`.includes(query.trim());
      return matchSection && matchStatus && matchQuery;
    });
  }, [rows, section, status, query]);

  // 전화번호 복사 헬퍼
  async function copyPhone(e: React.MouseEvent, row: Reservation) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(row.phone);
    } catch {
      window.prompt("전화번호를 복사하세요:", row.phone);
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
              전체 예약 명단을 조회하고 관리합니다.
            </p>
          </div>
          <AdminNav active="reserve" />
        </div>

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
                    : "border-neutral-300 bg-white text-neutral-800 hover:border-black hover:text-black"
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
