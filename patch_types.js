import * as fs from 'fs';
let content = fs.readFileSync('lib/types.ts', 'utf8');
content = content.replace('"question.replace"', '"question.replace" | "participant.rename"');
fs.writeFileSync('lib/types.ts', content, 'utf8');

let storage = fs.readFileSync('lib/storage.ts', 'utf8');
storage = storage.replace('async update(id: string, patch: Partial<InspectionSession>, reason?: string): Promise<void>', 'async update(id: string, patch: Partial<InspectionSession>, reason?: string, actorId?: string): Promise<void>');
fs.writeFileSync('lib/storage.ts', storage, 'utf8');
