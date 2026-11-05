import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { manifestSchema } from '../schema/assets.js';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const manifestPath = path.join(project, 'assets/manifest.yaml');
const manifest = manifestSchema.parse(
  parseYaml(await readFile(manifestPath, 'utf8')),
);
const ids = new Set<string>();
for (const asset of manifest) {
  if (ids.has(asset.id)) throw new Error(`重复素材 ID：${asset.id}`);
  ids.add(asset.id);
  const file = path.resolve(project, asset.file);
  if (!file.startsWith(`${project}${path.sep}`))
    throw new Error(`${asset.id}: 素材路径越界`);
  try {
    await access(file);
  } catch {
    throw new Error(`${asset.id}: 文件不存在：${asset.file}`);
  }
  if (
    asset.kind === 'sprite' &&
    asset.size &&
    (asset.size[0] !== 800 || asset.size[1] !== 1080)
  )
    throw new Error(`${asset.id}: 立绘尺寸必须是 800×1080`);
  if (
    asset.kind === 'background' &&
    asset.size &&
    (asset.size[0] !== 1920 || asset.size[1] !== 1080)
  )
    throw new Error(`${asset.id}: 背景尺寸必须是 1920×1080`);
  if (asset.regions?.board) {
    const [x, y, w, h] = asset.regions.board;
    if (x < 0 || y < 0 || x + w > 1920 || y + h > 1080)
      throw new Error(`${asset.id}: 板书区超出 1920×1080 画布`);
    if (y + h > 760)
      console.warn(
        `${asset.id}: 板书区底边 ${y + h} 可能被底部对话框遮挡（建议 ≤ 760）。`,
      );
  }
  if (
    asset.origin !== 'placeholder' &&
    (!asset.tool || !asset.date || !asset.license)
  )
    console.warn(`${asset.id}: 缺少 tool/date/license 来源字段`);
  const info = await stat(file);
  if (info.size > 20 * 1024 * 1024)
    console.warn(`${asset.id}: 超过项目的 20 MiB 文件警告门槛`);
}
const characterRows = parseYaml(
  await readFile(path.join(project, 'data/characters.yaml'), 'utf8'),
) as { id: string; main: boolean }[];
const absent = characterRows.filter(
  (character) => !ids.has(`ch/${character.id}/neutral`),
);
if (!manifest.length)
  console.warn(
    '素材清单为空；收件箱里的 sprite sheets 尚未导入，详见 docs/assets-inventory.md。',
  );
else {
  if (absent.length)
    console.warn(
      `缺少 neutral 立绘：${absent.map((character) => character.id).join(', ')}`,
    );
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
  for (const character of characterRows.filter((row) => row.main)) {
    const missing = expressions.filter(
      (expression) => !ids.has(`ch/${character.id}/${expression}`),
    );
    if (missing.length)
      console.warn(
        `${character.id}: 主角表情覆盖不足，缺少 ${missing.join(', ')}`,
      );
  }
}
if (!manifest.some((asset) => asset.kind === 'background'))
  console.warn('没有已登记背景素材；M2 真实背景场景尚未满足。');
const sprites = manifest.filter((asset) => asset.kind === 'sprite');
const backgrounds = manifest.filter((asset) => asset.kind === 'background');
const expressionsPerCharacter = new Map<string, number>();
for (const sprite of sprites) {
  const [character] = sprite.id.split('/').slice(1);
  if (character)
    expressionsPerCharacter.set(
      character,
      (expressionsPerCharacter.get(character) ?? 0) + 1,
    );
}
const coveredMains = characterRows.filter(
  (character) => (expressionsPerCharacter.get(character.id) ?? 0) >= 8,
);
console.log(
  `${[
    `素材清单结构合法：${manifest.length} 项`,
    `${sprites.length} 张立绘覆盖 ${expressionsPerCharacter.size}/${characterRows.length} 个角色`,
    `${coveredMains.length}/${characterRows.filter((row) => row.main).length} 位主角有全部 8 种表情`,
    `${backgrounds.length} 张背景`,
    `${absent.length} 个角色没有 neutral`,
  ].join('；')}。`,
);
