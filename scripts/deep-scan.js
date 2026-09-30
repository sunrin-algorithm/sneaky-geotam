const fs = require('fs');

const files = [
  'app/admin/page.tsx',
  'app/log/page.tsx',
  'app/reserve/page.tsx',
  'app/reserve/admin/page.tsx',
  'app/result/[id]/page.tsx',
  'app/page.tsx',
  'app/search/page.tsx',
  'components/RecordCard.tsx',
  'components/AdminNav.tsx',
  'components/Header.tsx',
  'components/AdminAuthGuard.tsx'
];

// Let us find every element that has bg-black, bg-neutral-900, bg-neutral-800, bg-neutral-950,
// or any dark background, OR any element that could appear black
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if line mentions bg- or black or neutral
    if (line.includes('bg-black') || line.includes('bg-neutral-900') || line.includes('bg-neutral-800')) {
      // Print this line and next 5 lines
      console.log('FILE: ' + file + ' LINE: ' + (i + 1));
      console.log(lines.slice(i, i + 6).join('\n'));
      console.log('-----------------------------------');
    }
  }
}
