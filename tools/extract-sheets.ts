import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { parse as parseYaml } from 'yaml';

/**
 * Split the owner-supplied, self-describing sprite sheets into one SVG per
 * (character, expression). The sheets declare their own 400×600 grid cells and
 * label each cell; nothing is inferred from pixels. Cell chrome (paper tint,
 * border, label) is dropped so the resulting sprite keeps a transparent
 * background. See docs/decisions/0005-sprite-sheets.md.
 */

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
};

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const inbox = path.join(project, 'assets/_inbox');
const rawDir = path.join(inbox, '_input');
const outputDir = path.join(inbox, 'derived');
const expressions = [
  'neutral',
  'smile',
  'laugh',
  'surprised',
  'angry',
  'sad',
  'thinking',
  'embarrassed',
] as const;
type Expression = (typeof expressions)[number];

const characters = parseYaml(
  await readFile(path.join(project, 'data/characters.yaml'), 'utf8'),
) as { id: string; name: string; main: boolean }[];
const byName = new Map(
  characters.map((character) => [character.name, character]),
);
const byKey = new Map(
  characters.map((character) => [character.id.replaceAll('-', ''), character]),
);

function children(node: HtmlNode): HtmlNode[] {
  return node.childNodes ?? [];
}
function attr(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((entry) => entry.name === name)?.value;
}
function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return children(node).map(textContent).join('');
}
function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
function serialize(node: HtmlNode): string {
  if (node.nodeName === '#text') return escapeText(node.value ?? '');
  if (node.nodeName === '#comment' || node.nodeName === '#documentType')
    return '';
  if (node.nodeName === '#document' || node.nodeName === '#documentFragment')
    return children(node).map(serialize).join('');
  const tag = node.tagName ?? node.nodeName;
  const attrs = (node.attrs ?? [])
    .map(({ name, value }) => ` ${name}="${escapeAttr(value)}"`)
    .join('');
  return `<${tag}${attrs}>${children(node).map(serialize).join('')}</${tag}>`;
}
async function listFiles(dir: string): Promise<string[]> {
  const rows = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const row of rows) {
    const file = path.join(dir, row.name);
    if (row.isDirectory()) files.push(...(await listFiles(file)));
    else if (/\.svg$/i.test(row.name)) files.push(file);
  }
  return files;
}

const sheets = await listFiles(rawDir).catch(() => [] as string[]);
if (!sheets.length) {
  console.log('assets/_inbox/_input/ 中没有 sprite sheet；跳过拆图。');
  process.exit(0);
}

const extracted: { char: string; expr: Expression; file: string }[] = [];
const problems: string[] = [];
for (const sheet of sheets.sort()) {
  const relative = path.relative(inbox, sheet);
  const document = parse(await readFile(sheet, 'utf8')) as unknown as HtmlNode;
  const root = (function find(node: HtmlNode): HtmlNode | undefined {
    if (node.tagName === 'svg') return node;
    for (const child of children(node)) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  })(document);
  if (!root) {
    problems.push(`${relative}: 找不到 <svg> 根元素`);
    continue;
  }
  const viewBox = (attr(root, 'viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (viewBox.join(' ') !== '0 0 1600 1200') {
    problems.push(
      `${relative}: 预期 1600×1200 的 sprite sheet，实际 ${attr(root, 'viewBox')}`,
    );
    continue;
  }
  const clip = children(root)
    .flatMap((child) => children(child))
    .find((node) => node.tagName === 'clipPath' && attr(node, 'id') === 'clip');
  const clipRect = clip
    ? children(clip).find((node) => node.tagName === 'rect')
    : undefined;
  const clipWidth = Number(attr(clipRect ?? root, 'width') ?? 0);
  const clipHeight = Number(attr(clipRect ?? root, 'height') ?? 0);
  if (clipWidth !== 400 || clipHeight !== 540) {
    problems.push(
      `${relative}: 格子裁切框必须是 400×540，实际 ${clipWidth}×${clipHeight}`,
    );
    continue;
  }
  const base = path
    .basename(sheet)
    .replace(/\.svg$/i, '')
    .toLowerCase();
  const key = base.split('_')[0] ?? '';
  const sheetCharacter = byKey.get(key);
  const cells = children(root).filter(
    (node) =>
      node.tagName === 'g' &&
      /^translate\(\s*[\d.-]+\s*,\s*[\d.-]+\s*\)$/.test(
        attr(node, 'transform') ?? '',
      ),
  );
  if (!cells.length) {
    problems.push(`${relative}: 没有找到 translate(...) 网格单元`);
    continue;
  }
  const seen = new Set<Expression>();
  for (const [index, cell] of cells.entries()) {
    const label = textContent(
      children(cell).find((node) => node.tagName === 'text') ?? {
        nodeName: '#text',
        value: '',
      },
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!label) {
      const hasArt = children(cell).some(
        (node) =>
          node.tagName === 'g' && attr(node, 'clip-path') === 'url(#clip)',
      );
      if (hasArt)
        problems.push(`${relative}: 第 ${index + 1} 格有画稿但没有标签`);
      continue;
    }
    const numbered = label.match(/^\d+\.\s*([a-z]+)$/i);
    let character = sheetCharacter;
    let expression: Expression | undefined;
    if (numbered) {
      const candidate = numbered[1]?.toLowerCase();
      expression = expressions.find((value) => value === candidate);
      if (!expression) {
        problems.push(`${relative}: 未知表情标签「${label}」`);
        continue;
      }
    } else {
      character = byName.get(label.normalize('NFC'));
      expression = 'neutral';
      if (!character) {
        problems.push(
          `${relative}: 标签「${label}」不是 characters.yaml 中的角色名`,
        );
        continue;
      }
      if (character.main) {
        problems.push(
          `${relative}: 主角 ${character.name} 的单元缺少编号表情标签（实际「${label}」）`,
        );
        continue;
      }
    }
    if (!character) {
      problems.push(
        `${relative}: 无法从文件名或标签确定角色（标签「${label}」）`,
      );
      continue;
    }
    if (!expression) {
      problems.push(`${relative}: 第 ${index + 1} 格没有表情`);
      continue;
    }
    if (seen.has(expression) && character.main) {
      problems.push(
        `${relative}: ${character.name} 的表情 ${expression} 出现两次`,
      );
      continue;
    }
    seen.add(expression);
    if (
      extracted.some(
        (item) => item.char === character.id && item.expr === expression,
      )
    ) {
      problems.push(
        `${relative}: ${character.name}/${expression} 在另一张表中重复定义`,
      );
      continue;
    }
    const art = children(cell).find(
      (node) =>
        node.tagName === 'g' && attr(node, 'clip-path') === 'url(#clip)',
    );
    if (!art) {
      problems.push(
        `${relative}: 第 ${index + 1} 格缺少 clip-path="url(#clip)" 的画稿组`,
      );
      continue;
    }
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 540" width="400" height="540">',
      '<defs><clipPath id="clip"><rect x="0" y="0" width="400" height="540"/></clipPath></defs>',
      serialize(art),
      '</svg>',
    ].join('');
    const file = path.join(
      outputDir,
      `${character.name.normalize('NFC')}_${expression}.svg`,
    );
    await mkdir(outputDir, { recursive: true });
    await writeFile(file, svg);
    extracted.push({ char: character.id, expr: expression, file });
  }
}

const coverage = new Map<string, Set<string>>();
for (const item of extracted) {
  const set = coverage.get(item.char) ?? new Set<string>();
  set.add(item.expr);
  coverage.set(item.char, set);
}
for (const character of characters) {
  const set = coverage.get(character.id) ?? new Set<string>();
  if (!set.has('neutral'))
    problems.push(`角色 ${character.name} (${character.id}) 没有 neutral`);
  if (character.main) {
    const missing = expressions.filter((expression) => !set.has(expression));
    if (missing.length)
      problems.push(`主角 ${character.name} 缺少表情：${missing.join(', ')}`);
  }
}
if (problems.length) {
  console.error(
    `sprite sheet 拆分停止，共 ${problems.length} 个问题：\n- ${problems.join('\n- ')}`,
  );
  process.exit(1);
}

console.log(
  `sprite sheet 拆分完成：${sheets.length} 张表 → ${extracted.length} 个逐张立绘（${outputDir}）。`,
);
