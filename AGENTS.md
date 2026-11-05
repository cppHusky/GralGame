# AGENTS.md — GralGame（《积分精选》讲义篇 Galgame）程序设计方案

> 写给负责实现程序的 Agent。先读第 0–2 节，再按第 12 节的里程碑做事。
> 设计日期：2026-11-02。项目所有者：cppHusky。书的测试基线提交：`442fc9e6181b42fd76a50f1118600947da0d0c1a`（`cppHusky/IntegralCollection`）。
> 2026-11-03 更新：所有者已决定——代码用 MIT；v1 只做网页并托管在 Cloudflare；不做配音；桌面封装选 Tauri v2（暂缓实施）；角色立绘已全部完成（34 人，全部半身；5 位主角各有 8 种表情，其余 29 人只有 `neutral`），见第 8 节。
> 2026-11-05 更新：背景与立绘均已完成，素材规格按实际出图规范重写（8.1–8.7）；全文自查修订，新增并行分工建议（12.1）。

---

## 0. 先读这里

### 0.1 标记约定

| 标记         | 含义                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| **[已验证]** | 2026-11-02 在沙箱里实测过（Typst 0.15.0，linux x86_64），复现步骤见附录 B |
| **[已定]**   | 已决定。没有 ADR（`docs/decisions/`）不要改                               |
| **[待验证]** | 设计意图明确，但需要在 M0 实测；结果写进 `docs/decisions/`                |
| **[待定]**   | 要项目所有者拍板。写进 `docs/questions.md`，不要自己定                    |

### 0.2 硬性规则

1. **书是唯一真源。** `book/` 是 git submodule，固定到某个提交，**只读**。任何对白、公式、插图的修改都应该发生在书的仓库里，不在本仓库。发现书的问题，记到 `docs/upstream-notes.md`。
2. **生成物不手改、不提交。** `generated/`、`.build/`、`dist/` 全部在 `.gitignore`，由脚本重建。
3. **文本层、演出层、素材层三者分离**（见第 2 节）。文本来自书；演出（立绘、背景、音乐、黑板动作）写在 `data/direction/`；素材放 `assets/`。
4. **缺素材也必须能玩。** 运行时素材缺失一律回退而不是报错或白屏：缺表情 → `neutral`；缺背景、音频或新增角色 → 程序生成的占位物。（导入与构建阶段仍然严格，见 8.6。）
5. **核心逻辑是纯函数。** `src/core/` 不依赖 DOM、Pixi、音频、时间。存档、回滚、测试都建立在这点上。
6. **版本全部固定。** Typst、Node、pnpm、所有 npm 依赖、book 提交、Typst 包版本都要锁定。升级走专门的 PR。
7. **不碰不该碰的东西：** 不在运行时联网，不加统计/遥测，不提交密钥（Cloudflare 的令牌只放在 CI 的 secrets 里），不热链接外部素材，不把版权不明的素材放进仓库。
8. **每个重要决策写一页 ADR**（`docs/decisions/NNNN-标题.md`：背景、选项、决定、后果）。
9. **做完再说做完：** 提交前跑 `pnpm check`（类型检查、lint、单元测试、IR/演出/素材校验）。涉及画面的改动再跑 `pnpm e2e`。

---

## 1. 项目概述

### 1.1 目标

把《积分精选》重制版的**讲义篇**做成可在浏览器里玩的视觉小说（galgame）。讲义篇是作者写的一部剧本：教授、讲师、助教带着几十名学生上《不定积分解题法》，课堂对白里夹着大量公式和板书，每节课后还有"放课后"的剧情场景。

两个技术上的核心难点（先理解它们，其余都是常规视觉小说功能）：

1. **公式密度很高。** 对白里到处是行内公式，推导里有块级公式和 cetz 几何图，对白框必须能把它们和汉字混排。
2. **书还在更新。** v0.2.3 里只有阶段一写完，阶段二到四是空占位。管线必须能反复重跑，书改了，演出和存档尽量不丢。

### 1.2 源材料现状

讲义源码在 `book/lecture/`，Typst 写成。对白用 `#lesson((chara.严佩,[…]), [旁白], …)` 记录：数组元素是（说话人，内容）元组，或者一段裸内容（旁白）。

阶段一的基线数字（SVG 路线导出后统计）**[已验证]**：

| 课           | 小节数        | 对白+旁白                        |
| ------------ | ------------- | -------------------------------- |
| 绪论课       | 6（+开头 10） | 115                              |
| 基本积分方法 | 6（+开头 3）  | 152                              |
| 进阶积分技巧 | 4（+开头 11） | 125，另有放课后 130              |
| 拓展裂项方法 | 0（开头 8）   | 8（尚未写完）                    |
| **合计**     |               | **530 = 511 句对白 + 19 段旁白** |

其他数字：34 个具名角色（全部在 `book/lecture/names.typ`）；块级公式 213 个；cetz 图 7 张；行内公式 SVG 约 537 个；`<ruby>` 注音 4 处；放课后场景 1 段。这些数字写进单元测试作为回归基线，书更新后允许变化，但变化必须被测试显式提示。

### 1.3 范围

**v1 要做：** 阶段一完整可玩（含放课后）；对白框含行内公式；黑板（块级公式、图、分步推导）；存档/读档/回滚/回看/自动/快进/设置；演出层（立绘、表情、背景、BGM、SE）；音频等尚未到位的素材用占位物顶替；网页版发布到 Cloudflare（见 9.4）。

**v1 不做（non-goals）：** 运行时调用 AI 生成内容；Live2D/骨骼动画；**配音（所有者已决定不做，不要保留语音接口）**；桌面版（方案已定为 Tauri，见 9.5，暂缓实施）；手机竖屏适配；成就/Steamworks 集成；多语言文本（只留接口）。

---

## 2. 设计原则

1. **三层分离。** 文本层（IR，自动生成）、演出层（`data/direction/*.yaml`，人和 Agent 维护）、素材层（`assets/` + `manifest.yaml`）。三层靠稳定 ID 和锚点对接，改一层不应迫使重写另一层。
2. **状态驱动渲染。** 渲染层只是 `GameState` 的函数。前进一步 = `step(state) → (state', effects)`；回滚 = 恢复旧状态并重新对齐画面。
3. **严格解析。** 管线遇到不认识的 HTML 标签、不认识的演出命令、对不上的锚点，**直接报错并指出位置**，不要悄悄忽略。
4. **数据先行。** IR、演出命令、素材清单、存档都有 zod schema，并导出 JSON Schema 到 `schema/`。
5. **占位优先。** 先让整本书能玩，再逐个替换素材。素材的接入顺序不应阻塞程序开发。
6. **可追溯。** 每个非占位素材在 `manifest.yaml` 里记录来源工具、模型、提示词、日期、授权条款（Steam 披露、授权核对都要用）。

---

## 3. 技术栈

| 项         | 选择                                                                                                          | 状态     |
| ---------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| 语言       | TypeScript（`strict`，开启 `noUncheckedIndexedAccess`）                                                       | [已定]   |
| 包管理     | pnpm；Node 取当前 LTS 并写入 `.nvmrc` 与 `engines`                                                            | [已定]   |
| 构建       | Vite                                                                                                          | [已定]   |
| UI         | React（对话框、黑板、菜单、存读档界面全部用 DOM）                                                             | [已定]   |
| 舞台       | PixiJS（背景、立绘、转场、滤镜）。是否经由 Pixi'VN 使用，见 7.8 决策门                                        | [待验证] |
| 校验       | zod（IR、演出、素材清单、存档）                                                                               | [已定]   |
| 解析       | `parse5`（HTML）、`yaml`                                                                                      | [已定]   |
| 脚本运行   | `tsx`（运行 `tools/*.ts`）                                                                                    | [已定]   |
| 测试       | vitest（单元）、Playwright（端到端，Chromium + WebKit）                                                       | [已定]   |
| Lint/格式  | Biome                                                                                                         | [已定]   |
| 文本排版   | **Typst 0.15.0**（固定版本，写入 `.typst-version`）                                                           | [已定]   |
| 字体子集化 | `subset-font` 或 `pyftsubset`，输出 woff2                                                                     | [待验证] |
| 图像处理   | `sharp`（栅格处理、WebP 转码）、`@resvg/resvg-js`（SVG 转栅格，[待验证]）；只给构建期的导入工具用，不进发布包 | [已定]   |
| 代码许可证 | MIT（只覆盖代码，见 9.3）                                                                                     | [已定]   |
| 托管       | Cloudflare Workers 静态资源（Static Assets），Wrangler 部署，见 9.4                                           | [已定]   |
| 桌面封装   | Tauri v2，暂缓实施，见 9.5                                                                                    | [已定]   |

Typst 约束：

- 系统包管理器里的 Typst 版本可能不是 0.15.0。构建脚本必须校验 `typst --version` 与 `.typst-version` 一致，不一致就报错并提示下载官方 release 二进制。
- HTML 导出在 0.15.0 里**仍需要 `--features html`**，并打印"开发中，勿用于生产"的警告 **[已验证]**。所以：版本钉死，CI 里加书的"金丝雀构建"（见第 9 节）。
- 书依赖的 Typst 包：`@preview/cetz:0.5.2`、`@preview/mannot:0.4.0`、`@preview/quick-maths:0.2.1`，以及间接依赖 `oxifmt:1.0.0`、`tiptoe:0.4.0` **[已验证]**。CI 要缓存 `~/.cache/typst`，并支持从预置的包目录离线构建（某些环境连不上 `packages.typst.org`）。

---

## 4. 仓库结构

```
gralgame/
├─ AGENTS.md                   # 本文件
├─ README.md
├─ LICENSE                     # MIT（只覆盖代码）
├─ wrangler.jsonc              # Cloudflare 部署配置，见 9.4
├─ .github/workflows/          # CI 与部署
├─ .typst-version  .nvmrc  pnpm-lock.yaml  biome.json
├─ book/                       # submodule：cppHusky/IntegralCollection（固定提交，只读）
├─ typst/                      # 游戏构建专用的 Typst 垫片（shim），见 5.2
│  ├─ utils.typ
│  └─ entry-stage1.typ
├─ tools/                      # 构建管线（TypeScript，tsx 运行）
│  ├─ build-typst.ts           # 组装 Typst root，调用 typst 导出 HTML
│  ├─ html-to-ir.ts            # HTML → IR + 公式库 + 字形表
│  ├─ math-optimize.ts         # SVG 去重、基线提取、颜色重映射
│  ├─ check-direction.ts       # 演出层锚点/命令校验
│  ├─ direction-rebase.ts      # 书更新后自动修正演出层的序号
│  ├─ check-assets.ts          # 素材清单校验、覆盖率报告
│  ├─ ingest-art.ts            # 导入现有立绘与背景，见 8.6
│  ├─ gen-placeholders.ts      # 生成占位背景/音效（及将来新增角色的占位剪影）
│  └─ subset-fonts.ts
├─ schema/                     # zod schema 与导出的 JSON Schema
├─ data/
│  ├─ characters.yaml          # 角色表（id、显示名、颜色、是否主角、立绘缩放等）
│  ├─ ids.yaml                 # 课/小节的 slug 映射
│  └─ direction/stage1/*.yaml  # 演出层
├─ assets/                     # 素材源文件（大文件用 Git LFS）
│  ├─ bg/  ch/  cg/  bgm/  se/  ui/
│  ├─ _inbox/                  # 所有者交付的原图，不入库（gitignore）
│  ├─ _src/                    # SVG 源文件（体积小，入库）
│  ├─ prompts/                 # 生成素材用的提示词记录
│  └─ manifest.yaml
├─ public/                     # 原样复制进 dist：_headers、favicon 等
├─ src/
│  ├─ core/                    # 纯 TS：类型、状态、解释器、存档
│  ├─ render/                  # PixiJS 舞台
│  ├─ ui/                      # React 组件
│  ├─ platform/                # 存储、音频、输入、全屏
│  └─ main.tsx
├─ generated/                  # 脚本管线输出（gitignore）
├─ .build/                     # Typst 中间产物（gitignore）
├─ tests/  e2e/
└─ docs/
   ├─ decisions/               # ADR
   ├─ questions.md             # 需要所有者回答的问题
   └─ upstream-notes.md        # 对书的反馈
```

---

## 5. 文本管线（Typst → IR）

### 5.1 总览

```
book/lecture/*.typ ──(Typst 0.15 HTML 导出 + 垫片)──▶ .build/stage1.html
.build/stage1.html ──(html-to-ir)──▶ generated/script/*.ir.json         对白、旁白、结构
                                  ├▶ generated/math/*.json              公式/图 SVG 库
                                  └▶ generated/math/glyphs.svg          全局字形表
```

### 5.2 Typst 垫片 [已验证]

讲义文件用根路径导入 `/utils.typ` 和 `/math.typ`，还用相对路径 `../utils.typ`。构建时临时组装一个 Typst root，让 `/utils.typ` 指向我们的垫片，垫片再导入书里的原版并覆盖其中几个函数：

```
.build/typst-root/
├─ book        -> ../../book            （符号链接）
├─ lecture     -> book/lecture          （符号链接）
├─ math.typ                             （从 book/math.typ 复制）
├─ utils.typ                            （复制自 typst/utils.typ）
└─ entry-stage1.typ                     （复制自 typst/entry-stage1.typ）
```

实测符号链接可用；`lecture/有理函数积分.typ` 里的 `../utils.typ` 会按 Typst 虚拟路径落到 root 下的垫片。

`typst/utils.typ`：

```typst
#import "/book/utils.typ": *
#let noindent = []            // 书里是 h(-2em)，只服务纸面排版
#let section-outline = []     // 书里依赖 outline/query，HTML 导出无意义
#let lesson(..args) = {
  for row in args.pos() {
    if type(row) == content {
      html.elem("div", attrs: (class: "narration"), row)
    } else {
      html.elem("div", attrs: (class: "turn", "data-speaker": row.at(0)), row.at(1))
    }
  }
}
#let after-lesson(..args) = html.elem("section", attrs: (class: "after-lesson"), lesson(..args))
#let ruby(char, pinyin-str) = html.elem("ruby", { char; html.elem("rt", pinyin(pinyin-str)) })
```

`typst/entry-stage1.typ`：

```typst
#import "/math.typ": math-shorthands
#show: math-shorthands          // 书的全局 show 规则，缺了会让 +- 之类的简写失效
#show figure: it => context if target() == "html" {
  html.elem("div", attrs: (class: "fig"), html.frame(it))
} else { it }
#show math.equation: it => context if target() == "html" {
  if it.block {
    html.elem("div", attrs: (class: "eq"), html.frame(it))
  } else {
    // 行内公式末尾放一个 0.1pt、颜色 #010203 的"基线标记"，供后处理读取基线位置（见 5.5）
    box(html.frame({ it; text(fill: rgb("#010203"), size: 0.1pt)[.] }))
  }
} else { it }
#include "lecture/有理函数积分.typ"
```

调用命令（`tools/build-typst.ts` 封装它）：

```
typst compile entry-stage1.typ ../stage1.html --root . --format html --features html
```

字体：书的 makefile 用 `--ignore-system-fonts --font-path ./fonts`。沙箱验证时没有配置这些字体，所以**图和公式里的 CJK 文字（例如绪论课韦恩图里的标签）是否正确进入 SVG [待验证]**。M0 必须带着书的字体配置重跑，并目测 7 张图。书的字体来源见 `book/fonts/pull-font.sh`（朱雀仿宋）和 `book/.gitmodules`（Noto 系列）。优先只取最小字体集，不要拉整个 noto-cjk 仓库。

### 5.3 HTML 输出契约 [已验证]

| Typst 内容              | HTML                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `===` 三级标题（课）    | `<h4>标题</h4>`                                                        |
| `====` 四级标题（小节） | `<h5>标题</h5>`                                                        |
| `lesson` 里的一句对白   | `<div class="turn" data-speaker="严佩">…</div>`                        |
| `lesson` 里的旁白       | `<div class="narration">…</div>`                                       |
| `after-lesson`          | `<section class="after-lesson">`，内部是同样的 turn/narration          |
| `#parbreak()`           | 同一 turn 内多个 `<p>`；没有 parbreak 的对白直接是行内内容，没有 `<p>` |
| 行内公式                | 行内 `<svg style="overflow: visible; width: Nem; height: Nem">`        |
| 块级公式                | `<div class="eq"><svg …display: block></div>`                          |
| cetz 图（figure）       | `<div class="fig"><svg …></div>`                                       |
| 拼音注音                | `<ruby>刘<rt>niú</rt></ruby>`                                          |
| 列表                    | `<ul><li>…</li></ul>`                                                  |
| 加粗                    | `<strong>`                                                             |

标签清单就这么多（另有 SVG 内部元素）。`html-to-ir` 遇到清单以外的标签必须报错，并给出课、小节、句序号；新增标签走 ADR。

`ruby` 不是装饰：书里用它表示口音/误读的读音（如把"刘津"读成"niú jīn"的玩笑、"na3o 师"）。IR 必须保留，对白框里要显示注音。

### 5.4 为什么是 SVG 而不是 MathML [已验证]

Typst 0.15 的 HTML 导出可以把公式输出成 MathML，理论上更轻、可选中、可无障碍。**但实测整个阶段一无法这样导出**：书里用了 `@preview/mannot`（公式标注、高亮框），它在 HTML 导出里依赖版面位置，编译直接失败（`mannot/src/mark.typ:263` 处 `calc.min(..y-array)` 报 `expected at least one value`）。我们又不能改书里的讲义文件。

所以 **[已定]：全部公式和图都包进 `html.frame`，输出 SVG**。优点：和 PDF 版逐像素一致，所有自定义宏和颜色标注原样保留。代价：体积、基线对齐、无障碍、深浅色主题。5.5 与 7.7 处理这些问题。

MathML 保留为日后的可选优化（只对不含 mannot 的公式二次导出，用作无障碍文本层），v1 不做。

### 5.5 公式 SVG 后处理（`tools/math-optimize.ts`）

**(1) 字形去重 [已验证问题，待实现]。** 原始 HTML 里每个 SVG 都自带一份 `<defs>`，同一个字形被反复定义（阶段一约 5,500 个字形定义，不同 id 只有约 190 个；`defs` 占导出体积约三分之二，整份 HTML 约 6.5 MB）。处理：把所有 `<symbol>`/字形定义收集到一份全局 `generated/math/glyphs.svg`，每个公式只保留 `<use href="#id">` 引用。同一个 id 的内容必须逐字节相同，不同就报错（这是 id 为内容哈希的假设，需要断言）。

运行时把全局字形表挂在页面根部：`<svg width="0" height="0" style="position:absolute" aria-hidden="true">`。**不要用 `display:none`**，否则 `use` 引用在部分浏览器里失效。跨内联 SVG 的 `use` 引用 **[待验证]**，要在 Chromium 和 Firefox 里实测。

**(2) 行内基线对齐 [已验证标记方案]。** Typst 导出的行内 SVG 不带 `vertical-align`，底边默认落在文字基线上；遇到分式、大型运算符、下标就会错位（阶段一里行内公式最高达 1.46em）。垫片在每个行内公式末尾放了一个不可见标记（`#010203`，0.1pt）。后处理：

1. 在 SVG 里找到填充色 `#010203` 的 `<g transform="matrix(1 0 0 -1 x y)">`，`y` 就是基线在 viewBox 中的纵坐标；
2. 下沉量 = `viewBox 高 − y`（pt）；换算成 em：`下沉量 / (width_pt / width_em)`；
3. 记入 `vAlignEm`（运行时设成 `vertical-align: -{vAlignEm}em`），然后**删除标记元素**。

在绪论课里实测 194 个行内 SVG 全部带有标记，下沉量从 0 到 0.83pt。真实浏览器里的目测对齐 **[待验证]**。

**(3) 颜色重映射。** 默认黑色（`fill="#000000"`、`stroke="#000000"`）改成 `currentColor`，让公式跟随主题；非黑色（书里的 `subst` 紫色、mannot 的标注色）保留。深色背景下红蓝的对比度 **[待定]**。

**(4) 尺寸。** SVG 的 `width/height` 本来就是以 em 给的，直接按对话框字号缩放即可。

输出：`MathItem`（`svg` 内层片段、`viewBox`、`wEm`、`hEm`、`vAlignEm`）存入公式库，IR 里只放引用，这样 IR 小，也能按课懒加载。公式库内容只来自我们自己的构建，**绝不把用户输入当作 HTML 注入**。

### 5.6 IR 定义

zod schema 在 `schema/ir.ts`，下面是等价的类型草图：

```ts
export type CharacterId = string; // 'yan-pei'，见附录 A 和 data/characters.yaml

export interface Script {
  schema: 1;
  bookCommit: string;
  typstVersion: string;
  lessons: Lesson[];
}
export interface Lesson {
  id: string;
  title: string;
  units: Unit[];
} // id: 'stage1/l1'
export interface Unit {
  id: string; // 'stage1/l1/s03'；开头段 's00'；放课后 'stage1/l3/after'
  kind: 'section' | 'after-lesson';
  title?: string;
  beats: Beat[];
}
export type Beat = Turn | Narration;
interface BeatBase {
  id: string; // 'stage1/l1/s03#0007'（单元内序号）
  anchor: string; // 见 5.7
  hash: string; // 纯文本的 sha1
  blocks: Block[];
}
export interface Turn extends BeatBase {
  kind: 'turn';
  speaker: CharacterId;
}
export interface Narration extends BeatBase {
  kind: 'narration';
  location?: string;
} // 见 5.8

export type Block =
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'eq'; math: MathRef }
  | { kind: 'fig'; math: MathRef }
  | { kind: 'list'; items: Inline[][] };
export type Inline =
  | { t: 'text'; text: string }
  | { t: 'math'; math: MathRef }
  | { t: 'ruby'; base: string; rt: string }
  | { t: 'strong'; children: Inline[] };
export type MathRef = string; // 公式库的键
```

说话人由 `data-speaker`（中文名，取自书里的 `chara.*`）通过 `data/characters.yaml` 映射成 `CharacterId`；没有映射就报错。课与小节的 slug 在 `data/ids.yaml` 手工维护（标题改名时只改这里，ID 不变）。

### 5.7 稳定 ID 与锚点

书会更新，句子会被插入、删除。规则：

- **ID** = `单元 ID#单元内序号`。序号会漂移，所以只当主键用，不当唯一依据。
- **锚点** = 这一句纯文本（说话人 + 正文，NFKC 规范化后去掉标点和空白）的前 16 个字符。
- 演出层的每条定位同时写 ID 和锚点。解析规则：ID 的锚点对得上就用；对不上，在同一单元里按锚点找，**唯一命中就采用并警告**，零命中或多命中就报错。
- `pnpm direction:rebase` 把演出层里的序号批量修正到最新位置，修正后人工审阅 diff。
- 存档里存"单元 ID + 序号 + 锚点 + 内容哈希"，读档时用同一套规则恢复位置；恢复不了就退到该单元开头，并提示玩家。

### 5.8 分页与黑板规则

一个 Turn 可能很长（多个段落，中间夹块级公式），对话框一次放不下。IR 保持"书的原样"，**分页在运行时由 core 完成**，规则 **[已定]**，具体数值 **[待定]**：

1. 文本块按 `p` 分段；超长段按句末标点（`。！？…；`）再切。单页上限：**对白 58 字**、旁白 90 字（公式按 2 个字计），见 ADR 0007。**不切断**公式、`ruby`、括号内的舞台提示。
2. 块级公式 `eq` 和图 `fig` 进黑板，不进对话框。**挂靠规则：** 挂在它前面那一页文字上，该页打字完成（或被跳过）时黑板上同时出现，不额外要玩家点击一次；如果一句对白以块级内容开头，则挂到后面第一页文字的开始处。**遇到块级公式即在它处断开对白**，后面的文字另起一页，避免长段文字和公式挤在同一屏。
3. 黑板的位置：只有带 `regions.board` 的背景（黑板特写）显示公式和图；教室广角、湖边长廊等没有板书区的背景**不显示板书**，公式也不以浮层形式出现。图（`fig`）有独立的一栏，不与公式混排；只显示一张图。
4. 黑板清空：**进入新小节不清空**，只有真的需要写新板书、跨课（幕间）或明确 `board: clear` 时才清理（例如离开教室的放课后场景）。同时最多保留 2 个公式和 1 张图，超出时才丢弃最旧的；旧块降低不透明度，而不是无限堆叠。
5. 旁白的首段若形如 `【湖边长廊】`（正则 `^【(.+)】$`），提取为 `Narration.location`，并默认触发"地点卡"演出；这一段不再出现在对话框里。这是放课后场景的惯用写法（见 `book/lecture/有理函数积分/进阶积分技巧-after.typ`）。
6. 旁白不显示名牌；说话人名牌用 `characters.yaml` 里的显示名。

### 5.9 严格模式与回归基线

- 构建期断言：所有说话人都在 `characters.yaml` 里；所有 `MathRef` 都能解析；所有 SVG `use` 引用的字形 id 都在全局字形表里。
- `tests/fixtures/stage1.stats.json` 记录 1.2 节那套数字（句数、旁白数、说话人数、公式数、图数）。书的提交变更导致数字变化时，测试失败并打印差异，由人确认后更新基线。
- 阶段二到四出现新内容时，管线应无需改代码即可产出对应课的 IR（`data/ids.yaml` 补 slug 即可）。

---

## 6. 演出层（Direction）

演出层只描述"什么时候让画面和声音发生什么"，不含任何对白文本。每个单元一个 YAML：`data/direction/stage1/<lesson>/<unit>.yaml`。

```yaml
unit: stage1/l1/s00
defaults:
  bg: classroom_wide
  bgm: classroom_light
cues:
  - at: { id: "stage1/l1/s00#0000", anchor: "严佩咳咳我们上课了" }
    do:
      - { cmd: bg, id: classroom_wide, transition: fade, ms: 600 }
      - { cmd: show, char: yan-pei, expr: neutral, slot: center }
      - { cmd: bgm, id: classroom_light, fade: 1.5 }
  - at: { id: "stage1/l1/s00#0001", anchor: "一位坐在最后排的学生" }
    do:
      - { cmd: se, id: door_slide }
```

`anchor` 的写法与 5.7 一致。可以用 `pnpm direction:anchor stage1/l1/s00#0001` 打印某句的锚点。

### 6.1 命令表

| cmd               | 参数                                                   | 说明                                                           |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `bg`              | `id, transition(fade/cut/wipe), ms`                    | 切背景；背景若带 `regions.board`，黑板自动贴合该区域（见 7.1） |
| `show`            | `char, expr, slot, enter?`                             | 立绘登场                                                       |
| `expr`            | `char, expr`                                           | 换表情（交叉淡入）                                             |
| `move`            | `char, slot, ms`                                       | 换站位                                                         |
| `hide`            | `char, exit?`                                          | 立绘退场                                                       |
| `bgm`             | `id \| stop, fade, volume?`                            | 背景音乐，交叉淡入淡出                                         |
| `se`              | `id, volume?`                                          | 音效                                                           |
| `board`           | `op: clear \| pin \| unpin \| highlight \| fade-older` | 黑板动作                                                       |
| `card`            | `kind: location \| title \| chapter, text`             | 全屏文字卡                                                     |
| `fx`              | `kind: shake \| flash \| vignette \| blur, ms`         | 画面特效                                                       |
| `wait`            | `ms`                                                   | 停顿                                                           |
| `set`             | `flag, value`                                          | 设置变量                                                       |
| `choice` / `jump` | 见 M6                                                  | 选择与跳转，v1 不实现                                          |

未知命令、缺少参数、引用了不存在的素材 ID：`pnpm check:direction` 失败。

### 6.2 默认演出（没有 cue 时）

- 说话人立绘在首次发言时自动登场，站位按"本单元首次出现顺序"依次取 `center, left, right, far-left, far-right`，同屏最多 3 人；非说话者变暗。
- 所有角色都是半身立绘（见 8.1）。只有 `neutral` 的角色没有表情可换，靠"说话人高亮、非说话者变暗"，再加一个很轻的发言动效（开始说话时立绘轻微上浮或缩放，约 150 ms，可在设置里关闭）来表现谁在说话；具体动效 [待定]，M5 再精修。
- 没有 `bg` 就沿用上一个；整本书的初始背景是 `classroom_wide`。
- 当前背景带 `regions.board`（黑板特写）时，立绘默认隐藏，只显示名牌和对话框 [待定]；演出层用 `show` 可以显式让立绘出现。
- 对话框底色取自书里 `names.typ` 的 `chara-background` **[已验证来源]**：杨秉 `#f7fff7`、严佩 `#fffff1`、温舒 `#fff7f7`、牛弘 `#f7f7ff`，其余 `#fbfbfb`。深色主题下要重新取色 **[待定]**。

---

## 7. 运行时架构

### 7.1 分层与坐标

- 逻辑分辨率 1920×1080，等比缩放适配窗口，居中留边。
- 层序（下→上）：背景 → 立绘 → 黑板（DOM）→ 对话框（DOM）→ 菜单/存读档/设置（DOM）→ 转场与全屏卡（DOM + Pixi）。
- Pixi 画布只负责背景、立绘、转场、滤镜；**文字和公式全部走 DOM**，这样 SVG 公式与汉字混排才是浏览器原生行为。
- **黑板位置：** 背景清单给出 `regions.board`（板书区矩形，1920×1080 逻辑坐标）。只有当前背景带它时，`Blackboard` 才渲染公式和图；字号上限 46px（1920 逻辑宽），超出槽位时整体缩小，放不下的旧块淡出。没有板书区的背景（教室广角、湖边长廊）不显示任何板书。
- **对话框**在底部约 1600×280，所以板书区应落在对话框之上的区域内；这是背景的设计约束，导入时检查（8.6）。
- 布局草案（M2 先做到可用，视觉精修留到 M5）。

### 7.2 core：状态与解释器（`src/core/`，纯函数）

```ts
interface GameState {
  schema: number;
  cursor: { unit: string; beat: number; page: number };
  stage: { bg?: BgState; sprites: Record<string, SpriteState>; dim: string[] };
  board: { items: { math: MathRef; kind: 'eq' | 'fig'; pinned: boolean }[] };
  audio: { bgm?: { id: string; volume: number } };
  flags: Record<string, boolean | number | string>;
  read: ReadSet;                       // 已读句集合，按单元存位图
  mode: 'normal' | 'auto' | 'skip';
}
type Effect =
  | { t: 'text'; page: PageView }      | { t: 'bg'; … }  | { t: 'sprite'; … }
  | { t: 'board'; op: BoardOp }        | { t: 'bgm'; … } | { t: 'se'; … }
  | { t: 'card'; … }  | { t: 'fx'; … } | { t: 'wait'; ms: number };

function step(state: GameState, ctx: { ir: Script; dir: Direction; chars: Characters }):
  { state: GameState; effects: Effect[] };
```

- `step` 不读时间、不读随机数、不碰 DOM；给定同样输入永远给出同样输出。
- **回滚**：保存最近 N（默认 200）个快照（状态本身可序列化，体积小）；回滚 = 恢复快照，然后让渲染层按"目标状态"对齐（不播放转场）。
- **存档** = `GameState` + `{ scriptHash, bookCommit }` + 版本号；`schema` 变化时走迁移函数（`src/core/migrate.ts`），迁移要有测试。
- **自动 / 快进**是 `mode` 加上渲染层的计时/连点，不在 core 里计时。快进默认只跳已读（可在设置里改）。

### 7.3 渲染

- `render/stage.ts`：订阅 effects，管理背景与立绘精灵。立绘默认是"一个表情一张完整半身图"，换表情用交叉淡入；请求的表情不存在时回退到 `neutral`（8.1）；位置来自素材清单里的锚点与偏移；显示比例见 8.2（单人 0.9，2–3 人并排 0.7，再乘角色的 `stage_scale`）；素材按需加载（8.7）。
- `ui/TextBox.tsx`：名牌 + 当前页内容。**打字机效果**：遍历 DOM 文本节点按码点逐个显现（用 `Intl.Segmenter`），遇到公式 SVG 和 `<ruby>` 整体作为不可分原子；点击时先补完当前页，再次点击才翻页。
- `ui/Blackboard.tsx`：渲染 `board.items`，新块以"粉笔书写"式动画出现 [待定：描边动画还是淡入]。
- `ui/Backlog.tsx`：回看记录，必须虚拟化（阶段一有 530+ 句，每句可能含多个 SVG）。
- 所有动画尊重 `prefers-reduced-motion`。

### 7.4 系统功能

| 功能          | 要点                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| 存档          | IndexedDB；手动 N 槽 + 自动存档槽；缩略图；可导出/导入存档文件                           |
| 设置          | localStorage；文字速度、自动延迟、音量（总/BGM/SE）、字号、跳过未读、主题、减少动效      |
| 输入          | 点击/空格/回车前进；按住 Ctrl 快进；A 自动；L 回看；← 回滚；H 隐藏界面；Esc 菜单；F 全屏 |
| 标题/章节选择 | 标题画面；按课/小节跳转（只允许跳到已解锁处）                                            |
| 画廊          | CG/音乐/角色（M5，可选）                                                                 |

### 7.5 音频

- WebAudio。首次用户手势后才创建 `AudioContext`。
- BGM 交叉淡入淡出；循环点来自素材清单的 `loop: [start, end]`（秒）。
- 格式：Opus（`.ogg`）为主，必要时转 AAC（`.m4a`）兜底 **[待验证]**。`tools/` 里用 ffmpeg 转码并统一响度（BGM ≈ -18 LUFS，SE ≈ -16 LUFS）[待定]。
- 占位音效由代码合成（点击、翻页、粉笔声），不用二进制文件。

### 7.6 字体与排版

- 只用开源字体（OFL 之类）。从 IR + UI 文案收集所有用到的码点，子集化成 woff2；包含 `ruby` 里的带声调拼音（āáǎà 等）。
- 公式是 SVG，不依赖网页字体。图里的 CJK 文字的字形是否正确进入 SVG，见 5.2 的待验证项。
- 字体选择（是否沿用书里的朱雀仿宋做旁白）[待定]。

### 7.7 无障碍与多语言

- 对话框区域用 `aria-live="polite"`；全部功能可键盘操作。
- **已知缺口：** v1 的公式是 SVG 图形，屏幕阅读器读不到。缓解方案见 5.4（日后对不含 mannot 的公式二次导出 MathML 作无障碍文本层）。
- UI 文案一开始就走 `t(key)`，字符串放 `src/i18n/zh-Hans.ts`。IR 文本只有简体中文；IR 里保留 `lang` 字段，繁体可以日后用 OpenCC 在构建期转换，公式不变。

### 7.8 Pixi'VN 决策门（ADR 0001，M0 结束前必须给出结论）

**倾向**：舞台、资源加载、存档辅助用 Pixi'VN（TypeScript、基于 PixiJS，UI 交给 React，自带叙事管理与存取档）。但本项目的叙事数据是我们自己的 IR，不是 ink 或手写 label，所以先评估下面几点：

| 评估点                        | 通过标准                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 能否用一个"通用 label"驱动 IR | 一个 label 里循环 `step`，不需要为每句生成代码                                                 |
| 回滚与历史                    | 能与 7.2 的快照机制共存，或能被它取代                                                          |
| 自定义节点                    | 对话步骤能携带任意 React 内容（带 SVG 的 Block 数组）                                          |
| 体积                          | 在不使用的功能上不显著增加打包体积                                                             |
| 许可证                        | 其许可证为 LGPL-2.1（以仓库当前声明为准），确认打包方式满足条款，并写入 `THIRD_PARTY_LICENSES` |

**不通过就退到"直接用 PixiJS + 自研 core"。** 为此，渲染层必须只依赖一个窄接口 `StageRenderer`（`apply(effects)`、`snapshot()`、`restore(state)`），core 与 UI 都不得直接 import Pixi'VN。

---

## 8. 素材规范

### 8.1 立绘现状 [已定]

所有者已完成全部 34 个角色的立绘：同一画风，全部是**半身**。

| 角色                               | 人数 | 可用表情                                                             |
| ---------------------------------- | ---- | -------------------------------------------------------------------- |
| 主角：严佩、温舒、明烛、杨秉、牛弘 | 5    | 8 种：`neutral smile laugh surprised angry sad thinking embarrassed` |
| 其余角色（附录 A 里除主角外的人）  | 29   | 只有 `neutral`                                                       |

规则：

1. **每个角色必须有 `neutral`**，它是其他表情的回退目标。表情名只能取上面 8 个（枚举写进 schema），新增表情名要走 ADR。
2. **表情回退链：** 请求的表情不存在 → `neutral`。这是**警告而不是错误**：运行时静默回退；`pnpm check:direction` 和覆盖率报告会列出所有"请求了不存在的表情"，由所有者决定要不要补图。
3. **不再有占位剪影**：现有角色都有真实立绘。占位剪影只留给将来新增（阶段二到四）而立绘还没到的角色。
4. 以后给某个角色补表情，只需把图放进目录并登记到清单，程序和演出层都不用改。
5. 角色的相对大小（教授、讲师、学生的身高差等）由 `characters.yaml` 的 `stage_scale` 调（默认 1.0）。所有立绘共用同一张固定画布（8.2），换表情时头部位置不会跳，所以**不需要逐张对齐微调**。

### 8.2 素材规格 [已定]

**立绘规格**（出图规范，所有角色、所有表情一致）：

| 项       | 值                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 画布     | **800×1080 px**（2x，等于 400×540 个 SVG 单位，见 ADR 0005）。每个表情一张，画布大小完全相同                                            |
| 裁切     | 每个格子用同一个固定裁切框（x 取格子左边，宽 800 px，从格顶 +40 px 到 1080 px）。**不逐张裁边（never trim）**，否则头部会在表情之间跳动 |
| 底边     | 人物在 y=540 单位（1080 px）处被平切，画布底边就是平切线。底边被对话框遮挡是正常的                                                      |
| 头部     | 头部中心在画布坐标 (400, 380) px，眼线约 y=396 px，所有角色一致（ADR 0005 实测值）。可用来定位名牌、气泡，不要假设别的                  |
| 身体     | 约 600×1000 px；最宽的装饰（思考气泡、怒气符号）伸到约 x=790 px，离画布边缘只有约 10 px                                                 |
| 背景     | 透明。不得带格子底色、描边或标题文字                                                                                                    |
| 锚点     | `bottom-center`，即 (400, 1080)                                                                                                         |
| 显示比例 | 单人 **0.9**（可调范围 0.85–0.95，1080p 下约 720×936 px）；2–3 人并排 **0.7**。最终比例 = 场景基准 × 角色的 `stage_scale`               |

规则：

- 整张画布不得被画面边缘或容器裁掉（含最宽的装饰）：站位以画布中心定位，最外侧站位要留边距；精灵不要加 mask。
- **不做"身体层 + 表情层"叠加** [已定]：素材都是整张图。

**背景规格：** 1920×1080 逻辑画布，平涂矢量风格；昼夜变化尽量用调色实现（引擎里做 CSS/Pixi 滤镜），不要为每个时段单独出图。背景可以在清单里带 `regions.board`（板书区矩形，1920×1080 坐标），见 7.1。

**目录与命名：**

```
assets/bg/classroom_wide.webp          背景 ID：bg/classroom_wide
assets/ch/yan-pei/neutral.webp         立绘：每个表情一张完整的半身图
assets/ch/yan-pei/smile.webp           …（主角共 8 张）
assets/ch/shi-ren/neutral.webp         其余角色只有这一张
assets/cg/…  assets/bgm/…ogg  assets/se/…ogg  assets/ui/…svg
assets/_src/…                          SVG 源文件（入库）
```

全部小写 ASCII + 下划线/连字符；角色目录用 `CharacterId`（附录 A）。

**交付格式 [待验证，ADR 0004]：** 源文件可能是 SVG（由生成脚本导出，透明背景）或带 alpha 的 PNG/WebP，导入工具两种都收。**发布格式默认用栅格 WebP**：立绘 2x（800×1080），背景 1x（1920×1080，视觉检查后需要再升到 2x）。SVG 在构建时转栅格（`@resvg/resvg-js`，不行就用 `sharp` 自带的 SVG 渲染），这样各浏览器渲染一致，Pixi 也只处理普通纹理；SVG 源文件保留在 `assets/_src/`。平涂图的 WebP 要比较 `lossless`、`nearLossless` 和有损（质量 85，alpha 质量 100）三种在体积与边缘质量上的表现，结论写进 ADR 0004。若实测 SVG 直出在体积和渲染一致性上更好，可以改成直接发布 SVG。

### 8.3 `assets/manifest.yaml`

```yaml
- id: ch/yan-pei/smile
  file: assets/ch/yan-pei/smile.webp
  kind: sprite
  size: [800, 1080] # 导入时写入；所有立绘必须相同
  pixel_ratio: 2
  anchor: bottom-center
  scale: 1.0 # 一般不用动；仅个别图需要补偿时才改
  offset: [0, 0]
  origin: ai-generated # placeholder | ai-generated | human-made | licensed
  tool: TODO # 工具与版本；矢量图由脚本生成时，填脚本/工具及版本
  date: TODO
  license: TODO # 授权条款与查看日期
  prompt_ref: assets/prompts/yan-pei.md # 可选；指向提示词或生成脚本的记录

- id: bg/classroom_blackboard
  file: assets/bg/classroom_blackboard.webp
  kind: background
  size: [1920, 1080]
  pixel_ratio: 1
  regions:
    board: [x, y, w, h] # 板书区，1920×1080 逻辑坐标；没有就用浮动黑板面板
  origin: ai-generated
  tool: TODO
  date: TODO
  license: TODO
```

`pnpm check:assets` 规则：

- 演出层引用的素材 ID 都能找到；
- `origin` 不是 `placeholder` 就必须有 `tool`、`date`、`license`。允许写 `TODO`：开发期只警告，`pnpm build:release` 遇到 `TODO` 报错；
- 覆盖率报告：34 个角色都有 `neutral`；`characters.yaml` 里标了 `main: true` 的 5 位主角有全部 8 种表情；所有立绘画布大小一致；背景都是 1920×1080；
- 有 `ai-generated` 素材时，提醒发布前按平台规则披露。

### 8.4 占位素材（`tools/gen-placeholders.ts`）

只在素材还没到位时用：音频是代码合成的短音；将来新增的角色或场景，生成"纯色剪影 + 名字"、"带场景名的渐变背景"。占位素材的 `origin` 固定为 `placeholder`，可以提交，但不得带进发布包（`pnpm build:release` 遇到占位素材要警告，列出清单）。

### 8.5 已有的背景（所有者提供，文件名按 `bg_<场景名>`）

- **教室全景**（`classroom_wide`）：讲课时的默认场景；放课后的傍晚用调色实现；
- **教室黑板特写**（`classroom_blackboard`）：板书内容的主舞台，板书区坐标见清单 `regions.board`；
- **湖边长廊**（书里的"酬湖"与"醴道"）：放课后场景，对应旁白里的 `【湖边长廊】`。文件名以实际为准。

其余场景随书增补 [待定]。

### 8.6 立绘与背景的导入（`tools/ingest-art.ts`，M1 内完成）

素材在所有者手里，仓库里还没有。约定：

1. **来源：** 所有者把原图放进 `assets/_inbox/`（不入库）。Agent 不要去别处找图，也不要重新生成。先列出收件箱的实际内容，写进 `docs/assets-inventory.md`，再开始导入。
2. **立绘命名 [已定]：文件名 = 角色名 + 表情名**，一条规则，不留特例。
   - 角色名：书里的中文名，与 `names.typ` 和 IR 的说话人完全一致，如 `严佩`、`施仁`。
   - 表情名：8.1 里 8 个英文枚举之一，小写。
   - 形式：`<角色名>_<表情名>.<ext>`，例如 `严佩_smile.svg`、`施仁_neutral.png`。也接受每个角色一个目录：`<角色名>/<表情名>.<ext>`。分隔符 `_`、`-`、空格都认；`<ext>` 可以是 `svg`、`png`、`webp`。
   - 解析前先把文件名做 NFC 规范化（不同系统对中文文件名的编码可能不同）；表情名不区分大小写。
   - 只有 `neutral` 的角色也要写全，如 `施仁_neutral.png`；只写角色名的文件不接受。
   - **输入端用书里的名字而不是 slug，是为了降低耦合：** 输入文件只依赖书（唯一真源）；名字到 slug 的映射只存在于 `data/characters.yaml` 一处，改 slug 不用改文件名，也不用动素材。
3. **背景命名：** `bg_<场景名>.<ext>`，对应素材 ID `bg/<场景名>`；场景名为小写 ASCII，可含下划线。
4. **解析不了就报错并列出，不要猜：** 角色名不在 IR 的说话人里、表情名不在枚举里、同一（角色，表情）出现两次、某个角色缺 `neutral`、背景名不符合规则。把清单写进 `docs/questions.md` 请所有者处理。
5. **立绘检查：**
   - **画布尺寸必须是 800×1080（SVG 则 viewBox 为 400×540），所有角色、所有表情完全一致；不一致就报错**，因为固定裁切框是出图规范的一部分。所有者当前的交付是声明式 sprite sheet，按 ADR 0005 由 `tools/extract-sheets.ts` 确定性拆分。
   - **透明背景是硬要求。** 栅格图：没有 alpha 通道，或 alpha 全是 255，报错并拒绝导入；顶边与左右边缘上不透明像素超过一半，警告（可能背景没抠干净；底边是人物的平切线，不检查）。SVG：不得含覆盖整幅画布的不透明矩形，含 `<text>`（多半是格子的标题文字）则警告；栅格化之后再按栅格图的规则检查 alpha。
   - **工具不得裁边、缩放、居中立绘**，只做格式转换（见 never trim）。
   - 头部位置无法自动验证，改为输出预览图到 `generated/preview/`：每个角色所有表情的叠加图，以及全体角色按底边中心对齐、画上头部基准线（y=380、y=396）的总览图，供所有者目测。
   - 若所有者提供了带锚点和尺寸的 JSON 清单，优先采用并与图像实测值核对；字段按实际文件适配，并把适配方式写进 ADR 0004。
     导入工具不做抠图，也不做色键。
6. **背景检查：** 尺寸必须是 1920×1080（SVG 的 viewBox 为 1920×1080）；不得有透明区域。板书区：若 SVG 里有 `id="board-area"` 的元素，读取它的外框写入 `regions.board`；没有就把"请给出板书区矩形"写进 `docs/questions.md`。板书区必须落在对话框之上的区域内（7.1），否则警告。
7. **处理：** SVG 按 8.2 转栅格；栅格图只转码；写入 `assets/ch/<CharacterId>/<表情名>.webp`、`assets/bg/<场景名>.webp` 和清单；SVG 源文件复制到 `assets/_src/`；`origin: ai-generated`，`tool`/`date`/`license` 先写 `TODO`。导出后抽查边缘有没有色边。
8. **生成 `data/characters.yaml` 骨架：** 角色列表取自 IR 里的说话人（阶段一正好 34 人，与 `names.typ` 一致），配上附录 A 的 slug 与对话框底色；5 位主角标 `main: true`；`stage_scale` 默认 1.0，所有者可改。
9. **输出覆盖率报告**（见 8.3）。

因为第 2、8 条要用到 IR 里的说话人列表，导入工具排在文本管线之后。

### 8.7 加载策略与体积

- 立绘总量约 69 张（5 位主角 × 8 + 其余 29 张）。平涂风格的 800×1080 图，每张大概几十到一百多 KB（实测：69 张共约 2.8 MB），总量在几 MB 到十几 MB 之间，所以**按需加载**：进入一个单元之前，预加载演出层里用到的全部立绘，加上默认登场的说话人的 `neutral`；在当前单元的后半段预加载下一个单元；背景与 BGM 同理。
- 素材尚未就绪时：舞台保持上一状态，就绪后淡入；超时（默认 5 秒）后走回退并在控制台告警。**文本推进不依赖素材加载**，不能因此卡住。
- 立绘总体积预算 ≤ 25 MB，单张 ≤ 1 MB 为宜 [待定，导入后按实测调整]。Cloudflare 的限额检查见 9.4。

---

## 9. 构建、脚本与 CI

### 9.1 `package.json` 脚本

| 命令                                                 | 作用                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Vite 开发服务器（需要 `generated/`）                                                        |
| `pnpm build:typst`                                   | 组装 Typst root，导出 `.build/stage1.html`                                                  |
| `pnpm build:ir`                                      | HTML → IR + 公式库 + 字形表                                                                 |
| `pnpm build:script`                                  | 以上两步                                                                                    |
| `pnpm check:ir` / `check:direction` / `check:assets` | 各层校验                                                                                    |
| `pnpm ingest:art`                                    | 导入 `assets/_inbox/` 里的立绘与背景（8.6）                                                 |
| `pnpm direction:rebase` / `direction:anchor <id>`    | 演出层维护工具                                                                              |
| `pnpm typecheck` / `lint` / `test`                   | 常规检查                                                                                    |
| `pnpm check`                                         | 上面所有检查（提交前必须通过）                                                              |
| `pnpm e2e`                                           | Playwright 端到端                                                                           |
| `pnpm build`                                         | 生产构建到 `dist/`（含字体子集化）                                                          |
| `pnpm build:release`                                 | 在 `build` 之上做发布前检查：清单里没有 `TODO`、没有占位素材、授权信息齐全、Cloudflare 限额 |
| `pnpm book:update`                                   | 把 `book/` 更新到指定提交，并重建、跑校验、列出漂移的锚点                                   |

### 9.2 CI

- 主流水线：安装固定版本的 Typst，缓存 `~/.cache/typst`、pnpm 缓存；`pnpm check` → `pnpm build` → `pnpm e2e`；通过后按 9.4 部署到 Cloudflare。
- **书的金丝雀构建**：定时拉取 `book@main`，只跑 `build:script` 与 `check:*`，允许失败，失败时说明是垫片、HTML 契约还是演出锚点出了问题。
- 发布包大小预算 [待定]：首屏 JS+CSS ≤ 700 KB（gzip）；每课脚本块（IR + 公式）≤ 1.5 MB（gzip）[待验证]。

### 9.3 许可证

- 本仓库**代码**使用 **MIT** 许可证 [已定]；`LICENSE` 里写所有者的署名与年份。
- MIT 只覆盖代码。`assets/`（立绘、背景、音乐等）**不自动随 MIT 授权**，README 里要写清楚；素材本身的授权方式由所有者另定 [待定]。
- 书：CC-0（以书的 `LICENSE` 为准）。书的文本经管线进入游戏，不改变书本身的授权。
- 运行 `pnpm licenses list` 生成 `THIRD_PARTY_LICENSES`。LGPL/GPL 类依赖（例如 Pixi'VN，见 7.8）与 MIT 是否兼容、LGPL 条款如何满足，需要所有者审阅后才能进入发布包；本文件不构成法律意见。
- 字体只用开源授权；AI 素材的授权按各工具的付费档条款逐条记在 `manifest.yaml`。

### 9.4 部署到 Cloudflare [已定：方案；待验证：细节]

**方案：Cloudflare Workers + Static Assets**（一个只有静态资源、没有 Worker 脚本的 Worker），用 Wrangler 部署。Cloudflare 现在对新项目推荐这种方式，Pages 仍可用但不再是重点；本项目是纯静态站点，两者都能托管，选前者省得以后迁移。

- **在 GitHub Actions 里构建，只把 `dist/` 交给 Wrangler。** 构建需要 Typst 0.15.0、submodule、字体，放在 Cloudflare 自己的构建环境里不好控制。
- `wrangler.jsonc`（无 `main` 字段；`wrangler` 固定为 devDependency 版本）：

```jsonc
{
  "name": "gralgame",
  "compatibility_date": "2026-11-03",
  "assets": { "directory": "./dist" }
}
```

- **环境与密钥：** CI 里设 `CLOUDFLARE_API_TOKEN`（权限只给编辑 Workers）和 `CLOUDFLARE_ACCOUNT_ID`，放 GitHub secrets，绝不提交。
- **环境划分：** `main` 部署到 `gralgame`（生产）；其他分支/PR 用 `wrangler deploy --name gralgame-staging` 部署到预演 Worker，用来给所有者看效果。
- **默认域名**是 `workers.dev` 子域；自定义域名 [待定]，由所有者在 Cloudflare 面板里绑定。
- **限额（免费计划，已在官方文档核对）：** 单个静态文件 ≤ 25 MiB；每个版本 ≤ 20,000 个文件。`pnpm build` 末尾检查：任一文件 > 20 MiB 或总文件数 > 10,000 就警告，超过上限就报错。素材按课切块、字体子集化、立绘与背景用 WebP，都是为了远离这些上限。
- **没有后端。** 存档只在玩家浏览器里（IndexedDB）。不要加 Worker 脚本、KV、D1，也不要接 Cloudflare Web Analytics 或任何统计（硬性规则 7）。
- **缓存与安全头：** 放在 `public/_headers`（Static Assets 支持 `_headers`）[待验证]。草案：

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
```

Vite 产物里带哈希的文件放 `/assets/`，所以可以放心设成永久缓存；`index.html` 与不带哈希的文件必须 `no-cache`。CSP 里的 `style-src-attr 'unsafe-inline'` 是因为公式 SVG 带内联 `style` 属性；`worker-src blob:` 是 Pixi 图片解码 worker 所需（ADR 0008）。Pixi 的 eval 依赖已通过 `pixi.js/unsafe-eval` 去掉，Zod 关闭 JIT，`production-csp` e2e 会守住这条线。
- 部署流水线骨架（实现者补全并把 action 固定到具体提交）：

```yaml
on: { push: { branches: [main] }, pull_request: {} }
jobs:
  deploy:
    steps:
      - checkout（含 submodules）
      - 安装 Node/pnpm；安装 Typst 0.15.0（校验版本）；缓存 ~/.cache/typst
      - run: pnpm check && pnpm build
      - run: pnpm exec wrangler deploy --name <gralgame | gralgame-staging>
        env: { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID }
```

### 9.5 桌面封装（暂缓实施）[已定：选 Tauri v2]

所有者要求的标准是**体积小、简洁易用**，选 **Tauri v2**。

|          | Tauri v2                                                     | Electron                          |
| -------- | ------------------------------------------------------------ | --------------------------------- |
| 体积     | 公开对比里空壳约 3–6 MB，真实应用常见 10–30 MB               | 空壳约 85 MB，真实应用 150–300 MB |
| 渲染引擎 | 系统自带：Windows WebView2、macOS WKWebView、Linux WebKitGTK | 自带 Chromium，各平台一致         |
| 代价     | 各平台渲染与 WebAudio 有差异；打包时需要 Rust 工具链         | 体积和内存                        |

选 Tauri 的理由：体积差一个数量级；直接复用同一份 `dist/`；默认权限最小。它的主要风险（系统 WebView 差异）对本项目影响较小，因为公式是 SVG、字体随包自带，不依赖系统字体或 MathML。没选 Electron 是因为体积；其他更轻的方案生态较小，没有评估。如果将来只想要"可安装、能离线"，也可以用 PWA（加 manifest 与 service worker）作为零封装的替代 [待定]。

**现在就要做的准备（零成本）：**

1. e2e 同时在 Chromium 和 WebKit 上跑（Playwright 都支持），提前暴露 WebKit 对跨 SVG `use` 引用、WebAudio、`Intl.Segmenter` 的差异。
2. 不使用只有 Chromium 才有的 API；不用 `window.open` 或外链。
3. 存档与设置的存储封装成接口（`src/platform/storage.ts`），将来桌面版可以换成文件存储。

**将来实施时（M7）：** 新增 `src-tauri/`；窗口按 16:9 逻辑比例；capabilities 保持为空（不开文件系统、shell、网络插件）；CI 在三个平台各打一次包（Windows `.msi`/`.exe`、macOS `.dmg`、Linux AppImage/`.deb`）；体积目标是资源体积加约 10 MB。

---

## 10. 测试策略

| 层                                                        | 内容                                                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元（vitest）                                            | `html-to-ir` 对小夹具的黄金测试；未知标签/缺失说话人必须报错；锚点解析规则；`step` 的状态转移；回滚与存档往返（`save→load→save` 相等）；`migrate`；分页算法（不切断公式/ruby）    |
| 属性测试                                                  | 随机操作序列下"前进 k 步再回滚 k 步 = 原状态"                                                                                                                                     |
| 管线集成                                                  | 对 `book/` 全量构建，断言 1.2 节的基线数字；公式去重后所有 `use` 引用都可解析                                                                                                     |
| 端到端（Playwright：Chromium + WebKit，有余力加 Firefox） | 启动 → 前进 50 句 → 存档 → 刷新 → 读档；截图比对关键画面（对话框含行内公式、黑板含块级公式和图）；断言控制台无错误；断言页面里没有未解析的 SVG 引用；打字机在含公式的句子上不抛错 |
| 视觉回归                                                  | 基线截图入库，像素容差可配；基线更新需要在 PR 里说明原因                                                                                                                          |
| 性能                                                      | 记录首屏时间与翻页耗时；回看面板在 500+ 条记录下仍能流畅滚动                                                                                                                      |

Playwright 浏览器首次需要 `pnpm exec playwright install chromium webkit firefox`。

---

## 11. 风险与待验证清单

| 风险                        | 说明                                                                                          | 对策                                            |
| --------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Typst HTML 导出仍属实验功能 | 需要 `--features html`，行为可能随版本变化                                                    | 钉死版本；金丝雀构建；契约测试                  |
| 行内公式基线对齐            | 标记方案在导出数据上可行，但没在真实浏览器里目测过                                            | M0 做对齐页面并截图                             |
| `use` 跨 SVG 引用           | 全局字形表被各内联 SVG 引用                                                                   | M0 在 Chromium/Firefox 实测；不行就内联子集字形 |
| 图里的 CJK 文字             | 沙箱里没配书的字体                                                                            | M0 带书的字体配置重跑                           |
| 公式无障碍                  | SVG 不可读                                                                                    | 7.7 的二次导出方案，v1 接受此缺口               |
| 深色主题下公式配色          | 红蓝标注对比度                                                                                | 先做浅色主题；深色 [待定]                       |
| 锚点漂移                    | 书更新导致演出层错位                                                                          | 5.7 的解析规则 + rebase 工具 + 金丝雀           |
| Pixi'VN 适配与许可证        | 见 7.8                                                                                        | 决策门 + 窄接口                                 |
| 回看/黑板性能               | SVG 数量大                                                                                    | 虚拟化；`content-visibility`；按课懒加载公式库  |
| 书的内容性质                | 放课后场景涉及亲人离世等沉重情节                                                              | 不改文本；是否在标题页加内容提示 [待定]         |
| WebKit / 系统 WebView 差异  | Safari 与将来的 Tauri 版用的是 WebKit 系引擎，SVG 字形引用、WebAudio 行为可能与 Chromium 不同 | e2e 双引擎；M0 就在 WebKit 上做对齐页面；见 9.5 |
| Cloudflare 限额             | 免费计划单文件 25 MiB、每版本 20,000 个文件                                                   | 9.4 的构建末尾检查；素材切块                    |
| 素材交付格式                | 源文件可能是 SVG 也可能是 PNG；SVG 转栅格后的边缘质量与体积未实测                             | M0 试验，结论写 ADR 0004（8.2）                 |
| 板书区坐标缺失              | 黑板特写背景若没有 `regions.board`，公式将无处显示                                            | 导入时检查并提问（8.6）；所有者交付时附上坐标   |

---

## 12. 里程碑

### M0 — 验证（约 1–2 天）

已完成：Typst 垫片可用；SVG 路线可导出整个阶段一；基线数字；标记方案提取基线（见附录 B）。

待完成：

1. 把垫片和 `build-typst.ts` 落进仓库，用书的字体配置重跑，目测 7 张图的 CJK 标签；
2. 字形去重原型，测量去重后体积（目标：阶段一公式库 gzip 后 ≤ 1.5 MB）；
3. 真实浏览器里的"对齐页面"：行内公式与汉字混排，含分式与下标，截图；`use` 跨 SVG 引用实测；
4. Pixi'VN 决策门（7.8）；
5. 字体子集化方案；
6. 素材交付格式（8.2）：拿 3 张背景和若干立绘做 SVG→WebP 的试验，比较体积与边缘质量，并实测立绘的显示比例（单人 0.9、多人 0.7）。

**完成标准：** `docs/decisions/` 里有 0001（引擎核心）、0002（公式 SVG 管线）、0003（字体）、0004（素材交付格式）四份 ADR。

### M1 — 文本管线

`html-to-ir` 完整实现，含严格模式、ID/锚点、公式库、字形表；`pnpm build:script` 一条命令产出阶段一全部 IR；单元与集成测试通过，基线数字入库。文本管线跑通后，完成素材导入工具，并导入全部 34 个角色的立绘和 3 张背景（8.6）；导入需要所有者提供原图，文件名对不上规则或缺少板书区坐标时按 8.6 提问，不要猜。

### M2 — 竖切原型

绪论课第一小节在网页里可玩：真实立绘和真实背景（含黑板特写，公式放进板书区）；对话框带行内公式；黑板显示块级公式与图；点击/回滚/自动/快进/回看可用。CI 部署管线（9.4）在本阶段就绪，之后每次合入 `main` 自动发布到 Cloudflare。

### M3 — 阶段一全量可玩

四节课加放课后全部可玩（立绘、背景是真实素材，音频用占位）；存档/读档/设置/标题/章节选择；`step`/回滚/存档的属性测试通过；e2e 流程通过。

### M4 — 演出层与素材接入

演出层 v1（至少绪论课和放课后有完整演出）；`manifest.yaml` 与校验；2–3 首 BGM 和基础音效替换占位（立绘与背景已在 M1/M2 接入）；覆盖率报告；演出层里给用到的场景配好立绘站位和黑板切换。

### M5 — 打磨与发布

标题与 UI 视觉精修、深色主题、画廊（可选）、无障碍检查、性能达标；发布到 Cloudflare 的生产 Worker；（可选）PWA 离线支持。

### M6 — 扩展

课堂提问式小测验（`choice`/`jump`，由演出层注入分支，书的文本不变）；阶段二到四随书更新接入。

### M7 — 桌面版（可选，暂缓）

按 9.5 用 Tauri v2 封装，三平台打包。

### 12.1 并行分工建议（多个 Agent 同时开工时）

**接口先行。** 先由一位 Agent 在 M0 末尾提交 `schema/`（IR、演出、素材清单、存档的 zod 定义）和 `tests/fixtures/` 里的小型 IR 夹具。之后可以并行：

| 方向     | 负责的目录                                                            | 开发时依赖                                               |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| 文本管线 | `typst/`、`tools/build-typst.ts`、`html-to-ir.ts`、`math-optimize.ts` | Typst、`book/`                                           |
| 核心     | `src/core/`                                                           | 夹具 IR，不等管线完成                                    |
| 界面     | `src/ui/`、`src/render/`                                              | 夹具 IR + 假状态；单独做一个开发页（如 `/dev/ui`）调组件 |
| 素材     | `tools/ingest-art.ts`、`check-assets.ts`、`assets/manifest.yaml`      | 收件箱里的原图；说话人列表（等文本管线）                 |
| 部署     | `.github/workflows/`、`wrangler.jsonc`、`public/_headers`             | 一个空的 `dist/` 即可                                    |

规则：一个文件只有一个负责方；改 `schema/` 要先写 ADR 并通知其他方向；每个 PR 只动自己负责的目录，跨目录的改动拆成两个 PR。

---

## 13. 给 Agent 的工作约定

- **小步提交。** 一个 PR 做一件事；提交信息用 Conventional Commits（`feat:`、`fix:`、`chore:`、`docs:`、`test:`）。
- **先写 ADR 再动大方向。** 换库、改 IR schema、改演出命令、改存档格式，都要 ADR；改 schema 要同时写迁移与测试。
- **不确定就写进 `docs/questions.md`**，格式：背景、选项、你的建议。继续做不依赖该问题的部分。
- **不要改动书的文本。** 对白里的标点、用字都是作者的选择；发现疑似笔误只记到 `docs/upstream-notes.md`。
- **素材相关：** 不生成或提交真实人物肖像；不抓取受版权保护的图/音；AI 素材的来源信息一定写进清单。
- **改动画面后必须看一眼**：至少跑 `pnpm e2e` 并查看生成的截图，不要只凭类型检查就宣布完成。
- **性能和体积是功能的一部分**：新增依赖要说明体积影响；新增 SVG/字体先看预算。

---

## 14. 待所有者决定

已决定：代码用 MIT；v1 只做网页，托管在 Cloudflare；不做配音；桌面封装选 Tauri v2（暂缓）；立绘与背景已完成。

仍待决定：

1. 素材（立绘、背景、音乐）的授权方式，与代码的 MIT 分开。
2. 标题页是否加内容提示（放课后的情节较沉重）。
3. 旁白字体是否沿用书里的朱雀仿宋，以及整体界面风格。
4. 是否需要手机竖屏支持。
5. 自定义域名（默认用 `workers.dev` 子域）。
6. 是否需要 PWA 离线安装（9.5）。
7. Cloudflare 账号与 API 令牌的创建（需要所有者本人操作，令牌只放 CI secrets）。
8. 素材交付到 `assets/_inbox/` 时附上：每张背景的板书区坐标（或在 SVG 里用 `id="board-area"` 标出），以及带锚点和尺寸的 JSON 清单（若有）。

---

## 附录 A：角色表（阶段一发言次数，基线提交 `442fc9e`）

`CharacterId` 为拼音 slug（`吕/肖虑` 的 ü 写作 `v`）。**立绘现状：** A 档（5 位主角）有 8 种表情；B、C 档（其余 29 人）都只有 `neutral`。B 与 C 的区别只用于将来补表情的优先级：B 档（发言 ≥ 7 次）优先，C 档（发言 ≤ 6 次）靠后。slug 以 `data/characters.yaml` 为准。

| 姓名 | CharacterId | 档  | 发言次数 | 身份 |
| ---- | ----------- | --- | -------- | ---- |
| 严佩 | `yan-pei`   | A   | 147      | 讲师 |
| 温舒 | `wen-shu`   | A   | 70       | 助教 |
| 明烛 | `ming-zhu`  | A   | 65       | 学生 |
| 杨秉 | `yang-bing` | A   | 54       | 教授 |
| 牛弘 | `niu-hong`  | A   | 14       | 助教 |
| 魏荷 | `wei-he`    | B   | 14       | 学生 |
| 李清 | `li-qing`   | B   | 13       | 学生 |
| 吉锲 | `ji-qie`    | B   | 11       | 学生 |
| 史姝 | `shi-shu`   | B   | 11       | 学生 |
| 赵超 | `zhao-chao` | B   | 11       | 学生 |
| 吕顺 | `lv-shun`   | B   | 9        | 学生 |
| 肖虑 | `xiao-lv`   | B   | 8        | 学生 |
| 施仁 | `shi-ren`   | B   | 7        | 学生 |
| 展庸 | `zhan-yong` | B   | 7        | 学生 |
| 窦法 | `dou-fa`    | C   | 6        | 学生 |
| 朱异 | `zhu-yi`    | C   | 6        | 学生 |
| 万籁 | `wan-lai`   | C   | 6        | 学生 |
| 詹布 | `zhan-bu`   | C   | 5        | 学生 |
| 卞苑 | `bian-yuan` | C   | 5        | 学生 |
| 章拒 | `zhang-ju`  | C   | 4        | 学生 |
| 金缡 | `jin-li`    | C   | 4        | 学生 |
| 石绅 | `shi-shen`  | C   | 4        | 学生 |
| 谭派 | `tan-pai`   | C   | 4        | 学生 |
| 许诺 | `xu-nuo`    | C   | 3        | 学生 |
| 隋欣 | `sui-xin`   | C   | 3        | 学生 |
| 杜颛 | `du-zhuan`  | C   | 3        | 学生 |
| 沈嗣 | `shen-si`   | C   | 3        | 学生 |
| 宗延 | `zong-yan`  | C   | 3        | 学生 |
| 刘津 | `liu-jin`   | C   | 2        | 学生 |
| 王霁 | `wang-ji`   | C   | 2        | 学生 |
| 郝祺 | `hao-qi`    | C   | 2        | 学生 |
| 狄雀 | `di-que`    | C   | 2        | 学生 |
| 游栖 | `you-qi`    | C   | 2        | 学生 |
| 吴郁 | `wu-yu`     | C   | 1        | 学生 |

角色的外貌、性格、经历散落在书的剧情里（书的序言里也写了这是给读者的小挑战）。素材 Agent 需要的设定表，由所有者另行提供或从书里整理，不属于本文件范围。

---

## 附录 B：M0 实测记录（2026-11-02）

环境：Typst 0.15.0（3ae52774），linux x86_64 musl，官方 release 二进制；书在提交 `442fc9e`。

1. **HTML 导出开关。** 不带参数：`error: html export is only available when --features html is passed`。带 `--features html` 可编译，但会打印"开发中，勿用于生产"的警告。
2. **包。** 需要的包：`cetz 0.5.2`、`mannot 0.4.0`、`quick-maths 0.2.1`、`oxifmt 1.0.0`（cetz 依赖）、`tiptoe 0.4.0`（cetz 依赖）。沙箱连不上 `packages.typst.org`，从 `github.com/typst/packages` 稀疏检出后放进 `$XDG_CACHE_HOME/typst/packages/preview/<名>/<版本>/` 即可离线使用。
3. **垫片可行。** root 下放符号链接 `book`、`lecture` 与复制的 `math.typ`，再放垫片 `utils.typ`：讲义文件里 `#import "/utils.typ"` 和 `#import "../utils.typ"` 都解析到了垫片，`lesson`/`ruby` 等覆盖生效。
4. **MathML 路线（默认导出）。** 只导出绪论课可以编译（259 个 `<math>`）；导出整个阶段一时失败，原因是 `mannot` 在 HTML 导出里取不到版面位置：`@preview/mannot:0.4.0/src/mark.typ:263`，`calc.min(..y-array)` 报 `expected at least one value`。
5. **SVG 路线。** 整个阶段一（`lecture/有理函数积分.typ`）编译通过，只有 3 条"pagebreak 被忽略"警告和 1 条"开发中"警告。结果：511 句对白、19 段旁白、34 个说话人、213 个块级公式、7 张图、4 处 `<ruby>`、1 个放课后段落（130 句）；标题映射 `h4` = 课、`h5` = 小节；HTML 标签集合仅含 `div p h4 h5 ul li strong ruby rt section` 和 SVG 内部元素；输出约 6.5 MB。说话人计数与对源码中 `chara.*` 的粗略统计完全一致。
6. **ruby。** 书里 `ruby` 用到了 `stack`，HTML 导出会忽略 `stack`；垫片重写后输出 `<ruby>刘<rt>niú</rt></ruby>`。
7. **字形重复。** 一次导出里字形定义约 5,526 个，不同 id 约 190 种；`<defs>` 约占 4.17 MB / 6.28 MB。
8. **行内基线标记。** 绪论课 194 个行内 SVG 全部带有标记，可从中读出基线；下沉量最大 0.83pt。阶段一里行内公式最高达 1.46em（分式）。
9. **未验证项：** 真实浏览器里的渲染与对齐；跨 SVG 的 `use` 引用；带书的字体配置时图中 CJK 文字；Pixi'VN 的具体 API 与许可证细节；公式库去重后的真实体积。

复现要点：

```
# 1. 解压 Typst 0.15.0 release；把上述 5 个包放进缓存目录
# 2. 组装 root：book、lecture 符号链接，math.typ 复制，utils.typ 与 entry-stage1.typ 放入 5.2 的内容
# 3.
typst compile entry-stage1.typ out.html --root . --format html --features html
```

## Design Context

### Users
Readers and visual-novel players using the browser to follow the lecture-story, read dense Chinese dialogue and mathematics, and navigate lessons at their own pace.

### Brand Personality
Bookish, thoughtful, quietly warm. The experience should feel like entering a carefully typeset lecture notebook rather than a generic web dashboard.

### Aesthetic Direction
Bookish elegance: refined editorial typography, warm paper-like dialogue surfaces, restrained classroom greens and wood tones, and traditional visual-novel staging. Keep formulas highly legible and let the source text remain the focus. Respect the project's current light-theme-first decision; avoid remote fonts and external assets.

### Design Principles
1. Reading comfort and formula clarity outrank decorative effects.
2. Preserve a calm, literary tone with restrained color and purposeful transitions.
3. Keep controls discoverable without competing with the dialogue.
4. Support keyboard navigation, scalable text, and reduced motion.
5. Do not invent or alter source dialogue or artwork to fill missing materials; show honest fallbacks.
