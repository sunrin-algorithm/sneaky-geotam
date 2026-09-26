"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";

type Section = "free" | "common";
type Step = "home" | "sections" | "form" | "done";

const sections = {
  free: { title: "자율 섹션", notice: "자율 섹션의 경우 금도끼, 은도끼, 피노키오 코 수상이 불가합니다." },
  common: { title: "공통 섹션", notice: "공통 섹션의 경우 거짓말 탐지기 대상자는 딱 1명으로 고정됩니다." },
};

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
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-12">
          <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
          {step !== "home" && (
            <button type="button" onClick={() => setStep(step === "form" ? "sections" : "home")} className="mt-8 text-sm text-neutral-600 underline underline-offset-4">
              ← {step === "form" ? "섹션 선택" : "예약 홈"}
            </button>
          )}

          {step === "home" && (
            <>
              <h1 ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl">거짓말탐지기 예약</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">참여할 섹션을 선택하고 예약 정보를 입력해 주세요.</p>
              <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">예약 화면 준비 중입니다. 지금은 실제 예약이 접수되지 않습니다.</p>

              <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
                <section aria-labelledby="queue-title">
                  <h2 id="queue-title" className="text-xl font-bold">현재 대기 현황</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    {(Object.keys(sections) as Section[]).map((key) => (
                      <div key={key} className="rounded-xl border border-neutral-200 p-5">
                        <p className="text-sm font-medium text-neutral-600">{sections[key].title}</p>
                        <p className="mt-3 text-3xl font-bold" aria-label="대기 인원 미연결">— <span className="text-sm font-normal text-neutral-600">팀 대기</span></p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-neutral-600">예약 시작 후 대기 현황을 표시합니다.</p>
                </section>

                <div className="lg:pt-10">
                  <button type="button" onClick={() => setStep("sections")} className="w-full rounded-lg bg-black px-5 py-3 font-medium text-white">예약하기</button>
                  <details className="mt-4 rounded-xl border border-neutral-200 p-5">
                    <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black">이 부스는 어떤 부스인가요?</summary>
                    <div className="mt-4 border-t border-neutral-100 pt-4 text-sm leading-6 text-neutral-600">
                      <p className="mb-2 font-medium">부스 안내 · 추후 업데이트 예정</p>
                      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
                    </div>
                  </details>
                </div>
              </div>
            </>
          )}

          {step === "sections" && (
            <>
              <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl">섹션 선택</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">참여할 섹션을 선택해 주세요.</p>
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {(Object.keys(sections) as Section[]).map((key) => (
                  <button key={key} type="button" onClick={() => selectSection(key)} className="min-h-36 rounded-xl border border-neutral-200 p-5 text-left hover:bg-neutral-50 sm:p-6">
                    <span className="text-lg font-semibold">{sections[key].title}</span>
                    <span className="mt-3 block text-sm leading-6 text-neutral-600">{sections[key].notice}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "form" && (
            <>
              <h1 ref={heading} tabIndex={-1} className="mt-3 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl">{sections[section].title} 예약</h1>
              <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">대표자 정보와 참여 인원을 입력해 주세요.</p>
              <form onSubmit={submit} className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] lg:gap-6">
                <div className="space-y-5 rounded-xl border border-neutral-200 p-5 sm:p-6">
                  <h2 className="text-lg font-semibold">예약자 정보</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium">학번</span>
                      <input name="studentId" autoComplete="off" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} title="5자리 학번을 입력해 주세요." required placeholder="예: 10101" value={details.studentId} onChange={(e) => setDetails({ ...details, studentId: e.target.value })} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium">이름</span>
                      <input name="name" autoComplete="name" required maxLength={30} pattern=".*\S.*" title="이름을 입력해 주세요." placeholder="예: 홍길동" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium">전화번호</span>
                    <input name="phone" type="tel" autoComplete="tel" required pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}" maxLength={13} title="휴대전화 번호를 입력해 주세요. 예: 010-1234-5678" placeholder="010-0000-0000" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" />
                    <span className="mt-1 block text-xs text-neutral-600">차례가 되면 대표자에게 연락드립니다.</span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">인원 수</span>
                    <input name="people" type="number" inputMode="numeric" min={1} step={1} required placeholder="본인 포함 참여 인원" value={details.people} onChange={(e) => setDetails({ ...details, people: e.target.value })} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" />
                  </label>
                </div>
                <aside className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:p-6">
                  <h2 className="text-lg font-semibold">예약 전 확인해 주세요</h2>
                  <ul className="mt-4 list-disc space-y-3 pl-5 leading-6 text-neutral-700">
                    <li>연락 후 5분 간 부스에 도착하지 못할 시 예약은 취소됩니다.</li>
                    <li>{sections[section].notice}</li>
                  </ul>
                </aside>
                <div className="lg:col-start-1">
                  <label className="flex items-start gap-2 text-sm leading-6">
                    <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-black" />
                    위 주의 사항을 모두 확인했습니다.
                  </label>
                  <button type="submit" className="mt-5 w-full rounded-lg bg-black px-5 py-3 font-medium text-white">예약 내용 확인</button>
                  <p className="mt-3 text-center text-xs leading-5 text-neutral-600">현재 입력한 정보는 저장하거나 전송하지 않습니다.</p>
                </div>
              </form>
            </>
          )}

          {step === "done" && (
            <div className="mt-10 max-w-2xl rounded-xl border border-neutral-200 p-6 sm:p-8">
              <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold tracking-tight focus:outline-none">예약 화면 체험 완료</h1>
              <p className="mt-3 leading-7 text-neutral-600">현재는 미리보기로, 실제 예약은 접수되지 않았습니다.</p>
              <button type="button" onClick={() => setStep("home")} className="mt-6 rounded-lg bg-black px-5 py-3 font-medium text-white">예약 홈으로</button>
            </div>
          )}
      </main>
    </>
  );
}
