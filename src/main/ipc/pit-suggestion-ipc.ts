import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { ensureDatabaseReady, withIpcResult } from './runtime';

export function registerPitSuggestionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CHAPTER_REVIEW_PIT_RESPONSE, async (_event, input: Shared.ChapterReviewPitResponseInput): Promise<Shared.IpcResult<Shared.ChapterPitReviewView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.reviewPitResponse(input);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE_PIT_FROM_SUGGESTION,
    async (_event, input: Shared.ChapterCreatePitFromSuggestionInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.createChapterPitFromSuggestion(input);
      })
  );

  ipcMain.handle(IPC_CHANNELS.PIT_LIST_BY_PROJECT, async (_event, input: Shared.PitListByProjectInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listPitsByProject(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PIT_CREATE_MANUAL, async (_event, input: Shared.PitCreateManualInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createManualPit(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PIT_UPDATE, async (_event, input: Shared.PitUpdateInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.updatePit(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PIT_DELETE, async (_event, input: Shared.PitDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.deletePit(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.SUGGESTION_LIST_BY_ENTITY, async (_event, input: Shared.SuggestionListByEntityInput) =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listSuggestionsByEntity(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.SUGGESTION_CREATE_MOCK, async (_event, input: Shared.SuggestionCreateMockInput) =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createMockSuggestion(input);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_APPLY,
    async (_event, input: Shared.SuggestionApplyInput): Promise<Shared.IpcResult<Shared.SuggestionApplyResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.applySuggestion(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.SUGGESTION_REJECT,
    async (_event, input: Shared.SuggestionRejectInput): Promise<Shared.IpcResult<Shared.SuggestionRejectResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.rejectSuggestion(input);
      })
  );
}
