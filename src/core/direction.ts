import type { z } from 'zod';
import type { directionSchema } from '../../schema/direction.js';
import type { Effect, GameState } from './state.js';

export type Direction = z.infer<typeof directionSchema>;
export type DirectionCommand = Direction['cues'][number]['do'][number];

export function indexDirections(
  directions: Direction[],
): Map<string, Direction> {
  const index = new Map<string, Direction>();
  for (const direction of directions) {
    if (index.has(direction.unit))
      throw new Error(`演出层重复定义单元：${direction.unit}`);
    index.set(direction.unit, direction);
  }
  return index;
}

export function commandsFor(
  direction: Direction | undefined,
  beatId: string,
): DirectionCommand[] {
  return (
    direction?.cues
      .filter((cue) => cue.at.id === beatId)
      .flatMap((cue) => cue.do) ?? []
  );
}

export function defaultCommands(
  direction: Direction | undefined,
): DirectionCommand[] {
  const commands: DirectionCommand[] = [];
  if (direction?.defaults?.bg)
    commands.push({ cmd: 'bg', id: direction.defaults.bg });
  if (direction?.defaults?.bgm)
    commands.push({ cmd: 'bgm', id: direction.defaults.bgm });
  return commands;
}

/**
 * Apply staging commands to a game state. Pure: identical input yields
 * identical state and effects, so saves and rollback stay deterministic.
 */
export function applyCommands(
  state: GameState,
  commands: DirectionCommand[],
): { state: GameState; effects: Effect[] } {
  let next = state;
  const effects: Effect[] = [];
  for (const command of commands) {
    switch (command.cmd) {
      case 'bg':
        next = { ...next, stage: { ...next.stage, bg: command.id } };
        effects.push({ t: 'bg', id: command.id });
        break;
      case 'show':
        next = {
          ...next,
          stage: {
            ...next.stage,
            sprites: {
              ...next.stage.sprites,
              [command.char]: {
                char: command.char,
                expr: command.expr,
                slot: command.slot,
                dim: false,
              },
            },
          },
        };
        effects.push({ t: 'sprite', char: command.char });
        break;
      case 'expr': {
        const existing = next.stage.sprites[command.char];
        if (!existing) {
          next = {
            ...next,
            stage: {
              ...next.stage,
              sprites: {
                ...next.stage.sprites,
                [command.char]: {
                  char: command.char,
                  expr: command.expr,
                  slot: 'center',
                  dim: false,
                },
              },
            },
          };
        } else {
          next = {
            ...next,
            stage: {
              ...next.stage,
              sprites: {
                ...next.stage.sprites,
                [command.char]: { ...existing, expr: command.expr },
              },
            },
          };
        }
        effects.push({ t: 'sprite', char: command.char });
        break;
      }
      case 'move': {
        const existing = next.stage.sprites[command.char];
        if (existing)
          next = {
            ...next,
            stage: {
              ...next.stage,
              sprites: {
                ...next.stage.sprites,
                [command.char]: { ...existing, slot: command.slot },
              },
            },
          };
        break;
      }
      case 'hide': {
        if (!(command.char in next.stage.sprites)) break;
        const sprites = { ...next.stage.sprites };
        delete sprites[command.char];
        next = { ...next, stage: { ...next.stage, sprites } };
        effects.push({ t: 'sprite', char: command.char });
        break;
      }
      case 'board':
        if (command.op === 'clear') next = { ...next, board: { items: [] } };
        effects.push({ t: 'board', items: next.board.items });
        break;
      case 'set':
        next = {
          ...next,
          flags: { ...next.flags, [command.flag]: command.value },
        };
        break;
      case 'bgm':
        effects.push({
          t: 'bgm',
          id: command.id,
          fade: command.fade,
          volume: command.volume,
        });
        break;
      case 'se':
        effects.push({ t: 'se', id: command.id, volume: command.volume });
        break;
      case 'card':
        effects.push({ t: 'card', kind: command.kind, text: command.text });
        break;
      case 'fx':
        effects.push({ t: 'fx', kind: command.kind, ms: command.ms });
        break;
      case 'wait':
        effects.push({ t: 'wait', ms: command.ms });
        break;
    }
  }
  return { state: next, effects };
}
