import { describe, expect, it } from 'vitest';
import { directionSchema } from '../schema/direction.js';
import type { Script } from '../schema/ir.js';
import {
  applyCommands,
  commandsFor,
  defaultCommands,
} from '../src/core/direction.js';
import { paginateBeat } from '../src/core/pagination.js';
import {
  completeCurrentPage,
  enterCurrentPage,
  initialState,
  previous,
  step,
} from '../src/core/state.js';

const script: Script = {
  schema: 1,
  bookCommit: 'test',
  typstVersion: '0.15.0',
  lessons: [
    {
      id: 'stage1/l1',
      title: '测试课',
      units: [
        {
          id: 'stage1/l1/s01',
          kind: 'section',
          beats: [
            {
              kind: 'turn',
              id: 'stage1/l1/s01#0000',
              anchor: '你好',
              hash: 'a',
              speaker: 'yan-pei',
              blocks: [{ kind: 'p', inline: [{ t: 'text', text: '你好。' }] }],
            },
            {
              kind: 'narration',
              id: 'stage1/l1/s01#0001',
              anchor: '第二句',
              hash: 'b',
              blocks: [
                { kind: 'p', inline: [{ t: 'text', text: '第二句。' }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};
const firstBeat = script.lessons.at(0)?.units.at(0)?.beats.at(0);
const firstLesson = script.lessons.at(0);
const firstUnit = firstLesson?.units.at(0);
const secondBeat = firstUnit?.beats.at(1);
if (!firstBeat || !firstLesson || !firstUnit || !secondBeat)
  throw new Error('测试脚本缺少起始对白或课程');

describe('direction staging', () => {
  const direction = directionSchema.parse({
    unit: 'stage1/l1/s01',
    defaults: { bg: 'classroom_wide' },
    cues: [
      {
        at: { id: firstBeat.id, anchor: firstBeat.anchor },
        do: [
          { cmd: 'show', char: 'yan-pei', expr: 'neutral', slot: 'center' },
          { cmd: 'show', char: 'yang-bing', expr: 'smile', slot: 'right' },
          { cmd: 'expr', char: 'yang-bing', expr: 'thinking' },
          { cmd: 'set', flag: 'greeted', value: true },
        ],
      },
    ],
  });

  it('resolves cues by beat id and derives defaults', () => {
    expect(commandsFor(direction, firstBeat.id)).toHaveLength(4);
    expect(commandsFor(direction, 'stage1/l1/s01#9999')).toEqual([]);
    expect(defaultCommands(direction)).toEqual([
      { cmd: 'bg', id: 'classroom_wide' },
    ]);
  });

  it('applies staging without mutating the input state', () => {
    const base = initialState();
    const { state, effects } = applyCommands(base, [
      ...defaultCommands(direction),
      ...commandsFor(direction, firstBeat.id),
    ]);
    expect(base.stage.sprites).toEqual({});
    expect(state.stage.bg).toBe('classroom_wide');
    expect(state.stage.sprites['yan-pei']).toMatchObject({
      expr: 'neutral',
      slot: 'center',
    });
    expect(state.stage.sprites['yang-bing']).toMatchObject({
      expr: 'thinking',
      slot: 'right',
    });
    expect(state.flags.greeted).toBe(true);
    expect(effects.filter((effect) => effect.t === 'sprite')).toHaveLength(3);
  });

  it('keeps the board across sections but resets it across lessons', () => {
    const boardItem = {
      math: 'math/kept',
      kind: 'eq' as const,
      pinned: false,
    };
    const unitBeat = firstBeat;
    const sectionScript: Script = {
      ...script,
      lessons: [
        {
          ...firstLesson,
          units: [
            { ...firstUnit, beats: [unitBeat] },
            {
              ...firstUnit,
              id: 'stage1/l1/s02',
              beats: [unitBeat],
            },
          ],
        },
      ],
    };
    const sectionState = {
      ...initialState(),
      board: { items: [boardItem] },
    };
    const afterSection = step(sectionState, { script: sectionScript }).state;
    expect(afterSection.cursor.unit).toBe(1);
    expect(afterSection.board.items).toEqual([boardItem]);

    const lessonScript: Script = {
      ...script,
      lessons: [
        { ...firstLesson, units: [{ ...firstUnit, beats: [unitBeat] }] },
        {
          ...firstLesson,
          id: 'stage1/l2',
          units: [{ ...firstUnit, id: 'stage1/l2/s01', beats: [unitBeat] }],
        },
      ],
    };
    const afterLesson = step(sectionState, { script: lessonScript }).state;
    expect(afterLesson.cursor.lesson).toBe(1);
    expect(afterLesson.board.items).toEqual([]);
  });

  it('clears the board deterministically', () => {
    const occupied = {
      ...initialState(),
      board: {
        items: [{ math: 'math/x', kind: 'eq' as const, pinned: false }],
      },
    };
    const { state } = applyCommands(occupied, [{ cmd: 'board', op: 'clear' }]);
    expect(state.board.items).toEqual([]);
    expect(occupied.board.items).toHaveLength(1);
  });
});

describe('pure story core', () => {
  it('splits long prose at sentence boundaries and preserves formula atoms', () => {
    const beat = {
      ...firstBeat,
      blocks: [
        {
          kind: 'p' as const,
          inline: [
            { t: 'text' as const, text: '甲'.repeat(85) },
            { t: 'math' as const, math: 'math/x' },
            { t: 'text' as const, text: '乙乙乙乙乙乙乙乙乙乙。' },
          ],
        },
      ],
    };
    const pages = paginateBeat(beat, 90);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(
      pages
        .flatMap((page) => page.blocks)
        .flatMap((block) => (block.kind === 'p' ? block.inline : []))
        .filter((item) => item.t === 'math'),
    ).toHaveLength(1);
  });

  it('keeps spoken turns shorter than narration', () => {
    const text = '甲乙丙丁戊己庚辛壬癸'.repeat(8);
    const turn = {
      ...firstBeat,
      blocks: [{ kind: 'p' as const, inline: [{ t: 'text' as const, text }] }],
    };
    const narration = {
      ...secondBeat,
      blocks: [{ kind: 'p' as const, inline: [{ t: 'text' as const, text }] }],
    };
    expect(paginateBeat(turn).length).toBeGreaterThan(
      paginateBeat(narration).length,
    );
  });

  it('breaks the page at a block-level formula', () => {
    const beat = {
      ...firstBeat,
      blocks: [
        {
          kind: 'p' as const,
          inline: [{ t: 'text' as const, text: '先讲前一半。' }],
        },
        { kind: 'eq' as const, math: 'math/x' },
        {
          kind: 'p' as const,
          inline: [{ t: 'text' as const, text: '再讲后一半。' }],
        },
      ],
    };
    const pages = paginateBeat(beat);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.board).toEqual([{ math: 'math/x', kind: 'eq' }]);
    expect(JSON.stringify(pages[1]?.blocks)).toContain('再讲后一半');
  });

  it('advances deterministically and supports one-step rollback', () => {
    const first = initialState();
    const next = step(first, { script }).state;
    expect(next.cursor.beat).toBe(1);
    const restored = previous(next, script);
    expect(restored.cursor).toEqual(first.cursor);
    expect(restored.read).toContain('stage1/l1/s01#0000');
  });

  it('shows formulas after page completion and at the start of a page', () => {
    const withBoard: Script = {
      ...script,
      lessons: [
        {
          ...firstLesson,
          units: [
            {
              ...firstUnit,
              beats: [
                {
                  ...firstBeat,
                  blocks: [
                    { kind: 'p', inline: [{ t: 'text', text: '先讲文字。' }] },
                    { kind: 'eq', math: 'math/equation' },
                  ],
                },
                secondBeat,
              ],
            },
          ],
        },
      ],
    };
    const first = initialState();
    expect(completeCurrentPage(first, withBoard).board.items).toEqual([
      { math: 'math/equation', kind: 'eq', pinned: false },
    ]);
    expect(step(first, { script: withBoard }).state.board.items).toHaveLength(
      1,
    );

    const startsWithEquation: Script = {
      ...script,
      lessons: [
        {
          ...firstLesson,
          units: [
            {
              ...firstUnit,
              beats: [
                {
                  ...firstBeat,
                  blocks: [
                    { kind: 'eq', math: 'math/at-start' },
                    {
                      kind: 'p',
                      inline: [{ t: 'text', text: '从板书开始。' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      enterCurrentPage(initialState(), startsWithEquation).board.items,
    ).toEqual([{ math: 'math/at-start', kind: 'eq', pinned: false }]);
  });
});
