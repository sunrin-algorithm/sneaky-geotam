const fs = require('fs');

const files = [
  'app/admin/page.tsx',
  'app/log/page.tsx',
  'app/reserve/page.tsx',
  'app/reserve/admin/page.tsx',
  'app/result/[id]/page.tsx'
];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('bg-black') || line.includes('bg-neutral-900') || line.includes('bg-neutral-800')) {
      console.log('=== ' + file + ':' + (i+1) + ' ===');
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 8); j++) {
        console.log((j+1) + ': ' + lines[j]);
      }
    }
  });
});
