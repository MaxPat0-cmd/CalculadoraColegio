// Servidor estático mínimo (sin dependencias) para abrir la app en http://localhost:8080
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root) || /(^|[/\\])(\.git|node_modules|tests|scripts)([/\\]|$)/.test(rel)) { res.writeHead(403).end('Prohibido'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(port, () => console.log(`Calculadora Académica Alzate (demo) en http://localhost:${port}`));
