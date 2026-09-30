"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useLiveCommonQuestions, useLiveInspections } from "@/lib/hooks";
import { findAggregatedParticipant } from "@/lib/aggregation";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: inspections, loading: loadingInspections } = useLiveInspections();
  const { data: commonQuestions } = useLiveCommonQuestions();
  const [resolvedId, setResolvedId] = useState("");

  useEffect(() => {
    params.then(({ id }) => {
      setResolvedId(id);
    });
  }, [params]);

  const participant = useMemo(() => {
    if (!resolvedId || inspections.length === 0) return null;
    return findAggregatedParticipant(resolvedId, inspections, commonQuestions);
  }, [resolvedId, inspections, commonQuestions]);

  if (loadingInspections && !participant) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center text-neutral-500">
          결과를 불러오는 중입니다...
        </main>
      </>
    );
  }

  // 비공개이거나 존재하지 않는 경우
  if (!participant || !participant.isPublic) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="text-2xl font-bold">결과를 찾을 수 없습니다.</h1>
          <p className="mt-2 text-sm text-neutral-500">
            존재하지 않거나 비공개 처리된 검사 기록입니다.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
            돌아가기
          </Link>
        </main>
      </>
    );
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "거짓말탐지기 결과",
          text: `${participant!.participantName}님의 거짓말탐지기 결과`,
          url,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      alert("결과 링크를 복사했습니다.");
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/" className="text-sm text-neutral-500 hover:text-black">
          ← 오늘의 박제
        </Link>

        <section className="mt-8 rounded-2xl border border-neutral-200 p-7 sm:p-8">
          {/* 헤더 메타정보 */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-700">{participant.latestNumber}</span>
              {participant.sessionCount > 1 && (
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 font-medium">
                  검사 {participant.sessionCount}회 누적 통합
                </span>
              )}
            </div>
            <span>
              최근 검사:{" "}
              {new Date(participant.latestCreatedAt).toLocaleString("ko-KR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>

          <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight">
            {participant.participantName}
          </h1>

          {/* 종합 요약 통계 */}
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-neutral-50 p-4 text-sm">
            <span className="text-neutral-600">
              총 <strong>{participant.totalQuestions}개</strong>의 질문
            </span>
            <span className="text-neutral-300">|</span>
            <span className="font-semibold text-green-600">진실 {participant.truthCount}회</span>
            <span className="font-semibold text-red-600">거짓 {participant.lieCount}회</span>
            {participant.unknownCount > 0 && (
              <span className="text-neutral-500">판정 불가 {participant.unknownCount}회</span>
            )}
          </div>

          {/* 질문 목록: 공통 질문 먼저, 자율 질문 나중에 */}
          <div className="mt-8 space-y-8">
            {/* 1. 공통 질문 섹션 */}
            {participant.commonQuestions.length > 0 && (
              <div>
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-neutral-900"></span>
                    <h2 className="text-base font-bold text-neutral-900">
                      공통 질문 ({participant.commonQuestions.length})
                    </h2>
                  </div>
                  <span className="text-xs text-neutral-400">최신 판정 반영</span>
                </div>
                <div className="mt-4 space-y-4">
                  {participant.commonQuestions.map((q, idx) => {
                    const isTruth = q.result === "truth";
                    const isLie = q.result === "lie";
                    const resultText = isLie ? "거짓" : isTruth ? "진실" : "판정 불가";

                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-400">
                            공통 질문 {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                              isTruth
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : isLie
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-neutral-200 bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {resultText}
                          </span>
                        </div>

                        <p className="mt-2 text-lg font-medium leading-7 text-neutral-900">
                          {q.question}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-500">참가자 대답:</span>
                            <span
                              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                                q.answer === "yes"
                                  ? "border-neutral-900 bg-neutral-900 text-white"
                                  : "border-neutral-400 bg-white text-neutral-900"
                              }`}
                            >
                              {q.answer === "yes" ? "예" : "아니오"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400">탐지기 판정:</span>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                                isTruth
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : isLie
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-neutral-200 bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {resultText}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. 자율 질문 섹션 */}
            {participant.customQuestions.length > 0 && (
              <div>
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full border border-neutral-400 bg-neutral-200"></span>
                    <h2 className="text-base font-bold text-neutral-900">
                      자율 질문 ({participant.customQuestions.length})
                    </h2>
                  </div>
                  <span className="text-xs text-neutral-400">시간순 누적 기록</span>
                </div>
                <div className="mt-4 space-y-4">
                  {participant.customQuestions.map((q, idx) => {
                    const isTruth = q.result === "truth";
                    const isLie = q.result === "lie";
                    const resultText = isLie ? "거짓" : isTruth ? "진실" : "판정 불가";

                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-neutral-300 bg-neutral-100/75 p-5 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-500">
                            자율 질문 {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                              isTruth
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : isLie
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-neutral-200 bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {resultText}
                          </span>
                        </div>

                        <p className="mt-2 text-lg font-medium leading-7 text-neutral-900">
                          {q.question}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200/60 pt-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-500">참가자 대답:</span>
                            <span
                              className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                                q.answer === "yes"
                                  ? "border-neutral-900 bg-neutral-900 text-white"
                                  : "border-neutral-400 bg-white text-neutral-900"
                              }`}
                            >
                              {q.answer === "yes" ? "예" : "아니오"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-400">탐지기 판정:</span>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                                isTruth
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : isLie
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-neutral-200 bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {resultText}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={share}
            className="mt-10 w-full rounded-lg bg-black px-5 py-3 font-medium text-white transition hover:bg-neutral-800"
          >
            결과 공유하기
          </button>
        </section>

        <p className="mt-6 text-center text-xs text-neutral-400 leading-5">
          본 결과는 축제 체험용 거짓말탐지기에서 기록한 결과입니다.
        </p>
      </main>
    </>
  );
}
