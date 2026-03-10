import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AppInitData,
  type Chapter,
  type ChapterCreateInput,
  type ChapterUpdateInput,
  type IpcError,
  type IpcResult,
  type NovelProject,
  type ProjectCreateInput,
  type SuggestionCreateMockInput,
  type SuggestionListByEntityInput
} from '../shared/ipc';
import { AppError, appDatabase } from './db/database';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'Novel AI Studio',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
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
      return appDatabase.getInitData();
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
}

void app.whenReady()
  .then(async () => {
    await appDatabase.init();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((error) => {
    // Fails fast when runtime initialization (including sqlite wasm load) breaks.
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
