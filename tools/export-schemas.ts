import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { assetSchema, manifestSchema } from '../schema/assets.js';
import { directionSchema } from '../schema/direction.js';
import { scriptSchema } from '../schema/ir.js';
import { saveSchema } from '../schema/save.js';

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../schema',
);
await mkdir(out, { recursive: true });
const schemas: Record<string, z.ZodType> = {
  ir: scriptSchema,
  direction: directionSchema,
  asset: assetSchema,
  manifest: manifestSchema,
  save: saveSchema,
};
for (const [name, schema] of Object.entries(schemas)) {
  await writeFile(
    path.join(out, `${name}.schema.json`),
    `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`,
  );
}
console.log(`已导出 ${Object.keys(schemas).length} 份 JSON Schema。`);
