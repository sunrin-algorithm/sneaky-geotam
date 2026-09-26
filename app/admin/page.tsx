"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { useLiveQuestions, useLiveRecords } from "@/lib/hooks";
import { deleteRecord, saveQuestions, saveRecord, updateRecord } from "@/lib/storage";
import { Result } from "@/lib/types";

export default function AdminPage() {
  const { data: questions, refetch: refetchQuestions } = useLiveQuestions();
  const { data: records, refetch: refetchRecords } = useLiveRecords();
  const [newQuestion, setNewQuestion] = useState("");
  const [nickname, setNickname] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>("unknown");

  const isOther = questionId === "__other__";

  function submitRecord() {
    if (!nickname.trim() || !answer.trim()) return;

    let question = questions.find((q) => q.id === questionId);
    if (isOther) {
      if (!customQuestion.trim()) return;
      question = { id: crypto.randomUUID(), content: customQuestion.trim() };
      saveQuestions([...questions, question]);
      refetchQuestions();
    }
    if (!question) return;

    saveRecord({
      id: crypto.randomUUID(),
      number: `#${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      nickname: nickname.trim(),
      question: question.content,
      answer: answer.trim(),
      result,
      createdAt: new Date().toISOString(),
      isPublic: true,
    });
    setNickname("");
    setAnswer("");
    setResult("unknown");
    setCustomQuestion("");
    refetchRecords();
  }

  function addQuestion() {
    if (!newQuestion.trim()) return;
    const next = [...questions, { id: crypto.randomUUID(), content: newQuestion.trim() }];
    saveQuestions(next);
    setNewQuestion("");
    refetchQuestions();
  }

  function removeQuestion(id: string) {
    const next = questions.filter((q) => q.id !== id);
    saveQuestions(next);
    refetchQuestions();
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <h1 className="text-3xl font-bold lg:text-5xl">관리자</h1>

        <section className="mt-10 lg:mt-12">
          <h2 className="text-xl font-bold lg:text-2xl">박제 등록</h2>
          <div className="mt-4 space-y-4 rounded-xl border border-neutral-200 p-5 lg:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">닉네임</span>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 outline-none" placeholder="닉네임" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">질문</span>
                <select value={questionId} onChange={(e) => setQuestionId(e.target.value)} className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3">
                  {questions.map((q) => <option key={q.id} value={q.id}>{q.content}</option>)}
                  <option value="__other__">기타 (직접 입력)</option>
                </select>
              </label>
            </div>
            {isOther && (
              <label className="block">
                <span className="text-sm font-medium">직접 입력한 질문</span>
                <input value={customQuestion} onChange={(e) => setCustomQuestion(e.target.value)} className="w-full rounded-lg border border-neutral-300 p-3 outline-none" placeholder="질문을 입력하세요" />
              </label>
            )}
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
            <button onClick={submitRecord} disabled={!nickname.trim() || !answer.trim() || (!questionId && !isOther) || (isOther && !customQuestion.trim())} className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-30">
              박제 등록
            </button>
          </div>
        </section>

        <section className="mt-10 lg:mt-12">
          <h2 className="text-xl font-bold lg:text-2xl">질문 관리</h2>
          <div className="mt-3 flex gap-2">
            <input value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQuestion()} className="min-w-0 flex-1 rounded-lg border border-neutral-300 p-3" placeholder="질문 추가" />
            <button onClick={addQuestion} className="rounded-lg bg-black px-5 font-medium text-white">추가</button>
          </div>
          <div className="mt-4 divide-y rounded-xl border border-neutral-200">
            {questions.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-4 p-4">
                <span>{q.content}</span>
                <button onClick={() => removeQuestion(q.id)} className="text-sm text-red-600">삭제</button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 lg:mt-14">
          <h2 className="text-xl font-bold lg:text-2xl">박제 관리</h2>
          <div className="mt-4 divide-y rounded-xl border border-neutral-200">
            {records.map((record) => (
              <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{record.number} · {record.nickname}</p>
                  <p className="mt-1 text-sm text-neutral-500">{record.question}</p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => { updateRecord(record.id, { isPublic: !record.isPublic }); refetchRecords(); }} className="text-neutral-600">
                    {record.isPublic ? "공개 중" : "비공개"}
                  </button>
                  <button onClick={() => { deleteRecord(record.id); refetchRecords(); }} className="text-red-600">삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
