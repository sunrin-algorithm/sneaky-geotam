import os

storage_path = 'lib/storage.ts'
with open(storage_path, 'r', encoding='utf-8') as f:
    content = f.read()

# AuditLog properties fix: add operationId and targetType
content = content.replace(
    'action: "participant.rename" as any,',
    'action: "participant.rename" as any,\n      operationId: crypto.randomUUID(),\n      targetType: "inspection",'
)
content = content.replace(
    'action: "participant.rename",',
    'action: "participant.rename" as any,\n      operationId: crypto.randomUUID(),\n      targetType: "inspection",'
)

with open(storage_path, 'w', encoding='utf-8') as f:
    f.write(content)
