import * as fs from 'fs';
let content = fs.readFileSync('lib/aggregation.ts', 'utf8');

// Replace the two lines getting name from latestLog
content = content.replace(
  '  const latestLog = chronologicallyOrderedLogs[chronologicallyOrderedLogs.length - 1];\n  const participantName = latestLog.participantName.trim();',
  `  const latestLog = chronologicallyOrderedLogs[chronologicallyOrderedLogs.length - 1];
  const nameSourceLog = [...activeLogs].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt).getTime();
    return timeA - timeB;
  }).pop();
  const participantName = (nameSourceLog || latestLog).participantName.trim();`
);

fs.writeFileSync('lib/aggregation.ts', content, 'utf8');
