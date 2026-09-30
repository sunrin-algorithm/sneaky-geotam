import os

storage_path = 'lib/storage.ts'
with open(storage_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'await this.update(latestLog.id, { participantName: newName }, "renameParticipant", actorId);',
    'await this.update(latestLog.id, { participantName: newName }, "renameParticipant");'
)

with open(storage_path, 'w', encoding='utf-8') as f:
    f.write(content)
