import * as fs from 'fs';
let content = fs.readFileSync('lib/storage.ts', 'utf8');

// interface
content = content.replace(
  'recalculateAll(): Promise<void>;',
  'renameParticipant(participantId: string, oldName: string, newName: string, actorId?: string): Promise<void>;\n    recalculateAll(): Promise<void>;'
);

const localImpl = `
  async renameParticipant(participantId: string, oldName: string, newName: string, actorId: string = "admin"): Promise<void> {
    const sessions = await this.getAll();
    const activeLogs = sessions.filter((s) => s.participantId === participantId && s.status !== "retracted");
    if (activeLogs.length > 0) {
      const latestLog = activeLogs.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt).getTime();
        return timeA - timeB;
      }).pop();
      if (latestLog) {
        await this.update(latestLog.id, { participantName: newName }, "renameParticipant", actorId);
      }
    }
    await this.appendAuditLog({
      action: "participant.rename",
      targetId: participantId,
      beforeVersion: 1,
      afterVersion: 2,
      changes: { before: oldName, after: newName },
      actorId,
      timestamp: new Date().toISOString(),
    });
  }

  async recalculateAll(): Promise<void> {`;

const fbImpl = `
  async renameParticipant(participantId: string, oldName: string, newName: string, actorId: string = "admin_firebase"): Promise<void> {
    const sessions = await this.getAll();
    const activeLogs = sessions.filter((s) => s.participantId === participantId && s.status !== "retracted");
    if (activeLogs.length > 0) {
      const latestLog = activeLogs.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt).getTime();
        return timeA - timeB;
      }).pop();
      if (latestLog) {
        await this.update(latestLog.id, { participantName: newName }, "renameParticipant", actorId);
      }
    }
    const { collection, addDoc, getFirestore } = await import("firebase/firestore");
    const d = getFirestore();
    const audit = {
      id: crypto.randomUUID(),
      action: "participant.rename",
      targetId: participantId,
      beforeVersion: 1,
      afterVersion: 2,
      changes: { before: oldName, after: newName },
      actorId,
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(d, "audit_logs"), audit as any);
  }

  async recalculateAll(): Promise<void> {`;

let parts = content.split('  async recalculateAll(): Promise<void> {');
if (parts.length === 3) {
  content = parts[0] + localImpl + parts[1] + fbImpl + parts[2];
}

content = content.replace('export const CURRENT_STORAGE_RESET_VERSION = "reset_20261001_033500";', 'export const CURRENT_STORAGE_RESET_VERSION = "reset_20261001_040000";');

fs.writeFileSync('lib/storage.ts', content, 'utf8');
