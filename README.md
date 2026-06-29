# AI CLI Monitor

Electron desktop monitor for Claude CLI and Codex CLI activity. It computes a global busy state and sends a single-byte LED command to a Pico 2 W over BLE.

## v1 Behavior

- `red`: Claude or Codex is running.
- `yellow`: Claude is waiting for user attention.
- `green`: both agents are idle.
- Desktop island: optional always-on-top window that shows each active CLI separately.
- BLE commands are `R`, `G`, `Y`, and `B`.
- Target BLE peripheral name is `AI_LED`.
- The BLE service is Nordic UART Service compatible:
  - Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
  - RX write: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
  - TX notify: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

## Development

```bash
npm install
npm run dev
```

Use mock BLE when no adapter or Pico is available:

```bash
AI_MONITOR_BLE=mock npm run dev
```

Open the desktop island from the dashboard with **Open Island**. It is useful
when no Pico hardware is connected: the island shows Claude and Codex separately
when multiple CLIs are active, while the hardware LED still receives only the
global busy color.

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## Claude Hook Setup

Point Claude Code hooks to `scripts/claude-hook.js`. Example:

```json
{
  "hooks": {
    "UserPromptSubmit": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js",
    "PreToolUse": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js",
    "PostToolUse": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js",
    "Notification": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js",
    "Stop": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js",
    "SubagentStop": "node /absolute/path/to/ai-cli-monitor/scripts/claude-hook.js"
  }
}
```

The hook script posts stdin JSON to `http://127.0.0.1:17361/hooks/claude` and always exits `0`.

## Codex Detection

The app polls the process list once per second and marks Codex as running when it finds a `codex` or `codex.exe` process. Wrapper scripts are included for future enhancement:

- `scripts/codex-wrapper.sh`
- `scripts/codex-wrapper.ps1`

## Pico 2 W Firmware

Copy `pico/main.py` to the Pico 2 W MicroPython filesystem together with `aioble` support. Default RGB pins:

- red: `GP16`
- green: `GP17`
- blue: `GP18`

Set `COMMON_ANODE = True` in `pico/main.py` if your RGB LED module uses common anode wiring.

## Platform Notes

- macOS: grant Bluetooth permission to the app or terminal running Electron.
- Windows: requires Windows 10+ Bluetooth LE support. If noble cannot access the adapter, use mock mode for development.
- Linux: requires a working BlueZ stack and permissions for BLE scanning.
