import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { deleteAiProviderConfig, getAiProviderConfigState, listCompatibleModels, updateAiProviderConfig } from '../ai/ai-config';
import { aiService } from '../ai/ai-service';
import { AppError } from '../db/errors';
import {
  buildChapterPromptPayload,
  buildAiChatPayload,
  hasMeaningfulPitSuggestionContext,
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
}
