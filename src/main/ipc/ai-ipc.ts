import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { deleteAiProviderConfig, getAiProviderConfigState, listCompatibleModels, updateAiProviderConfig } from '../ai/ai-config';
import { aiService } from '../ai/ai-service';
import { AppError } from '../db/errors';
import {
  buildChapterPromptPayload,
  buildAiChatPayload,
  hasMeaningfulAiReferenceContext,
  hasMeaningfulPitSuggestionContext,
  hasMeaningfulSummaryExtractionContext,
  normalizeAiFieldCandidate,
  parseAiPitCandidateReviewItems,
  parseAiPitResponseReviewItems,
  parsePitCandidates
} from './ai-support';
import { ensureDatabaseReady, withIpcResult } from './runtime';

export function registerAiIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AI_CONFIG_GET, async (): Promise<Shared.IpcResult<Shared.AiProviderConfigState>> =>
    withIpcResult(async () => getAiProviderConfigState())
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_CONFIG_UPDATE,
    async (_event, input: Shared.AiProviderConfigUpdateInput): Promise<Shared.IpcResult<Shared.AiProviderConfigState>> =>
      withIpcResult(async () => updateAiProviderConfig(input))
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_CONFIG_DELETE,
    async (_event, input: Shared.AiProviderConfigDeleteInput): Promise<Shared.IpcResult<Shared.AiProviderConfigState>> =>
      withIpcResult(async () => deleteAiProviderConfig(input))
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_CONFIG_LIST_MODELS,
    async (_event, input: Shared.AiProviderListModelsInput): Promise<Shared.IpcResult<Shared.AiProviderListModelsResult>> =>
      withIpcResult(async () => ({
        models: await listCompatibleModels(input)
      }))
  );

  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_event, input: Shared.AiChatInput): Promise<Shared.IpcResult<Shared.AiChatResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      const payload = buildAiChatPayload(input);
      const aiResult = await aiService.chat(payload);

      return {
        message: aiResult.text,
        provider: aiResult.provider,
        model: aiResult.model,
        referenceText: payload.referenceText
      };
    })
  );

  ipcMain.handle(IPC_CHANNELS.AI_EXTRACT_OUTLINE, async (_event, input: Shared.AiExtractOutlineInput): Promise<Shared.IpcResult<Shared.AiExtractOutlineResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'summarizeChapterFromContent', {
        promptText: input.promptText
      });
      if (!hasMeaningfulSummaryExtractionContext(resources)) {
        throw new AppError('VALIDATION_ERROR', '当前正文为空，暂时无法提取章节摘要。');
      }

      const aiResult = await aiService.summarizeChapterFromContent(payload);
      return {
        chapterId: resources.chapter.id,
        candidateOutline: aiResult.text,
        provider: aiResult.provider,
        model: aiResult.model,
        referenceText: payload.referenceText
      };
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_CHAPTER_TITLE,
    async (_event, input: Shared.AiGenerateChapterFieldInput): Promise<Shared.IpcResult<Shared.AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterTitle', {
          promptText: input.promptText
        });
        if (!hasMeaningfulAiReferenceContext(resources)) {
          throw new AppError('VALIDATION_ERROR', '当前上下文不足，暂时无法生成章节标题。');
        }

        const aiResult = await aiService.generateChapterTitle(payload);
        const candidateText = normalizeAiFieldCandidate(aiResult.text);
        if (!candidateText) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI generated empty chapter title');
        }

        return {
          chapterId: resources.chapter.id,
          field: 'title',
          candidateText,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_CHAPTER_GOAL,
    async (_event, input: Shared.AiGenerateChapterFieldInput): Promise<Shared.IpcResult<Shared.AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterGoal', {
          promptText: input.promptText
        });
        if (!hasMeaningfulAiReferenceContext(resources)) {
          throw new AppError('VALIDATION_ERROR', '当前上下文不足，暂时无法生成本章目标。');
        }

        const aiResult = await aiService.generateChapterGoal(payload);
        const candidateText = normalizeAiFieldCandidate(aiResult.text);
        if (!candidateText) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI generated empty chapter goal');
        }

        return {
          chapterId: resources.chapter.id,
          field: 'goal',
          candidateText,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_CHAPTER_NEXT_HOOK,
    async (_event, input: Shared.AiGenerateChapterFieldInput): Promise<Shared.IpcResult<Shared.AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterNextHook', {
          promptText: input.promptText
        });
        if (!hasMeaningfulAiReferenceContext(resources) && !resources.chapter.content.trim()) {
          throw new AppError('VALIDATION_ERROR', '当前上下文不足，暂时无法生成章末钩子。');
        }

        const aiResult = await aiService.generateChapterNextHook(payload);
        const candidateText = normalizeAiFieldCandidate(aiResult.text);
        if (!candidateText) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI generated empty next hook');
        }

        return {
          chapterId: resources.chapter.id,
          field: 'next_hook',
          candidateText,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_REVIEW_CHAPTER_PIT_RESPONSES,
    async (_event, input: Shared.AiReviewChapterPitResponsesInput): Promise<Shared.IpcResult<Shared.AiReviewChapterPitResponsesResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'reviewChapterPitResponses', {
          promptText: input.promptText
        });
        if (!resources.chapter.content.trim()) {
          throw new AppError('VALIDATION_ERROR', '当前正文为空，暂时无法 AI 总结填坑结果。');
        }
        if (resources.plannedPits.length === 0) {
          throw new AppError('VALIDATION_ERROR', '当前没有计划回应坑，暂时无法生成填坑总结。');
        }

        const aiResult = await aiService.reviewChapterPitResponses(payload);
        const items = parseAiPitResponseReviewItems(aiResult.text, resources.plannedPits);
        if (items.length === 0) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI 没有返回有效的填坑总结候选');
        }

        return {
          chapterId: resources.chapter.id,
          items,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_REVIEW_CHAPTER_PIT_CANDIDATES,
    async (_event, input: Shared.AiReviewChapterPitCandidatesInput): Promise<Shared.IpcResult<Shared.AiReviewChapterPitCandidatesResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'reviewChapterPitCandidates', {
          promptText: input.promptText
        });
        if (!resources.chapter.content.trim()) {
          throw new AppError('VALIDATION_ERROR', '当前正文为空，暂时无法 AI 分析埋坑确认。');
        }

        const aiResult = await aiService.reviewChapterPitCandidates(payload);
        const parsed = parseAiPitCandidateReviewItems(aiResult.text, resources.pitCandidates);
        if (parsed.existingItems.length === 0 && parsed.newItems.length === 0) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI 没有返回有效的埋坑确认候选');
        }

        return {
          chapterId: resources.chapter.id,
          existingItems: parsed.existingItems,
          newItems: parsed.newItems,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: resources.chapter.content.trim()
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GET_PIT_SUGGESTIONS,
    async (_event, input: Shared.ChapterGetPitSuggestionsInput): Promise<Shared.IpcResult<Shared.ChapterPitSuggestionsResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterPitsFromContent', {
          promptText: input.promptText
        });
        if (!hasMeaningfulPitSuggestionContext(resources)) {
          throw new AppError('VALIDATION_ERROR', '当前上下文不足，暂时无法生成新增坑候选。');
        }

        const aiResult = await aiService.generateChapterPitsFromContent(payload);
        const candidates = parsePitCandidates(aiResult.text);
        if (candidates.length === 0) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI generated empty pit candidates');
        }

        return {
          chapterId: resources.chapter.id,
          candidates,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GENERATE_PITS_FROM_CONTENT,
    async (_event, input: Shared.ChapterGeneratePitsFromContentInput): Promise<Shared.IpcResult<Shared.ChapterGeneratePitsFromContentResult>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterPitsFromContent');
        if (!hasMeaningfulPitSuggestionContext(resources)) {
          throw new AppError('VALIDATION_ERROR', '当前上下文不足，暂时无法生成新增坑候选。');
        }

        const aiResult = await aiService.generateChapterPitsFromContent(payload);
        const candidates = parsePitCandidates(aiResult.text);
        if (candidates.length === 0) {
          throw new AppError('AI_OUTPUT_INVALID', 'AI generated empty pit candidates');
        }

        return {
          chapterId: resources.chapter.id,
          candidates,
          provider: aiResult.provider,
          model: aiResult.model,
          referenceText: payload.referenceText
        };
      })
  );
}
