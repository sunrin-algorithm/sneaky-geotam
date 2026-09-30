import os
import re

storage_path = 'lib/storage.ts'
with open(storage_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('  async recalculateAll(): Promise<void> {')
if len(parts) == 3:
    local_impl = """  async renameParticipant(participantId: string, oldName: string, newName: string, actorId: string = "admin"): Promise<void> {
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
      id: crypto.randomUUID(),
      action: "participant.rename" as any,
      operationId: crypto.randomUUID(),
      targetType: "inspection",
      targetId: participantId,
      beforeVersion: 1,
      afterVersion: 2,
      changes: { before: oldName, after: newName },
      actorId,
      timestamp: new Date().toISOString(),
    });
  }

  async recalculateAll(): Promise<void> {"""

    fb_impl = """  async renameParticipant(participantId: string, oldName: string, newName: string, actorId: string = "admin_firebase"): Promise<void> {
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
      action: "participant.rename" as any,
      operationId: crypto.randomUUID(),
      targetType: "inspection",
      targetId: participantId,
      beforeVersion: 1,
      afterVersion: 2,
      changes: { before: oldName, after: newName },
      actorId,
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(d, "audit_logs"), audit as any);
  }

  async recalculateAll(): Promise<void> {"""

    content = parts[0] + local_impl + parts[1] + fb_impl + parts[2]

with open(storage_path, 'w', encoding='utf-8') as f:
    f.write(content)
