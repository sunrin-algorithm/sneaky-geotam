import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  getFirestore,
  type Firestore,
  type Query,
} from "firebase/firestore";
import { getApp } from "./firebase";
import { Question, RecordItem } from "./types";

let db: Firestore | null = null;

function getDb(): Firestore | null {
  const app = getApp();
  if (!app) return null;
  if (!db) db = getFirestore(app);
  return db;
}

function subscribe<Data>(
  getQuery: (d: Firestore) => Query,
  parse: (data: Record<string, unknown>) => Data,
  callback: (items: Data[]) => void
): () => void {
  const d = getDb();
  if (!d) return () => {};
  return onSnapshot(
    getQuery(d),
    (snap) => callback(snap.docs.map((s) => parse(s.data() as Record<string, unknown>))),
    (error) => console.error("Firestore subscription error:", error)
  );
}

export function subscribeRecords(callback: (records: RecordItem[]) => void): () => void {
  return subscribe<RecordItem>(
    (d) => query(collection(d, "records"), orderBy("createdAt", "desc")),
    (data) => data as unknown as RecordItem,
    callback
  );
}

export function subscribeQuestions(callback: (questions: Question[]) => void): () => void {
  return subscribe<Question>(
    (d) => query(collection(d, "questions")),
    (data) => data as unknown as Question,
    callback
  );
}

export function firestoreSetRecord(record: RecordItem) {
  const d = getDb();
  if (!d) return;
  setDoc(doc(d, "records", record.id), record).catch(() => {});
}

export function firestoreUpdateRecord(id: string, patch: Partial<RecordItem>) {
  const d = getDb();
  if (!d) return;
  updateDoc(doc(d, "records", id), patch).catch(() => {});
}

export function firestoreDeleteRecord(id: string) {
  const d = getDb();
  if (!d) return;
  deleteDoc(doc(d, "records", id)).catch(() => {});
}

export function firestoreReplaceQuestions(items: Question[]) {
  const d = getDb();
  if (!d) return;
  void (async () => {
    try {
      const idSet = new Set(items.map((q) => q.id));
      const batch = writeBatch(d);
      items.forEach((q) => batch.set(doc(d, "questions", q.id), q));
      const existing = await getDocs(collection(d, "questions"));
      existing.forEach((s) => {
        if (!idSet.has(s.id)) batch.delete(doc(d, "questions", s.id));
      });
      await batch.commit();
    } catch {}
  })();
}