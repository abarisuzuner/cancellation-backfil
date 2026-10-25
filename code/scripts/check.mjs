import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await access(new URL(asset, root));
for (const name of ['app.js', 'engine.js', 'store.js', 'parser.js']) {
  const result = spawnSync(process.execPath, ['--check', new URL('code/' + name, root).pathname], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Ready to publish: root index.html, relative assets, and JavaScript syntax verified. No bundling required.');
