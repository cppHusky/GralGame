import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type { Beat } from '../../schema/ir.js';
import type { MathLibrary } from './TextContent.js';
import { TextContent } from './TextContent.js';

const speakerNames: Record<string, string> = {
  'yan-pei': '严佩',
  'wen-shu': '温舒',
  'ming-zhu': '明烛',
  'yang-bing': '杨秉',
  'niu-hong': '牛弘',
  'wei-he': '魏荷',
  'li-qing': '李清',
  'ji-qie': '吉锲',
  'shi-shu': '史姝',
  'zhao-chao': '赵超',
  'lv-shun': '吕顺',
  'xiao-lv': '肖虑',
  'shi-ren': '施仁',
  'zhan-yong': '展庸',
  'dou-fa': '窦法',
  'zhu-yi': '朱异',
  'wan-lai': '万籁',
  'zhan-bu': '詹布',
  'bian-yuan': '卞苑',
  'zhang-ju': '章拒',
  'jin-li': '金缡',
  'shi-shen': '石绅',
  'tan-pai': '谭派',
  'xu-nuo': '许诺',
  'sui-xin': '隋欣',
  'du-zhuan': '杜颛',
  'shen-si': '沈嗣',
  'zong-yan': '宗延',
  'liu-jin': '刘津',
  'wang-ji': '王霁',
  'hao-qi': '郝祺',
  'di-que': '狄雀',
  'you-qi': '游栖',
  'wu-yu': '吴郁',
};

export function Backlog({ beats, math }: { beats: Beat[]; math: MathLibrary }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: beats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 104,
    getItemKey: (index) => beats[index]?.id ?? index,
    overscan: 5,
  });
  return (
    <div ref={scrollRef} className="log-list" role="log" aria-label="已读对白">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const beat = beats[row.index];
          if (!beat) return null;
          return (
            <article
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="log-entry"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              <b>
                {beat.kind === 'turn'
                  ? (speakerNames[beat.speaker] ?? beat.speaker)
                  : '旁白'}
              </b>
              <TextContent
                page={{ blocks: beat.blocks, boardAtStart: [], board: [] }}
                math={math}
              />
            </article>
          );
        })}
      </div>
      {!beats.length && (
        <p className="muted">推进剧情后，这里会记录已经读过的对白。</p>
      )}
    </div>
  );
}
