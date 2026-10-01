"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useLiveReservations } from "@/lib/hooks";
import { reservationRepo } from "@/lib/storage";
import { Reservation, ReservationSection } from "@/lib/types";

type SectionKey = "free" | "common";
type Step = "home" | "sections" | "form" | "done";

const sections: Record<SectionKey, { title: string; sectionName: ReservationSection; notice: string }> = {
  free: {
    title: "자율 섹션",
    sectionName: "자율",
    notice: "자율 섹션의 경우 금도끼, 은도끼, 피노키오 코 수상이 불가합니다.",
  },
  common: {
    title: "공통 섹션",
    sectionName: "공통",
    notice: "공통 섹션의 경우 거짓말 탐지기 대상자는 딱 1명으로 고정됩니다.",
  },
};

export default function ReservePage() {
  const { data: allReservations } = useLiveReservations();
  const [step, setStep] = useState<Step>("home");
  const [selectedKey, setSelectedKey] = useState<SectionKey>("free");
  const [details, setDetails] = useState({ studentId: "", name: "", phone: "", people: "" });
  const [agreed, setAgreed] = useState(false);
  const [createdReservation, setCreatedReservation] = useState<Reservation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const heading = useRef<HTMLHeadingElement>(null);
  const peopleInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [step]);

  useEffect(() => {
    if (step === "form" && peopleInputRef.current) {
      const people = parseInt(details.people, 10) || 1;
      if (selectedKey === "free") {
        peopleInputRef.current.setCustomValidity(
          people < 2 ? "1인의 경우 공통섹션 지원만 가능합니다!" : ""
        );
      } else {
        peopleInputRef.current.setCustomValidity("");
      }
    }
  }, [step, selectedKey, details.people]);

  // 대기 현황 계산 (실제 데이터 기반)
  const queueStats = useMemo(() => {
    const freeWaiting = allReservations.filter(
      (r) => r.section === "자율" && r.status === "대기"
    ).length;
    const commonWaiting = allReservations.filter(
      (r) => r.section === "공통" && r.status === "대기"
    ).length;
    return { free: freeWaiting, common: commonWaiting };
  }, [allReservations]);

  function selectSection(value: SectionKey) {
    setSelectedKey(value);
    setAgreed(false);
    setStep("form");
    if (value === "free") {
      const people = parseInt(details.people, 10) || 1;
      peopleInputRef.current?.setCustomValidity(
        people < 2 ? "1인의 경우 공통섹션 지원만 가능합니다!" : ""
      );
    } else {
      peopleInputRef.current?.setCustomValidity("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed) {
      alert("주의 사항을 확인하고 체크해 주세요.");
      return;
    }

    const peopleCount = parseInt(details.people, 10) || 1;
    if (selectedKey === "free" && peopleCount < 2) {
      alert("1인의 경우 공통섹션 지원만 가능합니다!");
      return;
    }

    setIsSubmitting(true);
    try {
      const nextId = await reservationRepo.getNextId();
      const newReservation: Reservation = {
        id: nextId,
        section: sections[selectedKey].sectionName,
        name: details.name.trim(),
        studentId: details.studentId.trim(),
        phone: details.phone.trim(),
        people: parseInt(details.people, 10) || 1,
        status: "대기",
        createdAt: new Date().toISOString(),
      };

      await reservationRepo.create(newReservation);
      setCreatedReservation(newReservation);
      setStep("done");
      setDetails({ studentId: "", name: "", phone: "", people: "" });
      setAgreed(false);
    } catch (e) {
      console.error(e);
      alert("예약 접수에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
        </div>

        {step !== "home" && step !== "done" && (
          <button
            type="button"
            onClick={() => setStep(step === "form" ? "sections" : "home")}
            className="mt-8 text-sm text-neutral-600 underline underline-offset-4 hover:text-black"
          >
            ← {step === "form" ? "섹션 선택" : "예약 홈"}
          </button>
        )}

        {/* ==================================================== */}
        {/* 1단계: 예약 홈                                       */}
        {/* ==================================================== */}
        {step === "home" && (
          <>
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-2 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl"
            >
              거짓말탐지기 예약
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
              참여할 섹션을 선택하고 예약 정보를 입력해 주세요.
            </p>

            <section className="mt-10" aria-labelledby="queue-title">
              <h2 id="queue-title" className="text-xl font-bold">
                현재 대기 현황
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(Object.keys(sections) as SectionKey[]).map((key) => (
                  <div key={key} className="rounded-xl border border-neutral-200 p-5">
                    <p className="text-sm font-medium text-neutral-500">{sections[key].title}</p>
                    <p className="mt-3 text-3xl font-bold">
                      {queueStats[key]}{" "}
                      <span className="text-sm font-normal text-neutral-500">팀 대기 중</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                실시간으로 접수된 대기 팀 수가 반영됩니다.
              </p>
            </section>

            <button
              type="button"
              onClick={() => setStep("sections")}
              className="mt-10 w-full rounded-lg bg-black px-5 py-3.5 font-medium text-white hover:bg-neutral-800 transition"
            >
              예약하기
            </button>

            <details className="mt-6 rounded-xl border border-neutral-200 p-5">
              <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black">
                이 부스는 어떤 부스인가요?
              </summary>
              <div className="mt-4 border-t border-neutral-100 pt-4 text-sm leading-6 text-neutral-600 space-y-2">
                <p className="font-semibold text-neutral-800">
                  선린인터넷고등학교 축제 거짓말탐지기 체험 부스입니다.
                </p>
                <p>
                  최신 거짓말탐지기 장비를 통해 친구들과 함께 재미있는 질문에 답하고 진실/거짓 여부를 판정받아 보세요!
                </p>
                <p className="text-xs text-neutral-500">
                  * 공통 섹션과 자율 섹션 중 원하는 방식을 선택하여 예약할 수 있습니다.
                </p>
              </div>
            </details>
          </>
        )}

        {/* ==================================================== */}
        {/* 2단계: 섹션 선택                                     */}
        {/* ==================================================== */}
        {step === "sections" && (
          <>
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-3 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl"
            >
              섹션 선택
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
              참여할 섹션을 선택해 주세요.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {(Object.keys(sections) as SectionKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSection(key)}
                  className="rounded-xl border border-neutral-200 p-6 text-left transition hover:border-black hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                >
                  <span className="text-xl font-bold">{sections[key].title}</span>
                  <span className="mt-3 block text-sm leading-6 text-neutral-500">
                    {sections[key].notice}
                  </span>
                  <span className="mt-4 inline-block text-xs font-semibold text-black underline underline-offset-4">
                    이 섹션으로 예약하기 →
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ==================================================== */}
        {/* 3단계: 예약 정보 입력                                */}
        {/* ==================================================== */}
        {step === "form" && (
          <>
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-3 text-3xl font-bold tracking-tight focus:outline-none sm:text-4xl"
            >
              {sections[selectedKey].title} 예약
            </h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
              대표자 정보와 참여 인원을 입력해 주세요.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5 rounded-xl border border-neutral-200 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  학번
                  <input
                    name="studentId"
                    autoComplete="off"
                    inputMode="numeric"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    title="5자리 학번을 입력해 주세요. (예: 10101)"
                    required
                    placeholder="예: 10101"
                    value={details.studentId}
                    onChange={(e) => setDetails({ ...details, studentId: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-neutral-300 p-3 font-normal outline-none focus:border-black"
                  />
                </label>
                <label className="block text-sm font-medium">
                  이름
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={30}
                    pattern=".*\S.*"
                    title="이름을 입력해 주세요."
                    placeholder="예: 홍길동"
                    value={details.name}
                    onChange={(e) => setDetails({ ...details, name: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-neutral-300 p-3 font-normal outline-none focus:border-black"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium">
                전화번호
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  pattern="01[016789]-?[0-9]{3,4}-?[0-9]{4}"
                  maxLength={13}
                  title="휴대전화 번호를 입력해 주세요. 예: 010-1234-5678"
                  placeholder="010-0000-0000"
                  value={details.phone}
                  onChange={(e) => setDetails({ ...details, phone: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-neutral-300 p-3 font-normal outline-none focus:border-black"
                />
                <span className="mt-1 block text-xs font-normal text-neutral-500">
                  차례가 되면 대표자에게 연락드립니다.
                </span>
              </label>

              <label className="block text-sm font-medium">
                인원 수
                <input
                  ref={peopleInputRef}
                  name="people"
                  type="number"
                  inputMode="numeric"
                  min={selectedKey === "free" ? 2 : 1}
                  max={20}
                  step={1}
                  required
                  placeholder={selectedKey === "free" ? "본인 포함 참여 인원 (최소 2명)" : "본인 포함 참여 인원"}
                  value={details.people}
                  onChange={(e) => {
                    setDetails({ ...details, people: e.target.value });
                    if (selectedKey === "free") {
                      const val = parseInt(e.target.value, 10) || 1;
                      e.target.setCustomValidity(
                        val < 2 ? "1인의 경우 공통섹션 지원만 가능합니다!" : ""
                      );
                    } else {
                      e.target.setCustomValidity("");
                    }
                  }}
                  onInvalid={(e) => {
                    if (selectedKey === "free") {
                      (e.target as HTMLInputElement).setCustomValidity("1인의 경우 공통섹션 지원만 가능합니다!");
                    }
                  }}
                  className="mt-2 w-full rounded-lg border border-neutral-300 p-3 font-normal outline-none focus:border-black"
                />
                {selectedKey === "free" && (
                  <span className="mt-1 block text-xs font-normal text-neutral-500">
                    자율 섹션은 2명 이상부터 지원 가능합니다.
                  </span>
                )}
              </label>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
                <h2 className="font-semibold text-neutral-900">예약 전 확인해 주세요</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 leading-6 text-neutral-600">
                  <li>연락 후 5분 간 부스에 도착하지 못할 시 예약은 자동 취소될 수 있습니다.</li>
                  <li>{sections[selectedKey].notice}</li>
                </ul>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="h-4 w-4 accent-black"
                />
                <span>위 주의 사항을 모두 확인했습니다.</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-black px-5 py-3.5 font-medium text-white transition hover:bg-neutral-800 disabled:opacity-30"
              >
                {isSubmitting ? "예약 접수 중..." : "예약 접수하기"}
              </button>
            </form>
          </>
        )}

        {/* ==================================================== */}
        {/* 4단계: 완료 화면                                     */}
        {/* ==================================================== */}
        {step === "done" && createdReservation && (
          <div className="mt-10 max-w-2xl rounded-2xl border border-neutral-200 p-6 sm:p-8">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              예약 접수 완료
            </span>
            <h1
              ref={heading}
              tabIndex={-1}
              className="mt-3 text-3xl font-bold tracking-tight focus:outline-none"
            >
              예약이 성공적으로 완료되었습니다!
            </h1>
            <p className="mt-3 leading-7 text-neutral-600">
              차례가 되면 대표자 전화번호로 안내해 드립니다.
            </p>

            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">예약 번호</span>
                <span className="text-xl font-bold text-black">
                  #{String(createdReservation.id).padStart(3, "0")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">참여 섹션</span>
                <span className="font-semibold">{createdReservation.section} 섹션</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">대표자 이름</span>
                <span>{createdReservation.name} ({createdReservation.studentId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">참여 인원</span>
                <span>{createdReservation.people}명</span>
              </div>
            </div>

            <p className="mt-4 text-xs text-neutral-500">
              * 안내 연락 후 5분 이내 부스에 도착하지 않으면 예약이 취소될 수 있습니다.
            </p>

            <button
              type="button"
              onClick={() => {
                setStep("home");
                setCreatedReservation(null);
              }}
              className="mt-6 rounded-lg bg-black px-5 py-3 font-medium text-white hover:bg-neutral-800"
            >
              예약 홈으로
            </button>
          </div>
        )}
      </main>
    </>
  );
}
