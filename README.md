# AI 命令行监听器

这是一个 Electron 桌面工具，用来监听 Claude CLI 与 Codex CLI 的运行状态，并把状态展示在客户端仪表盘、桌面灵动岛和 Pico 2 W 蓝牙指示灯上。

## 状态规则

- `红色 / 运行中`：Claude 或 Codex 任意一个正在执行任务。
- `黄色 / 等待确认`：Claude 等待用户输入、授权或确认。
- `绿色 / 空闲待命`：Claude 与 Codex 都没有活跃任务。
- 桌面灵动岛会分别展示每个 CLI 的状态；硬件灯只接收全局状态，只要有一个 CLI 在跑就是运行态。

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
2. 点击「开启灵动岛」会打开一个贴近 mac 状态栏右上角的 24px 置顶小胶囊。
3. 没有硬件时可以点击「模拟」切换到模拟蓝牙通道。
4. 「手动灯控」可以直接发送 `G/Y/R/B` 指令，用来验证 UI 和硬件链路。
5. 如果连接真实 Pico，蓝牙面板会显示扫描、连接、重连或错误状态。

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

## 开启 Codex 监听

Codex 目前没有官方 hooks，所以应用每秒扫描一次系统进程列表：

- 发现 `codex` 或 `codex.exe`：Codex 显示为「运行中」。
- 连续两次轮询都未发现：Codex 回到「空闲」。

正常启动 Codex 即可被监听：

```bash
codex
```

如果后续想强化监听稳定性，可以把 `scripts/codex-wrapper.sh` 或 `scripts/codex-wrapper.ps1` 包装到自己的 shell alias 中。

## 蓝牙协议

桌面端使用 `@abandonware/noble` 扫描 BLE 外设。这个流程走 BLE GATT，不需要在系统蓝牙面板里手动配对；保持 Pico 通电并广播即可。

应用启动后的流程：

1. 检查系统蓝牙状态。
2. 按 Nordic UART Service UUID 扫描外设。
3. 发现广播名 `AI_LED` 或 NUS 服务后自动连接。
4. 发现 RX 写入特征后进入「已连接」状态。
5. 扫描 8 秒没找到设备会停止本轮扫描，稍后自动重扫。
6. 断线后自动退避重连，不需要手动重新配对。

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
- `R`：红色，运行
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
- 找不到硬件：确认 Pico 广播名是 `AI_LED`，并且电脑蓝牙已开启。
- 没有硬件但想看效果：使用 `AI_MONITOR_BLE=mock npm run dev`，再开启桌面灵动岛。
- 端口占用：开发服务默认使用 Vite 的 `5173`。退出时请用 `Ctrl-C` 停止 `npm run dev`。
- 无边框窗口：主窗口是固定尺寸无边框工具窗，可拖拽窗口空白区域移动，右上角按钮可最小化或关闭。
