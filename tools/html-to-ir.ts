import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { parse as parseYaml } from 'yaml';
import {
  type Block,
  type Inline,
  type Lesson,
  scriptSchema,
  type Unit,
} from '../schema/ir.js';

type HtmlNode = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: HtmlNode[];
  content?: HtmlNode;
};
type IdMap = {
  lessons: Record<string, string>;
  units: Record<string, Record<string, string>>;
};
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const html = await readFile(path.join(project, '.build/stage1.html'), 'utf8');
const source = JSON.parse(
  await readFile(path.join(project, '.build/source.json'), 'utf8'),
) as { bookCommit: string; typstVersion: string };
const chars = parseYaml(
  await readFile(path.join(project, 'data/characters.yaml'), 'utf8'),
) as { id: string; name: string }[];
const ids = parseYaml(
  await readFile(path.join(project, 'data/ids.yaml'), 'utf8'),
) as IdMap;
const charByName = new Map(
  chars.map((character) => [character.name, character.id]),
);
const mathItems: Record<
  string,
  { svg: string; viewBox: string; wEm: number; hEm: number; vAlignEm: number }
> = {};
const glyphs = new Map<string, string>();
let currentLesson: Lesson | undefined;
let currentUnit: Unit | undefined;
let beatIndex = 0;
const root = parse(html) as unknown as HtmlNode;

function attr(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}
function children(node: HtmlNode): HtmlNode[] {
  return node.childNodes ?? (node.content ? [node.content] : []);
}
function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return children(node).map(textContent).join('');
}
function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
}
function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
function removeGlyphDefinitions(node: HtmlNode): void {
  if (node.tagName === 'symbol') {
    const id = attr(node, 'id');
    if (!id) throw new Error('Typst SVG 中发现没有 id 的 symbol 字形');
    const content = serialize(node);
    const existing = glyphs.get(id);
    if (existing && existing !== content)
      throw new Error(`同一 SVG 字形 ID 内容不一致：${id}`);
    glyphs.set(id, content);
    return;
  }
  for (const child of [...children(node)]) removeGlyphDefinitions(child);
  if (node.childNodes)
    node.childNodes = node.childNodes.filter(
      (child) => child.tagName !== 'symbol',
    );
}
function sanitizeSvg(node: HtmlNode): void {
  const safeTags = new Set([
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'defs',
    'symbol',
    'use',
    'clippath',
    'mask',
    'lineargradient',
    'radialgradient',
    'stop',
    'pattern',
    'marker',
    'title',
    'desc',
    'text',
    'tspan',
    'style',
  ]);
  const visit = (current: HtmlNode) => {
    const tag = current.tagName?.toLowerCase();
    if (tag && !safeTags.has(tag))
      throw new Error(`Typst SVG 中不允许的元素 <${current.tagName}>`);
    if (current.attrs) {
      current.attrs = current.attrs.filter(({ name, value }) => {
        if (/^on/i.test(name)) return false;
        if (
          (name === 'href' || name.endsWith(':href')) &&
          !value.startsWith('#')
        )
          return false;
        if (/url\(\s*(['"]?)(?!#)/i.test(value)) return false;
        return true;
      });
    }
    for (const child of children(current)) visit(child);
  };
  visit(node);
}
function stripBaselineMarker(node: HtmlNode): number | undefined {
  let baseline: number | undefined;
  const scan = (current: HtmlNode, parent?: HtmlNode) => {
    const hasMarker =
      current.tagName === 'g' &&
      (attr(current, 'fill')?.toLowerCase() === '#010203' ||
        children(current).some(
          (child) =>
            child.tagName === 'path' &&
            attr(child, 'fill')?.toLowerCase() === '#010203',
        ));
    if (hasMarker) {
      const transform = attr(current, 'transform') ?? '';
      const match = transform.match(
        /matrix\(\s*[-+\d.e]+\s+[-+\d.e]+\s+[-+\d.e]+\s+[-+\d.e]+\s+[-+\d.e]+\s+([-+\d.e]+)\s*\)/i,
      );
      if (match) baseline = Number(match[1]);
      if (parent?.childNodes)
        parent.childNodes = parent.childNodes.filter(
          (child) => child !== current,
        );
      return;
    }
    for (const child of [...children(current)]) scan(child, current);
  };
  scan(node);
  return baseline;
}
function serialize(node: HtmlNode): string {
  if (node.nodeName === '#text')
    return (node.value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  if (node.nodeName === '#comment' || node.nodeName === '#documentType')
    return '';
  const tag = node.tagName ?? node.nodeName;
  if (
    node.nodeName === '#document' ||
    node.nodeName === '#document-fragment' ||
    node.nodeName === 'html' ||
    node.nodeName === 'head' ||
    node.nodeName === 'body'
  )
    return children(node).map(serialize).join('');
  const attrs = (node.attrs ?? [])
    .map(
      ({ name, value }) =>
        ` ${name}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`,
    )
    .join('');
  const body = children(node).map(serialize).join('');
  return `<${tag}${attrs}>${body}</${tag}>`;
}
function addMath(svgNode: HtmlNode): string {
  const viewBox = attr(svgNode, 'viewBox') ?? '0 0 1 1';
  const [viewWidth = 1, viewHeight = 1] = viewBox
    .split(/\s+/)
    .slice(2)
    .map(Number);
  const widthAttr = attr(svgNode, 'width') ?? '1em';
  const heightAttr = attr(svgNode, 'height') ?? '1em';
  const styleDimension = (property: string) =>
    attr(svgNode, 'style')
      ?.split(';')
      .map((declaration) => declaration.trim())
      .find((declaration) => declaration.startsWith(`${property}:`))
      ?.slice(property.length + 1)
      .trim();
  const parseEm = (value: string) => {
    const match = value
      .trim()
      .match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(em|pt|px)?$/i);
    if (!match) return 1;
    const size = Number(match[1]);
    if (!Number.isFinite(size)) return 1;
    if (match[2]?.toLowerCase() === 'em') return size;
    if (match[2]?.toLowerCase() === 'pt') return size / 11;
    if (match[2]?.toLowerCase() === 'px') return size / 16;
    return size / 16;
  };
  const widthEm = parseEm(styleDimension('width') ?? widthAttr);
  const heightEm = parseEm(styleDimension('height') ?? heightAttr);
  sanitizeSvg(svgNode);
  const baseline = stripBaselineMarker(svgNode);
  removeGlyphDefinitions(svgNode);
  const svg = serialize(svgNode).replace(
    /(fill|stroke)="#000000"/gi,
    '$1="currentColor"',
  );
  const ref = `math/${fingerprint(svg)}`;
  const vAlignEm =
    baseline === undefined
      ? 0
      : Math.max(0, ((viewHeight - baseline) * widthEm) / viewWidth);
  mathItems[ref] = {
    svg,
    viewBox,
    wEm: widthEm,
    hEm: heightEm,
    vAlignEm,
  };
  return ref;
}
function parseInline(node: HtmlNode): Inline[] {
  if (node.nodeName === '#text')
    return node.value ? [{ t: 'text', text: node.value }] : [];
  const tag = node.tagName;
  if (tag === 'svg') return [{ t: 'math', math: addMath(node) }];
  if (tag === 'ruby') {
    const base = children(node)
      .filter((child) => child.tagName !== 'rt')
      .map(textContent)
      .join('');
    const rt = children(node)
      .filter((child) => child.tagName === 'rt')
      .map(textContent)
      .join('');
    return [{ t: 'ruby', base, rt }];
  }
  if (tag === 'strong' || tag === 'b')
    return [{ t: 'strong', children: children(node).flatMap(parseInline) }];
  if (tag === 'br') return [{ t: 'text', text: '\n' }];
  if (tag === 'p') return children(node).flatMap(parseInline);
  if (!tag) return children(node).flatMap(parseInline);
  throw new Error(`不支持的行内 HTML 标签 <${tag}>`);
}
function parseBlocks(beat: HtmlNode): Block[] {
  const blocks: Block[] = [];
  let inline: Inline[] = [];
  const flush = () => {
    if (inline.length) {
      blocks.push({ kind: 'p', inline });
      inline = [];
    }
  };
  for (const child of children(beat)) {
    if (child.nodeName === '#text') {
      inline.push(...parseInline(child));
      continue;
    }
    const tag = child.tagName;
    const cls = attr(child, 'class')?.split(/\s+/) ?? [];
    if (tag === 'p') {
      flush();
      blocks.push({ kind: 'p', inline: children(child).flatMap(parseInline) });
    } else if (tag === 'div' && (cls.includes('eq') || cls.includes('fig'))) {
      flush();
      const svg = children(child).find((item) => item.tagName === 'svg');
      if (!svg)
        throw new Error(`块级 ${cls.includes('eq') ? '公式' : '图'}缺少 SVG`);
      blocks.push({
        kind: cls.includes('eq') ? 'eq' : 'fig',
        math: addMath(svg),
      });
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      blocks.push({
        kind: 'list',
        items: children(child)
          .filter((item) => item.tagName === 'li')
          .map((item) => children(item).flatMap(parseInline)),
      });
    } else inline.push(...parseInline(child));
  }
  flush();
  return blocks;
}
function startUnit(title: string | undefined, kind: Unit['kind'] = 'section') {
  if (!currentLesson)
    throw new Error(`小节标题「${title ?? '(开头)'}」之前没有课标题`);
  const id =
    kind === 'after-lesson'
      ? `${currentLesson.id}/after`
      : title
        ? ids.units[currentLesson.title]?.[title]
        : undefined;
  if (title && kind === 'section' && !id)
    throw new Error(
      `data/ids.yaml 缺少小节标题映射：${currentLesson.title} / ${title}`,
    );
  currentUnit = {
    id: id ?? `${currentLesson.id}/s00`,
    kind,
    ...(title ? { title } : {}),
    beats: [],
  };
  currentLesson.units.push(currentUnit);
  beatIndex = 0;
}
function addBeat(node: HtmlNode) {
  if (!currentLesson) throw new Error('发现对白，但前面没有课标题');
  if (!currentUnit) startUnit(undefined);
  const unit = currentUnit;
  if (!unit) throw new Error('无法确定对白所属小节');
  const speakerName = attr(node, 'data-speaker');
  const isTurn =
    node.nodeName === 'div' &&
    (attr(node, 'class') ?? '').split(/\s+/).includes('turn');
  if (isTurn && (!speakerName || !charByName.has(speakerName)))
    throw new Error(
      `未知说话人「${speakerName ?? ''}」，请补充 data/characters.yaml`,
    );
  let blocks: Block[];
  try {
    blocks = parseBlocks(node);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${currentLesson.title} / ${currentUnit?.title ?? '开头'} / ${unit.beats.length}: ${message}`,
    );
  }
  const text = blocks
    .map((block) =>
      block.kind === 'p'
        ? inlineText(block.inline)
        : block.kind === 'list'
          ? block.items.map(inlineText).join('')
          : '',
    )
    .join('');
  let location: string | undefined;
  if (!isTurn && blocks[0]?.kind === 'p') {
    const candidate = inlineText(blocks[0].inline).trim();
    const match = candidate.match(/^【(.+)】$/);
    if (match) {
      location = match[1];
      blocks.shift();
    }
  }
  const anchor = normalized(`${speakerName ?? ''}${text}`).slice(0, 16);
  const hash = createHash('sha1').update(normalized(text)).digest('hex');
  const common = {
    id: `${unit.id}#${String(beatIndex++).padStart(4, '0')}`,
    anchor,
    hash,
    blocks,
  };
  if (isTurn) {
    const characterId = speakerName ? charByName.get(speakerName) : undefined;
    if (!characterId)
      throw new Error(`说话人映射在解析过程中丢失：${speakerName ?? '(空)'}`);
    unit.beats.push({ kind: 'turn', ...common, speaker: characterId });
  } else
    unit.beats.push({
      kind: 'narration',
      ...common,
      ...(location ? { location } : {}),
    });
  void text;
}
function inlineText(items: Inline[]): string {
  return items
    .map((item) =>
      item.t === 'text'
        ? item.text
        : item.t === 'math'
          ? '公式'
          : item.t === 'ruby'
            ? item.base
            : inlineText(item.children),
    )
    .join('');
}
function process(node: HtmlNode) {
  if (
    node.nodeName === '#text' ||
    node.nodeName === '#comment' ||
    !node.tagName
  ) {
    children(node).forEach(process);
    return;
  }
  if (node.tagName === 'h4') {
    const title = textContent(node).trim();
    const id = ids.lessons[title];
    if (!id) throw new Error(`data/ids.yaml 缺少课程标题映射：${title}`);
    currentLesson = { id, title, units: [] };
    currentUnit = undefined;
    lessons.push(currentLesson);
    return;
  }
  if (node.tagName === 'h5') {
    startUnit(textContent(node).trim());
    return;
  }
  if (
    node.tagName === 'section' &&
    (attr(node, 'class') ?? '').split(/\s+/).includes('after-lesson')
  ) {
    startUnit('放课后', 'after-lesson');
    for (const child of children(node)) process(child);
    currentUnit = undefined;
    return;
  }
  if (
    node.tagName === 'div' &&
    ['turn', 'narration'].some((c) =>
      (attr(node, 'class') ?? '').split(/\s+/).includes(c),
    )
  ) {
    addBeat(node);
    return;
  }
  if (['html', 'head', 'body', 'main', 'article'].includes(node.tagName)) {
    children(node).forEach(process);
    return;
  }
  throw new Error(
    `不支持的 HTML 标签 <${node.tagName}>（${currentLesson?.title ?? '课标题前'} / ${currentUnit?.title ?? '开头'}）`,
  );
}
const lessons: Lesson[] = [];
function findBody(node: HtmlNode): HtmlNode | undefined {
  if (node.tagName === 'body') return node;
  for (const child of children(node)) {
    const body = findBody(child);
    if (body) return body;
  }
  return undefined;
}
const body = findBody(root);
if (!body) throw new Error('Typst HTML 导出中缺少 <body>');
process(body);
const script = scriptSchema.parse({
  schema: 1,
  bookCommit: source.bookCommit,
  typstVersion: source.typstVersion,
  lessons,
});
const out = path.join(project, 'generated');
await mkdir(path.join(out, 'script'), { recursive: true });
await mkdir(path.join(out, 'math'), { recursive: true });
await writeFile(
  path.join(out, 'script/stage1.ir.json'),
  `${JSON.stringify(script, null, 2)}\n`,
);
await writeFile(
  path.join(out, 'math/stage1.json'),
  `${JSON.stringify(mathItems)}\n`,
);
await writeFile(
  path.join(out, 'math/glyphs.svg'),
  [...glyphs.values()].join('\n'),
);
console.log(
  `IR 生成完成：${lessons.length} 课，${lessons.reduce((sum, lesson) => sum + lesson.units.reduce((n, unit) => n + unit.beats.length, 0), 0)} 句，${Object.keys(mathItems).length} 个 SVG。`,
);
