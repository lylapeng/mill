# 拉磨 · Mill

第一人称 3D 网页小游戏：选一头牛 / 马 / 驴，绕着磨盘转圈拉磨。磨出的面粉用来升级磨（转得更快、更先进）和景（背景越来越美）。地平线上偶尔浮现草原蜃楼，奔向它有很小的概率挣脱绳子，走进真正的草原，游戏结束。

## 分支与上线

- `v1`（第一个可玩版本）、`v2`（界面精修 + Quaternius 模型 + 封面轮廓）是快照，**不要再往上提交**。用户说"保存这一版"= 冻结当前分支，后续开下一个 `vN`。
- `v3`：网页版的工作分支。`main` = 线上版本（与 `v3` 同步）。
- `minigame`：小程序/小游戏版，从 `v3` 分出（见下文「小游戏版」）。网页版的修复要同步过来（`git merge v3`）。这个分支重构了共用代码（`platform.ts`、`app.ts`、`ui-api.ts`，网页版也在用），合并 v3 时注意冲突；反过来网页版也可以直接从这个分支上线。
- `xhs`：小红书版，从 `minigame` 分出（2026-10-31）。微信真机跑通的状态打了 tag `minigame-wx-ok`。**小红书专属的东西放新文件 / 新入口，不改 `src/minigame/` 和 `minigame/` 里的微信代码**；要动共用代码时，同时跑 `npm run build:minigame` 确认微信版不受影响。
- 上线：GitHub Pages，https://lylapeng.github.io/mill/ （仓库 lylapeng/mill，公开）。`.github/workflows/deploy.yml` 构建 `main`。
  **推送 `main` 目前不会自动触发部署**（原因未查明，GitHub 状态正常），发布要手动：`gh workflow run deploy.yml -R lylapeng/mill --ref main`。
- Cloudflare Pages（国内访问稍快）：待用户在 Cloudflare 后台连接 GitHub 仓库（生产分支 `main`，构建 `npm run build`，输出 `dist`）。

## 小游戏版（进行中）

- **已上线（2026-11 初，名字「拉磨的日子」）**，上线的是 7707d5d（没有单手和鹿）。之后在 `minigame` 上合进了 `xhs`（单手 + 鹿的共用代码；小红书专属文件进了这个分支也不会打进微信包），并加上：单手模式（`CanvasUi` 第 5 个参数 `true`，第 4 个是封面名）、**第一次自由后解锁鹿**（`src/minigame/stag.ts`：`mill.meta.v1` 有人自由过就解锁，老存档直接有；未解锁时封面灰鹿「自由后解锁」，点开只有一句「等你第一次走进草原，它就会来。」；第一次出现时名字下写「新来的」、身上亮一圈暖光后退掉，`mill.stag.v1` 记住只迎一次。不碰关注 / 分享：微信禁止奖励诱导关注）。鹿模型从 `xhs/models/stag.glb` 拷进包，包约 2.1 MB。**这一版只在 sim 里验过，还没真机、还没提交审核。** 目标：微信小游戏，之后小红书。用户已注册微信小游戏账号、已装微信开发者工具。
- **备案类型是「单机」**（小游戏备案）：所有功能离线可用。模型、字体都打进包里，**运行时不能从网上下载任何资源**，否则变成"联网"、要走小程序备案和 ICP 域名。以后加排行榜/云存档等需要服务器的功能会改变备案类型。
- 个人主体上架（据 2022 年前后资料，以后台为准）：计算机软件著作权登记证书（最慢，几周到几个月）+ 游戏自审自查报告；不开支付不需要版号。
- **构建**：`npm run build:minigame` → `dist-minigame/`（game.js + game.json + project.config.json + share.jpg + models + fonts，约 2 MB，主包够用，不需要分包）。开发者工具里"导入"这个目录。**注意开发者工具记的是绝对路径**：它一直打开的是 `~/code/mill/dist-minigame`（2026-10-31 导入），那个文件夹里是谁最后在 `~/code/mill` 构建的就是谁的版本；2026-11-12 用户在工具里看不到封面曲，就是因为新包构建在 `~/code/mill-minigame` 里。建议改为导入 `~/code/mill-minigame/dist-minigame`。AppID `wxd83fd8d0e81f091b`（在 `minigame/project.config.json`）。
- **WebGL2 是硬要求**（three r163 起不支持 WebGL1）。拿不到 WebGL2 时显示一句"这台手机暂时跑不动"。不支持浮点渲染目标的手机自动关 bloom 和环境光贴图（`App` 里判断）。
- **iOS 高性能模式：后台已开通，但 game.json 里没打开**。打开 `iOSHighPerformance` + `iOSHighPerformance+` 后 iPhone 16 上整屏不停闪（原因未查明，网上也没找到现成答案）；普通模式下 iPhone 16（iOS 18）本身就有 WebGL2，一切正常。老 iPhone（iOS 15–17）普通模式下有没有 WebGL2 还没验证。以后要再试，先只开 `iOSHighPerformance`（不带 +），一次只改一个变量。
- **竖屏**（game.json `deviceOrientation: portrait`）。竖屏时 `fitFov` 把垂直视角放大到横向至少 52°；界面按竖屏排过版。横屏的游戏画面能用，但**封面在横屏手机上会挤在一起**（三只动物压住标题），真要横屏得重排封面。
- 架构（网页版也走同一套）：
  - `platform.ts`：存档、时间、声音上下文、读包内文件、画质（像素比、阴影、草量）。网页是默认实现，小游戏启动时 `setPlatform` 换掉。
  - `app.ts`：标题 → 拉磨 → 草原的整体流程和渲染，两个入口共用。`main.ts`（网页）和 `minigame/main.ts`（小游戏）只管画布、UI、输入和帧循环。
  - `ui-api.ts`：`GameUi` 接口。网页用 DOM（`ui.ts`），小游戏用 `canvas-ui/`：在第二张 2D 画布上**立即模式**重画，作为纹理盖在 3D 画面上（`Overlay`）；最多 30 次/秒重画、有变化才上传。小游戏只有一张上屏画布，没有 DOM。
  - 封面轮廓用主渲染器画到 render target 再读回像素（小游戏开不了第二个 WebGL 上下文）。
  - 触屏：左右半屏迈步；按住一边 = 草原里转向；横向拖动 = 转头看磨（`input.ts`）。蜃楼提示是可点的"奔向它"按钮（网页版的提示现在也可以点，手机网页终于能冲刺）。
  - 右上角卡片放在微信胶囊按钮下面（`getMenuButtonBoundingClientRect`）。
- **字体**：小游戏的画布用不了系统宋体，所以打包了思源宋体（Noto Serif SC，OFL）的子集 + 马善政"拉磨"两字，都是 TTF（`minigame/fonts/`，约 110 KB）。**改了任何玩家能看到的文字后，跑 `node tools/minigame/fonts.mjs` 重新子集化**（开发时从 Google Fonts 下载，运行时不联网）；缺字会退回系统字体。
- **测试**：本机没有真机，用 `tools/minigame/sim.html` 在浏览器里模拟微信环境跑打包后的 game.js（`python3 -m http.server 5300` 起在仓库根目录，开 `/tools/minigame/sim.html?debug`，`__mill` 是 App）。它会藏掉 window/document/fetch 等、删掉 TextDecoder、去掉 Web Audio 的 convolver 和 stereo panner，能抓到大部分"用了浏览器 API"的问题，**但替代不了真机**：WebGL2 兼容性、性能、字体加载、声音都要扫码在手机上看。
- 声音跟随 iPhone 静音开关（微信默认）：开着静音就没声音，这是有意保留的，不用 `obeyMuteSwitch: false` 盖过去。
- 微信 Web Audio 没有 convolver / stereo panner（文档确认），`audio.ts` 退回延迟混响、不做声像；`connect()` 不能链式写（用 `link()`），声音出任何错只会静音、不会卡住游戏。
- **着色器里不要写倒过来的 `smoothstep(大, 小, x)`**（GLSL 规定结果未定义）：浏览器能算对，iPhone 微信上会出 NaN，表现为画面里飘的黑点。写成 `1.0 - smoothstep(小, 大, x)`。`pow` 的底数也要保证 ≥ 0。
- **发布前检查清单**（每次上传前在真机上过一遍；漏过分享：上线后发现 ··· 菜单里「转发」是灰的）：
  - 分享：··· 菜单里「转发给朋友」「分享到朋友圈」都能点，卡片标题、图片正常（`src/minigame/main.ts` 的 `showShareMenu` / `onShareAppMessage` / `onShareTimeline`，2026-11-04 才加上；卡片图是包里的 `minigame/share.jpg`（5:4，传 `imageUrl`），不用默认截图，因为 WebGL 画布可能截成黑的）。
  - 封面、选动物、单手、拉磨、蜃楼、存档（关掉重开还在）；屏幕上没有「出错了」。
- 影子：微信版是 2048 + `shadowRadius: 2`（2026-11-04，用户反馈动物影子边缘有锯齿）。sim 里按 1.5 倍渲染比过金暮的马影：1024 台阶明显，2048 r1 还有小台阶，r2 平滑，r3 开始看得见 three 的采样噪点（r187 的 PCF 只有 5 个采样、按像素旋转，半径不是越大越好）。**真机还没看，也没量过 2048 在手机上的开销**；要是卡或发烫，先退回 1024 + r2。 网页版原来是 2048 + r1，用户在网页上看到影子边缘在运动中波动（动物和磨杆的影子扫过阴影贴图的格子），2026-11-12 改成和微信一样的 r2（`platform.ts` 默认画质）。
- 测试阶段，小游戏出错会把错误直接显示在屏幕上（`minigame/main.ts` 的 `report`，含字体没生效、声音没启动）；上线前要关掉或改成只记日志。
- 真机：iPhone 16 已跑通（普通模式下：画面、字体、声音、触屏都正常；高性能模式见上）。待办：完整玩一局看后期卡不卡、发不发烫；安卓试一台；性能不够再降（像素比 1.5 → 1.25、关 bloom）；备案截图按竖屏界面重拍。
- **微信上的名字是「拉磨的日子」**（「拉磨」已被占用）。只改小游戏封面：`CanvasUi` 构造参数传入名字（`src/minigame/main.ts`），字多时标题收紧字距、按屏宽缩小；马善政子集含「拉磨的日子」。网页版、小红书版仍叫「拉磨」。介绍文案：一圈，又一圈。选一头牛、马或驴，绕着磨盘拉磨，磨出的面粉用来升级磨坊和风景。地平线上偶尔浮现草原——奔向它，也许能挣脱绳子。
- 头像：用户反馈旧的驴拉磨图色调不鲜明、驴和磨颜色分不开。新配色候选在 `~/Desktop/拉磨图标/新配色/`（`stage.js` 的 `top-donkey-7-pop`：奶油色石磨、深灰驴、去掉石板、白天光，推荐这张）。
- 头像：候选在 `~/Desktop/拉磨图标/`（用 `tools/shots/icon.mjs` 在游戏里摆拍渲染）。用户喜欢的方向：驴头特写（正面夕阳光，`head-donkey-front`）、驴拉磨构图（`mill-donkey-7oclock` 等）。还没最终定。
- 备案截图与各场景描述文案在 `~/Desktop/拉磨图标/备案截图/`。**这些是网页版横屏截图**；小游戏版要按竖屏界面重拍。
## 小红书版（`xhs` 分支）

- 走的是「小工具」（创作后台 Builder Hub → 小工具，**个人可发**），不是需要企业认证的「小程序」。本质是离线 H5 zip，挂在笔记下面。
- 规范来自官方 Skill `minitool-zip-builder`（口令在上传页「第一步」，版本会更新，**每次用上传页当前的口令**）。Skill 装在 `.claude/skills/minitool-zip-builder/`，不进 git（小红书的文档）。在线能力清单：https://miniapp-sandbox.xiaohongshu.com/minitool/doc
- 硬规则：zip 里只许 html/css/js/图片/woff(2)/json（**没有 .glb、.ttf、.txt**）；不许 fetch、内联脚本、`type="module"`、eval/Worker/WASM；JS 要能在 Chrome 61 跑（ES2017）；建议 zip ≤ 2 MB。
- 做法：`npm run build:xhs` → `dist-xhs/` + `dist-xhs.zip`。入口 `src/xhs/main.ts`，用微信版的画布界面（`canvas-ui/`，竖屏已排好、不涉及 CSS 兼容）盖在一张页面画布上。模型在构建时转成 `models/*.js`（base64 写进 `window.__millFiles`）；字体用 WOFF2（`tools/xhs/fonts.mjs` 子集化，改文字后和微信的一起跑），OFL 授权全文由构建写进 `style.css` 的注释。存档用容器 Storage API（客户端 9.46+，启动时读进内存），否则 localStorage。
- three.js r187 的渲染器直接用 `WeakRef` / `FinalizationRegistry`（Chrome 84+），`src/xhs/compat.ts` 给老 WebView 补了替身。构建时把残留的 `fetch(` 换成拒绝的桩，并扫描禁用写法，命中就构建失败。
- 本机验证：headless Chromium 竖屏 + 模拟容器 CSP，封面、选动物、拉磨、存档都正常，去掉 WeakRef 也能跑。真机上验过；**小工具已发布（2026-10-31）**。**微信版（「拉磨的日子」）已上线（2026-11 初）**，上线的是 `minigame` 分支 7707d5d，没有单手和鹿。
- 清晰度：3D 最高 2 倍像素比（受约 200 万像素预算限制），界面画布是叠在上面的独立 DOM 画布、按屏幕原生像素比（最高 3）画，所以字是锐的（小游戏只有一张画布，才需要把界面贴进 3D）。像素比取 `devicePixelRatio` 与容器 `getWindowInfo().pixelRatio` 的较大者。自动降档前 6 秒不计（编译着色器那几秒会被误判成卡）。第一版只有 1.5 倍、界面也跟着 1.5 倍，用户在小红书里看着"糊"。
- 影子：用户在小红书真机上看到地上的影子有锯齿、跟着磨杆扫过时"飘"。原因推测是手机 GPU 对阴影的硬件过滤少，1024 的阴影贴图在低太阳（流霞景 4°）下每格在地上拉长到半米多。小红书版改成 2048 + `shadowRadius: 3`（`Quality.shadowRadius`，可选，网页仍是默认 1）。本机 Mac GPU 上复现不出来，**还没在真机上确认改好了**；如果还有，把太阳最低仰角抬高（会改变黄昏的光感）或阴影相机跟随镜头。
- `?debug` 时 `window.__mill` = App（截图用）。上架截图在 `~/Desktop/拉磨图标/小红书截图/`（1170×2532，用打包后的 dist-xhs 拍）。
- **关注解锁「鹿」**（文档 §3.15，客户端 9.51+，`src/xhs/follow.ts`）。平台规则：使用满 20 秒后才能引导关注；每人每天最多拉起 3 次（平台自己上限 10 次）；不能用关注卡住流程或存档；弹窗要清楚；用户关掉后不能接着再弹。做法：鹿一开始就在封面上（灰色，「关注后解锁」），但前 20 秒点开只显示「再待一会儿，就可以解锁」，累计使用满 20 秒后按钮当场出现（不用重开）；只在玩家点「关注作者 · 解锁」时调用 `followAuthor`，旁边有同样大小的「算了」；关掉（20002）就什么都不做；3 次用完显示「今天先到这里，明天再来」。启动时静默查 `getFollowStatus`，已关注直接解锁；解锁后永久保留，取关也不收回。是否支持看两个方法在不在：读得到版本号且低于 9.51 才算不支持（第一版要求必须读到 ≥ 9.51，上传预览里鹿一直不出现，原因未确认）。不支持时整个入口隐藏。试过一个隐藏诊断（连点标题 5 下显示接口情况），用户在真机上没看到字，已删掉；接口在真机上通没通，**还没确认**。鹿的数值和马相同（不用重跑经济模拟），模型在 `xhs/models/stag.glb`，小红书和微信包都带，网页不加载。
- 以后的解锁候选：独角兽（白马模型 + 程序化的角，挂在 `Head` 骨骼上；能和蜃楼里的白马接上）。
- **单手模式**（用户建议，小红书版和微信版开：`CanvasUi` 第 5 个参数，网页版没有）。封面底部选「双手 / 单手 · 左 / 单手 · 右」，拉磨时静音按钮旁的圆钮可以循环切换，选择存在 `mill.prefs.v1`。单手时只有一只蹄子，在那一侧的下角（`hoof()`、`stepSide()` 返回 `'one'`），每点一下自动换脚（`Input.foot`），所以单手不会因左右点错而踉跄，只看节奏；最早是两只蹄子并排、要交替点，用户觉得单手还要分左右不方便，改成一只。步调条在蹄子上方，「奔向它」挪到拇指够得着的地方；草原里按住蹄子左右拖转向（`STEER_DRAG`）。点在蹄子以外的手指只用来转头看。右上角的升级卡片没动（左手够不着，升级不常点）。
- 可以以后加的容器能力：`postNote`（把画面截图发成笔记）、排行榜/云存储（内测，会让游戏联网）。

## 图标 / 摆拍的经验

- 平面渐变 + 剪影 + 半透明"磨"字的头像，用户觉得都不好看；用游戏引擎在场景里摆拍效果好得多。
- 一个主体、轮廓清楚、缩到 32 px 能认出；俯视磨道在小尺寸下会糊。
- 逆光剪影要关 bloom（否则被冲淡），太阳直接画进天空着色器；逆光下的脸会太黑，要么补光，要么让夕阳从镜头这边照过来。
- 驴绕磨行走时**身体与磨道相切、磨杆沿半径**连到肩上；从正面看，要让驴身水平、头朝左，只能放在 7–8 点钟方向（6 点 = 离镜头最近，9 点 = 左）。放在 9 点是错的。
- 给用户看的文件放 `~/Desktop/拉磨图标/`，不要只给临时目录路径（用户找不到）。

This file is the project's memory. Read it before working; update it when a decision is made or something non-obvious is learned. Keep it short and current — delete what is no longer true.

## 边界（不做的事）

- 纯静态前端，无服务器、无账号、无排行榜、无联机、无内购。
- 不引入物理引擎、不引入 UI 框架（React 等）。
- 第三方素材只用 CC0（字体可以用 SIL OFL），并在此记录来源。场景、磨、树由几何体程序化生成；声音由 Web Audio 合成，只有鸟叫是真实录音。
- **素材来源**：`public/models/*.glb` 是 Quaternius「Ultimate Animated Animal Pack」（CC0，经 poly.pizza 下载）：horse、horse-white、donkey、ox（原为 Bull，代码里改成黄牛色）；小红书版另有 `xhs/models/stag.glb`（Quaternius「Stag」，CC0，poly.pizza/m/tQdzbZ1Cmw，同样裁剪，约 260 KB）。只保留了 Idle / Walk / Gallop / Eating 四套动画（用 `tools/shots/slim.mjs`，再用 `shrink.mjs` 清残留并量化网格，四个共约 940 KB；依赖装在临时目录）。
- **字体**：小游戏另带思源宋体（Noto Serif SC，SIL OFL 1.1）子集，授权在 `minigame/fonts/OFL-NotoSerifSC.txt`。封面标题"拉磨"用马善政楷书（Ma Shan Zheng，SIL OFL 1.1，Google Fonts），只裁出这两个字（`public/fonts/mashanzheng-lamo.woff2`，约 2 KB），授权文本在 `public/fonts/OFL-MaShanZheng.txt`。其余文字仍用系统宋体（用户觉得现在的字体就不错）。
- **鸟叫**：`public/sounds/*.mp3` 是 iNaturalist 上标为 CC0（no rights reserved）的录音，裁短、滤低频、降噪、统一音量（共 88 KB）。选录音先看原声响度：原声太轻的放大几十 dB 也没用（用户听过，换掉了一段）。噪声门只对声音之间有空隙的录音有用，连续的录音会多出噪声开关感。来源（observation / sound）：大山雀 204405337 / 943957（song）、69135805 / 162495（call）；蓝山雀 212876436 / 1012316（song）、105628394 / 350618（call）；麻雀 356654974 / 1913285（song）、230438141 / 1137651（call）。Commons 和 xeno-canto 的基本是 BY-SA 或非商用，不能用。小红书包里不能有音频，构建时写成 `sounds.js`（base64）。
- 桌面端优先；手机端只保证"点左右半屏迈步"能玩，布局有基础适配。

## 调性

- 不恶俗。文案克制、留白，不玩"打工人"梗的直白嘲讽；美感优先。
- 前期灰黄、疲惫；越往后越通透、温暖、梦幻。草原那一刻要有反差。
- 画面精致靠：配色过渡、雾与天空同色、低多边形 flatShading、柔和阴影、少量 bloom，而不是堆模型。

## 技术

- Vite + TypeScript（strict）+ three.js r187。`npm run dev` / `npm run build`（build 先跑 `tsc --noEmit`）。
- 渲染：WebGLRenderer + NeutralToneMapping + EffectComposer（RenderPass → UnrealBloomPass → OutputPass）。bloom 的阈值过渡要宽（`smoothWidth` 0.35）：默认 0.01 时阈值等亮线会变成光晕的硬边，低太阳周围出现过钟形/抛物线状光晕。天空渐变不要用 `sqrt(高度)`（地平线处斜率无穷大，会把光晕拉成钟形）。
- 天空是自写渐变着色器（`world/sky.ts`），不用 three 的 Preetham Sky：为了让地平线颜色 == 雾色，远山无缝融入。
- 环境光照：PMREM 从天空单独渲染（`Yard.refreshEnvironment`），调色变化后节流刷新。
- 存档：经 `platform` 存（网页 localStorage、小游戏 `wx.setStorageSync`），`mill.run.v1`（当前一局）、`mill.meta.v1`（已获自由的动物）。读写都 try/catch。

## 已定的设计决定

- **视角是"骑手视角"**：相机在头的稍后上方（位置见 `models.ts` 的 `RIDE`），画面下方能看见自己的后脑、耳朵/角。试过纯眼睛位置 + 顶部露耳朵，耳朵像悬空的锥子，否掉了。
- **磨在身侧，默认看不见**：头默认向内偏 `HEAD_YAW`，鼠标移到屏幕右侧会转头看磨；升级磨后自动"回头看一眼"（`glance`）。
- 磨的各档只加不减，院子保留历史；新档"长出来"（缩放动画）。
- 蜃楼浮在地平线上方并带倒影；成功与失败在前 1.25 秒完全一样，悬念到绳子绷紧那一刻才揭晓。
- 自由后：草原里会出现此前获得自由的动物（meta 存档）。
- **动物用 Quaternius 模型**。试过程序化头部 + 发丝鬃毛 / 渐变色块鬃毛，用户更喜欢 Quaternius 的样子（骑手视角下能看到耳朵和顺着脖子的鬃毛）。
- **体型要拉开**：马明显比驴大（`HEIGHT`：马 2.05、牛 1.65、驴 1.2，指耳尖高度）。骑手视角里模型保持真实大小、不按体型缩放偏移，所以马的头颈在画面里约是驴的两倍宽，视线也高出一截（马越过篱笆，驴与篱笆齐平）。用户反馈过"大小看起来无差别"。
- 第一人称的身体（`Rider`）跟着相机位置，但有自己的朝向：转头看磨时只是眼睛在转，身体只跟一点（`clamp(yaw, -0.5, 0.45)`）。相机高度由模型算出（`Rider.eyeHeight`），保证蹄子踩在地上；头骨（`Head` 骨骼）在相机坐标里的位置见 `RIDE`。身体挂在以头为支点的 `sway` 组上，走路时背部左右摆、头微点，节奏取 `walkPhase`（之前身体死贴镜头，用户觉得僵）。牛的镜头要比马驴更高（`RIDE.ox.y`），否则背上的隆起会占满画面下方。
- 耳朵抽动是在动画之上叠加的骨骼旋转（`Ear1L/R`，GLTFLoader 会去掉名字里的点）；每帧先撤销上一帧的叠加量，否则动画不碰耳朵时会累积。牛模型没有耳朵骨骼。
- **鸟跟着景慢慢靠近**（`config.ts` 的 `BIRD`、`birdStage`；`world/bird/`）：黄土没有鸟；场景 Lv5 起小群远飞（36 米）；场景 Lv7 起有鸟叫，小群近飞（10 米，不到磨边）；铜轮磨 Lv9 + 场景 Lv7 起一只落到磨杆上。没用「铜磨 + 初晴 Lv5」，因为先升磨的玩家会跳过鸟叫和近飞。只有落磨时镜头才转头看。远飞没有声音（第一次听见鸟叫要和近飞一起来）；近飞时叫两声、声音从一侧移到另一侧（微信没有声像）；落下唱一段、起飞叫一声。背景鸟叫也用这些录音，读不到时退回合成音。音量是 `visit.ts` 的 `NEAR_CALL` / `PERCH_CALL` 和 `audio.ts` 的 `AMBIENT_CALL`。
- 鸟群用简化小鸟（`flock.ts`）并放大（远 2.5 倍、近 1.2 倍）：0.2 米的鸟在 30 米外手机上只有约 3 像素。落磨的完整模型三种鸟共用（`songbird.ts`），只换羽色（`coats.ts`：蓝山雀、大山雀、麻雀），到落磨阶段才生成，羽色每隔 1.5 秒画一种。
- "倔"只属于驴：只有驴显示这一项，对应 `freedomBonus` +0.4%（每次奔向草原的成功率）。牛和马没有这个属性。
- 封面：三个动物的侧面轮廓（驴往镜头转约 20°，否则两只耳朵叠成一只、像山羊；用户说牛和马的轮廓可以），由模型实时渲染成 PNG（`silhouettes()`，同一比例尺，驴比马小），用 CSS mask 着色；点选后才显示描述、数值和"开始拉磨"。
- 蜃楼里的马群也是模型，蜃楼着色器带骨骼蒙皮（`skinning_pars_vertex` 等）。
- 铜轮磨的传动必须连得上：大齿轮在立轴上 → 小齿轮压在大齿轮边上 → 传动轴挂在横梁下穿过立柱 → 皮带轮；蒸汽磨的锅炉在那根立柱后面，飞轮用皮带带动皮带轮。不要再有悬空的零件。
- 界面：字号 / 墨色层级 / 圆角都在 `style.css` 顶部的变量里，新样式只用这些变量。HUD 角落有一层 `.scrim` 暗角，保证亮天空上字也看得清。换档用 `ui.tier()` 出大标题，不用普通 toast。

## 代码地图

```
src/
  config.ts      所有数值与文案（动物、经济、节奏、蜃楼概率、台词）
  platform.ts    平台差异：存档、时间、声音、读文件、画质
  app.ts         两端共用：模式切换（title / mill / freedom）、渲染（bloom）
  main.ts        网页入口：DOM、键鼠、dev URL 参数
  game.ts        拉磨玩法：步调、转圈、面粉、升级、蜃楼调度、冲刺与保底
  freedom.ts     结局草原（独立 Scene，草地随相机无限平铺）
  ui-api.ts      GameUi 接口（游戏只认这个）
  ui.ts          网页的 DOM 覆盖层（标题、HUD、提示、结局）
  canvas-ui/     小游戏的画布 UI：ui.ts（同样的界面，画在 2D 画布上）、paint.ts、overlay.ts
  minigame/      小游戏入口 main.ts、stag.ts（自由后解锁鹿）、polyfill（TextDecoder 等）、wx 类型
  audio.ts       Web Audio 合成音效（class Sound）
  input.ts       键盘 / 鼠标 / 触屏 → Intent
  save.ts        存档
  util.ts        随机数、插值、地形高度函数、fitFov
  world/
    yard.ts      磨坊场景总装：天空、光、雾、地、磨、粒子、蜃楼；调色过渡
    palette.ts   5 档景色调色板，按景等级连续插值
    land.ts      地面、远山、树、草、花、篱笆、房子（按等级"长出来"）
    mill.ts      5 档磨（石磨→木架磨→铜轮磨→蒸汽磨→星辉磨），只加不减
    mirage.ts    蜃楼（含倒影），清晰度随失败次数提高
    models.ts    加载动物模型（入口可多要，如鹿）；Animal、Rider（第一人称身体）、封面轮廓
    particles.ts 尘 / 花粉 / 萤火、花瓣
    bird/        鸟：visit.ts（何时来、落磨）、flock.ts（远飞 / 近飞的小群）、songbird.ts（模型）、coats.ts（三种羽色）、rig.ts、behave.ts、shape.ts
  xhs/           小红书小工具入口 main.ts、platform.ts（存档、包内文件）、follow.ts（关注解锁鹿）、compat.ts
minigame/        小游戏包里的静态文件（game.json、project.config.json、字体）
xhs/             小红书包里的静态文件（index.html、style.css、WOFF2 字体、鹿的模型）
tools/minigame/  fonts.mjs（字体子集化）、sim.html（浏览器里模拟微信环境）
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
- `window.__mill` 在 dev 模式暴露 `yard`、`game`、`freedom`、`THREE`、`Animal`、`toFreedom()`（直接进结局）。常用：
  - 立刻出蜃楼：`__mill.game.mirageTimer = 0`；摆到正前方：`__mill.yard.mirage.place(__mill.game.run.angle + Math.PI/2 + 0.3, 105)`
  - 强制冲刺：`__mill.game.promptShown = true; __mill.game.dashIntent()`（`run.mirageFails = 29` 必成功）
  - 模拟迈步：对 `window` 派发 `KeyboardEvent('keydown', { code: 'KeyA' / 'KeyD' })`
- 预览外部模型：在临时目录起一个带 CORS 的静态服务器，页面里 `fetch` GLTFLoader 的源码找出 vite 预打包的 three 地址，再 `import(location.origin + 地址)`，这样和游戏共用同一个 three 实例。
- 截图、摆拍、图标对比、模型裁剪的脚本在 `tools/shots/`（用法见那里的 README）。
- 截图验证画面：用 Playwright + Chromium headless shell（`--use-angle=metal`）打开 dev server 等 3 秒再截。
  `npx playwright install` 在本机会卡住，直接从 cdn.playwright.dev 下载 headless shell 的 zip 并用 `executablePath` 更可靠。
  headless Firefox 的 `--screenshot` 在 load 时就截图，拿不到 WebGL 画面，别用。
  Playwright、浏览器、gltf-transform 放在临时目录，不要装进项目（`tools/shots/` 只放脚本）。

## 已知待办 / 想法

- 具体排好的待办在 `TODOs.md`。
- 已获自由的动物可以再做成"图鉴"。
- 封面在有存档时，动物轮廓会挡住磨。
- 自由草原：可以加天黑、星空、和同伴并肩跑等后续。
- 首次游玩引导：现在只有一行操作说明。
- 性能：低端机可降 shadowMap 尺寸、关 bloom。
- 封面音乐（微信版，2026-11-12）：封面放用户用 Suno 做的「Breathwood」（用户说微信版不商用，可以用），拉磨和草原仍是实时合成。取 1:36.5–2:59 这段（首尾最像的一段，82.5 秒），结尾后的 3 秒等功率叠进开头，前后各多存 1 秒，播放用 `loopStart = 1`、`loopEnd = 83.5167`（mp3 解码可能在开头多出几十毫秒，有前后这 1 秒就不怕）。单声道 56 kbps mp3，578 KB，在 `minigame/music/title.mp3`，包从 2.3 MB 到 2.8 MB。`Director.title`（`src/minigame/main.ts` 里设），只有设了的入口才放，读不到就退回合成。开始拉磨时录音 4 秒淡出、合成音乐淡入。原曲的 m4a 里是 Opus，macOS 的 afconvert 解不开，用 Chrome 解（`~/code/mill-tools/decode.mjs`）；剪循环的脚本是 `~/code/mill-tools/loop.py`。**真机上还没听过。**
- 背景音乐（2026-11-11 起，三个入口都默认打开）：磨越先进，石磨和蹄声越轻，空出来的位置让音乐慢慢进来，玩家听得出自己升级了。前几档只有蹄声、石磨和风，景越美乐器越多，最后几档音乐成了主角。
  - **走实时合成，不放做好的曲子**（用户定的）：最大的优势是包小、不重复、能跟着景、磨和步调实时变化。用户由此想到游戏可以定位成冥想音乐游戏，帮玩家进入心流。Suno 的曲子只适合配画外音的叙事视频，而且只在微信版用。
  - 代码：`src/music/engine.ts`（三条 bus：和声 bed、琴音 notes、环境 air；段落、低音持续音）、`presets.ts`、`director.ts`（`App.music`，每帧由 App 调用：按当前的景选曲、换档交叉淡变、结局换草原、标题页放存档那一档；出错只关音乐）。网页 `?music=off` 关掉、`?music=jinmu` 只放一首、`&vol=0.5`。`audio.ts` 导出 `link`、`fill`、`makeReverb`，`Sound.musicOut()` 把音乐接在总音量和静音按钮下面。mill 的引擎是自己写的，观鸟的只当参考（用户说两个游戏风格不同）。
  - 极光的对比实验（记录在 `~/Desktop/拉磨图标/视频/音乐-开发记录/`）：直接按提示词写（`aurora-a`）赢过照 Suno 曲子的统计数字写（`aurora-b`）。用户觉得两首都比 Suno 原曲差很远，缺的是框架（乐句、和声走向、层次的进出），纯随机出音听起来像冥想氛围、单调。下一步是加作曲层，并让游戏状态推动它。
  - 琴音不由迈步触发；音乐的拍子慢慢贴近玩家的步频（每步挪 1/4），走得越稳越多琴音落在预测的下一步上（`Music.follow`，`Sound.onCadence` 传步子）；停下几秒后变稀、回到自由节奏。为了心流（用户 2026-11-11 让试）。无头测试：稳定 0.6 秒一步时 14 个音有 13 个落在步子上（随机约 17%），乱走时 5 个里只有 1 个。
  - 夏天六首（提示词在 `src/music/提示词.md`）：黄土 `huangtu`、初晴 `chuqing`、青野 `qingye`、金暮 `jinmu`、流霞 `liuxia`、草原结局 `caoyuan`。都在 D 或 G 上，换档交叉淡变 6 秒不突兀，一档比一档亮（D 多利亚 → D 混合利底亚 → G 大调 → D 大调 → D 利底亚，草原用 G 五声）。换档时新曲接过旧曲的步频锁定（`inherit`），草原里不再跟步频（`free`）。
  - **现在的写法（第七版，2026-11-12 用户定）：铺底就是音乐。** 银翼杀手式的模拟合成器铺底（`bed.tone: 'pad'`：三个微微失谐的锯齿波过一个慢慢开合的低通），一个和弦十秒以上；上面只有五到十秒一个的单音（黄土木琴、初晴拇指琴、金暮拇指琴、流霞康特勒琴、草原拇指琴）或每步一个的轻拨弦（青野、金暮）。档之间靠和弦色彩、铺底亮度（截止频率 1200 → 2400 Hz）、混响和响度拉开。
    - 走过的弯路：第一、二版是手写旋律加木笛，用户先后觉得「太空太稀、没旋律」「木笛拖、电子感重、有低噪」；木笛的根本问题是一声一声的，不像人一口气吹出来（改成连贯的一条线也还是有气噪），最后去掉。旋律换成拇指琴、木琴也「都一般」，用户更喜欢铺底，「黄土还行因为比较简单」，所以旋律只剩单音。引擎里木笛和动机（`Motif`、`phrase`）的代码还在，夏天没有一首在用。
    - **跟着玩家的步子（用户：「感受不到玩家踏步节奏对音乐的影响」之后加的）**：每一步落下时铺底和混响尾巴一起轻一下、暗一下，下一步之前涨回来（`Music.pump`，像侧链压缩；走得越稳越深，也给蹄声空出位置）；走得稳铺底慢慢变亮变响，停下或乱走慢慢收回（`bed.bloom`，一迈步开四成，稳了开剩下的）；换和弦等到下一步；单音和拨弦落在预测的下一步上，只提前 0.5 秒排。只开合慢慢变亮那一版，用户听不出步子的影响。
    - 响度：石磨声是 160 Hz 附近的噪声、跑起来更响，会盖住暗的铺底（用户试过黄土、初晴听不见），所以前两档调响调亮，阶梯是黄土约 −30 到流霞约 −24.6 LUFS（离线渲染、不含游戏音效）。
    - 离线试听：用 Playwright 打开 dev server，在页面里 import 引擎，用 OfflineAudioContext 渲染，`suspend()` 一步步模拟迈步；记录、各版快照和试听文件在 `~/Desktop/拉磨图标/视频/音乐-开发记录/` 和 `~/Desktop/拉磨图标/音乐场景/试听/`。
  - 微信兼容（新引擎用了旧 audio.ts 没用过的东西）：参数从不设负值（音高偏移都写进 frequency），振荡器调制参数（颤音、气息、风）走 `Music.mod()`，引擎不支持就跳过那一层；`live()` 的定时器自己 try/catch。sim.html 里加上「参数设负值就报错」也能跑（测试脚本用 addInitScript 加的，没改 sim.html）。**真机上还没听过**：要在 iPhone 上确认有声音、颤音在、3D 加几十个振荡器不卡不烫。
  - 这个分支没有季节，只用夏天这套（2026-11-11 从 `xmas` 的 a205369 挑过来）；圣诞版在 `xmas` 上另做一套冬天的音乐。
