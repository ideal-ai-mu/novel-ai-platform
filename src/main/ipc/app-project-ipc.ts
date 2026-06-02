import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { ensureDatabaseReady, type RegisterIpcHandlersOptions, withIpcResult } from './runtime';

export function registerAppProjectIpc(options: RegisterIpcHandlersOptions): void {
  ipcMain.handle(IPC_CHANNELS.APP_INIT, async (): Promise<Shared.IpcResult<Shared.AppInitData>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return {
        ...appDatabase.getInitData(),
        autosaveIntervalSeconds: options.getAutosaveIntervalSeconds()
      };
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, async (): Promise<Shared.IpcResult<Shared.NovelProject[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listProjects();
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST_DELETED, async (): Promise<Shared.IpcResult<Shared.NovelProject[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listDeletedProjects();
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (_event, input: Shared.ProjectCreateInput): Promise<Shared.IpcResult<Shared.NovelProject>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createProject(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, async (_event, input: Shared.ProjectGetInput): Promise<Shared.IpcResult<Shared.NovelProject>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.getProject(input.projectId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, async (_event, input: Shared.ProjectUpdateInput): Promise<Shared.IpcResult<Shared.NovelProject>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.updateProject(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, async (_event, input: Shared.ProjectDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.deleteProject(input.projectId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_RESTORE, async (_event, input: Shared.ProjectRestoreInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.restoreProject(input.projectId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE_PERMANENT,
    async (_event, input: Shared.ProjectDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.deleteProjectPermanent(input.projectId);
      })
  );
}
