import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { ensureDatabaseReady, withIpcResult } from './runtime';

export function registerPitSuggestionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST_CREATED_PITS, async (_event, input: Shared.ChapterListCreatedPitsInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapterCreatedPits(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST_PLANNED_PITS, async (_event, input: Shared.ChapterListPlannedPitsInput): Promise<Shared.IpcResult<Shared.ChapterPitPlanView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapterPlannedPits(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_PLAN_PIT_RESPONSE, async (_event, input: Shared.ChapterPlanPitResponseInput): Promise<Shared.IpcResult<Shared.ChapterPitPlanView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.planPitResponse(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_UNPLAN_PIT_RESPONSE, async (_event, input: Shared.ChapterUnplanPitResponseInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.unplanPitResponse(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST_PIT_REVIEWS, async (_event, input: Shared.ChapterListPitReviewsInput): Promise<Shared.IpcResult<Shared.ChapterPitReviewView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapterPitReviews(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_REVIEW_PIT_RESPONSE, async (_event, input: Shared.ChapterReviewPitResponseInput): Promise<Shared.IpcResult<Shared.ChapterPitReviewView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.reviewPitResponse(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_CLEAR_PIT_REVIEW, async (_event, input: Shared.ChapterClearPitReviewInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.clearPitReview(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST_PIT_CANDIDATES, async (_event, input: Shared.ChapterListPitCandidatesInput): Promise<Shared.IpcResult<Shared.ChapterPitCandidate[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapterPitCandidates(input);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE_PIT_CANDIDATE_MANUAL,
    async (_event, input: Shared.ChapterCreatePitCandidateManualInput): Promise<Shared.IpcResult<Shared.ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.createPitCandidateManual(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_UPDATE_PIT_CANDIDATE,
    async (_event, input: Shared.ChapterUpdatePitCandidateInput): Promise<Shared.IpcResult<Shared.ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.updatePitCandidate(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_DELETE_PIT_CANDIDATE,
    async (_event, input: Shared.ChapterDeletePitCandidateInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.deletePitCandidate(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REVIEW_PIT_CANDIDATE,
    async (_event, input: Shared.ChapterReviewPitCandidateInput): Promise<Shared.IpcResult<Shared.ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.reviewPitCandidate(input);
      })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_LIST_RESOLVED_PITS, async (_event, input: Shared.ChapterListResolvedPitsInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listChapterResolvedPits(input);
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

  ipcMain.handle(IPC_CHANNELS.CHAPTER_CREATE_PIT_MANUAL, async (_event, input: Shared.ChapterCreatePitManualInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createChapterPitManual(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_CREATE_PIT, async (_event, input: Shared.ChapterCreatePitInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createChapterPit(input);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_APPLY_GENERATED_PITS,
    async (_event, input: Shared.ChapterApplyGeneratedPitsInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.applyGeneratedPits(input);
      })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_RESOLVE_PIT, async (_event, input: Shared.ChapterResolvePitInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.resolvePit(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHAPTER_UNRESOLVE_PIT, async (_event, input: Shared.ChapterUnresolvePitInput): Promise<Shared.IpcResult<Shared.StoryPitView>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.unresolvePit(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.PIT_LIST_BY_PROJECT, async (_event, input: Shared.PitListByProjectInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listPitsByProject(input);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_LIST_GROUPED_BY_PROJECT,
    async (_event, input: Shared.PitListGroupedByProjectInput): Promise<Shared.IpcResult<Shared.PitGroupedByProjectResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listPitsGroupedByProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_LIST_AVAILABLE_FOR_CHAPTER,
    async (_event, input: Shared.PitListAvailableForChapterInput): Promise<Shared.IpcResult<Shared.StoryPitView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listAvailablePitsForChapter(input);
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
