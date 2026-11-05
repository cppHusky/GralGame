# ADR 0008：严格 CSP 下的 PixiJS 与校验库

- 日期：2026-11-05
- 状态：已采用

## 背景

`public/_headers` 为生产站点设置了严格 CSP（`script-src 'self'`，没有
`'unsafe-eval'`）。部署后发现立绘与背景全部消失，只剩 DOM 上的对白、公式、
UI 和合成音效。定位结果：

- 素材本身已上传，`/assets/ch/...` 返回 200；
- 页面里没有 canvas，`.stage` 退回 `stage-fallback`；
- 注入同样的 CSP 后浏览器报告 `script-src eval`：
  - PixiJS 8 默认用 `new Function` 生成 shader/uniform/UBO 同步代码，检测失败时
    主动抛错，渲染器初始化失败；
  - Zod v4 用 `new Function("")` 探测 JIT 能力，虽然异常被捕获，但仍会产生
    `securitypolicyviolation`；
  - Pixi 的图片解码 worker 由 `blob:` 创建，`worker-src` 缺失时被拦截。

开发服务器与 `vite preview` 都不会应用 `_headers`，所以此前的 e2e 没能发现。

## 决定

1. **不用 `'unsafe-eval'`。** 在入口最前面 `import 'pixi.js/unsafe-eval'`，让 Pixi
   使用官方的非 eval polyfill（shader/uniform/UBO/粒子同步）。
2. **Zod 关闭 JIT。** 新增 `src/zod-config.ts`（`config({ jitless: true })`），并
   作为第一个 import 加载，避免 `new Function` 探测触发 CSP 报告。存档解析量很小，
   解释执行的性能损失可以忽略。
3. **CSP 增加 `worker-src 'self' blob:`。** Pixi 的图片解码 worker 由 blob 创建。
4. **新增生产环境 e2e。** `tools/serve-dist.ts` 按 `public/_headers` 为 `dist/`
   提供同样的响应头；Playwright 的 `production-csp` 项目据此断言 canvas 存在、
   立绘/背景请求 200、没有任何 `securitypolicyviolation`。开发服务器的 e2e 继续
   覆盖其余流程。

## 后果

- CSP 仍然禁止 `eval`，也仍然只允许同源脚本。
- `pnpm e2e` 现在需要先有 `dist/`（CI 中 `pnpm build` 在 e2e 之前执行）。
- Pixi 包体会略增（polyfill 代码），换取在严格 CSP 下可用。
- 以后修改 CSP 或升级 Pixi/Zod 时，`production-csp` 测试会直接暴露回归。
