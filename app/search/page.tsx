"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import RecordCard from "@/components/RecordCard";
import { useLiveRecords } from "@/lib/hooks";
import { RecordItem } from "@/lib/types";

export default function SearchPage() {
  const { data: recordPool } = useLiveRecords();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecordItem[]>([]);

  function search() {
    const q = query.trim().toLowerCase();
    setResults(q ? recordPool.filter((r) => r.isPublic && (r.nickname.toLowerCase().includes(q) || r.number.toLowerCase().includes(q))) : []);
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="text-3xl font-bold">박제 검색</h1>
        <p className="mt-2 text-neutral-500">닉네임이나 검사 번호로 찾아보세요.</p>

        <div className="mt-8 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} className="min-w-0 flex-1 rounded-lg border border-neutral-300 p-3" placeholder="예: 주영 / #A7F2" />
          <button onClick={search} className="rounded-lg bg-black px-5 font-medium text-white">검색</button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {results.map((r) => <RecordCard key={r.id} record={r} />)}
        </div>
      </main>
    </>
  );
}
