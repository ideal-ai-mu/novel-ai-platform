import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiGenerateChapterField,
  AiSuggestion,
  AiSuggestionStatus,
  AppInitData,
  AutosaveIntervalSeconds,
  ChapterContextRefMode,
  ChapterContextRefView,
  ChapterPitCandidate,
  ChapterPitCandidateStatus,
  ChapterPitReviewOutcome,
  ChapterPitReviewView,
  ChapterPitPlanView,
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
  planningClues: string[];
  foreshadowNotes: string[];
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
  promptText: string;
  referenceText: string;
};

type ChapterFieldCandidateState = {
  chapterId: string;
  field: AiGenerateChapterField;
  oldValue: string;
  newValue: string;
  provider: string;
  model: string | null;
  promptText: string;
  referenceText: string;
};

type PitResponseAiCandidateState = {
  chapterId: string;
  provider: string;
  model: string | null;
  promptText: string;
  referenceText: string;
  items: Array<{
    pitId: string;
    content: string;
    outcome: ChapterPitReviewOutcome;
    note: string;
  }>;
};

type PitCandidateAiCandidateState = {
  chapterId: string;
  provider: string;
  model: string | null;
  promptText: string;
  referenceText: string;
  existingItems: Array<{
    id: string;
    candidateId: string;
    content: string;
    status: ChapterPitCandidateStatus;
  }>;
  newItems: Array<{
    id: string;
    content: string;
    status: ChapterPitCandidateStatus;
  }>;
};

type DialogOffset = {
  x: number;
  y: number;
};

type DraggingDialogState = {
  kind: 'outline' | 'field' | 'pit';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
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

type PitCandidateDetailState = {
  candidate: ChapterPitCandidate;
};

type ForeshadowDetailState = {
  index: number;
};

type PitReviewDraftState = {
  outcome: ChapterPitReviewOutcome;
  note: string;
};

type PitCandidateReviewDraftState = {
  content: string;
  status: ChapterPitCandidateStatus;
};

type PitComposerScope = 'chapter' | 'manual';

type PitComposerState = {
  scope: PitComposerScope;
  projectId: string;
  chapterId: string | null;
  draft: string;
  promptText: string;
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
const DEFAULT_SUMMARY_EXTRACT_PROMPT = '请根据正文内容提取正文摘要。';
const DEFAULT_TITLE_GENERATION_PROMPT = '请基于当前提示词上下文生成一个简洁的章节标题。';
const DEFAULT_GOAL_GENERATION_PROMPT = '请基于当前提示词上下文生成一个清晰的本章目标。';
const DEFAULT_NEXT_HOOK_GENERATION_PROMPT = '请基于当前提示词上下文生成一个有牵引力的章末钩子。';
const DEFAULT_PIT_SUGGESTION_PROMPT = '请根据当前章节内容生成 2 到 4 条值得后续回应的线索或伏笔。';
const DEFAULT_PIT_RESPONSE_REVIEW_PROMPT = '请根据当前正文判断本章对这些旧坑的实际回应程度，并补一句简短说明。';
const DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT = '请根据当前正文判断这些本章伏笔是否真正成立，并补充正文中新出现的有效新坑候选。';
const RELATION_TONE_COUNT = 8;

const PIT_REVIEW_OUTCOME_LABELS: Record<ChapterPitReviewOutcome, string> = {
  none: '未回应',
  partial: '部分回应',
  clear: '明确回应',
  resolved: '完整填完'
};

const PIT_CANDIDATE_STATUS_LABELS: Record<ChapterPitCandidateStatus, string> = {
  draft: '未埋成',
  weak: '埋下但较弱',
  confirmed: '有效埋下',
  discarded: '放弃'
};

const PIT_REVIEW_OUTCOME_OPTIONS: Array<{ value: ChapterPitReviewOutcome; label: string }> = [
  { value: 'none', label: PIT_REVIEW_OUTCOME_LABELS.none },
  { value: 'partial', label: PIT_REVIEW_OUTCOME_LABELS.partial },
  { value: 'clear', label: PIT_REVIEW_OUTCOME_LABELS.clear },
  { value: 'resolved', label: PIT_REVIEW_OUTCOME_LABELS.resolved }
];

const PIT_CANDIDATE_STATUS_OPTIONS: Array<{ value: ChapterPitCandidateStatus; label: string }> = [
  { value: 'draft', label: PIT_CANDIDATE_STATUS_LABELS.draft },
  { value: 'weak', label: PIT_CANDIDATE_STATUS_LABELS.weak },
  { value: 'confirmed', label: PIT_CANDIDATE_STATUS_LABELS.confirmed },
  { value: 'discarded', label: PIT_CANDIDATE_STATUS_LABELS.discarded }
];

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
    planningClues: [],
    foreshadowNotes: [],
    nextHook: '',
    content: '',
    characterIds: [],
    loreEntryIds: []
  };
}

function equalsAsList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
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

function makeDraftItemId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
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
  switch (pit.progress_status) {
    case 'resolved':
      return pit.resolved_in_chapter_index_no !== null ? `完整填完 · 第 ${pit.resolved_in_chapter_index_no} 章` : '完整填完';
    case 'clear':
      return '明确回应';
    case 'partial':
      return '部分回应';
    default:
      return '未回应';
  }
}

function buildPitSourceTypeLabel(pit: StoryPitView): string {
  return pit.type === 'chapter' ? '章节坑' : '作者手动设定坑';
}

function buildPitReviewOutcomeLabel(outcome: ChapterPitReviewOutcome): string {
  return PIT_REVIEW_OUTCOME_LABELS[outcome];
}

function buildPitCandidateStatusLabel(status: ChapterPitCandidateStatus): string {
  return PIT_CANDIDATE_STATUS_LABELS[status];
}

function buildAiReferenceContext(
  editor: ChapterEditorState,
  linkedCharacters: Character[],
  linkedLoreEntries: LoreEntry[],
  contextRefs: ChapterContextRefView[],
  plannedPits: ChapterPitPlanView[],
  foreshadowNotes: string[],
  options: { omitGoal?: boolean } = {}
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

  const plannedPitLines =
    plannedPits.length > 0
      ? plannedPits.map((plan) => `- ${plan.pit.content}\n  来源：${buildPitOriginLabel(plan.pit)}`)
      : ['- 本章暂无线索'];

  const foreshadowLines =
    foreshadowNotes.length > 0
      ? foreshadowNotes.map((note) => `- ${note}`)
      : ['- 本章暂无伏笔'];

  const lines = [
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
    '【本章线索】',
    ...plannedPitLines,
    '',
    '【本章伏笔】',
    ...foreshadowLines
  ];

  if (!options.omitGoal) {
    lines.unshift('', editor.goal.trim() || '未填写本章目标');
    lines.unshift('【本章目标】');
  }

  return lines.join('\n');
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
      <span className={`status-pill pit-preview-status ${pit.progress_status === 'resolved' ? 'status-ready' : 'status-loading'}`}>{buildPitStatusLabel(pit)}</span>
      <div className="pit-preview-inline-content">{pit.content}</div>
      <button type="button" className="icon-button" onClick={onOpen} aria-label={`查看坑详情：${previewSummary}`} title={previewSummary}>
        ...
      </button>
    </article>
  );
}

function PitCandidatePreviewCard({
  candidate,
  isAiGenerated,
  onOpen
}: {
  candidate: ChapterPitCandidate;
  isAiGenerated: boolean;
  onOpen: () => void;
}) {
  const previewSummary = `埋坑确认｜${buildPitCandidateStatusLabel(candidate.status)}`;

  return (
    <article className="pit-preview-card pit-preview-card-inline" title={`${candidate.content}\n${previewSummary}`}>
      <span className={`status-pill pit-preview-status ${candidate.status === 'confirmed' ? 'status-ready' : 'status-loading'}`}>
        {buildPitCandidateStatusLabel(candidate.status)}
      </span>
      {isAiGenerated && <span className="status-pill status-ai pit-preview-status">AI</span>}
      <div className="pit-preview-inline-content">{candidate.content}</div>
      <button type="button" className="icon-button" onClick={onOpen} aria-label={`查看埋坑确认详情：${previewSummary}`} title={previewSummary}>
        ...
      </button>
    </article>
  );
}

function PitReviewPreviewCard({
  plan,
  review,
  onOpen
}: {
  plan: ChapterPitPlanView;
  review: ChapterPitReviewView | null;
  onOpen: () => void;
}) {
  const outcomeLabel = review ? buildPitReviewOutcomeLabel(review.outcome) : '待验收';
  const previewSummary = review
    ? `填坑总结｜${outcomeLabel}${review.note ? `｜${review.note}` : ''}`
    : '填坑总结｜待验收';

  return (
    <article className="pit-preview-card pit-preview-card-inline" title={`${plan.pit.content}\n${previewSummary}`}>
      <span className={`status-pill pit-preview-status ${review ? (review.outcome === 'resolved' ? 'status-ready' : review.outcome === 'none' ? 'status-loading' : 'status-info') : 'status-muted'}`}>
        {outcomeLabel}
      </span>
      <div className="pit-preview-inline-content">{plan.pit.content}</div>
      <button type="button" className="icon-button" onClick={onOpen} aria-label={`查看填坑总结详情：${previewSummary}`} title={previewSummary}>
        ...
      </button>
    </article>
  );
}

function PlanningPreviewCard({
  label,
  content,
  hint,
  onOpen
}: {
  label: string;
  content: string;
  hint?: string;
  onOpen: () => void;
}) {
  const previewSummary = hint ? `${label}｜${hint}` : label;

  return (
    <article className="pit-preview-card pit-preview-card-inline" title={`${content}\n${previewSummary}`}>
      <span className="status-pill status-muted pit-preview-status">{label}</span>
      <div className="pit-preview-inline-content">{content}</div>
      <button type="button" className="icon-button" onClick={onOpen} aria-label={`查看详情：${previewSummary}`} title={previewSummary}>
        ...
      </button>
    </article>
  );
}

function pickRandomRelationTone(): number {
  return Math.floor(Math.random() * RELATION_TONE_COUNT);
}

function buildEditorState(chapter: Chapter, refs: ChapterRefs | null): ChapterEditorState {
  return {
    title: chapter.title,
    goal: chapter.goal,
    outlineUser: chapter.outline_user,
    planningClues: chapter.planning_clues_json,
    foreshadowNotes: chapter.foreshadow_notes_json,
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
  if (!equalsAsList(editor.planningClues, chapter.planning_clues_json)) return true;
  if (!equalsAsList(editor.foreshadowNotes, chapter.foreshadow_notes_json)) return true;
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
  const [outlineExtractDraft, setOutlineExtractDraft] = useState('');
  const [applyingOutlineCandidate, setApplyingOutlineCandidate] = useState(false);
  const [generatingTitleAi, setGeneratingTitleAi] = useState(false);
  const [generatingGoalAi, setGeneratingGoalAi] = useState(false);
  const [chapterFieldCandidate, setChapterFieldCandidate] = useState<ChapterFieldCandidateState | null>(null);
  const [applyingChapterFieldCandidate, setApplyingChapterFieldCandidate] = useState(false);
  const [pitResponseAiCandidate, setPitResponseAiCandidate] = useState<PitResponseAiCandidateState | null>(null);
  const [pitCandidateAiCandidate, setPitCandidateAiCandidate] = useState<PitCandidateAiCandidateState | null>(null);
  const [contentPreview, setContentPreview] = useState<{ title: string; content: string } | null>(null);
  const [generatingPitResponseAi, setGeneratingPitResponseAi] = useState(false);
  const [applyingPitResponseAi, setApplyingPitResponseAi] = useState(false);
  const [generatingPitCandidateAi, setGeneratingPitCandidateAi] = useState(false);
  const [applyingPitCandidateAi, setApplyingPitCandidateAi] = useState(false);
  const [processingPitId, setProcessingPitId] = useState<string | null>(null);
  const [processingSuggestionId, setProcessingSuggestionId] = useState<string | null>(null);
  const [pendingCharacterId, setPendingCharacterId] = useState('');
  const [pendingLoreEntryId, setPendingLoreEntryId] = useState('');
  const [pendingContextRefChapterId, setPendingContextRefChapterId] = useState('');
  const [pendingContextRefMode, setPendingContextRefMode] = useState<ContextRefAddMode>('manual');
  const [pitDetail, setPitDetail] = useState<PitDetailState | null>(null);
  const [pitDetailDraft, setPitDetailDraft] = useState('');
  const [pitCandidateDetail, setPitCandidateDetail] = useState<PitCandidateDetailState | null>(null);
  const [pitCandidateDetailDraft, setPitCandidateDetailDraft] = useState('');
  const [foreshadowDetail, setForeshadowDetail] = useState<ForeshadowDetailState | null>(null);
  const [foreshadowDetailDraft, setForeshadowDetailDraft] = useState('');
  const [pitResolve, setPitResolve] = useState<PitResolveState | null>(null);
  const [pitComposer, setPitComposer] = useState<PitComposerState | null>(null);
  const [pitReviewDrafts, setPitReviewDrafts] = useState<Record<string, PitReviewDraftState>>({});
  const [pitCandidateReviewDrafts, setPitCandidateReviewDrafts] = useState<Record<string, PitCandidateReviewDraftState>>({});
  const [aiGeneratedPitCandidateIds, setAiGeneratedPitCandidateIds] = useState<Record<string, true>>({});
  const [pitResponsePromptDraft, setPitResponsePromptDraft] = useState(DEFAULT_PIT_RESPONSE_REVIEW_PROMPT);
  const [pitCandidatePromptDraft, setPitCandidatePromptDraft] = useState(DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT);
  const [relationCardTones, setRelationCardTones] = useState<Record<string, number>>({});

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
  const [outlineOverviewDrafts, setOutlineOverviewDrafts] = useState<Record<string, string>>({});
  const [savingOutlineOverviewIds, setSavingOutlineOverviewIds] = useState<string[]>([]);
  const [pitOverviewGrouped, setPitOverviewGrouped] = useState<PitGroupedByProjectResult>({ chapterGroups: [], manualPits: [] });
  const [plannedPits, setPlannedPits] = useState<ChapterPitPlanView[]>([]);
  const [pitReviews, setPitReviews] = useState<ChapterPitReviewView[]>([]);
  const [pitCandidates, setPitCandidates] = useState<ChapterPitCandidate[]>([]);
  const [availablePits, setAvailablePits] = useState<StoryPitView[]>([]);

  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [draggingDivider, setDraggingDivider] = useState<DraggingDivider>(null);
  const [outlineDialogOffset, setOutlineDialogOffset] = useState<DialogOffset>({ x: 0, y: 0 });
  const [fieldDialogOffset, setFieldDialogOffset] = useState<DialogOffset>({ x: 0, y: 0 });
  const [pitDialogOffset, setPitDialogOffset] = useState<DialogOffset>({ x: 0, y: 0 });
  const [draggingDialog, setDraggingDialog] = useState<DraggingDialogState | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);

  const currentChapterRef = useRef<Chapter | null>(null);
  const currentRefsRef = useRef<ChapterRefs | null>(null);
  const editorRef = useRef<ChapterEditorState>(defaultEditorState());
  const selectedProjectIdRef = useRef<string | null>(null);
  const outlineOverviewItemsRef = useRef<ChapterOutlineOverviewItem[]>([]);
  const outlineOverviewDraftsRef = useRef<Record<string, string>>({});
  const outlineOverviewSavePromisesRef = useRef<Record<string, Promise<boolean>>>({});
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

  useEffect(() => {
    outlineOverviewItemsRef.current = outlineOverviewItems;
  }, [outlineOverviewItems]);

  useEffect(() => {
    outlineOverviewDraftsRef.current = outlineOverviewDrafts;
  }, [outlineOverviewDrafts]);

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

  useEffect(() => {
    const keys = [
      ...linkedCharacters.map((character) => `character:${character.id}`),
      ...linkedLoreEntries.map((entry) => `lore:${entry.id}`)
    ];
    setRelationCardTones((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const key of keys) {
        if (prev[key] !== undefined) {
          next[key] = prev[key];
        } else {
          next[key] = pickRandomRelationTone();
          changed = true;
        }
      }
      if (!changed && Object.keys(prev).length === keys.length) {
        return prev;
      }
      return next;
    });
  }, [linkedCharacters, linkedLoreEntries]);
  const canExtractOutline = useMemo(
    () => Boolean(editor.content.trim()),
    [editor.content]
  );
  const canReviewPitResponsesAi = useMemo(
    () => Boolean(editor.content.trim() && plannedPits.length > 0),
    [editor.content, plannedPits.length]
  );
  const canReviewPitCandidatesAi = useMemo(
    () => Boolean(editor.content.trim()),
    [editor.content]
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
          editor.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0 ||
          plannedPits.length > 0 ||
          editor.foreshadowNotes.length > 0
      ),
    [contextRefs.length, editor.foreshadowNotes.length, editor.goal, editor.nextHook, linkedCharacters.length, linkedLoreEntries.length, plannedPits.length]
  );
  const canGenerateTitle = hasPlanningAiContext;
  const canGenerateGoal = hasPlanningAiContext;
  const canGenerateNextHook = hasPlanningAiContext || Boolean(editor.content.trim() || pitReviews.length > 0);
  const canRequestPitSuggestions = useMemo(
    () =>
      Boolean(
        editor.content.trim() ||
          editor.title.trim() ||
          editor.goal.trim() ||
          editor.nextHook.trim() ||
          linkedCharacters.length > 0 ||
          linkedLoreEntries.length > 0 ||
          contextRefs.length > 0 ||
          plannedPits.length > 0 ||
          editor.foreshadowNotes.length > 0
      ),
      [
        contextRefs.length,
        editor.content,
        editor.foreshadowNotes.length,
        editor.goal,
        editor.nextHook,
        editor.title,
        linkedCharacters.length,
        linkedLoreEntries.length,
        plannedPits.length
      ]
  );
  const aiReferenceText = useMemo(
    () => buildAiReferenceContext(editor, linkedCharacters, linkedLoreEntries, contextRefs, plannedPits, editor.foreshadowNotes),
    [contextRefs, editor, linkedCharacters, linkedLoreEntries, plannedPits]
  );
  const goalGenerationReferenceText = useMemo(
    () => buildAiReferenceContext(editor, linkedCharacters, linkedLoreEntries, contextRefs, plannedPits, editor.foreshadowNotes, { omitGoal: true }),
    [contextRefs, editor, linkedCharacters, linkedLoreEntries, plannedPits]
  );
  const pitReviewByPitId = useMemo(() => new Map(pitReviews.map((review) => [review.pit_id, review])), [pitReviews]);
  const closureSummary = useMemo(() => {
    const reviewedCount = pitReviews.length;
    const pendingReviewCount = Math.max(0, plannedPits.length - reviewedCount);
    const confirmedCandidateCount = pitCandidates.filter((candidate) => candidate.status !== 'draft').length;
    const pendingCandidateCount = Math.max(0, pitCandidates.length - confirmedCandidateCount);
    return {
      hasOutline: Boolean(editor.outlineUser.trim()),
      reviewedCount,
      pendingReviewCount,
      confirmedCandidateCount,
      pendingCandidateCount
    };
  }, [editor.outlineUser, pitCandidates, pitReviews.length, plannedPits.length]);

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
  const syncCurrentChapterSummaryState = useCallback((updatedChapter: Chapter) => {
    if (currentChapterRef.current?.id !== updatedChapter.id) {
      return;
    }

    setCurrentChapter(updatedChapter);
    currentChapterRef.current = updatedChapter;
    setEditor((prev) => ({ ...prev, outlineUser: updatedChapter.outline_user }));
  }, []);

  const refreshCurrentContextRefsIfNeeded = useCallback(
    async (updatedChapterId: string) => {
      const api = resolveAppApi();
      const current = currentChapterRef.current;
      if (!api || !current || current.id === updatedChapterId) {
        return;
      }
      if (!contextRefs.some((item) => item.ref_chapter_id === updatedChapterId)) {
        return;
      }

      const result = await api.chapter.getContextRefs({ chapterId: current.id });
      if (result.ok) {
        setContextRefs(result.data);
      }
    },
    [contextRefs]
  );

  const saveOutlineOverviewItem = useCallback(
    async (chapterId: string, reason: 'blur' | 'timer' = 'blur'): Promise<boolean> => {
      const api = resolveAppApi();
      if (!api) {
        setFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return false;
      }

      const currentItem = outlineOverviewItemsRef.current.find((item) => item.chapterId === chapterId);
      if (!currentItem) {
        return true;
      }

      if (!Object.prototype.hasOwnProperty.call(outlineOverviewDraftsRef.current, chapterId)) {
        return true;
      }

      const draftValue = outlineOverviewDraftsRef.current[chapterId];
      if (draftValue === currentItem.outline_user) {
        setOutlineOverviewDrafts((prev) => {
          const next = { ...prev };
          delete next[chapterId];
          return next;
        });
        return true;
      }

      const pending = outlineOverviewSavePromisesRef.current[chapterId];
      if (pending) {
        return pending;
      }

      setSavingOutlineOverviewIds((prev) => (prev.includes(chapterId) ? prev : [...prev, chapterId]));
      const task = (async () => {
        const result = await api.chapter.update({
          chapterId,
          patch: {
            outline_user: draftValue
          }
        });

        if (!result.ok) {
          setFeedback(`保存章节摘要失败：${result.error.message}`);
          return false;
        }

        syncChapterList(result.data);
        syncOutlineOverviewItem(result.data);
        syncCurrentChapterSummaryState(result.data);
        await refreshCurrentContextRefsIfNeeded(chapterId);
        setOutlineOverviewDrafts((prev) => {
          const next = { ...prev };
          delete next[chapterId];
          return next;
        });
        setLastSavedAt(new Date().toISOString());
        setLastSaveWasTimer(reason === 'timer');
        return true;
      })().finally(() => {
        delete outlineOverviewSavePromisesRef.current[chapterId];
        setSavingOutlineOverviewIds((prev) => prev.filter((id) => id !== chapterId));
      });

      outlineOverviewSavePromisesRef.current[chapterId] = task;
      return task;
    },
    [refreshCurrentContextRefsIfNeeded, syncChapterList, syncCurrentChapterSummaryState, syncOutlineOverviewItem]
  );

  const saveDirtyOutlineOverviewDrafts = useCallback(
    async (reason: 'blur' | 'timer' = 'blur'): Promise<boolean> => {
      const dirtyIds = Object.keys(outlineOverviewDraftsRef.current);
      for (const chapterId of dirtyIds) {
        const saved = await saveOutlineOverviewItem(chapterId, reason);
        if (!saved) {
          return false;
        }
      }
      return true;
    },
    [saveOutlineOverviewItem]
  );

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

    const [plannedResult, reviewsResult, candidatesResult, availableResult] = await Promise.all([
      api.chapter.listPlannedPits({ chapterId }),
      api.chapter.listPitReviews({ chapterId }),
      api.chapter.listPitCandidates({ chapterId }),
      api.pit.listAvailableForChapter({ chapterId })
    ]);

    if (!plannedResult.ok) {
      setFeedback(`加载本章本章线索失败：${plannedResult.error.message}`);
      return false;
    }
    if (!reviewsResult.ok) {
      setFeedback(`加载本章填坑总结失败：${reviewsResult.error.message}`);
      return false;
    }
    if (!candidatesResult.ok) {
      setFeedback(`加载本章本章伏笔失败：${candidatesResult.error.message}`);
      return false;
    }
    if (!availableResult.ok) {
      setFeedback(`加载可本章线索列表失败：${availableResult.error.message}`);
      return false;
    }

    setPlannedPits(plannedResult.data);
    setPitReviews(reviewsResult.data);
    setPitCandidates(candidatesResult.data);
    setAvailablePits(availableResult.data);
    setPitReviewDrafts({});
    setPitCandidateReviewDrafts({});
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

    const [chapterResult, refsResult, contextRefsResult, suggestionsResult, plannedPitsResult, pitReviewsResult, pitCandidatesResult, availablePitsResult] = await Promise.all([
      api.chapter.get(chapterId),
      api.chapter.getRefs({ chapterId }),
      api.chapter.getContextRefs({ chapterId }),
      api.suggestion.listByEntity({ entityType: 'Chapter', entityId: chapterId }),
      api.chapter.listPlannedPits({ chapterId }),
      api.chapter.listPitReviews({ chapterId }),
      api.chapter.listPitCandidates({ chapterId }),
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
    if (!plannedPitsResult.ok) {
      setFeedback(`加载本章本章线索失败：${plannedPitsResult.error.message}`);
      return;
    }
    if (!pitReviewsResult.ok) {
      setFeedback(`加载本章填坑总结失败：${pitReviewsResult.error.message}`);
      return;
    }
    if (!pitCandidatesResult.ok) {
      setFeedback(`加载本章本章伏笔失败：${pitCandidatesResult.error.message}`);
      return;
    }
    if (!availablePitsResult.ok) {
      setFeedback(`加载可本章线索列表失败：${availablePitsResult.error.message}`);
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
    setPlannedPits(plannedPitsResult.data);
    setPitReviews(pitReviewsResult.data);
    setPitCandidates(pitCandidatesResult.data);
    setAvailablePits(availablePitsResult.data);
    setPendingCharacterId('');
    setPendingLoreEntryId('');
    setPendingContextRefChapterId('');
    setPendingContextRefMode('manual');
    setPitDetail(null);
    setPitDetailDraft('');
    setPitCandidateDetail(null);
    setPitCandidateDetailDraft('');
    setForeshadowDetail(null);
    setForeshadowDetailDraft('');
    setPitResolve(null);
    setPitComposer(null);
    setPitResponseAiCandidate(null);
    setPitCandidateAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });
    setPitReviewDrafts({});
    setPitCandidateReviewDrafts({});
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
            planning_clues_json: snapshot.planningClues,
            foreshadow_notes_json: snapshot.foreshadowNotes,
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
  }, [editor.foreshadowNotes.length, saveChapterDraft]);

  const selectProject = useCallback(
    async (projectId: string) => {
      if (projectId === selectedProjectIdRef.current) {
        return;
      }
      const overviewSaved = await saveDirtyOutlineOverviewDrafts('blur');
      if (!overviewSaved) {
        return;
      }
      const saved = await saveChapterDraft('switch');
      if (!saved) {
        return;
      }
      setSelectedProjectId(projectId);
    },
    [saveChapterDraft, saveDirtyOutlineOverviewDrafts]
  );

  const selectChapter = useCallback(
    async (chapterId: string) => {
      if (chapterId === selectedChapterId) {
        return;
      }
      const overviewSaved = await saveDirtyOutlineOverviewDrafts('blur');
      if (!overviewSaved) {
        return;
      }
      const saved = await saveChapterDraft('switch');
      if (!saved) {
        return;
      }
      setSelectedChapterId(chapterId);
    },
    [saveChapterDraft, saveDirtyOutlineOverviewDrafts, selectedChapterId]
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
    if (!draggingDialog) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextOffset = {
        x: draggingDialog.originX + (event.clientX - draggingDialog.startX),
        y: draggingDialog.originY + (event.clientY - draggingDialog.startY)
      };

      if (draggingDialog.kind === 'outline') {
        setOutlineDialogOffset(nextOffset);
        return;
      }

      if (draggingDialog.kind === 'field') {
        setFieldDialogOffset(nextOffset);
        return;
      }

      setPitDialogOffset(nextOffset);
    };

    const handleMouseUp = () => setDraggingDialog(null);

    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingDialog]);

  const onStartDialogDrag = useCallback(
    (kind: 'outline' | 'field' | 'pit', event: { clientX: number; clientY: number; preventDefault: () => void }) => {
      event.preventDefault();
      const origin =
        kind === 'outline' ? outlineDialogOffset : kind === 'field' ? fieldDialogOffset : pitDialogOffset;
      setDraggingDialog({
        kind,
        startX: event.clientX,
        startY: event.clientY,
        originX: origin.x,
        originY: origin.y
      });
    },
    [fieldDialogOffset, outlineDialogOffset, pitDialogOffset]
  );

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
      setOutlineExtractDraft('');
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
      setPlannedPits([]);
      setPitReviews([]);
      setPitCandidates([]);
      setAvailablePits([]);
      setChapterFieldCandidate(null);
      setPitDetail(null);
      setPitDetailDraft('');
      setPitCandidateDetail(null);
      setPitCandidateDetailDraft('');
      setPitComposer(null);
      setPitResolve(null);
      setSelectedCharacterId(null);
      setSelectedLoreEntryId(null);
      setCharacterForm(defaultCharacterForm());
      setLoreForm(defaultLoreForm());
      setOutlineOverviewDrafts({});
      setSavingOutlineOverviewIds([]);
      setPitReviewDrafts({});
      setPitCandidateReviewDrafts({});
      return;
    }

    setOutlineOverviewDrafts({});
    setSavingOutlineOverviewIds([]);

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
      setOutlineExtractDraft('');
      setCurrentChapter(null);
      setCurrentRefs(null);
      setContextRefs([]);
      setEditor(defaultEditorState());
      setSuggestions([]);
      setPlannedPits([]);
      setPitReviews([]);
      setPitCandidates([]);
      setAvailablePits([]);
      setChapterFieldCandidate(null);
      setPitDetail(null);
      setPitDetailDraft('');
      setPitCandidateDetail(null);
      setPitCandidateDetailDraft('');
      setPitResolve(null);
      setPitComposer(null);
      setPitReviewDrafts({});
      setPitCandidateReviewDrafts({});
      return;
    }

    void loadChapterWorkspace(selectedChapterId);
  }, [selectedChapterId, loadChapterWorkspace]);

  useEffect(() => {
    setOutlineExtractCandidate(null);
    setOutlineExtractDraft('');
    setOutlineDialogOffset({ x: 0, y: 0 });
    setChapterFieldCandidate(null);
    setFieldDialogOffset({ x: 0, y: 0 });
    setPitDialogOffset({ x: 0, y: 0 });
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
      void saveDirtyOutlineOverviewDrafts('timer');
    }, autosaveIntervalSeconds * 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [autosaveIntervalSeconds, saveChapterDraft, saveDirtyOutlineOverviewDrafts]);

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

  const onOpenOutlineExtractDialog = useCallback(() => {
    const chapter = currentChapterRef.current;
    if (!chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    if (!editorRef.current.content.trim()) {
      setFeedback('当前正文为空，暂时无法提取章节摘要。');
      return;
    }

    setOutlineDialogOffset({ x: 0, y: 0 });
    setOutlineExtractCandidate({
      chapterId: chapter.id,
      oldOutline: editorRef.current.outlineUser,
      newOutline: '',
      provider: '',
      model: null,
      promptText: DEFAULT_SUMMARY_EXTRACT_PROMPT,
      referenceText: editorRef.current.content.trim()
    });
    setOutlineExtractDraft('');
    setFeedback('已打开摘要提取弹窗。你可以先调整本次提示词，再点击弹窗内“AI 生成”。');
  }, []);

  const onGenerateOutlineAi = useCallback(async () => {
    const api = resolveAppApi();
    const candidate = outlineExtractCandidate;
    if (!api || !candidate) {
      return;
    }
    if (!editorRef.current.content.trim()) {
      setFeedback('当前正文为空，暂时无法提取章节摘要。');
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      return;
    }

    setGeneratingOutlineAi(true);
    const promptText = candidate.promptText.trim() || DEFAULT_SUMMARY_EXTRACT_PROMPT;
    const result = await api.ai.extractOutline({ chapterId: candidate.chapterId, promptText });
    setGeneratingOutlineAi(false);
    if (!result.ok) {
      setFeedback(`AI 提取摘要失败：${result.error.message}`);
      return;
    }

    const generatedOutline = result.data.candidateOutline.trim();
    if (!generatedOutline) {
      setFeedback('AI 提取摘要返回为空。');
      return;
    }

    setOutlineExtractCandidate((prev) =>
      prev && prev.chapterId === candidate.chapterId
        ? {
            ...prev,
            newOutline: generatedOutline,
            provider: result.data.provider,
            model: result.data.model,
            promptText,
            referenceText: result.data.referenceText
          }
        : prev
    );
    setOutlineExtractDraft(generatedOutline);
    setFeedback(`AI 已生成候选摘要（provider: ${result.data.provider}），请确认并决定是否应用。`);
  }, [outlineExtractCandidate, saveChapterDraft]);

  const onCancelOutlineExtract = useCallback(() => {
    setOutlineExtractCandidate(null);
    setOutlineExtractDraft('');
    setOutlineDialogOffset({ x: 0, y: 0 });
    setFeedback('已取消本次 AI 摘要应用。');
  }, []);

  const onApplyOutlineExtract = useCallback(async () => {
    const candidate = outlineExtractCandidate;
    if (!candidate) {
      return;
    }
    if (currentChapterRef.current?.id !== candidate.chapterId) {
      setFeedback('当前章节已切换，本次 AI 候选摘要已失效。');
      setOutlineExtractCandidate(null);
      setOutlineExtractDraft('');
      setOutlineDialogOffset({ x: 0, y: 0 });
      return;
    }

    const nextOutline = outlineExtractDraft.trim();
    if (!nextOutline) {
      setFeedback('候选摘要为空，无法应用。');
      return;
    }

    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      outlineUser: nextOutline
    };
    setApplyingOutlineCandidate(true);
    const applied = await saveChapterDraft('adopt_ai', nextEditor);
    setApplyingOutlineCandidate(false);
    if (!applied) {
      return;
    }

    setEditor(nextEditor);
    setOutlineExtractCandidate(null);
    setOutlineExtractDraft('');
    setOutlineDialogOffset({ x: 0, y: 0 });
    if (selectedProjectIdRef.current) {
      await loadChapters(selectedProjectIdRef.current);
      await loadOutlineOverview(selectedProjectIdRef.current);
    }
    setFeedback(`已应用 AI 候选摘要（provider: ${candidate.provider}），章节摘要已更新。`);
  }, [loadChapters, loadOutlineOverview, outlineExtractCandidate, outlineExtractDraft, saveChapterDraft]);
  const onOpenChapterFieldDialog = useCallback(
    (field: AiGenerateChapterField) => {
      const chapter = currentChapterRef.current;
      if (!chapter) {
        setFeedback('请先选择章节。');
        return;
      }
      if (field === 'title' && !canGenerateTitle) {
        setFeedback('当前上下文不足，暂时无法生成章节标题。');
        return;
      }
      if (field === 'goal' && !canGenerateGoal) {
        setFeedback('当前上下文不足，暂时无法生成本章目标。');
        return;
      }
      if (field === 'next_hook' && !canGenerateNextHook) {
        setFeedback('当前上下文不足，暂时无法生成章末钩子。');
        return;
      }

      setFieldDialogOffset({ x: 0, y: 0 });
      setChapterFieldCandidate({
        chapterId: chapter.id,
        field,
        oldValue: field === 'title' ? editorRef.current.title : field === 'goal' ? editorRef.current.goal : editorRef.current.nextHook,
        newValue: '',
        provider: '',
        model: null,
        promptText:
          field === 'title'
            ? DEFAULT_TITLE_GENERATION_PROMPT
            : field === 'goal'
              ? DEFAULT_GOAL_GENERATION_PROMPT
              : DEFAULT_NEXT_HOOK_GENERATION_PROMPT,
        referenceText: field === 'goal' ? goalGenerationReferenceText : aiReferenceText
      });
      setFeedback(`已打开${field === 'title' ? '章节标题' : field === 'goal' ? '本章目标' : '章末钩子'}生成弹窗。你可以先调整本次提示词，再点击弹窗内“AI 生成”。`);
    },
    [aiReferenceText, canGenerateGoal, canGenerateNextHook, canGenerateTitle, goalGenerationReferenceText]
  );

  const onGenerateChapterFieldAi = useCallback(async () => {
    const api = resolveAppApi();
    const candidate = chapterFieldCandidate;
    if (!api || !candidate) {
      return;
    }

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      return;
    }

    const promptText =
      candidate.promptText.trim() ||
      (candidate.field === 'title'
        ? DEFAULT_TITLE_GENERATION_PROMPT
        : candidate.field === 'goal'
          ? DEFAULT_GOAL_GENERATION_PROMPT
          : DEFAULT_NEXT_HOOK_GENERATION_PROMPT);

    if (candidate.field === 'title') {
      setGeneratingTitleAi(true);
      const result = await api.ai.generateChapterTitle({ chapterId: candidate.chapterId, promptText });
      setGeneratingTitleAi(false);
      if (!result.ok) {
        setFeedback(`AI 生成章节标题失败：${result.error.message}`);
        return;
      }

      setChapterFieldCandidate((prev) =>
        prev && prev.chapterId === candidate.chapterId && prev.field === 'title'
          ? {
              ...prev,
              oldValue: editorRef.current.title,
              newValue: result.data.candidateText,
              provider: result.data.provider,
              model: result.data.model,
              promptText,
              referenceText: result.data.referenceText
            }
          : prev
      );
      setFeedback(`AI 已生成章节标题候选（provider: ${result.data.provider}），请确认是否应用。`);
      return;
    }

    const aiCall =
      candidate.field === 'goal'
        ? api.ai.generateChapterGoal({ chapterId: candidate.chapterId, promptText })
        : api.ai.generateChapterNextHook({ chapterId: candidate.chapterId, promptText });
    setGeneratingGoalAi(true);
    const result = await aiCall;
    setGeneratingGoalAi(false);
    if (!result.ok) {
      setFeedback(`AI 生成${candidate.field === 'goal' ? '本章目标' : '章末钩子'}失败：${result.error.message}`);
      return;
    }

    setChapterFieldCandidate((prev) =>
      prev && prev.chapterId === candidate.chapterId && prev.field === candidate.field
        ? {
            ...prev,
            oldValue: candidate.field === 'goal' ? editorRef.current.goal : editorRef.current.nextHook,
            newValue: result.data.candidateText,
            provider: result.data.provider,
            model: result.data.model,
            promptText,
            referenceText: result.data.referenceText
          }
        : prev
    );
    setFeedback(`AI 已生成${candidate.field === 'goal' ? '本章目标' : '章末钩子'}候选（provider: ${result.data.provider}），请确认是否应用。`);
  }, [chapterFieldCandidate, saveChapterDraft]);

  const onCancelChapterFieldCandidate = useCallback(() => {
    setChapterFieldCandidate(null);
    setFieldDialogOffset({ x: 0, y: 0 });
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

    const nextValue = candidate.newValue.trim();
    if (!nextValue) {
      setFeedback('候选内容为空，无法应用。');
      return;
    }

    const nextEditor: ChapterEditorState =
      candidate.field === 'title'
        ? { ...editorRef.current, title: nextValue }
        : candidate.field === 'goal'
          ? { ...editorRef.current, goal: nextValue }
          : { ...editorRef.current, nextHook: nextValue };

    setApplyingChapterFieldCandidate(true);
    const applied = await saveChapterDraft('adopt_ai', nextEditor);
    setApplyingChapterFieldCandidate(false);
    if (!applied) {
      return;
    }

    setEditor(nextEditor);
    setChapterFieldCandidate(null);
    setFieldDialogOffset({ x: 0, y: 0 });
    if (selectedProjectIdRef.current) {
      await loadChapters(selectedProjectIdRef.current);
      await loadOutlineOverview(selectedProjectIdRef.current);
    }
    setFeedback(`已应用 AI 生成的${candidate.field === 'title' ? '章节标题' : candidate.field === 'goal' ? '本章目标' : '章末钩子'}。`);
  }, [chapterFieldCandidate, loadChapters, loadOutlineOverview, saveChapterDraft]);

  const onOpenPitResponseAiDialog = useCallback(() => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    if (!canReviewPitResponsesAi) {
      setFeedback('当前需要有正文，且至少计划回应一条旧坑，才能 AI 总结填坑结果。');
      return;
    }

    setPitCandidateAiCandidate(null);
    setPitResponseAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });

    void (async () => {
      const saved = await saveChapterDraft('blur');
      if (!saved) {
        return;
      }

      setGeneratingPitResponseAi(true);
      const promptText = pitResponsePromptDraft.trim() || DEFAULT_PIT_RESPONSE_REVIEW_PROMPT;
      const result = await api.ai.reviewChapterPitResponses({
        chapterId: chapter.id,
        promptText
      });
      setGeneratingPitResponseAi(false);
      if (!result.ok) {
        setFeedback(`AI 总结填坑失败：${result.error.message}`);
        return;
      }

      setApplyingPitResponseAi(true);
      for (const item of result.data.items) {
        const applyResult = await api.chapter.reviewPitResponse({
          chapterId: chapter.id,
          pitId: item.pitId,
          outcome: item.outcome,
          note: item.note.trim() || null
        });
        if (!applyResult.ok) {
          setApplyingPitResponseAi(false);
          setFeedback(`应用填坑总结失败：${applyResult.error.message}`);
          return;
        }
      }
      setApplyingPitResponseAi(false);
      await refreshPitViews();
      setFeedback(`AI 总结填坑已完成并应用（${result.data.items.length} 条）。`);
    })();
  }, [canReviewPitResponsesAi, pitResponsePromptDraft, refreshPitViews, saveChapterDraft]);

  const onClosePitResponseAiDialog = useCallback(() => {
    setPitResponseAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });
  }, []);

  const onGeneratePitResponseAi = useCallback(async () => {
    const api = resolveAppApi();
    const candidate = pitResponseAiCandidate;
    if (!api || !candidate) {
      return;
    }
    const saved = await saveChapterDraft('blur');
    if (!saved) {
      return;
    }

    setGeneratingPitResponseAi(true);
    const promptText = candidate.promptText.trim() || DEFAULT_PIT_RESPONSE_REVIEW_PROMPT;
    const result = await api.ai.reviewChapterPitResponses({ chapterId: candidate.chapterId, promptText });
    setGeneratingPitResponseAi(false);
    if (!result.ok) {
      setFeedback(`AI 总结填坑失败：${result.error.message}`);
      return;
    }

    const contentByPitId = new Map(plannedPits.map((plan) => [plan.pit.id, plan.pit.content]));
    setPitResponseAiCandidate((prev) => {
      if (!prev || prev.chapterId !== candidate.chapterId) {
        return prev;
      }
      return {
        ...prev,
        provider: result.data.provider,
        model: result.data.model,
        promptText,
        referenceText: result.data.referenceText,
        items: result.data.items.map((item) => ({
          pitId: item.pitId,
          content: contentByPitId.get(item.pitId) ?? '',
          outcome: item.outcome,
          note: item.note
        }))
      };
    });
    setFeedback(`已生成 ${result.data.items.length} 条填坑总结候选。`);
  }, [pitResponseAiCandidate, plannedPits, saveChapterDraft]);

  const updatePitResponseAiItem = useCallback((pitId: string, patch: Partial<PitResponseAiCandidateState['items'][number]>) => {
    setPitResponseAiCandidate((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        items: prev.items.map((item) => (item.pitId === pitId ? { ...item, ...patch } : item))
      };
    });
  }, []);

  const onApplyPitResponseAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    const candidate = pitResponseAiCandidate;
    if (!api || !chapter || !candidate) {
      return;
    }

    setApplyingPitResponseAi(true);
    for (const item of candidate.items) {
      const result = await api.chapter.reviewPitResponse({
        chapterId: chapter.id,
        pitId: item.pitId,
        outcome: item.outcome,
        note: item.note.trim() || null
      });
      if (!result.ok) {
        setApplyingPitResponseAi(false);
        setFeedback(`应用填坑总结失败：${result.error.message}`);
        return;
      }
    }
    setApplyingPitResponseAi(false);
    setPitResponseAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });
    await refreshPitViews();
    setFeedback('已应用 AI 填坑总结候选。');
  }, [pitResponseAiCandidate, refreshPitViews]);

  const onOpenPitCandidateAiDialog = useCallback(() => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      setFeedback('请先选择章节。');
      return;
    }
    if (!canReviewPitCandidatesAi) {
      setFeedback('当前正文为空，暂时无法 AI 分析埋坑确认。');
      return;
    }

    setPitResponseAiCandidate(null);
    setPitCandidateAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });

    void (async () => {
      const saved = await saveChapterDraft('blur');
      if (!saved) {
        return;
      }

      const candidateByContent = new Map(
        pitCandidates
          .map((item) => [normalizeLine(item.content), item] as const)
          .filter(([content]) => content.length > 0)
      );

      const noteCandidateIds: string[] = [];
      for (const note of editorRef.current.foreshadowNotes.map((item) => normalizeLine(item)).filter((item) => item.length > 0)) {
        const existing = candidateByContent.get(note);
        if (existing) {
          noteCandidateIds.push(existing.id);
          continue;
        }
        const createResult = await api.chapter.createPitCandidateManual({
          chapterId: chapter.id,
          content: note
        });
        if (!createResult.ok) {
          setFeedback(`同步现有伏笔失败：${createResult.error.message}`);
          return;
        }
        candidateByContent.set(note, createResult.data);
        noteCandidateIds.push(createResult.data.id);
      }

      setGeneratingPitCandidateAi(true);
      const promptText = pitCandidatePromptDraft.trim() || DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT;
      const result = await api.ai.reviewChapterPitCandidates({
        chapterId: chapter.id,
        promptText
      });
      setGeneratingPitCandidateAi(false);
      if (!result.ok) {
        setFeedback(`AI 分析埋坑确认失败：${result.error.message}`);
        return;
      }

      setApplyingPitCandidateAi(true);
      const aiCreatedCandidateIds: string[] = [];
      const reviewedIds = new Set<string>();
      const statusById = new Map(result.data.existingItems.map((item) => [item.candidateId, item.status] as const));

      for (const candidateId of noteCandidateIds) {
        const status = statusById.get(candidateId) ?? ('draft' as ChapterPitCandidateStatus);
        const reviewResult = await api.chapter.reviewPitCandidate({
          chapterId: chapter.id,
          candidateId,
          status
        });
        if (!reviewResult.ok) {
          setApplyingPitCandidateAi(false);
          setFeedback(`应用埋坑确认失败：${reviewResult.error.message}`);
          return;
        }
        reviewedIds.add(candidateId);
      }

      for (const item of result.data.existingItems) {
        if (reviewedIds.has(item.candidateId)) {
          continue;
        }
        const reviewResult = await api.chapter.reviewPitCandidate({
          chapterId: chapter.id,
          candidateId: item.candidateId,
          status: item.status
        });
        if (!reviewResult.ok) {
          setApplyingPitCandidateAi(false);
          setFeedback(`应用埋坑确认失败：${reviewResult.error.message}`);
          return;
        }
      }

      for (const item of result.data.newItems) {
        const content = normalizeLine(item.content);
        if (!content || item.status === 'discarded') {
          continue;
        }

        const existing = candidateByContent.get(content);
        if (existing) {
          if (item.status !== 'draft') {
            const reviewResult = await api.chapter.reviewPitCandidate({
              chapterId: chapter.id,
              candidateId: existing.id,
              status: item.status
            });
            if (!reviewResult.ok) {
              setApplyingPitCandidateAi(false);
              setFeedback(`应用新增埋坑确认失败：${reviewResult.error.message}`);
              return;
            }
          }
          continue;
        }

        const createResult = await api.chapter.createPitCandidateManual({
          chapterId: chapter.id,
          content
        });
        if (!createResult.ok) {
          setApplyingPitCandidateAi(false);
          setFeedback(`创建新埋坑候选失败：${createResult.error.message}`);
          return;
        }
        candidateByContent.set(content, createResult.data);
        aiCreatedCandidateIds.push(createResult.data.id);

        if (item.status !== 'draft') {
          const reviewResult = await api.chapter.reviewPitCandidate({
            chapterId: chapter.id,
            candidateId: createResult.data.id,
            status: item.status
          });
          if (!reviewResult.ok) {
            setApplyingPitCandidateAi(false);
            setFeedback(`保存新埋坑确认失败：${reviewResult.error.message}`);
            return;
          }
        }
      }

      setApplyingPitCandidateAi(false);
      if (aiCreatedCandidateIds.length > 0) {
        setAiGeneratedPitCandidateIds((prev) => {
          const next = { ...prev };
          for (const id of aiCreatedCandidateIds) {
            next[id] = true;
          }
          return next;
        });
      }
      await refreshPitViews();
      setFeedback(
        `AI 分析埋坑已完成并应用（现有${result.data.existingItems.length}条，新增${result.data.newItems.length}条）。`
      );
    })();
  }, [canReviewPitCandidatesAi, pitCandidatePromptDraft, pitCandidates, refreshPitViews, saveChapterDraft]);

  const onClosePitCandidateAiDialog = useCallback(() => {
    setPitCandidateAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });
  }, []);

  const onGeneratePitCandidateAi = useCallback(async () => {
    const api = resolveAppApi();
    const candidate = pitCandidateAiCandidate;
    if (!api || !candidate) {
      return;
    }
    const saved = await saveChapterDraft('blur');
    if (!saved) {
      return;
    }

    setGeneratingPitCandidateAi(true);
    const promptText = candidate.promptText.trim() || DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT;
    let ensuredExistingItems = candidate.existingItems;
    for (const item of candidate.existingItems) {
      if (item.candidateId || !item.content.trim()) {
        continue;
      }
      const createResult = await api.chapter.createPitCandidateManual({
        chapterId: candidate.chapterId,
        content: item.content.trim()
      });
      if (!createResult.ok) {
        setGeneratingPitCandidateAi(false);
        setFeedback(`同步现有伏笔失败：${createResult.error.message}`);
        return;
      }
      ensuredExistingItems = ensuredExistingItems.map((existingItem) =>
        existingItem.id === item.id
          ? {
              ...existingItem,
              candidateId: createResult.data.id
            }
          : existingItem
      );
    }

    const result = await api.ai.reviewChapterPitCandidates({ chapterId: candidate.chapterId, promptText });
    setGeneratingPitCandidateAi(false);
    if (!result.ok) {
      setFeedback(`AI 分析埋坑确认失败：${result.error.message}`);
      return;
    }

    const statusByCandidateId = new Map(result.data.existingItems.map((item) => [item.candidateId, item.status] as const));
    setPitCandidateAiCandidate((prev) => {
      if (!prev || prev.chapterId !== candidate.chapterId) {
        return prev;
      }
      return {
        ...prev,
        provider: result.data.provider,
        model: result.data.model,
        promptText,
        referenceText: result.data.referenceText,
        existingItems: ensuredExistingItems.map((item) => ({
          ...item,
          status: item.candidateId ? statusByCandidateId.get(item.candidateId) ?? item.status : item.status
        })),
        newItems: (() => {
          const existing = prev.newItems;
          const merged = [
            ...result.data.newItems.map((item) => ({
              id: makeDraftItemId('new-pit-candidate'),
              content: item.content,
              status: item.status
            })),
            ...existing
          ];
          const seen = new Set<string>();
          return merged.filter((item) => {
            const key = item.content.trim();
            if (!key || seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          });
        })()
      };
    });
    setFeedback(`已生成 ${result.data.existingItems.length} 条候选确认与 ${result.data.newItems.length} 条新坑建议。`);
  }, [pitCandidateAiCandidate, saveChapterDraft]);

  const updatePitCandidateAiExistingItem = useCallback(
    (itemId: string, patch: Partial<PitCandidateAiCandidateState['existingItems'][number]>) => {
      setPitCandidateAiCandidate((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          existingItems: prev.existingItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
        };
      });
    },
    []
  );

  const updatePitCandidateAiNewItem = useCallback(
    (id: string, patch: Partial<PitCandidateAiCandidateState['newItems'][number]>) => {
      setPitCandidateAiCandidate((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          newItems: prev.newItems.map((item) => (item.id === id ? { ...item, ...patch } : item))
        };
      });
    },
    []
  );

  const onApplyPitCandidateAi = useCallback(async () => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    const candidate = pitCandidateAiCandidate;
    if (!api || !chapter || !candidate) {
      return;
    }

    setApplyingPitCandidateAi(true);
    for (const item of candidate.existingItems) {
      let candidateId = item.candidateId;
      if (!candidateId) {
        const createResult = await api.chapter.createPitCandidateManual({
          chapterId: chapter.id,
          content: item.content.trim()
        });
        if (!createResult.ok) {
          setApplyingPitCandidateAi(false);
          setFeedback(`同步现有伏笔失败：${createResult.error.message}`);
          return;
        }
        candidateId = createResult.data.id;
      }

      const result = await api.chapter.reviewPitCandidate({
        chapterId: chapter.id,
        candidateId,
        status: item.status
      });
      if (!result.ok) {
        setApplyingPitCandidateAi(false);
        setFeedback(`应用埋坑确认失败：${result.error.message}`);
        return;
      }
    }

    for (const item of candidate.newItems) {
      const content = item.content.trim();
      if (!content || item.status === 'discarded') {
        continue;
      }

      const createResult = await api.chapter.createPitCandidateManual({
        chapterId: chapter.id,
        content
      });
      if (!createResult.ok) {
        setApplyingPitCandidateAi(false);
        setFeedback(`创建新埋坑候选失败：${createResult.error.message}`);
        return;
      }

      if (item.status !== 'draft') {
        const reviewResult = await api.chapter.reviewPitCandidate({
          chapterId: chapter.id,
          candidateId: createResult.data.id,
          status: item.status
        });
        if (!reviewResult.ok) {
          setApplyingPitCandidateAi(false);
          setFeedback(`保存新埋坑确认失败：${reviewResult.error.message}`);
          return;
        }
      }
    }

    setApplyingPitCandidateAi(false);
    setPitCandidateAiCandidate(null);
    setPitDialogOffset({ x: 0, y: 0 });
    await refreshPitViews();
    setFeedback('已应用 AI 埋坑确认结果。');
  }, [pitCandidateAiCandidate, refreshPitViews]);

  const getPitReviewDraft = useCallback(
    (pitId: string): PitReviewDraftState => {
      const draft = pitReviewDrafts[pitId];
      if (draft) {
        return draft;
      }
      const review = pitReviewByPitId.get(pitId);
      return {
        outcome: review?.outcome ?? 'none',
        note: review?.note ?? ''
      };
    },
    [pitReviewByPitId, pitReviewDrafts]
  );

  const updatePitReviewDraft = useCallback((pitId: string, patch: Partial<PitReviewDraftState>) => {
    setPitReviewDrafts((prev) => {
      const current = prev[pitId] ?? { outcome: pitReviewByPitId.get(pitId)?.outcome ?? 'none', note: pitReviewByPitId.get(pitId)?.note ?? '' };
      return {
        ...prev,
        [pitId]: {
          ...current,
          ...patch
        }
      };
    });
  }, [pitReviewByPitId]);

  const getPitCandidateReviewDraft = useCallback(
    (candidate: ChapterPitCandidate): PitCandidateReviewDraftState => {
      return (
        pitCandidateReviewDrafts[candidate.id] ?? {
          content: candidate.content,
          status: candidate.status
        }
      );
    },
    [pitCandidateReviewDrafts]
  );

  const updatePitCandidateReviewDraft = useCallback((candidateId: string, patch: Partial<PitCandidateReviewDraftState>) => {
    setPitCandidateReviewDrafts((prev) => {
      const current = prev[candidateId] ?? { content: '', status: 'draft' as ChapterPitCandidateStatus };
      return {
        ...prev,
        [candidateId]: {
          ...current,
          ...patch
        }
      };
    });
  }, []);

  const onOpenPitDetail = useCallback((pit: StoryPitView, context: 'chapter' | 'overview') => {
    setPitDetail({ pit, context });
    setPitDetailDraft(pit.content);
  }, []);

  const onClosePitDetail = useCallback(() => {
    setPitDetail(null);
    setPitDetailDraft('');
  }, []);

  const onOpenPitCandidateDetail = useCallback((candidate: ChapterPitCandidate) => {
    setPitCandidateDetail({ candidate });
    setPitCandidateDetailDraft(candidate.content);
  }, []);

  const onClosePitCandidateDetail = useCallback(() => {
    setPitCandidateDetail(null);
    setPitCandidateDetailDraft('');
  }, []);

  const onOpenForeshadowDetail = useCallback((index: number) => {
    const notes = editorRef.current.foreshadowNotes;
    if (index < 0 || index >= notes.length) {
      return;
    }
    setForeshadowDetail({ index });
    setForeshadowDetailDraft(notes[index]);
  }, []);

  const onCloseForeshadowDetail = useCallback(() => {
    setForeshadowDetail(null);
    setForeshadowDetailDraft('');
  }, []);

  const onOpenChapterPitComposer = useCallback(async () => {
    const chapter = currentChapterRef.current;
    const projectId = selectedProjectIdRef.current;
    if (!chapter || !projectId) {
      setFeedback('请先选择章节。');
      return;
    }

    setPitDialogOffset({ x: 0, y: 0 });
    setPitComposer({
      scope: 'chapter',
      projectId,
      chapterId: chapter.id,
      draft: '',
      promptText: DEFAULT_PIT_SUGGESTION_PROMPT,
      selectedSuggestion: null,
      suggestions: [],
      loadingSuggestions: false,
      provider: null,
      model: null,
      referenceText: '',
      suggestionError: ''
    });

    if (!canRequestPitSuggestions) {
      setFeedback('已打开本章伏笔弹窗。当前上下文不足，暂时无法生成 AI 推荐候选；你仍然可以直接手动创建。');
      return;
    }
    setFeedback('已打开本章伏笔弹窗。你可以先调整本次提示词，再点击弹窗内“AI 生成”。');
  }, [canRequestPitSuggestions]);

  const onRefreshPitSuggestions = useCallback(async () => {
    const api = resolveAppApi();
    const composer = pitComposer;
    if (!api || !composer || composer.scope !== 'chapter' || !composer.chapterId) {
      return;
    }
    if (!canRequestPitSuggestions) {
      setFeedback('当前上下文不足，暂时无法生成本章伏笔。');
      return;
    }

    setPitComposer((prev) => (prev ? { ...prev, loadingSuggestions: true, suggestionError: '' } : prev));

    const initialSaved = await saveChapterDraft('blur');
    if (!initialSaved) {
      setPitComposer((prev) => (prev ? { ...prev, loadingSuggestions: false } : prev));
      return;
    }

    const promptText = composer.promptText.trim() || DEFAULT_PIT_SUGGESTION_PROMPT;
    const result = await api.chapter.getPitSuggestions({ chapterId: composer.chapterId, promptText });
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
        promptText,
        referenceText: result.data.referenceText,
        suggestionError: ''
      };
    });
    if (!result.ok) {
      setFeedback(`刷新本章伏笔失败：${result.error.message}`);
      return;
    }
    setFeedback(`已刷新 ${result.data.candidates.length} 条本章伏笔。`);
  }, [canRequestPitSuggestions, pitComposer, saveChapterDraft]);

  const onOpenManualPitComposer = useCallback(() => {
    const projectId = selectedProjectIdRef.current;
    if (!projectId) {
      setFeedback('请先选择项目。');
      return;
    }
    setPitDialogOffset({ x: 0, y: 0 });
    setPitComposer({
      scope: 'manual',
      projectId,
      chapterId: null,
      draft: '',
      promptText: '',
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
    setPitDialogOffset({ x: 0, y: 0 });
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
    if (!composer) {
      return;
    }

    const content = composer.draft.trim();
    if (!content) {
      setFeedback('请先填写坑内容。');
      return;
    }

    if (composer.scope === 'chapter') {
      const chapter = currentChapterRef.current;
      if (!chapter) {
        setFeedback('请先选择章节。');
        return;
      }
      const snapshot = editorRef.current;
      const nextNotes = [...snapshot.foreshadowNotes, content];
      const nextEditor: ChapterEditorState = {
        ...snapshot,
        foreshadowNotes: nextNotes
      };
      setEditor(nextEditor);
      editorRef.current = nextEditor;
      setPitComposer(null);
      const saved = await saveChapterDraft('pit', nextEditor);
      if (!saved) {
        setFeedback('保存本章伏笔失败。');
        return;
      }
      setFeedback('已新增本章伏笔。');
      return;
    }

    if (!api) {
      return;
    }

    setProcessingPitId('pit-composer-submit');
    const result = await api.pit.createManual({ projectId: composer.projectId, content });
    setProcessingPitId(null);

    if (!result.ok) {
      setFeedback(`创建坑失败：${result.error.message}`);
      return;
    }

    setPitComposer(null);
    await refreshPitViews();
    setFeedback('已新增作者手动设定坑。');
  }, [pitComposer, refreshPitViews, saveChapterDraft]);

  const onOpenPitResolve = useCallback(() => {
    const chapter = currentChapterRef.current;
    if (!chapter) {
      setFeedback('请先选择章节。');
      return;
    }

    if (availablePits.length === 0) {
      setFeedback('当前没有可供本章计划回应的前文旧坑。');
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

    const result = await api.chapter.planPitResponse({ chapterId: chapter.id, pitId: resolver.selectedPitId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`加入计划回应失败：${result.error.message}`);
      return;
    }

    setPitResolve(null);
    await refreshPitViews();
    setFeedback('已加入本章计划回应的坑。');
  }, [availablePits, pitResolve, refreshPitViews]);

  const onUnresolvePit = useCallback(async (pitId: string) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }

    setProcessingPitId(pitId);
    const result = await api.chapter.unplanPitResponse({ chapterId: chapter.id, pitId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`移出计划回应失败：${result.error.message}`);
      return;
    }

    if (pitDetail?.pit.id === pitId) {
      setPitDetail(null);
      setPitDetailDraft('');
    }
    await refreshPitViews();
    setFeedback('已移出本章计划回应。');
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

  const onSaveForeshadowDetail = useCallback(async () => {
    const detail = foreshadowDetail;
    if (!detail) {
      return;
    }
    const content = foreshadowDetailDraft.trim();
    if (!content) {
      setFeedback('本章伏笔内容不能为空。');
      return;
    }

    const snapshot = editorRef.current;
    if (detail.index < 0 || detail.index >= snapshot.foreshadowNotes.length) {
      return;
    }
    const nextNotes = [...snapshot.foreshadowNotes];
    nextNotes[detail.index] = content;
    const nextEditor: ChapterEditorState = {
      ...snapshot,
      foreshadowNotes: nextNotes
    };
    setEditor(nextEditor);
    editorRef.current = nextEditor;
    setForeshadowDetailDraft(content);
    const saved = await saveChapterDraft('pit', nextEditor);
    if (!saved) {
      setFeedback('保存本章伏笔失败。');
      return;
    }
    setFeedback('已保存本章伏笔。');
  }, [foreshadowDetail, foreshadowDetailDraft, saveChapterDraft]);

  const onDeleteForeshadowDetail = useCallback(async () => {
    const detail = foreshadowDetail;
    if (!detail) {
      return;
    }
    const snapshot = editorRef.current;
    if (detail.index < 0 || detail.index >= snapshot.foreshadowNotes.length) {
      return;
    }
    const nextNotes = snapshot.foreshadowNotes.filter((_, index) => index !== detail.index);
    const nextEditor: ChapterEditorState = {
      ...snapshot,
      foreshadowNotes: nextNotes
    };
    setEditor(nextEditor);
    editorRef.current = nextEditor;
    setForeshadowDetail(null);
    setForeshadowDetailDraft('');
    const saved = await saveChapterDraft('pit', nextEditor);
    if (!saved) {
      setFeedback('删除本章伏笔失败。');
      return;
    }
    setFeedback('已删除本章伏笔。');
  }, [foreshadowDetail, saveChapterDraft]);

  const onSavePitCandidateDetail = useCallback(async () => {
    const api = resolveAppApi();
    const detail = pitCandidateDetail;
    if (!api || !detail) {
      return;
    }
    const content = pitCandidateDetailDraft.trim();
    if (!content) {
      setFeedback('埋坑确认候选内容不能为空。');
      return;
    }

    setProcessingPitId(detail.candidate.id);
    const result = await api.chapter.updatePitCandidate({ candidateId: detail.candidate.id, patch: { content } });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`保存埋坑候选失败：${result.error.message}`);
      return;
    }

    setPitCandidateDetail({ candidate: result.data });
    setPitCandidateDetailDraft(result.data.content);
    setPitCandidateReviewDrafts((prev) => ({
      ...prev,
      [result.data.id]: {
        content: result.data.content,
        status: prev[result.data.id]?.status ?? result.data.status
      }
    }));
    await refreshPitViews();
    setFeedback('已保存埋坑候选。');
  }, [pitCandidateDetail, pitCandidateDetailDraft, refreshPitViews]);

  const onDeletePitCandidate = useCallback(async (candidateId: string) => {
    const api = resolveAppApi();
    if (!api) {
      return;
    }
    setProcessingPitId(candidateId);
    const result = await api.chapter.deletePitCandidate({ candidateId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`删除埋坑候选失败：${result.error.message}`);
      return;
    }

    if (pitCandidateDetail?.candidate.id === candidateId) {
      setPitCandidateDetail(null);
      setPitCandidateDetailDraft('');
    }
    setPitCandidateReviewDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, candidateId)) {
        return prev;
      }
      const next = { ...prev };
      delete next[candidateId];
      return next;
    });
    await refreshPitViews();
    setFeedback('已删除埋坑候选。');
  }, [pitCandidateDetail, refreshPitViews]);

  const onSavePitReview = useCallback(async (pitId: string) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }
    const draft = getPitReviewDraft(pitId);
    setProcessingPitId(pitId);
    const result = await api.chapter.reviewPitResponse({
      chapterId: chapter.id,
      pitId,
      outcome: draft.outcome,
      note: draft.note.trim() || null
    });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`保存填坑总结失败：${result.error.message}`);
      return;
    }
    setPitReviewDrafts((prev) => {
      const next = { ...prev };
      delete next[pitId];
      return next;
    });
    await refreshPitViews();
    setFeedback(`已更新填坑总结：${buildPitReviewOutcomeLabel(result.data.outcome)}。`);
  }, [getPitReviewDraft, refreshPitViews]);

  const onClearPitReview = useCallback(async (pitId: string) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }
    setProcessingPitId(pitId);
    const result = await api.chapter.clearPitReview({ chapterId: chapter.id, pitId });
    setProcessingPitId(null);
    if (!result.ok) {
      setFeedback(`清除填坑总结失败：${result.error.message}`);
      return;
    }
    setPitReviewDrafts((prev) => {
      const next = { ...prev };
      delete next[pitId];
      return next;
    });
    await refreshPitViews();
    setFeedback('已清除这条填坑总结。');
  }, [refreshPitViews]);

  const onSavePitCandidateReview = useCallback(async (candidate: ChapterPitCandidate) => {
    const api = resolveAppApi();
    const chapter = currentChapterRef.current;
    if (!api || !chapter) {
      return;
    }
    const draft = getPitCandidateReviewDraft(candidate);
    const content = draft.content.trim();
    if (!content) {
      setFeedback('埋坑候选内容不能为空。');
      return;
    }

    setProcessingPitId(candidate.id);
    if (content !== candidate.content) {
      const updateResult = await api.chapter.updatePitCandidate({ candidateId: candidate.id, patch: { content } });
      if (!updateResult.ok) {
        setProcessingPitId(null);
        setFeedback(`更新埋坑候选失败：${updateResult.error.message}`);
        return;
      }
    }

    const reviewResult = await api.chapter.reviewPitCandidate({
      chapterId: chapter.id,
      candidateId: candidate.id,
      status: draft.status
    });
    setProcessingPitId(null);
    if (!reviewResult.ok) {
      setFeedback(`保存埋坑确认失败：${reviewResult.error.message}`);
      return;
    }

    setPitCandidateReviewDrafts((prev) => {
      const next = { ...prev };
      delete next[candidate.id];
      return next;
    });
    if (pitCandidateDetail?.candidate.id === candidate.id) {
      setPitCandidateDetail({ candidate: reviewResult.data });
      setPitCandidateDetailDraft(reviewResult.data.content);
    }
    await refreshPitViews();
    setFeedback(`已更新埋坑确认：${buildPitCandidateStatusLabel(reviewResult.data.status)}。`);
  }, [getPitCandidateReviewDraft, pitCandidateDetail, refreshPitViews]);

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

  const onAddCharacterLink = useCallback(async (characterId?: string) => {
    const nextCharacterId = (characterId ?? pendingCharacterId).trim();
    if (!nextCharacterId) {
      return;
    }
    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      characterIds: uniqueSorted([...editorRef.current.characterIds, nextCharacterId])
    };
    setEditor(nextEditor);
    setPendingCharacterId('');
    await saveChapterDraft('relation', nextEditor);
  }, [pendingCharacterId, saveChapterDraft]);

  const onRemoveCharacterLink = useCallback(async (characterId: string) => {
    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      characterIds: editorRef.current.characterIds.filter((id) => id !== characterId)
    };
    setEditor(nextEditor);
    await saveChapterDraft('relation', nextEditor);
  }, [saveChapterDraft]);

  const onAddLoreLink = useCallback(async (loreEntryId?: string) => {
    const nextLoreEntryId = (loreEntryId ?? pendingLoreEntryId).trim();
    if (!nextLoreEntryId) {
      return;
    }
    const nextEditor: ChapterEditorState = {
      ...editorRef.current,
      loreEntryIds: uniqueSorted([...editorRef.current.loreEntryIds, nextLoreEntryId])
    };
    setEditor(nextEditor);
    setPendingLoreEntryId('');
    await saveChapterDraft('relation', nextEditor);
  }, [pendingLoreEntryId, saveChapterDraft]);

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
                        <div className="relation-title">
                          <span className="relation-title-main">已关联角色</span>
                          <select
                            className="relation-quick-select"
                            value={pendingCharacterId}
                            onChange={(event) => {
                              const value = event.target.value;
                              setPendingCharacterId(value);
                              if (value) {
                                void onAddCharacterLink(value);
                              }
                            }}
                          >
                            <option value="">添加角色</option>
                            {availableCharacters.map((character) => (
                              <option key={character.id} value={character.id}>
                                {character.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="relation-chip-grid">
                          {linkedCharacters.length === 0 && <div className="muted">当前未关联角色</div>}
                          {linkedCharacters.map((character) => (
                            <article
                              key={character.id}
                              className={`relation-mini-card tone-${relationCardTones[`character:${character.id}`] ?? 0}`}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setContentPreview({
                                  title: `角色：${character.name}`,
                                  content: [`名称：${character.name}`, `类型：${character.role_type || '未填写角色类型'}`, `摘要：${character.summary || '无'}`, `详情：${character.details || '无'}`].join('\n')
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setContentPreview({
                                    title: `角色：${character.name}`,
                                    content: [`名称：${character.name}`, `类型：${character.role_type || '未填写角色类型'}`, `摘要：${character.summary || '无'}`, `详情：${character.details || '无'}`].join('\n')
                                  });
                                }
                              }}
                            >
                              <button
                                type="button"
                                className="relation-mini-remove"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void onRemoveCharacterLink(character.id);
                                }}
                                aria-label={`移除角色：${character.name}`}
                                title="移除"
                              >
                                ×
                              </button>
                              <div className="relation-mini-name">{character.name}</div>
                            </article>
                          ))}
                        </div>
                      </section>

                      <section className="relation-column">
                        <div className="relation-title">
                          <span className="relation-title-main">已关联设定</span>
                          <select
                            className="relation-quick-select"
                            value={pendingLoreEntryId}
                            onChange={(event) => {
                              const value = event.target.value;
                              setPendingLoreEntryId(value);
                              if (value) {
                                void onAddLoreLink(value);
                              }
                            }}
                          >
                            <option value="">添加设定</option>
                            {availableLoreEntries.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="relation-chip-grid">
                          {linkedLoreEntries.length === 0 && <div className="muted">当前未关联设定</div>}
                          {linkedLoreEntries.map((entry) => (
                            <article
                              key={entry.id}
                              className={`relation-mini-card tone-${relationCardTones[`lore:${entry.id}`] ?? 0}`}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setContentPreview({
                                  title: `设定：${entry.title}`,
                                  content: [`标题：${entry.title}`, `类型：${entry.type || '未分类'}`, `摘要：${entry.summary || '无'}`, `内容：${entry.content || '无'}`].join('\n')
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setContentPreview({
                                    title: `设定：${entry.title}`,
                                    content: [`标题：${entry.title}`, `类型：${entry.type || '未分类'}`, `摘要：${entry.summary || '无'}`, `内容：${entry.content || '无'}`].join('\n')
                                  });
                                }
                              }}
                            >
                              <button
                                type="button"
                                className="relation-mini-remove"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void onRemoveLoreLink(entry.id);
                                }}
                                aria-label={`移除设定：${entry.title}`}
                                title="移除"
                              >
                                ×
                              </button>
                              <div className="relation-mini-name">{entry.title}</div>
                            </article>
                          ))}
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
                        <div className="muted">这里先定下本章要处理的线索与伏笔。正文后的实际回应结果与确认结果，统一放到收束层处理。</div>
                      </div>
                    </div>

                    <div className="pit-grid">
                      <section className="pit-column">
                        <div className="pit-column-header">
                          <span className="pit-column-title">本章线索</span>
                          <button type="button" onClick={onOpenPitResolve} disabled={!currentChapter || availablePits.length === 0}>
                            选择线索
                          </button>
                        </div>
                        <div className="muted pit-column-copy">
                          {plannedPits.length === 0 ? '选择前文线索，标记这章准备处理哪些内容。' : `本章已记录 ${plannedPits.length} 条线索，可继续补充。`}
                        </div>
                        <div className="pit-card-list">
                          {plannedPits.length === 0 && <div className="muted">当前还没有为本章记录线索。</div>}
                          {plannedPits.map((plan) => (
                            <PlanningPreviewCard
                              key={plan.id}
                              label="前文线索"
                              content={plan.pit.content}
                              hint={`来源：${buildPitOriginLabel(plan.pit)}`}
                              onOpen={() => onOpenPitDetail(plan.pit, 'chapter')}
                            />
                          ))}
                        </div>
                      </section>

                      <section className="pit-column">
                        <div className="pit-column-header">
                          <span className="pit-column-title">本章伏笔</span>
                          <button type="button" onClick={() => void onOpenChapterPitComposer()}>
                            新增伏笔
                          </button>
                        </div>
                        <div className="muted pit-column-copy">
                          {editor.foreshadowNotes.length === 0
                            ? '先列出这章准备埋下的伏笔，正文完成后再到收束层判断是否真正成立。'
                            : `本章已记录 ${editor.foreshadowNotes.length} 条伏笔，收束时再统一确认。`}
                        </div>
                        <div className="pit-card-list">
                          {editor.foreshadowNotes.length === 0 && <div className="muted">当前还没有为本章记录伏笔。</div>}
                          {editor.foreshadowNotes.map((note, index) => (
                            <PlanningPreviewCard key={`${index}-${note}`} label="本章伏笔" content={note} onOpen={() => onOpenForeshadowDetail(index)} />
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
                        <button type="button" onClick={() => onOpenChapterFieldDialog('title')} disabled={!canGenerateTitle}>
                          AI 生成标题
                        </button>
                      </div>
                      <input value={editor.title} onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))} onBlur={onFieldBlur} placeholder="本章标题" />
                    </div>

                    <div className="field-block">
                      <div className="inline-field-header">
                        <span>本章目标</span>
                        <button type="button" onClick={() => onOpenChapterFieldDialog('goal')} disabled={!canGenerateGoal}>
                          AI 生成目标
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
                        <span>章末钩子 / 下一章引子</span>
                        <button type="button" onClick={() => onOpenChapterFieldDialog('next_hook')} disabled={!canGenerateNextHook}>
                          AI 生成钩子
                        </button>
                      </div>
                      <input
                        value={editor.nextHook}
                        onChange={(event) => setEditor((prev) => ({ ...prev, nextHook: event.target.value }))}
                        onBlur={onFieldBlur}
                        placeholder="这一章结束时，要把读者带向哪里？"
                      />
                    </div>
                  </section>

                  <section className="section-card ai-reference-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">AI参考层</div>
                        <h3>提示词上下文</h3>
                        <div className="muted">只读汇总当前规划、关联设定、历史章节引用，以及本章线索 / 本章伏笔。</div>
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

                  <section className="section-card closure-card">
                    <div className="section-header section-header-tight">
                      <div>
                        <div className="section-eyebrow">本章收束 / 验收层</div>
                        <h3>写后验收</h3>
                        <div className="muted">正文写完后，在这里确认本章正式摘要、这章实际回应了哪些旧坑，以及哪些本章伏笔真正成立。</div>
                      </div>
                    </div>

                    <div className="closure-stack">
                      <section className="section-card compact-card">
                        <div className="section-heading">收束完成度</div>
                        <div className="closure-progress-grid">
                          <div className="closure-progress-card">
                            <div className="closure-progress-label">正式摘要</div>
                            <div className="closure-progress-value">{closureSummary.hasOutline ? '已存在' : '待补充'}</div>
                            <div className="muted">{closureSummary.hasOutline ? '本章正式摘要已可用于总览与引用。' : '建议在正文收束后补一版正式摘要。'}</div>
                          </div>
                          <div className="closure-progress-card">
                            <div className="closure-progress-label">填坑总结</div>
                            <div className="closure-progress-value">
                              {closureSummary.reviewedCount} / {plannedPits.length}
                            </div>
                            <div className="muted">
                              {closureSummary.pendingReviewCount > 0 ? `还有 ${closureSummary.pendingReviewCount} 条本章线索未验收。` : '本章线索已全部验收。'}
                            </div>
                          </div>
                          <div className="closure-progress-card">
                            <div className="closure-progress-label">埋坑确认</div>
                            <div className="closure-progress-value">
                              {closureSummary.confirmedCandidateCount} / {pitCandidates.length}
                            </div>
                            <div className="muted">
                              {closureSummary.pendingCandidateCount > 0 ? `还有 ${closureSummary.pendingCandidateCount} 条埋坑候选未确认。` : '埋坑候选已全部确认。'}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="section-card compact-card">
                        <div className="inline-field-header">
                          <span>本章正式摘要</span>
                          <button type="button" onClick={onOpenOutlineExtractDialog} disabled={!canExtractOutline}>
                            AI 提取摘要
                          </button>
                        </div>
                        <div className="muted">这里保存的是本章最终确认的正式摘要，可直接编辑并自动保存；AI 提取时只读取当前正文。</div>
                        <textarea
                          className="planning-textarea summary-textarea"
                          value={editor.outlineUser}
                          onChange={(event) => setEditor((prev) => ({ ...prev, outlineUser: event.target.value }))}
                          onBlur={onFieldBlur}
                          placeholder="本章正式摘要"
                        />
                      </section>

                      <section className="section-card compact-card">
                        <div className="inline-field-header">
                          <span>填坑总结</span>
                          <button type="button" onClick={onOpenPitResponseAiDialog} disabled={!canReviewPitResponsesAi || generatingPitResponseAi || applyingPitResponseAi}>
                            AI 总结填坑
                          </button>
                        </div>
                        <div className="muted">先看缩略卡片，点“...”再进入详情验收，避免把收束层铺成大表单。</div>
                        <div className="section-heading">本次提示词</div>
                        <input
                          className="summary-prompt-input"
                          value={pitResponsePromptDraft}
                          onChange={(event) => setPitResponsePromptDraft(event.target.value)}
                          placeholder={DEFAULT_PIT_RESPONSE_REVIEW_PROMPT}
                        />
                        <div className="muted">仅用于本次 AI 总结填坑，不会保存到项目数据。</div>
                        <div className="review-card-list">
                          {plannedPits.length === 0 && <div className="muted">当前没有计划回应的坑。</div>}
                          {plannedPits.map((plan) => {
                            const review = pitReviewByPitId.get(plan.pit.id) ?? null;
                            return (
                              <PitReviewPreviewCard key={plan.id} plan={plan} review={review} onOpen={() => onOpenPitDetail(plan.pit, 'chapter')} />
                            );
                          })}
                        </div>
                      </section>

                      <section className="section-card compact-card">
                        <div className="inline-field-header">
                          <span>埋坑确认</span>
                          <button type="button" onClick={onOpenPitCandidateAiDialog} disabled={!canReviewPitCandidatesAi || generatingPitCandidateAi || applyingPitCandidateAi}>
                            AI 分析埋坑
                          </button>
                        </div>
                        <div className="muted">默认只看缩略卡片。点“...”后，再进入详情页确认哪些候选真的在正文中成立。</div>
                        <div className="section-heading">本次提示词</div>
                        <input
                          className="summary-prompt-input"
                          value={pitCandidatePromptDraft}
                          onChange={(event) => setPitCandidatePromptDraft(event.target.value)}
                          placeholder={DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT}
                        />
                        <div className="muted">仅用于本次 AI 分析埋坑，不会保存到项目数据。</div>
                        <div className="review-card-list">
                          {pitCandidates.length === 0 && <div className="muted">当前没有埋坑确认候选。</div>}
                          {pitCandidates.map((candidate) => (
                            <PitCandidatePreviewCard
                              key={candidate.id}
                              candidate={candidate}
                              isAiGenerated={Boolean(aiGeneratedPitCandidateIds[candidate.id])}
                              onOpen={() => onOpenPitCandidateDetail(candidate)}
                            />
                          ))}
                        </div>
                      </section>
                    </div>
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
                                    pit.progress_status === 'resolved' && pit.resolved_in_chapter_index_no !== null
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
                              pit.progress_status === 'resolved' && pit.resolved_in_chapter_index_no !== null
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
                      <div className="muted">创建章节后会自动生成一版初始摘要；你也可以在这里直接改，并走自动保存。</div>
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
                          <span className="muted">
                            {savingOutlineOverviewIds.includes(item.chapterId)
                              ? '保存中...'
                              : Object.prototype.hasOwnProperty.call(outlineOverviewDrafts, item.chapterId)
                                ? '未保存'
                                : formatTime(item.updated_at)}
                          </span>
                        </div>
                        <textarea
                          className="outline-overview-editor"
                          value={Object.prototype.hasOwnProperty.call(outlineOverviewDrafts, item.chapterId) ? outlineOverviewDrafts[item.chapterId] : item.outline_user}
                          onChange={(event) =>
                            setOutlineOverviewDrafts((prev) => ({
                              ...prev,
                              [item.chapterId]: event.target.value
                            }))
                          }
                          onBlur={() => void saveOutlineOverviewItem(item.chapterId, 'blur')}
                          placeholder="输入或修改这一章的正式摘要。"
                        />
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
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outline-extract-title"
            style={{ transform: `translate(${outlineDialogOffset.x}px, ${outlineDialogOffset.y}px)` }}
          >
            <div className="section-header section-header-tight modal-drag-handle" onMouseDown={(event) => onStartDialogDrag('outline', event)}>
              <div>
                <div className="section-eyebrow">AI 提取摘要</div>
                <h3 id="outline-extract-title">候选摘要确认</h3>
                <div className="muted">
                  provider: {outlineExtractCandidate.provider || '尚未生成'}
                  {outlineExtractCandidate.model ? ` / ${outlineExtractCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="inline-field-header">
                <div className="section-heading">本次提示词</div>
                <button type="button" onClick={() => void onGenerateOutlineAi()} disabled={generatingOutlineAi}>
                  {generatingOutlineAi ? '生成中...' : 'AI 生成'}
                </button>
              </div>
              <input
                className="summary-prompt-input"
                value={outlineExtractCandidate.promptText}
                onChange={(event) =>
                  setOutlineExtractCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          promptText: event.target.value
                        }
                      : prev
                  )
                }
                placeholder={DEFAULT_SUMMARY_EXTRACT_PROMPT}
              />
              <div className="muted">提示词只作用于本次生成，不会保存到项目数据。</div>
            </section>

            <div className="compare-grid">
              <section className="compare-column">
                <div className="compare-title">本章摘要</div>
                <div className="compare-content">{outlineExtractCandidate.oldOutline.trim() || '当前还没有摘要'}</div>
              </section>

              <section className="compare-column candidate">
                <div className="compare-title">AI 候选摘要</div>
                <textarea
                  className="compare-edit-textarea"
                  value={outlineExtractDraft}
                  onChange={(event) => setOutlineExtractDraft(event.target.value)}
                  placeholder="你可以先微调这版候选摘要，再决定是否应用。"
                />
              </section>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">本次 AI 提取来源正文</div>
              <div className="read-only-content compact-readonly compact-readonly-preview" title={outlineExtractCandidate.referenceText}>
                {outlineExtractCandidate.referenceText}
              </div>
            </section>

            <div className="actions">
              <button type="button" onClick={onCancelOutlineExtract} disabled={applyingOutlineCandidate}>
                取消
              </button>
              <button type="button" onClick={() => void onApplyOutlineExtract()} disabled={applyingOutlineCandidate || !outlineExtractDraft.trim()}>
                {applyingOutlineCandidate ? '应用中...' : '应用到本章摘要'}
              </button>
            </div>
          </div>
        </div>
      )}
      {chapterFieldCandidate && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-candidate-title"
            style={{ transform: `translate(${fieldDialogOffset.x}px, ${fieldDialogOffset.y}px)` }}
          >
            <div className="section-header section-header-tight modal-drag-handle" onMouseDown={(event) => onStartDialogDrag('field', event)}>
              <div>
                <div className="section-eyebrow">AI 生成候选</div>
                <h3 id="field-candidate-title">
                  {chapterFieldCandidate.field === 'title'
                    ? '章节标题候选确认'
                    : chapterFieldCandidate.field === 'goal'
                      ? '本章目标候选确认'
                      : '章末钩子候选确认'}
                </h3>
                <div className="muted">
                  provider: {chapterFieldCandidate.provider || '尚未生成'}
                  {chapterFieldCandidate.model ? ` / ${chapterFieldCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="inline-field-header">
                <div className="section-heading">本次提示词</div>
                <button
                  type="button"
                  onClick={() => void onGenerateChapterFieldAi()}
                  disabled={chapterFieldCandidate.field === 'title' ? generatingTitleAi : generatingGoalAi}
                >
                  {chapterFieldCandidate.field === 'title'
                    ? generatingTitleAi
                      ? '生成中...'
                      : 'AI 生成'
                    : generatingGoalAi
                      ? '生成中...'
                      : 'AI 生成'}
                </button>
              </div>
              <input
                className="summary-prompt-input"
                value={chapterFieldCandidate.promptText}
                onChange={(event) =>
                  setChapterFieldCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          promptText: event.target.value
                        }
                      : prev
                  )
                }
                placeholder={
                  chapterFieldCandidate.field === 'title'
                    ? DEFAULT_TITLE_GENERATION_PROMPT
                    : chapterFieldCandidate.field === 'goal'
                      ? DEFAULT_GOAL_GENERATION_PROMPT
                      : DEFAULT_NEXT_HOOK_GENERATION_PROMPT
                }
              />
              <div className="muted">提示词只作用于本次生成，不会保存到项目数据。</div>
            </section>

            <div className="compare-grid">
              <section className="compare-column">
                <div className="compare-title">当前内容</div>
                <div className="compare-content">{chapterFieldCandidate.oldValue.trim() || '当前为空'}</div>
              </section>

              <section className="compare-column candidate">
                <div className="compare-title">AI 新候选</div>
                {chapterFieldCandidate.field === 'title' ? (
                  <input
                    value={chapterFieldCandidate.newValue}
                    onChange={(event) =>
                      setChapterFieldCandidate((prev) =>
                        prev
                          ? {
                              ...prev,
                              newValue: event.target.value
                            }
                          : prev
                      )
                    }
                    placeholder="点击上方“AI 生成”后，这里会出现候选标题。"
                  />
                ) : (
                  <textarea
                    className="compare-edit-textarea compare-edit-textarea-compact"
                    value={chapterFieldCandidate.newValue}
                    onChange={(event) =>
                      setChapterFieldCandidate((prev) =>
                        prev
                          ? {
                              ...prev,
                              newValue: event.target.value
                            }
                          : prev
                      )
                    }
                    placeholder={chapterFieldCandidate.field === 'goal' ? '点击上方“AI 生成”后，这里会出现候选目标。' : '点击上方“AI 生成”后，这里会出现候选章末钩子。'}
                  />
                )}
              </section>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">本次 AI 调用参考上下文</div>
              <div className="read-only-content compact-readonly compact-readonly-preview" title={chapterFieldCandidate.referenceText}>
                {chapterFieldCandidate.referenceText}
              </div>
            </section>

            <div className="actions">
              <button type="button" onClick={onCancelChapterFieldCandidate} disabled={applyingChapterFieldCandidate}>
                取消
              </button>
              <button
                type="button"
                onClick={() => void onApplyChapterFieldCandidate()}
                disabled={applyingChapterFieldCandidate || !chapterFieldCandidate.newValue.trim()}
              >
                {applyingChapterFieldCandidate
                  ? '应用中...'
                  : `应用到${
                      chapterFieldCandidate.field === 'title'
                        ? '章节标题'
                        : chapterFieldCandidate.field === 'goal'
                          ? '本章目标'
                          : '章末钩子'
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitResponseAiCandidate && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pit-response-ai-title"
            style={{ transform: `translate(${pitDialogOffset.x}px, ${pitDialogOffset.y}px)` }}
          >
            <div className="section-header section-header-tight modal-drag-handle" onMouseDown={(event) => onStartDialogDrag('pit', event)}>
              <div>
                <div className="section-eyebrow">AI 收束候选</div>
                <h3 id="pit-response-ai-title">填坑总结候选确认</h3>
                <div className="muted">
                  provider: {pitResponseAiCandidate.provider || '尚未生成'}
                  {pitResponseAiCandidate.model ? ` / ${pitResponseAiCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="inline-field-header">
                <div className="section-heading">本次提示词</div>
                <button type="button" onClick={() => void onGeneratePitResponseAi()} disabled={generatingPitResponseAi}>
                  {generatingPitResponseAi ? '生成中...' : 'AI 生成'}
                </button>
              </div>
              <input
                className="summary-prompt-input"
                value={pitResponseAiCandidate.promptText}
                onChange={(event) =>
                  setPitResponseAiCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          promptText: event.target.value
                        }
                      : prev
                  )
                }
                placeholder={DEFAULT_PIT_RESPONSE_REVIEW_PROMPT}
              />
              <div className="muted">提示词只作用于本次生成，不会保存到项目数据。</div>
            </section>

            <section className="section-card compact-card">
              <div className="section-heading">AI 填坑总结候选</div>
              <div className="review-card-list">
                {pitResponseAiCandidate.items.length === 0 && <div className="muted">点击上方“AI 生成”后，这里会出现逐条填坑总结候选。</div>}
                {pitResponseAiCandidate.items.map((item) => (
                  <article key={item.pitId} className="review-card">
                    <div className="review-card-inline-grid">
                      <span className={`status-pill pit-preview-status ${item.outcome === 'resolved' ? 'status-ready' : item.outcome === 'none' ? 'status-loading' : 'status-info'}`}>
                        {buildPitReviewOutcomeLabel(item.outcome)}
                      </span>
                      <div className="review-inline-content" title={item.content}>
                        {item.content}
                      </div>
                      <button
                        type="button"
                        className="icon-button review-inline-more"
                        onClick={() => setContentPreview({ title: '填坑候选完整内容', content: item.content })}
                        aria-label="查看这条填坑候选完整内容"
                        title="查看完整内容"
                      >
                        ...
                      </button>
                      <select
                        className="review-inline-select"
                        value={item.outcome}
                        onChange={(event) => updatePitResponseAiItem(item.pitId, { outcome: event.target.value as ChapterPitReviewOutcome })}
                      >
                        {PIT_REVIEW_OUTCOME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="review-inline-note">
                      <input
                        value={item.note}
                        onChange={(event) => updatePitResponseAiItem(item.pitId, { note: event.target.value })}
                        placeholder="补一条简短说明（可选）"
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="section-card compact-card">
              <div className="section-heading">本次 AI 分析来源正文</div>
              <div className="read-only-content compact-readonly compact-readonly-preview" title={pitResponseAiCandidate.referenceText}>
                {pitResponseAiCandidate.referenceText || '当前尚未生成参考预览。'}
              </div>
            </section>

            <div className="actions">
              <button type="button" onClick={onClosePitResponseAiDialog} disabled={applyingPitResponseAi}>
                取消
              </button>
              <button type="button" onClick={() => void onApplyPitResponseAi()} disabled={applyingPitResponseAi || pitResponseAiCandidate.items.length === 0}>
                {applyingPitResponseAi ? '应用中...' : '应用到填坑总结'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitCandidateAiCandidate && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pit-candidate-ai-title"
            style={{ transform: `translate(${pitDialogOffset.x}px, ${pitDialogOffset.y}px)` }}
          >
            <div className="section-header section-header-tight modal-drag-handle" onMouseDown={(event) => onStartDialogDrag('pit', event)}>
              <div>
                <div className="section-eyebrow">AI 收束候选</div>
                <h3 id="pit-candidate-ai-title">埋坑确认候选</h3>
                <div className="muted">
                  provider: {pitCandidateAiCandidate.provider || '尚未生成'}
                  {pitCandidateAiCandidate.model ? ` / ${pitCandidateAiCandidate.model}` : ''}
                </div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">本次提示词</div>
              <input
                className="summary-prompt-input"
                value={pitCandidateAiCandidate.promptText}
                onChange={(event) =>
                  setPitCandidateAiCandidate((prev) =>
                    prev
                      ? {
                          ...prev,
                          promptText: event.target.value
                        }
                      : prev
                  )
                }
                placeholder={DEFAULT_PIT_CANDIDATE_REVIEW_PROMPT}
              />
              <div className="muted">提示词只作用于本次生成，不会保存到项目数据。</div>
            </section>

            <section className="section-card compact-card">
              <div className="section-heading">AI来源正文</div>
              <div className="read-only-content compact-readonly compact-readonly-preview" title={pitCandidateAiCandidate.referenceText}>
                {pitCandidateAiCandidate.referenceText || '当前尚未生成正文预览。'}
              </div>
            </section>

            <section className="section-card compact-card">
              <div className="inline-field-header">
                <div className="section-heading">埋坑确认</div>
                <button type="button" onClick={() => void onGeneratePitCandidateAi()} disabled={generatingPitCandidateAi}>
                  {generatingPitCandidateAi ? '生成中...' : 'AI 生成'}
                </button>
              </div>
              <div className="muted">AI 会根据“本次提示词 + 正文”给出现有伏笔的埋下建议状态，并补充新的伏笔候选。</div>

              <div className="section-heading">现有伏笔</div>
              <div className="review-card-list">
                {pitCandidateAiCandidate.existingItems.length === 0 && <div className="muted">当前还没有可确认的现有伏笔。</div>}
                {pitCandidateAiCandidate.existingItems.map((item) => (
                  <article key={item.id} className="review-card review-card-inline-row">
                    <span className={`status-pill pit-preview-status ${item.status === 'confirmed' ? 'status-ready' : item.status === 'discarded' ? 'status-muted' : 'status-loading'}`}>
                      {buildPitCandidateStatusLabel(item.status)}
                    </span>
                    <div className="review-inline-content" title={item.content}>
                      {item.content}
                    </div>
                    <button
                      type="button"
                      className="icon-button review-inline-more"
                      onClick={() => {
                        setContentPreview({ title: '现有伏笔完整内容', content: item.content });
                      }}
                      aria-label="查看这条现有伏笔详情"
                      title="查看详情"
                    >
                      ...
                    </button>
                    <select
                      className="review-inline-select"
                      value={item.status}
                      onChange={(event) => updatePitCandidateAiExistingItem(item.id, { status: event.target.value as ChapterPitCandidateStatus })}
                    >
                      {PIT_CANDIDATE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>

              <div className="section-heading">AI生成伏笔</div>
              <div className="review-card-list">
                {pitCandidateAiCandidate.newItems.length === 0 && <div className="muted">AI 还没有给出新的伏笔候选。</div>}
                {pitCandidateAiCandidate.newItems.map((item) => (
                  <article key={item.id} className="review-card review-card-inline-row">
                    <span className={`status-pill pit-preview-status ${item.status === 'confirmed' ? 'status-ready' : item.status === 'discarded' ? 'status-muted' : 'status-loading'}`}>
                      {buildPitCandidateStatusLabel(item.status)}
                    </span>
                    <div className="review-inline-content" title={item.content}>
                      {item.content}
                    </div>
                    <button
                      type="button"
                      className="icon-button review-inline-more"
                      onClick={() => setContentPreview({ title: 'AI生成伏笔完整内容', content: item.content })}
                      aria-label="查看这条 AI 生成伏笔详情"
                      title="查看详情"
                    >
                      ...
                    </button>
                    <select
                      className="review-inline-select"
                      value={item.status}
                      onChange={(event) => updatePitCandidateAiNewItem(item.id, { status: event.target.value as ChapterPitCandidateStatus })}
                    >
                      {PIT_CANDIDATE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
            </section>

            <div className="actions">
              <button type="button" onClick={onClosePitCandidateAiDialog} disabled={applyingPitCandidateAi}>
                取消
              </button>
              <button type="button" onClick={() => void onApplyPitCandidateAi()} disabled={applyingPitCandidateAi}>
                {applyingPitCandidateAi ? '应用中...' : '应用到埋坑确认'}
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

            {plannedPits.some((plan) => plan.pit.id === pitDetail.pit.id) && (
              <section className="section-card compact-card">
                <div className="section-heading">本章填坑总结</div>
                <div className="muted">在这里判断本章对这条旧坑到底回应到了什么程度。</div>
                <div className="review-card-controls">
                  <select
                    value={getPitReviewDraft(pitDetail.pit.id).outcome}
                    onChange={(event) => updatePitReviewDraft(pitDetail.pit.id, { outcome: event.target.value as ChapterPitReviewOutcome })}
                  >
                    {PIT_REVIEW_OUTCOME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={getPitReviewDraft(pitDetail.pit.id).note}
                    onChange={(event) => updatePitReviewDraft(pitDetail.pit.id, { note: event.target.value })}
                    placeholder="补一条简短说明（可选）"
                  />
                </div>
                <div className="actions">
                  <button type="button" onClick={() => void onClearPitReview(pitDetail.pit.id)} disabled={processingPitId === pitDetail.pit.id}>
                    清空验收
                  </button>
                  <button type="button" onClick={() => void onSavePitReview(pitDetail.pit.id)} disabled={processingPitId === pitDetail.pit.id}>
                    {processingPitId === pitDetail.pit.id ? '保存中...' : '保存总结'}
                  </button>
                </div>
              </section>
            )}

            <div className="actions">
              {plannedPits.some((plan) => plan.pit.id === pitDetail.pit.id) && (
                <button type="button" onClick={() => void onUnresolvePit(pitDetail.pit.id)} disabled={processingPitId === pitDetail.pit.id}>
                  {processingPitId === pitDetail.pit.id ? '处理中...' : '移出计划回应'}
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

      {pitCandidateDetail && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="pit-candidate-detail-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">埋坑候选详情</div>
                <h3 id="pit-candidate-detail-title">查看与编辑埋坑确认候选</h3>
                <div className="muted">这里只编辑正文后的埋坑确认候选；正文前规划请在“本章伏笔”中维护。</div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">候选内容</div>
              <textarea
                className="planning-textarea"
                value={pitCandidateDetailDraft}
                onChange={(event) => setPitCandidateDetailDraft(event.target.value)}
                placeholder="填写完整埋坑确认候选内容"
              />
              <div className="meta-row">
                <span>当前状态：{buildPitCandidateStatusLabel(pitCandidateDetail.candidate.status)}</span>
                <span>更新时间：{formatTime(pitCandidateDetail.candidate.updated_at)}</span>
              </div>
            </section>

            <section className="section-card compact-card">
              <div className="section-heading">本章埋坑确认</div>
              <div className="muted">只有“有效埋下”才会转成正式章节坑并进入项目级坑位总览。</div>
              <div className="review-card-controls">
                <select
                  value={getPitCandidateReviewDraft(pitCandidateDetail.candidate).status}
                  onChange={(event) =>
                    updatePitCandidateReviewDraft(pitCandidateDetail.candidate.id, {
                      content: getPitCandidateReviewDraft(pitCandidateDetail.candidate).content,
                      status: event.target.value as ChapterPitCandidateStatus
                    })
                  }
                >
                  {PIT_CANDIDATE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="muted">当前候选会在保存确认时同步写回。</div>
              </div>
            </section>

            <div className="actions">
              <button type="button" onClick={() => void onDeletePitCandidate(pitCandidateDetail.candidate.id)} disabled={processingPitId === pitCandidateDetail.candidate.id}>
                {processingPitId === pitCandidateDetail.candidate.id ? '处理中...' : '删除候选'}
              </button>
              <button type="button" onClick={onClosePitCandidateDetail} disabled={processingPitId === pitCandidateDetail.candidate.id}>
                关闭
              </button>
              <button type="button" onClick={() => void onSavePitCandidateReview(pitCandidateDetail.candidate)} disabled={processingPitId === pitCandidateDetail.candidate.id}>
                {processingPitId === pitCandidateDetail.candidate.id ? '处理中...' : '保存确认'}
              </button>
              <button type="button" onClick={() => void onSavePitCandidateDetail()} disabled={processingPitId === pitCandidateDetail.candidate.id}>
                {processingPitId === pitCandidateDetail.candidate.id ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {contentPreview && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="content-preview-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">完整内容</div>
                <h3 id="content-preview-title">{contentPreview.title}</h3>
              </div>
            </div>

            <section className="section-card compact-card">
              <textarea className="planning-textarea" value={contentPreview.content} readOnly />
            </section>

            <div className="actions">
              <button type="button" onClick={() => setContentPreview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {foreshadowDetail && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="foreshadow-detail-title">
            <div className="section-header section-header-tight">
              <div>
                <div className="section-eyebrow">本章伏笔</div>
                <h3 id="foreshadow-detail-title">查看与编辑本章伏笔</h3>
                <div className="muted">这里只编辑正文前规划的本章伏笔，不等同于正文后的埋坑确认结果。</div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">伏笔内容</div>
              <textarea
                className="planning-textarea"
                value={foreshadowDetailDraft}
                onChange={(event) => setForeshadowDetailDraft(event.target.value)}
                placeholder="填写完整埋坑候选内容"
              />
            </section>

            <div className="actions">
              <button type="button" onClick={onDeleteForeshadowDetail}>
                删除
              </button>
              <button type="button" onClick={onCloseForeshadowDetail}>
                关闭
              </button>
              <button type="button" onClick={() => void onSaveForeshadowDetail()}>
                保存修改
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
                <div className="section-eyebrow">本章线索</div>
                <h3 id="pit-resolve-title">选择并确认本章准备处理的前文线索</h3>
                <div className="muted">只能从前文章节或作者手动设定的旧线索里选择。选中后可先微调内容，再加入本章线索列表。</div>
              </div>
            </div>

            <section className="section-card compact-card">
              <div className="section-heading">可加入本章的前文线索</div>
              {availablePits.length === 0 ? (
                <div className="muted">当前没有可供本章选择的前文线索。</div>
              ) : (
                <div className="pit-card-list">
                  {availablePits.map((pit) => (
                    <article key={pit.id} className={`pit-preview-card ${pitResolve.selectedPitId === pit.id ? 'selected' : ''}`}>
                      <div className="pit-preview-topline">
                        <span className={`status-pill ${pit.progress_status === 'resolved' ? 'status-ready' : 'status-loading'}`}>{buildPitStatusLabel(pit)}</span>
                        <button type="button" className="token-action" onClick={() => onPickResolvablePit(pit)}>
                          选中并微调
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
              <div className="section-heading">计划回应内容</div>
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
                {processingPitId !== null && pitResolve.selectedPitId === processingPitId ? '处理中...' : '加入计划回应'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pitComposer && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card modal-card-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pit-composer-title"
            style={{ transform: `translate(${pitDialogOffset.x}px, ${pitDialogOffset.y}px)` }}
          >
            <div className="section-header section-header-tight modal-drag-handle" onMouseDown={(event) => onStartDialogDrag('pit', event)}>
              <div>
                <div className="section-eyebrow">{pitComposer.scope === 'manual' ? '作者手动设定坑' : '新增本章伏笔'}</div>
                <h3 id="pit-composer-title">{pitComposer.scope === 'manual' ? '新增作者手动坑' : '新增本章伏笔'}</h3>
                <div className="muted">
                  {pitComposer.scope === 'manual'
                    ? '直接创建项目级人工坑。'
                    : '先记录本章准备埋下的伏笔，正文完成后再到收束层确认哪些真正成立。'}
                </div>
              </div>
            </div>

            {pitComposer.scope === 'chapter' && (
              <section className="section-card compact-card">
                <div className="inline-field-header">
                  <div className="section-heading">本次提示词</div>
                  <button type="button" onClick={() => void onRefreshPitSuggestions()} disabled={pitComposer.loadingSuggestions}>
                    {pitComposer.loadingSuggestions ? '生成中...' : 'AI 生成'}
                  </button>
                </div>
                <input
                  className="summary-prompt-input"
                  value={pitComposer.promptText}
                  onChange={(event) =>
                    setPitComposer((prev) =>
                      prev
                        ? {
                            ...prev,
                            promptText: event.target.value
                          }
                        : prev
                    )
                  }
                  placeholder={DEFAULT_PIT_SUGGESTION_PROMPT}
                />
                <div className="muted">提示词只作用于本次生成，不会保存到项目数据。</div>
                {pitComposer.provider && (
                  <div className="muted">
                    provider: {pitComposer.provider}
                    {pitComposer.model ? ` / ${pitComposer.model}` : ''}
                  </div>
                )}
                {pitComposer.loadingSuggestions && <div className="muted">正在根据当前章节内容生成新增坑候选...</div>}
                {!pitComposer.loadingSuggestions && pitComposer.suggestionError && <div className="feedback-banner feedback-error">{pitComposer.suggestionError}</div>}
                <div className="section-heading">AI 推荐候选</div>
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

            <div className="actions">
              <button type="button" onClick={onClosePitComposer} disabled={processingPitId === 'pit-composer-submit'}>
                取消
              </button>
              <button type="button" onClick={() => void onSubmitPitComposer()} disabled={processingPitId === 'pit-composer-submit' || !pitComposer.draft.trim()}>
                {processingPitId === 'pit-composer-submit' ? '创建中...' : pitComposer.scope === 'manual' ? '创建作者手动坑' : '创建这条候选'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






