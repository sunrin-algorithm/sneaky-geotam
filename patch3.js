import * as fs from 'fs';
let content = fs.readFileSync('app/log/page.tsx', 'utf8');

content = content.replace(
  '  async function saveEditedSession() {\n    if (!editingSession) return;\n    try {\n      await inspectionRepo.update(',
  `  async function saveEditedSession() {
    if (!editingSession) return;
    try {
      const originalLog = inspections.find(l => l.id === editingSession.id);
      if (originalLog && originalLog.participantName.trim() !== editingSession.participantName.trim()) {
        await inspectionRepo.renameParticipant(originalLog.participantId || \`name_\${originalLog.participantName.trim()}\`, originalLog.participantName.trim(), editingSession.participantName.trim());
      }
      await inspectionRepo.update(`
);

fs.writeFileSync('app/log/page.tsx', content, 'utf8');
