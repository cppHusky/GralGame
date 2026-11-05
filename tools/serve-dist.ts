import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Serves the production `dist/` with the same response headers Cloudflare
 * Workers Static Assets applies from `public/_headers`. E2E uses this to catch
 * CSP regressions that a plain dev server cannot reproduce.
 */
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.join(project, 'dist');
const port = Number(process.env.PORT ?? 4180);

try {
  await access(path.join(root, 'index.html'));
} catch {
  console.error(`找不到 ${root}/index.html，请先运行 pnpm build。`);
  process.exit(1);
}

type HeaderRule = { pattern: RegExp; headers: Record<string, string> };

const rules: HeaderRule[] = [];
for (const block of (
  await readFile(path.join(project, 'public/_headers'), 'utf8')
)
  .split(/\n\s*\n/)
  .map((entry) => entry.trim())
  .filter(Boolean)) {
  const [patternLine, ...headerLines] = block.split('\n');
  if (!patternLine) continue;
  const pattern = new RegExp(
    `^${patternLine
      .trim()
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  rules.push({ pattern, headers });
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.yaml': 'text/yaml; charset=utf-8',
  '.ico': 'image/x-icon',
};

function headersFor(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of rules)
    if (rule.pattern.test(pathname)) Object.assign(headers, rule.headers);
  return headers;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const requested = path.join(root, pathname);
  const insideRoot = requested.startsWith(`${root}${path.sep}`);
  let file = insideRoot ? requested : path.join(root, 'index.html');
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    // Workers Static Assets `not_found_handling: single-page-application`.
    file = path.join(root, 'index.html');
  }
  const headers = headersFor(pathname);
  response.writeHead(200, {
    ...headers,
    'Content-Type':
      contentTypes[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`dist 预览（含 _headers CSP）：http://127.0.0.1:${port}`);
});
