"use client";

import { useMemo } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import RecordCard from "@/components/RecordCard";
import { useLiveCommonQuestions, useLiveInspections } from "@/lib/hooks";
import { aggregateParticipants } from "@/lib/aggregation";

export default function Home() {
  const { data: allInspections, loading: loadingInspections } = useLiveInspections();
  const { data: commonQuestions } = useLiveCommonQuestions();

  // 참가자별 통합 (참가자당 1개 카드)
  const participants = useMemo(() => {
    const aggregated = aggregateParticipants(allInspections, commonQuestions);
    return aggregated.filter((p) => p.isPublic);
  }, [allInspections, commonQuestions]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">오늘의 박제</h1>
            <p className="mt-2 text-neutral-500">거짓말탐지기에서 방금 나온 결과입니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/search"
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              검색
            </Link>
            <Link
              href="/reserve"
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              {"예약하러가기 →"}
            </Link>
          </div>
        </div>



        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {participants.map((participant) => (
            <RecordCard key={participant.participantId} record={participant} compact={true} />
          ))}
        </div>

        {!loadingInspections && participants.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-20 text-center text-neutral-500">
            아직 박제된 사람이 없습니다.
          </div>
        )}
      </main>
    </>
  );
}
