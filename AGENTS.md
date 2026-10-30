# 拉磨 · Mill

第一人称 3D 网页小游戏：选一头牛 / 马 / 驴，绕着磨盘转圈拉磨。磨出的面粉用来升级磨（转得更快、更先进）和景（背景越来越美）。地平线上偶尔浮现草原蜃楼，奔向它有很小的概率挣脱绳子，走进真正的草原，游戏结束。

版本：`v1` 分支是第一个可玩版本的快照，**不要再往上提交**；之后的工作在 `v2` 上。

This file is the project's memory. Read it before working; update it when a decision is made or something non-obvious is learned. Keep it short and current — delete what is no longer true.

## 边界（不做的事）

- 纯静态前端，无服务器、无账号、无排行榜、无联机、无内购。
- 不引入物理引擎、不引入 UI 框架（React 等）。
- 不放第三方美术 / 音频素材：模型由几何体程序化生成，声音由 Web Audio 合成。若将来引入素材，只用 CC0（Kenney、Quaternius），并在此记录来源。
- 桌面端优先；手机端只保证"点左右半屏迈步"能玩，布局有基础适配。

## 调性

- 不恶俗。文案克制、留白，不玩"打工人"梗的直白嘲讽；美感优先。
- 前期灰黄、疲惫；越往后越通透、温暖、梦幻。草原那一刻要有反差。
- 画面精致靠：配色过渡、雾与天空同色、低多边形 flatShading、柔和阴影、少量 bloom，而不是堆模型。

## 技术

- Vite + TypeScript（strict）+ three.js r187。`npm run dev` / `npm run build`（build 先跑 `tsc --noEmit`）。
- 渲染：WebGLRenderer + NeutralToneMapping + EffectComposer（RenderPass → UnrealBloomPass → OutputPass）。
- 天空是自写渐变着色器（`world/sky.ts`），不用 three 的 Preetham Sky：为了让地平线颜色 == 雾色，远山无缝融入。
- 环境光照：PMREM 从天空单独渲染（`Yard.refreshEnvironment`），调色变化后节流刷新。
- 存档：localStorage，`mill.run.v1`（当前一局）、`mill.meta.v1`（已获自由的动物）。读写都 try/catch。

## 已定的设计决定

- **视角是"骑手视角"**：相机在头的稍后上方（`VIEW_LIFT`），画面下方能看见自己的后脑、耳朵/角。试过纯眼睛位置 + 顶部露耳朵，耳朵像悬空的锥子，否掉了。
- **磨在身侧，默认看不见**：头默认向内偏 `HEAD_YAW`，鼠标移到屏幕右侧会转头看磨；升级磨后自动"回头看一眼"（`glance`）。
- 磨的各档只加不减，院子保留历史；新档"长出来"（缩放动画）。
- 蜃楼浮在地平线上方并带倒影；成功与失败在前 1.25 秒完全一样，悬念到绳子绷紧那一刻才揭晓。
- 自由后：草原里会出现此前获得自由的动物（meta 存档）。
- **马头保留 v1 的比例**（圆后脑 + 斜向下的脸 + 小耳朵靠拢）；试过窄长的"写实"比例，用户反馈看不出是马，否掉了。驴、牛用 `skullGeometry` 的单体雕刻头（`SHAPE` 控制比例）。驴耳不要太大（现 0.26）。
- 鬃毛 / 额毛 / 尾巴是实例化的发丝（`hair()`，一根锥形带子，根部深、尖端浅，随 `hairClock` 摆动）。骑手视角下脖子大多被头挡住，马鬃只能向右侧垂下才看得见。
- 铜轮磨的传动必须连得上：大齿轮在立轴上 → 小齿轮压在大齿轮边上 → 传动轴挂在横梁下穿过立柱 → 皮带轮；蒸汽磨的锅炉在那根立柱后面，飞轮用皮带带动皮带轮。不要再有悬空的零件。
- 界面：字号 / 墨色层级 / 圆角都在 `style.css` 顶部的变量里，新样式只用这些变量。HUD 角落有一层 `.scrim` 暗角，保证亮天空上字也看得清。换档用 `ui.tier()` 出大标题，不用普通 toast。

## 代码地图

```
src/
  config.ts      所有数值与文案（动物、经济、节奏、蜃楼概率、台词）
  main.ts        启动、渲染循环、模式切换（title / mill / freedom）、dev URL 参数
  game.ts        拉磨玩法：步调、转圈、面粉、升级、蜃楼调度、冲刺与保底
  freedom.ts     结局草原（独立 Scene，草地随相机无限平铺）
  ui.ts          DOM 覆盖层（标题、HUD、提示、结局）；游戏代码不直接碰 DOM
  audio.ts       Web Audio 合成音效（class Sound）
  input.ts       键盘 / 指针 → Intent
  save.ts        存档
  util.ts        随机数、插值、地形高度函数
  world/
    yard.ts      磨坊场景总装：天空、光、雾、地、磨、粒子、蜃楼；调色过渡
    palette.ts   5 档景色调色板，按景等级连续插值
    land.ts      地面、远山、树、草、花、篱笆、房子（按等级"长出来"）
    mill.ts      5 档磨（石磨→木架磨→铜轮磨→蒸汽磨→星辉磨），只加不减
    mirage.ts    蜃楼（含倒影），清晰度随失败次数提高
    animals.ts   第一人称头颈、远景整只动物、发丝（鬃毛 / 尾巴）
    particles.ts 尘 / 花粉 / 萤火、花瓣
```

## 数值（config.ts）

用模拟脚本调过（按约 75% 努力程度估算），目标：
- 约 13 分钟解锁蜃楼（景 Lv5）。
- 自由：中位约 35 分钟，最晚约 55–60 分钟（硬保底：失败 29 次后必成功）。
- 全部升满约 65–70 分钟。
- 概率 = 0.8% + 0.5%×(景等级−5) + 0.35%×失败次数（驴 +0.4%）。景越美越容易自由，这是有意的。
- 保底要"被感受到"而不是被读到：蜃楼的 `clarity` 随失败次数变清晰，每 5 次失败给一句提示。

改经济数值时请重新跑一遍模拟，确认上面几项没跑偏，并更新这里。

## 开发技巧

- dev 模式 URL 参数直接跳状态看画面：`/?scene=17&mill=17&flour=1e5&fails=20&animal=horse&play`
  （不带 `play` 停在标题页；会写入存档）。
- `window.__mill` 在 dev 模式暴露 `yard`、`game`。常用：
  - 立刻出蜃楼：`__mill.game.mirageTimer = 0`；摆到正前方：`__mill.yard.mirage.place(__mill.game.run.angle + Math.PI/2 + 0.3, 105)`
  - 强制冲刺：`__mill.game.promptShown = true; __mill.game.dashIntent()`（`run.mirageFails = 29` 必成功）
  - 模拟迈步：对 `window` 派发 `KeyboardEvent('keydown', { code: 'KeyA' / 'KeyD' })`
- 截图脚本可以注入一段 JS 再截图（用来触发升级、蜃楼、冲刺），见临时目录里的 `shot.mjs` 写法：`name=?query@等待毫秒#脚本`。
- 截图验证画面：用 Playwright + Chromium headless shell（`--use-angle=metal`）打开 dev server 等 3 秒再截。
  `npx playwright install` 在本机会卡住，直接从 cdn.playwright.dev 下载 headless shell 的 zip 并用 `executablePath` 更可靠。
  headless Firefox 的 `--screenshot` 在 load 时就截图，拿不到 WebGL 画面，别用。
  这些工具放在临时目录，不要装进项目。

## 已知待办 / 想法

- 手机端：HUD 布局更紧凑、触屏提示文案。
- 已获自由的动物可以再做成"图鉴"。
- 动物的写实程度受限于程序化几何；若要真正写实，需要 CC0 模型（目前没找到合适的写实牛马驴）。
- 蜃楼里奔跑的小动物剪影很粗糙，可以重做。
- 自由草原：可以加天黑、星空、和同伴并肩跑等后续。
- 首次游玩引导：现在只有一行操作说明。
- 性能：低端机可降 shadowMap 尺寸、关 bloom。
