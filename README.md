# AI 命令行监听器

AI 命令行监听器是一个 Electron 桌面工具，用来判断 Claude CLI 与 Codex CLI 当前是否正在生成、等待确认或空闲，并把状态同步到主窗口、桌面灵动岛和可选的 Pico 2 W 蓝牙 RGB 指示灯。

> 当前版本尚未做完整端到端验证。Release 包、hook 配置和 Pico 硬件链路建议按本文步骤逐项验证后再长期使用。

## ✨ 软件作用

- 🧠 监听 Claude / Codex 的 hook 事件，区分「生成中」「等待确认」「空闲」。
- 🏝️ 启动后自动打开桌面灵动岛；灵动岛会记住上次位置，下次启动优先恢复。
- 🟢 支持 BLE 指示灯：红色代表生成中，黄色代表等待确认，绿色代表空闲。
- 🖥️ 主窗口关闭后会收进状态栏/托盘，点击托盘图标可再次打开；最小化仍保留在任务栏。
- 🧪 没有 Pico 或蓝牙硬件时，可以用模拟蓝牙模式验证 UI 与状态流。

## 📦 下载软件

正式包通过 GitHub Release 发布：

1. 打开项目的 GitHub Releases 页面。
2. 按系统下载对应安装包：
   - Windows：下载 `.exe`
   - macOS：下载 `.dmg` 或 `.zip`
   - Linux：下载 `.AppImage` 或 `.deb`
3. 首次启动后，软件会自动打开主窗口和灵动岛。

## 🪝 配置 Hook

应用启动后会监听本机端口：

```text
Claude: http://127.0.0.1:17361/hooks/claude
Codex:  http://127.0.0.1:17361/hooks/codex
```

hook 脚本会读取 CLI 传入的 stdin JSON，转发到本地监听服务，并始终以 `0` 退出，避免影响 Claude / Codex 本身。

推荐直接在主窗口的 Claude / Codex 卡片中打开 `Hook` 开关。应用会自动检测 CLI 是否在 PATH 中可用，并把本工具的 hook 合并写入对应配置文件；关闭开关时只移除本工具管理的 hook，不删除其他自定义配置。

下面内容保留为手动配置参考。

### Claude Hook

项目内脚本模板：

```text
scripts/claude-hook.js
```

推荐复制到 Claude 配置目录：

```bash
mkdir -p ~/.claude
cp scripts/claude-hook.js ~/.claude/claude-hook.js
```

在 `~/.claude/settings.json` 中配置 hooks。注意把下面命令里的路径替换为你本机的绝对路径：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.claude/claude-hook.js"
          }
        ]
      }
    ]
  }
}
```

Claude 状态映射：

- `UserPromptSubmit` / `PreToolUse` / `PostToolUse`：标记为生成中。
- `Notification`：标记为等待确认。
- `Stop` / `SubagentStop` / `SessionEnd` / `StopFailure`：恢复为空闲。
- 如果手动中断后没有收到结束事件，应用会在 5 分钟没有新 hook 活动后自动恢复为空闲。

### Codex Hook

项目内脚本模板：

```text
scripts/codex-hook.js
scripts/codex-hooks.json
```

推荐复制到 Codex 配置目录：

```bash
mkdir -p ~/.codex
cp scripts/codex-hook.js ~/.codex/codex-hook.js
```

在 `~/.codex/hooks.json` 中配置事件。可以参考 `scripts/codex-hooks.json`，并把命令路径替换为你本机的绝对路径：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /你的绝对路径/.codex/codex-hook.js"
          }
        ]
      }
    ]
  }
}
```

Codex 事件说明：

- `SessionStart`：会话开始，只记录连接状态，不标记为生成中。
- `UserPromptSubmit`：用户提交新 prompt，本轮开始。
- `PreToolUse`：即将执行工具，会展示工具名、工具 ID 和命令。
- `PermissionRequest` / `Notification`：等待授权或用户确认。
- `PostToolUse`：工具执行完成，会保留工具名和响应摘要。
- `PreCompact` / `PostCompact`：上下文压缩开始或完成。
- `SubagentStart` / `SubagentStop`：子任务启动或完成。
- `Stop`：本轮结束，恢复为空闲。

Codex 进程存在不等于 AI 正在生成。应用仍会每秒扫描一次系统进程列表，但这只用于记录「Codex CLI 已打开」，不会点亮红灯。

手动中断输出时，Codex 不一定触发 `Stop` hook。应用会额外读取 `~/.codex/sessions` 当天和昨天的 JSONL 增量；检测到 `turn_aborted` 后会立即把 Codex 恢复为空闲。如果没有拿到 `turn_aborted`，`PostToolUse`、`PostCompact`、`SubagentStop` 这类完成事件会在 5 秒后自动回收，其他活动事件保留 5 分钟兜底，避免长时间生成任务被过早恢复。

如果暂时不配置官方 hooks，也可以继续用 wrapper 做粗粒度兜底：

```bash
./scripts/codex-wrapper.sh
```

Windows PowerShell：

```powershell
.\scripts\codex-wrapper.ps1
```

## ⚡ 快速开始

开发运行：

```bash
npm install
npm run dev
```

没有蓝牙硬件时：

```bash
AI_MONITOR_BLE=mock npm run dev
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

打包产物会输出到 `release/` 目录。macOS 生成 `dmg` 和 `zip`，Windows 生成 `exe` 安装包和 `zip`，Linux 生成 `AppImage` 和 `deb`。

### macOS Release 签名

从 GitHub 下载的 macOS 包会带有 quarantine 标记，系统会严格检查签名。没有 Developer ID 签名和 Apple 公证时，可能会出现“已损坏，无法打开”或“无法验证开发者”。

CI 已做两层处理：

- 未配置 Apple 证书时，会给 `.app` 做 ad-hoc 签名，避免 Electron 原始包在下载后被判定为签名损坏。
- 配置 Apple Developer ID 证书和公证密钥后，`electron-builder` 会生成正式签名并提交 Apple 公证，这是面向普通用户分发的推荐方式。

GitHub Secrets 推荐配置：

```text
CSC_LINK                  Developer ID Application 证书的 base64 p12
CSC_KEY_PASSWORD          p12 密码
APPLE_API_KEY_P8          App Store Connect API Key 的 .p8 文件内容
APPLE_API_KEY_ID          API Key ID
APPLE_API_ISSUER          Issuer ID
```


## 📊 状态规则

- 🔴 `红色 / AI 生成中`：Claude 或 Codex 任意一个正在思考、调用工具、生成或流式输出。
- 🟡 `黄色 / 等待确认`：AI 暂停在确认点，正在等待输入、授权或继续指令。
- 🟢 `绿色 / 空闲`：Claude 与 Codex 当前没有正在进行的生成活动。
- 桌面灵动岛会分别展示每个 CLI 的活动状态；硬件灯只接收全局状态，只要有一个 AI 正在生成就是红色。

## 🏝️ 客户端使用

1. 启动应用后，主界面会显示 Claude、Codex、蓝牙硬件和事件流。
2. 灵动岛启动时默认打开；可以横向拖拽到任意屏幕，松手后会吸附到当前屏幕顶部。
3. 灵动岛会记住上次位置；如果原来的显示器不存在，会回到主屏幕顶部居中。
4. 点击灵动岛会展开详情，展示 Claude、Codex、全局灯控、蓝牙状态、设备名、诊断信息和最近事件；失焦 3 秒后自动收回。
5. 蓝牙状态在灵动岛紧凑态只保留图标：已连接/模拟模式为绿色，其他状态为黄色。
6. 主窗口点击关闭会隐藏到状态栏/托盘；点击托盘图标可再次打开。点击最小化仍保留在任务栏。
7. 没有硬件时可以点击「模拟」切换到模拟蓝牙通道。
8. 「手动灯控」可以直接发送 `G/Y/R/B` 指令，用来验证 UI 和硬件链路。

## 🔵 蓝牙协议

桌面端使用 `@abandonware/noble` 扫描 BLE 外设。这个流程走 BLE GATT，不需要在系统蓝牙面板里手动配对；保持 Pico 通电并广播即可。

应用启动后的流程：

1. 检查系统蓝牙状态。
2. 按 Nordic UART Service UUID 扫描外设。
3. 发现广播名 `AI_LED` 或 NUS 服务后自动连接。
4. 发现 RX 写入特征后进入「已连接」状态。
5. 扫描 8 秒没找到设备会停止本轮扫描，并停在待重试状态。
6. 断线后不会自动重连；需要在客户端手动点击「重连」再次扫描。

目标设备名：

```text
AI_LED
```

Nordic UART Service 兼容协议：

```text
Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
RX Write:     6e400002-b5a3-f393-e0a9-e50e24dcca9e
TX Notify:    6e400003-b5a3-f393-e0a9-e50e24dcca9e
```

桌面端只向 RX 写入一个字节：

- `G`：绿色，空闲
- `Y`：黄色，等待确认
- `R`：红色，AI 生成中
- `B`：蓝色呼吸灯

## 🧰 开发与发布

当前项目不保留单元测试文件，也没有 `npm test` 脚本。改动后建议至少执行：

```bash
npm run typecheck
npm run build
```

Windows / Linux 的真实蓝牙依赖是可选原生模块。如果 CI 或用户环境无法编译/加载 `@abandonware/noble`，客户端仍会正常启动，并自动回退到模拟蓝牙通道。macOS 包含真实 BLE 支持。

## ❓ 常见问题

- 页面白屏：先运行 `npm run build`，确认 preload 构建成功；当前代码使用 `out/preload/index.mjs`。
- 找不到硬件：确认 Pico 广播名是 `AI_LED`，并且电脑蓝牙已开启；应用启动只自动扫描一次，后续请点击「重连」。
- 没有硬件但想看效果：使用 `AI_MONITOR_BLE=mock npm run dev`，再打开主窗口或灵动岛查看状态。
- 端口占用：开发服务默认使用 Vite 的 `5173`。退出时请用 `Ctrl-C` 停止 `npm run dev`。
- 无边框窗口：主窗口是固定尺寸无边框工具窗，可拖拽窗口空白区域移动，右上角按钮可最小化或关闭。
- macOS 提示已损坏：优先使用已签名并公证的 Release 包；自用未公证包可右键选择“打开”，或执行 `xattr -dr com.apple.quarantine "/Applications/AI CLI Monitor.app"` 后再打开。

## 🍓 Pico 2 W 硬件说明

Pico 硬件链路目前尚未完整验证。建议先用 `AI_MONITOR_BLE=mock npm run dev` 验证软件状态，再接入真实硬件。

连接步骤：

1. 给 Pico 2 W 刷入 MicroPython。
2. 安装或拷贝 `aioble` 支持库到 Pico 文件系统。
3. 把 [pico/main.py](pico/main.py) 复制到 Pico 文件系统根目录。
4. 按默认引脚连接 RGB LED：
   - 红色：`GP16`
   - 绿色：`GP17`
   - 蓝色：`GP18`
5. 如果你的 RGB 模块是共阳极，把 `pico/main.py` 里的 `COMMON_ANODE = False` 改成 `True`。
6. 重启 Pico，确认它广播设备名 `AI_LED`。
7. 在电脑上运行 `npm run dev`，应用会自动扫描并连接。

平台蓝牙配置：

- macOS：给终端或 Electron 应用授予蓝牙权限；如果权限弹窗没出现，可以到系统设置里手动开启。
- Windows：需要 Windows 10+ 和支持 BLE 的蓝牙适配器；如果扫描失败，先用 `AI_MONITOR_BLE=mock npm run dev` 验证 UI。
- Linux：需要 BlueZ 正常运行，并确保当前用户有蓝牙扫描权限。
