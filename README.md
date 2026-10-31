# 拉磨

一圈，又一圈。地平线上，偶尔有草原。

第一人称的网页小游戏：选一头牛、马或驴，绕着磨盘拉磨。磨出的面粉用来升级磨和院子的景色。地平线上偶尔浮现草原的蜃楼，奔向它，有很小的机会挣脱绳子。

**在线游玩**：https://lylapeng.github.io/mill/

## 操作

A / D 交替迈步，节奏稳会越走越快 · 空格 奔向草原 · 1 / 2 升级磨和景 · 鼠标移到右侧看磨 · M 静音

## 本地运行

```
npm install
npm run dev
```

## 制作过程

每个版本都保存为一个分支：`v1` 是第一个可玩版本，`v2` 加入了界面精修、动物模型和新封面。`main` 是线上的版本。

## 素材与致谢

- 动物模型：[Quaternius](https://quaternius.com) Ultimate Animated Animal Pack，CC0。
- 封面标题字体：马善政楷书（Ma Shan Zheng），SIL Open Font License 1.1，授权文本见 `public/fonts/OFL-MaShanZheng.txt`。
- 场景、磨和树由代码生成，声音由 Web Audio 实时合成。
- 用 [three.js](https://threejs.org) 和 [Vite](https://vite.dev) 制作。
