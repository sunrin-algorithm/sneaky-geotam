"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./admin.module.css";

type Status = "대기" | "호출" | "완료" | "취소";
type Reservation = { id: number; section: "자율" | "공통"; name: string; studentId: string; people: number; status: Status; calledAt?: string };
const examples: Reservation[] = [
  { id: 1, section: "자율", name: "예시 학생 A", studentId: "10101", people: 3, status: "대기" },
  { id: 2, section: "공통", name: "예시 학생 B", studentId: "10201", people: 2, status: "대기" },
  { id: 3, section: "자율", name: "예시 학생 C", studentId: "10301", people: 1, status: "완료" },
];

export default function ReservationAdmin() {
  const [rows, setRows] = useState<Reservation[]>([]);
  const [demo, setDemo] = useState(false);
  const [section, setSection] = useState("전체");
  const [status, setStatus] = useState("전체");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const filtered = rows.filter(row => (section === "전체" || section === row.section) && (status === "전체" || status === row.status) && `${row.name} ${row.studentId} ${row.id}`.includes(query.trim()));

  function update(id: number, next: Status) {
    setRows(current => current.map(row => row.id === id ? { ...row, status: next, calledAt: next === "호출" ? new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : undefined } : row));
    setMessage(`예시 예약 ${id}번을 ${next} 상태로 변경했습니다.${next === "호출" ? " 실제 연락은 발송되지 않습니다." : ""}`);
  }

  function toggleDemo() {
    setDemo(!demo);
    setRows(demo ? [] : examples.map(row => ({ ...row })));
    setStatus("전체");
    setSection("전체");
    setQuery("");
    setMessage("");
  }

  return <div className={styles.page}>
    <header className={styles.header}><span><strong>LIE DETECTOR</strong><span className={styles.adminLabel}>예약 관리</span></span><Link href="/reserve">예약 페이지 ↗</Link></header>
    <main className={styles.main}>
      <div className={styles.title}><div><h1>예약 관리</h1><p>대기 중인 팀과 진행 상태를 확인합니다.</p></div><button onClick={toggleDemo}>{demo ? "예시 닫기" : "예시로 살펴보기"}</button></div>
      <p className={styles.preview}>{demo ? "예시 데이터입니다. 변경 사항은 새로고침하면 초기화됩니다." : "예약 서버 연결 전입니다. 실제 예약은 표시되지 않습니다."}</p>
      <section className={styles.counts} aria-label="섹션별 대기 현황">{["자율", "공통"].map(value => <div key={value}><h2>{value} 섹션</h2><p><strong>{demo ? rows.filter(row => row.section === value && row.status === "대기").length : "—"}</strong> 팀 대기 <span>호출 {demo ? rows.filter(row => row.section === value && row.status === "호출").length : "—"}팀</span></p></div>)}</section>
      <div className={styles.filters}>
        <div className={styles.tabs} aria-label="섹션 필터">{["전체", "자율", "공통"].map(value => <button key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{value === "전체" ? "전체 섹션" : `${value} 섹션`}</button>)}</div>
        <div className={styles.search}><label><span className={styles.srOnly}>예약 상태</span><select value={status} onChange={event => setStatus(event.target.value)}>{["전체", "대기", "호출", "완료", "취소"].map(value => <option key={value} value={value}>{value === "전체" ? "모든 상태" : value}</option>)}</select></label><label><span className={styles.srOnly}>이름, 학번 또는 예약 번호 검색</span><input type="search" placeholder="이름 · 학번 · 예약 번호" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      </div>
      <div className={styles.tableWrap}><table><caption className={styles.srOnly}>예약 목록{demo ? " (예시)" : ""}</caption><thead><tr><th scope="col">번호</th><th scope="col">섹션</th><th scope="col">예약자</th><th scope="col">연락처</th><th scope="col">인원</th><th scope="col">상태</th><th scope="col">관리</th></tr></thead><tbody>
        {filtered.map(row => <tr key={row.id}><td>{String(row.id).padStart(3, "0")}</td><td>{row.section}</td><td>{row.name}<small>{row.studentId}</small></td><td className={styles.muted}>예시 · 연락처 없음</td><td>{row.people}명</td><td><span className={styles.state} data-status={row.status}>{row.status}</span>{row.calledAt && <small>{row.calledAt}</small>}</td><td><div className={styles.actions}>{row.status === "대기" && <button onClick={() => update(row.id, "호출")} aria-label={`${row.id}번 호출`}>호출</button>}{row.status === "호출" && <button onClick={() => update(row.id, "완료")} aria-label={`${row.id}번 완료`}>완료</button>}{(row.status === "대기" || row.status === "호출") && <button onClick={() => update(row.id, "취소")} aria-label={`${row.id}번 취소`}>취소</button>}{(row.status === "완료" || row.status === "취소") && <button onClick={() => update(row.id, "대기")} aria-label={`${row.id}번 대기로 복원`}>대기로 복원</button>}</div></td></tr>)}
        {filtered.length === 0 && <tr><td colSpan={7} className={styles.empty}>{demo ? "조건에 맞는 예약이 없습니다." : "표시할 예약이 없습니다."}</td></tr>}
      </tbody></table></div>
      <p className={styles.result} role="status">{message || (demo ? `예시 예약 ${filtered.length}건` : "")}</p>
      <p className={styles.note}>연락 후 5분 이내에 도착하지 않은 팀은 취소 처리합니다. 호출 상태 변경은 전화나 문자를 발송하지 않습니다.</p>
    </main>
  </div>;
}
