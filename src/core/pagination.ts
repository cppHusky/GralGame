import type { Beat, Block, Inline } from '../../schema/ir.js';

export interface PageView {
  blocks: Block[];
  boardAtStart: { math: string; kind: 'eq' | 'fig' }[];
  board: { math: string; kind: 'eq' | 'fig' }[];
}

/** Turns read as spoken lines, so they get shorter pages than narration. */
const TURN_LIMIT = 58;

function weight(item: Inline): number {
  if (item.t === 'text') return [...item.text].length;
  if (item.t === 'math') return 2;
  if (item.t === 'ruby') return [...item.base].length;
  return item.children.reduce((count, child) => count + weight(child), 0);
}

function splitInline(inline: Inline[], max: number): Inline[][] {
  const chunks: Inline[][] = [];
  let chunk: Inline[] = [];
  let count = 0;
  const flush = () => {
    if (chunk.length) chunks.push(chunk);
    chunk = [];
    count = 0;
  };
  for (const item of inline) {
    if (item.t !== 'text') {
      const size = weight(item);
      if (count + size > max && chunk.length) flush();
      chunk.push(item);
      count += size;
      continue;
    }
    const sentences =
      item.text.match(/[^。！？…；]+[。！？…；]?|[。！？…；]/gu) ?? [];
    for (const sentence of sentences) {
      const size = [...sentence].length;
      if (count + size > max && chunk.length) flush();
      if (size > max) {
        const chars = [...sentence];
        for (let i = 0; i < chars.length; i += max) {
          const part = chars.slice(i, i + max).join('');
          if (i + max < chars.length) {
            chunk.push({ t: 'text', text: part });
            flush();
          } else {
            chunk.push({ t: 'text', text: part });
            count += [...part].length;
          }
        }
      } else {
        chunk.push({ t: 'text', text: sentence });
        count += size;
      }
    }
  }
  flush();
  return chunks;
}

export function paginateBeat(beat: Beat, max = 90): PageView[] {
  const limit =
    beat.kind === 'turn' ? Math.min(max, TURN_LIMIT) : Math.min(max, 90);
  const pages: PageView[] = [];
  let page: PageView = { blocks: [], boardAtStart: [], board: [] };
  let deferred: PageView['board'] = [];
  const hasText = () =>
    page.blocks.some((block) => block.kind === 'p' || block.kind === 'list');
  const commit = () => {
    if (!page.blocks.length && !page.board.length && !page.boardAtStart.length)
      return;
    pages.push(page);
    page = { blocks: [], boardAtStart: [], board: [] };
  };
  for (const block of beat.blocks) {
    if (block.kind === 'p') {
      const chunks = splitInline(block.inline, limit);
      for (const chunk of chunks) {
        if (
          page.blocks.length &&
          weightPage(page) +
            chunk.reduce((sum, item) => sum + weight(item), 0) >
            limit
        )
          commit();
        if (deferred.length) {
          page.boardAtStart.push(...deferred);
          deferred = [];
        }
        page.blocks.push({ kind: 'p', inline: chunk });
        if (chunks.length > 1 && chunk !== chunks.at(-1)) commit();
      }
    } else if (block.kind === 'list') {
      if (page.blocks.length && weightPage(page) >= limit) commit();
      if (deferred.length) {
        page.boardAtStart.push(...deferred);
        deferred = [];
      }
      page.blocks.push(block);
    } else {
      const entry = { math: block.math, kind: block.kind };
      if (hasText()) {
        // Break the dialogue at the block-level formula: the current page ends
        // with the board update, and the rest of the sentence starts a new page.
        page.board.push(entry);
        commit();
      } else {
        deferred.push(entry);
      }
    }
  }
  if (deferred.length) page.boardAtStart.push(...deferred);
  commit();
  return pages.length ? pages : [{ blocks: [], boardAtStart: [], board: [] }];
}

function weightPage(page: PageView): number {
  return page.blocks.reduce(
    (sum, block) =>
      sum +
      (block.kind === 'p'
        ? block.inline.reduce((n, item) => n + weight(item), 0)
        : block.kind === 'list'
          ? block.items.reduce(
              (n, row) => n + row.reduce((m, item) => m + weight(item), 0),
              0,
            )
          : 0),
    0,
  );
}
