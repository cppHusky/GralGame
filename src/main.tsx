import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parse as parseYaml } from 'yaml';
import manifestText from '../assets/manifest.yaml?raw';
import { directionSchema } from '../schema/direction.js';
import type { Script } from '../schema/ir.js';
import { saveSchema } from '../schema/save.js';
import {
  applyCommands,
  commandsFor,
  defaultCommands,
  indexDirections,
} from './core/direction.js';
import {
  completeCurrentPage,
  currentBeat,
  currentPage,
  type Effect,
  enterCurrentPage,
  type GameState,
  initialState,
  step,
} from './core/state.js';
import { audio } from './platform/audio.js';
import {
  loadSettings,
  type Settings,
  saveStorage,
  storeSettings,
} from './platform/storage.js';
import { Backlog } from './ui/Backlog.js';
import { type RuntimeAsset, Stage } from './ui/Stage.js';
import { type MathLibrary, TextContent } from './ui/TextContent.js';
import './style.css';

type Panel = 'menu' | 'saves' | 'settings' | 'log' | 'chapters' | null;
const emptyMath: MathLibrary = {};
const runtimeAssets = parseYaml(manifestText) as RuntimeAsset[];
const directionFiles = import.meta.glob('../data/direction/stage1/**/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const directions = indexDirections(
  Object.values(directionFiles).map((text) =>
    directionSchema.parse(parseYaml(text)),
  ),
);
function unitOf(
  script: Script | undefined,
  state: GameState,
): string | undefined {
  return script?.lessons[state.cursor.lesson]?.units[state.cursor.unit]?.id;
}
const characterDisplayNames: Record<string, string> = {
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
function App() {
  const [script, setScript] = useState<Script>();
  const [math, setMath] = useState<MathLibrary>(emptyMath);
  const [glyphs, setGlyphs] = useState('');
  const [loadError, setLoadError] = useState('');
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<GameState>(initialState);
  const [history, setHistory] = useState<GameState[]>([]);
  const [backlog, setBacklog] = useState<import('../schema/ir.js').Beat[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [slots, setSlots] = useState<
    Awaited<ReturnType<typeof saveStorage.list>>
  >([]);
  const [complete, setComplete] = useState(false);
  const [typing, setTyping] = useState(false);
  const [finishText, setFinishText] = useState(false);
  const [card, setCard] = useState<
    Extract<Effect, { t: 'card' }> | undefined
  >();
  const [fx, setFx] = useState<Extract<Effect, { t: 'fx' }> | undefined>();
  const [intermission, setIntermission] = useState<{
    from?: string;
    to: string;
  } | null>(null);
  const beat = useMemo(
    () => (script ? currentBeat(state, script) : undefined),
    [script, state],
  );
  const page = useMemo(
    () => (script ? currentPage(state, script) : undefined),
    [script, state],
  );
  const characterNames = useMemo(
    () => new Map(Object.entries(characterDisplayNames)),
    [],
  );

  useEffect(() => {
    Promise.all([
      fetch('/generated/script/stage1.ir.json').then((response) => {
        if (!response.ok) throw new Error('脚本还没有生成');
        return response.json() as Promise<Script>;
      }),
      fetch('/generated/math/stage1.json').then((response) =>
        response.ok ? (response.json() as Promise<MathLibrary>) : emptyMath,
      ),
      fetch('/generated/math/glyphs.svg').then((response) =>
        response.ok ? response.text() : '',
      ),
    ])
      .then(([data, formulas, glyphSource]) => {
        setScript(data);
        setMath(formulas);
        setGlyphs(glyphSource);
        // Development-only deep link for reviewing a section's staging.
        const params = import.meta.env.DEV
          ? new URLSearchParams(window.location.search)
          : null;
        const requested = params?.get('unit') ?? null;
        if (requested) {
          const lessonIndex = data.lessons.findIndex((lesson) =>
            lesson.units.some((unit) => unit.id === requested),
          );
          const lesson = data.lessons[lessonIndex];
          const unitIndex =
            lesson?.units.findIndex((unit) => unit.id === requested) ?? -1;
          const unit = lesson?.units[unitIndex];
          const beatIndex = Math.min(
            Number(params?.get('beat') ?? 0) || 0,
            Math.max(0, (unit?.beats.length ?? 1) - 1),
          );
          const first = unit?.beats[beatIndex];
          if (lesson && unitIndex >= 0 && first) {
            const direction = directions.get(requested ?? '');
            const base: GameState = {
              ...initialState(),
              cursor: {
                lesson: lessonIndex,
                unit: unitIndex,
                beat: beatIndex,
                page: 0,
              },
            };
            let staged = applyCommands(base, defaultCommands(direction)).state;
            // Replay earlier staging so the deep link lands on the same
            // background, cast and expressions as normal play.
            for (const earlier of unit.beats.slice(0, beatIndex + 1))
              staged = applyCommands(
                staged,
                commandsFor(direction, earlier.id),
              ).state;
            setState({
              ...staged,
              cursor: {
                lesson: lessonIndex,
                unit: unitIndex,
                beat: beatIndex,
                page: 0,
              },
            });
            setStarted(true);
          }
        }
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : '脚本读取失败'),
      );
  }, []);

  useEffect(() => {
    storeSettings(settings);
    audio.setVolumes(settings);
  }, [settings]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      settings.reducedMotion,
    );
  }, [settings.reducedMotion]);
  useEffect(() => {
    let active = true;
    void saveStorage
      .list()
      .then((records) => {
        if (active) setSlots(records);
      })
      .catch((error: unknown) => {
        console.warn('本地存档不可用；游戏仍可继续。', error);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!started || !script) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(JSON.stringify(script)),
          );
          if (cancelled) return;
          const scriptHash = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
          await saveStorage.put({
            slot: 'auto',
            savedAt: new Date().toISOString(),
            state,
            scriptHash,
            bookCommit: script.bookCommit,
          });
          setSlots(await saveStorage.list());
        } catch (error) {
          console.warn('自动存档暂不可用：', error);
        }
      })();
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [started, script, state]);
  useEffect(() => {
    if (!script || !page?.boardAtStart.length) return;
    setState((previousState) => enterCurrentPage(previousState, script));
  }, [script, page]);

  const onTypingChange = useCallback(
    (isTyping: boolean) => {
      setTyping(isTyping);
      if (!isTyping && script && beat) {
        setState((current) => {
          if (
            currentBeat(current, script)?.id !== beat.id ||
            current.cursor.page !== state.cursor.page
          )
            return current;
          return completeCurrentPage(current, script);
        });
      }
    },
    [script, beat, state.cursor.page],
  );

  const runEffects = useCallback((effects: Effect[]) => {
    for (const effect of effects) {
      if (effect.t === 'se') audio.playEffect(effect.id);
      else if (effect.t === 'bgm')
        audio.setBgm(effect.id === 'stop' ? undefined : effect.id);
      else if (effect.t === 'card') {
        setCard(effect);
        window.setTimeout(() => setCard(undefined), 2600);
      } else if (effect.t === 'fx') {
        setFx(effect);
        window.setTimeout(() => setFx(undefined), effect.ms);
      }
    }
  }, []);

  const direct = useCallback(
    (base: GameState, unitChanged = false) => {
      if (!script) return { state: base, effects: [] as Effect[] };
      // A new section is a new scene: drop whoever was on stage before the
      // section's own cues decide the cast.
      const staged = unitChanged
        ? { ...base, stage: { ...base.stage, sprites: {} } }
        : base;
      const unitId = unitOf(script, base);
      const direction = unitId ? directions.get(unitId) : undefined;
      const target = currentBeat(base, script);
      const commands = [
        ...(unitChanged ? defaultCommands(direction) : []),
        ...(target ? commandsFor(direction, target.id) : []),
      ];
      return applyCommands(staged, commands);
    },
    [script],
  );

  const advance = useCallback(() => {
    if (intermission) return;
    if (typing) {
      setFinishText(true);
      return;
    }
    if (!script) return;
    const current = currentBeat(state, script);
    const currentPageView = currentPage(state, script);
    if (
      current &&
      currentPageView &&
      !backlog.some((entry) => entry.id === current.id)
    )
      setBacklog((items) => [...items, current]);
    const result = step(state, { script });
    const unitChanged =
      result.state.cursor.lesson !== state.cursor.lesson ||
      result.state.cursor.unit !== state.cursor.unit;
    const staged = direct(result.state, unitChanged);
    if (!result.effects.length) {
      if (staged.state !== state) {
        setHistory((items) => [...items.slice(-199), state]);
        setState(staged.state);
        runEffects(staged.effects);
      }
      setComplete(true);
      return;
    }
    setHistory((items) => [...items.slice(-199), state]);
    setState(staged.state);
    runEffects([...result.effects, ...staged.effects]);
    setFinishText(false);
    if (result.state.cursor.lesson !== state.cursor.lesson)
      setIntermission({
        from: script.lessons[state.cursor.lesson]?.title,
        to: script.lessons[result.state.cursor.lesson]?.title ?? '',
      });
    audio.play('advance');
  }, [script, state, backlog, typing, direct, runEffects, intermission]);

  useEffect(() => {
    if (!intermission) return;
    const timer = window.setTimeout(() => setIntermission(null), 4200);
    return () => window.clearTimeout(timer);
  }, [intermission]);

  function beginGame() {
    void audio.activate();
    setStarted(true);
  }
  function startNewGame() {
    const staged = direct(initialState(), true);
    setState(staged.state);
    setHistory([]);
    setBacklog([]);
    setComplete(false);
    runEffects(staged.effects);
    beginGame();
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (intermission) {
        setIntermission(null);
        return;
      }
      if (!started) {
        if (event.key === 'Enter' || event.key === ' ') beginGame();
        return;
      }
      if (event.key === 'Escape') {
        setPanel((current) => (current ? null : 'menu'));
        return;
      }
      if (panel) return;
      if (event.key === 'ArrowLeft') {
        rollback();
        return;
      }
      if (event.key.toLowerCase() === 'a') {
        setState((current) => ({
          ...current,
          mode: current.mode === 'auto' ? 'normal' : 'auto',
        }));
        return;
      }
      if (event.key.toLowerCase() === 'l') {
        setPanel('log');
        return;
      }
      if (event.key.toLowerCase() === 'h') {
        document.body.classList.toggle('hide-ui');
        return;
      }
      if (
        event.key === ' ' ||
        event.key === 'Enter' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
        advance();
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  useEffect(() => {
    if (
      !['auto', 'skip'].includes(state.mode) ||
      !started ||
      panel ||
      complete ||
      intermission
    )
      return;
    if (typing) return;
    const current = script ? currentBeat(state, script) : undefined;
    if (
      state.mode === 'skip' &&
      current &&
      !state.read.includes(current.id) &&
      !settings.skipUnread
    ) {
      setState((currentState) => ({ ...currentState, mode: 'normal' }));
      return;
    }
    const id = window.setTimeout(
      advance,
      state.mode === 'skip' ? 36 : settings.autoDelay,
    );
    return () => window.clearTimeout(id);
  }, [
    state,
    settings.autoDelay,
    settings.skipUnread,
    started,
    panel,
    complete,
    script,
    advance,
    typing,
    intermission,
  ]);

  function rollback() {
    const prior = history.at(-1);
    if (!prior || !script) return;
    setState(prior);
    setHistory((items) => items.slice(0, -1));
    setComplete(false);
  }
  async function refreshSlots() {
    setSlots(await saveStorage.list());
  }
  async function save(slot: string) {
    if (!script) return;
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(script)),
    );
    const scriptHash = [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    await saveStorage.put({
      slot,
      savedAt: new Date().toISOString(),
      state,
      scriptHash,
      bookCommit: script.bookCommit,
    });
    await refreshSlots();
  }
  async function exportSave(slot: string) {
    const record = await saveStorage.get(slot);
    if (!record) return;
    const { slot: _slot, ...payload } = record;
    const blob = new Blob(
      [
        JSON.stringify(
          { format: 'gralgame-save', version: 1, ...payload },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gralgame-${slot}-${record.savedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importSave(file: File) {
    if (!script) return;
    try {
      const imported = saveSchema.parse(JSON.parse(await file.text()));
      if (imported.bookCommit !== script.bookCommit) {
        window.alert('此存档来自不同版本的书稿，暂不支持自动迁移。');
        return;
      }
      const manualSlots = new Set(
        slots
          .filter((row) => row.slot.startsWith('manual-'))
          .map((row) => row.slot),
      );
      const slot =
        Array.from({ length: 6 }, (_, index) => `manual-${index + 1}`).find(
          (candidate) => !manualSlots.has(candidate),
        ) ?? 'manual-1';
      if (
        manualSlots.has(slot) &&
        !window.confirm('手动存档槽已满，是否覆盖 01 槽？')
      )
        return;
      await saveStorage.put({
        slot,
        savedAt: imported.savedAt,
        state: imported.state,
        scriptHash: imported.scriptHash,
        bookCommit: imported.bookCommit,
      });
      await refreshSlots();
      window.alert(`已导入到 ${slot}。`);
    } catch {
      window.alert('存档文件无效或版本不受支持。');
    }
  }
  async function load(slot: string) {
    const record = await saveStorage.get(slot);
    if (!record || !script) return;
    if (record.bookCommit !== script.bookCommit) {
      window.alert('此存档来自不同版本的书稿，暂不支持自动迁移。');
      return;
    }
    const unitId = unitOf(script, record.state);
    const staged = applyCommands(
      record.state,
      defaultCommands(unitId ? directions.get(unitId) : undefined),
    );
    setState(staged.state);
    setHistory([]);
    setBacklog([]);
    runEffects(staged.effects);
    void audio.activate();
    setStarted(true);
    setComplete(false);
    setPanel(null);
  }

  const currentUnit =
    script?.lessons[state.cursor.lesson]?.units[state.cursor.unit];
  const continueSave =
    slots.find((record) => record.slot === 'auto') ?? slots[0];
  const autoSprites = useMemo(() => {
    if (Object.keys(state.stage.sprites).length || !currentUnit)
      return state.stage.sprites;
    const order: string[] = [];
    for (const row of currentUnit.beats.slice(0, state.cursor.beat + 1)) {
      if (row.kind === 'turn' && !order.includes(row.speaker))
        order.push(row.speaker);
    }
    const visible = order.slice(-2);
    const slots = ['center', 'left', 'right'];
    return Object.fromEntries(
      visible.map((char, index) => [
        char,
        {
          char,
          expr: 'neutral',
          slot: slots[index] ?? 'center',
          dim: beat?.kind !== 'turn' || beat.speaker !== char,
        },
      ]),
    );
  }, [state.stage.sprites, state.cursor.beat, currentUnit, beat]);
  const stageScene = {
    background: state.stage.bg ?? 'classroom_wide',
    speaker: started && beat?.kind === 'turn' ? beat.speaker : undefined,
    sprites: started ? autoSprites : {},
  };
  const boardRegion = runtimeAssets.find(
    (asset) => asset.id === `bg/${stageScene.background}`,
  )?.regions?.board;
  const boardFigures = state.board.items
    .filter((item) => item.kind === 'fig')
    .slice(-1);
  const boardEquations = state.board.items
    .filter((item) => item.kind === 'eq')
    .slice(-2);
  const boardStyle = boardRegion
    ? {
        left: `${boardRegion[0] / 19.2}%`,
        top: `${boardRegion[1] / 10.8}%`,
        width: `${boardRegion[2] / 19.2}%`,
        height: `${boardRegion[3] / 10.8}%`,
      }
    : undefined;
  return (
    <main
      className={`game-root${fx ? ` fx-${fx.kind}` : ''}`}
      data-board={boardRegion ? 'yes' : 'no'}
      data-bg={stageScene.background}
      data-cast={Object.keys(state.stage.sprites).join(',')}
    >
      <svg className="glyph-defs" width="0" height="0" aria-hidden="true">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: glyph sprite is generated from the trusted book build, SVG-sanitized, and never contains player input. */}
        <defs dangerouslySetInnerHTML={{ __html: glyphs }} />
      </svg>
      <Stage
        scene={stageScene}
        assets={runtimeAssets}
        showFallbackNotice={started}
        boardLayout={Boolean(boardRegion) && started}
      />
      <div className="letterbox top-letterbox" />
      <div className="stage-glow" />
      {started && page && beat ? (
        <>
          {boardRegion && state.board.items.length > 0 && (
            <section
              className={`blackboard${
                boardFigures.length && boardEquations.length
                  ? ' blackboard--split'
                  : ''
              }`}
              style={boardStyle}
              aria-label="黑板"
            >
              {boardFigures.length > 0 && (
                <div className="board-figures">
                  {boardFigures.map((item) => (
                    <div className="blackboard-item" key={item.math}>
                      <TextContent
                        page={{
                          blocks: [{ kind: 'fig', math: item.math }],
                          boardAtStart: [],
                          board: [],
                        }}
                        math={math}
                      />
                    </div>
                  ))}
                </div>
              )}
              {boardEquations.length > 0 && (
                <div className="board-equations">
                  {boardEquations.map((item) => (
                    <div className="blackboard-item" key={item.math}>
                      <TextContent
                        page={{
                          blocks: [{ kind: 'eq', math: item.math }],
                          boardAtStart: [],
                          board: [],
                        }}
                        math={math}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {beat.kind === 'narration' && beat.location && !card && (
            <div className="location-card" role="status">
              <span>LOCATION</span>
              <b>{beat.location}</b>
            </div>
          )}
          {card && (
            <div className="location-card story-card" role="status">
              <span>{card.kind.toUpperCase()}</span>
              <b>{card.text}</b>
            </div>
          )}
          <button
            type="button"
            className="stage-click-target"
            aria-label="继续"
            onClick={advance}
          />
          <section
            className={`dialogue${beat.kind === 'narration' ? ' narration' : ''}`}
            aria-live="polite"
            aria-atomic="true"
            style={
              {
                '--dialog-color': '#fbfbfb',
                '--font-scale': settings.fontScale,
              } as React.CSSProperties
            }
          >
            <div className="dialogue-meta">
              <span className="speaker">
                {beat.kind === 'turn'
                  ? (characterNames.get(beat.speaker) ?? beat.speaker)
                  : '旁白'}
              </span>
              <span className="unit-title">
                {currentUnit?.title ??
                  script?.lessons[state.cursor.lesson]?.title}
              </span>
            </div>
            <TextContent
              key={`${beat.id}:${state.cursor.page}`}
              page={page}
              math={math}
              speed={state.mode === 'skip' ? 0 : settings.textSpeed}
              forceComplete={finishText}
              onTypingChange={onTypingChange}
            />
          </section>
          <nav className="quick-controls" aria-label="游戏控制">
            <button
              type="button"
              onClick={() => setPanel('menu')}
              title="菜单 (Esc)"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={rollback}
              disabled={!history.length}
              title="回滚 (←)"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => setPanel('log')}
              title="回看 (L)"
            >
              ▤
            </button>
            <button
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  mode: current.mode === 'auto' ? 'normal' : 'auto',
                }))
              }
              title="自动 (A)"
            >
              {state.mode === 'auto' ? 'Ⅱ' : '▶'}
            </button>
            <button type="button" onClick={advance} title="继续 (Space)">
              ⌄
            </button>
          </nav>
        </>
      ) : (
        <section className="title-screen">
          <h1>不定积分解题法</h1>
          <p>来自《积分精选》讲义篇</p>
          {loadError ? (
            <div className="load-warning">
              <strong>脚本文本尚未就绪</strong>
              <span>
                {loadError}。请先安装 Typst 0.15.0 并运行{' '}
                <code>pnpm build:script</code>。
              </span>
            </div>
          ) : (
            <>
              {continueSave && (
                <button
                  type="button"
                  className="start-button continue-button"
                  onClick={() => void load(continueSave.slot)}
                >
                  继续游戏 <span>↗</span>
                </button>
              )}
              <button
                type="button"
                className={continueSave ? 'subtle-button' : 'start-button'}
                onClick={startNewGame}
              >
                {continueSave ? '重新开始' : '开始游戏'}
                {!continueSave && <span>↗</span>}
              </button>
            </>
          )}
          <button
            type="button"
            className="subtle-button"
            onClick={() => setPanel('chapters')}
          >
            章节选择
          </button>
          <div className="version-note">
            <a href="https://github.com/cppHusky/IntegralCollection">GitHub 仓库</a>
          </div>
        </section>
      )}
      {complete && (
        <div className="end-card">
          <span>STAGE 01 · COMPLETE</span>
          <h2>本阶段内容已读完</h2>
          <button
            type="button"
            onClick={() => {
              setStarted(false);
              setComplete(false);
              setState(initialState());
            }}
          >
            返回标题
          </button>
        </div>
      )}
      {intermission && (
        <div
          className="intermission"
          role="dialog"
          aria-modal="true"
          aria-label="幕间"
          onClick={() => setIntermission(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIntermission(null);
            }
          }}
        >
          <div className="intermission-card">
            <span className="eyebrow">INTERMISSION</span>
            <h2>幕间</h2>
            {intermission.from && (
              <p className="muted">{intermission.from}　完</p>
            )}
            <p className="intermission-next">下一课 · {intermission.to}</p>
            <small>点击或按任意键继续</small>
          </div>
        </div>
      )}
      {panel && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="panel-card">
            <button
              type="button"
              className="panel-close"
              onClick={() => setPanel(null)}
              aria-label="关闭"
            >
              ×
            </button>
            {panel === 'menu' && (
              <>
                <span className="eyebrow">SYSTEM MENU</span>
                <h2>暂停一下</h2>
                <div className="menu-grid">
                  <button
                    type="button"
                    onClick={() => {
                      setPanel('saves');
                      void refreshSlots();
                    }}
                  >
                    存档 / 读档
                  </button>
                  <button type="button" onClick={() => setPanel('settings')}>
                    设置
                  </button>
                  <button type="button" onClick={() => setPanel('log')}>
                    回看剧情
                  </button>
                  <button type="button" onClick={() => setPanel('chapters')}>
                    章节选择
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        mode: current.mode === 'skip' ? 'normal' : 'skip',
                      }))
                    }
                  >
                    快进：{state.mode === 'skip' ? '开启' : '关闭'}
                  </button>
                  <button type="button" onClick={() => setStarted(false)}>
                    返回标题
                  </button>
                </div>
              </>
            )}
            {panel === 'settings' && (
              <>
                <span className="eyebrow">PREFERENCES</span>
                <h2>游戏设置</h2>
                <label>
                  文字速度{' '}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.textSpeed}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        textSpeed: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  自动延迟{' '}
                  <input
                    type="range"
                    min="500"
                    max="5000"
                    step="100"
                    value={settings.autoDelay}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        autoDelay: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  文字大小{' '}
                  <input
                    type="range"
                    min="0.85"
                    max="1.3"
                    step="0.05"
                    value={settings.fontScale}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        fontScale: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  总音量{' '}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.masterVolume}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        masterVolume: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  背景音乐{' '}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.bgmVolume}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        bgmVolume: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  音效{' '}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.seVolume}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        seVolume: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={settings.skipUnread}
                    onChange={(e) =>
                      setSettings({ ...settings, skipUnread: e.target.checked })
                    }
                  />{' '}
                  快进未读文本
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        reducedMotion: e.target.checked,
                      })
                    }
                  />{' '}
                  减少动画
                </label>
              </>
            )}
            {panel === 'saves' && (
              <>
                <span className="eyebrow">LOCAL SAVE DATA</span>
                <h2>存档 / 读档</h2>
                <div className="save-grid">
                  {Array.from({ length: 6 }, (_, index) => {
                    const slot = `manual-${index + 1}`;
                    const found = slots.find((item) => item.slot === slot);
                    return (
                      <article className="save-slot" key={slot}>
                        <span>SLOT {String(index + 1).padStart(2, '0')}</span>
                        <p>
                          {found
                            ? new Date(found.savedAt).toLocaleString()
                            : '空存档'}
                        </p>
                        <div>
                          <button type="button" onClick={() => void save(slot)}>
                            保存
                          </button>
                          {found && (
                            <>
                              <button
                                type="button"
                                onClick={() => void load(slot)}
                              >
                                读取
                              </button>
                              <button
                                type="button"
                                onClick={() => void exportSave(slot)}
                              >
                                导出
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void save('auto')}
                >
                  立即更新自动存档
                </button>
                <label className="text-button import-save">
                  导入存档文件
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void importSave(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </>
            )}
            {panel === 'log' && (
              <>
                <span className="eyebrow">STORY LOG</span>
                <h2>回看记录</h2>
                <Backlog beats={backlog} math={math} />
              </>
            )}
            {panel === 'chapters' && (
              <>
                <span className="eyebrow">CHAPTER SELECT</span>
                <h2>章节选择</h2>
                {script?.lessons.map((lesson, index) => {
                  const unlocked = script.lessons
                    .slice(0, index)
                    .every((previousLesson) =>
                      previousLesson.units.every((unit) =>
                        unit.beats.every((row) => state.read.includes(row.id)),
                      ),
                    );
                  return (
                    <button
                      type="button"
                      className="chapter-row"
                      key={lesson.id}
                      disabled={!unlocked}
                      onClick={() => {
                        setState((current) => {
                          const staged = direct(
                            {
                              ...initialState(),
                              read: current.read,
                              cursor: {
                                lesson: index,
                                unit: 0,
                                beat: 0,
                                page: 0,
                              },
                            },
                            true,
                          );
                          runEffects(staged.effects);
                          return staged.state;
                        });
                        setHistory([]);
                        setBacklog([]);
                        beginGame();
                        setComplete(false);
                        setPanel(null);
                      }}
                    >
                      {lesson.title}
                      <span>{unlocked ? '进入 →' : '尚未解锁'}</span>
                    </button>
                  );
                }) ?? <p className="muted">脚本构建后即可选择章节。</p>}
              </>
            )}
          </div>
        </div>
      )}
      {!started && panel === null && (
        <footer className="footer-note">
          GRALGAME　/　LECTURE SERIES　　2026
        </footer>
      )}
    </main>
  );
}

const mount = document.getElementById('root');
if (!mount) throw new Error('缺少 #root 挂载点');
createRoot(mount).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
