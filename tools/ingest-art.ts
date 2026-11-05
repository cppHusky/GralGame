import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse as parseYaml, stringify } from 'yaml';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const inbox = path.join(project, 'assets/_inbox');
const characters = parseYaml(
  await readFile(path.join(project, 'data/characters.yaml'), 'utf8'),
) as { id: string; name: string; main: boolean }[];
const backgroundRegions = (await readFile(
  path.join(project, 'data/backgrounds.yaml'),
  'utf8',
)
  .then((text) => parseYaml(text))
  .catch(() => ({}))) as Record<
  string,
  { regions?: { board: [number, number, number, number] } }
>;
const spriteUnits: [number, number] = [400, 540];
const expressions = [
  'neutral',
  'smile',
  'laugh',
  'surprised',
  'angry',
  'sad',
  'thinking',
  'embarrassed',
];
type Input = {
  absolute: string;
  relative: string;
  name: string;
  kind: 'sprite' | 'background';
  char?: (typeof characters)[number];
  expr?: string;
  bg?: string;
};

async function listFiles(dir: string): Promise<string[]> {
  const rows = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const row of rows) {
    const file = path.join(dir, row.name);
    // `_input/` holds raw owner sheets; tools/extract-sheets.ts derives the
    // individually named sprites that this importer accepts.
    if (row.isDirectory()) {
      if (!row.name.startsWith('_')) files.push(...(await listFiles(file)));
    } else files.push(file);
  }
  return files;
}
function parseViewBox(
  svg: string,
): [number, number, number, number] | undefined {
  const value = svg.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  const numbers = value
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers?.length !== 4) return undefined;
  if (numbers.some((number) => !Number.isFinite(number))) return undefined;
  return numbers as [number, number, number, number];
}
function attribute(tag: string, name: string): number | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = tag.match(
    new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, 'i'),
  )?.[1];
  const number = value ? Number.parseFloat(value) : undefined;
  return number !== undefined && Number.isFinite(number) ? number : undefined;
}
function spriteInfo(
  file: string,
): Omit<Input, 'absolute' | 'relative' | 'name'> | undefined {
  const base = path
    .basename(file)
    .normalize('NFC')
    .replace(/\.[^.]+$/, '');
  const parent = path.basename(path.dirname(file)).normalize('NFC');
  const folderChar = characters.find((char) => char.name === parent);
  const folderExpr = folderChar ? base.toLowerCase() : undefined;
  if (folderChar && folderExpr && expressions.includes(folderExpr))
    return { kind: 'sprite', char: folderChar, expr: folderExpr };
  for (const char of [...characters].sort(
    (a, b) => b.name.length - a.name.length,
  )) {
    const escaped = char.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = base.match(new RegExp(`^${escaped}[_\\- ](\\w+)$`, 'i'));
    const expr = match?.[1]?.toLowerCase();
    if (expr && expressions.includes(expr))
      return { kind: 'sprite', char, expr };
  }
  return undefined;
}
async function inspectTransparency(
  input: Input,
  file: string,
  outputSize: [number, number],
) {
  const source = input.name.toLowerCase().endsWith('.svg')
    ? sharp(file, { density: 144 }).resize(outputSize[0], outputSize[1], {
        fit: 'fill',
      })
    : sharp(file).resize(outputSize[0], outputSize[1], { fit: 'fill' });
  const { data, info } = await source
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaIndex = 3;
  let anyTransparent = false;
  let edgeOpaque = 0;
  let edgePixels = 0;
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1) {
      const alpha =
        data[(y * info.width + x) * info.channels + alphaIndex] ?? 0;
      if (alpha < 255) anyTransparent = true;
      if (y === 0 || x === 0 || x === info.width - 1) {
        edgePixels += 1;
        if (alpha > 240) edgeOpaque += 1;
      }
    }
  if (input.kind === 'sprite' && (!info.hasAlpha || !anyTransparent))
    throw new Error(`${input.relative}: 立绘必须包含实际透明像素`);
  if (input.kind === 'background' && anyTransparent)
    throw new Error(`${input.relative}: 背景不允许透明像素`);
  if (input.kind === 'sprite' && edgeOpaque / Math.max(1, edgePixels) > 0.5)
    console.warn(
      `${input.relative}: 顶边/左右边缘不透明像素超过一半，请检查抠图边缘`,
    );
}

const files = await listFiles(inbox).catch(() => []);
const supported = files.filter((file) => /\.(svg|png|webp)$/i.test(file));
const inputs: Input[] = [];
const problems: string[] = [];
for (const absolute of supported) {
  const relative = path.relative(inbox, absolute).normalize('NFC');
  const name = path.basename(absolute).normalize('NFC');
  const sprite = spriteInfo(absolute);
  if (sprite) {
    const main = sprite.char?.main ?? false;
    if (!main && sprite.expr !== 'neutral')
      problems.push(`${relative}: 非主角只有 neutral 表情`);
    inputs.push({ absolute, relative, name, ...sprite });
    continue;
  }
  const background = name.match(/^bg_([a-z0-9][a-z0-9_-]*)\.(svg|png|webp)$/i);
  if (background) {
    const bg = background[1];
    if (!bg) throw new Error(`${relative}: 无法解析背景名`);
    inputs.push({
      absolute,
      relative,
      name,
      kind: 'background',
      bg: bg.toLowerCase(),
    });
    continue;
  }
  problems.push(
    `${relative}: 文件名不符合逐张立绘或 bg_<slug> 背景命名规则；不对 sprite sheet 自动猜测切图`,
  );
}
const seen = new Set<string>();
for (const input of inputs) {
  const id =
    input.kind === 'sprite'
      ? `ch/${input.char?.id}/${input.expr}`
      : `bg/${input.bg}`;
  if (seen.has(id)) problems.push(`${input.relative}: 素材 ID 重复 ${id}`);
  seen.add(id);
}
for (const char of characters)
  if (!seen.has(`ch/${char.id}/neutral`))
    problems.push(`缺少角色 ${char.name} (${char.id}) 的 neutral 立绘`);
if (problems.length) {
  console.error(
    `素材导入停止，共发现 ${problems.length} 个问题：\n- ${problems.join('\n- ')}`,
  );
  process.exit(1);
}

const manifest: Record<string, unknown>[] = [];
const previews = new Map<string, string[]>();
for (const input of inputs) {
  const isSprite = input.kind === 'sprite';
  const charId = input.char?.id;
  if (isSprite && (!charId || !input.expr))
    throw new Error(`${input.relative}: 立绘缺少角色或表情映射`);
  const outputSize: [number, number] = isSprite
    ? [spriteUnits[0] * 2, spriteUnits[1] * 2]
    : [1920, 1080];
  const raw = input.name.toLowerCase().endsWith('.svg')
    ? await readFile(input.absolute, 'utf8')
    : undefined;
  if (raw) {
    const viewBox = parseViewBox(raw);
    const expected: [number, number] = isSprite ? spriteUnits : [1920, 1080];
    if (
      viewBox?.[0] !== 0 ||
      viewBox[1] !== 0 ||
      viewBox[2] !== expected[0] ||
      viewBox[3] !== expected[1]
    ) {
      throw new Error(
        `${input.relative}: SVG viewBox 必须是 0 0 ${expected[0]} ${expected[1]}`,
      );
    }
  } else {
    const metadata = await sharp(input.absolute).metadata();
    const expected = outputSize;
    if (metadata.width !== expected[0] || metadata.height !== expected[1])
      throw new Error(
        `${input.relative}: 栅格图尺寸必须为 ${expected[0]}×${expected[1]}，当前 ${metadata.width}×${metadata.height}`,
      );
  }

  let regions: { board: [number, number, number, number] } | undefined;
  if (!isSprite && raw) {
    const marker = raw.match(/<([\w:-]+)\b[^>]*\bid=["']board-area["'][^>]*>/i);
    const rect =
      marker?.[0] ??
      raw.match(/<rect\b[^>]*\bid=["']board-area["'][^>]*>/i)?.[0];
    if (rect) {
      const x = attribute(rect, 'x') ?? 0;
      const y = attribute(rect, 'y') ?? 0;
      const w = attribute(rect, 'width');
      const h = attribute(rect, 'height');
      if (w && h) regions = { board: [x, y, w, h] };
    }
    // Reviewed coordinates from data/backgrounds.yaml take precedence; the
    // source SVG has no in-artwork marker to read.
    regions = backgroundRegions[input.bg ?? '']?.regions ?? regions;
    if (!regions)
      console.warn(
        `${input.relative}: 没有板书区坐标（id="board-area" 或 data/backgrounds.yaml）；背景将使用浮动黑板。`,
      );
  }
  await inspectTransparency(input, input.absolute, outputSize);
  const outputPath = isSprite
    ? path.join(
        project,
        'assets/ch',
        charId ?? '_invalid',
        `${input.expr}.webp`,
      )
    : path.join(project, 'assets/bg', `${input.bg}.webp`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const image = raw
    ? sharp(Buffer.from(raw), { density: 144 })
    : sharp(input.absolute);
  await image
    .resize(outputSize[0], outputSize[1], { fit: 'fill' })
    .webp({ lossless: true, alphaQuality: 100 })
    .toFile(outputPath);
  if (raw) {
    const sourcePath = path.join(
      project,
      'assets/_src',
      isSprite
        ? `${charId ?? '_invalid'}_${input.expr}.svg`
        : `bg_${input.bg}.svg`,
    );
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await copyFile(input.absolute, sourcePath);
  }
  const file = path.relative(project, outputPath).split(path.sep).join('/');
  const info = await sharp(outputPath).metadata();
  manifest.push({
    id: isSprite
      ? `ch/${charId ?? '_invalid'}/${input.expr}`
      : `bg/${input.bg}`,
    file,
    kind: input.kind,
    size: [info.width, info.height],
    pixel_ratio: isSprite ? 2 : 1,
    ...(isSprite ? { anchor: 'bottom-center', scale: 1, offset: [0, 0] } : {}),
    origin: 'ai-generated',
    tool: 'TODO',
    date: 'TODO',
    license: 'TODO',
    ...(regions ? { regions } : {}),
  });
  if (isSprite) {
    const key = charId ?? '_invalid';
    previews.set(key, [...(previews.get(key) ?? []), outputPath]);
  }
  console.log(`导入 ${file}`);
}
const manifestPath = path.join(project, 'assets/manifest.yaml');
await writeFile(manifestPath, stringify(manifest));

const previewDir = path.join(project, 'generated/preview');
await mkdir(previewDir, { recursive: true });
const overviewLayers: { input: Buffer; left: number; top: number }[] = [];
const columns = 7;
for (const [index, char] of characters.entries()) {
  const items = previews.get(char.id) ?? [];
  if (!items.length) continue;
  const firstItem = items[0];
  if (!firstItem) continue;
  const composite = await Promise.all(
    items.map(async (file) => ({
      input: await sharp(file).ensureAlpha().png().toBuffer(),
      left: 0,
      top: 0,
      blend: 'over' as const,
      opacity: 0.32,
    })),
  );
  await sharp({
    create: {
      width: 800,
      height: 1080,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(composite)
    .png()
    .toFile(path.join(previewDir, `${char.id}-expressions.png`));
  const thumb = await sharp(firstItem)
    .resize(160, 208, { fit: 'fill' })
    .png()
    .toBuffer();
  overviewLayers.push({
    input: thumb,
    left: (index % columns) * 170,
    top: Math.floor(index / columns) * 228 + 20,
  });
}
await sharp({
  create: {
    width: columns * 170,
    height: Math.ceil(characters.length / columns) * 228 + 45,
    channels: 4,
    background: '#eee9dd',
  },
})
  .composite(overviewLayers)
  .png()
  .toFile(path.join(previewDir, 'characters-overview.png'));
console.log(
  `素材导入完成：${manifest.length} 项。预览位于 generated/preview/；核对来源授权并替换 manifest.yaml 中的 TODO 后才可发布。`,
);
