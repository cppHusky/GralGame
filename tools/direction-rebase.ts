import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify } from 'yaml';
import { directionSchema } from '../schema/direction.js';
import { scriptSchema } from '../schema/ir.js';

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const ir = scriptSchema.parse(
  JSON.parse(
    await readFile(
      path.join(project, 'generated/script/stage1.ir.json'),
      'utf8',
    ),
  ),
);
const byUnit = new Map(
  ir.lessons
    .flatMap((lesson) => lesson.units)
    .map((unit) => [unit.id, unit.beats]),
);
async function yamlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await yamlFiles(file)));
    else if (/\.ya?ml$/i.test(entry.name)) results.push(file);
  }
  return results;
}
const files = await yamlFiles(path.join(project, 'data/direction/stage1'));
let changed = 0;
for (const file of files) {
  const direction = directionSchema.parse(
    parseYaml(await readFile(file, 'utf8')),
  );
  let fileChanged = false;
  for (const cue of direction.cues) {
    const unitId = cue.at.id.split('#')[0];
    if (!unitId) throw new Error(`${file}: cue id 缺少 unit ID`);
    const beats = byUnit.get(unitId) ?? [];
    const exact = beats.find((beat) => beat.id === cue.at.id);
    if (exact?.anchor === cue.at.anchor) continue;
    const matches = beats.filter((beat) => beat.anchor === cue.at.anchor);
    if (matches.length !== 1)
      throw new Error(
        `${file}: ${cue.at.id} 锚点命中 ${matches.length} 次，无法自动 rebase`,
      );
    const match = matches[0];
    if (!match) throw new Error(`${file}: anchor map unexpectedly empty`);
    cue.at.id = match.id;
    fileChanged = true;
    changed += 1;
    console.warn(
      `${path.relative(project, file)}: ${unitId} 锚点匹配到 ${cue.at.id}，请审阅 diff`,
    );
  }
  if (fileChanged) await writeFile(file, stringify(direction));
}
console.log(
  `演出层 rebase 完成：${changed} 条 cue 更新，${files.length} 个 YAML 文件扫描。`,
);
