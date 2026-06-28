# 影刃对决 Online

这是一个可以部署到 Render 的原创线上联机横版动漫格斗游戏。

重要说明：这个包没有使用《死神 vs 火影》的角色、图片、音乐、音效、技能素材或原版代码。它是原创玩法版本，支持房间联机、AI 对手、地图选择，适合放到 Render 线上和朋友玩。

## 新版内容

- 10 个原创角色：星刃剑士、影遁忍者、炎拳武者、雷鸣枪手、霜月术士、莲华拳姬、铁壁重卫、风牙游侠、虚空行者、曜阳武士
- 3 张原创地图：夜都天台、赤月神社、雷云峡谷
- AI 对手：弱智、正常、聪明
- 真人进入后可以替换 AI
- 更强的横版格斗手感：冲刺、受击硬直、连击加伤、能量光圈、斩击特效、气弹、必杀

## 部署到 Render

1. 把解压后的所有文件上传到 GitHub 仓库。
2. Render 里选择 New Web Service。
3. 选择你的 GitHub 仓库。
4. Build Command 填：

```bash
npm install
```

5. Start Command 填：

```bash
npm start
```

6. Instance Type 选 Free。
7. 点 Deploy Web Service。

如果部署后是红色 Failed，先检查 Start Command 是否是 `npm start`，并确认 GitHub 仓库里有 `server.js` 和 `package.json`。

## 玩法

- 两台设备打开同一个网址。
- 输入同一个房间号。
- 两个人进入后自动开始。
- 一个人玩时，AI 对手选择弱智、正常或聪明即可开打。
- 如果先开了 AI，朋友后面进入同一房间，会自动替换 AI。

## 键盘

- A / D：左右移动
- W：跳跃
- S：防御
- J：普攻
- K：突进斩
- L：气弹
- U：必杀

手机上也有屏幕按钮。
