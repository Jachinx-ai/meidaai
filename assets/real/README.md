# 素材图片文件夹

本文件夹存放全部真实素材图（230 件单品 / 79 套完整搭配，男女各 4 个场景）。

- **命名规范**：见项目根目录的 `素材命名规范.md`（性别-场景-套数-类别 四层编码）
- **产品数据**：由 `node server/tools/build-data.js` 扫描本文件夹自动生成 `js/data.js`，
  素材有增减后重跑该命令即可，**不要手改 js/data.js**
- **单品标签**：由 `node server/tools/tag-items.js` 用 AI 批量生成（存 `server/tools/labels.json`，
  新增素材后重跑，已打过的会跳过）
- 图片已统一压缩到最长边 800px；新素材放入后建议同样处理：
  `sips --resampleHeightWidthMax 800 图片名 --out 图片名`
- 搭配整图（可选）：命名为 `<搭配id>.png`（如 `f-work-03.png`），会自动作为首页卡片封面
