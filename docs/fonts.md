# 字体构建

构建时从朱雀仿宋官方 GitHub release 拉取 `v0.212`，并校验上游 `book/fonts/pull-font.sh` 所记录的 SHA-256。字体来源与授权：TrionesType Zhuque Fangsong，SIL Open Font License 1.1。原始 TTF 缓存在 gitignored 的 `.build/fonts/`；不会随游戏发布。

`pnpm subset:fonts` 从阶段一 IR 和 UI 源码收集实际码点，使用 `requirements-fonts.txt` 锁定的 FontTools/Brotli 在 `.build/font-tools/` 虚拟环境中调用 `pyftsubset`，输出 `generated/fonts/ZhuqueFangsong-subset.woff2`。此文件由 Vite 随生成脚本部署。可通过 `PYFTSUBSET_BIN` 指定已有的 `pyftsubset`，或通过 `PYTHON_BIN` 指定 Python；`TYPST_FONT_PATH` 可覆盖 Typst 的字体搜索目录。

书的公式与图中的文字由 Typst 构建期转换为 SVG 路径；运行时公式不依赖该字体文件。
