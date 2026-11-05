import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.join(project, 'dist');
const maxFileBytes = 25 * 1024 * 1024;
const warningFileBytes = 20 * 1024 * 1024;
const warningCount = 10_000;
const maxCount = 20_000;
const files: { path: string; bytes: number }[] = [];

async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile())
      files.push({ path: file, bytes: (await stat(file)).size });
  }
}

try {
  await walk(root);
} catch {
  throw new Error(`找不到生产构建目录：${root}。请先运行 pnpm build。`);
}

const oversized = files.filter((file) => file.bytes > maxFileBytes);
if (oversized.length)
  throw new Error(
    `超出 Cloudflare 单文件 25 MiB 限制：\n${oversized.map((file) => `${path.relative(project, file.path)} (${(file.bytes / 1024 / 1024).toFixed(2)} MiB)`).join('\n')}`,
  );

for (const file of files.filter((item) => item.bytes > warningFileBytes))
  console.warn(
    `接近 Cloudflare 单文件限制：${path.relative(project, file.path)} (${(file.bytes / 1024 / 1024).toFixed(2)} MiB；建议低于 20 MiB)。`,
  );
if (files.length > maxCount)
  throw new Error(
    `静态文件共 ${files.length} 个，超过 Cloudflare 免费计划 20,000 个上限。`,
  );
if (files.length > warningCount)
  console.warn(`静态文件共 ${files.length} 个，已超过 10,000 个预警阈值。`);
console.log(
  `Cloudflare Static Assets 预算通过：${files.length} 个文件，${(files.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024).toFixed(2)} MiB 总量。`,
);
