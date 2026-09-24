"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { useLiveRecords } from "@/lib/hooks";
import { RecordItem } from "@/lib/types";

export default function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: records } = useLiveRecords();
  const [record, setRecord] = useState<RecordItem | null>(null);
  const [id, setId] = useState("");

  useEffect(() => {
    params.then(({ id }) => {
      setId(id);
      setRecord(records.find((r) => r.id === id) ?? null);
    });
  }, [params, records]);

  if (!record) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="text-2xl font-bold">결과를 찾을 수 없습니다.</h1>
          <Link href="/" className="mt-6 inline-block text-sm underline">돌아가기</Link>
        </main>
      </>
    );
  }

  const result = record.result === "lie" ? "거짓" : record.result === "truth" ? "진실" : "판정 불가";
  const resultClass = record.result === "lie" ? "text-red-600" : record.result === "truth" ? "text-green-600" : "text-neutral-500";

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "거짓말탐지기 결과", text: `${record!.nickname}의 거짓말탐지기 결과`, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("결과 링크를 복사했습니다.");
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-5 py-12">
        <Link href="/" className="text-sm text-neutral-500">← 오늘의 박제</Link>

        <section className="mt-8 rounded-2xl border border-neutral-200 p-7">
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>{record.number}</span>
            <span>{new Date(record.createdAt).toLocaleString("ko-KR")}</span>
          </div>

          <h1 className="mt-8 text-4xl font-bold">{record.nickname}</h1>

          <div className="mt-10">
            <p className="text-sm text-neutral-500">질문</p>
            <p className="mt-2 text-xl font-medium leading-8">{record.question}</p>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-8">
            <p className="text-sm text-neutral-500">대답</p>
            <p className="mt-2 text-xl font-semibold">{record.answer}</p>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-8">
            <p className="text-sm text-neutral-500">거짓말탐지기 판정</p>
            <p className={`mt-2 text-4xl font-bold ${resultClass}`}>{result}</p>
          </div>

          <button onClick={share} className="mt-10 w-full rounded-lg bg-black px-5 py-3 font-medium text-white">
            결과 공유하기
          </button>
        </section>

        <p className="mt-5 text-center text-xs text-neutral-400">
          실제 거짓말탐지기 측정 결과를 기록한 페이지입니다.
        </p>
      </main>
    </>
  );
}