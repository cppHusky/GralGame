import { z } from 'zod';

export const mathRefSchema = z.string().min(1);
export const inlineSchema: z.ZodType<Inline> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('text'), text: z.string() }),
  z.object({ t: z.literal('math'), math: mathRefSchema }),
  z.object({ t: z.literal('ruby'), base: z.string(), rt: z.string() }),
  z.object({
    t: z.literal('strong'),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
]);
export const blockSchema: z.ZodType<Block> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('p'), inline: z.array(inlineSchema) }),
  z.object({ kind: z.literal('eq'), math: mathRefSchema }),
  z.object({ kind: z.literal('fig'), math: mathRefSchema }),
  z.object({ kind: z.literal('list'), items: z.array(z.array(inlineSchema)) }),
]);
export const beatSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('turn'),
    id: z.string(),
    anchor: z.string(),
    hash: z.string(),
    speaker: z.string(),
    blocks: z.array(blockSchema),
  }),
  z.object({
    kind: z.literal('narration'),
    id: z.string(),
    anchor: z.string(),
    hash: z.string(),
    location: z.string().optional(),
    blocks: z.array(blockSchema),
  }),
]);
export const unitSchema = z.object({
  id: z.string(),
  kind: z.enum(['section', 'after-lesson']),
  title: z.string().optional(),
  beats: z.array(beatSchema),
});
export const lessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  units: z.array(unitSchema),
});
export const scriptSchema = z.object({
  schema: z.literal(1),
  bookCommit: z.string(),
  typstVersion: z.string(),
  lessons: z.array(lessonSchema),
});

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'math'; math: string }
  | { t: 'ruby'; base: string; rt: string }
  | { t: 'strong'; children: Inline[] };
export type Block =
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'eq' | 'fig'; math: string }
  | { kind: 'list'; items: Inline[][] };
export type Beat = z.infer<typeof beatSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Script = z.infer<typeof scriptSchema>;
