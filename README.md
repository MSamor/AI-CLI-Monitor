# AI 命令行监听器

这是一个 Electron 桌面工具，用来监听 Claude CLI 与 Codex CLI 是否正在进行 AI 生成、工具调用或流式输出，并把状态展示在客户端仪表盘、桌面灵动岛和 Pico 2 W 蓝牙指示灯上。

## 状态规则

- `红色 / AI 正在输出`：Claude 或 Codex 任意一个正在思考、调用工具、生成或流式输出。
- `黄色 / 等待确认`：AI 暂停在确认点，正在等待输入、授权或继续指令。
- `绿色 / 没有生成任务`：Claude 与 Codex 当前都没有 AI 生成输出。
- 桌面灵动岛会分别展示每个 CLI 的 AI 活动状态；硬件灯只接收全局状态，只要有一个 AI 正在生成就是红色。

## 快速启动

安装依赖：

```bash
npm install
```

启动真实蓝牙监听：

```bash
npm run dev
```

没有 Pico 或蓝牙硬件时，用模拟蓝牙启动：

```bash
AI_MONITOR_BLE=mock npm run dev
```

构建检查：

```bash
npm run typecheck
npm run build
```

本地打包客户端：

```bash
npm run dist
```

打包产物会输出到 `release/` 目录。macOS 会生成 `dmg` 和 `zip`，Windows 会生成 `nsis` 安装包和 `zip`，Linux 会生成 `AppImage` 和 `deb`。

发布 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送 `v*` 标签后，`.github/workflows/release.yml` 会在 macOS、Windows、Linux 三个平台自动构建客户端，并把产物上传到对应 GitHub Release。也可以在 GitHub Actions 页面手动触发「构建 Release 客户端」工作流；手动触发时会生成 workflow artifact，但只有 tag 触发会发布到 Release。

Windows / Linux 的真实蓝牙依赖是可选原生模块；如果 CI 或用户环境无法编译/加载 `@abandonware/noble`，客户端仍会正常启动，并自动回退到模拟蓝牙通道。macOS 包含真实 BLE 支持。

当前项目不保留单元测试文件，也没有 `npm test` 脚本。

## 客户端怎么用

1. 启动应用后，主界面会显示 Claude、Codex、蓝牙硬件和事件流。
2. 点击「开启灵动岛」会打开一个默认位于 mac 状态栏顶部居中的置顶小胶囊。
3. 灵动岛可以横向拖拽到任意屏幕；松手后会自动吸附到当前屏幕顶部，避免停在其他应用窗口内容区。
4. 点击灵动岛会用弹性动画展开详情，展示 Claude、Codex、全局灯控、蓝牙模式、设备名、诊断信息和最近事件；灵动岛失焦 3 秒后自动收回。
5. 多个 CLI 同时生成时，桌面灵动岛会分别展示每个 AI 的输出状态；正在生成的 CLI 图标会旋转，硬件灯仍只接收全局状态。
6. 没有硬件时可以点击「模拟」切换到模拟蓝牙通道。
7. 「手动灯控」可以直接发送 `G/Y/R/B` 指令，用来验证 UI 和硬件链路。
8. 如果连接真实 Pico，蓝牙面板会显示扫描、连接或错误状态；启动后只自动连接一次，后续重试需要手动点击「重连」。

灵动岛的展开和气泡呼吸动画由 `framer-motion` 驱动，主窗口保持固定尺寸和无边框模式，退出开发命令后不会保留后台服务。

## 开启 Claude 监听

应用启动后会在本机监听：

```text
http://127.0.0.1:17361/hooks/claude
```

本机当前 Claude 配置使用：

- 配置文件：`~/.claude/settings.json`
- 钩子脚本：`~/.claude/claude-hook.js`
- 本地接收地址：`http://127.0.0.1:17361/hooks/claude`

项目内的脚本模板在 `scripts/claude-hook.js`。如果项目脚本更新过，需要同步到本机 Claude 目录：

```bash
cp scripts/claude-hook.js ~/.claude/claude-hook.js
```

`~/.claude/settings.json` 里只需要关注 `hooks` 部分，不要把 `env` 里的密钥写进项目文档。当前使用的是新版 Claude hooks 结构：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
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
            "command": "node /Users/maosi/.claude/claude-hook.js"
          }
        ]
      }
    ]
  }
}
```

脚本会读取 Claude 传入的 stdin JSON，必要时补充 `CLAUDE_EVENT` 环境变量里的事件名，转发给本地监听服务，并始终以 `0` 退出，避免影响 Claude CLI 本身。

Claude 状态映射：

- `UserPromptSubmit` / `PreToolUse` / `PostToolUse`：标记为 AI 生成中。
- `Notification`：标记为等待确认。
- `Stop` / `SubagentStop` / `SessionEnd` / `StopFailure`：恢复为未生成。
- 如果手动中断后没有收到结束事件，应用会在 45 秒没有新 hook 活动后自动恢复为未生成。

## 开启 Codex AI 活动监听

Codex 进程存在不等于 AI 正在输出。应用仍会每秒扫描一次系统进程列表，但这只用来记录「Codex CLI 已打开」，不会点亮红灯。

推荐按官方 Codex hooks 配置，把 Codex 的 lifecycle 事件转发给本工具。

本机当前 Codex 配置使用：

- 配置文件：`~/.codex/hooks.json`
- 钩子脚本：`~/.codex/codex-hook.js`
- 本地接收地址：`http://127.0.0.1:17361/hooks/codex`

项目内的脚本模板在 `scripts/codex-hook.js`，事件配置模板在 `scripts/codex-hooks.json`。如果项目脚本更新过，需要同步到本机 Codex 目录：

```bash
cp scripts/codex-hook.js ~/.codex/codex-hook.js
```

你本机当前使用的是新版 Codex hooks 结构，核心格式如下：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /Users/maosi/.codex/codex-hook.js"
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
            "command": "node /Users/maosi/.codex/codex-hook.js"
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
            "command": "node /Users/maosi/.codex/codex-hook.js"
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
            "command": "node /Users/maosi/.codex/codex-hook.js"
          }
        ]
      }
    ]
  }
}
```

建议在 `~/.codex/hooks.json` 中覆盖这些事件：

- `SessionStart`：Codex 会话开始，只记录连接状态，不会标记为 AI 正在输出。
- `UserPromptSubmit`：用户提交新 prompt，本轮开始。
- `PreToolUse`：即将执行工具，会展示 `tool_name`、`tool_use_id` 和 `tool_input.command`。
- `PermissionRequest` / `Notification`：等待授权或用户确认。
- `PostToolUse`：工具执行完成，会保留工具名和本次响应摘要。
- `PreCompact` / `PostCompact`：上下文压缩开始或完成。
- `SubagentStart`：子任务启动。
- `SubagentStop`：子任务完成。
- `Stop`：本轮结束，会回到未生成状态。

你当前的 `~/.codex/hooks.json` 已经配置了 `SessionStart`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PreCompact` 和 `PostCompact`。建议继续补齐 `UserPromptSubmit`、`Notification`、`SubagentStart`、`SubagentStop` 和 `Stop`，这样纯文本生成、子任务和正常结束都会更精确。

手动中断输出时，Codex 不一定触发 `Stop` hook。应用会额外读取 `~/.codex/sessions` 当天和昨天的 JSONL 增量；检测到 `turn_aborted` 后会立即把 Codex 恢复为未生成。如果没有拿到 `turn_aborted`，`PostToolUse`、`PostCompact`、`SubagentStop` 这类完成事件会在 5 秒后自动回收，其他活动事件保留 45 秒兜底，避免状态一直卡在识别中。

hook 脚本会读取 Codex 通过 stdin 传入的 JSON，必要时补充 `CODEX_HOOK_EVENT_NAME`、`CODEX_HOOK_EVENT`、`CODEX_EVENT` 或 `HOOK_EVENT_NAME` 环境变量里的事件名，并转发到：

```text
http://127.0.0.1:17361/hooks/codex
```

客户端和灵动岛会展示当前 Codex 阶段、工具名、命令、`turn_id`、`model`、`cwd` 和最近助手消息摘要。

如果暂时不配置官方 hooks，也可以继续用 wrapper 做粗粒度兜底：

```bash
./scripts/codex-wrapper.sh
```

Windows PowerShell：

```powershell
.\scripts\codex-wrapper.ps1
```

## 蓝牙协议

桌面端使用 `@abandonware/noble` 扫描 BLE 外设。这个流程走 BLE GATT，不需要在系统蓝牙面板里手动配对；保持 Pico 通电并广播即可。

应用启动后的流程：

1. 检查系统蓝牙状态。
2. 按 Nordic UART Service UUID 扫描外设。
3. 发现广播名 `AI_LED` 或 NUS 服务后自动连接。
4. 发现 RX 写入特征后进入「已连接」状态。
5. 扫描 8 秒没找到设备会停止本轮扫描，并停在待重试状态。
6. 断线后不会自动重连；需要在客户端手动点击「重连」再次扫描。

目标设备名为：

```text
AI_LED
```

Pico 端使用 Nordic UART Service 兼容协议：

```text
Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e
RX Write:     6e400002-b5a3-f393-e0a9-e50e24dcca9e
TX Notify:    6e400003-b5a3-f393-e0a9-e50e24dcca9e
```

桌面端只向 RX 写入一个字节：

- `G`：绿色，空闲
- `Y`：黄色，等待
- `R`：红色，AI 正在生成或输出
- `B`：蓝色呼吸灯

## 连接 Pico 2 W 硬件

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

## 平台蓝牙配置

- macOS：给终端或 Electron 应用授予蓝牙权限；如果权限弹窗没出现，可以到系统设置里手动开启。
- Windows：需要 Windows 10+ 和支持 BLE 的蓝牙适配器；如果扫描失败，先用 `AI_MONITOR_BLE=mock npm run dev` 验证 UI。
- Linux：需要 BlueZ 正常运行，并确保当前用户有蓝牙扫描权限。

## 常见问题

- 页面白屏：先运行 `npm run build`，确认 preload 构建成功；当前代码已使用 `out/preload/index.mjs`。
- 找不到硬件：确认 Pico 广播名是 `AI_LED`，并且电脑蓝牙已开启；应用启动只自动扫描一次，后续请点击「重连」。
- 没有硬件但想看效果：使用 `AI_MONITOR_BLE=mock npm run dev`，再开启桌面灵动岛。
- 端口占用：开发服务默认使用 Vite 的 `5173`。退出时请用 `Ctrl-C` 停止 `npm run dev`。
- 无边框窗口：主窗口是固定尺寸无边框工具窗，可拖拽窗口空白区域移动，右上角按钮可最小化或关闭。
- 灵动岛位置：默认出现在主屏幕状态栏居中位置，可横向拖拽到任意屏幕；松手后会自动吸顶，不会停在其他应用内容区；点击展开，窗口失焦 3 秒后收起。
