import { useCallback, useEffect, useState } from 'react';
import type { AppApi } from '../../../shared/preload-api';
import type { AiChatMessage, AiPromptTemplates, AiProviderConfig, AiProviderConfigDeleteInput, AiProviderConfigState, AiProviderConfigUpdateInput, Chapter, ChapterPitReviewOutcome, ChapterRelationshipGraph, ChapterRefs, Character, CharacterRelationshipUpsertInput, CharacterRelationshipView, ChapterUpdatePatch, IpcResult, LoreEntry, NovelProject, PitUpdatePatch, ProjectUpdatePatch, StoryPitView, TimelineChapterSummaryView, TimelineCharacterStateView, TimelineEventDraft, TimelineEventView, TimelineForeshadowView, TimelineLayerData, TimelineLayerDraft, TimelineStoryTimeView } from '../../../shared/ipc';
import type { ChapterEditorState, StudioSidebarSection, StudioTab, WorkspaceView, WriterMode } from '../../types';
import type { CodexEditorState, CodexEntry } from './useCodexController';

type UseStudioControllerArgs = {
  activeProject: NovelProject | null;
  chapters: Chapter[];
  deletedChapters: Chapter[];
  characters: Character[];
  loreEntries: LoreEntry[];
  currentChapter: Chapter | null;
  currentChapterDisplayNumber: number | null;
  editor: ChapterEditorState;
  liveWordCount: number;
  saveStatusText: string;
  writerMode: WriterMode;
  setWorkspaceView: (view: WorkspaceView) => void;
  setSelectedChapterId: (id: string | null) => void;
  setEditor: React.Dispatch<React.SetStateAction<ChapterEditorState>>;
  saveChapterDraft: (reason: 'timer' | 'blur' | 'switch' | 'manual') => Promise<boolean>;
  updateCurrentChapterPatch: (patch: ChapterUpdatePatch) => Promise<Chapter | null>;
  resolveAppApi: () => AppApi | null;
  unwrapResult: <T>(result: IpcResult<T>, onError: (msg: string) => void, prefix: string) => Promise<T | null>;
  onFeedback: (msg: string) => void;
  customConfirm: (title: string, message: string, danger?: boolean) => Promise<boolean>;
  updateActiveProject: (patch: ProjectUpdatePatch) => Promise<NovelProject | null>;
  loadChapters: (projectId: string, preferredChapterId?: string | null) => Promise<Chapter[]>;
  loadDeletedChapters: (projectId: string) => Promise<Chapter[]>;
  createChapter: () => Promise<void>;
  openCodex: () => void;
  openNewCodexEntry: (type: 'character' | 'lore', loreType?: string) => void;
  openEditCodexEntry: (entry: CodexEntry) => void;
  updateCharacterDetails: (characterId: string, details: string) => Promise<Character | null>;
  deleteCodexEntry: (entry: CodexEntry) => Promise<void>;
  showCodexEditor: boolean;
  codexEditorState: CodexEditorState;
  closeCodexEditor: () => void;
  saveCodexEntry: () => Promise<void>;
  updateCodexEditorField: <K extends keyof CodexEditorState>(field: K, value: CodexEditorState[K]) => void;
  loadCodexAll: () => Promise<void>;
  formatTime: (value: string) => string;
};

export type WritingAiActionInput = {
  instruction: string;
};

export type WritingAiActionResult = {
  message: string;
  provider: string;
  model: string | null;
};

export function useStudioController({
  activeProject,
  chapters,
  deletedChapters,
  characters,
  loreEntries,
  currentChapter,
  currentChapterDisplayNumber,
  editor,
  liveWordCount,
  saveStatusText,
  writerMode,
  setWorkspaceView,
  setSelectedChapterId,
  setEditor,
  saveChapterDraft,
  updateCurrentChapterPatch,
  resolveAppApi,
  unwrapResult,
  onFeedback,
  customConfirm,
  updateActiveProject,
  loadChapters,
  loadDeletedChapters,
  createChapter,
  openCodex,
  openNewCodexEntry,
  openEditCodexEntry,
  updateCharacterDetails,
  deleteCodexEntry,
  showCodexEditor,
  codexEditorState,
  closeCodexEditor,
  saveCodexEntry,
  updateCodexEditorField,
  loadCodexAll,
  formatTime
}: UseStudioControllerArgs) {
  const [studioTab, setStudioTab] = useState<StudioTab>('plan');
  const [sidebarSection, setSidebarSection] = useState<StudioSidebarSection>('codex');
  const [writerModeLocal, setWriterModeLocal] = useState<WriterMode>(writerMode);
  const [chatThreadName, setChatThreadName] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [chatModel, setChatModel] = useState('gpt-5.4-mini');
  const [chatSending, setChatSending] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
  const [aiConnections, setAiConnections] = useState<AiProviderConfig[]>([]);
  const [activeAiConnectionId, setActiveAiConnectionId] = useState<string | null>(null);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [aiPromptTemplates, setAiPromptTemplates] = useState<AiPromptTemplates | null>(null);
  const [chapterRefs, setChapterRefs] = useState<ChapterRefs | null>(null);
  const [chapterRelationshipGraph, setChapterRelationshipGraph] = useState<ChapterRelationshipGraph | null>(null);
  const [characterRelationships, setCharacterRelationships] = useState<CharacterRelationshipView[]>([]);
  const [timelineStoryTimes, setTimelineStoryTimes] = useState<TimelineStoryTimeView[]>([]);
  const [timelineChapterSummaries, setTimelineChapterSummaries] = useState<TimelineChapterSummaryView[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventView[]>([]);
  const [timelineCharacterStates, setTimelineCharacterStates] = useState<TimelineCharacterStateView[]>([]);
  const [timelineForeshadows, setTimelineForeshadows] = useState<TimelineForeshadowView[]>([]);
  const [storyPits, setStoryPits] = useState<StoryPitView[]>([]);

  const applyAiConfigState = useCallback((state: AiProviderConfigState) => {
    const activeConfig = state.connections.find((connection) => connection.id === state.activeConnectionId) ?? state.connections[0] ?? null;
    setAiConnections(state.connections);
    setActiveAiConnectionId(activeConfig?.id ?? null);
    setAiSystemPrompt(state.systemPrompt);
    setAiPromptTemplates(state.promptTemplates);
    setAiConfig(activeConfig);
    if (activeConfig?.defaultModel) {
      setChatModel(activeConfig.defaultModel);
    }
    return activeConfig;
  }, []);

  const handleOpenStudio = useCallback(() => {
    if (!activeProject) {
      onFeedback('请先选择一个作品');
      return;
    }
    setWorkspaceView('studio');
    void Promise.all([loadChapters(activeProject.id), loadDeletedChapters(activeProject.id), loadCodexAll()]);
  }, [activeProject, loadChapters, loadDeletedChapters, loadCodexAll, onFeedback, setWorkspaceView]);

  const handleOpenCodex = useCallback(() => {
    setSidebarSection('codex');
    if (activeProject) {
      void loadCodexAll();
    }
    openCodex();
  }, [activeProject, loadCodexAll, openCodex]);

  const handleSelectChapter = useCallback(async (chapterId: string) => {
    await saveChapterDraft('switch');
    setSelectedChapterId(chapterId);
    setWriterModeLocal('edit');
  }, [saveChapterDraft, setSelectedChapterId]);

  const handleBackHome = useCallback(async () => {
    await saveChapterDraft('switch');
    setWorkspaceView('home');
  }, [saveChapterDraft, setWorkspaceView]);

  const handleTitleChange = useCallback((value: string) => {
    setEditor((prev) => ({ ...prev, title: value }));
  }, [setEditor]);

  const handleContentChange = useCallback((value: string) => {
    setEditor((prev) => ({ ...prev, content: value }));
  }, [setEditor]);

  const handleBlurSave = useCallback(() => {
    void saveChapterDraft('blur');
  }, [saveChapterDraft]);

  const handleToggleWriterMode = useCallback(() => {
    setWriterModeLocal((prev) => prev === 'edit' ? 'read' : 'edit');
  }, []);

  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setChatDraft('');
    setChatThreadName('');
  }, []);

  const loadAiConfig = useCallback(async () => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const state = await unwrapResult(await api.ai.getConfig(), onFeedback, '加载模型配置失败');
    return state ? applyAiConfigState(state) : null;
  }, [applyAiConfigState, onFeedback, resolveAppApi, unwrapResult]);

  const updateAiConfig = useCallback(async (input: AiProviderConfigUpdateInput) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const state = await unwrapResult(await api.ai.updateConfig(input), onFeedback, '保存模型配置失败');
    if (state) {
      const config = applyAiConfigState(state);
      onFeedback('模型配置已保存');
      return config;
    }
    return null;
  }, [applyAiConfigState, onFeedback, resolveAppApi, unwrapResult]);

  const deleteAiConfig = useCallback(async (input: AiProviderConfigDeleteInput) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const state = await unwrapResult(await api.ai.deleteConfig(input), onFeedback, '删除模型配置失败');
    if (state) {
      const config = applyAiConfigState(state);
      onFeedback('模型连接已删除');
      return config;
    }
    return null;
  }, [applyAiConfigState, onFeedback, resolveAppApi, unwrapResult]);

  const listAiModels = useCallback(async (input: { baseUrl: string; apiKey: string }) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }
    const result = await unwrapResult(await api.ai.listModels(input), onFeedback, '获取模型列表失败');
    return result?.models ?? [];
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const loadCurrentChapterRefs = useCallback(async (chapterId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return null;
    }
    const refs = await unwrapResult(await api.chapter.getRefs({ chapterId }), onFeedback, '加载章节引用失败');
    if (refs) {
      setChapterRefs(refs);
    }
    return refs;
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const updateCurrentChapterRefs = useCallback(async (input: { characterIds: string[]; loreEntryIds: string[] }) => {
    if (!currentChapter) {
      return null;
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const refs = await unwrapResult(
      await api.chapter.updateRefs({
        chapterId: currentChapter.id,
        characterIds: input.characterIds,
        loreEntryIds: input.loreEntryIds
      }),
      onFeedback,
      '保存章节引用失败'
    );
    if (refs) {
      setChapterRefs(refs);
    }
    return refs;
  }, [currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const loadCurrentChapterRelationshipGraph = useCallback(async (chapterId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return null;
    }
    const graph = await unwrapResult(
      await api.chapter.getRelationshipGraph({ chapterId }),
      onFeedback,
      '加载当前章节关系图失败'
    );
    if (graph) {
      setChapterRelationshipGraph(graph);
    }
    return graph;
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const updateCurrentChapterRelationshipGraph = useCallback(async (graph: ChapterRelationshipGraph) => {
    if (!currentChapter) {
      return null;
    }
    setChapterRelationshipGraph(graph);
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return graph;
    }
    const saved = await unwrapResult(
      await api.chapter.updateRelationshipGraph({ chapterId: currentChapter.id, graph }),
      onFeedback,
      '保存当前章节关系图失败'
    );
    if (saved) {
      setChapterRelationshipGraph(saved);
    }
    return saved ?? graph;
  }, [currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const loadCharacterRelationships = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return [];
    }
    const result = await unwrapResult(
      await api.character.listRelationships({ projectId }),
      onFeedback,
      '加载人物关系历史失败'
    );
    if (result) {
      setCharacterRelationships(result);
    }
    return result ?? [];
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const upsertCharacterRelationship = useCallback(async (input: CharacterRelationshipUpsertInput) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }
    const result = await unwrapResult(
      await api.character.upsertRelationship(input),
      onFeedback,
      '保存人物关系历史失败'
    );
    if (result) {
      setCharacterRelationships(result);
    }
    return result ?? [];
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const loadTimelineEvents = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return [];
    }
    const result = await unwrapResult(
      await api.timeline.listLayersByProject({ projectId }),
      onFeedback,
      '加载剧情事件失败'
    );
    if (result) {
      setTimelineStoryTimes(result.storyTimes);
      setTimelineChapterSummaries(result.chapterSummaries);
      setTimelineEvents(result.events);
      setTimelineCharacterStates(result.characterStates);
      setTimelineForeshadows(result.foreshadows);
    }
    return result?.events ?? [];
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const replaceCurrentChapterTimelineEvents = useCallback(async (events: TimelineEventDraft[]) => {
    if (!activeProject || !currentChapter) {
      onFeedback('请先选择章节');
      return [];
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }
    const result = await unwrapResult(
      await api.timeline.replaceChapterEvents({
        projectId: activeProject.id,
        chapterId: currentChapter.id,
        events
      }),
      onFeedback,
      '保存剧情事件失败'
    );
    if (result) {
      setTimelineEvents(result);
    }
    return result ?? [];
  }, [activeProject, currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const replaceCurrentChapterTimelineLayers = useCallback(async (data: TimelineLayerDraft): Promise<TimelineLayerData | null> => {
    if (!activeProject || !currentChapter) {
      onFeedback('请选择章节');
      return null;
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const result = await unwrapResult(
      await api.timeline.replaceChapterLayers({
        projectId: activeProject.id,
        chapterId: currentChapter.id,
        data
      }),
      onFeedback,
      '保存章节时间线失败'
    );
    if (result) {
      setTimelineStoryTimes(result.storyTimes);
      setTimelineChapterSummaries(result.chapterSummaries);
      setTimelineEvents(result.events);
      setTimelineCharacterStates(result.characterStates);
      setTimelineForeshadows(result.foreshadows);
    }
    return result ?? null;
  }, [activeProject, currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const loadStoryPits = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return [];
    }
    const result = await unwrapResult(
      await api.pit.listByProject({ projectId }),
      onFeedback,
      '加载伏笔库失败'
    );
    if (result) {
      setStoryPits(result);
    }
    return result ?? [];
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const createForeshadowPit = useCallback(async (input: { content: string; note?: string | null }) => {
    if (!activeProject) {
      onFeedback('请先选择作品');
      return null;
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const result = await unwrapResult(
      await api.pit.createManual({
        projectId: activeProject.id,
        content: input.content,
        note: input.note ?? null
      }),
      onFeedback,
      '新建伏笔失败'
    );
    if (result) {
      setStoryPits((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      onFeedback('已新建伏笔');
    }
    return result ?? null;
  }, [activeProject, onFeedback, resolveAppApi, unwrapResult]);

  const updateForeshadowPit = useCallback(async (pitId: string, patch: PitUpdatePatch) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const result = await unwrapResult(
      await api.pit.update({ pitId, patch }),
      onFeedback,
      '保存伏笔失败'
    );
    if (result) {
      setStoryPits((current) => current.map((item) => item.id === result.id ? result : item));
    }
    return result ?? null;
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const deleteForeshadowPit = useCallback(async (pitId: string) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return false;
    }
    const result = await unwrapResult(
      await api.pit.delete({ pitId }),
      onFeedback,
      '删除伏笔失败'
    );
    if (result?.deleted) {
      setStoryPits((current) => current.filter((item) => item.id !== pitId));
      onFeedback('已删除伏笔');
      return true;
    }
    return false;
  }, [onFeedback, resolveAppApi, unwrapResult]);

  const createChapterForeshadowPit = useCallback(async (input: { content: string; note?: string | null }) => {
    if (!currentChapter) {
      onFeedback('请先选择章节');
      return null;
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const result = await unwrapResult(
      await api.chapter.createPitFromSuggestion({
        chapterId: currentChapter.id,
        content: input.content,
        note: input.note ?? null
      }),
      onFeedback,
      '写入新伏笔失败'
    );
    if (result) {
      setStoryPits((current) => [result, ...current.filter((item) => item.id !== result.id)]);
    }
    return result ?? null;
  }, [currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const recordForeshadowResponse = useCallback(async (input: { pitId: string; outcome: ChapterPitReviewOutcome; note?: string | null }) => {
    if (!currentChapter) {
      onFeedback('请先选择章节');
      return null;
    }
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }
    const result = await unwrapResult(
      await api.chapter.reviewPitResponse({
        chapterId: currentChapter.id,
        pitId: input.pitId,
        outcome: input.outcome,
        note: input.note ?? null
      }),
      onFeedback,
      '写入伏笔响应失败'
    );
    if (result) {
      setStoryPits((current) => current.map((item) => item.id === result.pit.id ? result.pit : item));
    }
    return result ?? null;
  }, [currentChapter, onFeedback, resolveAppApi, unwrapResult]);

  const refreshAiModelsFromConfig = useCallback(async (config: AiProviderConfig) => {
    const baseUrl = config.baseUrl.trim();
    const apiKey = config.apiKey.trim();
    if (!baseUrl || !apiKey) {
      return config;
    }

    const models = await listAiModels({ baseUrl, apiKey });
    if (models.length === 0) {
      return config;
    }

    const nextConfig = {
      ...config,
      customModels: models.join('\n'),
      defaultModel: models.includes(config.defaultModel) ? config.defaultModel : models[0]
    };
    const saved = await updateAiConfig(nextConfig);
    return saved ?? nextConfig;
  }, [listAiModels, updateAiConfig]);

  const handleSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if (!text || !activeProject || chatSending) {
      return;
    }

    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    await saveChapterDraft('manual');
    const nextMessages: AiChatMessage[] = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(nextMessages);
    setChatDraft('');
    setChatSending(true);

    const result = await api.ai.chat({
      projectId: activeProject.id,
      chapterId: currentChapter?.id ?? null,
      model: chatModel,
      messages: nextMessages
    });

    setChatSending(false);
    if (!result.ok) {
      const errorText = `AI 对话失败：${result.error.message}`;
      onFeedback(errorText);
      setChatMessages((current) => [...current, { role: 'assistant', content: errorText, model: chatModel }]);
      return;
    }

    setChatMessages((current) => [...current, {
      role: 'assistant',
      content: result.data.message,
      provider: result.data.provider,
      model: result.data.model
    }]);
    if (!chatThreadName.trim()) {
      setChatThreadName(text.slice(0, 24));
    }
  }, [activeProject, chatDraft, chatMessages, chatModel, chatSending, chatThreadName, currentChapter?.id, onFeedback, resolveAppApi, saveChapterDraft]);

  const handleRunWritingAi = useCallback(async (input: WritingAiActionInput): Promise<WritingAiActionResult | null> => {
    if (!activeProject || !currentChapter) {
      onFeedback('请先选择一个章节');
      return null;
    }

    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }

    await saveChapterDraft('manual');
    const result = await api.ai.chat({
      projectId: activeProject.id,
      chapterId: currentChapter.id,
      model: chatModel,
      messages: [{ role: 'user', content: input.instruction }]
    });

    if (!result.ok) {
      onFeedback(`AI 写作失败：${result.error.message}`);
      return null;
    }

    return {
      message: result.data.message,
      provider: result.data.provider,
      model: result.data.model
    };
  }, [activeProject, chatModel, currentChapter, onFeedback, resolveAppApi, saveChapterDraft]);

  const handleDeleteChapter = useCallback(async (chapterId: string, title: string) => {
    if (!await customConfirm('删除章节', `确认删除章节《${title}》？`)) return;
    const api = resolveAppApi();
    if (!api || !activeProject) return;

    const result = await unwrapResult(await api.chapter.delete({ chapterId }), onFeedback, '删除章节失败');
    if (result?.deleted) {
      await loadChapters(activeProject.id);
      await loadDeletedChapters(activeProject.id);
      if (currentChapter?.id === chapterId) setSelectedChapterId(null);
      onFeedback(`已删除：${title}`);
    }
  }, [activeProject, currentChapter, loadChapters, loadDeletedChapters, onFeedback, resolveAppApi, setSelectedChapterId, unwrapResult]);

  const handleRestoreChapter = useCallback(async (chapterId: string, title: string) => {
    const api = resolveAppApi();
    if (!api || !activeProject) return;

    const result = await unwrapResult(await api.chapter.restore({ chapterId }), onFeedback, '恢复章节失败');
    if (result) {
      await loadChapters(activeProject.id, chapterId);
      await loadDeletedChapters(activeProject.id);
      onFeedback(`已恢复：${title}`);
    }
  }, [activeProject, loadChapters, loadDeletedChapters, onFeedback, resolveAppApi, unwrapResult]);

  const handleDeleteChapterPermanent = useCallback(async (chapterId: string, title: string) => {
    if (!await customConfirm('永久删除', `永久删除《${title}》？不可恢复。`, true)) return;
    const api = resolveAppApi();
    if (!api || !activeProject) return;

    const result = await unwrapResult(await api.chapter.deletePermanent({ chapterId }), onFeedback, '永久删除失败');
    if (result?.deleted) {
      await loadDeletedChapters(activeProject.id);
      onFeedback(`已永久删除：${title}`);
    }
  }, [activeProject, loadDeletedChapters, onFeedback, resolveAppApi, unwrapResult]);

  useEffect(() => {
    if ((studioTab !== 'chat' && studioTab !== 'write') || aiConfig) {
      return;
    }
    void loadAiConfig().then((config) => {
      if (config) {
        void refreshAiModelsFromConfig(config);
      }
    });
  }, [aiConfig, loadAiConfig, refreshAiModelsFromConfig, studioTab]);

  useEffect(() => {
    if (!currentChapter) {
      setChapterRefs(null);
      setChapterRelationshipGraph(null);
      return;
    }
    void loadCurrentChapterRefs(currentChapter.id);
    void loadCurrentChapterRelationshipGraph(currentChapter.id);
  }, [currentChapter?.id, loadCurrentChapterRefs, loadCurrentChapterRelationshipGraph]);

  useEffect(() => {
    if (!activeProject) {
      setCharacterRelationships([]);
      setTimelineStoryTimes([]);
      setTimelineChapterSummaries([]);
      setTimelineEvents([]);
      setTimelineCharacterStates([]);
      setTimelineForeshadows([]);
      setStoryPits([]);
      return;
    }
    void Promise.all([loadCharacterRelationships(activeProject.id), loadTimelineEvents(activeProject.id), loadStoryPits(activeProject.id)]);
  }, [activeProject?.id, loadCharacterRelationships, loadStoryPits, loadTimelineEvents]);

  return {
    studioTab,
    sidebarSection,
    writerModeLocal,
    handleOpenStudio,
    handleSelectChapter,
    handleBackHome,
    handleTitleChange,
    handleContentChange,
    handleBlurSave,
    handleToggleWriterMode,
    handleDeleteChapter,
    handleRestoreChapter,
    handleDeleteChapterPermanent,
    setStudioTab,
    setSidebarSection,

    studioPageProps: activeProject ? {
      activeProject,
      chapters,
      deletedChapters,
      characters,
      characterRelationships,
      timelineStoryTimes,
      timelineChapterSummaries,
      timelineEvents,
      timelineCharacterStates,
      timelineForeshadows,
      storyPits,
      loreEntries,
      currentChapter,
      chapterRefs,
      chapterRelationshipGraph,
      currentChapterDisplayNumber,
      editor,
      liveWordCount,
      chatThreadName,
      chatDraft,
      chatMessages,
      chatModel,
      aiConfig,
      aiConnections,
      activeAiConnectionId,
      aiSystemPrompt,
      aiPromptTemplates,
      chatSending,
      writerMode: writerModeLocal,
      saveStatusText,
      studioTab,
      sidebarSection,
      formatTime,
      onBackHome: handleBackHome,
      onUpdateProject: updateActiveProject,
      onSelectChapter: handleSelectChapter,
      onCreateChapter: createChapter,
      onDeleteChapter: handleDeleteChapter,
      onRestoreChapter: handleRestoreChapter,
      onDeleteChapterPermanent: handleDeleteChapterPermanent,
      onTitleChange: handleTitleChange,
      onContentChange: handleContentChange,
      onBlurSave: handleBlurSave,
      onChatThreadNameChange: setChatThreadName,
      onChatDraftChange: setChatDraft,
      onChatModelChange: setChatModel,
      onLoadAiConfig: loadAiConfig,
      onUpdateAiConfig: updateAiConfig,
      onDeleteAiConfig: deleteAiConfig,
      onListAiModels: listAiModels,
      onUpdateChapterRefs: updateCurrentChapterRefs,
      onUpdateChapterRelationshipGraph: updateCurrentChapterRelationshipGraph,
      onUpsertCharacterRelationship: upsertCharacterRelationship,
      onReplaceChapterTimelineEvents: replaceCurrentChapterTimelineEvents,
      onReplaceChapterTimelineLayers: replaceCurrentChapterTimelineLayers,
      onCreateForeshadowPit: createForeshadowPit,
      onUpdateForeshadowPit: updateForeshadowPit,
      onDeleteForeshadowPit: deleteForeshadowPit,
      onCreateChapterForeshadowPit: createChapterForeshadowPit,
      onRecordForeshadowResponse: recordForeshadowResponse,
      onUpdateCurrentChapterPatch: updateCurrentChapterPatch,
      onRunWritingAi: handleRunWritingAi,
      onSendChat: handleSendChat,
      onNewChat: handleNewChat,
      onSetStudioTab: setStudioTab,
      onSetSidebarSection: setSidebarSection,
      showCodexEditor,
      codexEditorState,
      onCloseCodexEditor: closeCodexEditor,
      onSaveCodexEntry: saveCodexEntry,
      onUpdateCodexEditorField: updateCodexEditorField,
      onOpenCodex: handleOpenCodex,
      onOpenNewCodexEntry: openNewCodexEntry,
      onOpenEditCodexEntry: openEditCodexEntry,
      onUpdateCharacterDetails: updateCharacterDetails,
      onDeleteCodexEntry: deleteCodexEntry,
      onToggleWriterMode: handleToggleWriterMode
    } : null
  };
}
