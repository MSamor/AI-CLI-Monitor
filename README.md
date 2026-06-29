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

当前项目不保留单元测试文件，也没有 `npm test` 脚本。

## 客户端怎么用

1. 启动应用后，主界面会显示 Claude、Codex、蓝牙硬件和事件流。
2. 点击「开启灵动岛」会打开一个默认位于 mac 状态栏顶部居中的置顶小胶囊。
3. 灵动岛可以拖拽移动；拖到其他位置后再次展开，会围绕当前位置放大，不会跳回默认位置。
4. 点击灵动岛会用弹性动画展开详情，展示 Claude、Codex、全局灯控、蓝牙模式、设备名、诊断信息和最近事件；鼠标移出后自动收回。
5. 多个 CLI 同时生成时，桌面灵动岛会分别展示每个 AI 的输出状态；硬件灯仍只接收全局状态。
6. 没有硬件时可以点击「模拟」切换到模拟蓝牙通道。
7. 「手动灯控」可以直接发送 `G/Y/R/B` 指令，用来验证 UI 和硬件链路。
8. 如果连接真实 Pico，蓝牙面板会显示扫描、连接或错误状态；启动后只自动连接一次，后续重试需要手动点击「重连」。

灵动岛的展开和气泡呼吸动画由 `framer-motion` 驱动，主窗口保持固定尺寸和无边框模式，退出开发命令后不会保留后台服务。

## 开启 Claude 监听

应用启动后会在本机监听：

```text
http://127.0.0.1:17361/hooks/claude
```

把 Claude Code 的 hooks 指向 `scripts/claude-hook.js`。示例配置：

```json
{
  "hooks": {
    "UserPromptSubmit": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "PreToolUse": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "PostToolUse": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "Notification": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "Stop": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "SubagentStop": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js",
    "SessionEnd": "node /你的绝对路径/ai-cli-monitor/scripts/claude-hook.js"
  }
}
```

脚本会读取 Claude 传入的 stdin JSON，转发给本地监听服务，并始终以 `0` 退出，避免影响 Claude CLI 本身。

## 开启 Codex AI 活动监听

Codex 进程存在不等于 AI 正在输出。应用仍会每秒扫描一次系统进程列表，但这只用来记录「Codex CLI 已打开」，不会点亮红灯。

推荐按官方 Codex hooks 配置，把 Codex 的 lifecycle 事件转发给本工具：

```bash
cp scripts/codex-hooks.json ~/.codex/hooks.json
```

然后把 `~/.codex/hooks.json` 里的 `/你的绝对路径/ai-cli-monitor/scripts/codex-hook.js` 改成当前项目的绝对路径。

当前模板监听这些官方事件：

- `SessionStart`：Codex 会话开始。
- `UserPromptSubmit`：用户提交新 prompt，本轮开始。
- `PreToolUse`：即将执行工具，会展示 `tool_name`、`tool_use_id` 和 `tool_input.command`。
- `PermissionRequest` / `Notification`：等待授权或用户确认。
- `PostToolUse`：工具执行完成，会保留工具名和本次响应摘要。
- `PreCompact`：上下文即将压缩。
- `SubagentStop`：子任务完成。
- `Stop` / `SessionEnd`：本轮或会话结束，会回到未生成状态。

hook 脚本会读取 Codex 通过 stdin 传入的 JSON，并转发到：

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
- 灵动岛位置：默认出现在主屏幕状态栏居中位置，可拖拽到任意屏幕内位置；点击展开，鼠标移开收起。
