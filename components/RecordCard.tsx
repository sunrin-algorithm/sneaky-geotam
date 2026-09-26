import Link from "next/link";
import { RecordItem } from "@/lib/types";

function resultText(result: RecordItem["result"]) {
  if (result === "lie") return "거짓";
  if (result === "truth") return "진실";
  return "판정 불가";
}

export default function RecordCard({ record }: { record: RecordItem }) {
  return (
    <Link href={`/result/${record.id}`} className="block rounded-xl border border-neutral-200 p-5 transition hover:bg-neutral-50">
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
        <span className={`text-sm font-bold ${record.result === "lie" ? "text-red-600" : record.result === "truth" ? "text-green-600" : "text-neutral-500"}`}>
          {resultText(record.result)}
        </span>
      </div>
    </Link>
  );
}
