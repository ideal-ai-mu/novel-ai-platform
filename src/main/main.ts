import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  IPC_CHANNELS,
  type AiExtractOutlineInput,
  type AiExtractOutlineResult,
  type AiGenerateChapterFieldInput,
  type AiGenerateChapterFieldResult,
  type AppInitData,
  type AutosaveIntervalSeconds,
  type Chapter,
  type ChapterApplyGeneratedPitsInput,
  type ChapterAutoPickContextRefsInput,
  type ChapterContextRefAddInput,
  type ChapterContextRefRemoveInput,
  type ChapterContextRefUpdateInput,
  type ChapterContextRefView,
  type ChapterContextRefsGetInput,
  type ChapterCreateInput,
  type ChapterCreatePitFromSuggestionInput,
  type ChapterCreatePitManualInput,
  type ChapterCreatePitInput,
  type ChapterDeleteInput,
  type ChapterGeneratePitsFromContentInput,
  type ChapterGeneratePitsFromContentResult,
  type ChapterGetPitSuggestionsInput,
  type ChapterPitSuggestionsResult,
  type ChapterListCreatedPitsInput,
  type ChapterListOutlinesByProjectInput,
  type ChapterListResolvedPitsInput,
  type ChapterOutlineOverviewItem,
  type ChapterRefs,
  type ChapterRefsGetInput,
  type ChapterRefsUpdateInput,
  type ChapterResolvePitInput,
  type ChapterUnresolvePitInput,
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
  createdPits: StoryPitView[];
  resolvedPits: StoryPitView[];
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
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.createdPits.length > 0 ||
      resources.resolvedPits.length > 0
  );
}

function hasMeaningfulSummaryExtractionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.content.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.goal.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.createdPits.length > 0 ||
      resources.resolvedPits.length > 0
  );
}

function hasMeaningfulPitSuggestionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.content.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.goal.trim() ||
      resources.chapter.outline_user.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0
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
    createdPits: appDatabase.listChapterCreatedPits({ chapterId }),
    resolvedPits: appDatabase.listChapterResolvedPits({ chapterId })
  };
}

async function buildChapterPromptPayload(
  chapterId: string,
  taskType: AiTaskType
): Promise<{ resources: LoadedChapterAiResources; payload: PromptPayload }> {
  const resources = await loadChapterAiResources(chapterId);
  const context = contextAssembler.assembleChapterContext({
    taskType,
    project: resources.project,
    chapter: resources.chapter,
    linkedCharacters: resources.linkedCharacters,
    linkedLoreEntries: resources.linkedLoreEntries,
    referenceChapters: resources.referenceChapters,
    createdPits: resources.createdPits,
    resolvedPits: resources.resolvedPits
  });

  return {
    resources,
    payload: promptBuilder.build(context)
  };
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
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'summarizeChapterFromContent');
        if (!hasMeaningfulSummaryExtractionContext(resources)) {
          throw new AppError('VALIDATION_ERROR', '当前正文和 AI 参考内容都不足，暂时无法生成本章摘要。');
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
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterTitle');
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
        const { resources, payload } = await buildChapterPromptPayload(input.chapterId, 'generateChapterGoal');
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
    IPC_CHANNELS.CHAPTER_LIST_CREATED_PITS,
    async (_event, input: ChapterListCreatedPitsInput): Promise<IpcResult<StoryPitView[]>> =>
      withIpcResult(async () => {
        await appDatabase.init();
        return appDatabase.listChapterCreatedPits(input);
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
