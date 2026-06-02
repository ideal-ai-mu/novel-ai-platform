import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type OpenDialogReturnValue
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AppMenuAction,
  type AppMenuActionInput,
  type AppSetAutosaveIntervalInput,
  type AppStorageInfo,
  type AutosaveIntervalSeconds
} from '../shared/ipc';
import { appDatabase } from './db/database';
import { AppError } from './db/errors';
import { registerIpcHandlers } from './ipc/register-handlers';
import { withIpcResult } from './ipc/runtime';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
let autosaveIntervalSeconds: AutosaveIntervalSeconds = 10;

function broadcastAutosaveInterval(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.APP_AUTOSAVE_INTERVAL_CHANGED, autosaveIntervalSeconds);
}

function setAutosaveInterval(seconds: AutosaveIntervalSeconds): void {
  if (autosaveIntervalSeconds === seconds) {
    return;
  }
  autosaveIntervalSeconds = seconds;
  broadcastAutosaveInterval();
}

function getDialogParent(): BrowserWindow | undefined {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
}

function showMessage(parent: BrowserWindow | undefined, options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

function showOpenDirectory(parent: BrowserWindow | undefined, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

async function performRelocation(action: () => Promise<{ dbPath: string }>): Promise<void> {
  const parent = getDialogParent();
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await showMessage(parent, {
      type: 'error',
      title: '更改数据位置失败',
      message: '无法更改数据存放位置',
      detail
    });
    return;
  }
  // Reload the renderer so it re-reads everything (including the storage location
  // shown in the menu) from the new database. Only after a successful switch.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
}

async function changeDataLocation(): Promise<void> {
  const parent = getDialogParent();
  const picked = await showOpenDirectory(parent, {
    title: '选择数据存放文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return;
  }
  const targetDir = picked.filePaths[0];

  const confirm = await showMessage(parent, {
    type: 'question',
    buttons: ['移动到此文件夹', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '更改数据存放位置',
    message: '确定把全部小说数据移动到该文件夹吗？',
    detail: `目标位置：\n${targetDir}\n\n移动完成后界面会自动重新加载，请先确保当前内容已保存（或已自动保存）。校验通过后，原文件夹中的数据库会被删除。`
  });
  if (confirm.response !== 0) {
    return;
  }

  await performRelocation(() => appDatabase.relocate(targetDir));
}

async function resetDataLocation(): Promise<void> {
  const parent = getDialogParent();
  let info: { dataDir: string; defaultDir: string; isCustom: boolean } | null = null;
  try {
    info = appDatabase.getStorageInfo();
  } catch {
    info = null;
  }
  if (!info || !info.isCustom) {
    return;
  }

  const confirm = await showMessage(parent, {
    type: 'question',
    buttons: ['恢复默认位置', '取消'],
    defaultId: 1,
    cancelId: 1,
    title: '恢复默认数据位置',
    message: '确定把数据移回默认位置吗？',
    detail: `默认位置：\n${info.defaultDir}\n\n移动完成后界面会自动重新加载。`
  });
  if (confirm.response !== 0) {
    return;
  }

  try {
    await appDatabase.restoreDefaultLocation();
  } catch (error) {
    if (error instanceof AppError && error.code === 'CUSTOM_LOCATION_UNREACHABLE') {
      // The custom location is offline. Never silently adopt the default — let the
      // user decide whether to abandon the (still-intact) offline data.
      const choice = await showMessage(parent, {
        type: 'warning',
        buttons: ['放弃该位置并使用默认位置', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '数据存放位置无法访问',
        message: '当前的数据存放位置无法访问',
        detail: `${error.message}\n\n当前位置：${info.dataDir}\n\n如果你确定不再使用它（例如磁盘已损坏或丢失），可以放弃该位置并改用默认位置。原位置上的数据不会被删除。`
      });
      if (choice.response === 0) {
        await performRelocation(() => appDatabase.restoreDefaultLocation({ force: true }));
      }
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    await showMessage(parent, {
      type: 'error',
      title: '恢复默认位置失败',
      message: '无法恢复默认数据位置',
      detail
    });
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
}

function openDataLocation(): void {
  let info: AppStorageInfo | null = null;
  try {
    info = appDatabase.getStorageInfo();
  } catch {
    info = null;
  }
  if (info && fs.existsSync(info.dataDir)) {
    void shell.openPath(info.dataDir);
  }
}

function showAboutDialog(): void {
  void showMessage(getDialogParent(), {
    type: 'info',
    title: '关于',
    message: '小说 AI 工作台',
    detail: `版本 ${app.getVersion()}`
  });
}

// Executes the action behind a custom (renderer-drawn) menu item or a keyboard
// accelerator, against the currently focused window.
function performMenuAction(action: AppMenuAction): void {
  const win = getDialogParent();
  const wc = win?.webContents;
  switch (action) {
    case 'undo': wc?.undo(); break;
    case 'redo': wc?.redo(); break;
    case 'cut': wc?.cut(); break;
    case 'copy': wc?.copy(); break;
    case 'paste': wc?.paste(); break;
    case 'selectAll': wc?.selectAll(); break;
    case 'reload': wc?.reload(); break;
    case 'forceReload': wc?.reloadIgnoringCache(); break;
    case 'toggleDevTools': wc?.toggleDevTools(); break;
    case 'resetZoom': wc?.setZoomLevel(0); break;
    case 'zoomIn': if (wc) wc.setZoomLevel(wc.getZoomLevel() + 0.5); break;
    case 'zoomOut': if (wc) wc.setZoomLevel(wc.getZoomLevel() - 0.5); break;
    case 'toggleFullscreen': if (win) win.setFullScreen(!win.isFullScreen()); break;
    case 'minimize': win?.minimize(); break;
    case 'closeWindow': win?.close(); break;
    case 'quit': app.quit(); break;
    case 'about': showAboutDialog(); break;
    default: break;
  }
}

// Keyboard shortcuts that a native menu used to provide. Text-editing shortcuts
// (Ctrl+C/V/X/Z/Y/A) are intentionally left to Chromium so they keep working in
// the editor without a menu.
function matchAccelerator(input: Electron.Input): AppMenuAction | null {
  if (input.type !== 'keyDown' || input.isAutoRepeat) {
    return null;
  }
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();
  const code = input.code;
  if (key === 'f11') return 'toggleFullscreen';
  if (key === 'f12') return 'toggleDevTools';
  if (ctrl && input.shift && key === 'i') return 'toggleDevTools';
  if (ctrl && input.shift && key === 'r') return 'forceReload';
  if (ctrl && !input.shift && key === 'r') return 'reload';
  // Match by physical key code so zoom works regardless of keyboard layout/IME.
  if (ctrl && (code === 'Digit0' || code === 'Numpad0')) return 'resetZoom';
  if (ctrl && (code === 'Equal' || code === 'NumpadAdd')) return 'zoomIn';
  if (ctrl && (code === 'Minus' || code === 'NumpadSubtract')) return 'zoomOut';
  return null;
}

function registerShellIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_MENU_ACTION, async (_event, input: AppMenuActionInput) =>
    withIpcResult(async () => {
      performMenuAction(input.action);
    })
  );

  ipcMain.handle(IPC_CHANNELS.APP_SET_AUTOSAVE_INTERVAL, async (_event, input: AppSetAutosaveIntervalInput) =>
    withIpcResult(async () => {
      setAutosaveInterval(input.seconds);
      return autosaveIntervalSeconds;
    })
  );

  ipcMain.handle(IPC_CHANNELS.APP_GET_STORAGE_INFO, async () =>
    withIpcResult(async () => appDatabase.getStorageInfo())
  );

  ipcMain.handle(IPC_CHANNELS.APP_CHANGE_DATA_LOCATION, async () =>
    withIpcResult(async () => {
      await changeDataLocation();
    })
  );

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_DATA_LOCATION, async () =>
    withIpcResult(async () => {
      openDataLocation();
    })
  );

  ipcMain.handle(IPC_CHANNELS.APP_RESTORE_DEFAULT_LOCATION, async () =>
    withIpcResult(async () => {
      await resetDataLocation();
    })
  );
}

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/preload.js');
  if (!fs.existsSync(preloadPath)) {
    throw new Error(`Preload script not found: ${preloadPath}`);
  }

  const windowInstance = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: '小说 AI 工作台',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow = windowInstance;

  // Replaces native-menu accelerators (the native menu is removed for a themed UI).
  windowInstance.webContents.on('before-input-event', (event, input) => {
    const action = matchAccelerator(input);
    if (action) {
      event.preventDefault();
      performMenuAction(action);
    }
  });

  windowInstance.once('ready-to-show', () => {
    windowInstance.show();
  });

  windowInstance.on('closed', () => {
    if (mainWindow === windowInstance) {
      mainWindow = null;
    }
  });

  if (isDev) {
    void windowInstance.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void windowInstance.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return windowInstance;
}

void app.whenReady()
  .then(async () => {
    try {
      await appDatabase.init();
    } catch (error) {
      // Don't quit on a DB init failure (e.g. an unreachable custom data location).
      // Open the window + menu so the user can recover via 设置 → 数据存放位置, and
      // let the renderer's app.init IPC surface the error screen with guidance.
      console.error('Database init failed (continuing so the user can recover):', error);
    }
    registerIpcHandlers({
      getAutosaveIntervalSeconds: () => autosaveIntervalSeconds
    });
    registerShellIpc();
    // No native menu — the renderer draws a themed dark menu bar instead.
    Menu.setApplicationMenu(null);
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error('App bootstrap failed:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  try {
    appDatabase.close();
  } catch (error) {
    console.error('Failed to close database on quit:', error);
  }
});
