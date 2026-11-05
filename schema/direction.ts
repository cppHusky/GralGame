import { z } from 'zod';

const cueTargetSchema = z.object({ id: z.string(), anchor: z.string() });
export const expressionSchema = z.enum([
  'neutral',
  'smile',
  'laugh',
  'surprised',
  'angry',
  'sad',
  'thinking',
  'embarrassed',
]);
const commandSchema = z.discriminatedUnion('cmd', [
  z.object({
    cmd: z.literal('bg'),
    id: z.string(),
    transition: z.enum(['fade', 'cut', 'wipe']).optional(),
    ms: z.number().nonnegative().optional(),
  }),
  z.object({
    cmd: z.literal('show'),
    char: z.string(),
    expr: expressionSchema,
    slot: z.enum(['center', 'left', 'right', 'far-left', 'far-right']),
  }),
  z.object({
    cmd: z.literal('expr'),
    char: z.string(),
    expr: expressionSchema,
  }),
  z.object({
    cmd: z.literal('move'),
    char: z.string(),
    slot: z.string(),
    ms: z.number().nonnegative().optional(),
  }),
  z.object({ cmd: z.literal('hide'), char: z.string() }),
  z.object({
    cmd: z.literal('bgm'),
    id: z.string(),
    fade: z.number().nonnegative().optional(),
    volume: z.number().min(0).max(1).optional(),
  }),
  z.object({
    cmd: z.literal('se'),
    id: z.string(),
    volume: z.number().min(0).max(1).optional(),
  }),
  z.object({
    cmd: z.literal('board'),
    op: z.enum(['clear', 'pin', 'unpin', 'highlight', 'fade-older']),
  }),
  z.object({
    cmd: z.literal('card'),
    kind: z.enum(['location', 'title', 'chapter']),
    text: z.string(),
  }),
  z.object({
    cmd: z.literal('fx'),
    kind: z.enum(['shake', 'flash', 'vignette', 'blur']),
    ms: z.number().nonnegative(),
  }),
  z.object({ cmd: z.literal('wait'), ms: z.number().nonnegative() }),
  z.object({
    cmd: z.literal('set'),
    flag: z.string(),
    value: z.union([z.boolean(), z.number(), z.string()]),
  }),
]);
export const directionSchema = z.object({
  unit: z.string(),
  defaults: z
    .object({ bg: z.string().optional(), bgm: z.string().optional() })
    .optional(),
  cues: z.array(z.object({ at: cueTargetSchema, do: z.array(commandSchema) })),
});
