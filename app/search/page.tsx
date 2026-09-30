"use client";

import { useMemo, useState } from "react";
import Header from "@/components/Header";
import RecordCard from "@/components/RecordCard";
import { useLiveCommonQuestions, useLiveInspections } from "@/lib/hooks";
import { aggregateParticipants } from "@/lib/aggregation";

export default function SearchPage() {
  const { data: inspections, loading: loadingInspections } = useLiveInspections();
  const { data: commonQuestions } = useLiveCommonQuestions();
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const publicParticipants = useMemo(() => {
    const aggregated = aggregateParticipants(inspections, commonQuestions);
    return aggregated.filter((item) => item.isPublic);
  }, [inspections, commonQuestions]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return publicParticipants.filter(
      (item) =>
        item.participantName.toLowerCase().includes(q) ||
        item.latestNumber.toLowerCase().includes(q)
    );
  }, [publicParticipants, query]);

  function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setHasSearched(true);
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-3xl font-bold">박제 검색</h1>
        <p className="mt-2 text-neutral-500">참가자 이름이나 검사 번호로 찾아보세요.</p>

        <form onSubmit={handleSearch} className="mt-8 flex gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHasSearched(false);
            }}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 p-3 outline-none focus:border-black"
            placeholder="예: 주영 / #A7F2"
          />
          <button
            type="submit"
            className="rounded-lg bg-black px-5 font-medium text-white hover:bg-neutral-800"
          >
            검색
          </button>
        </form>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {results.map((r) => (
            <RecordCard key={r.participantId} record={r} />
          ))}
        </div>

        {hasSearched && query.trim() !== "" && results.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-16 text-center text-neutral-500">
            &apos;{query}&apos;에 대한 검색 결과가 없습니다.
          </div>
        )}

        {!hasSearched && query.trim() === "" && !loadingInspections && (
          <p className="mt-6 text-sm text-neutral-400">
            이름이나 검사 번호를 입력한 후 검색 버튼을 누르거나 Enter 키를 누르세요.
          </p>
        )}
      </main>
    </>
  );
}
