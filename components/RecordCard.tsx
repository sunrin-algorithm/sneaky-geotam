import Link from "next/link";
import { AggregatedParticipant, InspectionSession, RecordItem } from "@/lib/types";

function isAggregatedParticipant(
  item: AggregatedParticipant | InspectionSession | RecordItem
): item is AggregatedParticipant {
  return "participantId" in item && "allQuestions" in item;
}

function isInspectionSession(
  item: AggregatedParticipant | InspectionSession | RecordItem
): item is InspectionSession {
  return "questions" in item && Array.isArray((item as InspectionSession).questions);
}

export default function RecordCard({
  record,
  compact = false,
}: {
  record: AggregatedParticipant | InspectionSession | RecordItem;
  compact?: boolean;
}) {
  // 1. 참가자별 통합 카드 (신규 기본)
  if (isAggregatedParticipant(record)) {
    return (
      <Link
        href={`/result/${record.participantId}`}
        className="block rounded-xl border border-neutral-200 p-5 transition hover:bg-neutral-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-500">{record.latestNumber}</span>
            {!compact && record.sessionCount > 1 && (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 font-medium">
                {record.sessionCount}회 참여
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-400">
            {new Date(record.latestCreatedAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-lg font-semibold">{record.participantName}</p>
          <p className="mt-1 text-sm text-neutral-500">
            총 {record.totalQuestions}개 질문 진행
            {!compact && record.commonQuestions.length > 0 && record.customQuestions.length > 0 && (
              <span className="ml-1 text-xs text-neutral-400">
                (공통 {record.commonQuestions.length} + 자율 {record.customQuestions.length})
              </span>
            )}
          </p>
        </div>

        <div className={`mt-4 flex items-center ${compact ? "justify-end" : "justify-between"} border-t border-neutral-100 pt-3`}>
          {!compact && (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-green-600">진실 {record.truthCount}</span>
              <span className="font-semibold text-red-600">거짓 {record.lieCount}</span>
              {record.unknownCount > 0 && (
                <span className="font-medium text-neutral-500">불가 {record.unknownCount}</span>
              )}
            </div>
          )}
          <span className="text-xs text-neutral-400 underline underline-offset-2">
            전체 결과 보기 →
          </span>
        </div>
      </Link>
    );
  }

  // 2. 단일 검사 세션 카드 (하위 호환)
  if (isInspectionSession(record)) {
    const truthCount = record.questions.filter((q) => q.result === "truth").length;
    const lieCount = record.questions.filter((q) => q.result === "lie").length;
    const unknownCount = record.questions.filter((q) => q.result === "unknown").length;
    const typeLabel = record.type === "common" ? "공통 질문" : "자율 질문";

    return (
      <Link
        href={`/result/${record.id}`}
        className="block rounded-xl border border-neutral-200 p-5 transition hover:bg-neutral-50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-500">{record.number}</span>
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 font-medium">
              {typeLabel}
            </span>
          </div>
          <span className="text-xs text-neutral-400">
            {new Date(record.createdAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="mt-4">
          <p className="text-lg font-semibold">{record.participantName}</p>
          <p className="mt-1 text-sm text-neutral-500">
            총 {record.questions.length}개 질문 진행
          </p>
        </div>

        <div className={`mt-4 flex items-center ${compact ? "justify-end" : "justify-between"} border-t border-neutral-100 pt-3`}>
          {!compact && (
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-green-600">진실 {truthCount}</span>
              <span className="font-semibold text-red-600">거짓 {lieCount}</span>
              {unknownCount > 0 && (
                <span className="font-medium text-neutral-500">불가 {unknownCount}</span>
              )}
            </div>
          )}
          <span className="text-xs text-neutral-400 underline underline-offset-2">
            자세히 보기 →
          </span>
        </div>
      </Link>
    );
  }

  // 3. 구형 RecordItem 폴백 호환
  const resultText = record.result === "lie" ? "거짓" : record.result === "truth" ? "진실" : "판정 불가";
  return (
    <Link
      href={`/result/${record.id}`}
      className="block rounded-xl border border-neutral-200 p-5 transition hover:bg-neutral-50"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-500">{record.number}</span>
        <span className="text-xs text-neutral-400">
          {new Date(record.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-lg font-semibold">{record.nickname}</p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{record.question}</p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4">
        <span className="text-sm text-neutral-500">대답: {record.answer}</span>
        <span
          className={`text-sm font-bold ${
            record.result === "lie"
              ? "text-red-600"
              : record.result === "truth"
              ? "text-green-600"
              : "text-neutral-500"
          }`}
        >
          {resultText}
        </span>
      </div>
    </Link>
  );
}
