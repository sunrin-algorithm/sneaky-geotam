"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { useLiveQuestions } from "@/lib/hooks";
import { saveRecord } from "@/lib/storage";
import { Result } from "@/lib/types";

export default function RecordPage() {
  const { data: questions } = useLiveQuestions();
  const [nickname, setNickname] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>("unknown");
  const [savedId, setSavedId] = useState("");

  useEffect(() => {
    if (questions.length && !questionId) {
      setQuestionId(questions[0].id);
    }
  }, [questions, questionId]);

  function submit() {
    const question = questions.find((q) => q.id === questionId);
    if (!nickname.trim() || !answer.trim() || !question) return;

    const record = {
      id: crypto.randomUUID(),
      number: `#${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      nickname: nickname.trim(),
      question: question.content,
      answer: answer.trim(),
      result,
      createdAt: new Date().toISOString(),
      isPublic: true,
    };

    saveRecord(record);
    setSavedId(record.id);
    setNickname("");
    setAnswer("");
    setResult("unknown");
  }

  if (savedId) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <p className="text-sm text-neutral-500">박제 완료</p>
          <h1 className="mt-2 text-3xl font-bold">결과가 등록되었습니다.</h1>
          <div className="mt-8 rounded-xl border border-neutral-200 p-6">
            <p className="text-sm text-neutral-500">공유 링크</p>
            <a href={`/result/${savedId}`} className="mt-2 block break-all font-medium underline">
              {window.location.origin}/result/{savedId}
            </a>
          </div>
          <button onClick={() => setSavedId("")} className="mt-6 rounded-lg bg-black px-5 py-3 font-medium text-white">
            다음 검사
          </button>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-5 py-10">
        <p className="text-sm font-medium text-neutral-500">OPERATOR</p>
        <h1 className="mt-2 text-3xl font-bold">검사 결과 기록</h1>

        <div className="mt-8 space-y-6">
          <label className="block">
            <span className="text-sm font-medium">닉네임</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" placeholder="닉네임" />
          </label>

          <label className="block">
            <span className="text-sm font-medium">질문</span>
            <select value={questionId} onChange={(e) => setQuestionId(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3">
              {questions.map((q) => <option key={q.id} value={q.id}>{q.content}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">참가자 대답</span>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" placeholder="예 / 아니오" />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">실제 기기 판정</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                ["truth", "진실"],
                ["lie", "거짓"],
                ["unknown", "판정 불가"],
              ] as [Result, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setResult(value)} className={`rounded-lg border p-3 text-sm font-medium ${result === value ? "border-black bg-black text-white" : "border-neutral-300"}`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <button onClick={submit} disabled={!nickname.trim() || !answer.trim()} className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-30">
            박제하기
          </button>
        </div>
      </main>
    </>
  );
}