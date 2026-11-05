import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Inline } from '../../schema/ir.js';
import type { PageView } from '../core/pagination.js';

export type MathLibrary = Record<
  string,
  { svg: string; wEm: number; hEm: number; vAlignEm: number; viewBox: string }
>;
/**
 * Board formulas and figures must fit their slot instead of keeping Typst's
 * pt-sized `width`/`height` and `overflow: visible` (which clips in a column).
 */
function bareSvg(svg: string): string {
  return svg
    .replace(/\sstyle="[^"]*"/, '')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(
      '<svg',
      '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"',
    );
}
/**
 * Board math is laid out at its natural em size (bounded by the board font
 * size) and only shrunk when the slot is smaller, so a short formula such as
 * P(x)=0 does not get stretched across the whole blackboard.
 */
function BoardMath({
  value,
}: {
  value: { svg: string; wEm: number; hEm: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => {
      const fontSize =
        Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      const naturalWidth = value.wEm * fontSize;
      const naturalHeight = value.hEm * fontSize;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      setScale(Math.min(1, width / naturalWidth, height / naturalHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value.wEm, value.hEm]);
  return (
    <div className="board-block" ref={host}>
      <div
        className="board-math"
        style={{
          width: `${value.wEm * scale}em`,
          height: `${value.hEm * scale}em`,
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: only sanitized, build-generated Typst SVG is rendered; this is never player-supplied HTML.
        dangerouslySetInnerHTML={{ __html: bareSvg(value.svg) }}
      />
    </div>
  );
}
function inlineIdentity(item: Inline): string {
  if (item.t === 'text') return `text:${item.text}`;
  if (item.t === 'math') return `math:${item.math}`;
  if (item.t === 'ruby') return `ruby:${item.base}:${item.rt}`;
  return `strong:${item.children.map(inlineIdentity).join('|')}`;
}
function stableKeys<T>(items: T[], identity: (item: T) => string) {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const base = identity(item);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return { item, key: `${base}:${count}` };
  });
}
function blockIdentity(block: Block): string {
  if (block.kind === 'p')
    return `p:${block.inline.map(inlineIdentity).join('|')}`;
  if (block.kind === 'list')
    return `list:${block.items.map((row) => row.map(inlineIdentity).join('|')).join(';')}`;
  return `${block.kind}:${block.math}`;
}
function inlineLength(items: Inline[]): number {
  return items.reduce((total, item) => {
    if (item.t === 'text') return total + [...graphemes(item.text)].length;
    if (item.t === 'strong') return total + inlineLength(item.children);
    return total + 1;
  }, 0);
}
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return [
      ...new Intl.Segmenter('zh-Hans', { granularity: 'grapheme' }).segment(
        text,
      ),
    ].map((part) => part.segment);
  }
  return Array.from(text);
}
function pageLength(page: PageView): number {
  return page.blocks.reduce((total, block) => {
    if (block.kind === 'p') return total + inlineLength(block.inline);
    if (block.kind === 'list')
      return (
        total + block.items.reduce((sum, row) => sum + inlineLength(row), 0)
      );
    return total;
  }, 0);
}
function blockLength(block: Block): number {
  if (block.kind === 'p') return inlineLength(block.inline);
  if (block.kind === 'list')
    return block.items.reduce((sum, row) => sum + inlineLength(row), 0);
  return 0;
}

function InlineContent({
  items,
  math,
  revealed,
  startAt,
}: {
  items: Inline[];
  math: MathLibrary;
  revealed: number;
  startAt: number;
}) {
  let offset = startAt;
  return (
    <>
      {stableKeys(items, inlineIdentity).map(({ item, key }) => {
        if (item.t === 'text') {
          const segments = graphemes(item.text);
          const start = offset;
          offset += segments.length;
          return (
            <span key={key}>
              {segments
                .slice(
                  0,
                  Math.max(0, Math.min(segments.length, revealed - start)),
                )
                .join('')}
            </span>
          );
        }
        if (item.t === 'ruby') {
          const start = offset;
          offset += 1;
          if (revealed <= start) return <span key={key} />;
          return (
            <ruby key={key}>
              {item.base}
              <rt>{item.rt}</rt>
            </ruby>
          );
        }
        if (item.t === 'strong') {
          const start = offset;
          offset += inlineLength(item.children);
          return (
            <strong key={key}>
              <InlineContent
                items={item.children}
                math={math}
                revealed={revealed}
                startAt={start}
              />
            </strong>
          );
        }
        const start = offset;
        offset += 1;
        if (revealed <= start) return <span key={key} />;
        const value = math[item.math];
        if (!value)
          return (
            <span className="math-missing" key={key}>
              [公式缺失]
            </span>
          );
        return (
          <span
            className="math-inline"
            key={key}
            style={{
              width: `${value.wEm}em`,
              height: `${value.hEm}em`,
              verticalAlign: `${-value.vAlignEm}em`,
            }}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: this SVG is generated from trusted book content and sanitized by the build pipeline; player input never enters it.
            dangerouslySetInnerHTML={{ __html: value.svg }}
          />
        );
      })}
    </>
  );
}
function BlockContent({ block, math }: { block: Block; math: MathLibrary }) {
  if (block.kind === 'p')
    return (
      <p>
        <InlineContent
          items={block.inline}
          math={math}
          revealed={Number.POSITIVE_INFINITY}
          startAt={0}
        />
      </p>
    );
  if (block.kind === 'list')
    return (
      <ul>
        {stableKeys(block.items, (row) =>
          row.map(inlineIdentity).join('|'),
        ).map(({ item, key }) => (
          <li key={key}>
            <InlineContent
              items={item}
              math={math}
              revealed={Number.POSITIVE_INFINITY}
              startAt={0}
            />
          </li>
        ))}
      </ul>
    );
  const value = math[block.math];
  return value ? (
    <BoardMath value={value} />
  ) : (
    <div className="math-missing">[板书公式缺失]</div>
  );
}
export function TextContent({
  page,
  math,
  speed = 0,
  forceComplete = false,
  onTypingChange,
}: {
  page: PageView;
  math: MathLibrary;
  speed?: number;
  forceComplete?: boolean;
  onTypingChange?: (typing: boolean) => void;
}) {
  const total = useMemo(() => pageLength(page), [page]);
  const blockStarts = useMemo(() => {
    let offset = 0;
    return page.blocks.map((block) => {
      const start = offset;
      offset += blockLength(block);
      return start;
    });
  }, [page]);
  const [revealed, setRevealed] = useState(speed > 0 ? 0 : total);
  useEffect(() => {
    setRevealed(speed > 0 ? 0 : total);
  }, [speed, total]);
  useEffect(() => {
    if (forceComplete || speed <= 0) {
      setRevealed(total);
      onTypingChange?.(false);
      return;
    }
    if (revealed >= total) {
      onTypingChange?.(false);
      return;
    }
    onTypingChange?.(true);
    const timer = window.setTimeout(
      () => setRevealed((count) => Math.min(total, count + 1)),
      speed,
    );
    return () => window.clearTimeout(timer);
  }, [forceComplete, onTypingChange, revealed, speed, total]);
  return (
    <div className="page-content">
      {stableKeys(page.blocks, blockIdentity).map(
        ({ item, key }, blockIndex) => {
          const startAt = blockStarts[blockIndex] ?? 0;
          if (item.kind === 'p')
            return (
              <p key={key}>
                <InlineContent
                  items={item.inline}
                  math={math}
                  revealed={revealed}
                  startAt={startAt}
                />
              </p>
            );
          if (item.kind === 'list') {
            let rowOffset = startAt;
            return (
              <ul key={key}>
                {stableKeys(item.items, (row) =>
                  row.map(inlineIdentity).join('|'),
                ).map(({ item: row, key: rowKey }) => {
                  const rowStart = rowOffset;
                  rowOffset += inlineLength(row);
                  return (
                    <li key={rowKey}>
                      <InlineContent
                        items={row}
                        math={math}
                        revealed={revealed}
                        startAt={rowStart}
                      />
                    </li>
                  );
                })}
              </ul>
            );
          }
          return <BlockContent key={key} block={item} math={math} />;
        },
      )}
    </div>
  );
}
