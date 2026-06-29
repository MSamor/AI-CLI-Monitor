export const IPC_CHANNELS = {
  getSnapshot: 'monitor:get-snapshot',
  snapshotChanged: 'monitor:snapshot-changed',
  setManualLed: 'monitor:set-manual-led',
  reconnectBle: 'monitor:reconnect-ble',
  useMockBle: 'monitor:use-mock-ble',
  setDesktopIslandEnabled: 'monitor:set-desktop-island-enabled',
  setDesktopIslandExpanded: 'monitor:set-desktop-island-expanded',
  desktopIslandBlurred: 'monitor:desktop-island-blurred',
  minimizeWindow: 'window:minimize',
  closeWindow: 'window:close'
} as const
