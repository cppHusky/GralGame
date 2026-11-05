import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { directionSchema } from '../schema/direction.js';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dir = path.join(project, 'data/direction/stage1');
const files: string[] = [];
async function scan(folder: string) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.ya?ml$/i.test(entry.name)) files.push(file);
  }
}
try {
  await scan(dir);
} catch {
  console.log('演出层尚无 YAML 文件；跳过锚点与素材引用校验。');
  process.exit(0);
}
const manifest = parseYaml(
  await readFile(path.join(project, 'assets/manifest.yaml'), 'utf8'),
) as { id: string }[];
const assetIds = new Set(manifest.map((asset) => asset.id));
const chars = parseYaml(
  await readFile(path.join(project, 'data/characters.yaml'), 'utf8'),
) as { id: string }[];
const charIds = new Set(chars.map((character) => character.id));
const directions = [];
for (const file of files)
  directions.push({
    file,
    direction: directionSchema.parse(parseYaml(await readFile(file, 'utf8'))),
  });
let cues = 0;
for (const { file, direction } of directions) {
  cues += direction.cues.length;
  for (const id of [
    direction.defaults?.bg && `bg/${direction.defaults.bg}`,
    direction.defaults?.bgm && `bgm/${direction.defaults.bgm}`,
  ]) {
    if (id && !assetIds.has(id))
      throw new Error(`${path.relative(project, file)}: 默认素材不存在：${id}`);
  }
  for (const cue of direction.cues)
    for (const command of cue.do) {
      if (command.cmd === 'bg' && !assetIds.has(`bg/${command.id}`))
        throw new Error(
          `${path.relative(project, file)}: 背景不存在：bg/${command.id}`,
        );
      if (
        command.cmd === 'bgm' &&
        command.id !== 'stop' &&
        !assetIds.has(`bgm/${command.id}`)
      )
        throw new Error(
          `${path.relative(project, file)}: BGM 不存在：bgm/${command.id}`,
        );
      if (command.cmd === 'se' && !assetIds.has(`se/${command.id}`))
        throw new Error(
          `${path.relative(project, file)}: 音效不存在：se/${command.id}`,
        );
      if (
        ['show', 'expr', 'move', 'hide'].includes(command.cmd) &&
        'char' in command &&
        !charIds.has(command.char)
      )
        throw new Error(
          `${path.relative(project, file)}: 角色 ID 不存在：${command.char}`,
        );
      if (
        (command.cmd === 'show' || command.cmd === 'expr') &&
        !assetIds.has(`ch/${command.char}/${command.expr}`)
      ) {
        if (!assetIds.has(`ch/${command.char}/neutral`))
          throw new Error(
            `${path.relative(project, file)}: ${command.char} 无请求表情且缺少 neutral 回退图`,
          );
        console.warn(
          `${path.relative(project, file)}: ${command.char}/${command.expr} 缺图，运行时回退 neutral`,
        );
      }
    }
}
const irPath = path.join(project, 'generated/script/stage1.ir.json');
try {
  await access(irPath);
} catch {
  console.log(
    `演出 YAML 格式与素材引用合法（${files.length} 个文件，${cues} 个 cue）；IR 未构建，跳过锚点校验。`,
  );
  process.exit(0);
}
const ir = JSON.parse(await readFile(irPath, 'utf8')) as {
  lessons: {
    units: { id: string; beats: { id: string; anchor: string }[] }[];
  }[];
};
const anchors = new Map(
  ir.lessons
    .flatMap((lesson) => lesson.units)
    .map((unit) => [unit.id, unit.beats]),
);
for (const { file, direction } of directions)
  for (const cue of direction.cues) {
    const unitId = cue.at.id.split('#')[0];
    if (!unitId)
      throw new Error(`${path.relative(project, file)}: cue 缺少 unit ID`);
    const beats = anchors.get(unitId) ?? [];
    const target = beats.find((beat) => beat.id === cue.at.id);
    if (!target)
      throw new Error(
        `${path.relative(project, file)}: cue 指向的句子不存在：${cue.at.id}`,
      );
    const hits = beats.filter((beat) => beat.anchor === cue.at.anchor);
    if (!hits.some((beat) => beat.id === cue.at.id))
      throw new Error(
        `${path.relative(project, file)}: 锚点与 ID 不一致：${cue.at.id}（锚点「${cue.at.anchor}」）`,
      );
    if (hits.length > 1)
      console.warn(
        `${path.relative(project, file)}: ${cue.at.id} 的锚点在本单元命中 ${hits.length} 次；以 ID 为准，rebase 时需人工确认。`,
      );
  }
console.log(`演出层合法：${files.length} 个文件，${cues} 个 cue。`);
