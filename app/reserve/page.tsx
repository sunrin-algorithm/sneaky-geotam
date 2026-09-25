"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./reserve.module.css";

type Section = "free" | "common";
type Step = "home" | "sections" | "form" | "done";
const sections = {
  free: { title: "자율 섹션", description: "친구들과 자유롭게 즐기는 거짓말 탐지기", notice: "자율 섹션의 경우 금도끼, 은도끼, 피노키오 코 수상이 불가합니다." },
  common: { title: "공통 섹션", description: "한 명의 진실을 함께 확인하는 시간", notice: "공통 섹션의 경우 거짓말 탐지기 대상자는 딱 1명으로 고정됩니다." },
};

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={back ? { transform: "rotate(180deg)" } : undefined}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function ReservePage() {
  const [step, setStep] = useState<Step>("home");
  const [section, setSection] = useState<Section>("free");
  const [details, setDetails] = useState({ studentId: "", name: "", phone: "", people: "" });
  const [agreed, setAgreed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  function selectSection(value: Section) {
    setSection(value);
    setAgreed(false);
    setStep("form");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("done");
    setDetails({ studentId: "", name: "", phone: "", people: "" });
    setAgreed(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.brand} onClick={() => setStep("home")} aria-label="예약 홈으로">
          <span className={styles.brandIcon} aria-hidden="true"><svg width="25" height="25" viewBox="0 0 28 28" fill="none"><path d="M2 15h6l3-8 5 15 3-7h7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
          LIE DETECTOR<span className={styles.headerDivider} /> <span className={styles.brandSub}>부스 예약</span>
        </button>
        <span className={styles.festival}>선린 축제 2026</span>
      </header>

      <main className={styles.main}>
        <div className={styles.preview}><span className={styles.dot} />예약 미리보기<span>현재 실제 예약은 접수되지 않습니다.</span></div>
        {step !== "home" && <button className={styles.back} onClick={() => setStep(step === "form" ? "sections" : "home")}><Arrow back />{step === "form" ? "섹션 선택" : "예약 홈"}</button>}

        {step === "home" && <>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>거짓말 탐지기 체험 부스</p>
            <h1 ref={heading} tabIndex={-1}>진실을 마주할 차례.</h1>
            <p>친구와 함께, 조금은 떨리는 진실의 시간.<br />미리 예약하고 내 차례에 만나요.</p>
          </div>
          <section className={styles.ticket} aria-labelledby="queue-title">
            <div className={styles.ticketTop}><h2 id="queue-title">현재 대기 현황</h2><span className={styles.status}>오픈 준비 중</span></div>
            <div className={styles.queues}>
              {Object.entries(sections).map(([key, value]) => <div className={styles.queue} key={key}><span>{value.title}</span><p><strong aria-label="대기 인원 미연결">—</strong><span>팀 대기</span></p></div>)}
            </div>
            <div className={styles.ticketBottom}><span className={styles.clock} aria-hidden="true">◷</span>예약 오픈 후 대기 현황을 확인할 수 있어요.</div>
          </section>
          <button className={styles.primary} onClick={() => setStep("sections")}>예약하기<Arrow /></button>
          <details className={styles.about}>
            <summary><span><span className={styles.question} aria-hidden="true">?</span>이 부스는 어떤 부스인가요?</span><span className={styles.plus} aria-hidden="true">+</span></summary>
            <div><p className={styles.aboutLabel}>부스 안내 · 추후 업데이트 예정</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p></div>
          </details>
          <p className={styles.homeNote}>연락을 받으면 5분 안에 부스로 와 주세요.</p>
        </>}

        {step === "sections" && <>
          <div className={styles.stepIntro}><p className={styles.eyebrow}>예약하기 · 섹션 선택</p><h1 ref={heading} tabIndex={-1}>어떻게 참여할까요?</h1><p>참여할 섹션을 선택해 주세요.</p></div>
          <div className={styles.sectionList}>{(Object.keys(sections) as Section[]).map((key) => <button key={key} className={styles.sectionCard} onClick={() => selectSection(key)}><div><span className={styles.sectionTag}>{key === "free" ? "자유로운 체험" : "한 명을 위한 집중 탐구"}</span><h2>{sections[key].title}</h2><p>{sections[key].description}</p><span className={styles.sectionNote}>{key === "free" ? "금도끼 · 은도끼 · 피노키오 코 수상 제외" : "거짓말 탐지기 대상자 1명 고정"}</span></div><Arrow /></button>)}</div>
        </>}

        {step === "form" && <>
          <div className={styles.stepIntro}><p className={styles.eyebrow}>예약하기 · 정보 입력</p><h1 ref={heading} tabIndex={-1}>{sections[section].title} 예약</h1><p>대표자 정보와 함께 참여할 인원 수를 알려 주세요.</p></div>
          <form onSubmit={submit} className={styles.form}>
            <div className={styles.formHeading}><h2>예약자 정보</h2><span>모든 항목 필수</span></div>
            <div className={styles.fieldGrid}>
              <label>학번<input name="studentId" autoComplete="off" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} title="5자리 학번을 입력해 주세요." required placeholder="예: 10101" value={details.studentId} onChange={(e) => setDetails({ ...details, studentId: e.target.value })} /></label>
              <label>이름<input name="name" autoComplete="name" required maxLength={30} pattern=".*\S.*" title="이름을 입력해 주세요." placeholder="예: 홍길동" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></label>
            </div>
            <label>전화번호<input name="phone" type="tel" autoComplete="tel" required pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" maxLength={13} title="휴대전화 번호를 입력해 주세요. 예: 010-1234-5678" placeholder="010-0000-0000" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} /><span className={styles.hint}>차례가 되면 대표자에게 연락드려요.</span></label>
            <label>인원 수<div className={styles.numberField}><input name="people" type="number" inputMode="numeric" min={1} step={1} required placeholder="본인 포함 참여 인원" value={details.people} onChange={(e) => setDetails({ ...details, people: e.target.value })} /><span>명</span></div></label>
            <aside className={styles.notice}><h2>예약 전 꼭 확인해 주세요</h2><ul><li>연락 후 5분 간 부스에 도착하지 못할 시 예약은 취소됩니다.</li><li>{sections[section].notice}</li></ul></aside>
            <label className={styles.checkbox}><input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>위 주의 사항을 모두 확인했습니다.</span></label>
            <button type="submit" className={styles.primary}>예약 내용 확인<Arrow /></button>
            <p className={styles.formNote}>미리보기에서는 입력한 정보를 저장하거나 전송하지 않습니다.</p>
          </form>
        </>}

        {step === "done" && <div className={styles.done}><span className={styles.checkmark} aria-hidden="true">✓</span><p className={styles.eyebrow}>{sections[section].title}</p><h1 ref={heading} tabIndex={-1}>예약 화면 체험 완료</h1><p>현재는 미리보기로, 실제 예약은 접수되지 않았습니다.<br />예약 오픈 후 다시 방문해 주세요.</p><button className={styles.primary} onClick={() => setStep("home")}>예약 홈으로<Arrow /></button></div>}
      </main>
      <footer className={styles.footer}><span>LIE DETECTOR</span><span>선린 축제 · 진실은 여기서</span></footer>
    </div>
  );
}
