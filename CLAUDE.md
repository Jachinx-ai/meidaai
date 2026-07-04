# AI穿搭助手 · 高保真原型（给 AI 编码助手的项目说明）

任何 AI 编码助手（Claude Code / Codex 等）在修改本项目前，先读完这份文件。

## 项目定位（最重要）

这是一个**移动端网页高保真可交互原型**，用途是向团队成员演示产品的功能和流程。

- ✅ 只做：页面 UI、页面间跳转、模拟交互（假数据、假延时、localStorage 存状态）
- ❌ 不做：真实后端、真实 AI 能力、登录鉴权、数据库、任何服务端代码
- 团队成员都通过 AI 助手改代码（没有人手写代码），所以**代码要简单直白，改动要克制**
- 产品设计由项目负责人在 Figma 上出图，AI 依据设计图/口头描述改页面

## 技术约定（不要违反）

- **纯 HTML + CSS + 原生 JS**，多页面结构，双击 HTML 文件即可打开
- **禁止**引入 React/Vue、打包工具（webpack/vite）、npm 依赖、CSS 框架（Tailwind 等）
- 每个页面 = 根目录下一个独立 `.html` 文件，页内交互写在该文件的 `<script>` 里
- 公共部分只有三处：`css/base.css`（设计系统）、`js/app.js`（公共组件/状态）、`js/data.js`（演示数据）
- 本地预览：`npx http-server -p 8394`（配置在 `.claude/launch.json`），或直接双击 HTML

## 设计风格（wearwow 式黑白极简，务必保持统一）

设计令牌都在 `css/base.css` 的 `:root` 里，新页面必须复用，不许自造颜色/圆角：

- 白底 `--bg` + 近黑主色 `--ink`，卡片纯白大圆角（`--r-lg`/`--r-xl`）
- 按钮一律胶囊形：主按钮黑底白字 `.btn-primary`，次按钮白底描边 `.btn-ghost`
- 标题超粗（font-weight 900），正文用系统苹方
- **唯一的彩色**是粉→薄荷渐变 `--grad`，只准用在 AI 能力相关的元素上（`.ai-pill`）
- 每页顶部有假 iOS 状态栏 `renderStatusbar()`；主 tab 页底部有 `renderTabbar('key')`
- 参考对标产品截图：`design-reference/wearwow/`，风格笔记：`design-reference/wearwow-style-notes.md`

## 页面清单与流程

```
index.html          总览页（桌面演示用，手机壳网格展示全部页面）
login.html        → signup.html（邮箱注册）
                  → onboarding.html（4步引导：性别/职业/偏好/选单品）→ home.html
home.html           首页：AI推荐卡 / 场景chips / 成套搭配卡 → tryon.html / outfit-detail.html
tryon.html          模特试穿：?outfit=oX 或 ?item=tXX；底部抽屉换装、替换弹层、AI搭配
outfit-detail.html  穿搭详情：?id=oX
add-clothes.html    添加衣服：入口(深色) → 扫描 → 单品识别 → 入橱
create-model.html   创建模特：预设/我的照片、上传提示sheet、失败弹窗（"现在拍一张"=演示失败路径，"打开相册"=成功路径）
wardrobe.html       衣橱：单品/穿搭tab、圆形分类筛选、去搭配
history.html        试衣历史：场景筛选、编辑删除
profile.html        我的：收藏/模特两tab
```

底部导航五项：首页 / 衣橱 / 上传(+) / 试衣间 / 我的（见 `js/app.js` 的 `TABS`）。

## 数据与状态

- 演示数据在 `js/data.js`：`ITEMS`（15件单品）、`OUTFITS`（8套搭配）、`CATS`、`SCENES`
- 运行时状态存 localStorage（key `aiwd-state`），通过 `Store.get()/Store.set()` 读写：
  衣橱、收藏、试衣历史、用户上传的单品和模特照片、引导问卷答案
- 图片机制：单品图先找 `assets/real/<id>.png` → `.jpg` → 回退到 `assets/ph/<剪影>.svg` 占位图。
  给页面加单品图一律用 `itemImg(item)`，不要手写 `<img>`

## 修改守则

1. 改样式优先改 `css/base.css` 的变量或组件类，保持所有页面统一
2. 新增页面：复制一个现有页面做骨架，保留状态栏/底部导航/设计令牌
3. 新增单品/搭配：只改 `js/data.js`，并在 `assets/real/README.md` 登记新图片命名
4. 每完成一个改动主题，做一次 git commit（中文说明改了什么）
5. 演示假延时统一 600–2000ms，toast 提示用 `toast('文案')`
