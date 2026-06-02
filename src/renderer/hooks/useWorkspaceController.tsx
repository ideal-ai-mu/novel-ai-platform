import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppApi } from '../../shared/preload-api';
import type { AppInitData, AutosaveIntervalSeconds, Chapter, ChapterUpdatePatch, IpcResult, NovelProject, ProjectUpdatePatch } from '../../shared/ipc';
import type { ChapterEditorState, SaveReason, WorkspaceView } from '../types';
import { useConfirmDialog } from '../components/modals/ConfirmDialog';
import { useCodexController } from './workspace/useCodexController';
import { useHomeController } from './workspace/useHomeController';
import { useStudioController } from './workspace/useStudioController';
import { useWorkspaceMenus } from './workspace/useWorkspaceMenus';
import { useWriterController } from './workspace/useWriterController';
import { buildChapterDisplayNumbers, getChapterDisplayNumber } from '../utils/chapterDisplay';
import { formatManuscriptParagraphs } from '../utils/manuscriptFormat';

type InitState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: AppInitData }
  | { phase: 'error'; message: string };

const DEFAULT_HOME_PROJECT_TITLE = '我的新书';
const DEFAULT_HOME_CHAPTER_TITLE = '第一章';
const DEFAULT_INSPIRATION_PROMPT = '围绕一个有持续张力的人物困局，生成一段可继续扩写的长篇小说开端灵感。';
const AUTOSAVE_LABELS: Record<AutosaveIntervalSeconds, string> = {
  0: '关闭',
  5: '5 秒',
  10: '10 秒',
  30: '30 秒',
  60: '60 秒'
};
const INSPIRATION_TAG_OPTIONS = [
  '女频悬疑',
  '西方奇幻',
  '东方仙侠',
  '古风世情',
  '科幻末世',
  '男频衍生',
  '都市脑洞',
  '青春甜宠',
  '双男主',
  '双女主',
  '历史古代',
  '悬疑灵异'
];

function resolveAppApi(): AppApi | null {
  if (typeof window === 'undefined' || !window.appApi?.app?.init) {
    return null;
  }
  return window.appApi;
}

function statusText(state: InitState): string {
  if (state.phase === 'loading') {
    return 'app.init: 初始化中';
  }
  if (state.phase === 'error') {
    return `app.init: 错误（${state.message}）`;
  }
  return `app.init: 就绪（${state.data.topology}）`;
}

function defaultEditorState(): ChapterEditorState {
  return {
    title: '',
    content: ''
  };
}

function buildEditorState(chapter: Chapter): ChapterEditorState {
  return {
    title: chapter.title,
    content: formatManuscriptParagraphs(chapter.content)
  };
}

function countWords(content: string): number {
  return content.replace(/\s+/g, '').length;
}

function formatTime(value: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatClock(value: string): string {
  if (!value) {
    return '--:--:--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function getProjectCoverText(project: NovelProject | null): string {
  const text = project?.title.trim() ?? '';
  if (!text) {
    return '书';
  }
  return text.slice(0, 2);
}

async function unwrapResult<T>(result: IpcResult<T>, onError: (message: string) => void, prefix: string): Promise<T | null> {
  if (!result.ok) {
    onError(`${prefix}：${result.error.message}`);
    return null;
  }
  return result.data;
}

export function useWorkspaceController() {
  const { confirm: customConfirm, confirmState, handleConfirm, handleCancel } = useConfirmDialog();
  const [initState, setInitState] = useState<InitState>({ phase: 'loading' });
  const [feedback, setFeedback] = useState('');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('home');
  const [autosaveIntervalSeconds, setAutosaveIntervalSeconds] = useState<AutosaveIntervalSeconds>(10);

  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [deletedProjects, setDeletedProjects] = useState<NovelProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDeletedProjectId, setSelectedDeletedProjectId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [deletedChapters, setDeletedChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [editor, setEditor] = useState<ChapterEditorState>(defaultEditorState());

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [lastSaveWasTimer, setLastSaveWasTimer] = useState(false);

  const currentChapterRef = useRef<Chapter | null>(null);
  const editorRef = useRef<ChapterEditorState>(defaultEditorState());
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  const {
    homeMenu,
    setHomeMenu,
    projectActionsOpen,
    setProjectActionsOpen,
    chaptersMenu,
    setChaptersMenu,
    projectActionsRef,
    cancelHomeMenuClose,
    scheduleHomeMenuClose,
    openHomeMenu,
    scheduleProjectActionsClose,
    openProjectActions,
    toggleProjectActions,
    scheduleChaptersMenuClose,
    openChaptersMenu
  } = useWorkspaceMenus();

  const closeProjectActions = useCallback(() => {
    setProjectActionsOpen(false);
  }, [setProjectActionsOpen]);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const activeProject = useMemo(() => projects.find((item) => item.id === selectedProjectId) ?? null, [projects, selectedProjectId]);
  const activeDeletedProject = useMemo(
    () => deletedProjects.find((item) => item.id === selectedDeletedProjectId) ?? null,
    [deletedProjects, selectedDeletedProjectId]
  );
  const chapterDisplayNumbers = useMemo(() => buildChapterDisplayNumbers(chapters), [chapters]);
  const currentChapterDisplayNumber = useMemo(() => {
    if (!currentChapter) {
      return null;
    }
    return getChapterDisplayNumber(currentChapter, chapterDisplayNumbers);
  }, [chapterDisplayNumbers, currentChapter]);
  const chapterDirty = useMemo(() => {
    if (!currentChapter) {
      return false;
    }
    return currentChapter.title !== editor.title || formatManuscriptParagraphs(currentChapter.content) !== formatManuscriptParagraphs(editor.content);
  }, [currentChapter, editor.content, editor.title]);
  const totalWordCount = useMemo(() => chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0), [chapters]);
  const activeProjectStatus = useMemo(() => (chapters.length > 0 ? '创作中' : '待开写'), [chapters.length]);
  const activeProjectUpdateText = useMemo(() => {
    if (!activeProject) {
      return '-';
    }
    return chapters.length > 0 ? formatTime(activeProject.updated_at) : '暂未发布章节';
  }, [activeProject, chapters.length]);
  const liveWordCount = useMemo(() => countWords(editor.content), [editor.content]);
  const saveStatusText = useMemo(() => {
    if (!currentChapter) {
      return '未选择章节';
    }
    if (isSaving || chapterDirty) {
      return '未保存';
    }
    if (lastSavedAt && lastSaveWasTimer) {
      return `自动保存于 ${formatClock(lastSavedAt)}`;
    }
    return '已保存';
  }, [chapterDirty, currentChapter, isSaving, lastSavedAt, lastSaveWasTimer]);

  const loadProjects = useCallback(async (): Promise<NovelProject[]> => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }

    const data = await unwrapResult(await api.project.list(), setFeedback, '加载作品失败');
    if (!data) {
      return [];
    }

    setProjects(data);
    setSelectedProjectId((prev) => {
      if (prev && data.some((item) => item.id === prev)) {
        return prev;
      }
      return null;
    });
    return data;
  }, []);

  const loadDeletedProjects = useCallback(async (): Promise<NovelProject[]> => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }

    const data = await unwrapResult(await api.project.listDeleted(), setFeedback, '加载回收站失败');
    if (!data) {
      return [];
    }

    setDeletedProjects(data);
    setSelectedDeletedProjectId((prev) => {
      if (prev && data.some((item) => item.id === prev)) {
        return prev;
      }
      return data[0]?.id ?? null;
    });
    return data;
  }, []);

  const refreshProjectCollections = useCallback(async () => {
    await Promise.all([loadProjects(), loadDeletedProjects()]);
  }, [loadDeletedProjects, loadProjects]);

  const updateActiveProject = useCallback(
    async (patch: ProjectUpdatePatch): Promise<NovelProject | null> => {
      const api = resolveAppApi();
      if (!api || !activeProject) {
        setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return null;
      }

      const updated = await unwrapResult(
        await api.project.update({ projectId: activeProject.id, patch }),
        setFeedback,
        '更新作品信息失败'
      );
      if (!updated) {
        return null;
      }

      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback('作品信息已更新');
      return updated;
    },
    [activeProject]
  );

  const loadChapters = useCallback(async (projectId: string, preferredChapterId?: string | null): Promise<Chapter[]> => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }

    const data = await unwrapResult(await api.chapter.list(projectId), setFeedback, '加载章节失败');
    if (!data) {
      return [];
    }

    setChapters(data);
    setSelectedChapterId((prev) => {
      if (preferredChapterId && data.some((item) => item.id === preferredChapterId)) {
        return preferredChapterId;
      }
      if (prev && data.some((item) => item.id === prev)) {
        return prev;
      }
      return data[0]?.id ?? null;
    });
    return data;
  }, []);

  const loadDeletedChapters = useCallback(async (projectId: string): Promise<Chapter[]> => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return [];
    }

    const data = await unwrapResult(await api.chapter.listDeleted({ projectId }), setFeedback, '加载章节回收站失败');
    if (!data) {
      return [];
    }

    setDeletedChapters(data);
    return data;
  }, []);

  const loadChapter = useCallback(async (chapterId: string): Promise<Chapter | null> => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return null;
    }

    const data = await unwrapResult(await api.chapter.get(chapterId), setFeedback, '加载章节详情失败');
    if (!data) {
      return null;
    }

    setCurrentChapter(data);
    setEditor(buildEditorState(data));
    return data;
  }, []);

  const syncChapterList = useCallback((updated: Chapter) => {
    setChapters((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const saveChapterDraft = useCallback(
    async (reason: SaveReason): Promise<boolean> => {
      const api = resolveAppApi();
      const chapter = currentChapterRef.current;
      const snapshot = editorRef.current;

      if (!api || !chapter) {
        return true;
      }
      const formattedContent = formatManuscriptParagraphs(snapshot.content);
      const normalizedSnapshot = {
        ...snapshot,
        content: formattedContent
      };
      if (snapshot.content !== formattedContent) {
        editorRef.current = normalizedSnapshot;
        setEditor(normalizedSnapshot);
      }

      if (chapter.title === normalizedSnapshot.title && chapter.content === normalizedSnapshot.content) {
        return true;
      }
      if (savePromiseRef.current) {
        return savePromiseRef.current;
      }

      const task = (async () => {
        setIsSaving(true);
        const result = await api.chapter.update({
          chapterId: chapter.id,
          patch: {
            title: snapshot.title,
            content: normalizedSnapshot.content
          }
        });
        if (!result.ok) {
          setFeedback(`保存章节失败：${result.error.message}`);
          setIsSaving(false);
          return false;
        }

        const updated = result.data;
        setCurrentChapter(updated);
        setEditor(buildEditorState(updated));
        syncChapterList(updated);
        setLastSavedAt(updated.updated_at);
        setLastSaveWasTimer(reason === 'timer');
        setIsSaving(false);
        return true;
      })();

      savePromiseRef.current = task;
      const outcome = await task;
      savePromiseRef.current = null;
      return outcome;
    },
    [syncChapterList]
  );

  const updateCurrentChapterPatch = useCallback(async (patch: ChapterUpdatePatch): Promise<Chapter | null> => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return null;
    }

    await saveChapterDraft('manual');
    const latestChapter = currentChapterRef.current ?? chapter;
    const result = await api.chapter.update({
      chapterId: latestChapter.id,
      patch
    });
    if (!result.ok) {
      setFeedback(`保存章节信息失败：${result.error.message}`);
      return null;
    }

    const updated = result.data;
    setCurrentChapter(updated);
    syncChapterList(updated);
    setLastSavedAt(updated.updated_at);
    setLastSaveWasTimer(false);
    return updated;
  }, [resolveAppApi, saveChapterDraft, syncChapterList]);

  const resetActiveChapter = useCallback(() => {
    setSelectedChapterId(null);
    setCurrentChapter(null);
    setEditor(defaultEditorState());
  }, []);

  const handleOpenChapterManagement = useCallback(async () => {
    if (!activeProject) {
      return;
    }
    await saveChapterDraft('switch');
    await loadChapters(activeProject.id);
    await loadDeletedChapters(activeProject.id);
    setWorkspaceView('studio');
  }, [activeProject, loadChapters, loadDeletedChapters, saveChapterDraft]);

  const handleDeleteChapter = useCallback(
    async (chapterId: string, title: string) => {
      if (!await customConfirm('删除章节', `确认删除章节《${title}》？删除后会进入章节回收站。`)) {
        return;
      }

      const api = resolveAppApi();
      if (!api || !activeProject) {
        setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return;
      }

      const result = await api.chapter.delete({ chapterId });
      if (!result.ok) {
        setFeedback(`删除章节失败：${result.error.message}`);
        return;
      }

      await loadChapters(activeProject.id);
      await loadDeletedChapters(activeProject.id);
      if (selectedChapterId === chapterId) {
        resetActiveChapter();
      }
      setFeedback(`已移入章节回收站：${title}`);
    },
    [activeProject, loadChapters, loadDeletedChapters, resetActiveChapter, selectedChapterId]
  );

  const handleRestoreChapter = useCallback(
    async (chapterId: string, title: string) => {
      const api = resolveAppApi();
      if (!api || !activeProject) {
        setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return;
      }

      const result = await api.chapter.restore({ chapterId });
      if (!result.ok) {
        setFeedback(`恢复章节失败：${result.error.message}`);
        return;
      }

      await loadChapters(activeProject.id, chapterId);
      await loadDeletedChapters(activeProject.id);
      setSelectedChapterId(chapterId);
      setFeedback(`已恢复章节：${title}`);
    },
    [activeProject, loadChapters, loadDeletedChapters]
  );

  const handleDeleteChapterPermanent = useCallback(
    async (chapterId: string, title: string) => {
      if (!await customConfirm('永久删除', `确认永久删除章节《${title}》？该操作不可恢复。`, true)) {
        return;
      }

      const api = resolveAppApi();
      if (!api || !activeProject) {
        setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return;
      }

      const result = await api.chapter.deletePermanent({ chapterId });
      if (!result.ok) {
        setFeedback(`永久删除章节失败：${result.error.message}`);
        return;
      }

      await loadDeletedChapters(activeProject.id);
      setFeedback(`已永久删除章节：${title}`);
    },
    [activeProject, loadDeletedChapters]
  );

  const writer = useWriterController({
    activeProject,
    currentChapter,
    currentChapterDisplayNumber,
    editor,
    liveWordCount,
    autosaveIntervalSeconds,
    autosaveLabel: AUTOSAVE_LABELS[autosaveIntervalSeconds],
    saveStatusText,
    setWorkspaceView,
    setSelectedChapterId,
    setEditor,
    saveChapterDraft
  });

  const codex = useCodexController({
    activeProject,
    setWorkspaceView,
    resolveAppApi,
    unwrapResult,
    onFeedback: setFeedback,
    customConfirm
  });

  const openNewCodexEntryFromStudio = useCallback(
    (type: 'character' | 'lore', loreType?: string) => {
      if (!activeProject) {
        setFeedback('请先选择一个作品');
        return;
      }
      setWorkspaceView('studio');
      void codex.loadAll();
      void codex.openOrCreateEntryEditor(type, loreType);
    },
    [activeProject, codex.loadAll, codex.openOrCreateEntryEditor]
  );

  const home = useHomeController({
    workspaceView,
    projects,
    deletedProjects,
    activeProject,
    selectedProjectId,
    chapters,
    totalWordCount,
    homeMenu,
    projectActionsOpen,
    openHomeMenu,
    scheduleHomeMenuClose,
    cancelHomeMenuClose,
    setHomeMenu,
    setSelectedProjectId,
    setSelectedDeletedProjectId,
    setWorkspaceView,
    resolveAppApi,
    unwrapResult,
    onFeedback: setFeedback,
    customConfirm,
    refreshProjectCollections,
    loadChapters,
    createProjectTitle: DEFAULT_HOME_PROJECT_TITLE,
    createChapterTitle: DEFAULT_HOME_CHAPTER_TITLE,
    defaultInspirationPrompt: DEFAULT_INSPIRATION_PROMPT,
    inspirationTagOptions: INSPIRATION_TAG_OPTIONS,
    getProjectCoverText,
    formatTime,
    openWriter: writer.openWriter,
    openChapterManagement: handleOpenChapterManagement,
    openCodex: codex.handleOpenCodex,
    resetActiveChapter
  });

  const studio = useStudioController({
    activeProject,
    chapters,
    deletedChapters,
    characters: codex.characters,
    loreEntries: codex.loreEntries,
    currentChapter,
    currentChapterDisplayNumber,
    editor,
    liveWordCount,
    saveStatusText,
    writerMode: 'edit',
    setWorkspaceView,
    setSelectedChapterId,
    setEditor,
    saveChapterDraft,
    updateCurrentChapterPatch,
    resolveAppApi,
    unwrapResult,
    onFeedback: setFeedback,
    customConfirm,
    updateActiveProject,
    loadChapters,
    loadDeletedChapters,
    createChapter: async () => {
      if (!activeProject) return;
      const next = chapters.length + 1;
      const api = resolveAppApi();
      if (!api) return;
      const ch = await unwrapResult(await api.chapter.create({ projectId: activeProject.id, title: `第${next}章` }), setFeedback, '创建章节失败');
      if (ch) {
        await loadChapters(activeProject.id, ch.id);
        setFeedback(`已创建章节：${ch.title}`);
      }
    },
    openCodex: codex.handleOpenCodex,
    openNewCodexEntry: openNewCodexEntryFromStudio,
    openEditCodexEntry: codex.openEditEntryEditor,
    updateCharacterDetails: codex.updateCharacterDetails,
    deleteCodexEntry: codex.handleDeleteEntry,
    showCodexEditor: codex.showEditor,
    codexEditorState: codex.editorState,
    closeCodexEditor: codex.closeEditor,
    saveCodexEntry: codex.saveEntry,
    updateCodexEditorField: codex.updateEditorField,
    loadCodexAll: codex.loadAll,
    formatTime
  });

  useEffect(() => {
    const api = resolveAppApi();
    if (!api) {
      setInitState({ phase: 'error', message: 'window.appApi.app.init 缺失，请通过 Electron 启动应用。' });
      return;
    }

    let cancelled = false;
    const dispose = api.app.onAutosaveIntervalChanged((seconds) => {
      setAutosaveIntervalSeconds(seconds);
    });

    (async () => {
      const result = await api.app.init();
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setInitState({ phase: 'error', message: result.error.message });
        return;
      }
      setInitState({ phase: 'ready', data: result.data });
      setAutosaveIntervalSeconds(result.data.autosaveIntervalSeconds);
      await refreshProjectCollections();
    })().catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setInitState({ phase: 'error', message });
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, [refreshProjectCollections]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChapters([]);
      setDeletedChapters([]);
      resetActiveChapter();
      return;
    }
    void loadChapters(selectedProjectId);
    void loadDeletedChapters(selectedProjectId);
    void codex.loadAll();
  }, [codex.loadAll, loadChapters, loadDeletedChapters, resetActiveChapter, selectedProjectId]);

  useEffect(() => {
    if (workspaceView !== 'studio' || !activeProject) {
      return;
    }

    void Promise.all([
      loadChapters(activeProject.id),
      loadDeletedChapters(activeProject.id),
      codex.loadAll()
    ]);
  }, [activeProject?.id, codex.loadAll, loadChapters, loadDeletedChapters, workspaceView]);

  useEffect(() => {
    if (!selectedChapterId) {
      setCurrentChapter(null);
      setEditor(defaultEditorState());
      return;
    }
    void loadChapter(selectedChapterId);
  }, [loadChapter, selectedChapterId]);

  useEffect(() => {
    if (workspaceView === 'studio' && !activeProject) {
      setWorkspaceView('home');
    }
  }, [activeProject, workspaceView]);

  useEffect(() => {
    closeProjectActions();
  }, [activeProject?.id, closeProjectActions, home.homeSection, workspaceView]);

  useEffect(() => {
    if (autosaveIntervalSeconds === 0 || !currentChapter || !chapterDirty) {
      return;
    }
    if (workspaceView !== 'studio') return;
    const timer = window.setInterval(() => {
      void saveChapterDraft('timer');
    }, autosaveIntervalSeconds * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [autosaveIntervalSeconds, chapterDirty, currentChapter, saveChapterDraft, workspaceView]);

  return {
    initState,
    initStatusText: statusText(initState),
    feedback,
    workspaceView,
    autosaveIntervalSeconds,
    autosaveLabel: AUTOSAVE_LABELS[autosaveIntervalSeconds],
    homePageProps: home.homePageProps,
    studioPageProps: studio.studioPageProps
      ? {
          ...studio.studioPageProps,
          onFeedback: setFeedback
        }
      : null,
    showCreateBookModal: home.showCreateBookModal,
    createBookModalProps: home.createBookModalProps,
    showInspirationModal: home.showInspirationModal,
    inspirationModalProps: home.inspirationModalProps,
    codexPageProps: codex,
    confirmState,
    onConfirmOk: handleConfirm,
    onConfirmCancel: handleCancel
  };
}
