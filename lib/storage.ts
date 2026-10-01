import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  setDoc,
  updateDoc,
  deleteDoc,
  type Firestore,
} from "firebase/firestore";
import { getApp, getDb } from "./firebase";
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
    const d = ensureDb();
    const batch = writeBatch(d);
    
    const logRef = doc(collection(d, "inspectionLogs"));
    const newItem = { ...item, id: logRef.id };
    batch.set(logRef, newItem);
    
    const auditRef = doc(collection(d, "auditLogs"));
    const auditLog: AuditLog = {
      id: auditRef.id,
      operationId: item.operationId,
      targetType: "inspection",
      targetId: logRef.id,
      action: "create",
      beforeVersion: null,
      afterVersion: item.version,
      changes: newItem as any,
      actorId: null,
      timestamp: new Date().toISOString(),
      reason: "신규 검사 생성"
    };
    batch.set(auditRef, auditLog);
    
    await batch.commit();
  }

  async update(id: string | number, patch: Partial<InspectionSession>, reason?: string, actorId?: string): Promise<void> {
    const d = ensureDb();
    const batch = writeBatch(d);
    
    const logRef = doc(d, "inspectionLogs", String(id));
    batch.update(logRef, patch);
    
    const auditRef = doc(collection(d, "auditLogs"));
    const auditLog: AuditLog = {
      id: auditRef.id,
      operationId: crypto.randomUUID(),
      targetType: "inspection",
      targetId: String(id),
      action: "update",
      beforeVersion: null,
      afterVersion: 1, 
      changes: patch as any,
      actorId: actorId || null,
      timestamp: new Date().toISOString(),
      reason: reason || "수정"
    };
    batch.set(auditRef, auditLog);
    
    await batch.commit();
  }

  async retract(id: string, reason?: string, actorId?: string): Promise<void> {
    return this.update(id, { status: "retracted" }, reason || "취소(retract)", actorId);
  }

  async restore(id: string, reason?: string, actorId?: string): Promise<void> {
    return this.update(id, { status: "active" }, reason || "복구(restore)", actorId);
  }

  async undoOperation(operationId: string, reason?: string, actorId?: string): Promise<string[]> {
    console.warn("Client SDK undoOperation relies on specific inverse actions.");
    return [];
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
    const q = query(collection(d, "inspectionLogs"), orderBy("createdAt", "desc")); 
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((s) => s.data() as InspectionSession));
    }, (error) => console.error("Inspection sub error", error));
  }
  
  async recalculateAll(): Promise<void> {}

  async renameParticipant(participantId: string, oldName: string, newName: string, actorId?: string): Promise<void> {
    const d = ensureDb();
    const pRef = doc(d, "participants", participantId);
    await setDoc(pRef, { displayName: newName, updatedAt: new Date().toISOString() }, { merge: true });
    
    const auditRef = doc(collection(d, "auditLogs"));
    await setDoc(auditRef, {
      id: auditRef.id,
      operationId: crypto.randomUUID(),
      targetType: "participant",
      targetId: participantId,
      action: "update",
      beforeVersion: null,
      afterVersion: 1,
      changes: { displayName: newName, oldName },
      actorId: actorId || null,
      timestamp: new Date().toISOString(),
      reason: "이름 변경"
    });
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
    const d = ensureDb();
    const ref = doc(collection(d, "commonQuestions"));
    await setDoc(ref, { ...item, id: ref.id });
  }
  async update(id: string | number, patch: Partial<CommonQuestion>): Promise<void> {
    const d = ensureDb();
    await updateDoc(doc(d, "commonQuestions", String(id)), patch);
  }
  async delete(id: string | number): Promise<void> {
    const d = ensureDb();
    await deleteDoc(doc(d, "commonQuestions", String(id)));
  }
  subscribe(callback: (items: CommonQuestion[]) => void): () => void {
    const d = ensureDb();
    return onSnapshot(collection(d, "commonQuestions"), (snap) => {
      callback(snap.docs.map(s => s.data() as CommonQuestion).sort((a,b) => a.order - b.order));
    }, (e) => console.error(e));
  }
  async setAll(items: CommonQuestion[]): Promise<void> {
    const d = ensureDb();
    const batch = writeBatch(d);
    items.forEach((item) => {
      batch.set(doc(d, "commonQuestions", item.id), item);
    });
    await batch.commit();
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
    const d = ensureDb();
    const counterRef = doc(d, "system", "reservationCounter");
    const resRef = doc(collection(d, "reservations"));
    
    await runTransaction(d, async (t) => {
      const cDoc = await t.get(counterRef);
      let count = 1;
      if (cDoc.exists()) {
        count = (cDoc.data().count || 0) + 1;
      }
      
      t.set(counterRef, { count });
      const newItem = { ...item, id: count, queueSequence: count }; 
      t.set(resRef, newItem);
    });
  }
  async update(id: string | number, patch: Partial<Reservation>): Promise<void> {
    const d = ensureDb();
    const q = query(collection(d, "reservations"));
    const snap = await getDocs(q);
    const target = snap.docs.find(s => s.data().id === Number(id));
    if (target) {
      await updateDoc(target.ref, patch);
    }
  }
  async delete(id: string | number): Promise<void> {
    const d = ensureDb();
    const q = query(collection(d, "reservations"));
    const snap = await getDocs(q);
    const target = snap.docs.find(s => s.data().id === Number(id));
    if (target) {
      await deleteDoc(target.ref);
    }
  }
  subscribe(callback: (items: Reservation[]) => void): () => void {
    const d = ensureDb();
    return onSnapshot(collection(d, "reservations"), (snap) => {
      callback(snap.docs.map(s => s.data() as Reservation).sort((a,b) => a.id - b.id));
    }, (e) => console.error(e));
  }
  async getNextId(): Promise<number> {
    const d = ensureDb();
    const cDoc = await getDoc(doc(d, "system", "reservationCounter"));
    return cDoc.exists() ? (cDoc.data().count || 0) + 1 : 1;
  }
}

export function getStorageMode(): "local" | "firebase" {
  return "firebase";
}

export const inspectionRepo = new FirebaseInspectionRepository();
export const questionRepo = new FirebaseQuestionRepository();
export const reservationRepo = new FirebaseReservationRepository();

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
  const d = ensureDb();
  const ref = doc(collection(d, "auditLogs"));
  await setDoc(ref, { ...entry, id: ref.id, timestamp: new Date().toISOString() });
  return { success: true };
}

export function subscribeParticipantResults(callback: (results: AggregatedParticipant[]) => void): () => void {
  return () => {};
}
