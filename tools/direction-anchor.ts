import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptSchema } from '../schema/ir.js';

const id = process.argv[2];
if (!id) throw new Error('用法：pnpm direction:anchor <beat-id>');
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const script = scriptSchema.parse(
  JSON.parse(
    await readFile(
      path.join(project, 'generated/script/stage1.ir.json'),
      'utf8',
    ),
  ),
);
const beat = script.lessons
  .flatMap((lesson) => lesson.units)
  .flatMap((unit) => unit.beats)
  .find((row) => row.id === id);
if (!beat) throw new Error(`找不到对白 ID：${id}`);
console.log(beat.anchor);
