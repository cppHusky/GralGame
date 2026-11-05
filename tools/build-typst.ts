import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.join(project, '.build/typst-root');
const expected = (
  await readFile(path.join(project, '.typst-version'), 'utf8')
).trim();
const version = spawnSync(process.env.TYPST_BIN ?? 'typst', ['--version'], {
  encoding: 'utf8',
});
if (version.status !== 0)
  throw new Error(
    `无法执行 Typst：${version.stderr || version.error?.message}`,
  );
const actual = version.stdout.trim().match(/^typst\s+(\S+)/)?.[1];
if (actual !== expected) {
  throw new Error(
    `Typst 版本不匹配：需要 ${expected}，当前 ${actual ?? version.stdout.trim()}。请安装官方 Typst ${expected}。`,
  );
}

await mkdir(root, { recursive: true });
async function linkOnce(target: string, name: string) {
  try {
    await access(path.join(root, name));
  } catch {
    await symlink(target, path.join(root, name), 'dir');
  }
}
await linkOnce(path.relative(root, path.join(project, 'book')), 'book');
await linkOnce(path.join('book', 'lecture'), 'lecture');
await cp(path.join(project, 'book/math.typ'), path.join(root, 'math.typ'));
await cp(path.join(project, 'typst/utils.typ'), path.join(root, 'utils.typ'));
await cp(
  path.join(project, 'typst/entry-stage1.typ'),
  path.join(root, 'entry-stage1.typ'),
);

const output = path.join(project, '.build/stage1.html');
const fontPaths = [
  process.env.TYPST_FONT_PATH,
  path.join(project, '.build/fonts'),
  path.join(project, 'book/fonts'),
]
  .filter(Boolean)
  .join(path.delimiter);
const result = spawnSync(
  process.env.TYPST_BIN ?? 'typst',
  [
    'compile',
    'entry-stage1.typ',
    '../stage1.html',
    '--root',
    '.',
    '--format',
    'html',
    '--features',
    'html',
    '--ignore-system-fonts',
    '--font-path',
    fontPaths,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const commit = spawnSync(
  'git',
  ['-C', path.join(project, 'book'), 'rev-parse', 'HEAD'],
  { encoding: 'utf8' },
);
await mkdir(path.join(project, '.build'), { recursive: true });
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile(
    path.join(project, '.build/source.json'),
    JSON.stringify(
      { bookCommit: commit.stdout.trim(), typstVersion: expected, output },
      null,
      2,
    ),
  ),
);
console.log(`Typst 导出完成：${output}`);
