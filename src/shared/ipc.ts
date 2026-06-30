export const IPC_CHANNELS = {
  getSnapshot: 'monitor:get-snapshot',
  snapshotChanged: 'monitor:snapshot-changed',
  setManualLed: 'monitor:set-manual-led',
  reconnectBle: 'monitor:reconnect-ble',
  useMockBle: 'monitor:use-mock-ble',
  refreshToolIntegrations: 'monitor:refresh-tool-integrations',
  setToolHookEnabled: 'monitor:set-tool-hook-enabled',
  setDesktopIslandEnabled: 'monitor:set-desktop-island-enabled',
  setDesktopIslandExpanded: 'monitor:set-desktop-island-expanded',
  desktopIslandBlurred: 'monitor:desktop-island-blurred',
  minimizeWindow: 'window:minimize',
  closeWindow: 'window:close'
} as const
