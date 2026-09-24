import { Question, RecordItem } from "./types";
import {
  firestoreDeleteRecord,
  firestoreReplaceQuestions,
  firestoreSetRecord,
  firestoreUpdateRecord,
} from "./firestore";

const QUESTION_KEY = "lie-detector-questions";
const RECORD_KEY = "lie-detector-records";

const defaultQuestions: Question[] = [
  { id: "q1", content: "오늘 좋아하는 사람이 이 축제에 왔나요?" },
  { id: "q2", content: "오늘 지각했나요?" },
  { id: "q3", content: "친구에게 숨기는 비밀이 있나요?" },
  { id: "q4", content: "오늘 가장 만나고 싶었던 사람이 있나요?" },
];

export function getQuestions(): Question[] {
  if (typeof window === "undefined") return defaultQuestions;
  const raw = localStorage.getItem(QUESTION_KEY);
  if (!raw) {
    localStorage.setItem(QUESTION_KEY, JSON.stringify(defaultQuestions));
    return defaultQuestions;
  }
  return JSON.parse(raw);
}

export function saveQuestions(items: Question[]) {
  localStorage.setItem(QUESTION_KEY, JSON.stringify(items));
  firestoreReplaceQuestions(items);
}

export function replaceQuestions(items: Question[]) {
  localStorage.setItem(QUESTION_KEY, JSON.stringify(items));
}

export function getRecords(): RecordItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(RECORD_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function replaceRecords(items: RecordItem[]) {
  localStorage.setItem(RECORD_KEY, JSON.stringify(items));
}

export function saveRecord(item: RecordItem) {
  const records = getRecords();
  localStorage.setItem(RECORD_KEY, JSON.stringify([item, ...records]));
  firestoreSetRecord(item);
}

export function updateRecord(id: string, patch: Partial<RecordItem>) {
  const records = getRecords().map((r) => r.id === id ? { ...r, ...patch } : r);
  localStorage.setItem(RECORD_KEY, JSON.stringify(records));
  firestoreUpdateRecord(id, patch);
}

export function deleteRecord(id: string) {
  localStorage.setItem(
    RECORD_KEY,
    JSON.stringify(getRecords().filter((r) => r.id !== id))
  );
  firestoreDeleteRecord(id);
}