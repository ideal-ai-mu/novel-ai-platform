import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { ensureChapterHasInitialOutline } from './ai-support';
import { ensureDatabaseReady, withIpcResult } from './runtime';

export function registerChapterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST, async (_event, input: { projectId: string }): Promise<Shared.IpcResult<Shared.Chapter[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapters(input.projectId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_DELETED,
    async (_event, input: Shared.ChapterListDeletedInput): Promise<Shared.IpcResult<Shared.Chapter[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listDeletedChapters(input.projectId);
      })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_CREATE, async (_event, input: Shared.ChapterCreateInput): Promise<Shared.IpcResult<Shared.Chapter>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      const chapter = appDatabase.createChapter(input);
      return ensureChapterHasInitialOutline(chapter);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_GET, async (_event, input: { chapterId: string }): Promise<Shared.IpcResult<Shared.Chapter>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.getChapter(input.chapterId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_UPDATE, async (_event, input: Shared.ChapterUpdateInput): Promise<Shared.IpcResult<Shared.Chapter>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.updateChapter(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_DELETE, async (_event, input: Shared.ChapterDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.deleteChapter(input.chapterId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_RESTORE, async (_event, input: Shared.ChapterRestoreInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.restoreChapter(input.chapterId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_DELETE_PERMANENT,
    async (_event, input: Shared.ChapterDeletePermanentInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.deleteChapterPermanent(input.chapterId);
      })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_REFS_GET, async (_event, input: Shared.ChapterRefsGetInput): Promise<Shared.IpcResult<Shared.ChapterRefs>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.getChapterRefs(input.chapterId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REFS_UPDATE,
    async (_event, input: Shared.ChapterRefsUpdateInput): Promise<Shared.IpcResult<Shared.ChapterRefs>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.updateChapterRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_RELATIONSHIP_GRAPH_GET,
    async (_event, input: Shared.ChapterRelationshipGraphGetInput): Promise<Shared.IpcResult<Shared.ChapterRelationshipGraph>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.getChapterRelationshipGraph(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_RELATIONSHIP_GRAPH_UPDATE,
    async (_event, input: Shared.ChapterRelationshipGraphUpdateInput): Promise<Shared.IpcResult<Shared.ChapterRelationshipGraph>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.updateChapterRelationshipGraph(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REFS_GET,
    async (_event, input: Shared.ChapterContextRefsGetInput): Promise<Shared.IpcResult<Shared.ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.getChapterContextRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_ADD,
    async (_event, input: Shared.ChapterContextRefAddInput): Promise<Shared.IpcResult<Shared.ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.addChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_REMOVE,
    async (_event, input: Shared.ChapterContextRefRemoveInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.removeChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_UPDATE,
    async (_event, input: Shared.ChapterContextRefUpdateInput): Promise<Shared.IpcResult<Shared.ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.updateChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REFS_AUTO_PICK,
    async (_event, input: Shared.ChapterAutoPickContextRefsInput): Promise<Shared.IpcResult<Shared.ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.autoPickChapterContextRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_OUTLINES_BY_PROJECT,
    async (_event, input: Shared.ChapterListOutlinesByProjectInput): Promise<Shared.IpcResult<Shared.ChapterOutlineOverviewItem[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listChapterOutlinesByProject(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_EVENT_LIST_BY_PROJECT,
    async (_event, input: Shared.TimelineEventListByProjectInput): Promise<Shared.IpcResult<Shared.TimelineEventView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listTimelineEventsByProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_EVENT_REPLACE_CHAPTER,
    async (_event, input: Shared.TimelineEventReplaceChapterInput): Promise<Shared.IpcResult<Shared.TimelineEventView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.replaceChapterTimelineEvents(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_LAYER_LIST_BY_PROJECT,
    async (_event, input: Shared.TimelineLayerListByProjectInput): Promise<Shared.IpcResult<Shared.TimelineLayerData>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listTimelineLayersByProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.TIMELINE_LAYER_REPLACE_CHAPTER,
    async (_event, input: Shared.TimelineLayerReplaceChapterInput): Promise<Shared.IpcResult<Shared.TimelineLayerData>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.replaceChapterTimelineLayers(input);
      })
  );
}
