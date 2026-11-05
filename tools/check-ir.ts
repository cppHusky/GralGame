import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Inline, scriptSchema } from '../schema/ir.js';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const file = path.join(project, 'generated/script/stage1.ir.json');
try {
  await access(file);
} catch {
  console.warn(
    '跳过 IR 完整性校验：generated/ 尚未生成；请使用 Typst 0.15.0 执行 pnpm build:script。',
  );
  process.exit(0);
}
const script = scriptSchema.parse(JSON.parse(await readFile(file, 'utf8')));
const math = JSON.parse(
  await readFile(path.join(project, 'generated/math/stage1.json'), 'utf8'),
) as Record<
  string,
  { svg: string; wEm: number; hEm: number; vAlignEm: number }
>;
const glyphSource = await readFile(
  path.join(project, 'generated/math/glyphs.svg'),
  'utf8',
);
const glyphIds = new Set(
  [...glyphSource.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(
    (match) => match[1],
  ),
);
let refs = 0;
let beats = 0;
let turns = 0;
let narration = 0;
let inlineMath = 0;
let equations = 0;
let figures = 0;
let ruby = 0;
const speakers = new Set<string>();
let afterLessonUnits = 0;

function countInline(items: Inline[]) {
  for (const item of items) {
    if (item.t === 'math') inlineMath += 1;
    if (item.t === 'ruby') ruby += 1;
    if (item.t === 'strong') countInline(item.children);
  }
}

for (const lesson of script.lessons)
  for (const unit of lesson.units) {
    if (unit.kind === 'after-lesson') afterLessonUnits += 1;
    for (const beat of unit.beats) {
      beats += 1;
      if (beat.kind === 'turn') {
        turns += 1;
        speakers.add(beat.speaker);
      } else narration += 1;
      for (const block of beat.blocks) {
        if (block.kind === 'eq' || block.kind === 'fig') {
          refs += 1;
          if (block.kind === 'eq') equations += 1;
          else figures += 1;
          if (!(block.math in math))
            throw new Error(`${beat.id}: 找不到公式引用 ${block.math}`);
        }
        if (block.kind === 'p' || block.kind === 'list') {
          const rows = block.kind === 'p' ? [block.inline] : block.items;
          for (const row of rows) {
            countInline(row);
            for (const inline of row)
              if (inline.t === 'math') {
                refs += 1;
                const item = math[inline.math];
                if (!item)
                  throw new Error(`${beat.id}: 找不到公式引用 ${inline.math}`);
                if (
                  !Number.isFinite(item.wEm) ||
                  item.wEm <= 0 ||
                  item.wEm > 100
                )
                  throw new Error(
                    `${beat.id}: 行内公式宽度异常 ${item.wEm}em（预期为 CSS em 尺寸，而非 SVG pt 尺寸）`,
                  );
              }
          }
        }
      }
    }
  }
const actual = {
  beats,
  turns,
  narration,
  speakers: speakers.size,
  inlineMath,
  equations,
  figures,
  ruby,
  afterLessonUnits,
};
const baseline = JSON.parse(
  await readFile(
    path.join(project, 'tests/fixtures/stage1.stats.json'),
    'utf8',
  ),
) as typeof actual;
const drift = Object.keys(baseline).filter(
  (key) =>
    actual[key as keyof typeof actual] !==
    baseline[key as keyof typeof baseline],
);
if (drift.length) {
  throw new Error(
    `阶段一基线发生变化（需确认后更新 tests/fixtures/stage1.stats.json）：\n${drift.map((key) => `- ${key}: ${baseline[key as keyof typeof baseline]} → ${actual[key as keyof typeof actual]}`).join('\n')}`,
  );
}
for (const [ref, raw] of Object.entries(math)) {
  const item = raw;
  for (const match of item.svg?.matchAll(/(?:xlink:)?href="#([^"]+)"/g) ?? []) {
    if (!glyphIds.has(match[1]))
      throw new Error(`${ref}: 找不到全局字形定义 #${match[1]}`);
  }
}
console.log(
  `IR 合法：${script.lessons.length} 课、${beats} 句、${refs} 个公式/图引用；统计与阶段一基线一致。`,
);
