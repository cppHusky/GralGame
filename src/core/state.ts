import type { Beat, Script } from '../../schema/ir.js';
import type { PageView } from './pagination.js';
import { paginateBeat } from './pagination.js';

export interface GameState {
  schema: 1;
  cursor: { lesson: number; unit: number; beat: number; page: number };
  stage: {
    bg?: string;
    sprites: Record<
      string,
      { char: string; expr: string; slot: string; dim: boolean }
    >;
  };
  board: { items: { math: string; kind: 'eq' | 'fig'; pinned: boolean }[] };
  flags: Record<string, boolean | number | string>;
  read: string[];
  mode: 'normal' | 'auto' | 'skip';
}
export type Effect =
  | { t: 'text'; page: PageView; beat: Beat }
  | { t: 'board'; items: GameState['board']['items'] }
  | { t: 'bg'; id: string }
  | { t: 'sprite'; char: string }
  | { t: 'bgm'; id: string; fade?: number; volume?: number }
  | { t: 'se'; id: string; volume?: number }
  | { t: 'card'; kind: 'location' | 'title' | 'chapter'; text: string }
  | { t: 'fx'; kind: 'shake' | 'flash' | 'vignette' | 'blur'; ms: number }
  | { t: 'wait'; ms: number };
export interface StepContext {
  script: Script;
}

export function initialState(): GameState {
  return {
    schema: 1,
    cursor: { lesson: 0, unit: 0, beat: 0, page: 0 },
    stage: { bg: 'classroom_wide', sprites: {} },
    board: { items: [] },
    flags: {},
    read: [],
    mode: 'normal',
  };
}

export function currentBeat(
  state: GameState,
  script: Script,
): Beat | undefined {
  return script.lessons[state.cursor.lesson]?.units[state.cursor.unit]?.beats[
    state.cursor.beat
  ];
}
export function currentPage(
  state: GameState,
  script: Script,
): PageView | undefined {
  const beat = currentBeat(state, script);
  return beat ? paginateBeat(beat)[state.cursor.page] : undefined;
}

const MAX_BOARD_EQUATIONS = 2;

function appendBoard(state: GameState, items: PageView['board']): GameState {
  if (!items.length) return state;
  const known = new Set(
    state.board.items.map((item) => `${item.kind}:${item.math}`),
  );
  const additions = items
    .filter((item) => !known.has(`${item.kind}:${item.math}`))
    .map((item) => ({ ...item, pinned: false }));
  if (!additions.length) return state;
  const combined = [...state.board.items, ...additions];
  // Old work stays on the board until space is actually needed for new work:
  // keep the two most recent equations (trimmed oldest-first) and one figure.
  const equations = combined.filter((item) => item.kind === 'eq');
  const figures = combined.filter((item) => item.kind === 'fig');
  const kept = new Set([
    ...equations.slice(-MAX_BOARD_EQUATIONS),
    ...figures.slice(-1),
  ]);
  return {
    ...state,
    board: { items: combined.filter((item) => kept.has(item)) },
  };
}

export function enterCurrentPage(state: GameState, script: Script): GameState {
  const page = currentPage(state, script);
  return page ? appendBoard(state, page.boardAtStart) : state;
}

export function completeCurrentPage(
  state: GameState,
  script: Script,
): GameState {
  const page = currentPage(state, script);
  return page ? appendBoard(state, page.board) : state;
}

export function step(
  state: GameState,
  { script }: StepContext,
): { state: GameState; effects: Effect[] } {
  const lesson = script.lessons[state.cursor.lesson];
  const unit = lesson?.units[state.cursor.unit];
  const beat = unit?.beats[state.cursor.beat];
  if (!lesson || !unit || !beat) return { state, effects: [] };
  const completedState = completeCurrentPage(state, script);
  const pages = paginateBeat(beat);
  if (state.cursor.page + 1 < pages.length) {
    const pageIndex = state.cursor.page + 1;
    const page = pages[pageIndex];
    if (!page) return { state, effects: [] };
    const next = enterCurrentPage(
      {
        ...completedState,
        cursor: { ...state.cursor, page: pageIndex },
        read: state.read.includes(beat.id)
          ? state.read
          : [...state.read, beat.id],
      },
      script,
    );
    return {
      state: next,
      effects: [
        { t: 'text', page, beat },
        ...(next.board.items !== state.board.items
          ? [{ t: 'board' as const, items: next.board.items }]
          : []),
      ],
    };
  }
  let lessonIndex = state.cursor.lesson;
  let unitIndex = state.cursor.unit;
  let beatIndex = state.cursor.beat + 1;
  let nextUnit = lesson.units[unitIndex];
  if (beatIndex >= (nextUnit?.beats.length ?? 0)) {
    unitIndex += 1;
    beatIndex = 0;
    nextUnit = lesson.units[unitIndex];
  }
  if (!nextUnit && script.lessons[lessonIndex + 1]) {
    lessonIndex += 1;
    unitIndex = 0;
    beatIndex = 0;
    nextUnit = script.lessons[lessonIndex]?.units[unitIndex];
  }
  if (!nextUnit)
    return {
      state: {
        ...completedState,
        read: state.read.includes(beat.id)
          ? state.read
          : [...state.read, beat.id],
      },
      effects: [],
    };
  const nextBeat = nextUnit.beats[beatIndex];
  if (!nextBeat) return { state, effects: [] };
  const page = paginateBeat(nextBeat)[0];
  if (!page) return { state, effects: [] };
  // A new section keeps the previous derivation; a new lesson is a scene break
  // (with its own intermission), so the board starts clean.
  const clearsBoard = lessonIndex !== state.cursor.lesson;
  const boardBase = clearsBoard
    ? { ...completedState, board: { items: [] } }
    : completedState;
  const next = enterCurrentPage(
    {
      ...boardBase,
      cursor: {
        lesson: lessonIndex,
        unit: unitIndex,
        beat: beatIndex,
        page: 0,
      },
      read: state.read.includes(beat.id)
        ? state.read
        : [...state.read, beat.id],
    },
    script,
  );
  return {
    state: next,
    effects: [
      { t: 'text', page, beat: nextBeat },
      ...(clearsBoard || next.board.items !== state.board.items
        ? [{ t: 'board' as const, items: next.board.items }]
        : []),
    ],
  };
}

export function previous(state: GameState, script: Script): GameState {
  if (state.cursor.page > 0)
    return {
      ...state,
      cursor: { ...state.cursor, page: state.cursor.page - 1 },
    };
  let lesson = state.cursor.lesson;
  let unit = state.cursor.unit;
  let beat = state.cursor.beat - 1;
  if (beat < 0) {
    unit -= 1;
    beat = script.lessons[lesson]?.units[unit]?.beats.length ?? -1;
    beat -= 1;
  }
  if (unit < 0) {
    lesson -= 1;
    unit = (script.lessons[lesson]?.units.length ?? 0) - 1;
    beat = (script.lessons[lesson]?.units[unit]?.beats.length ?? 0) - 1;
  }
  if (lesson < 0 || beat < 0) return state;
  const beatData = script.lessons[lesson]?.units[unit]?.beats[beat];
  const page = beatData ? paginateBeat(beatData).length - 1 : 0;
  return { ...state, cursor: { lesson, unit, beat, page } };
}
