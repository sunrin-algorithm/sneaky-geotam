"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";

type Status = "대기" | "호출" | "완료" | "취소";
type Reservation = {
  id: number;
  section: "자율" | "공통";
  name: string;
  studentId: string;
  people: number;
  status: Status;
  calledAt?: string;
};

const examples: Reservation[] = [
  { id: 1, section: "자율", name: "예시 학생 A", studentId: "10101", people: 3, status: "대기" },
  { id: 2, section: "공통", name: "예시 학생 B", studentId: "10201", people: 2, status: "대기" },
  { id: 3, section: "자율", name: "예시 학생 C", studentId: "10301", people: 1, status: "완료" },
];

function ReservationActions({ row, onUpdate }: { row: Reservation; onUpdate: (id: number, status: Status) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {row.status === "대기" && (
        <button onClick={() => onUpdate(row.id, "호출")} aria-label={`${row.id}번 호출`} className="rounded-lg border border-neutral-300 px-3 py-2">호출</button>
      )}
      {row.status === "호출" && (
        <button onClick={() => onUpdate(row.id, "완료")} aria-label={`${row.id}번 완료`} className="rounded-lg border border-neutral-300 px-3 py-2">완료</button>
      )}
      {(row.status === "대기" || row.status === "호출") && (
        <button onClick={() => onUpdate(row.id, "취소")} aria-label={`${row.id}번 취소`} className="rounded-lg border border-neutral-300 px-3 py-2">취소</button>
      )}
      {(row.status === "완료" || row.status === "취소") && (
        <button onClick={() => onUpdate(row.id, "대기")} aria-label={`${row.id}번 대기로 복원`} className="rounded-lg border border-neutral-300 px-3 py-2">대기로 복원</button>
      )}
    </div>
  );
}

export default function ReservationAdmin() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [demo, setDemo] = useState(false);
  const [section, setSection] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const filtered = rows.filter((row) =>
    (section === "전체" || section === row.section) &&
    (status === "전체" || status === row.status) &&
    `${row.name} ${row.studentId} ${row.id}`.includes(query.trim())
  );

  function update(id: number, next: Status) {
    setRows((current) => current.map((row) => row.id === id ? {
      ...row,
      status: next,
      calledAt: next === "호출" ? new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : undefined,
    } : row));
    setMessage(`예시 예약 ${id}번을 ${next} 상태로 변경했습니다.${next === "호출" ? " 실제 연락은 발송되지 않습니다." : ""}`);
  }

  function toggleDemo() {
    setDemo(!demo);
    setRows(demo ? [] : examples.map((row) => ({ ...row })));
    setStatus("전체");
    setSection("전체");
    setQuery("");
    setMessage("");
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">예약 관리</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">섹션별 대기 인원과 예약 상태를 확인합니다.</p>
          </div>
          <Link href="/reserve" className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50">예약 페이지</Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="leading-6 text-neutral-700">{demo ? "예시 데이터입니다. 변경 사항은 저장되지 않습니다." : "예약 서버 연결 전입니다. 실제 예약은 표시되지 않습니다."}</p>
          <button onClick={toggleDemo} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 font-medium hover:bg-neutral-100">{demo ? "예시 닫기" : "예시로 살펴보기"}</button>
        </div>

        <section className="mt-10" aria-label="섹션별 대기 현황">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["자율", "공통"] as const).map((value) => (
              <div key={value} className="rounded-xl border border-neutral-200 p-5">
                <h2 className="text-sm font-medium text-neutral-600">{value} 섹션</h2>
                <p className="mt-3 text-3xl font-bold">
                  {demo ? rows.filter((row) => row.section === value && row.status === "대기").length : "—"}
                  <span className="ml-2 text-sm font-normal text-neutral-600">팀 대기</span>
                </p>
                <p className="mt-2 text-sm text-neutral-600">호출 {demo ? rows.filter((row) => row.section === value && row.status === "호출").length : "—"}팀</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="list-title">
          <h2 id="list-title" className="text-xl font-bold">예약 목록</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="섹션 필터">
            {["전체", "자율", "공통"].map((value) => (
              <button key={value} aria-pressed={section === value} onClick={() => setSection(value)} className={`rounded-lg border px-4 py-2 text-sm font-medium ${section === value ? "border-black bg-black text-white" : "border-neutral-200"}`}>
                {value === "전체" ? "전체 섹션" : `${value} 섹션`}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
            <label htmlFor="reservation-status" className="sr-only">예약 상태</label>
            <select id="reservation-status" value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-neutral-300 bg-white p-3 text-sm focus-visible:outline-2 focus-visible:outline-black">
              {["전체", "대기", "호출", "완료", "취소"].map((value) => (
                <option key={value} value={value}>{value === "전체" ? "모든 상태" : value}</option>
              ))}
            </select>
            <label htmlFor="reservation-search" className="sr-only">이름, 학번 또는 예약 번호 검색</label>
            <input id="reservation-search" type="search" placeholder="이름 · 학번 · 예약 번호" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 w-full rounded-lg border border-neutral-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-black" />
          </div>

          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-neutral-200 md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">예약 목록{demo ? " (예시)" : ""}</caption>
              <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                <tr>
                  {["번호", "섹션", "예약자", "연락처", "인원", "상태", "관리"].map((value) => (
                    <th key={value} scope="col" className="p-4 font-medium">{value}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="p-4">{String(row.id).padStart(3, "0")}</td>
                    <td className="p-4">{row.section}</td>
                    <td className="p-4">
                      {row.name}
                      <span className="mt-1 block text-xs text-neutral-500">{row.studentId}</span>
                    </td>
                    <td className="p-4 text-neutral-500">예시 · 연락처 없음</td>
                    <td className="p-4">{row.people}명</td>
                    <td className="p-4">
                      {row.status}
                      {row.calledAt && <span className="mt-1 block text-xs text-neutral-500">{row.calledAt}</span>}
                    </td>
                    <td className="p-4"><ReservationActions row={row} onUpdate={update} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-neutral-500">{demo ? "조건에 맞는 예약이 없습니다." : "표시할 예약이 없습니다."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-3 md:hidden">
            {filtered.map((row) => (
              <article key={row.id} className="rounded-xl border border-neutral-200 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{row.name} <span className="font-normal text-neutral-600">· {row.studentId}</span></p>
                    <p className="mt-1 text-neutral-600">{row.section} 섹션 · {row.people}명 · #{String(row.id).padStart(3, "0")}</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-xs font-medium">{row.status}</span>
                </div>
                {row.calledAt && <p className="mt-2 text-neutral-600">호출 {row.calledAt}</p>}
                <div className="mt-4 border-t border-neutral-100 pt-4"><ReservationActions row={row} onUpdate={update} /></div>
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-12 text-center text-sm text-neutral-600">
                {demo ? "조건에 맞는 예약이 없습니다." : "표시할 예약이 없습니다."}
              </div>
            )}
          </div>
          <p className="mt-3 min-h-5 text-sm text-neutral-600" role="status">{message || (demo ? `예시 예약 ${filtered.length}건` : "")}</p>
          <p className="mt-5 text-sm leading-6 text-neutral-500">연락 후 5분 이내에 도착하지 않은 팀은 취소 처리합니다. 호출 상태 변경은 전화나 문자를 발송하지 않습니다.</p>
        </section>
      </main>
    </>
  );
}
