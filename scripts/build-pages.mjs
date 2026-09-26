import { cp, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// A separate preview app leaves the main app's dynamic result routes intact.
const root = process.cwd();
const preview = path.join(root, '.pages-preview');
await mkdir(path.join(preview, 'app'), { recursive: true });
await mkdir(path.join(preview, 'components'), { recursive: true });
await cp(path.join(root, 'app/reserve'), path.join(preview, 'app/reserve'), { recursive: true });
await cp(path.join(root, 'components/Header.tsx'), path.join(preview, 'components/Header.tsx'));
for (const file of ['layout.tsx', 'globals.css']) {
  await cp(path.join(root, 'app', file), path.join(preview, 'app', file));
}
await cp(path.join(root, 'postcss.config.mjs'), path.join(preview, 'postcss.config.mjs'));
await writeFile(path.join(preview, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
await writeFile(path.join(preview, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], strict: true,
    skipLibCheck: true, noEmit: true, esModuleInterop: true, module: 'esnext',
    moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true,
    jsx: 'react-jsx', paths: { '@/*': ['./*'] },
  },
  include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
  exclude: ['node_modules'],
}));
await writeFile(path.join(preview, 'app/page.tsx'), 'export { default } from "./reserve/page";\n');
const basePath = process.env.PAGES_BASE_PATH ?? '/sneaky-geotam';
await writeFile(path.join(preview, 'next.config.mjs'), `export default ${JSON.stringify({ output: 'export', trailingSlash: true, basePath, images: { unoptimized: true }, turbopack: { root } })};\n`);
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', preview], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile(path.join(preview, 'out/.nojekyll'), '');
