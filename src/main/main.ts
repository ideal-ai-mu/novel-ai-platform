import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AppInitData,
  type AutosaveIntervalSeconds,
  type Chapter,
  type ChapterCreateInput,
  type ChapterDeleteInput,
  type ChapterGenerateOutlineAiInput,
  type ChapterGenerateOutlineAiResult,
  type ChapterRefs,
  type ChapterRefsGetInput,
  type ChapterRefsUpdateInput,
  type ChapterUpdateInput,
  type Character,
  type CharacterCreateInput,
  type CharacterDeleteInput,
  type CharacterUpdateInput,
  type DeleteResult,
  type IpcError,
  type IpcResult,
  type LoreEntry,
  type LoreEntryCreateInput,
  type LoreEntryDeleteInput,
  type LoreEntryUpdateInput,
  type NovelProject,
  type ProjectCreateInput,
  type ProjectDeleteInput,
  type ProjectGetInput,
  type SuggestionApplyInput,
  type SuggestionApplyResult,
  type SuggestionCreateMockInput,
  type SuggestionListByEntityInput,
  type SuggestionRejectInput,
  type SuggestionRejectResult
} from '../shared/ipc';
import { AppError, appDatabase } from './db/database';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const AUTOSAVE_OPTIONS: AutosaveIntervalSeconds[] = [0, 5, 10, 30, 60];

let mainWindow: BrowserWindow | null = null;
let autosaveIntervalSeconds: AutosaveIntervalSeconds = 10;

function autosaveOptionLabel(seconds: AutosaveIntervalSeconds): string {
  if (seconds === 0) {
    return '关闭';
  }
  if (seconds === 10) {
    return '10 秒（默认）';
  }
  return `${seconds} 秒`;
}

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
  installApplicationMenu();
  broadcastAutosaveInterval();
}

function buildAutosaveMenuItems(): MenuItemConstructorOptions[] {
  return AUTOSAVE_OPTIONS.map((seconds) => ({
    label: autosaveOptionLabel(seconds),
    type: 'radio',
    checked: autosaveIntervalSeconds === seconds,
    click: () => setAutosaveInterval(seconds)
  }));
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '设置',
      submenu: [
        {
          label: '自动保存',
          submenu: buildAutosaveMenuItems()
        }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '帮助',
      submenu: [{ role: 'about', label: '关于 小说 AI 工作台' }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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

function toIpcError(error: unknown): IpcError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown error'
  };
}

async function withIpcResult<T>(handler: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await handler();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toIpcError(error) };
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_INIT, async (): Promise<IpcResult<AppInitData>> =>
    withIpcResult(async () => {
      await appDatabase.init();
      return {
        ...appDatabase.getInitData(),
        autosaveIntervalSeconds
      };
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async (): Promise<IpcResult<NovelProject[]>> =>
    withIpcResult(async () => {
      await appDatabase.init();
      return appDatabase.listProjects();
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    async (_event, input: ProjectCreateInput): Promise<IpcResult<NovelProject>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_GET,
    async (_event, input: ProjectGetInput): Promise<IpcResult<NovelProject>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getProject(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE,
    async (_event, input: ProjectDeleteInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deleteProject(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST,
    async (_event, input: { projectId: string }): Promise<IpcResult<Chapter[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapters(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE,
    async (_event, input: ChapterCreateInput): Promise<IpcResult<Chapter>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createChapter(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GET,
    async (_event, input: { chapterId: string }): Promise<IpcResult<Chapter>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getChapter(input.chapterId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_UPDATE,
    async (_event, input: ChapterUpdateInput): Promise<IpcResult<Chapter>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updateChapter(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GENERATE_OUTLINE_AI,
    async (_event, input: ChapterGenerateOutlineAiInput): Promise<IpcResult<ChapterGenerateOutlineAiResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.generateChapterOutlineAi(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_DELETE,
    async (_event, input: ChapterDeleteInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deleteChapter(input.chapterId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REFS_GET,
    async (_event, input: ChapterRefsGetInput): Promise<IpcResult<ChapterRefs>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getChapterRefs(input.chapterId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REFS_UPDATE,
    async (_event, input: ChapterRefsUpdateInput): Promise<IpcResult<ChapterRefs>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updateChapterRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_LIST,
    async (_event, input: { projectId: string }): Promise<IpcResult<Character[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listCharacters(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_CREATE,
    async (_event, input: CharacterCreateInput): Promise<IpcResult<Character>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createCharacter(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_GET,
    async (_event, input: { characterId: string }): Promise<IpcResult<Character>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getCharacter(input.characterId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_UPDATE,
    async (_event, input: CharacterUpdateInput): Promise<IpcResult<Character>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updateCharacter(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_DELETE,
    async (_event, input: CharacterDeleteInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deleteCharacter(input.characterId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.LORE_LIST,
    async (_event, input: { projectId: string }): Promise<IpcResult<LoreEntry[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listLoreEntries(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.LORE_CREATE,
    async (_event, input: LoreEntryCreateInput): Promise<IpcResult<LoreEntry>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createLoreEntry(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.LORE_GET,
    async (_event, input: { loreEntryId: string }): Promise<IpcResult<LoreEntry>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getLoreEntry(input.loreEntryId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.LORE_UPDATE,
    async (_event, input: LoreEntryUpdateInput): Promise<IpcResult<LoreEntry>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updateLoreEntry(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.LORE_DELETE,
    async (_event, input: LoreEntryDeleteInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deleteLoreEntry(input.loreEntryId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_LIST_BY_ENTITY,
    async (_event, input: SuggestionListByEntityInput) =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listSuggestionsByEntity(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_CREATE_MOCK,
    async (_event, input: SuggestionCreateMockInput) =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createMockSuggestion(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_APPLY,
    async (_event, input: SuggestionApplyInput): Promise<IpcResult<SuggestionApplyResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.applySuggestion(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_REJECT,
    async (_event, input: SuggestionRejectInput): Promise<IpcResult<SuggestionRejectResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.rejectSuggestion(input);
      })
  );
}

void app.whenReady()
  .then(async () => {
    await appDatabase.init();
    registerIpcHandlers();
    installApplicationMenu();
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
  appDatabase.close();
});
