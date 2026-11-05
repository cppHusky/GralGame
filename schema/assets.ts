import { z } from 'zod';

export const assetSchema = z.object({
  id: z.string(),
  file: z.string(),
  kind: z.enum(['sprite', 'background', 'cg', 'bgm', 'se', 'ui']),
  size: z.tuple([z.number().positive(), z.number().positive()]).optional(),
  pixel_ratio: z.number().positive().optional(),
  anchor: z.string().optional(),
  scale: z.number().positive().optional(),
  offset: z.tuple([z.number(), z.number()]).optional(),
  origin: z.enum(['placeholder', 'ai-generated', 'human-made', 'licensed']),
  tool: z.string().optional(),
  date: z.string().optional(),
  license: z.string().optional(),
  prompt_ref: z.string().optional(),
  regions: z
    .object({
      board: z.tuple([
        z.number(),
        z.number(),
        z.number().positive(),
        z.number().positive(),
      ]),
    })
    .optional(),
});
export const manifestSchema = z.array(assetSchema);
