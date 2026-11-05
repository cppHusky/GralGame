import { z } from 'zod';

export const gameStateSchema = z.object({
  schema: z.literal(1),
  cursor: z.object({
    lesson: z.number().int().nonnegative(),
    unit: z.number().int().nonnegative(),
    beat: z.number().int().nonnegative(),
    page: z.number().int().nonnegative(),
  }),
  stage: z.object({
    bg: z.string().optional(),
    sprites: z.record(
      z.string(),
      z.object({
        char: z.string(),
        expr: z.string(),
        slot: z.string(),
        dim: z.boolean(),
      }),
    ),
  }),
  board: z.object({
    items: z.array(
      z.object({
        math: z.string(),
        kind: z.enum(['eq', 'fig']),
        pinned: z.boolean(),
      }),
    ),
  }),
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  read: z.array(z.string()),
  mode: z.enum(['normal', 'auto', 'skip']),
});
export const saveSchema = z.object({
  format: z.literal('gralgame-save'),
  version: z.literal(1),
  scriptHash: z.string(),
  bookCommit: z.string(),
  savedAt: z.string(),
  state: gameStateSchema,
});
