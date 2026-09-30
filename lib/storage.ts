import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getApp, getDb, getFirebaseFunctions } from "./firebase";
import {
  AuditLog,
  CommonQuestion,
  InspectionSession,
  Question,
  RecordItem,
  Reservation,
  AggregatedParticipant,
} from "./types";

// ====================================================
// 저장소 추상화 인터페이스
// ====================================================
export interface Repository<T> {
  getAll(): Promise<T[]>;
  getById(id: string | number): Promise<T | null>;
  create(item: T): Promise<void>;
  update(id: string | number, patch: Partial<T>): Promise<void>;
  delete(id: string | number): Promise<void>;
  subscribe(callback: (items: T[]) => void): () => void;
}

export interface InspectionRepository extends Repository<InspectionSession> {
  update(
    id: string | number,
    patch: Partial<InspectionSession>,
    reason?: string,
    actorId?: string
  ): Promise<void>;
  retract(id: string, reason?: string, actorId?: string): Promise<void>;
  restore(id: string, reason?: string, actorId?: string): Promise<void>;
  undoOperation(operationId: string, reason?: string, actorId?: string): Promise<string[]>;
  getAuditLogs(): Promise<AuditLog[]>;
  subscribeAuditLogs(callback: (logs: AuditLog[]) => void): () => void;
  recalculateAll(): Promise<void>;
  renameParticipant(participantId: string, oldName: string, newName: string, actorId?: string): Promise<void>;
}

export function clearAllLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("admin_auth_session");
  } catch (e) {
    console.error("Failed to clear localStorage:", e);
  }
}

export const CURRENT_STORAGE_RESET_VERSION = "reset_20261001_firebase_migration";

export function checkAndAutoResetLocalStorage(): void {}

// ====================================================
// Firebase Firestore 기반 저장소 구현
// ====================================================
function ensureDb(): Firestore {
  const db = getDb();
  if (!db) throw new Error("Firestore not initialized");
  return db;
}

function ensureFunctions() {
  const f = getFirebaseFunctions();
  if (!f) throw new Error("Firebase Functions not initialized");
  return f;
}

export class FirebaseInspectionRepository implements InspectionRepository {
  async getAll(): Promise<InspectionSession[]> {
    const d = ensureDb();
    const q = query(collection(d, "inspections"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((s) => s.data() as InspectionSession);
  }

  async getById(id: string | number): Promise<InspectionSession | null> {
    const d = ensureDb();
    const snap = await getDoc(doc(d, "inspections", String(id)));
    return snap.exists() ? (snap.data() as InspectionSession) : null;
  }

  async create(item: InspectionSession): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "createInspection");
    await call(item);
  }

  async update(id: string | number, patch: Partial<InspectionSession>, reason?: string, actorId?: string): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "updateInspection");
    await call({ id: String(id), patch, reason, actorId });
  }

  async retract(id: string, reason?: string, actorId?: string): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "retractInspection");
    await call({ id, reason, actorId });
  }

  async restore(id: string, reason?: string, actorId?: string): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "restoreInspection");
    await call({ id, reason, actorId });
  }

  async undoOperation(operationId: string, reason?: string, actorId?: string): Promise<string[]> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "undoOperation");
    const result = await call({ operationId, reason, actorId });
    return (result.data as any).ids || [];
  }

  async delete(id: string | number): Promise<void> {
    await this.retract(String(id), "삭제 요청에 따른 취소(retract)");
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const d = ensureDb();
    const q = query(collection(d, "auditLogs"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((s) => s.data() as AuditLog);
  }

  subscribeAuditLogs(callback: (logs: AuditLog[]) => void): () => void {
    const d = ensureDb();
    const q = query(collection(d, "auditLogs"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((s) => s.data() as AuditLog));
    }, (error) => console.error("AuditLog sub error", error));
  }

  subscribe(callback: (items: InspectionSession[]) => void): () => void {
    const d = ensureDb();
    const q = query(collection(d, "inspections"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((s) => s.data() as InspectionSession));
    }, (error) => console.error("Inspection sub error", error));
  }
  
  async recalculateAll(): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "recalculateAll");
    await call({});
  }

  async renameParticipant(participantId: string, oldName: string, newName: string, actorId?: string): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "renameParticipant");
    await call({ participantId, oldName, newName, actorId });
  }
}

export class FirebaseQuestionRepository implements Repository<CommonQuestion> {
  async getAll(): Promise<CommonQuestion[]> {
    const d = ensureDb();
    const snap = await getDocs(collection(d, "commonQuestions"));
    return snap.docs.map(s => s.data() as CommonQuestion).sort((a,b) => a.order - b.order);
  }
  async getById(id: string | number): Promise<CommonQuestion | null> {
    const d = ensureDb();
    const snap = await getDoc(doc(d, "commonQuestions", String(id)));
    return snap.exists() ? (snap.data() as CommonQuestion) : null;
  }
  async create(item: CommonQuestion): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "createCommonQuestion");
    await call(item);
  }
  async update(id: string | number, patch: Partial<CommonQuestion>): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "updateCommonQuestion");
    await call({ id: String(id), patch });
  }
  async delete(id: string | number): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "deleteCommonQuestion");
    await call({ id: String(id) });
  }
  subscribe(callback: (items: CommonQuestion[]) => void): () => void {
    const d = ensureDb();
    return onSnapshot(collection(d, "commonQuestions"), (snap) => {
      callback(snap.docs.map(s => s.data() as CommonQuestion).sort((a,b) => a.order - b.order));
    }, (e) => console.error(e));
  }
  async setAll(items: CommonQuestion[]): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "setAllCommonQuestions");
    await call({ items });
  }
}

export class FirebaseReservationRepository implements Repository<Reservation> {
  async getAll(): Promise<Reservation[]> {
    const d = ensureDb();
    const snap = await getDocs(collection(d, "reservations"));
    return snap.docs.map(s => s.data() as Reservation).sort((a,b) => a.id - b.id);
  }
  async getById(id: string | number): Promise<Reservation | null> {
    const d = ensureDb();
    const snap = await getDoc(doc(d, "reservations", String(id)));
    return snap.exists() ? (snap.data() as Reservation) : null;
  }
  async create(item: Reservation): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "createReservation");
    await call(item);
  }
  async update(id: string | number, patch: Partial<Reservation>): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "updateReservation");
    await call({ id: String(id), patch });
  }
  async delete(id: string | number): Promise<void> {
    const f = ensureFunctions();
    const call = httpsCallable(f, "deleteReservation");
    await call({ id: String(id) });
  }
  subscribe(callback: (items: Reservation[]) => void): () => void {
    const d = ensureDb();
    return onSnapshot(collection(d, "reservations"), (snap) => {
      callback(snap.docs.map(s => s.data() as Reservation).sort((a,b) => a.id - b.id));
    }, (e) => console.error(e));
  }
  async getNextId(): Promise<number> {
    // Should be handled by backend, stubbed here for compatibility
    return 0; 
  }
}

// ----------------------------------------------------
// Exported Repositories
// ----------------------------------------------------
export function getStorageMode(): "local" | "firebase" {
  return "firebase"; // ALWAYS FIREBASE NOW
}

export const inspectionRepo = new FirebaseInspectionRepository();
export const questionRepo = new FirebaseQuestionRepository();
export const reservationRepo = new FirebaseReservationRepository();

// ====================================================
// 임시 기록 관리 (Draft Helpers)
// ====================================================
export function saveDraft<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`draft-${key}`, JSON.stringify(data));
}

export function getDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`draft-${key}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`draft-${key}`);
}

// ====================================================
// 기존 구형 호환 헬퍼 (NO-OP or minimal)
// ====================================================
export const defaultQuestions: Question[] = [];
export function getQuestions(): Question[] { return []; }
export function saveQuestions(items: Question[]) {}
export function replaceQuestions(items: Question[]) {}
export function getRecords(): RecordItem[] { return []; }
export function replaceRecords(items: RecordItem[]) {}
export function saveRecord(item: RecordItem) {}
export function updateRecord(id: string, patch: Partial<RecordItem>) {}
export function deleteRecord(id: string) {}

export async function recordAuditLog(entry: any): Promise<any> {
  const f = ensureFunctions();
  const call = httpsCallable(f, "recordAuditLog");
  return (await call(entry)).data;
}

export function subscribeParticipantResults(callback: (results: AggregatedParticipant[]) => void): () => void {
    const d = ensureDb();
    return onSnapshot(collection(d, "participantResults"), (snap) => {
      callback(snap.docs.map(s => s.data() as AggregatedParticipant));
    }, (e) => console.error(e));
}
