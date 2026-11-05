import { spawnSync } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Inline, scriptSchema } from '../schema/ir.js';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const font = path.join(project, '.build/fonts/ZhuqueFangsong-Regular.ttf');
const scriptFile = path.join(project, 'generated/script/stage1.ir.json');
const outDir = path.join(project, 'generated/fonts');
const outFile = path.join(outDir, 'ZhuqueFangsong-subset.woff2');
const textFile = path.join(project, '.build/fonts/used-characters.txt');
const localTool = path.join(
  project,
  '.build/font-tools',
  process.platform === 'win32' ? 'Scripts/pyftsubset.exe' : 'bin/pyftsubset',
);

const script = scriptSchema.parse(
  JSON.parse(await readFile(scriptFile, 'utf8')),
);
const characters = new Set<string>([
  ...Array.from({ length: 95 }, (_, index) =>
    String.fromCodePoint(index + 0x20),
  ),
  ...'，。！？、：；（）《》…“”‘’【】「」『』—·￥℃āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü',
]);
function collectInline(items: Inline[]) {
  for (const item of items) {
    if (item.t === 'text')
      for (const character of item.text) characters.add(character);
    else if (item.t === 'ruby') {
      for (const character of item.base + item.rt) characters.add(character);
    } else if (item.t === 'strong') collectInline(item.children);
  }
}
for (const lesson of script.lessons)
  for (const unit of lesson.units)
    for (const beat of unit.beats) {
      if (beat.kind === 'turn')
        for (const character of beat.speaker) characters.add(character);
      for (const block of beat.blocks) {
        if (block.kind === 'p') collectInline(block.inline);
        else if (block.kind === 'list')
          for (const row of block.items) collectInline(row);
      }
    }
async function collectUiText(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectUiText(filePath);
    else if (/\.(tsx?|css)$/.test(entry.name)) {
      const source = await readFile(filePath, 'utf8');
      for (const match of source.matchAll(
        /[\p{Script=Han}，。！？、：；（）《》…“”‘’【】「」『』—·￥℃]/gu,
      ))
        characters.add(match[0]);
    }
  }
}
await collectUiText(path.join(project, 'src'));
const charset = [...characters].join('');
await writeFile(textFile, charset);
await mkdir(outDir, { recursive: true });
const subset = spawnSync(
  process.env.PYFTSUBSET_BIN ??
    ((await hasLocalTool()) ? localTool : 'pyftsubset'),
  [
    font,
    `--text-file=${textFile}`,
    `--output-file=${outFile}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--name-IDs=*',
    '--name-languages=*',
    '--notdef-glyph',
    '--notdef-outline',
    '--recommended-glyphs',
  ],
  { stdio: 'inherit' },
);
if (subset.status !== 0)
  throw new Error(
    'pyftsubset 失败。请安装支持 WOFF2/Brotli 的 FontTools，或设置 PYFTSUBSET_BIN。',
  );
console.log(
  `字体子集完成：${characters.size} 个码点 → ${path.relative(project, outFile)}`,
);

async function hasLocalTool() {
  try {
    await access(localTool);
    return true;
  } catch {
    return false;
  }
}
