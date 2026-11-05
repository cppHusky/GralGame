# 素材收件箱盘点

盘点日期：2026-11-05（第二次交付）。盘点对象：`assets/_inbox/`。只记录现状；原图不入库。

## 背景（`bg_<场景名>.svg`，1920×1080）

| 文件                          | 用途                         | 导入结果                     |
| ----------------------------- | ---------------------------- | ---------------------------- |
| `bg_classroom_wide.svg`       | 讲课全景（默认背景）         | `assets/bg/classroom_wide.webp` |
| `bg_classroom_blackboard.svg` | 黑板特写（公式主舞台）       | `assets/bg/classroom_blackboard.webp` |
| `bg_lakeside_corridor.svg`    | 放课后 · 湖边长廊            | `assets/bg/lakeside_corridor.webp` |

黑板特写没有 `id="board-area"` 标记。板书区由 `data/backgrounds.yaml` 显式登记为
`[110, 92, 1180, 600]`（1920×1080 坐标，避开木框、对话框，并把右侧留给讲师立绘），
导入时写入清单的 `regions.board`。**这组坐标需要所有者确认。**

## 立绘（`_input/*.svg`，声明式 sprite sheet）

| 文件                      | 内容                           |
| ------------------------- | ------------------------------ |
| `yanpei_sprites_v3.svg`   | 严佩 8 种表情                  |
| `wenshu_sprites.svg`      | 温舒 8 种表情                  |
| `mingzhu_sprites.svg`     | 明烛 8 种表情                  |
| `yangbing_sprites_v3.svg` | 杨秉 8 种表情                  |
| `niuhong_sprites_v3.svg`  | 牛弘 8 种表情                  |
| `students_01.svg`         | 施仁、肖虑、李清、吉锲、吕顺、许诺、刘津、史姝 |
| `students_02_v3.svg`      | 赵超、窦法、隋欣、朱异、章拒、魏荷、王霁、杜颛 |
| `students_03.svg`         | 沈嗣、万籁、金缡、吴郁、石绅、郝祺、宗延、詹布 |
| `students_04.svg`         | 狄雀、游栖、卞苑、谭派、展庸（另有 3 个空格） |

处理方式见 `docs/decisions/0005-sprite-sheets.md`：按 sheet 自带的
400×600 网格 / 400×540 裁切框 / `<text>` 标签拆分为 69 张逐表情 SVG，
再由 `tools/ingest-art.ts` 导入为 800×1080 WebP。结果：34/34 个角色有
`neutral`，5/5 位主角有全部 8 种表情。

## 缺项

- 没有任何 BGM 或音效文件。运行时继续使用代码合成的占位音（课堂环境音、点击、
  粉笔、翻页、门滑轨、铃声），`bgm/`、`se/` 目录为空。
- 素材来源字段（`tool`、`date`、`license`）由导入工具写为 `TODO`，发布前必须补齐。
