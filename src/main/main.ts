import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AiExtractOutlineInput,
  type AiExtractOutlineResult,
  type AiGenerateChapterFieldInput,
  type AiGenerateChapterFieldResult,
  type AiReviewChapterPitCandidatesInput,
  type AiReviewChapterPitCandidatesResult,
  type AiReviewChapterPitResponsesInput,
  type AiReviewChapterPitResponsesResult,
  type AppInitData,
  type AutosaveIntervalSeconds,
  type Chapter,
  type ChapterApplyGeneratedPitsInput,
  type ChapterAutoPickContextRefsInput,
  type ChapterClearPitReviewInput,
  type ChapterContextRefAddInput,
  type ChapterContextRefRemoveInput,
  type ChapterContextRefUpdateInput,
  type ChapterContextRefView,
  type ChapterContextRefsGetInput,
  type ChapterCreateInput,
  type ChapterCreatePitFromSuggestionInput,
  type ChapterCreatePitCandidateManualInput,
  type ChapterCreatePitManualInput,
  type ChapterCreatePitInput,
  type ChapterDeleteInput,
  type ChapterDeletePitCandidateInput,
  type ChapterGeneratePitsFromContentInput,
  type ChapterGeneratePitsFromContentResult,
  type ChapterGetPitSuggestionsInput,
  type ChapterListPitCandidatesInput,
  type ChapterListPitReviewsInput,
  type ChapterListPlannedPitsInput,
  type ChapterPitSuggestionsResult,
  type ChapterPitCandidate,
  type ChapterPitCandidateStatus,
  type ChapterPitPlanView,
  type ChapterPitReviewOutcome,
  type ChapterPitReviewView,
  type ChapterPlanPitResponseInput,
  type ChapterListCreatedPitsInput,
  type ChapterListOutlinesByProjectInput,
  type ChapterListResolvedPitsInput,
  type ChapterOutlineOverviewItem,
  type ChapterRefs,
  type ChapterRefsGetInput,
  type ChapterRefsUpdateInput,
  type ChapterReviewPitCandidateInput,
  type ChapterReviewPitResponseInput,
  type ChapterResolvePitInput,
  type ChapterUnplanPitResponseInput,
  type ChapterUnresolvePitInput,
  type ChapterUpdatePitCandidateInput,
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
  type PitCreateManualInput,
  type PitDeleteInput,
  type PitGroupedByProjectResult,
  type PitListAvailableForChapterInput,
  type PitListByProjectInput,
  type PitListGroupedByProjectInput,
  type PitUpdateInput,
  type ProjectCreateInput,
  type ProjectDeleteInput,
  type ProjectGetInput,
  type StoryPitView,
  type SuggestionApplyInput,
  type SuggestionApplyResult,
  type SuggestionCreateMockInput,
  type SuggestionListByEntityInput,
  type SuggestionRejectInput,
  type SuggestionRejectResult
} from '../shared/ipc';
import { aiService } from './ai/ai-service';
import { contextAssembler } from './ai/context-assembler';
import { promptBuilder } from './ai/prompt-builder';
import type { AiTaskType, PromptPayload } from './ai/provider';
import { AppError, appDatabase } from './db/database';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const AUTOSAVE_OPTIONS: AutosaveIntervalSeconds[] = [0, 5, 10, 30, 60];

let mainWindow: BrowserWindow | null = null;
let autosaveIntervalSeconds: AutosaveIntervalSeconds = 10;

type LoadedChapterAiResources = {
  chapter: Chapter;
  project: NovelProject;
  linkedCharacters: Character[];
  linkedLoreEntries: LoreEntry[];
  referenceChapters: ChapterContextRefView[];
  plannedPits: ChapterPitPlanView[];
  pitReviews: ChapterPitReviewView[];
  pitCandidates: ChapterPitCandidate[];
};

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

function hasMeaningfulAiReferenceContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.goal.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.outline_user.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.chapter.foreshadow_notes_json.length > 0 ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.plannedPits.length > 0 ||
      resources.pitCandidates.length > 0 ||
      resources.pitReviews.length > 0
  );
}

function hasMeaningfulSummaryExtractionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(resources.chapter.content.trim());
}

function hasMeaningfulPitSuggestionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.content.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.goal.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.chapter.foreshadow_notes_json.length > 0 ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.plannedPits.length > 0
  );
}

function normalizeAiFieldCandidate(text: string): string {
  return text.trim().replace(/^[\s"'“”‘’《》【】]+|[\s"'“”‘’《》【】]+$/gu, '');
}

function normalizePitCandidate(text: string): string {
  return text
    .trim()
    .replace(/^[-*\d.)\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parsePitCandidates(text: string): string[] {
  const lines = text
    .split(/\r?\n+/u)
    .map(normalizePitCandidate)
    .filter((item) => item.length > 0);

  if (lines.length > 0) {
    return Array.from(new Set(lines)).slice(0, 6);
  }

  const single = normalizePitCandidate(text);
  return single ? [single] : [];
}

function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('AI returned non-object JSON');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new AppError('AI_OUTPUT_INVALID', error instanceof Error ? error.message : 'AI returned invalid JSON');
  }
}

function ensurePitReviewOutcomeValue(value: unknown): ChapterPitReviewOutcome {
  return value === 'none' || value === 'partial' || value === 'clear' || value === 'resolved' ? value : 'none';
}

function ensurePitCandidateStatusValue(value: unknown): ChapterPitCandidateStatus {
  return value === 'draft' || value === 'weak' || value === 'confirmed' || value === 'discarded' ? value : 'draft';
}

function parseAiPitResponseReviewItems(text: string, plannedPits: ChapterPitPlanView[]): AiReviewChapterPitResponsesResult['items'] {
  const json = parseJsonRecord(text);
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const plannedByPitId = new Map(plannedPits.map((plan) => [plan.pit.id, plan]));

  const items = rawItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const pitId = typeof item.pitId === 'string' ? item.pitId : '';
      if (!plannedByPitId.has(pitId)) {
        return null;
      }
      return {
        pitId,
        outcome: ensurePitReviewOutcomeValue(item.outcome),
        note: typeof item.note === 'string' ? item.note.trim() : ''
      };
    })
    .filter((item): item is AiReviewChapterPitResponsesResult['items'][number] => item !== null);

  return Array.from(new Map(items.map((item) => [item.pitId, item])).values());
}

function parseAiPitCandidateReviewItems(
  text: string,
  pitCandidates: ChapterPitCandidate[]
): Pick<AiReviewChapterPitCandidatesResult, 'existingItems' | 'newItems'> {
  const json = parseJsonRecord(text);
  const rawExistingItems = Array.isArray(json.existingItems) ? json.existingItems : [];
  const rawNewItems = Array.isArray(json.newItems) ? json.newItems : [];
  const candidateById = new Map(pitCandidates.map((candidate) => [candidate.id, candidate]));

  const existingItems = rawExistingItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const candidateId = typeof item.candidateId === 'string' ? item.candidateId : '';
      if (!candidateById.has(candidateId)) {
        return null;
      }
      return {
        candidateId,
        status: ensurePitCandidateStatusValue(item.status)
      };
    })
    .filter((item): item is AiReviewChapterPitCandidatesResult['existingItems'][number] => item !== null);

  const newItems = rawNewItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      content: typeof item.content === 'string' ? normalizePitCandidate(item.content) : '',
      status: ensurePitCandidateStatusValue(item.status)
    }))
    .filter((item) => item.content.length > 0);

  return {
    existingItems: Array.from(new Map(existingItems.map((item) => [item.candidateId, item])).values()),
    newItems: Array.from(new Map(newItems.map((item) => [item.content, item])).values())
  };
}

async function loadChapterAiResources(chapterId: string): Promise<LoadedChapterAiResources> {
  const chapter = appDatabase.getChapter(chapterId);
  const project = appDatabase.getProject(chapter.project_id);
  const refs = appDatabase.getChapterRefs(chapter.id);
  const allCharacters = appDatabase.listCharacters(chapter.project_id);
  const allLoreEntries = appDatabase.listLoreEntries(chapter.project_id);
  const linkedCharacters = refs.characterIds
    .map((characterId) => allCharacters.find((character) => character.id === characterId) ?? null)
    .filter((character): character is Character => character !== null);
  const linkedLoreEntries = refs.loreEntryIds
    .map((loreEntryId) => allLoreEntries.find((entry) => entry.id === loreEntryId) ?? null)
    .filter((entry): entry is LoreEntry => entry !== null);

  return {
    chapter,
    project,
    linkedCharacters,
    linkedLoreEntries,
    referenceChapters: appDatabase.getChapterContextRefs({ chapterId }),
    plannedPits: appDatabase.listChapterPlannedPits({ chapterId }),
    pitReviews: appDatabase.listChapterPitReviews({ chapterId }),
    pitCandidates: appDatabase.listChapterPitCandidates({ chapterId })
  };
}

async function buildChapterPromptPayload(
  chapterId: string,
  taskType: AiTaskType,
  options: { promptText?: string } = {}
): Promise<{ resources: LoadedChapterAiResources; payload: PromptPayload }> {
  const resources = await loadChapterAiResources(chapterId);
  const context = contextAssembler.assembleChapterContext({
    taskType,
    project: resources.project,
    chapter: resources.chapter,
    linkedCharacters: resources.linkedCharacters,
    linkedLoreEntries: resources.linkedLoreEntries,
    referenceChapters: resources.referenceChapters,
    plannedPits: resources.plannedPits,
    pitReviews: resources.pitReviews,
    pitCandidates: resources.pitCandidates
  });

  return {
    resources,
    payload: promptBuilder.build(context, { transientInstruction: options.promptText })
  };
}

async function ensureChapterHasInitialOutline(chapter: Chapter): Promise<Chapter> {
  if (chapter.outline_user.trim() || !chapter.content.trim()) {
    return chapter;
  }

  try {
    const { resources, payload } = await buildChapterPromptPayload(chapter.id, 'summarizeChapterFromContent');
    if (!hasMeaningfulSummaryExtractionContext(resources)) {
      return chapter;
    }

    const aiResult = await aiService.summarizeChapterFromContent(payload);
    const candidateOutline = aiResult.text.trim();
    if (!candidateOutline) {
      return chapter;
    }

    return appDatabase.updateChapter({
      chapterId: chapter.id,
      patch: {
        outline_user: candidateOutline
      }
    });
  } catch {
    return chapter;
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
        const chapter = appDatabase.createChapter(input);
        return ensureChapterHasInitialOutline(chapter);
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
    IPC_CHANNELS.CHAPTER_CONTEXT_REFS_GET,
    async (_event, input: ChapterContextRefsGetInput): Promise<IpcResult<ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.getChapterContextRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_ADD,
    async (_event, input: ChapterContextRefAddInput): Promise<IpcResult<ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.addChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_REMOVE,
    async (_event, input: ChapterContextRefRemoveInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.removeChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REF_UPDATE,
    async (_event, input: ChapterContextRefUpdateInput): Promise<IpcResult<ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updateChapterContextRef(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CONTEXT_REFS_AUTO_PICK,
    async (_event, input: ChapterAutoPickContextRefsInput): Promise<IpcResult<ChapterContextRefView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.autoPickChapterContextRefs(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_OUTLINES_BY_PROJECT,
    async (_event, input: ChapterListOutlinesByProjectInput): Promise<IpcResult<ChapterOutlineOverviewItem[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterOutlinesByProject(input.projectId);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_EXTRACT_OUTLINE,
    async (_event, input: AiExtractOutlineInput): Promise<IpcResult<AiExtractOutlineResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    async (_event, input: AiGenerateChapterFieldInput): Promise<IpcResult<AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    async (_event, input: AiGenerateChapterFieldInput): Promise<IpcResult<AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    async (_event, input: AiGenerateChapterFieldInput): Promise<IpcResult<AiGenerateChapterFieldResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    async (_event, input: AiReviewChapterPitResponsesInput): Promise<IpcResult<AiReviewChapterPitResponsesResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    async (_event, input: AiReviewChapterPitCandidatesInput): Promise<IpcResult<AiReviewChapterPitCandidatesResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    IPC_CHANNELS.CHAPTER_LIST_CREATED_PITS,
    async (_event, input: ChapterListCreatedPitsInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterCreatedPits(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_PLANNED_PITS,
    async (_event, input: ChapterListPlannedPitsInput): Promise<IpcResult<ChapterPitPlanView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterPlannedPits(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_PLAN_PIT_RESPONSE,
    async (_event, input: ChapterPlanPitResponseInput): Promise<IpcResult<ChapterPitPlanView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.planPitResponse(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_UNPLAN_PIT_RESPONSE,
    async (_event, input: ChapterUnplanPitResponseInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.unplanPitResponse(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_PIT_REVIEWS,
    async (_event, input: ChapterListPitReviewsInput): Promise<IpcResult<ChapterPitReviewView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterPitReviews(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REVIEW_PIT_RESPONSE,
    async (_event, input: ChapterReviewPitResponseInput): Promise<IpcResult<ChapterPitReviewView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.reviewPitResponse(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CLEAR_PIT_REVIEW,
    async (_event, input: ChapterClearPitReviewInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.clearPitReview(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_PIT_CANDIDATES,
    async (_event, input: ChapterListPitCandidatesInput): Promise<IpcResult<ChapterPitCandidate[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterPitCandidates(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE_PIT_CANDIDATE_MANUAL,
    async (_event, input: ChapterCreatePitCandidateManualInput): Promise<IpcResult<ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createPitCandidateManual(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_UPDATE_PIT_CANDIDATE,
    async (_event, input: ChapterUpdatePitCandidateInput): Promise<IpcResult<ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updatePitCandidate(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_DELETE_PIT_CANDIDATE,
    async (_event, input: ChapterDeletePitCandidateInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deletePitCandidate(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_REVIEW_PIT_CANDIDATE,
    async (_event, input: ChapterReviewPitCandidateInput): Promise<IpcResult<ChapterPitCandidate>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.reviewPitCandidate(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_LIST_RESOLVED_PITS,
    async (_event, input: ChapterListResolvedPitsInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterResolvedPits(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GET_PIT_SUGGESTIONS,
    async (_event, input: ChapterGetPitSuggestionsInput): Promise<IpcResult<ChapterPitSuggestionsResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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
    IPC_CHANNELS.CHAPTER_CREATE_PIT_FROM_SUGGESTION,
    async (_event, input: ChapterCreatePitFromSuggestionInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createChapterPitFromSuggestion(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE_PIT_MANUAL,
    async (_event, input: ChapterCreatePitManualInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createChapterPitManual(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_CREATE_PIT,
    async (_event, input: ChapterCreatePitInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createChapterPit(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_GENERATE_PITS_FROM_CONTENT,
    async (_event, input: ChapterGeneratePitsFromContentInput): Promise<IpcResult<ChapterGeneratePitsFromContentResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
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

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_APPLY_GENERATED_PITS,
    async (_event, input: ChapterApplyGeneratedPitsInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.applyGeneratedPits(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_RESOLVE_PIT,
    async (_event, input: ChapterResolvePitInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.resolvePit(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAPTER_UNRESOLVE_PIT,
    async (_event, input: ChapterUnresolvePitInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.unresolvePit(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_LIST_BY_PROJECT,
    async (_event, input: PitListByProjectInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listPitsByProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_LIST_GROUPED_BY_PROJECT,
    async (_event, input: PitListGroupedByProjectInput): Promise<IpcResult<PitGroupedByProjectResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listPitsGroupedByProject(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_LIST_AVAILABLE_FOR_CHAPTER,
    async (_event, input: PitListAvailableForChapterInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listAvailablePitsForChapter(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_CREATE_MANUAL,
    async (_event, input: PitCreateManualInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.createManualPit(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_UPDATE,
    async (_event, input: PitUpdateInput): Promise<IpcResult<StoryPitView>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.updatePit(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.PIT_DELETE,
    async (_event, input: PitDeleteInput): Promise<IpcResult<DeleteResult>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.deletePit(input);
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
