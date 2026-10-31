# 截图与摆拍工具

用 Playwright 打开 dev server（`npm run dev`）截图，用来检查画面、做图标和备案截图。
Playwright 和浏览器**不装进项目**：在临时目录 `npm i playwright@1 @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4`，
再从 cdn.playwright.dev 下载 Chromium headless shell（`npx playwright install` 在本机会卡住）。
把这些脚本复制到那个临时目录运行，环境变量：`CHROME=<headless_shell 路径>`，`MILL_URL`（默认 `http://localhost:5199/`）。

| 脚本 | 用途 |
|---|---|
| `shot.mjs <输出目录> 名字=?query@等待毫秒#脚本 …` | 截一张 1280×760 的图；`#` 后的 JS 在页面里执行后再等 `AFTER` 毫秒（默认 2500） |
| `icon.mjs <输出目录> 名字=?query …` | 1024×1024 摆拍：先注入 `stage.js`，再执行 `stage(名字)` |
| `stage.js` | 摆拍场景。名字 = `镜头-动物[-变体]`：`sun`（夕阳剪影）、`head`（头部特写，`-front` 正面光）、`top`（磨道构图，`-7`/`-730`/`-8` 是驴在磨道上的钟点位置；再加 `-pop` / `-popdusk` 换成头像用的鲜明配色） |
| `iconsheet.mjs <输出.png> 图…` | 图标对比：大图 + 微信列表 48/32 px，浅色与深色背景 |
| `sheet.mjs <输出.png> 图…` | 几张图横排对比 |
| `slim.mjs <输入.glb> <输出.glb>` | 裁剪模型：只留 Idle/Walk/Gallop/Eating 动画，resample + prune |
| `shrink.mjs <输入.glb> <输出.glb>` | slim 之后再跑：清掉残留的无用数据、量化网格，每个约 230 KB（`public/models` 现在就是这样处理过的） |

`stage.js` 依赖 dev 模式的 `window.__mill`（`yard`、`game`、`freedom`、`THREE`、`Animal`、`toFreedom()`）。
