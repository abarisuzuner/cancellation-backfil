import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain' };
http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Also serve the exact repository subpath to verify GitHub Pages URLs locally.
    pathname = pathname.replace(/^\/cancellation-backfil(?=\/|$)/, '') || '/';
    let target = path.resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid path');
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    res.writeHead(200, { 'Content-Type': `${types[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Backfill: http://127.0.0.1:${port}/cancellation-backfil/`));
