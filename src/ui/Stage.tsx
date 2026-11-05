import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from 'pixi.js';
import { useEffect, useRef, useState } from 'react';

export interface RuntimeAsset {
  id: string;
  file: string;
  kind: string;
  scale?: number;
  offset?: [number, number];
  regions?: { board?: [number, number, number, number] };
}
export interface StageScene {
  background: string;
  speaker?: string;
  sprites: Record<
    string,
    { char: string; expr: string; slot: string; dim: boolean }
  >;
}

const slotX: Record<string, number> = {
  center: 960,
  left: 560,
  right: 1360,
  'far-left': 250,
  'far-right': 1670,
};

export function Stage({
  scene,
  assets,
  showFallbackNotice = true,
  boardLayout = false,
}: {
  scene: StageScene;
  assets: RuntimeAsset[];
  showFallbackNotice?: boolean;
  boardLayout?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<{
    app: Application;
    world: Container;
    revision: number;
    render: () => void;
  } | null>(null);
  const sceneRef = useRef(scene);
  const assetsRef = useRef(assets);
  const boardRef = useRef(boardLayout);
  const [failed, setFailed] = useState(false);
  sceneRef.current = scene;
  assetsRef.current = assets;
  boardRef.current = boardLayout;

  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let disposed = false;
    const app = new Application();
    void app
      .init({
        resizeTo: target,
        background: '#32493e',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        target.appendChild(app.canvas);
        const world = new Container();
        app.stage.addChild(world);
        engine.current = { app, world, revision: 0, render: () => undefined };
        const resize = () => {
          const scale = Math.min(
            app.screen.width / 1920,
            app.screen.height / 1080,
          );
          world.scale.set(scale);
          world.position.set(
            (app.screen.width - 1920 * scale) / 2,
            (app.screen.height - 1080 * scale) / 2,
          );
          engine.current?.render();
        };
        engine.current.render = () => {
          void drawScene();
        };
        app.renderer.on('resize', resize);
        resize();
      })
      .catch(() => setFailed(true));

    async function drawScene() {
      const active = engine.current;
      if (!active || disposed) return;
      const revision = ++active.revision;
      active.world.removeChildren();
      const sceneNow = sceneRef.current;
      const manifest = assetsRef.current;
      const background = manifest.find(
        (asset) => asset.id === `bg/${sceneNow.background}`,
      );
      let backgroundSprite: Sprite | undefined;
      if (background) {
        try {
          const texture = await Assets.load<Texture>(`/${background.file}`);
          if (disposed || active.revision !== revision) return;
          backgroundSprite = new Sprite(texture);
          backgroundSprite.width = 1920;
          backgroundSprite.height = 1080;
        } catch {
          console.warn(
            `背景素材加载失败：${background.id}；使用程序占位背景。`,
          );
        }
      }
      if (backgroundSprite) active.world.addChild(backgroundSprite);
      else {
        const room = new Graphics().rect(0, 0, 1920, 1080).fill(0x526c5a);
        const window = new Graphics().rect(105, 115, 520, 390).fill(0xaeb99b);
        window.rect(355, 115, 9, 390).fill(0x5a6d5a);
        window.rect(105, 305, 520, 9).fill(0x5a6d5a);
        const board = new Graphics().rect(710, 125, 1050, 490).fill(0x304b3d);
        board.rect(690, 615, 1090, 18).fill(0x987f56);
        const floor = new Graphics()
          .rect(0, 760, 1920, 320)
          .fill({ color: 0x293b32, alpha: 0.62 });
        active.world.addChild(room, window, board, floor);
      }
      let entries = Object.values(sceneNow.sprites);
      if (!entries.length && sceneNow.speaker)
        entries.push({
          char: sceneNow.speaker,
          expr: 'neutral',
          slot: 'center',
          dim: false,
        });
      // Blackboard close-ups reserve the writing area for formulas: keep only
      // the current speaker, standing beside the board instead of over it.
      if (boardRef.current) {
        const speaker =
          entries.find((entry) => entry.char === sceneNow.speaker) ??
          entries[0];
        entries = speaker ? [{ ...speaker, slot: 'far-right' }] : [];
      }
      for (const spriteState of entries) {
        const asset =
          manifest.find(
            (row) => row.id === `ch/${spriteState.char}/${spriteState.expr}`,
          ) ??
          manifest.find((row) => row.id === `ch/${spriteState.char}/neutral`);
        let sprite: Sprite | undefined;
        if (asset) {
          try {
            const texture = await Assets.load<Texture>(`/${asset.file}`);
            if (disposed || active.revision !== revision) return;
            sprite = new Sprite(texture);
            sprite.anchor.set(0.5, 1);
            // The delivered bust art is 400×540 units with a proportionally
            // large head. These factors keep the face inside the upper third
            // while letting the dialogue box cover the waist cut.
            const scale =
              (boardRef.current ? 0.52 : entries.length > 1 ? 0.62 : 0.79) *
              (asset.scale ?? 1);
            sprite.scale.set(scale);
            sprite.x =
              (boardRef.current ? 1560 : (slotX[spriteState.slot] ?? 960)) +
              (asset.offset?.[0] ?? 0);
            sprite.y = 860 + (asset.offset?.[1] ?? 0);
            // Focus is derived at draw time: the speaker is lit, everyone else
            // (and every character on a narration page) is dimmed.
            sprite.alpha = sceneNow.speaker === spriteState.char ? 1 : 0.58;
          } catch {
            console.warn(`立绘素材加载失败：${asset.id}；显示程序占位人物。`);
          }
        }
        if (!sprite) {
          const x = entries.length > 1 ? (slotX[spriteState.slot] ?? 960) : 960;
          const figure = new Graphics()
            .ellipse(x, 495, 106, 128)
            .fill({ color: 0xe5d4b4, alpha: 0.72 });
          figure
            .roundRect(x - 158, 590, 316, 520, 92)
            .fill({ color: 0xd8c19b, alpha: 0.62 });
          figure.alpha = spriteState.dim ? 0.5 : 0.86;
          const label = new Text({
            text: spriteState.char,
            style: { fontFamily: 'serif', fontSize: 42, fill: 0x453d31 },
          });
          label.anchor.set(0.5);
          label.position.set(x, 850);
          active.world.addChild(figure, label);
        } else active.world.addChild(sprite);
      }
    }

    return () => {
      disposed = true;
      engine.current = null;
      if (app.renderer) app.destroy(true);
    };
  }, []);

  useEffect(() => {
    const active = engine.current;
    if (!active) return;
    // Stage content derives only from the serializable scene snapshot; no story data enters Pixi.
    active.render();
  });

  const backgroundMissing = !assets.some(
    (asset) => asset.id === `bg/${scene.background}`,
  );
  return (
    <div
      className={`stage${failed || backgroundMissing ? ' stage-fallback' : ''}`}
      aria-hidden="true"
    >
      <div ref={host} className="pixi-host" />
      {showFallbackNotice && backgroundMissing && (
        <div className="scene-placeholder">
          <span>素材缺失时使用程序占位</span>
        </div>
      )}
    </div>
  );
}
