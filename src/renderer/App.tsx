import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiSuggestion,
  AiSuggestionStatus,
  AppInitData,
  AutosaveIntervalSeconds,
  Chapter,
  ChapterRefs,
  Character,
  IpcResult,
  LoreEntry,
  NovelProject
} from '../shared/ipc';

type InitState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: AppInitData }
  | { phase: 'error'; message: string };

type WorkspaceView = 'chapter' | 'library';
type LibraryFocus = 'character' | 'lore';
type SuggestionFilter = 'all' | AiSuggestionStatus;
type SuggestionImpact = 'planning' | 'content';
type SuggestionImpactFilter = 'all' | SuggestionImpact;
type DraggingDivider = 'left' | 'right' | null;
type SaveReason = 'timer' | 'blur' | 'switch' | 'relation' | 'adopt_ai';

type ChapterEditorState = {
  title: string;
  goal: string;
  outlineUser: string;
  nextHook: string;
  content: string;
  characterIds: string[];
  loreEntryIds: string[];
};

type CharacterFormState = {
  name: string;
  roleType: string;
  summary: string;
  details: string;
};

type LoreFormState = {
  type: string;
  title: string;
  summary: string;
  content: string;
  tagsInput: string;
};

const PLANNING_FIELDS = new Set(['goal', 'outline_user', 'next_hook']);
const CONTENT_FIELDS = new Set(['content']);
const DIVIDER_WIDTH = 10;
const LEFT_PANEL_MIN_WIDTH = 260;
const RIGHT_PANEL_MIN_WIDTH = 320;
const CENTER_PANEL_MIN_WIDTH = 520;

const SUGGESTION_STATUS_LABELS: Record<AiSuggestionStatus, string> = {
  pending: '待处理',
  applied: '已应用',
  rejected: '已拒绝',
  partially_applied: '部分应用'
};

const SUGGESTION_FILTER_OPTIONS: Array<{ value: SuggestionFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'applied', label: '已应用' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'partially_applied', label: '部分应用' }
];

const SUGGESTION_IMPACT_OPTIONS: Array<{ value: SuggestionImpactFilter; label: string }> = [
  { value: 'all', label: '全部层级' },
  { value: 'planning', label: '章节规划层' },
  { value: 'content', label: '正文层' }
];

const AUTOSAVE_LABELS: Record<AutosaveIntervalSeconds, string> = {
  0: '关闭',
  5: '5 秒',
  10: '10 秒',
  30: '30 秒',
  60: '60 秒'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countWords(content: string): number {
  const chunks = content.trim().match(/\S+/gu);
  return chunks ? chunks.length : 0;
}

function formatTopology(topology: AppInitData['topology']): string {
  if (topology === 'single-db-multi-project') {
    return '单应用单库 / 多项目';
  }
  return topology;
}

function resolveAppApi() {
  const api = window.appApi;
  if (!api || !api.app || typeof api.app.init !== 'function') {
    return null;
  }
  return api;
}

function statusText(state: InitState): string {
  if (state.phase === 'loading') {
    return 'app.init：初始化中';
  }
  if (state.phase === 'error') {
    return `app.init：错误（${state.message}）`;
  }
  return `app.init：就绪（${formatTopology(state.data.topology)}）`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseSuggestionPatchChanges(patch: Record<string, unknown>): Array<{ field: string; value: unknown }> {
  const raw = patch.changes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      field: typeof item.field === 'string' ? item.field : '',
      value: item.value
    }))
    .filter((item) => item.field.length > 0);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function equalsAsSet(left: string[], right: string[]): boolean {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function parseTagsInput(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function defaultEditorState(): ChapterEditorState {
  return {
    title: '',
    goal: '',
    outlineUser: '',
    nextHook: '',
    content: '',
    characterIds: [],
    loreEntryIds: []
  };
}

function defaultCharacterForm(): CharacterFormState {
  return {
    name: '',
    roleType: '',
    summary: '',
    details: ''
  };
}

function defaultLoreForm(): LoreFormState {
  return {
    type: '',
    title: '',
    summary: '',
    content: '',
    tagsInput: ''
  };
}

function buildAiReferenceContext(
  editor: ChapterEditorState,
  linkedCharacters: Character[],
  linkedLoreEntries: LoreEntry[]
): string {
  const characterLines =
    linkedCharacters.length > 0
      ? linkedCharacters.map((character) => {
          const parts = [character.name.trim(), character.role_type.trim(), character.summary.trim()].filter((part) => part.length > 0);
          return `- ${parts.join(' / ')}`;
        })
      : ['- 暂无已关联角色'];

  const loreLines =
    linkedLoreEntries.length > 0
      ? linkedLoreEntries.map((entry) => {
          const parts = [entry.title.trim(), entry.type.trim(), entry.summary.trim()].filter((part) => part.length > 0);
          return `- ${parts.join(' / ')}`;
        })
      : ['- 暂无已关联设定'];

  return [
    '【本章目标】',
    editor.goal.trim() || '未填写本章目标',
    '',
    '【本章梗概】',
    editor.outlineUser.trim() || '未填写本章梗概',
    '',
    '【章末钩子 / 下一章引子】',
    editor.nextHook.trim() || '未填写章末钩子 / 下一章引子',
    '',
    '【已关联角色】',
    ...characterLines,
    '',
    '【已关联设定】',
    ...loreLines
  ].join('\n');
}

function buildEditorState(chapter: Chapter, refs: ChapterRefs | null): ChapterEditorState {
  return {
    title: chapter.title,
    goal: chapter.goal,
    outlineUser: chapter.outline_user,
    nextHook: chapter.next_hook,
    content: chapter.content,
    characterIds: refs?.characterIds ?? [],
    loreEntryIds: refs?.loreEntryIds ?? []
  };
}

function isEditorDirty(editor: ChapterEditorState, chapter: Chapter | null, refs: ChapterRefs | null): boolean {
  if (!chapter) {
    return false;
  }

  if (editor.title !== chapter.title) return true;
  if (editor.goal !== chapter.goal) return true;
  if (editor.outlineUser !== chapter.outline_user) return true;
  if (editor.nextHook !== chapter.next_hook) return true;
  if (editor.content !== chapter.content) return true;
  if (!equalsAsSet(editor.characterIds, refs?.characterIds ?? [])) return true;
  if (!equalsAsSet(editor.loreEntryIds, refs?.loreEntryIds ?? [])) return true;
  return false;
}

function getFieldImpact(field: string): SuggestionImpact | null {
  if (PLANNING_FIELDS.has(field)) {
    return 'planning';
  }
  if (CONTENT_FIELDS.has(field)) {
    return 'content';
  }
  return null;
}

function getSuggestionImpacts(suggestion: AiSuggestion): SuggestionImpact[] {
  const impacts = new Set<SuggestionImpact>();
  for (const change of parseSuggestionPatchChanges(suggestion.patch_json)) {
    const impact = getFieldImpact(change.field);
    if (impact) {
      impacts.add(impact);
    }
  }
  return Array.from(impacts);
}

function getSuggestionLayerLabel(suggestion: AiSuggestion): string {
  const impacts = getSuggestionImpacts(suggestion);
  if (impacts.length === 0) {
    return '未分类修改';
  }
  if (impacts.length === 2) {
    return '章节规划层修改 / 正文层修改';
  }
  return impacts[0] === 'planning' ? '章节规划层修改' : '正文层修改';
}

export function App(): JSX.Element {
  const [initState, setInitState] = useState<InitState>({ phase: 'loading' });
  const [feedback, setFeedback] = useState('');
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('chapter');
  const [libraryFocus, setLibraryFocus] = useState<LibraryFocus>('character');
  const [autosaveIntervalSeconds, setAutosaveIntervalSeconds] = useState<AutosaveIntervalSeconds>(10);

  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentRefs, setCurrentRefs] = useState<ChapterRefs | null>(null);
  const [editor, setEditor] = useState<ChapterEditorState>(defaultEditorState());
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [lastSaveWasTimer, setLastSaveWasTimer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingOutlineAi, setGeneratingOutlineAi] = useState(false);
  const [processingSuggestionId, setProcessingSuggestionId] = useState<string | null>(null);
  const [pendingCharacterId, setPendingCharacterId] = useState('');
  const [pendingLoreEntryId, setPendingLoreEntryId] = useState('');

  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [characterForm, setCharacterForm] = useState<CharacterFormState>(defaultCharacterForm());

  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState<string | null>(null);
  const [loreForm, setLoreForm] = useState<LoreFormState>(defaultLoreForm());

  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>('pending');
  const [suggestionImpactFilter, setSuggestionImpactFilter] = useState<SuggestionImpactFilter>('all');

  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [draggingDivider, setDraggingDivider] = useState<DraggingDivider>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  const currentChapterRef = useRef<Chapter | null>(null);
  const currentRefsRef = useRef<ChapterRefs | null>(null);
  const editorRef = useRef<ChapterEditorState>(defaultEditorState());
  const selectedProjectIdRef = useRef<string | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    currentRefsRef.current = currentRefs;
  }, [currentRefs]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const chapterDirty = useMemo(() => isEditorDirty(editor, currentChapter, currentRefs), [editor, currentChapter, currentRefs]);
  const liveWordCount = useMemo(() => countWords(editor.content), [editor.content]);

  const saveStatusText = useMemo(() => {
    if (!currentChapter) {
      return '未选择章节';
    }
    if (chapterDirty || isSaving) {
      return '未保存';
    }
    if (lastSavedAt && lastSaveWasTimer) {
      return `自动保存于 ${formatClock(lastSavedAt)}`;
    }
    return '已保存';
  }, [chapterDirty, currentChapter, isSaving, lastSavedAt, lastSaveWasTimer]);

  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((suggestion) => {
      if (suggestionFilter !== 'all' && suggestion.status !== suggestionFilter) {
        return false;
      }
      if (suggestionImpactFilter === 'all') {
        return true;
      }
      return getSuggestionImpacts(suggestion).includes(suggestionImpactFilter);
    });
  }, [suggestionFilter, suggestionImpactFilter, suggestions]);

  const linkedCharacters = useMemo(
    () => characters.filter((character) => editor.characterIds.includes(character.id)),
    [characters, editor.characterIds]
  );
  const linkedLoreEntries = useMemo(
    () => loreEntries.filter((entry) => editor.loreEntryIds.includes(entry.id)),
    [editor.loreEntryIds, loreEntries]
  );
  const availableCharacters = useMemo(
    () => characters.filter((character) => !editor.characterIds.includes(character.id)),
    [characters, editor.characterIds]
  );
  const availableLoreEntries = useMemo(
    () => loreEntries.filter((entry) => !editor.loreEntryIds.includes(entry.id)),
    [editor.loreEntryIds, loreEntries]
  );
  const aiReferenceText = useMemo(
    () => buildAiReferenceContext(editor, linkedCharacters, linkedLoreEntries),
    [editor, linkedCharacters, linkedLoreEntries]
  );

  const syncChapterList = useCallback((updatedChapter: Chapter) => {
    setChapters((prev) => prev.map((chapter) => (chapter.id === updatedChapter.id ? updatedChapter : chapter)));
  }, []);

  const loadProjects = useCallback(async () => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.project.list();
    if (!result.ok) {
      setFeedback(`加载项目失败：${result.error.message}`);
      return;
    }

    setProjects(result.data);
    setSelectedProjectId((prev) => {
      if (prev && result.data.some((project) => project.id === prev)) {
        return prev;
      }
      return result.data[0]?.id ?? null;
    });
  }, []);

  const loadChapters = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.chapter.list(projectId);
    if (!result.ok) {
      setFeedback(`加载章节失败：${result.error.message}`);
      return;
    }

    setChapters(result.data);
    setSelectedChapterId((prev) => {
      if (prev && result.data.some((chapter) => chapter.id === prev)) {
        return prev;
      }
      return result.data[0]?.id ?? null;
    });
  }, []);

  const loadCharacters = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.character.list(projectId);
    if (!result.ok) {
      setFeedback(`加载角色失败：${result.error.message}`);
      return;
    }

    setCharacters(result.data);
  }, []);

  const loadLoreEntries = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.lore.list(projectId);
    if (!result.ok) {
      setFeedback(`加载设定条目失败：${result.error.message}`);
      return;
    }

    setLoreEntries(result.data);
  }, []);

  const loadChapterWorkspace = useCallback(async (chapterId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const [chapterResult, refsResult, suggestionsResult] = await Promise.all([
      api.chapter.get(chapterId),
      api.chapter.getRefs({ chapterId }),
      api.suggestion.listByEntity({ entityType: 'Chapter', entityId: chapterId })
    ]);

    if (!chapterResult.ok) {
      setFeedback(`加载章节详情失败：${chapterResult.error.message}`);
      return;
    }
    if (!refsResult.ok) {
      setFeedback(`加载章节关联失败：${refsResult.error.message}`);
      return;
    }
    if (!suggestionsResult.ok) {
      setFeedback(`加载建议失败：${suggestionsResult.error.message}`);
      return;
    }

    setCurrentChapter(chapterResult.data);
    setCurrentRefs(refsResult.data);
    setEditor(buildEditorState(chapterResult.data, refsResult.data));
    setSuggestions(suggestionsResult.data);
    setPendingCharacterId('');
    setPendingLoreEntryId('');
  }, []);

  const saveChapterDraft = useCallback(
    async (reason: SaveReason, overrideEditor?: ChapterEditorState): Promise<boolean> => {
      const api = resolveAppApi();
      const chapter = currentChapterRef.current;
      const refs = currentRefsRef.current;
      const snapshot = overrideEditor ?? editorRef.current;

      if (!api || !chapter) {
        return true;
      }
      if (!isEditorDirty(snapshot, chapter, refs)) {
        return true;
      }
      if (!snapshot.title.trim()) {
        setFeedback('章节标题不能为空。');
        return false;
      }
      if (savePromiseRef.current) {
        return savePromiseRef.current;
      }

      const saveTask = (async () => {
        setIsSaving(true);

        const chapterResult = await api.chapter.update({
          chapterId: chapter.id,
          patch: {
            title: snapshot.title,
            goal: snapshot.goal,
            outline_user: snapshot.outlineUser,
            next_hook: snapshot.nextHook,
            content: snapshot.content
          }
        });

        if (!chapterResult.ok) {
          setIsSaving(false);
          setFeedback(`保存章节失败：${chapterResult.error.message}`);
          return false;
        }

        let nextRefs = refs;
        if (
          !equalsAsSet(snapshot.characterIds, refs?.characterIds ?? []) ||
          !equalsAsSet(snapshot.loreEntryIds, refs?.loreEntryIds ?? [])
        ) {
          const refsResult = await api.chapter.updateRefs({
            chapterId: chapter.id,
            characterIds: uniqueSorted(snapshot.characterIds),
            loreEntryIds: uniqueSorted(snapshot.loreEntryIds)
          });
          if (!refsResult.ok) {
            setIsSaving(false);
            setFeedback(`保存章节关联失败：${refsResult.error.message}`);
            return false;
          }
          nextRefs = refsResult.data;
          setCurrentRefs(refsResult.data);
        }

        setCurrentChapter(chapterResult.data);
        syncChapterList(chapterResult.data);
        setLastSavedAt(new Date().toISOString());
        setLastSaveWasTimer(reason === 'timer');
        setIsSaving(false);
        currentChapterRef.current = chapterResult.data;
        currentRefsRef.current = nextRefs;
        return true;
      })();

      savePromiseRef.current = saveTask.finally(() => {
        savePromiseRef.current = null;
      });
      return savePromiseRef.current;
    },
    [syncChapterList]
  );

  const onFieldBlur = useCallback(() => {
    void saveChapterDraft('blur');
  }, [saveChapterDraft]);

  const selectProject = useCallback(
    async (projectId: string) => {
      if (projectId === selectedProjectIdRef.current) {
        return;
      }
      const saved = await saveChapterDraft('switch');
      if (!saved) {
        return;
      }
      setSelectedProjectId(projectId);
    },
    [saveChapterDraft]
  );

  const selectChapter = useCallback(
    async (chapterId: string) => {
      if (chapterId === selectedChapterId) {
        return;
      }
      const saved = await saveChapterDraft('switch');
      if (!saved) {
        return;
      }
      setSelectedChapterId(chapterId);
    },
    [saveChapterDraft, selectedChapterId]
  );

  useEffect(() => {
    if (!draggingDivider) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const container = columnsRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      const totalDividerWidth = DIVIDER_WIDTH * 2;

      if (draggingDivider === 'left') {
        const maxLeftWidth = Math.max(
          LEFT_PANEL_MIN_WIDTH,
          bounds.width - rightPanelWidth - CENTER_PANEL_MIN_WIDTH - totalDividerWidth
        );
        setLeftPanelWidth(clamp(event.clientX - bounds.left, LEFT_PANEL_MIN_WIDTH, maxLeftWidth));
        return;
      }

      const maxRightWidth = Math.max(
        RIGHT_PANEL_MIN_WIDTH,
        bounds.width - leftPanelWidth - CENTER_PANEL_MIN_WIDTH - totalDividerWidth
      );
      setRightPanelWidth(clamp(bounds.right - event.clientX, RIGHT_PANEL_MIN_WIDTH, maxRightWidth));
    };

    const handleMouseUp = () => setDraggingDivider(null);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingDivider, leftPanelWidth, rightPanelWidth]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const api = resolveAppApi();
      if (!api) {
        setInitState({ phase: 'error', message: 'window.appApi.app.init 缺失，请通过 Electron 启动应用。' });
        return;
      }

      const unsubscribe = api.app.onAutosaveIntervalChanged((seconds) => {
        setAutosaveIntervalSeconds(seconds);
        setFeedback(`自动保存已切换为：${AUTOSAVE_LABELS[seconds]}`);
      });

      try {
        const result: IpcResult<AppInitData> = await api.app.init();
        if (cancelled) {
          unsubscribe();
          return;
        }

        if (!result.ok) {
          setInitState({ phase: 'error', message: result.error.message });
          unsubscribe();
          return;
        }

        setInitState({ phase: 'ready', data: result.data });
        setAutosaveIntervalSeconds(result.data.autosaveIntervalSeconds);
        await loadProjects();
      } catch (error) {
        if (!cancelled) {
          setInitState({ phase: 'error', message: error instanceof Error ? error.message : '未知错误' });
        }
      }

      return unsubscribe;
    };

    let dispose: (() => void) | undefined;
    void init().then((cleanup) => {
      dispose = cleanup;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChapters([]);
      setSelectedChapterId(null);
      setCurrentChapter(null);
      setCurrentRefs(null);
      setEditor(defaultEditorState());
      setCharacters([]);
      setLoreEntries([]);
      setSuggestions([]);
      setSelectedCharacterId(null);
      setSelectedLoreEntryId(null);
      setCharacterForm(defaultCharacterForm());
      setLoreForm(defaultLoreForm());
      return;
    }

    void Promise.all([loadChapters(selectedProjectId), loadCharacters(selectedProjectId), loadLoreEntries(selectedProjectId)]);
  }, [selectedProjectId, loadChapters, loadCharacters, loadLoreEntries]);

  useEffect(() => {
    if (!selectedChapterId) {
      setCurrentChapter(null);
      setCurrentRefs(null);
      setEditor(defaultEditorState());
      setSuggestions([]);
      return;
    }

    void loadChapterWorkspace(selectedChapterId);
  }, [selectedChapterId, loadChapterWorkspace]);

  useEffect(() => {
    if (!selectedCharacterId) {
      setCharacterForm(defaultCharacterForm());
      return;
    }
    const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
    if (!selectedCharacter) {
      setSelectedCharacterId(null);
      setCharacterForm(defaultCharacterForm());
      return;
    }
    setCharacterForm({
      name: selectedCharacter.name,
      roleType: selectedCharacter.role_type,
      summary: selectedCharacter.summary,
      details: selectedCharacter.details
    });
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedLoreEntryId) {
      setLoreForm(defaultLoreForm());
      return;
    }
    const selectedLore = loreEntries.find((entry) => entry.id === selectedLoreEntryId);
    if (!selectedLore) {
      setSelectedLoreEntryId(null);
      setLoreForm(defaultLoreForm());
      return;
    }
    setLoreForm({
      type: selectedLore.type,
      title: selectedLore.title,
      summary: selectedLore.summary,
      content: selectedLore.content,
      tagsInput: selectedLore.tags_json.join(', ')
    });
  }, [loreEntries, selectedLoreEntryId]);

  useEffect(() => {
    if (autosaveIntervalSeconds === 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      void saveChapterDraft('timer');
    }, autosaveIntervalSeconds * 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [autosaveIntervalSeconds, saveChapterDraft]);

  const onCreateProject = useCallback(async () => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }
    const title = newProjectTitle.trim();
    if (!title) {
      setFeedback('请先填写项目标题。');
      return;
    }
    const result = await api.project.create({ title, description: newProjectDesc.trim() });
    if (!result.ok) {
      setFeedback(`创建项目失败：${result.error.message}`);
      return;
    }
    setNewProjectTitle('');
    setNewProjectDesc('');
    await loadProjects();
    setSelectedProjectId(result.data.id);
    setWorkspaceView('chapter');
    setFeedback(`已创建项目：${result.data.title}`);
  }, [loadProjects, newProjectDesc, newProjectTitle]);

  const onDeleteProject = useCallback(async () => {
    const api = resolveAppApi();
    if (!api || !selectedProjectId || !selectedProject) {
      return;
    }
    if (!window.confirm(`确认删除项目“${selectedProject.title}”？相关章节、建议和设定会一起删除。`)) {
      return;
    }
    const result = await api.project.delete({ projectId: selectedProjectId });
    if (!result.ok) {
      setFeedback(`删除项目失败：${result.error.message}`);
      return;
    }
    await loadProjects();
    setFeedback(`已删除项目：${selectedProject.title}`);
  }, [loadProjects, selectedProject, selectedProjectId]);

  const onCreateChapter = useCallback(async () => {
    const api = resolveAppApi();
    if (!api || !selectedProjectId) {
      setFeedback('请先选择项目。');
      return;
    }
    const title = newChapterTitle.trim();
    if (!title) {
      setFeedback('请先填写章节标题。');
      return;
    }
    const result = await api.chapter.create({ projectId: selectedProjectId, title });
    if (!result.ok) {
      setFeedback(`创建章节失败：${result.error.message}`);
      return;
    }
    setNewChapterTitle('');
    await loadChapters(selectedProjectId);
    setSelectedChapterId(result.data.id);
    setWorkspaceView('chapter');
    setFeedback(`已创建章节：${result.data.title}`);
  }, [loadChapters, newChapterTitle, selectedProjectId]);

  const onDeleteChapter = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapter;
    if (!api || !selectedProjectId || !chapter) {
      return;
    }
    if (!window.confirm(`确认删除章节“${chapter.title}”？相关建议也会一起删除。`)) {
      return;
    }
    const result = await api.chapter.delete({ chapterId: chapter.id });
    if (!result.ok) {
      setFeedback(`删除章节失败：${result.error.message}`);
      return;
    }
    await loadChapters(selectedProjectId);
    setFeedback(`已删除章节：${chapter.title}`);
  }, [currentChapter, loadChapters, selectedProjectId]);

  const onGenerateOutlineAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    const saved = await saveChapterDraft('blur');
    if (!saved) {
      return;
    }
    setGeneratingOutlineAi(true);
    const result = await api.chapter.generateOutlineAi({ chapterId: chapter.id });
    setGeneratingOutlineAi(false);
    if (!result.ok) {
      setFeedback(`更新 AI 梗概失败：${result.error.message}`);
      return;
    }
    setCurrentChapter(result.data.chapter);
    syncChapterList(result.data.chapter);
    setFeedback('AI 提炼梗概已更新。');
  }, [saveChapterDraft, syncChapterList]);

  const onCreateMockSuggestion = useCallback(async () => {
    const api = resolveAppApi();
    if (!api || !selectedChapterId) {
      setFeedback('请先选择章节。');
      return;
    }
    const result = await api.suggestion.createMock({ entityType: 'Chapter', entityId: selectedChapterId });
    if (!result.ok) {
      setFeedback(`创建 Mock 建议失败：${result.error.message}`);
      return;
    }
    const suggestionsResult = await api.suggestion.listByEntity({ entityType: 'Chapter', entityId: selectedChapterId });
    if (suggestionsResult.ok) {
      setSuggestions(suggestionsResult.data);
    }
    setFeedback(`已创建建议：${result.data.summary}`);
  }, [selectedChapterId]);

  const onApplySuggestion = useCallback(async (suggestionId: string) => {
    const api = resolveAppApi();
    const chapterId = selectedChapterId;
    if (!api || !chapterId) {
      return;
    }
    setProcessingSuggestionId(suggestionId);
    const result = await api.suggestion.apply({ suggestionId });
    setProcessingSuggestionId(null);
    if (!result.ok) {
      setFeedback(`应用建议失败：${result.error.message}`);
      return;
    }
    await loadChapterWorkspace(chapterId);
    if (selectedProjectIdRef.current) {
      await loadChapters(selectedProjectIdRef.current);
    }
    setFeedback(
      `建议处理完成：${SUGGESTION_STATUS_LABELS[result.data.status]}，应用 ${result.data.appliedChanges.length} 项，阻止 ${result.data.blockedFields.length} 项。`
    );
  }, [loadChapterWorkspace, loadChapters, selectedChapterId]);

  const onRejectSuggestion = useCallback(async (suggestionId: string) => {
    const api = resolveAppApi();
    const chapterId = selectedChapterId;
    if (!api || !chapterId) {
      return;
    }
    setProcessingSuggestionId(suggestionId);
    const result = await api.suggestion.reject({ suggestionId });
    setProcessingSuggestionId(null);
    if (!result.ok) {
      setFeedback(`拒绝建议失败：${result.error.message}`);
      return;
    }
    const suggestionsResult = await api.suggestion.listByEntity({ entityType: 'Chapter', entityId: chapterId });
    if (suggestionsResult.ok) {
      setSuggestions(suggestionsResult.data);
    }
    setFeedback(`建议状态已更新：${SUGGESTION_STATUS_LABELS[result.data.status]}`);
  }, [selectedChapterId]);

  const onAddCharacterLink = useCallback(async () => {
    if (!pendingCharacterId) {
      return;
    }
    const nextEditor: ChapterEditorState = {
      ...editor,
      characterIds: uniqueSorted([...editor.characterIds, pendingCharacterId])
    };
    setEditor(nextEditor);
    setPendingCharacterId('');
    await saveChapterDraft('relation', nextEditor);
  }, [editor, pendingCharacterId, saveChapterDraft]);

  const onRemoveCharacterLink = useCallback(async (characterId: string) => {
    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      characterIds: editorRef.current.characterIds.filter((id) => id !== characterId)
    };
    setEditor(nextEditor);
    await saveChapterDraft('relation', nextEditor);
  }, [saveChapterDraft]);

  const onAddLoreLink = useCallback(async () => {
    if (!pendingLoreEntryId) {
      return;
    }
    const nextEditor: ChapterEditorState = {
      ...editor,
      loreEntryIds: uniqueSorted([...editor.loreEntryIds, pendingLoreEntryId])
    };
    setEditor(nextEditor);
    setPendingLoreEntryId('');
    await saveChapterDraft('relation', nextEditor);
  }, [editor, pendingLoreEntryId, saveChapterDraft]);

  const onRemoveLoreLink = useCallback(async (loreEntryId: string) => {
    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      loreEntryIds: editorRef.current.loreEntryIds.filter((id) => id !== loreEntryId)
    };
    setEditor(nextEditor);
    await saveChapterDraft('relation', nextEditor);
  }, [saveChapterDraft]);

  const onSaveCharacter = useCallback(async () => {
    const api = resolveAppApi();
    if (!api || !selectedProjectId) {
      setFeedback('请先选择项目。');
      return;
    }
    const name = characterForm.name.trim();
    if (!name) {
      setFeedback('角色名称不能为空。');
      return;
    }
    if (selectedCharacterId) {
      const result = await api.character.update({
        characterId: selectedCharacterId,
        patch: {
          name,
          role_type: characterForm.roleType,
          summary: characterForm.summary,
          details: characterForm.details
        }
      });
      if (!result.ok) {
        setFeedback(`保存角色失败：${result.error.message}`);
        return;
      }
      await loadCharacters(selectedProjectId);
      setFeedback(`已保存角色：${result.data.name}`);
      return;
    }
    const result = await api.character.create({
      projectId: selectedProjectId,
      name,
      roleType: characterForm.roleType,
      summary: characterForm.summary,
      details: characterForm.details
    });
    if (!result.ok) {
      setFeedback(`创建角色失败：${result.error.message}`);
      return;
    }
    await loadCharacters(selectedProjectId);
    setSelectedCharacterId(result.data.id);
    setFeedback(`已创建角色：${result.data.name}`);
  }, [characterForm, loadCharacters, selectedCharacterId, selectedProjectId]);

  const onDeleteCharacter = useCallback(async () => {
    const api = resolveAppApi();
    const currentCharacter = characters.find((character) => character.id === selectedCharacterId);
    if (!api || !selectedProjectId || !selectedCharacterId || !currentCharacter) {
      return;
    }
    if (!window.confirm(`确认删除角色“${currentCharacter.name}”？`)) {
      return;
    }
    const result = await api.character.delete({ characterId: selectedCharacterId });
    if (!result.ok) {
      setFeedback(`删除角色失败：${result.error.message}`);
      return;
    }
    setSelectedCharacterId(null);
    setCharacterForm(defaultCharacterForm());
    await loadCharacters(selectedProjectId);
    setFeedback(`已删除角色：${currentCharacter.name}`);
  }, [characters, loadCharacters, selectedCharacterId, selectedProjectId]);

  const onSaveLoreEntry = useCallback(async () => {
    const api = resolveAppApi();
    if (!api || !selectedProjectId) {
      setFeedback('请先选择项目。');
      return;
    }
    const type = loreForm.type.trim();
    const title = loreForm.title.trim();
    if (!type || !title) {
      setFeedback('设定类型和标题不能为空。');
      return;
    }
    if (selectedLoreEntryId) {
      const result = await api.lore.update({
        loreEntryId: selectedLoreEntryId,
        patch: {
          type,
          title,
          summary: loreForm.summary,
          content: loreForm.content,
          tags_json: parseTagsInput(loreForm.tagsInput)
        }
      });
      if (!result.ok) {
        setFeedback(`保存设定失败：${result.error.message}`);
        return;
      }
      await loadLoreEntries(selectedProjectId);
      setFeedback(`已保存设定：${result.data.title}`);
      return;
    }
    const result = await api.lore.create({
      projectId: selectedProjectId,
      type,
      title,
      summary: loreForm.summary,
      content: loreForm.content,
      tagsJson: parseTagsInput(loreForm.tagsInput)
    });
    if (!result.ok) {
      setFeedback(`创建设定失败：${result.error.message}`);
      return;
    }
    await loadLoreEntries(selectedProjectId);
    setSelectedLoreEntryId(result.data.id);
    setFeedback(`已创建设定：${result.data.title}`);
  }, [loadLoreEntries, loreForm, selectedLoreEntryId, selectedProjectId]);

  const onDeleteLoreEntry = useCallback(async () => {
    const api = resolveAppApi();
    const currentLore = loreEntries.find((entry) => entry.id === selectedLoreEntryId);
    if (!api || !selectedProjectId || !selectedLoreEntryId || !currentLore) {
      return;
    }
    if (!window.confirm(`确认删除设定“${currentLore.title}”？`)) {
      return;
    }
    const result = await api.lore.delete({ loreEntryId: selectedLoreEntryId });
    if (!result.ok) {
      setFeedback(`删除设定失败：${result.error.message}`);
      return;
    }
    setSelectedLoreEntryId(null);
    setLoreForm(defaultLoreForm());
    await loadLoreEntries(selectedProjectId);
    setFeedback(`已删除设定：${currentLore.title}`);
  }, [loadLoreEntries, loreEntries, selectedLoreEntryId, selectedProjectId]);

  const renderImpactBadge = (field: string, key: string) => {
    const impact = getFieldImpact(field);
    if (!impact) {
      return null;
    }
    return (
      <span key={key} className={`impact-badge ${impact}`}>
        {impact === 'planning' ? '章节规划层' : '正文层'}
      </span>
    );
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>小说 AI 工作台</h1>
        <div className={`status-pill status-${initState.phase}`}>{statusText(initState)}</div>
      </header>

      <div
        className={`columns${draggingDivider ? ' is-resizing' : ''}`}
        ref={columnsRef}
        style={{
          gridTemplateColumns: `${leftPanelWidth}px ${DIVIDER_WIDTH}px minmax(${CENTER_PANEL_MIN_WIDTH}px, 1fr) ${DIVIDER_WIDTH}px ${rightPanelWidth}px`
        }}
      >
        <aside className="panel panel-left">
          <h2>项目 / 章节导航</h2>

          <div className="section-card compact-card">
            <div className="section-heading">项目</div>
            <div className="form-row">
              <input value={newProjectTitle} onChange={(event) => setNewProjectTitle(event.target.value)} placeholder="新项目标题" />
              <button type="button" onClick={() => void onCreateProject()}>
                新建项目
              </button>
            </div>
            <label>
              项目简介（可选）
              <textarea
                className="small-textarea"
                value={newProjectDesc}
                onChange={(event) => setNewProjectDesc(event.target.value)}
                placeholder="项目简介"
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => void onDeleteProject()} disabled={!selectedProjectId}>
                删除项目
              </button>
            </div>
            <div className="list-section">
              <strong>项目列表</strong>
              <div className="list-box">
                {projects.length === 0 && <div className="muted">暂无项目</div>}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`list-item ${selectedProjectId === project.id ? 'active' : ''}`}
                    onClick={() => void selectProject(project.id)}
                  >
                    <div>{project.title}</div>
                    <div className="muted">{formatTime(project.updated_at)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="section-card compact-card">
            <div className="section-heading">章节</div>
            <div className="form-row">
              <input
                value={newChapterTitle}
                onChange={(event) => setNewChapterTitle(event.target.value)}
                placeholder="新章节标题"
                disabled={!selectedProjectId}
              />
              <button type="button" onClick={() => void onCreateChapter()} disabled={!selectedProjectId}>
                新建章节
              </button>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void onDeleteChapter()} disabled={!selectedChapterId}>
                删除章节
              </button>
            </div>
            <div className="list-section">
              <strong>章节列表</strong>
              <div className="list-box chapter-list-box">
                {!selectedProjectId && <div className="muted">请先选择项目</div>}
                {selectedProjectId && chapters.length === 0 && <div className="muted">暂无章节</div>}
                {chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    className={`list-item ${selectedChapterId === chapter.id ? 'active' : ''}`}
                    onClick={() => void selectChapter(chapter.id)}
                  >
                    <div>
                      {chapter.index_no}. {chapter.title}
                    </div>
                    <div className="muted">{formatTime(chapter.updated_at)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div
          className={`panel-divider${draggingDivider === 'left' ? ' active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            setDraggingDivider('left');
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左侧导航宽度"
        />

        <section className="panel panel-center">
          <div className="workspace-switch">
            <button
              type="button"
              className={`switch-btn ${workspaceView === 'chapter' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('chapter')}
            >
              章节工作台
            </button>
            <button
              type="button"
              className={`switch-btn ${workspaceView === 'library' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('library')}
            >
              设定库
            </button>
          </div>

          {workspaceView === 'chapter' && (
            <div className="workspace-stack">
              <div className="workspace-header">
                <div>
                  <h2>章节工作台</h2>
                  <div className="muted">界面只保留创作相关的五块：基本信息、章节规划、关联设定、AI参考、原始写作正文。</div>
                </div>
              </div>

              {!currentChapter && <div className="empty-state">请选择一个章节，或先在左侧创建章节。</div>}

              {currentChapter && (
                <>
                  <section className="section-card basic-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">章节基本信息</div>
                        <h3>章节标题与保存状态</h3>
                      </div>
                      <div className="save-chip-row">
                        <span className={`save-chip ${chapterDirty || isSaving ? 'dirty' : 'saved'}`}>{saveStatusText}</span>
                        <span className="muted">自动保存：{AUTOSAVE_LABELS[autosaveIntervalSeconds]}</span>
                      </div>
                    </div>
                    <label>
                      章节标题
                      <input
                        value={editor.title}
                        onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))}
                        onBlur={onFieldBlur}
                      />
                    </label>
                    <div className="meta-row">
                      <span>当前项目：{selectedProject?.title ?? '未选择项目'}</span>
                      <span>章节序号：{currentChapter.index_no}</span>
                      <span>字数：{liveWordCount}</span>
                    </div>
                  </section>

                  <section className="section-card planning-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">章节规划层</div>
                        <h3>章节梗概 / 章节规划</h3>
                        <div className="muted">先把这一章要做什么说清楚，再决定正文如何展开。</div>
                      </div>
                    </div>

                    <label>
                      本章目标
                      <input
                        value={editor.goal}
                        onChange={(event) => setEditor((prev) => ({ ...prev, goal: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="这一章要推进的核心目标是什么？"
                      />
                    </label>

                    <div className="field-block">
                      <div className="inline-field-header">
                        <span>本章梗概</span>
                        <button type="button" onClick={() => void onGenerateOutlineAi()} disabled={generatingOutlineAi}>
                          {generatingOutlineAi ? '更新中...' : 'AI 提炼梗概'}
                        </button>
                      </div>
                      <textarea
                        className="planning-textarea"
                        value={editor.outlineUser}
                        onChange={(event) => setEditor((prev) => ({ ...prev, outlineUser: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="用你确认过的方式概括这一章。"
                      />
                    </div>

                    <label>
                      章末钩子 / 下一章引子
                      <input
                        value={editor.nextHook}
                        onChange={(event) => setEditor((prev) => ({ ...prev, nextHook: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="这一章结束时，要把读者带向哪里？"
                      />
                    </label>
                  </section>

                  <section className="section-card relation-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">本章关联设定</div>
                        <h3>已关联角色 / 已关联设定</h3>
                      </div>
                    </div>

                    <div className="relation-grid">
                      <section className="relation-column">
                        <div className="relation-title">已关联角色</div>
                        <div className="token-list">
                          {linkedCharacters.length === 0 && <div className="muted">当前未关联角色</div>}
                          {linkedCharacters.map((character) => (
                            <div key={character.id} className="token-item linked">
                              <div>
                                <strong>{character.name}</strong>
                                <div className="muted">{character.role_type || '未填写角色类型'}</div>
                              </div>
                              <button type="button" className="token-action" onClick={() => void onRemoveCharacterLink(character.id)}>
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="picker-row">
                          <select value={pendingCharacterId} onChange={(event) => setPendingCharacterId(event.target.value)}>
                            <option value="">选择角色</option>
                            {availableCharacters.map((character) => (
                              <option key={character.id} value={character.id}>
                                {character.name}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={() => void onAddCharacterLink()} disabled={!pendingCharacterId}>
                            添加角色
                          </button>
                        </div>
                      </section>

                      <section className="relation-column">
                        <div className="relation-title">已关联设定</div>
                        <div className="token-list">
                          {linkedLoreEntries.length === 0 && <div className="muted">当前未关联设定</div>}
                          {linkedLoreEntries.map((entry) => (
                            <div key={entry.id} className="token-item linked">
                              <div>
                                <strong>{entry.title}</strong>
                                <div className="muted">{entry.type}</div>
                              </div>
                              <button type="button" className="token-action" onClick={() => void onRemoveLoreLink(entry.id)}>
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="picker-row">
                          <select value={pendingLoreEntryId} onChange={(event) => setPendingLoreEntryId(event.target.value)}>
                            <option value="">选择设定</option>
                            {availableLoreEntries.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.title}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={() => void onAddLoreLink()} disabled={!pendingLoreEntryId}>
                            添加设定
                          </button>
                        </div>
                      </section>
                    </div>
                  </section>

                  <section className="section-card ai-reference-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">AI参考层</div>
                        <h3>提示词上下文</h3>
                        <div className="muted">这一层只读，自动汇总章节规划与已关联设定，作为 AI 在进入正文前的参考上下文。</div>
                      </div>
                    </div>

                    <div className="reference-stack">
                      <div className="reference-block">
                        <div className="reference-title">当前参考上下文</div>
                        <div className="read-only-content">{aiReferenceText}</div>
                      </div>
                    </div>
                  </section>

                  <section className="section-card content-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">原始写作正文</div>
                        <h3>正文层</h3>
                      </div>
                    </div>
                    <label>
                      当前正文
                      <textarea
                        className="editor-textarea"
                        value={editor.content}
                        onChange={(event) => setEditor((prev) => ({ ...prev, content: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="这里是你实际写作的正文。"
                      />
                    </label>
                  </section>
                </>
              )}
            </div>
          )}

          {workspaceView === 'library' && (
            <div className="workspace-stack">
              <div className="workspace-header">
                <div>
                  <h2>设定库</h2>
                  <div className="muted">保持单类聚焦编辑，避免角色与设定并排干扰。</div>
                </div>
              </div>

              <div className="workspace-switch">
                <button
                  type="button"
                  className={`switch-btn ${libraryFocus === 'character' ? 'active' : ''}`}
                  onClick={() => setLibraryFocus('character')}
                >
                  角色库
                </button>
                <button
                  type="button"
                  className={`switch-btn ${libraryFocus === 'lore' ? 'active' : ''}`}
                  onClick={() => setLibraryFocus('lore')}
                >
                  设定库条目
                </button>
              </div>

              <div className="library-layout">
                <section className="section-card library-sidebar">
                  <div className="section-heading">{libraryFocus === 'character' ? '角色列表' : '设定列表'}</div>
                  <div className="list-box library-list-box">
                    {libraryFocus === 'character' && characters.length === 0 && <div className="muted">暂无角色</div>}
                    {libraryFocus === 'character' &&
                      characters.map((character) => (
                        <button
                          key={character.id}
                          type="button"
                          className={`list-item ${selectedCharacterId === character.id ? 'active' : ''}`}
                          onClick={() => setSelectedCharacterId(character.id)}
                        >
                          <div>{character.name}</div>
                          <div className="muted">{character.role_type || '未填写角色类型'}</div>
                        </button>
                      ))}

                    {libraryFocus === 'lore' && loreEntries.length === 0 && <div className="muted">暂无设定条目</div>}
                    {libraryFocus === 'lore' &&
                      loreEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={`list-item ${selectedLoreEntryId === entry.id ? 'active' : ''}`}
                          onClick={() => setSelectedLoreEntryId(entry.id)}
                        >
                          <div>{entry.title}</div>
                          <div className="muted">{entry.type}</div>
                        </button>
                      ))}
                  </div>
                </section>

                <section className="section-card library-editor">
                  {libraryFocus === 'character' && (
                    <>
                      <div className="section-header section-header-tight">
                        <div>
                          <div className="section-eyebrow">角色库</div>
                          <h3>{selectedCharacterId ? '编辑角色' : '新建角色'}</h3>
                        </div>
                      </div>
                      <label>
                        角色名称
                        <input value={characterForm.name} onChange={(event) => setCharacterForm((prev) => ({ ...prev, name: event.target.value }))} disabled={!selectedProjectId} />
                      </label>
                      <label>
                        角色类型
                        <input
                          value={characterForm.roleType}
                          onChange={(event) => setCharacterForm((prev) => ({ ...prev, roleType: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <label>
                        角色摘要
                        <textarea
                          className="small-textarea"
                          value={characterForm.summary}
                          onChange={(event) => setCharacterForm((prev) => ({ ...prev, summary: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <label>
                        详细设定
                        <textarea
                          className="editor-textarea compact-editor"
                          value={characterForm.details}
                          onChange={(event) => setCharacterForm((prev) => ({ ...prev, details: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCharacterId(null);
                            setCharacterForm(defaultCharacterForm());
                          }}
                          disabled={!selectedProjectId}
                        >
                          新建
                        </button>
                        <button type="button" onClick={() => void onSaveCharacter()} disabled={!selectedProjectId}>
                          保存
                        </button>
                        <button type="button" onClick={() => void onDeleteCharacter()} disabled={!selectedCharacterId}>
                          删除
                        </button>
                      </div>
                    </>
                  )}

                  {libraryFocus === 'lore' && (
                    <>
                      <div className="section-header section-header-tight">
                        <div>
                          <div className="section-eyebrow">设定库条目</div>
                          <h3>{selectedLoreEntryId ? '编辑设定' : '新建设定'}</h3>
                        </div>
                      </div>
                      <label>
                        设定类型
                        <input value={loreForm.type} onChange={(event) => setLoreForm((prev) => ({ ...prev, type: event.target.value }))} disabled={!selectedProjectId} />
                      </label>
                      <label>
                        标题
                        <input value={loreForm.title} onChange={(event) => setLoreForm((prev) => ({ ...prev, title: event.target.value }))} disabled={!selectedProjectId} />
                      </label>
                      <label>
                        摘要
                        <textarea
                          className="small-textarea"
                          value={loreForm.summary}
                          onChange={(event) => setLoreForm((prev) => ({ ...prev, summary: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <label>
                        内容
                        <textarea
                          className="editor-textarea compact-editor"
                          value={loreForm.content}
                          onChange={(event) => setLoreForm((prev) => ({ ...prev, content: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <label>
                        标签（逗号分隔）
                        <input
                          value={loreForm.tagsInput}
                          onChange={(event) => setLoreForm((prev) => ({ ...prev, tagsInput: event.target.value }))}
                          disabled={!selectedProjectId}
                        />
                      </label>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLoreEntryId(null);
                            setLoreForm(defaultLoreForm());
                          }}
                          disabled={!selectedProjectId}
                        >
                          新建
                        </button>
                        <button type="button" onClick={() => void onSaveLoreEntry()} disabled={!selectedProjectId}>
                          保存
                        </button>
                        <button type="button" onClick={() => void onDeleteLoreEntry()} disabled={!selectedLoreEntryId}>
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          )}
        </section>

        <div
          className={`panel-divider${draggingDivider === 'right' ? ' active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            setDraggingDivider('right');
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整右侧建议面板宽度"
        />

        <aside className="panel panel-right">
          <div className="section-header">
            <div>
              <h2>AI 建议层</h2>
              <div className="muted">右侧只呈现建议，不打断写作流本身。</div>
            </div>
            <button type="button" onClick={() => void onCreateMockSuggestion()} disabled={!selectedChapterId}>
              生成 Mock 建议
            </button>
          </div>

          <div className="filters-grid">
            <label>
              状态筛选
              <select value={suggestionFilter} onChange={(event) => setSuggestionFilter(event.target.value as SuggestionFilter)}>
                {SUGGESTION_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              影响层级
              <select
                value={suggestionImpactFilter}
                onChange={(event) => setSuggestionImpactFilter(event.target.value as SuggestionImpactFilter)}
              >
                {SUGGESTION_IMPACT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="list-box suggestion-list">
            {!selectedChapterId && <div className="muted">请先选择章节后再查看建议。</div>}
            {selectedChapterId && filteredSuggestions.length === 0 && <div className="muted">当前筛选条件下暂无建议。</div>}

            {filteredSuggestions.map((suggestion) => {
              const changes = parseSuggestionPatchChanges(suggestion.patch_json);
              const isProcessing = processingSuggestionId === suggestion.id;

              return (
                <div className={`suggestion-item ${suggestion.status !== 'pending' ? 'processed' : ''}`} key={suggestion.id}>
                  <div className="suggestion-topline">
                    <strong>{suggestion.summary}</strong>
                    <span className={`suggestion-status status-${suggestion.status}`}>{SUGGESTION_STATUS_LABELS[suggestion.status]}</span>
                  </div>

                  <div className="suggestion-meta-grid">
                    <div>层级：{getSuggestionLayerLabel(suggestion)}</div>
                    <div>来源：{suggestion.source}</div>
                    <div>类型：{suggestion.kind}</div>
                    <div>创建于：{formatTime(suggestion.created_at)}</div>
                  </div>

                  <div className="suggestion-result">
                    <div className="result-title">建议变更</div>
                    {changes.length === 0 && <div className="muted">暂无结构化变更</div>}
                    {changes.map((change, index) => (
                      <div key={`${suggestion.id}-change-${index}`} className="result-line">
                        <div className="result-main">
                          <span className="result-field">{change.field}</span>
                          <span>{formatValue(change.value)}</span>
                        </div>
                        <div className="result-badges">{renderImpactBadge(change.field, `${suggestion.id}-${change.field}-${index}`)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="suggestion-actions">
                    <button type="button" onClick={() => void onApplySuggestion(suggestion.id)} disabled={suggestion.status !== 'pending' || isProcessing}>
                      {isProcessing ? '处理中...' : '应用'}
                    </button>
                    <button type="button" onClick={() => void onRejectSuggestion(suggestion.id)} disabled={suggestion.status !== 'pending' || isProcessing}>
                      拒绝
                    </button>
                  </div>

                  <div className="suggestion-result">
                    <div className="result-title">已应用变更（appliedChanges）</div>
                    {suggestion.result_json.appliedChanges.length === 0 && <div className="muted">暂无</div>}
                    {suggestion.result_json.appliedChanges.map((item, index) => (
                      <div key={`${suggestion.id}-applied-${index}`} className="result-line">
                        <div className="result-main">
                          <span className="result-field">{item.field}</span>
                          <span>
                            {formatValue(item.previousValue)} → {formatValue(item.newValue)}
                          </span>
                        </div>
                        <div className="result-badges">{renderImpactBadge(item.field, `${suggestion.id}-applied-${index}`)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="suggestion-result">
                    <div className="result-title">被阻止字段（blockedFields）</div>
                    {suggestion.result_json.blockedFields.length === 0 && <div className="muted">暂无</div>}
                    {suggestion.result_json.blockedFields.map((field) => (
                      <div key={`${suggestion.id}-blocked-${field}`} className="result-line">
                        <div className="result-main">
                          <span className="result-field">{field}</span>
                        </div>
                        <div className="result-badges">{renderImpactBadge(field, `${suggestion.id}-blocked-${field}`)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="feedback">{feedback || '就绪'}</div>
          {initState.phase === 'ready' && (
            <div className="meta">
              数据库：{initState.data.dbPath}
              <br />
              数据结构版本：{initState.data.schemaVersion}
              <br />
              自动保存：{AUTOSAVE_LABELS[autosaveIntervalSeconds]}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
