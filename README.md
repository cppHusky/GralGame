# GralGame —《积分精选》讲义篇

将《积分精选》阶段一讲义改编为可在浏览器游玩的视觉小说。书稿通过 Typst 导出为 IR；对话、公式、黑板、存档和回滚由网页运行时呈现。

## 本地开发

要求 Node.js 24、pnpm 12.17.0、Typst 0.15.0 和 Python 3。第一次构建会按上游 SHA-256 校验并缓存朱雀仿宋字体；字体子集化使用仓库固定的 FontTools/Brotli。

```sh
pnpm install --frozen-lockfile
pnpm build:script
pnpm dev
```

完整检查与生产构建：

```sh
pnpm check
pnpm e2e
pnpm build
```

如果 Typst 不在 PATH，可设置 `TYPST_BIN=/path/to/typst`。浏览器 e2e 需要 Playwright Chromium 与 WebKit：`pnpm exec playwright install chromium webkit`。

## 部署

仓库使用 Cloudflare Workers Static Assets（没有 Worker API、数据库或遥测）。GitHub Actions 在 `main` 分支构建后发布到 `gralgame`；其他受信任分支的 push 发布到 `gralgame-staging`；pull request 只运行验证，不拿部署密钥。配置 GitHub Actions secrets `CLOUDFLARE_API_TOKEN`（仅需 Workers 编辑权限）与 `CLOUDFLARE_ACCOUNT_ID` 后自动部署。未配置密钥时构建照常通过并跳过部署。

## 素材与演出

31 张背景/立绘已从 `assets/_inbox/` 导入：9 张声明式 sprite sheet 由
`tools/extract-sheets.ts` 按格子自带的网格、裁切框和文字标签确定性拆分为 69 张
逐表情 SVG，再转成 800×1080 WebP（见 `docs/decisions/0005-sprite-sheets.md`）。
重新导入：

```sh
pnpm ingest:art
```

演出层在 `data/direction/stage1/<课>/<小节>.yaml`，由运行时按句应用背景、立绘、
表情、黑板与地点卡；`pnpm check:direction` 校验锚点和素材引用。
`docs/decisions/0006-direction-runtime.md` 记录黑板特写布局与状态驱动方式。

## 授权与素材

本仓库程序代码使用 MIT，见 [LICENSE](LICENSE)。MIT **不覆盖** `assets/` 中的插画、背景、音频等素材。素材必须依据 `assets/manifest.yaml` 单独核对来源与授权。书稿由 `book/` 子模块提供，授权以书仓库中的 LICENSE 为准。

`assets/bgm/` 与 `assets/se/` 仍为空，运行时使用代码合成的占位音；真实音乐/音效待所有者提供。占位音不会伪装成正式素材。
