import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiGenerateChapterField,
  AiSuggestion,
  AiSuggestionStatus,
  AppInitData,
  AutosaveIntervalSeconds,
  ChapterContextRefMode,
  ChapterContextRefView,
  Chapter,
  ChapterOutlineOverviewItem,
  ChapterRefs,
  Character,
  IpcResult,
  LoreEntry,
  NovelProject,
  PitGroupedByProjectResult,
  StoryPitView
} from '../shared/ipc';

type InitState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: AppInitData }
  | { phase: 'error'; message: string };

type WorkspaceView = 'chapter' | 'outlineOverview' | 'pitOverview' | 'library';
type LibraryFocus = 'character' | 'lore';
type SuggestionFilter = 'all' | AiSuggestionStatus;
type SuggestionImpact = 'planning' | 'content';
type SuggestionImpactFilter = 'all' | SuggestionImpact;
type DraggingDivider = 'left' | 'right' | null;
type SaveReason = 'timer' | 'blur' | 'switch' | 'relation' | 'adopt_ai' | 'pit';

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

type OutlineExtractCandidateState = {
  chapterId: string;
  oldOutline: string;
  newOutline: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

type ChapterFieldCandidateState = {
  chapterId: string;
  field: AiGenerateChapterField;
  oldValue: string;
  newValue: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

type PitDetailState = {
  pit: StoryPitView;
  context: 'chapter' | 'overview';
};

type PitResolveState = {
  chapterId: string;
  selectedPitId: string;
  draft: string;
};

type PitComposerScope = 'chapter' | 'manual';

type PitComposerState = {
  scope: PitComposerScope;
  projectId: string;
  chapterId: string | null;
  draft: string;
  selectedSuggestion: string | null;
  suggestions: string[];
  loadingSuggestions: boolean;
  provider: string | null;
  model: string | null;
  referenceText: string;
  suggestionError: string;
};

type ContextRefAddMode = Exclude<ChapterContextRefMode, 'auto'>;

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

const CONTEXT_REF_MODE_LABELS: Record<ChapterContextRefMode, string> = {
  auto: '自动',
  manual: '手动',
  pinned: '固定'
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

function getContextRefSummary(item: ChapterContextRefView): string {
  if (item.ref_outline_user.trim()) {
    return item.ref_outline_user.trim();
  }
  if (item.ref_content_excerpt.trim()) {
    return `${item.ref_content_excerpt.trim()}（该章暂未填写摘要，已降级显示正文片段）`;
  }
  return '暂未填写摘要';
}

function buildPitOriginLabel(pit: StoryPitView): string {
  if (pit.type === 'manual') {
    return '作者手动坑';
  }
  if (pit.origin_chapter_index_no !== null && pit.origin_chapter_title) {
    return `第 ${pit.origin_chapter_index_no} 章《${pit.origin_chapter_title}》`;
  }
  return '章节产生';
}

function buildPitStatusLabel(pit: StoryPitView): string {
  if (pit.status === 'resolved') {
    if (pit.resolved_in_chapter_index_no !== null) {
      return `已填 · 填于第 ${pit.resolved_in_chapter_index_no} 章`;
    }
    return '已填';
  }
  return '未填';
}

function buildPitSourceTypeLabel(pit: StoryPitView): string {
  return pit.type === 'chapter' ? '章节坑' : '作者手动设定坑';
}

function buildAiReferenceContext(
  editor: ChapterEditorState,
  linkedCharacters: Character[],
  linkedLoreEntries: LoreEntry[],
  contextRefs: ChapterContextRefView[],
  resolvedPits: StoryPitView[],
  createdPits: StoryPitView[]
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

  const contextRefLines =
    contextRefs.length > 0
      ? contextRefs.map((item) => `- 第 ${item.ref_chapter_index_no} 章《${item.ref_chapter_title}》 [${CONTEXT_REF_MODE_LABELS[item.mode]}]\n  ${getContextRefSummary(item)}`)
      : ['- 暂无参考章节'];

  const resolvedPitLines =
    resolvedPits.length > 0
      ? resolvedPits.map((pit) => `- ${pit.content}\n  来源：${buildPitOriginLabel(pit)}`)
      : ['- 本章未填坑'];

  const createdPitLines =
    createdPits.length > 0
      ? createdPits.map((pit) => `- ${pit.content}\n  来源：${buildPitOriginLabel(pit)}`)
      : ['- 本章未埋坑'];

  return [
    '【本章目标】',
    editor.goal.trim() || '未填写本章目标',
    '',
    '【本章摘要】',
    editor.outlineUser.trim() || '未填写本章摘要',
    '',
    '【章末钩子 / 下一章引子】',
    editor.nextHook.trim() || '未填写章末钩子 / 下一章引子',
    '',
    '【已关联角色】',
    ...characterLines,
    '',
    '【已关联设定】',
    ...loreLines,
    '',
    '【参考章节】',
    ...contextRefLines,
    '',
    '【本章填坑】',
    ...resolvedPitLines,
    '',
    '【本章埋坑】',
    ...createdPitLines
  ].join('\n');
}

function PitPreviewCard({
  pit,
  secondaryLabel,
  onOpen
}: {
  pit: StoryPitView;
  secondaryLabel: string;
  onOpen: () => void;
}) {
  const previewSummary = `${buildPitSourceTypeLabel(pit)}｜${secondaryLabel}`;

  return (
    <article className="pit-preview-card pit-preview-card-inline" title={`${pit.content}\n${previewSummary}`}>
      <span className={`status-pill pit-preview-status ${pit.status === 'resolved' ? 'status-ready' : 'status-loading'}`}>{buildPitStatusLabel(pit)}</span>
      <div className="pit-preview-inline-content">{pit.content}</div>
      <button type="button" className="icon-button" onClick={onOpen} aria-label={`查看坑详情：${previewSummary}`} title={previewSummary}>
        ...
      </button>
    </article>
  );
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
  const [contextRefs, setContextRefs] = useState<ChapterContextRefView[]>([]);
  const [editor, setEditor] = useState<ChapterEditorState>(defaultEditorState());
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [lastSaveWasTimer, setLastSaveWasTimer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingOutlineAi, setGeneratingOutlineAi] = useState(false);
  const [outlineExtractCandidate, setOutlineExtractCandidate] = useState<OutlineExtractCandidateState | null>(null);
  const [applyingOutlineCandidate, setApplyingOutlineCandidate] = useState(false);
  const [generatingTitleAi, setGeneratingTitleAi] = useState(false);
  const [generatingGoalAi, setGeneratingGoalAi] = useState(false);
  const [chapterFieldCandidate, setChapterFieldCandidate] = useState<ChapterFieldCandidateState | null>(null);
  const [applyingChapterFieldCandidate, setApplyingChapterFieldCandidate] = useState(false);
  const [processingPitId, setProcessingPitId] = useState<string | null>(null);
  const [processingSuggestionId, setProcessingSuggestionId] = useState<string | null>(null);
  const [pendingCharacterId, setPendingCharacterId] = useState('');
  const [pendingLoreEntryId, setPendingLoreEntryId] = useState('');
  const [pendingContextRefChapterId, setPendingContextRefChapterId] = useState('');
  const [pendingContextRefMode, setPendingContextRefMode] = useState<ContextRefAddMode>('manual');
  const [pitDetail, setPitDetail] = useState<PitDetailState | null>(null);
  const [pitDetailDraft, setPitDetailDraft] = useState('');
  const [pitResolve, setPitResolve] = useState<PitResolveState | null>(null);
  const [pitComposer, setPitComposer] = useState<PitComposerState | null>(null);

  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [characterForm, setCharacterForm] = useState<CharacterFormState>(defaultCharacterForm());

  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedLoreEntryId, setSelectedLoreEntryId] = useState<string | null>(null);
  const [loreForm, setLoreForm] = useState<LoreFormState>(defaultLoreForm());

  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionFilter>('pending');
  const [suggestionImpactFilter, setSuggestionImpactFilter] = useState<SuggestionImpactFilter>('all');
  const [outlineOverviewItems, setOutlineOverviewItems] = useState<ChapterOutlineOverviewItem[]>([]);
  const [pitOverviewGrouped, setPitOverviewGrouped] = useState<PitGroupedByProjectResult>({ chapterGroups: [], manualPits: [] });
  const [createdPits, setCreatedPits] = useState<StoryPitView[]>([]);
  const [resolvedPits, setResolvedPits] = useState<StoryPitView[]>([]);
  const [availablePits, setAvailablePits] = useState<StoryPitView[]>([]);

  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [draggingDivider, setDraggingDivider] = useState<DraggingDivider>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  const currentChapterRef = useRef<Chapter | null>(null);
  const currentRefsRef = useRef<ChapterRefs | null>(null);
  const editorRef = useRef<ChapterEditorState>(defaultEditorState());
  const selectedProjectIdRef = useRef<string | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const chapterWorkspaceLoadSeqRef = useRef(0);

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
  const canExtractOutline = useMemo(
    () =>
      Boolean(
        editor.content.trim() ||
          editor.title.trim() ||
          editor.goal.trim() ||
          editor.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0 ||
          resolvedPits.length > 0 ||
          createdPits.length > 0
      ),
    [
      contextRefs.length,
      createdPits.length,
      editor.content,
      editor.goal,
      editor.nextHook,
      editor.title,
      linkedCharacters.length,
      linkedLoreEntries.length,
      resolvedPits.length
    ]
  );
  const availableCharacters = useMemo(
    () => characters.filter((character) => !editor.characterIds.includes(character.id)),
    [characters, editor.characterIds]
  );
  const availableLoreEntries = useMemo(
    () => loreEntries.filter((entry) => !editor.loreEntryIds.includes(entry.id)),
    [editor.loreEntryIds, loreEntries]
  );
  const availableHistoryChapters = useMemo(() => {
    if (!currentChapter) {
      return [];
    }
    const selectedIds = new Set(contextRefs.map((item) => item.ref_chapter_id));
    return chapters.filter((chapter) => chapter.index_no < currentChapter.index_no && !selectedIds.has(chapter.id));
  }, [chapters, contextRefs, currentChapter]);
  const hasPlanningAiContext = useMemo(
    () =>
      Boolean(
        editor.goal.trim() ||
          editor.outlineUser.trim() ||
          editor.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0 ||
          resolvedPits.length > 0 ||
          createdPits.length > 0
      ),
    [contextRefs.length, createdPits.length, editor.goal, editor.nextHook, editor.outlineUser, linkedCharacters.length, linkedLoreEntries.length, resolvedPits.length]
  );
  const canGenerateTitle = hasPlanningAiContext;
  const canGenerateGoal = hasPlanningAiContext;
  const canRequestPitSuggestions = useMemo(
    () =>
      Boolean(
        editor.content.trim() ||
          editor.title.trim() ||
          editor.goal.trim() ||
          editor.outlineUser.trim() ||
          editor.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0
      ),
    [
      contextRefs.length,
      editor.content,
      editor.goal,
      editor.nextHook,
      editor.outlineUser,
      editor.title,
      linkedCharacters.length,
      linkedLoreEntries.length
    ]
  );
  const aiReferenceText = useMemo(
    () => buildAiReferenceContext(editor, linkedCharacters, linkedLoreEntries, contextRefs, resolvedPits, createdPits),
    [contextRefs, createdPits, editor, linkedCharacters, linkedLoreEntries, resolvedPits]
  );

  const syncChapterList = useCallback((updatedChapter: Chapter) => {
    setChapters((prev) => prev.map((chapter) => (chapter.id === updatedChapter.id ? updatedChapter : chapter)));
  }, []);
  const syncOutlineOverviewItem = useCallback((updatedChapter: Chapter) => {
    setOutlineOverviewItems((prev) => {
      const nextItem: ChapterOutlineOverviewItem = {
        chapterId: updatedChapter.id,
        index_no: updatedChapter.index_no,
        title: updatedChapter.title,
        outline_user: updatedChapter.outline_user,
        updated_at: updatedChapter.updated_at
      };

      if (prev.some((item) => item.chapterId === updatedChapter.id)) {
        return prev
          .map((item) => (item.chapterId === updatedChapter.id ? nextItem : item))
          .sort((left, right) => left.index_no - right.index_no);
      }

      return [...prev, nextItem].sort((left, right) => left.index_no - right.index_no);
    });
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

  const loadOutlineOverview = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.chapter.listOutlinesByProject({ projectId });
    if (!result.ok) {
      setFeedback(`加载章节摘要总览失败：${result.error.message}`);
      return;
    }

    setOutlineOverviewItems(result.data);
  }, []);

  const loadPitOverview = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.pit.listGroupedByProject({ projectId });
    if (!result.ok) {
      setFeedback(`加载坑位总览失败：${result.error.message}`);
      return;
    }

    setPitOverviewGrouped(result.data);
  }, []);

  const loadChapterPitState = useCallback(async (chapterId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return false;
    }

    const [createdResult, resolvedResult, availableResult] = await Promise.all([
      api.chapter.listCreatedPits({ chapterId }),
      api.chapter.listResolvedPits({ chapterId }),
      api.pit.listAvailableForChapter({ chapterId })
    ]);

    if (!createdResult.ok) {
      setFeedback(`加载本章埋坑失败：${createdResult.error.message}`);
      return false;
    }
    if (!resolvedResult.ok) {
      setFeedback(`加载本章填坑失败：${resolvedResult.error.message}`);
      return false;
    }
    if (!availableResult.ok) {
      setFeedback(`加载可填坑列表失败：${availableResult.error.message}`);
      return false;
    }

    setCreatedPits(createdResult.data);
    setResolvedPits(resolvedResult.data);
    setAvailablePits(availableResult.data);
    return true;
  }, []);

  const loadChapterWorkspace = useCallback(async (chapterId: string) => {
    const api = resolveAppApi();
    if (!api) {
      setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const loadSeq = chapterWorkspaceLoadSeqRef.current + 1;
    chapterWorkspaceLoadSeqRef.current = loadSeq;

    const [chapterResult, refsResult, contextRefsResult, suggestionsResult, createdPitsResult, resolvedPitsResult, availablePitsResult] = await Promise.all([
      api.chapter.get(chapterId),
      api.chapter.getRefs({ chapterId }),
      api.chapter.getContextRefs({ chapterId }),
      api.suggestion.listByEntity({ entityType: 'Chapter', entityId: chapterId }),
      api.chapter.listCreatedPits({ chapterId }),
      api.chapter.listResolvedPits({ chapterId }),
      api.pit.listAvailableForChapter({ chapterId })
    ]);

    if (chapterWorkspaceLoadSeqRef.current !== loadSeq) {
      return;
    }

    if (!chapterResult.ok) {
      setFeedback(`加载章节详情失败：${chapterResult.error.message}`);
      return;
    }
    if (!refsResult.ok) {
      setFeedback(`加载章节关联失败：${refsResult.error.message}`);
      return;
    }
    if (!contextRefsResult.ok) {
      setFeedback(`加载参考章节失败：${contextRefsResult.error.message}`);
      return;
    }
    if (!suggestionsResult.ok) {
      setFeedback(`加载建议失败：${suggestionsResult.error.message}`);
      return;
    }
    if (!createdPitsResult.ok) {
      setFeedback(`加载本章埋坑失败：${createdPitsResult.error.message}`);
      return;
    }
    if (!resolvedPitsResult.ok) {
      setFeedback(`加载本章填坑失败：${resolvedPitsResult.error.message}`);
      return;
    }
    if (!availablePitsResult.ok) {
      setFeedback(`加载可填坑列表失败：${availablePitsResult.error.message}`);
      return;
    }

    setCurrentChapter(chapterResult.data);
    setCurrentRefs(refsResult.data);
    setContextRefs(contextRefsResult.data);
    const isSameChapter = currentChapterRef.current?.id === chapterResult.data.id;
    const hasUnsavedDraft = isSameChapter && isEditorDirty(editorRef.current, currentChapterRef.current, currentRefsRef.current);
    if (!hasUnsavedDraft) {
      setEditor(buildEditorState(chapterResult.data, refsResult.data));
    }
    setSuggestions(suggestionsResult.data);
    setCreatedPits(createdPitsResult.data);
    setResolvedPits(resolvedPitsResult.data);
    setAvailablePits(availablePitsResult.data);
    setPendingCharacterId('');
    setPendingLoreEntryId('');
    setPendingContextRefChapterId('');
    setPendingContextRefMode('manual');
    setPitDetail(null);
    setPitDetailDraft('');
    setPitResolve(null);
    setPitComposer(null);
  }, []);

  const refreshPitViews = useCallback(async () => {
    const chapterId = currentChapterRef.current?.id ?? null;
    const projectId = selectedProjectIdRef.current;

    if (chapterId) {
      await loadChapterPitState(chapterId);
    }
    if (projectId) {
      await loadPitOverview(projectId);
    }
  }, [loadChapterPitState, loadPitOverview]);
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
        syncOutlineOverviewItem(chapterResult.data);
        if (selectedProjectIdRef.current) {
          await loadPitOverview(selectedProjectIdRef.current);
        }
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
    [loadPitOverview, syncChapterList, syncOutlineOverviewItem]
  );

  const onFieldBlur = useCallback(() => {
    void saveChapterDraft('blur');
  }, [contextRefs.length, createdPits.length, linkedCharacters.length, linkedLoreEntries.length, resolvedPits.length, saveChapterDraft]);

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
        setInitState({
          phase: 'error',
          message: 'window.appApi.app.init 缺失。当前更像是 Electron main/preload 没同步到最新构建，数据库内容通常还在；请完全退出后重新启动桌面应用。'
        });
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
      chapterWorkspaceLoadSeqRef.current += 1;
      setOutlineExtractCandidate(null);
      setChapters([]);
      setSelectedChapterId(null);
      setCurrentChapter(null);
      setCurrentRefs(null);
      setContextRefs([]);
      setEditor(defaultEditorState());
      setCharacters([]);
      setLoreEntries([]);
      setOutlineOverviewItems([]);
      setPitOverviewGrouped({ chapterGroups: [], manualPits: [] });
      setSuggestions([]);
      setCreatedPits([]);
      setResolvedPits([]);
      setAvailablePits([]);
      setChapterFieldCandidate(null);
      setPitDetail(null);
      setPitDetailDraft('');
      setPitComposer(null);
      setSelectedCharacterId(null);
      setSelectedLoreEntryId(null);
      setCharacterForm(defaultCharacterForm());
      setLoreForm(defaultLoreForm());
      return;
    }

    void Promise.all([
      loadChapters(selectedProjectId),
      loadCharacters(selectedProjectId),
      loadLoreEntries(selectedProjectId),
      loadOutlineOverview(selectedProjectId),
      loadPitOverview(selectedProjectId)
    ]);
  }, [selectedProjectId, loadChapters, loadCharacters, loadLoreEntries, loadOutlineOverview, loadPitOverview]);

  useEffect(() => {
    if (!selectedChapterId) {
      chapterWorkspaceLoadSeqRef.current += 1;
      setOutlineExtractCandidate(null);
      setCurrentChapter(null);
      setCurrentRefs(null);
      setContextRefs([]);
      setEditor(defaultEditorState());
      setSuggestions([]);
      setCreatedPits([]);
      setResolvedPits([]);
      setAvailablePits([]);
      setChapterFieldCandidate(null);
      setPitDetail(null);
      setPitDetailDraft('');
      setPitResolve(null);
      setPitComposer(null);
      return;
    }

    void loadChapterWorkspace(selectedChapterId);
  }, [selectedChapterId, loadChapterWorkspace]);

  useEffect(() => {
    setOutlineExtractCandidate(null);
    setChapterFieldCandidate(null);
    setPitResolve(null);
  }, [selectedChapterId]);

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
    await loadOutlineOverview(selectedProjectId);
    setSelectedChapterId(result.data.id);
    setWorkspaceView('chapter');
    setFeedback(`已创建章节：${result.data.title}`);
  }, [loadChapters, loadOutlineOverview, newChapterTitle, selectedProjectId]);

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
    await loadOutlineOverview(selectedProjectId);
    setFeedback(`已删除章节：${chapter.title}`);
  }, [currentChapter, loadChapters, loadOutlineOverview, selectedProjectId]);

  const onGenerateOutlineAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    const hasSummaryContext =
      Boolean(
        editorRef.current.content.trim() ||
          editorRef.current.title.trim() ||
          editorRef.current.goal.trim() ||
          editorRef.current.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0 ||
          resolvedPits.length > 0 ||
          createdPits.length > 0
      );
    if (!hasSummaryContext) {
      setFeedback('当前正文和 AI 参考内容都不足，暂时无法生成本章摘要。');
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      setPitComposer((prev) => (prev ? { ...prev, loadingSuggestions: false } : prev));
      return;
    }

    setGeneratingOutlineAi(true);
    const result = await api.ai.extractOutline({ chapterId: chapter.id });
    setGeneratingOutlineAi(false);
    if (!result.ok) {
      setFeedback(`AI 更新摘要失败：${result.error.message}`);
      return;
    }

    const generatedOutline = result.data.candidateOutline.trim();
    if (!generatedOutline) {
      setFeedback('AI 更新摘要返回为空。');
      return;
    }

    setOutlineExtractCandidate({
      chapterId: result.data.chapterId,
      oldOutline: editorRef.current.outlineUser,
      newOutline: generatedOutline,
      provider: result.data.provider,
      model: result.data.model,
      referenceText: result.data.referenceText
    });
    setFeedback(`AI 已生成候选摘要（provider: ${result.data.provider}），请确认是否应用。`);
  }, [saveChapterDraft]);

  const onCancelOutlineExtract = useCallback(() => {
    setOutlineExtractCandidate(null);
    setFeedback('已取消应用本次 AI 候选摘要。');
  }, []);

  const onApplyOutlineExtract = useCallback(async () => {
    const candidate = outlineExtractCandidate;
    if (!candidate) {
      return;
    }
    if (currentChapterRef.current?.id !== candidate.chapterId) {
      setFeedback('当前章节已切换，本次 AI 候选摘要已失效。');
      setOutlineExtractCandidate(null);
      return;
    }

    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      outlineUser: candidate.newOutline
    };
    setApplyingOutlineCandidate(true);
    const applied = await saveChapterDraft('adopt_ai', nextEditor);
    setApplyingOutlineCandidate(false);
    if (!applied) {
      return;
    }

    setEditor(nextEditor);
    setOutlineExtractCandidate(null);
    if (selectedProjectIdRef.current) {
      await loadChapters(selectedProjectIdRef.current);
      await loadOutlineOverview(selectedProjectIdRef.current);
    }
    setFeedback(`已应用 AI 候选摘要（provider: ${candidate.provider}），本章摘要已更新。`);
  }, [loadChapters, loadOutlineOverview, outlineExtractCandidate, saveChapterDraft]);
  const onGenerateChapterTitleAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    if (!canGenerateTitle) {
      setFeedback('当前上下文不足，暂时无法生成章节标题。');
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      return;
    }

    setGeneratingTitleAi(true);
    const result = await api.ai.generateChapterTitle({ chapterId: chapter.id });
    setGeneratingTitleAi(false);
    if (!result.ok) {
      setFeedback(`AI 生成章节标题失败：${result.error.message}`);
      return;
    }

    setChapterFieldCandidate({
      chapterId: result.data.chapterId,
      field: 'title',
      oldValue: editorRef.current.title,
      newValue: result.data.candidateText,
      provider: result.data.provider,
      model: result.data.model,
      referenceText: result.data.referenceText
    });
    setFeedback(`AI 已生成章节标题候选（provider: ${result.data.provider}），请确认是否应用。`);
  }, [canGenerateTitle, saveChapterDraft]);

  const onGenerateChapterGoalAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    if (!canGenerateGoal) {
      setFeedback('当前上下文不足，暂时无法生成本章目标。');
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      return;
    }

    setGeneratingGoalAi(true);
    const result = await api.ai.generateChapterGoal({ chapterId: chapter.id });
    setGeneratingGoalAi(false);
    if (!result.ok) {
      setFeedback(`AI 生成本章目标失败：${result.error.message}`);
      return;
    }

    setChapterFieldCandidate({
      chapterId: result.data.chapterId,
      field: 'goal',
      oldValue: editorRef.current.goal,
      newValue: result.data.candidateText,
      provider: result.data.provider,
      model: result.data.model,
      referenceText: result.data.referenceText
    });
    setFeedback(`AI 已生成本章目标候选（provider: ${result.data.provider}），请确认是否应用。`);
  }, [canGenerateGoal, saveChapterDraft]);

  const onCancelChapterFieldCandidate = useCallback(() => {
    setChapterFieldCandidate(null);
    setFeedback('已取消本次 AI 候选应用。');
  }, []);

  const onApplyChapterFieldCandidate = useCallback(async () => {
    const candidate = chapterFieldCandidate;
    if (!candidate) {
      return;
    }
    if (currentChapterRef.current?.id !== candidate.chapterId) {
      setFeedback('当前章节已切换，本次 AI 候选已失效。');
      setChapterFieldCandidate(null);
      return;
    }

    const nextEditor: ChapterEditorState =
      candidate.field === 'title'
        ? { ...editorRef.current, title: candidate.newValue }
        : { ...editorRef.current, goal: candidate.newValue };

    setApplyingChapterFieldCandidate(true);
    const applied = await saveChapterDraft('adopt_ai', nextEditor);
    setApplyingChapterFieldCandidate(false);
    if (!applied) {
      return;
    }

    setEditor(nextEditor);
    setChapterFieldCandidate(null);
    if (selectedProjectIdRef.current) {
      await loadChapters(selectedProjectIdRef.current);
      await loadOutlineOverview(selectedProjectIdRef.current);
    }
    setFeedback(`已应用 AI 生成的${candidate.field === 'title' ? '章节标题' : '本章目标'}。`);
  }, [chapterFieldCandidate, loadChapters, loadOutlineOverview, saveChapterDraft]);

  const onOpenPitDetail = useCallback((pit: StoryPitView, context: 'chapter' | 'overview') => {
    setPitDetail({ pit, context });
    setPitDetailDraft(pit.content);
  }, []);

  const onClosePitDetail = useCallback(() => {
    setPitDetail(null);
    setPitDetailDraft('');
  }, []);

  const onOpenChapterPitComposer = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    const projectId = selectedProjectIdRef.current;
    if (!api || !chapter || !projectId) {
      setFeedback('请先选择章节。');
      return;
    }

    setPitComposer({
      scope: 'chapter',
      projectId,
      chapterId: chapter.id,
      draft: '',
      selectedSuggestion: null,
      suggestions: [],
      loadingSuggestions: canRequestPitSuggestions,
      provider: null,
      model: null,
      referenceText: '',
      suggestionError: ''
    });

    if (!canRequestPitSuggestions) {
      setFeedback('当前上下文不足，暂时无法生成 AI 推荐坑；你仍然可以直接手动创建。');
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      return;
    }

    const result = await api.chapter.getPitSuggestions({ chapterId: chapter.id });
    setPitComposer((prev) => {
      if (!prev || prev.scope !== 'chapter' || prev.chapterId !== chapter.id) {
        return prev;
      }
      if (!result.ok) {
        return {
          ...prev,
          loadingSuggestions: false,
          suggestionError: result.error.message
        };
      }
      return {
        ...prev,
        loadingSuggestions: false,
        suggestions: result.data.candidates,
        provider: result.data.provider,
        model: result.data.model,
        referenceText: result.data.referenceText,
        suggestionError: ''
      };
    });
    if (!result.ok) {
      setFeedback(`加载新增坑候选失败：${result.error.message}`);
      return;
    }
    setFeedback(`已生成 ${result.data.candidates.length} 条新增坑候选，可选择或直接手动创建。`);
  }, [canRequestPitSuggestions, saveChapterDraft]);

  const onRefreshPitSuggestions = useCallback(async () => {
    const api = resolveAppApi();
    const composer = pitComposer;
    if (!api || !composer || composer.scope !== 'chapter' || !composer.chapterId) {
      return;
    }

    setPitComposer((prev) => (prev ? { ...prev, loadingSuggestions: true, suggestionError: '' } : prev));

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      setPitComposer((prev) => (prev ? { ...prev, loadingSuggestions: false } : prev));
      return;
    }

    const result = await api.chapter.getPitSuggestions({ chapterId: composer.chapterId });
    setPitComposer((prev) => {
      if (!prev || prev.scope !== 'chapter' || prev.chapterId !== composer.chapterId) {
        return prev;
      }
      if (!result.ok) {
        return {
          ...prev,
          loadingSuggestions: false,
          suggestionError: result.error.message
        };
      }
      return {
        ...prev,
        loadingSuggestions: false,
        suggestions: result.data.candidates,
        provider: result.data.provider,
        model: result.data.model,
        referenceText: result.data.referenceText,
        suggestionError: ''
      };
    });
    if (!result.ok) {
      setFeedback(`刷新新增坑候选失败：${result.error.message}`);
      return;
    }
    setFeedback(`已刷新 ${result.data.candidates.length} 条新增坑候选。`);
  }, [pitComposer, saveChapterDraft]);

  const onOpenManualPitComposer = useCallback(() => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) {
      setFeedback('请先选择项目。');
      return;
    }
    setPitComposer({
      scope: 'manual',
      projectId,
      chapterId: null,
      draft: '',
      selectedSuggestion: null,
      suggestions: [],
      loadingSuggestions: false,
      provider: null,
      model: null,
      referenceText: '',
      suggestionError: ''
    });
  }, []);

  const onClosePitComposer = useCallback(() => {
    setPitComposer(null);
  }, []);

  const onPickPitSuggestion = useCallback((suggestion: string) => {
    setPitComposer((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        draft: suggestion,
        selectedSuggestion: suggestion
      };
    });
  }, []);

  const onSubmitPitComposer = useCallback(async () => {
    const api = resolveAppApi();
    const composer = pitComposer;
    if (!api || !composer) {
      return;
    }

    const content = composer.draft.trim();
    if (!content) {
      setFeedback('请先填写坑内容。');
      return;
    }

    setProcessingPitId('pit-composer-submit');
    const result =
      composer.scope === 'manual'
        ? await api.pit.createManual({ projectId: composer.projectId, content })
        : composer.selectedSuggestion
          ? await api.chapter.createPitFromSuggestion({ chapterId: composer.chapterId as string, content })
          : await api.chapter.createPitManual({ chapterId: composer.chapterId as string, content });
    setProcessingPitId(null);

    if (!result.ok) {
      setFeedback(`创建坑失败：${result.error.message}`);
      return;
    }

    setPitComposer(null);
    await refreshPitViews();
    setFeedback(composer.scope === 'manual' ? '已新增作者手动设定坑。' : '已新增本章坑。');
  }, [pitComposer, refreshPitViews]);

  const onOpenPitResolve = useCallback(() => {
    const chapter = currentChapterRef.current;
    if (!chapter) {
      setFeedback('请先选择章节。');
      return;
    }

    if (availablePits.length === 0) {
      setFeedback('当前没有可供本章填上的前文旧坑。');
      return;
    }

    setPitResolve({
      chapterId: chapter.id,
      selectedPitId: '',
      draft: ''
    });
  }, [availablePits]);

  const onClosePitResolve = useCallback(() => {
    setPitResolve(null);
  }, []);

  const onPickResolvablePit = useCallback((pit: StoryPitView) => {
    setPitResolve({
      chapterId: currentChapterRef.current?.id ?? '',
      selectedPitId: pit.id,
      draft: pit.content
    });
  }, []);

  const onResolvePit = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    const resolver = pitResolve;
    if (!api || !chapter || !resolver || !resolver.selectedPitId) {
      return;
    }

    const draft = resolver.draft.trim();
    if (!draft) {
      setFeedback('请先填写坑内容。');
      return;
    }

    const selectedPit = availablePits.find((pit) => pit.id === resolver.selectedPitId);
    if (!selectedPit) {
      setFeedback('请选择一条可填的前文旧坑。');
      return;
    }

    setProcessingPitId(resolver.selectedPitId);
    if (draft !== selectedPit.content.trim()) {
      const updateResult = await api.pit.update({ pitId: resolver.selectedPitId, patch: { content: draft } });
      if (!updateResult.ok) {
        setProcessingPitId(null);
        setFeedback(`更新坑内容失败：${updateResult.error.message}`);
        return;
      }
    }

    const result = await api.chapter.resolvePit({ chapterId: chapter.id, pitId: resolver.selectedPitId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`填坑失败：${result.error.message}`);
      return;
    }

    setPitResolve(null);
    await refreshPitViews();
    setFeedback('已将坑标记为在本章填上。');
  }, [availablePits, pitResolve, refreshPitViews]);

  const onUnresolvePit = useCallback(async (pitId: string) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }

    setProcessingPitId(pitId);
    const result = await api.chapter.unresolvePit({ chapterId: chapter.id, pitId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`取消填坑失败：${result.error.message}`);
      return;
    }

    if (pitDetail?.pit.id === pitId) {
      setPitDetail(null);
      setPitDetailDraft('');
    }
    await refreshPitViews();
    setFeedback('已取消本章填坑标记。');
  }, [pitDetail, refreshPitViews]);

  const onSavePitDetail = useCallback(async () => {
    const api = resolveAppApi();
    const detail = pitDetail;
    if (!api || !detail) {
      return;
    }
    const content = pitDetailDraft.trim();
    if (!content) {
      setFeedback('坑内容不能为空。');
      return;
    }

    setProcessingPitId(detail.pit.id);
    const result = await api.pit.update({ pitId: detail.pit.id, patch: { content } });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`保存坑内容失败：${result.error.message}`);
      return;
    }

    setPitDetail({
      pit: result.data,
      context: detail.context
    });
    setPitDetailDraft(result.data.content);
    await refreshPitViews();
    setFeedback('已保存坑内容。');
  }, [pitDetail, pitDetailDraft, refreshPitViews]);

  const onDeletePit = useCallback(async (pit: StoryPitView) => {
    const api = resolveAppApi();
    if (!api) {
      return;
    }
    if (!window.confirm(`确认删除这条坑？\n\n${pit.content}`)) {
      return;
    }

    setProcessingPitId(pit.id);
    const result = await api.pit.delete({ pitId: pit.id });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`删除坑失败：${result.error.message}`);
      return;
    }

    if (pitDetail?.pit.id === pit.id) {
      setPitDetail(null);
      setPitDetailDraft('');
    }
    await refreshPitViews();
    setFeedback('已删除坑。');
  }, [pitDetail, refreshPitViews]);
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
      await loadOutlineOverview(selectedProjectIdRef.current);
    }
    setFeedback(
      `建议处理完成：${SUGGESTION_STATUS_LABELS[result.data.status]}，应用 ${result.data.appliedChanges.length} 项，阻止 ${result.data.blockedFields.length} 项。`
    );
  }, [loadChapterWorkspace, loadChapters, loadOutlineOverview, selectedChapterId]);

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

  const onAddContextRef = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter || !pendingContextRefChapterId) {
      return;
    }

    const result = await api.chapter.addContextRef({
      chapterId: chapter.id,
      refChapterId: pendingContextRefChapterId,
      mode: pendingContextRefMode
    });
    if (!result.ok) {
      setFeedback(`添加参考章节失败：${result.error.message}`);
      return;
    }

    setContextRefs(result.data);
    setPendingContextRefChapterId('');
    setFeedback('已添加参考章节。');
  }, [pendingContextRefChapterId, pendingContextRefMode]);

  const onRemoveContextRef = useCallback(async (contextRefId: string) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }

    const result = await api.chapter.removeContextRef({ contextRefId });
    if (!result.ok) {
      setFeedback(`删除参考章节失败：${result.error.message}`);
      return;
    }

    const nextRefs = await api.chapter.getContextRefs({ chapterId: chapter.id });
    if (!nextRefs.ok) {
      setFeedback(`刷新参考章节失败：${nextRefs.error.message}`);
      return;
    }

    setContextRefs(nextRefs.data);
    setFeedback('已删除参考章节。');
  }, []);

  const onUpdateContextRefMode = useCallback(async (contextRefId: string, mode: ChapterContextRefMode) => {
    const api = resolveAppApi();
    if (!api) {
      return;
    }

    const result = await api.chapter.updateContextRef({
      contextRefId,
      patch: { mode }
    });
    if (!result.ok) {
      setFeedback(`更新参考章节模式失败：${result.error.message}`);
      return;
    }

    setContextRefs(result.data);
    setFeedback('参考章节模式已更新。');
  }, []);

  const onAutoPickContextRefs = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }

    const result = await api.chapter.autoPickContextRefs({ chapterId: chapter.id, limit: 3 });
    if (!result.ok) {
      setFeedback(`自动推荐参考章节失败：${result.error.message}`);
      return;
    }

    setContextRefs(result.data);
    setFeedback('已按最近前文章节自动推荐参考章节。');
  }, []);

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
              className={`switch-btn ${workspaceView === 'outlineOverview' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('outlineOverview')}
            >
              章节摘要总览
            </button>
            <button
              type="button"
              className={`switch-btn ${workspaceView === 'pitOverview' ? 'active' : ''}`}
              onClick={() => setWorkspaceView('pitOverview')}
            >
              全部坑内容总览
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
                  <div className="muted">先整理角色、设定、前文引用和坑位，再形成当前章规划，最后进入 AI 参考与正文写作。</div>
                </div>
                <div className="save-chip-row">
                  <span className={`save-chip ${chapterDirty || isSaving ? 'dirty' : 'saved'}`}>{saveStatusText}</span>
                  <span className="muted">自动保存：{AUTOSAVE_LABELS[autosaveIntervalSeconds]}</span>
                </div>
              </div>

              {!currentChapter && <div className="empty-state">请选择一个章节，或先在左侧创建章节。</div>}

              {currentChapter && (
                <>
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

                  <section className="section-card reference-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">参考章节</div>
                        <h3>历史章节引用</h3>
                        <div className="muted">只能引用前文章节。自动推荐与手动选择可以并存，固定引用不会被自动覆盖。</div>
                      </div>
                      <button type="button" onClick={() => void onAutoPickContextRefs()} disabled={!currentChapter || currentChapter.index_no <= 1}>
                        自动推荐前文
                      </button>
                    </div>

                    <div className="reference-ref-list">
                      {contextRefs.length === 0 && <div className="muted">当前尚未选择参考章节。</div>}
                      {contextRefs.map((item) => (
                        <div key={item.id} className="reference-ref-item">
                          <div className="reference-ref-topline">
                            <div>
                              <strong>
                                第 {item.ref_chapter_index_no} 章《{item.ref_chapter_title}》
                              </strong>
                              <div className="muted">更新时间：{formatTime(item.ref_updated_at)}</div>
                            </div>
                            <div className="reference-ref-actions">
                              <select value={item.mode} onChange={(event) => void onUpdateContextRefMode(item.id, event.target.value as ChapterContextRefMode)}>
                                <option value="auto">自动</option>
                                <option value="manual">手动</option>
                                <option value="pinned">固定</option>
                              </select>
                              <button type="button" className="token-action" onClick={() => void onRemoveContextRef(item.id)}>
                                删除
                              </button>
                            </div>
                          </div>
                          <div className="reference-ref-summary">{getContextRefSummary(item)}</div>
                        </div>
                      ))}
                    </div>

                    <div className="context-ref-picker">
                      <select value={pendingContextRefChapterId} onChange={(event) => setPendingContextRefChapterId(event.target.value)} disabled={!currentChapter || availableHistoryChapters.length === 0}>
                        <option value="">选择历史章节</option>
                        {availableHistoryChapters.map((chapter) => (
                          <option key={chapter.id} value={chapter.id}>
                            第 {chapter.index_no} 章《{chapter.title}》
                          </option>
                        ))}
                      </select>
                      <select value={pendingContextRefMode} onChange={(event) => setPendingContextRefMode(event.target.value as ContextRefAddMode)} disabled={!currentChapter}>
                        <option value="manual">手动</option>
                        <option value="pinned">固定</option>
                      </select>
                      <button type="button" onClick={() => void onAddContextRef()} disabled={!pendingContextRefChapterId}>
                        添加引用
                      </button>
                    </div>
                  </section>

                  <section className="section-card pit-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">填坑 / 埋坑层</div>
                        <h3>线索与伏笔管理</h3>
                        <div className="muted">默认只看缩略线索卡片。点“...”再进入详情查看或编辑，避免把写作区拖成一堆表单。</div>
                      </div>
                    </div>

                    <div className="pit-grid">
                      <section className="pit-column">
                        <div className="pit-column-header">
                          <span className="pit-column-title">填坑</span>
                          <button type="button" onClick={onOpenPitResolve} disabled={!currentChapter || availablePits.length === 0}>
                            选择填坑
                          </button>
                        </div>
                        <div className="muted pit-column-copy">{resolvedPits.length === 0 ? '选择前文旧坑，在本章回应。' : `本章已填 ${resolvedPits.length} 条，可继续补充。`}</div>
                        <div className="pit-card-list">
                          {resolvedPits.length === 0 && <div className="muted">当前尚未选择本章要填的坑。</div>}
                          {resolvedPits.map((pit) => (
                            <PitPreviewCard
                              key={pit.id}
                              pit={pit}
                              secondaryLabel={`来源：${buildPitOriginLabel(pit)}`}
                              onOpen={() => onOpenPitDetail(pit, 'chapter')}
                            />
                          ))}
                        </div>
                      </section>

                      <section className="pit-column">
                        <div className="pit-column-header">
                          <span className="pit-column-title">埋坑</span>
                          <button type="button" onClick={() => void onOpenChapterPitComposer()}>
                            新增坑
                          </button>
                        </div>
                        <div className="muted pit-column-copy">{createdPits.length === 0 ? '新增留给后文回应的线索。' : `本章已埋 ${createdPits.length} 条，可继续补充。`}</div>
                        <div className="pit-card-list">
                          {createdPits.length === 0 && <div className="muted">当前还没有新增坑。</div>}
                          {createdPits.map((pit) => (
                            <PitPreviewCard
                              key={pit.id}
                              pit={pit}
                              secondaryLabel={`更新时间：${formatTime(pit.updated_at)}`}
                              onOpen={() => onOpenPitDetail(pit, 'chapter')}
                            />
                          ))}
                        </div>
                      </section>
                    </div>
                  </section>

                  <section className="section-card planning-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">章节规划层</div>
                        <h3>章节规划</h3>
                        <div className="muted">把前面整理出的角色、设定、引用和坑位，转化为当前章的写作目标。</div>
                      </div>
                    </div>

                    <div className="meta-row">
                      <span>当前项目：{selectedProject?.title ?? '未选择项目'}</span>
                      <span>章节序号：{currentChapter.index_no}</span>
                      <span>字数：{liveWordCount}</span>
                    </div>

                    <div className="field-block">
                      <div className="inline-field-header">
                        <span>章节标题</span>
                        <button type="button" onClick={() => void onGenerateChapterTitleAi()} disabled={generatingTitleAi || !canGenerateTitle}>
                          {generatingTitleAi ? '生成中...' : 'AI 生成标题'}
                        </button>
                      </div>
                      <input value={editor.title} onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))} onBlur={onFieldBlur} placeholder="本章标题" />
                    </div>

                    <div className="field-block">
                      <div className="inline-field-header">
                        <span>本章目标</span>
                        <button type="button" onClick={() => void onGenerateChapterGoalAi()} disabled={generatingGoalAi || !canGenerateGoal}>
                          {generatingGoalAi ? '生成中...' : 'AI 生成目标'}
                        </button>
                      </div>
                      <input
                        value={editor.goal}
                        onChange={(event) => setEditor((prev) => ({ ...prev, goal: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="这一章要推进的核心目标是什么？"
                      />
                    </div>

                    <div className="field-block">
                      <div className="inline-field-header">
                        <span>本章摘要</span>
                        <button type="button" onClick={() => void onGenerateOutlineAi()} disabled={generatingOutlineAi || !canExtractOutline}>
                          {generatingOutlineAi ? '更新中...' : 'AI 更新摘要'}
                        </button>
                      </div>
                      <textarea
                        className="planning-textarea"
                        value={editor.outlineUser}
                        onChange={(event) => setEditor((prev) => ({ ...prev, outlineUser: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="用你确认过的方式概括这一章，供 AI 续写与后续回顾参考。"
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

                  <section className="section-card ai-reference-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">AI参考层</div>
                        <h3>提示词上下文</h3>
                        <div className="muted">只读汇总当前规划、关联设定、历史章节引用，以及本章填坑 / 埋坑信息。</div>
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

          {workspaceView === 'pitOverview' && (
            <div className="workspace-stack">
              <div className="workspace-header">
                <div>
                  <h2>全部坑内容总览</h2>
                  <div className="muted">集中查看项目内全部坑，直接读取 StoryPit，不复制额外数据。</div>
                </div>
              </div>

              {!selectedProjectId && <div className="empty-state">请先选择项目后再查看全部坑内容总览。</div>}

              {selectedProjectId && (
                <section className="section-card overview-card">
                  <div className="section-header section-header-tight">
                    <div>
                      <div className="section-eyebrow">项目级管理</div>
                      <h3>全部坑内容</h3>
                      <div className="muted">按“章节坑 / 作者手动设定坑”拆开看，优先保证查阅效率，再进入详情编辑。</div>
                    </div>
                    <button type="button" onClick={() => onOpenManualPitComposer()}>
                      新增作者手动坑
                    </button>
                  </div>

                  {pitOverviewGrouped.chapterGroups.length === 0 && pitOverviewGrouped.manualPits.length === 0 && (
                    <div className="muted">当前项目还没有坑。</div>
                  )}

                  <div className="pit-overview-stack">
                    <section className="pit-overview-section">
                      <div className="inline-field-header">
                        <span>章节坑</span>
                        <span className="muted">按章节分组查看每章产生的坑</span>
                      </div>
                      <div className="pit-group-list">
                        {pitOverviewGrouped.chapterGroups.length === 0 && <div className="muted">当前项目还没有章节坑。</div>}
                        {pitOverviewGrouped.chapterGroups.map((group) => (
                          <section key={group.chapterId} className="pit-group-card">
                            <div className="pit-group-title">第 {group.index_no} 章《{group.title}》</div>
                            <div className="pit-card-list">
                              {group.pits.map((pit) => (
                                <PitPreviewCard
                                  key={pit.id}
                                  pit={pit}
                                  secondaryLabel={
                                    pit.status === 'resolved' && pit.resolved_in_chapter_index_no !== null
                                      ? `填于第 ${pit.resolved_in_chapter_index_no} 章`
                                      : '尚未填坑'
                                  }
                                  onOpen={() => onOpenPitDetail(pit, 'overview')}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </section>

                    <section className="pit-overview-section">
                      <div className="inline-field-header">
                        <span>作者手动设定坑</span>
                        <span className="muted">单独维护项目级人工坑，不与章节坑混排。</span>
                      </div>
                      <div className="pit-card-list">
                        {pitOverviewGrouped.manualPits.length === 0 && <div className="muted">当前项目还没有作者手动设定坑。</div>}
                        {pitOverviewGrouped.manualPits.map((pit) => (
                          <PitPreviewCard
                            key={pit.id}
                            pit={pit}
                            secondaryLabel={
                              pit.status === 'resolved' && pit.resolved_in_chapter_index_no !== null
                                ? `填于第 ${pit.resolved_in_chapter_index_no} 章`
                                : '尚未填坑'
                            }
                            onOpen={() => onOpenPitDetail(pit, 'overview')}
                          />
                        ))}
                      </div>
                    </section>
                  </div>
                </section>
              )}
            </div>
          )}

          {workspaceView === 'outlineOverview' && (
            <div className="workspace-stack">
              <div className="workspace-header">
                <div>
                  <h2>章节摘要总览</h2>
                  <div className="muted">按章节顺序集中查看本项目所有章节的本章摘要。数据直接来自 `Chapter.outline_user`。</div>
                </div>
              </div>

              {!selectedProjectId && <div className="empty-state">请先选择项目后再查看章节摘要总览。</div>}

              {selectedProjectId && (
                <section className="section-card overview-card">
                  <div className="section-header section-header-tight">
                    <div>
                      <div className="section-eyebrow">项目级查阅</div>
                      <h3>全部章节摘要</h3>
                    </div>
                  </div>

                  <div className="outline-overview-list">
                    {outlineOverviewItems.length === 0 && <div className="muted">当前项目还没有章节。</div>}
                    {outlineOverviewItems.map((item) => (
                      <div key={item.chapterId} className="outline-overview-item">
                        <div className="outline-overview-topline">
                          <strong>
                            第 {item.index_no} 章《{item.title}》
                          </strong>
                          <span className="muted">{formatTime(item.updated_at)}</span>
                        </div>
                        <div className="outline-overview-summary">{item.outline_user.trim() || '暂未填写摘要'}</div>
                      </div>
                    ))}
                  </div>
                </section>
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

      {outlineExtractCandidate && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="outline-extract-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">AI 更新摘要</div>
                <h3 id="outline-extract-title">候选摘要确认</h3>
                <div className="muted">
                  provider: {outlineExtractCandidate.provider}
                  {outlineExtractCandidate.model ? ` / ${outlineExtractCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <div className="compare-grid">
              <section className="compare-column">
                <div className="compare-title">当前本章摘要</div>
                <div className="compare-content">{outlineExtractCandidate.oldOutline.trim() || '暂未填写本章摘要'}</div>
              </section>

              <section className="compare-column candidate">
                <div className="compare-title">AI 新摘要</div>
                <div className="compare-content">{outlineExtractCandidate.newOutline}</div>
              </section>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">本次 AI 调用参考上下文</div>
              <div className="read-only-content compact-readonly">{outlineExtractCandidate.referenceText}</div>
            </section>

            <div className="actions">
              <button type="button" onClick={onCancelOutlineExtract} disabled={applyingOutlineCandidate}>
                取消
              </button>
              <button type="button" onClick={() => void onApplyOutlineExtract()} disabled={applyingOutlineCandidate}>
                {applyingOutlineCandidate ? '应用中...' : '应用到本章摘要'}
              </button>
            </div>
          </div>
        </div>
      )}
      {chapterFieldCandidate && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="field-candidate-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">AI 生成候选</div>
                <h3 id="field-candidate-title">{chapterFieldCandidate.field === 'title' ? '章节标题候选确认' : '本章目标候选确认'}</h3>
                <div className="muted">
                  provider: {chapterFieldCandidate.provider}
                  {chapterFieldCandidate.model ? ` / ${chapterFieldCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <div className="compare-grid">
              <section className="compare-column">
                <div className="compare-title">当前内容</div>
                <div className="compare-content">{chapterFieldCandidate.oldValue.trim() || '当前为空'}</div>
              </section>

              <section className="compare-column candidate">
                <div className="compare-title">AI 新候选</div>
                <div className="compare-content">{chapterFieldCandidate.newValue}</div>
              </section>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">本次 AI 调用参考上下文</div>
              <div className="read-only-content compact-readonly">{chapterFieldCandidate.referenceText}</div>
            </section>

            <div className="actions">
              <button type="button" onClick={onCancelChapterFieldCandidate} disabled={applyingChapterFieldCandidate}>
                取消
              </button>
              <button type="button" onClick={() => void onApplyChapterFieldCandidate()} disabled={applyingChapterFieldCandidate}>
                {applyingChapterFieldCandidate ? '应用中...' : `应用到${chapterFieldCandidate.field === 'title' ? '章节标题' : '本章目标'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitDetail && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="pit-detail-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">坑详情</div>
                <h3 id="pit-detail-title">查看与编辑坑内容</h3>
                <div className="muted">这里编辑的是项目里的全局坑内容，章节层和总览会一起更新。</div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">坑内容</div>
              <textarea
                className="planning-textarea"
                value={pitDetailDraft}
                onChange={(event) => setPitDetailDraft(event.target.value)}
                placeholder="填写完整坑内容"
              />
              <div className="meta-row">
                <span>来源类型：{buildPitSourceTypeLabel(pitDetail.pit)}</span>
                <span>来源：{buildPitOriginLabel(pitDetail.pit)}</span>
                <span>当前状态：{buildPitStatusLabel(pitDetail.pit)}</span>
                <span>更新时间：{formatTime(pitDetail.pit.updated_at)}</span>
              </div>
              {pitDetail.pit.resolved_in_chapter_index_no !== null && pitDetail.pit.resolved_in_chapter_title && (
                <div className="muted">填坑章节：第 {pitDetail.pit.resolved_in_chapter_index_no} 章《{pitDetail.pit.resolved_in_chapter_title}》</div>
              )}
            </section>

            <div className="actions">
              {pitDetail.pit.resolved_in_chapter_id === currentChapter?.id && (
                <button type="button" onClick={() => void onUnresolvePit(pitDetail.pit.id)} disabled={processingPitId === pitDetail.pit.id}>
                  {processingPitId === pitDetail.pit.id ? '处理中...' : '取消填坑'}
                </button>
              )}
              <button type="button" onClick={() => void onDeletePit(pitDetail.pit)} disabled={processingPitId === pitDetail.pit.id}>
                {processingPitId === pitDetail.pit.id ? '处理中...' : '删除'}
              </button>
              <button type="button" onClick={onClosePitDetail} disabled={processingPitId === pitDetail.pit.id}>
                关闭
              </button>
              <button type="button" onClick={() => void onSavePitDetail()} disabled={processingPitId === pitDetail.pit.id}>
                {processingPitId === pitDetail.pit.id ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitResolve && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="pit-resolve-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">填坑</div>
                <h3 id="pit-resolve-title">选择并确认本章填坑</h3>
                <div className="muted">只能从前文章节或作者手动设定的旧坑里选择。选中后可先微调内容，再确认在本章填上。</div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">可填的前文旧坑</div>
              {availablePits.length === 0 ? (
                <div className="muted">当前没有可供本章选择的前文旧坑。</div>
              ) : (
                <div className="pit-card-list">
                  {availablePits.map((pit) => (
                    <article key={pit.id} className={`pit-preview-card ${pitResolve.selectedPitId === pit.id ? 'selected' : ''}`}>
                      <div className="pit-preview-topline">
                        <span className={`status-pill ${pit.status === 'resolved' ? 'status-ready' : 'status-loading'}`}>{buildPitStatusLabel(pit)}</span>
                        <button type="button" className="token-action" onClick={() => onPickResolvablePit(pit)}>
                          选中并编辑
                        </button>
                      </div>
                      <div className="pit-preview-content">{pit.content}</div>
                      <div className="pit-preview-meta">
                        <span>来源：{buildPitOriginLabel(pit)}</span>
                        <span>{buildPitSourceTypeLabel(pit)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="section-card compact-card">
              <div className="section-heading">确认填坑内容</div>
              <textarea
                className="planning-textarea"
                value={pitResolve.draft}
                onChange={(event) =>
                  setPitResolve((prev) =>
                    prev
                      ? {
                          ...prev,
                          draft: event.target.value
                        }
                      : prev
                  )
                }
                placeholder="先从上方选中一条坑，再按需要微调内容"
              />
            </section>

            <div className="actions">
              <button type="button" onClick={onClosePitResolve} disabled={processingPitId !== null}>
                取消
              </button>
              <button type="button" onClick={() => void onResolvePit()} disabled={processingPitId !== null || !pitResolve.selectedPitId || !pitResolve.draft.trim()}>
                {processingPitId !== null && pitResolve.selectedPitId === processingPitId ? '确认中...' : '确认填坑'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitComposer && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="pit-composer-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">{pitComposer.scope === 'manual' ? '作者手动设定坑' : '新增坑'}</div>
                <h3 id="pit-composer-title">{pitComposer.scope === 'manual' ? '新增作者手动坑' : '新增本章坑'}</h3>
                <div className="muted">
                  {pitComposer.scope === 'manual'
                    ? '直接创建项目级人工坑。'
                    : 'AI 推荐只是新增时的参考来源；真正保存的仍然是统一的坑实体。'}
                </div>
              </div>
            </div>

            {pitComposer.scope === 'chapter' && (
              <section className="section-card compact-card">
                <div className="inline-field-header">
                  <div className="section-heading">AI 推荐候选</div>
                  <button type="button" onClick={() => void onRefreshPitSuggestions()} disabled={pitComposer.loadingSuggestions}>
                    {pitComposer.loadingSuggestions ? '生成中...' : '刷新候选'}
                  </button>
                </div>
                {pitComposer.provider && (
                  <div className="muted">
                    provider: {pitComposer.provider}
                    {pitComposer.model ? ` / ${pitComposer.model}` : ''}
                  </div>
                )}
                {pitComposer.loadingSuggestions && <div className="muted">正在根据当前正文、章节规划和 AI 参考上下文生成候选...</div>}
                {!pitComposer.loadingSuggestions && pitComposer.suggestionError && <div className="feedback-banner feedback-error">{pitComposer.suggestionError}</div>}
                {!pitComposer.loadingSuggestions && !pitComposer.suggestionError && pitComposer.suggestions.length === 0 && (
                  <div className="muted">当前没有可用候选，你仍然可以直接手动创建。</div>
                )}
                <div className="pit-card-list">
                  {pitComposer.suggestions.map((candidate, index) => (
                    <article key={`${pitComposer.chapterId}-${index}`} className={`pit-preview-card ${pitComposer.selectedSuggestion === candidate ? 'selected' : ''}`}>
                      <div className="pit-preview-topline">
                        <span className="status-chip status-ready">AI 推荐 {index + 1}</span>
                        <button type="button" className="token-action" onClick={() => onPickPitSuggestion(candidate)}>
                          采用为草稿
                        </button>
                      </div>
                      <div className="pit-preview-content">{candidate}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="section-card compact-card">
              <div className="section-heading">{pitComposer.scope === 'manual' ? '手动创建' : '创建内容'}</div>
              <textarea
                className="planning-textarea"
                value={pitComposer.draft}
                onChange={(event) =>
                  setPitComposer((prev) =>
                    prev
                      ? {
                          ...prev,
                          draft: event.target.value
                        }
                      : prev
                  )
                }
                placeholder={pitComposer.scope === 'manual' ? '直接输入作者手动设定的坑内容' : '可以直接手写，也可以先采用 AI 推荐后再微调'}
              />
            </section>

            {pitComposer.scope === 'chapter' && pitComposer.referenceText && (
              <section className="section-card compact-card">
                <div className="section-heading">本次 AI 调用参考上下文</div>
                <div className="read-only-content compact-readonly">{pitComposer.referenceText}</div>
              </section>
            )}

            <div className="actions">
              <button type="button" onClick={onClosePitComposer} disabled={processingPitId === 'pit-composer-submit'}>
                取消
              </button>
              <button type="button" onClick={() => void onSubmitPitComposer()} disabled={processingPitId === 'pit-composer-submit' || !pitComposer.draft.trim()}>
                {processingPitId === 'pit-composer-submit' ? '创建中...' : pitComposer.scope === 'manual' ? '创建作者手动坑' : '创建这条坑'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


