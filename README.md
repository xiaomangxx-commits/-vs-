# 影刃对决 Online

这是一个可以部署到 Render 的原创线上联机横版格斗游戏。

重要说明：这个包没有使用《死神 vs 火影》的角色、图片、音乐、音效、技能素材或原版代码。它是原创玩法版本，支持房间联机，适合放到 Render 线上和朋友玩。

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

## 玩法

- 两台设备打开同一个网址。
- 输入同一个房间号。
- 两个人进入后自动开始。
- 多出来的人会变成观战。

## 键盘

- A / D：左右移动
- W：跳跃
- S：防御
- J：普攻
- K：突进斩
- L：气弹
- U：必杀

手机上也有屏幕按钮。
