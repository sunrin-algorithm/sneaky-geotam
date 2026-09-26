"use client";

import Link from "next/link";
import Header from "@/components/Header";
import RecordCard from "@/components/RecordCard";
import { useLiveRecords } from "@/lib/hooks";

export default function Home() {
  const { data: allRecords } = useLiveRecords();
  const records = allRecords.filter((r) => r.isPublic);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">SUNRIN FESTIVAL 2026</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">오늘의 박제</h1>
            <p className="mt-2 text-neutral-500">거짓말탐지기에서 방금 나온 결과입니다.</p>
          </div>
          <Link href="/search" className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium">
            검색
          </Link>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {records.map((record) => <RecordCard key={record.id} record={record} />)}
        </div>

        {records.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-20 text-center text-neutral-500">
            아직 박제된 사람이 없습니다.
          </div>
        )}
      </main>
    </>
  );
}
