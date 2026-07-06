# AI CLI Monitor

AI CLI Monitor是一个桌面工具，用来监听 Claude CLI 与 Codex CLI 的活动状态，并同步到主窗口、桌面灵动岛和可选的基于蓝牙的单片机设备，支持单片机屏幕显示盒 RGB 指示灯控制。

## 软件作用

- 识别 Claude / Codex 当前是生成中、等待确认还是空闲，状态在桌面展示
- 通过桌面主窗口和灵动岛展示 Claude、Codex、蓝牙硬件和事件流
- 可接入硬件-立创实战派 控制三色灯/屏幕显示执行状态

## 快速开始

正式包通过 GitHub Release 发布：

```text
https://github.com/MSamor/AI-CLI-Monitor/releases
```

按系统下载对应安装包：

- Windows：`.exe`
- macOS：`.dmg` 或 `.zip`
- Linux：`.AppImage` 或 `.deb`

## 首次使用

1. 启动应用程序。
2. 在主窗口的 Claude / Codex 卡片里打开 `Hook` 开关。
3. 点击开启灵动岛
4. 继续使用你的Codex和Claude Code，就会显示运行状态
5. （可选）立创实战派S3设备，刷入固件。支持屏幕显示和 RGB 指示灯

桌面客户端截图：

![img.png](img/img_5.png)

![img_1.png](img/img_4.png)

![img_2.png](img/img_6.png)


## 状态规则

- `红色 / AI 生成中`：Claude 或 Codex 正在思考、调用工具、生成或流式输出。
- `黄色 / 等待确认`：AI 暂停在确认点，正在等待输入、授权或继续指令。
- `绿色 / 空闲`：Claude 与 Codex 当前没有正在进行的生成活动。

## 蓝牙硬件

[5a4543cf46cc7cd2e83d0173b19463ea.mp4](img/5a4543cf46cc7cd2e83d0173b19463ea.mp4)

## 开发

开发运行：

```bash
npm install
npm run dev
```

构建检查：

```bash
npm run typecheck
npm run build
```

本地打包：

```bash
npm run dist
```

打包产物输出到 `release/` 目录。macOS 生成 `dmg` 和 `zip`，Windows 生成 `exe` 和 `zip`，Linux 生成 `AppImage` 和 `deb`。
