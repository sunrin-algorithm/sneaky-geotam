import os

storage_path = 'lib/storage.ts'
with open(storage_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update InspectionRepository interface
interface_target = "recalculateAll(): Promise<void>;"
interface_replacement = "recalculateAll(): Promise<void>;\n    renameParticipant(participantId: string, oldName: string, newName: string, actorId?: string): Promise<void>;"
content = content.replace(interface_target, interface_replacement, 1)

# 2. Update update() signatures
# Only replace update() inside InspectionRepository, LocalInspectionRepository, FirebaseInspectionRepository
# The safest way is to replace specifically:
content = content.replace(
    'update(\n    id: string | number,\n    patch: Partial<InspectionSession>,\n    reason?: string\n  ): Promise<void>;',
    'update(\n    id: string | number,\n    patch: Partial<InspectionSession>,\n    reason?: string,\n    actorId?: string\n  ): Promise<void>;'
)

content = content.replace(
    'async update(\n    id: string | number,\n    patch: Partial<InspectionSession>,\n    reason?: string\n  ): Promise<void> {',
    'async update(\n    id: string | number,\n    patch: Partial<InspectionSession>,\n    reason?: string,\n    actorId?: string\n  ): Promise<void> {'
)

# 3. Add renameParticipant to LocalInspectionRepository
local_target = "  async recalculateAll(): Promise<void> {"
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
      targetId: participantId,
      beforeVersion: 1,
      afterVersion: 2,
      changes: { before: oldName, after: newName },
      actorId,
      timestamp: new Date().toISOString(),
    });
  }

  async recalculateAll(): Promise<void> {"""
# Only replace the first occurrence
content = content.replace(local_target, local_impl, 1)

# 4. Add renameParticipant to FirebaseInspectionRepository
# The next occurrence of `async recalculateAll(): Promise<void> {`
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

  async recalculateAll(): Promise<void> {"""
content = content.replace(local_target, fb_impl, 1) # next occurrence

with open(storage_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched storage.ts safely")
