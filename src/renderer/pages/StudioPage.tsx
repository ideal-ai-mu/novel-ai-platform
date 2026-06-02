import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookCopy,
  BookOpen,
  Eye,
  FileText,
  FilePlus2,
  LibraryBig,
  ListFilter,
  MapPin,
  MessageSquare,
  Network,
  Plus,
  Search,
  Send,
  Sparkles,
  Settings,
  ListTree,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { DEFAULT_AI_CHAT_SYSTEM_PROMPT, DEFAULT_AI_PROMPT_TEMPLATES } from '../../shared/ipc';
import type { AiChatMessage, AiPromptTemplates, AiProviderConfig, AiProviderConfigUpdateInput, Chapter, ChapterPitReviewOutcome, ChapterRelationshipGraph, ChapterRelationshipGraphLink, ChapterRelationshipGraphNode, ChapterRefs, Character, CharacterRelationshipEventView, CharacterRelationshipView, ChapterUpdatePatch, LoreEntry, NovelProject, PitUpdatePatch, ProjectUpdatePatch, StoryPitView, TimelineChapterSummaryView, TimelineCharacterStateDraft, TimelineCharacterStateView, TimelineEventDraft, TimelineEventView, TimelineForeshadowDraft, TimelineForeshadowView, TimelineLayerData, TimelineLayerDraft, TimelineStoryTimeDraft, TimelineStoryTimeView } from '../../shared/ipc';
import type { ChapterEditorState, StudioSidebarSection, StudioTab, WriterMode } from '../types';
import type { CodexEditorState, CodexEntry } from '../hooks/workspace/useCodexController';
import type { WritingAiActionResult } from '../hooks/workspace/useStudioController';
import { ManuscriptEditor } from '../components/ManuscriptEditor';
import type { ManuscriptCursorAnchor, ManuscriptEditorHandle } from '../components/ManuscriptEditor';
import {
  formatManuscriptParagraphs,
  getManuscriptParagraphs
} from '../utils/manuscriptFormat';

type RelationshipNodePointerEvent = {
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  currentTarget: HTMLButtonElement;
  pointerId: number;
  preventDefault: () => void;
};

type RelationshipGraphMode = 'library' | 'chapter';
type RelationshipGraphEntry = Pick<Character, 'id' | 'name' | 'role_type' | 'summary' | 'details'>;
type TimelineMode = 'storyTime' | 'chapterSummary' | 'events' | 'characterStates' | 'foreshadows';
type PlanSection = 'overview' | 'summaries' | 'plans' | 'foreshadows';
type ForeshadowFilter = 'all' | 'open' | 'active' | 'resolved';
type WritingPlanFilter = 'all' | 'open' | 'done';
type WritingRefMenuKind = 'library' | 'foreshadow' | 'plan';
type TimelineChapterSummaryDraft = {
  summary: string;
  confidence: number | null;
};
type TimelineForeshadowSyncDraft = {
  title: string;
  status: string;
  clue: string;
  payoff: string;
  summary: string;
  pitId: string;
  confidence: number | null;
};
type TimelineLayerParseResult = TimelineLayerDraft & {
  storyTime: TimelineStoryTimeDraft | null;
  chapterSummary: TimelineChapterSummaryDraft | null;
  foreshadowSync: TimelineForeshadowSyncDraft[];
};

type ChapterWrapUpParseResult = {
  plans: Array<{ index: number; status: 'open' | 'done'; reason: string }>;
  relationshipGraph: ChapterRelationshipGraph;
  characterUpdates: Array<{ characterName: string; details: string }>;
};

type ProofreadChange = {
  before: string;
  after: string;
  reason: string;
};

type ProofreadParseResult = {
  text: string;
  changes: ProofreadChange[];
};

const STORY_TIME_INFERENCE_PATTERN = /穿越|重生|回到|前世|今生|小时候|童年|少年|成年|第[一二三四五六七八九十\d]+天|当天|当晚|清晨|早晨|晨光|上午|中午|下午|傍晚|黄昏|夜晚|深夜|春天|夏天|秋天|冬天|年代|八十年代|九十年代|八九十年代|七十年代|六十年代|民国|古代|现代|岁/u;

const SIDEBAR_MIN_WIDTH = 336;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_COLLAPSED_WIDTH = 112;
const INSPECTOR_MIN_WIDTH = 240;
const INSPECTOR_MAX_WIDTH = 396;
const CHROME_WIDTH = 28;
const TIMELINE_SLOT_COUNT = 20;
const TIMELINE_STORY_TIME_REFERENCE_WINDOW = 5;
const TIMELINE_LAYER_REFERENCE_WINDOW = 10;
const TIMELINE_NEW_FORESHADOW_LIMIT = 3;
const TIMELINE_SLOT_POINTS: Array<{ x: number; y: number }> = [
  { x: 8, y: 20 },
  { x: 23.1, y: 16 },
  { x: 38.6, y: 14.5 },
  { x: 54.2, y: 15 },
  { x: 69.6, y: 17.5 },
  { x: 84.2, y: 23 },
  { x: 93.7, y: 34.8 },
  { x: 90.9, y: 49.6 },
  { x: 78.4, y: 58.6 },
  { x: 63, y: 60.8 },
  { x: 47.4, y: 59.6 },
  { x: 31.9, y: 58.4 },
  { x: 16.6, y: 61 },
  { x: 5.9, y: 71.8 },
  { x: 11.1, y: 85.2 },
  { x: 26.2, y: 87.8 },
  { x: 41.7, y: 85.7 },
  { x: 57.1, y: 83.5 },
  { x: 72.7, y: 83.1 },
  { x: 88, y: 86 }
];
const TIMELINE_WINDOW_SIZE = TIMELINE_SLOT_COUNT;
const TIMELINE_STORY_PATH =
  'M 8 20 C 28 12, 66 12, 86 24 C 99 34, 96 50, 82 57 C 62 68, 28 50, 12 64 C -1 74, 6 88, 22 88 C 40 88, 64 78, 88 86';
const CHAPTER_AI_WRAPUP_DONE_FIELD = 'ai.wrapup.done';

export type StudioPageProps = {
  activeProject: NovelProject;
  chapters: Chapter[];
  deletedChapters: Chapter[];
  characters: Character[];
  characterRelationships: CharacterRelationshipView[];
  timelineStoryTimes: TimelineStoryTimeView[];
  timelineChapterSummaries: TimelineChapterSummaryView[];
  timelineEvents: TimelineEventView[];
  timelineCharacterStates: TimelineCharacterStateView[];
  timelineForeshadows: TimelineForeshadowView[];
  storyPits: StoryPitView[];
  loreEntries: LoreEntry[];
  currentChapter: Chapter | null;
  chapterRefs: ChapterRefs | null;
  chapterRelationshipGraph: ChapterRelationshipGraph | null;
  currentChapterDisplayNumber: number | null;
  editor: ChapterEditorState;
  liveWordCount: number;
  chatThreadName: string;
  chatDraft: string;
  chatMessages: AiChatMessage[];
  chatModel: string;
  aiConfig: AiProviderConfig | null;
  aiConnections: AiProviderConfig[];
  activeAiConnectionId: string | null;
  aiSystemPrompt: string;
  aiPromptTemplates: AiPromptTemplates | null;
  chatSending: boolean;
  writerMode: WriterMode;
  saveStatusText: string;
  studioTab: StudioTab;
  sidebarSection: StudioSidebarSection;
  showCodexEditor: boolean;
  codexEditorState: CodexEditorState;
  formatTime: (value: string) => string;
  onBackHome: () => void;
  onUpdateProject: (patch: ProjectUpdatePatch) => Promise<NovelProject | null>;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: () => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
  onRestoreChapter: (chapterId: string, title: string) => void;
  onDeleteChapterPermanent: (chapterId: string, title: string) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onBlurSave: () => void;
  onChatThreadNameChange: (value: string) => void;
  onChatDraftChange: (value: string) => void;
  onChatModelChange: (value: string) => void;
  onLoadAiConfig: () => Promise<AiProviderConfig | null>;
  onUpdateAiConfig: (input: AiProviderConfigUpdateInput) => Promise<AiProviderConfig | null>;
  onDeleteAiConfig: (input: { id: string }) => Promise<AiProviderConfig | null>;
  onListAiModels: (input: { baseUrl: string; apiKey: string }) => Promise<string[]>;
  onUpdateChapterRefs: (input: { characterIds: string[]; loreEntryIds: string[] }) => Promise<ChapterRefs | null>;
  onUpdateChapterRelationshipGraph: (graph: ChapterRelationshipGraph) => Promise<ChapterRelationshipGraph | null>;
  onUpsertCharacterRelationship: (input: {
    projectId: string;
    characterAId: string;
    characterBId: string;
    label: string;
    chapterId?: string | null;
    summary?: string;
  }) => Promise<CharacterRelationshipView[]>;
  onReplaceChapterTimelineLayers: (data: TimelineLayerDraft) => Promise<TimelineLayerData | null>;
  onCreateForeshadowPit: (input: { content: string; note?: string | null }) => Promise<StoryPitView | null>;
  onUpdateForeshadowPit: (pitId: string, patch: PitUpdatePatch) => Promise<StoryPitView | null>;
  onDeleteForeshadowPit: (pitId: string) => Promise<boolean>;
  onCreateChapterForeshadowPit: (input: { content: string; note?: string | null }) => Promise<StoryPitView | null>;
  onRecordForeshadowResponse: (input: { pitId: string; outcome: ChapterPitReviewOutcome; note?: string | null }) => Promise<unknown>;
  onUpdateCurrentChapterPatch: (patch: ChapterUpdatePatch) => Promise<Chapter | null>;
  onRunWritingAi: (input: { instruction: string }) => Promise<WritingAiActionResult | null>;
  onFeedback: (message: string) => void;
  onSendChat: () => void;
  onNewChat: () => void;
  onSetStudioTab: (tab: StudioTab) => void;
  onSetSidebarSection: (section: StudioSidebarSection) => void;
  onOpenCodex: () => void;
  onOpenNewCodexEntry: (type: 'character' | 'lore', loreType?: string) => void;
  onOpenEditCodexEntry: (entry: CodexEntry) => void;
  onUpdateCharacterDetails: (characterId: string, details: string) => Promise<Character | null>;
  onDeleteCodexEntry: (entry: CodexEntry) => Promise<void>;
  onCloseCodexEditor: () => void;
  onSaveCodexEntry: () => Promise<void>;
  onUpdateCodexEditorField: <K extends keyof CodexEditorState>(field: K, value: CodexEditorState[K]) => void;
  onToggleWriterMode: () => void;
};

type StudioCodexKind = 'character' | 'location' | 'lore' | 'other';

const CODEX_KIND_OPTIONS: Array<{ value: StudioCodexKind; label: string; type: 'character' | 'lore'; icon: typeof UserRound }> = [
  { value: 'character', label: '人物', type: 'character', icon: UserRound },
  { value: 'location', label: '背景', type: 'lore', icon: MapPin },
  { value: 'lore', label: '设定', type: 'lore', icon: FileText },
  { value: 'other', label: '其他', type: 'lore', icon: LibraryBig }
];

const CHAT_MODEL_OPTIONS = [
  { value: 'gpt-5.4-mini', label: 'OpenAI GPT-5.4 mini' },
  { value: 'gpt-5.4', label: 'OpenAI GPT-5.4' },
  { value: 'gpt-4.1-mini', label: 'OpenAI GPT-4.1 mini' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
];

const NEW_AI_CONNECTION_DRAFT: AiProviderConfig = {
  id: '',
  providerType: 'openai-compatible',
  connectionName: 'OpenAI Compatible',
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  customModels: ''
};

const NEW_OPENAI_CONNECTION_DRAFT: AiProviderConfig = {
  id: '',
  providerType: 'openai',
  connectionName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: 'gpt-5.4-mini',
  customModels: 'gpt-5.4-mini\ngpt-5.4\ngpt-4.1-mini'
};

type WritingAiAction = 'continue' | 'rewrite' | 'polish' | 'generate' | 'inspiration';

const WRITING_AI_ACTIONS: Array<{ key: WritingAiAction; label: string; applyLabel: string; placeholder: string }> = [
  { key: 'continue', label: '续写', applyLabel: '插入锚点/追加', placeholder: '可选：写下接下来的发展方向、冲突、情绪或要出现的信息。' },
  { key: 'rewrite', label: '改写', applyLabel: '替换正文', placeholder: '可选：写下要改成什么风格、节奏、视角或重点。' },
  { key: 'polish', label: '润色', applyLabel: '替换正文', placeholder: '可选：写下润色方向，比如更细腻、更克制、更有画面感。' },
  { key: 'generate', label: '全章', applyLabel: '替换正文', placeholder: '可选：写下本章大致内容、关键场景、人物目标或结尾钩子。' },
  { key: 'inspiration', label: '灵感', applyLabel: '仅供参考', placeholder: '可选：写下卡住的位置、想要的情绪、冲突或接下来想解决的问题。' }
];

function getAiSettingsKey(config: AiProviderConfig): string {
  return JSON.stringify({
    id: config.id,
    providerType: config.providerType,
    connectionName: config.connectionName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    defaultModel: config.defaultModel,
    customModels: config.customModels
  });
}

function getAiPromptSettingsKey(input: { systemPrompt: string; promptTemplates: AiPromptTemplates }): string {
  return JSON.stringify(input);
}

function getCodexEditorKind(state: CodexEditorState): StudioCodexKind {
  if (state.type === 'character') {
    return 'character';
  }

  if (state.loreType === 'location' || state.loreType === 'lore') {
    return state.loreType;
  }

  return state.type === 'lore' ? 'other' : 'character';
}

function ResizableDivider({
  onResize,
  className = ''
}: {
  onResize: (delta: number) => void;
  className?: string;
}) {
  const pointerId = useRef<number | null>(null);
  const lastX = useRef(0);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const stopDragging = useCallback(() => {
    pointerId.current = null;
    document.body.classList.remove('st-resizing');
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (pointerId.current !== event.pointerId) {
      return;
    }

    const delta = event.clientX - lastX.current;
    lastX.current = event.clientX;
    onResizeRef.current(delta);
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      if (pointerId.current !== event.pointerId) {
        return;
      }

      stopDragging();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    },
    [handlePointerMove, stopDragging]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('st-resizing');
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={`st-divider ${className}`.trim()}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        pointerId.current = event.pointerId;
        lastX.current = event.clientX;
        document.body.classList.add('st-resizing');
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      }}
    />
  );
}

function OpenAiIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z"
      />
    </svg>
  );
}

function CompatibleAiIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 8.5h10" />
        <path d="M7 15.5h10" />
        <circle cx="5" cy="8.5" r="2" />
        <circle cx="19" cy="8.5" r="2" />
        <circle cx="5" cy="15.5" r="2" />
        <circle cx="19" cy="15.5" r="2" />
      </g>
    </svg>
  );
}

function AiProviderIcon({ providerType, size = 18 }: { providerType: AiProviderConfig['providerType']; size?: number }) {
  return providerType === 'openai' ? <OpenAiIcon size={size} /> : <CompatibleAiIcon size={size} />;
}

function getChapterTitle(chapter: Chapter, index: number): string {
  const title = chapter.title.trim();
  return title.length > 0 ? title : `第${index}章`;
}

function getStatusLabel(status: Chapter['status']): string {
  if (status === 'review') {
    return '审阅中';
  }
  if (status === 'final') {
    return '已定稿';
  }
  return '草稿';
}

function getForeshadowStatusLabel(pit: StoryPitView): string {
  if (pit.status === 'resolved' || pit.progress_status === 'resolved') {
    return '已回收';
  }
  if (pit.progress_status === 'clear') {
    return '已响应';
  }
  if (pit.progress_status === 'partial') {
    return '推进中';
  }
  return '未回收';
}

function getForeshadowStatusClass(pit: StoryPitView): string {
  if (pit.status === 'resolved' || pit.progress_status === 'resolved') {
    return 'resolved';
  }
  if (pit.progress_status === 'clear') {
    return 'clear';
  }
  if (pit.progress_status === 'partial') {
    return 'partial';
  }
  return 'open';
}

function getForeshadowChapterLabel(indexNo: number | null, title: string | null): string {
  if (!indexNo) {
    return '未记录章节';
  }
  return `第${indexNo}章${title ? ` · ${title}` : ''}`;
}

function getForeshadowOriginLabel(pit: StoryPitView): string {
  if (pit.origin_chapter_index_no) {
    return getForeshadowChapterLabel(pit.origin_chapter_index_no, pit.origin_chapter_title);
  }
  return pit.type === 'manual' ? '手动创建' : '未记录章节';
}

function getForeshadowResolvedLabel(pit: StoryPitView): string {
  if (pit.resolved_in_chapter_index_no) {
    return getForeshadowChapterLabel(pit.resolved_in_chapter_index_no, pit.resolved_in_chapter_title);
  }
  return pit.status === 'resolved' || pit.progress_status === 'resolved' ? '已回收，未记录章节' : '未回收';
}

function getForeshadowCreationMethodLabel(pit: StoryPitView): string {
  return pit.creation_method === 'ai' ? 'AI 生成' : '手动创建';
}

function normalizeForeshadowText(value: string): string {
  return value.replace(/\s+/gu, '').replace(/[《》“”"'：:，,。；;、]/gu, '').toLowerCase();
}

function foreshadowRecordMatchesPit(record: TimelineForeshadowView, pit: StoryPitView): boolean {
  const pitText = normalizeForeshadowText(pit.content);
  const recordTitle = normalizeForeshadowText(record.title);
  if (!pitText || !recordTitle) {
    return false;
  }
  return pitText.includes(recordTitle) || recordTitle.includes(pitText.slice(0, Math.min(12, pitText.length)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function countWords(content: string): number {
  return content.replace(/\s+/g, '').length;
}

function getRelationshipNodePosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) {
    return { x: 50, y: 50 };
  }
  if (total === 2) {
    return index === 0 ? { x: 25, y: 43 } : { x: 75, y: 43 };
  }

  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const radiusX = total <= 3 ? 30 : 40;
  const radiusY = total <= 3 ? 28 : 38;
  return {
    x: 50 + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY
  };
}

function getRelationshipLinkShape(
  from: { x: number; y: number },
  to: { x: number; y: number },
  _index: number
): { path: string; labelX: number; labelY: number } {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return {
    path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
    labelX: clamp(midX, 14, 86),
    labelY: clamp(midY, 14, 86)
  };
}

type RelationshipRenderLink = {
  from: number;
  to: number;
  inferred: boolean;
  label: string;
};

function getRelationshipPairKey(from: number, to: number): string {
  return from < to ? `${from}:${to}` : `${to}:${from}`;
}

function mergeRelationshipRenderLinks(links: RelationshipRenderLink[]): RelationshipRenderLink[] {
  const merged = new Map<string, RelationshipRenderLink>();
  for (const link of links) {
    const key = getRelationshipPairKey(link.from, link.to);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, link);
      continue;
    }
    if (current.label === link.label || current.label.includes(link.label)) {
      continue;
    }
    if (link.label.includes(current.label)) {
      merged.set(key, { ...current, label: link.label });
      continue;
    }
    merged.set(key, {
      ...current,
      label: `${current.label}、${link.label}`.slice(0, 12),
      inferred: current.inferred && link.inferred
    });
  }
  return Array.from(merged.values());
}

function textMentionsCharacterName(text: string, name: string): boolean {
  const trimmedName = name.trim();
  return trimmedName.length > 0 && text.includes(trimmedName);
}

function getRelationshipSearchText(character: RelationshipGraphEntry): string {
  return [character.name, character.role_type, character.summary, character.details].join('\n');
}

function resolveRelationshipCharacters(
  characters: Character[],
  characterIds: string[],
  chapterContent: string
): Character[] {
  const resolvedIds = new Set(characterIds);

  for (const character of characters) {
    if (textMentionsCharacterName(chapterContent, character.name)) {
      resolvedIds.add(character.id);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    const currentCharacters = characters.filter((character) => resolvedIds.has(character.id));
    for (const candidate of characters) {
      if (resolvedIds.has(candidate.id)) {
        continue;
      }

      const candidateText = getRelationshipSearchText(candidate);
      const isRelated = currentCharacters.some((character) => {
        const characterText = getRelationshipSearchText(character);
        return (
          textMentionsCharacterName(characterText, candidate.name) ||
          textMentionsCharacterName(candidateText, character.name)
        );
      });
      if (isRelated) {
        resolvedIds.add(candidate.id);
        changed = true;
      }
    }
  }

  return characters.filter((character) => resolvedIds.has(character.id));
}

function getTargetRelationshipSegment(text: string, targetName: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!textMentionsCharacterName(normalized, targetName)) {
    return '';
  }

  const markers = Array.from(normalized.matchAll(/[与和对]([^：:\r\n，,。；;]{1,12})[：:]/gu));
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const names = marker[1] ?? '';
    if (!names.includes(targetName)) {
      continue;
    }

    const start = marker.index ?? 0;
    const nextMarker = markers[index + 1];
    const end = nextMarker?.index ?? normalized.length;
    return normalized.slice(start, end).trim();
  }

  const parts = normalized
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.find((part) => part.includes(targetName)) ?? '';
}

function extractRelationshipSnippet(text: string, targetName: string): string {
  if (!textMentionsCharacterName(text, targetName)) {
    return '';
  }

  const matched = getTargetRelationshipSegment(text, targetName);
  if (!matched) {
    return '';
  }
  const targetIndex = matched.indexOf(targetName);
  const relationStart = Math.max(
    matched.lastIndexOf('与', targetIndex),
    matched.lastIndexOf('和', targetIndex),
    matched.lastIndexOf('对', targetIndex),
    0
  );
  const start = relationStart > 0 ? relationStart : Math.max(0, targetIndex - 6);
  const end = Math.min(matched.length, targetIndex + targetName.length + 16);
  const snippet = matched.slice(start, end).replace(/[，,。；;：:、\s]+$/u, '');
  return snippet.length > 18 ? `${snippet.slice(0, 18)}...` : snippet;
}

function extractRelationshipLabel(text: string, targetName: string): string {
  if (!textMentionsCharacterName(text, targetName)) {
    return '';
  }

  const matched = getTargetRelationshipSegment(text, targetName);
  if (!matched) {
    return '';
  }

  const afterTargetHeader = matched.match(/[与和对][^：:\r\n，,。；;]{0,12}[：:]\s*([^。！？!?；;]+)/u)?.[1] ?? matched;
  const knownLabel = afterTargetHeader.match(
    /青梅竹马|竹马青梅|祖孙关系|祖孙|亲兄弟|亲姐妹|兄妹|姐弟|兄弟|姐妹|父子|母子|父女|母女|师徒|同门|夫妻|恋人|挚友|朋友|盟友|同伴|搭档|邻居|同学|同事|主仆|君臣|恩人|仇人|敌人|竞争对手|守护者/u
  )?.[0];
  if (knownLabel) {
    return knownLabel;
  }

  const relationLabel = afterTargetHeader.match(/[^\s，,。；;：:、]{1,6}关系/u)?.[0];
  if (relationLabel) {
    return relationLabel;
  }

  const shortLabel = afterTargetHeader.match(/^([^，,。；;：:、\s]{2,6})/u)?.[1] ?? '';
  return shortLabel.includes(targetName) ? '' : shortLabel;
}

function getRelationshipLinkLabel(from: RelationshipGraphEntry, to: RelationshipGraphEntry): string {
  const fromLabel = extractRelationshipLabel(`${from.details}\n${from.summary}`, to.name);
  if (fromLabel) {
    return fromLabel;
  }

  const toLabel = extractRelationshipLabel(`${to.details}\n${to.summary}`, from.name);
  if (toLabel) {
    return toLabel;
  }

  return '关系待补充';
}

function upsertRelationshipLine(details: string, targetName: string, label: string): string {
  const normalizedTarget = targetName.trim();
  const nextLabel = label.trim();
  const lines = details.split(/\r?\n/u);
  const marker = new RegExp(`^\\s*[与和对]${escapeRegExp(normalizedTarget)}[：:]`, 'u');
  const nextLine = nextLabel ? `与${normalizedTarget}：${nextLabel}` : `与${normalizedTarget}：`;
  const index = lines.findIndex((line) => marker.test(line));

  if (index >= 0) {
    lines[index] = nextLine;
    return lines.join('\n').trim();
  }

  return [...lines.filter((line) => line.trim().length > 0), nextLine].join('\n').trim();
}

function normalizeRelationshipName(value: string): string {
  return value.replace(/\s+/gu, '').trim();
}

function normalizeRelationshipLabelForDisplay(label: string): string {
  const compact = label.replace(/\s+/gu, '').replace(/关系$/u, '');
  const groups: Array<[string, string[]]> = [
    ['朋友', ['朋友', '好朋友', '好友', '挚友', '友人']],
    ['恋人', ['恋人', '情侣', '爱人', '相爱', '伴侣']],
    ['邻居', ['邻居', '邻里', '住得近', '同住附近']],
    ['兄弟', ['兄弟', '亲兄弟', '哥哥弟弟', '哥弟']],
    ['姐妹', ['姐妹', '亲姐妹', '姐姐妹妹']],
    ['母子', ['母子', '母亲', '妈妈', '母亲儿子']],
    ['父子', ['父子', '父亲', '爸爸', '父亲儿子']],
    ['母女', ['母女', '母亲女儿']],
    ['父女', ['父女', '父亲女儿']],
    ['祖孙', ['祖孙', '祖孙关系', '爷孙', '奶孙']],
    ['同伴', ['同伴', '伙伴', '队友', '搭档']],
    ['敌人', ['敌人', '仇人', '死敌', '对手']],
    ['师徒', ['师徒', '师父徒弟', '师傅徒弟']]
  ];
  for (const [canonical, values] of groups) {
    if (values.some((value) => compact === value || compact.includes(value))) {
      return canonical;
    }
  }
  return compact;
}

function compactRelationshipEvents(events: CharacterRelationshipEventView[]): CharacterRelationshipEventView[] {
  const result: CharacterRelationshipEventView[] = [];
  for (const event of events) {
    const normalized = normalizeRelationshipLabelForDisplay(event.label);
    const previous = result[result.length - 1];
    if (previous && normalizeRelationshipLabelForDisplay(previous.label) === normalized) {
      continue;
    }
    result.push(event);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function getChapterRelationshipNodeId(name: string): string {
  return `chapter:${name.trim()}`;
}

function parseChapterRelationshipGraphUpdates(text: string): ChapterRelationshipGraph {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return { nodes: [], links: [] };
  }

  const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { items?: unknown }).items)) {
    return { nodes: [], links: [] };
  }

  const nodeByName = new Map<string, ChapterRelationshipGraphNode>();
  const rawCharacters = Array.isArray((parsed as { characters?: unknown }).characters)
    ? (parsed as { characters: unknown[] }).characters
    : [];

  rawCharacters
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .forEach((item) => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name || nodeByName.has(name)) {
        return;
      }
      nodeByName.set(name, {
        id: getChapterRelationshipNodeId(name),
        name,
        role_type: typeof item.role === 'string' ? item.role.trim() : '',
        summary: typeof item.summary === 'string' ? item.summary.trim() : '',
        details: ''
      });
    });

  const links = (parsed as { items: unknown[] }).items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const fromName = typeof item.from === 'string' ? item.from.trim() : '';
      const toName = typeof item.to === 'string' ? item.to.trim() : '';
      const label = typeof item.label === 'string' ? item.label.trim() : '';
      const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
      if (!fromName || !toName || fromName === toName || !label) {
        return null;
      }
      [fromName, toName].forEach((name) => {
        if (!nodeByName.has(name)) {
          nodeByName.set(name, {
            id: getChapterRelationshipNodeId(name),
            name,
            role_type: '',
            summary: '',
            details: ''
          });
        }
      });
      return {
        id: `${getChapterRelationshipNodeId(fromName)}->${getChapterRelationshipNodeId(toName)}:${label.slice(0, 8)}`,
        fromId: getChapterRelationshipNodeId(fromName),
        toId: getChapterRelationshipNodeId(toName),
        label: label.slice(0, 8),
        summary
      };
    })
    .filter((item): item is ChapterRelationshipGraphLink => item !== null);

  return {
    nodes: Array.from(nodeByName.values()),
    links
  };
}

function parseRelationshipGraphUpdates(text: string): Array<{ characterName: string; details: string }> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return [];
  }
  const jsonText = cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { items?: unknown }).items)) {
    return [];
  }

  return (parsed as { items: unknown[] }).items
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      characterName: typeof item.characterName === 'string' ? item.characterName.trim() : '',
      details: typeof item.details === 'string' ? item.details.trim() : ''
    }))
    .filter((item) => item.characterName.length > 0 && item.details.length > 0);
}

function parseTimelineEventUpdates(text: string): TimelineEventDraft[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return [];
  }

  const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { events?: unknown }).events)) {
    return [];
  }

  return (parsed as { events: unknown[] }).events
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const characters = Array.isArray(item.characters)
        ? item.characters.filter((name): name is string => typeof name === 'string')
        : Array.isArray(item.character_names_json)
          ? item.character_names_json.filter((name): name is string => typeof name === 'string')
          : [];
      return {
        event_type: typeof item.type === 'string'
          ? item.type.trim()
          : typeof item.event_type === 'string'
            ? item.event_type.trim()
            : '剧情',
        title: typeof item.title === 'string' ? item.title.trim() : '',
        summary: typeof item.summary === 'string' ? item.summary.trim() : '',
        character_names_json: characters.map((name) => name.trim()).filter(Boolean)
      };
    })
    .filter((event) => event.title.length > 0 || event.summary.length > 0);
}

function normalizeTimelineStoryTime(item: TimelineStoryTimeDraft | null): TimelineStoryTimeDraft | null {
  if (!item) {
    return null;
  }

  const combined = `${item.time_text} ${item.summary}`.trim();
  if (item.time_type === 'unknown' && STORY_TIME_INFERENCE_PATTERN.test(combined)) {
    const inferredText = item.summary.trim() || combined.replace(/^未知时间?\s*/u, '').trim();
    return {
      ...item,
      time_text: item.time_text && !/^未知时间?$/u.test(item.time_text) ? item.time_text : inferredText.slice(0, 80),
      time_type: 'relative'
    };
  }

  return item;
}

type TimelineForeshadowParsedItem = TimelineForeshadowDraft & {
  pitId: string;
  confidence: number | null;
};

function getTimelineForeshadowSignalScore(item: TimelineForeshadowParsedItem): number {
  const text = `${item.title} ${item.status} ${item.clue} ${item.payoff} ${item.summary}`;
  let score = 0;
  if (/回收|揭示|解答|兑现/u.test(item.status)) {
    score += 60;
  } else if (/响应|推进|呼应|强化/u.test(item.status)) {
    score += 48;
  } else if (/埋设|误导|新伏笔/u.test(item.status)) {
    score += 36;
  }
  if (/伏笔|线索|暗示|铺垫|预示|埋下|呼应|回收|揭示|兑现|谜团|异常|关键/u.test(text)) {
    score += 24;
  }
  if (item.clue) {
    score += 12;
  }
  if (item.payoff) {
    score += 12;
  }
  if (item.summary) {
    score += 6;
  }
  if (typeof item.confidence === 'number') {
    score += item.confidence * 20;
  }
  return score;
}

function limitTimelineNewForeshadows(items: TimelineForeshadowParsedItem[]): TimelineForeshadowParsedItem[] {
  return [...items]
    .sort((first, second) => getTimelineForeshadowSignalScore(second) - getTimelineForeshadowSignalScore(first))
    .slice(0, TIMELINE_NEW_FORESHADOW_LIMIT);
}

function parseTimelineLayerUpdates(text: string): TimelineLayerParseResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return { storyTime: null, chapterSummary: null, events: [], characterStates: [], foreshadows: [], foreshadowSync: [] };
  }

  const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    return { storyTime: null, chapterSummary: null, events: [], characterStates: [], foreshadows: [], foreshadowSync: [] };
  }
  const payload = parsed as Record<string, unknown>;

  const rawStoryTimes = Array.isArray(payload.storyTimes)
    ? payload.storyTimes
    : payload.storyTime && typeof payload.storyTime === 'object'
      ? [payload.storyTime]
      : [];
  const storyTime = normalizeTimelineStoryTime(rawStoryTimes
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item): TimelineStoryTimeDraft => ({
      time_text: typeof item.timeText === 'string'
        ? item.timeText.trim()
        : typeof item.time_text === 'string'
          ? item.time_text.trim()
          : '',
      time_type: item.timeType === 'absolute' || item.time_type === 'absolute'
        ? 'absolute'
        : item.timeType === 'relative' || item.time_type === 'relative'
          ? 'relative'
          : 'unknown',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : null
    }))
    .find((item) => item.time_text.length > 0 || item.summary.length > 0 || item.time_type !== 'unknown') ?? null);

  const rawChapterSummary = payload.chapterSummary && typeof payload.chapterSummary === 'object'
    ? payload.chapterSummary as Record<string, unknown>
    : payload.chapter_summary && typeof payload.chapter_summary === 'object'
      ? payload.chapter_summary as Record<string, unknown>
      : null;
  const chapterSummary: TimelineChapterSummaryDraft | null = rawChapterSummary
    ? {
        summary: typeof rawChapterSummary.summary === 'string' ? rawChapterSummary.summary.trim() : '',
        confidence: typeof rawChapterSummary.confidence === 'number' && Number.isFinite(rawChapterSummary.confidence)
          ? rawChapterSummary.confidence
          : null
      }
    : typeof payload.chapterSummary === 'string'
      ? { summary: payload.chapterSummary.trim(), confidence: null }
      : typeof payload.chapter_summary === 'string'
        ? { summary: payload.chapter_summary.trim(), confidence: null }
        : null;

  const events = Array.isArray(payload.events)
    ? payload.events
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => {
          const characters = Array.isArray(item.characters)
            ? item.characters.filter((name): name is string => typeof name === 'string')
            : Array.isArray(item.character_names_json)
              ? item.character_names_json.filter((name): name is string => typeof name === 'string')
              : [];
          return {
            event_type: typeof item.type === 'string'
              ? item.type.trim()
              : typeof item.event_type === 'string'
                ? item.event_type.trim()
                : '剧情',
            title: typeof item.title === 'string' ? item.title.trim() : '',
            summary: typeof item.summary === 'string' ? item.summary.trim() : '',
            character_names_json: characters.map((name) => name.trim()).filter(Boolean)
          };
        })
        .filter((event): event is TimelineEventDraft => event.title.length > 0 || event.summary.length > 0)
    : [];

  const characterStates = Array.isArray(payload.characterStates)
    ? payload.characterStates
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item): TimelineCharacterStateDraft => ({
          character_name: typeof item.characterName === 'string'
            ? item.characterName.trim()
            : typeof item.character_name === 'string'
              ? item.character_name.trim()
              : '',
          mood: typeof item.mood === 'string' ? item.mood.trim() : '',
          goal: typeof item.goal === 'string' ? item.goal.trim() : '',
          stance: typeof item.stance === 'string' ? item.stance.trim() : '',
          physical_state: typeof item.physicalState === 'string'
            ? item.physicalState.trim()
            : typeof item.physical_state === 'string'
              ? item.physical_state.trim()
              : '',
          summary: typeof item.summary === 'string' ? item.summary.trim() : ''
        }))
        .filter((item) => item.character_name.length > 0 || item.summary.length > 0)
    : [];

  const rawForeshadowItems = Array.isArray(payload.foreshadows) ? payload.foreshadows : [];
  const parsedForeshadowItems = rawForeshadowItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item): TimelineForeshadowParsedItem => ({
      title: typeof item.title === 'string' ? item.title.trim() : '',
      status: typeof item.status === 'string' ? item.status.trim() : '',
      clue: typeof item.clue === 'string' ? item.clue.trim() : '',
      payoff: typeof item.payoff === 'string' ? item.payoff.trim() : '',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      pitId: typeof item.pitId === 'string'
        ? item.pitId.trim()
        : typeof item.pit_id === 'string'
          ? item.pit_id.trim()
          : '',
      confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : null
    }))
    .filter((item) => item.title.length > 0 || item.summary.length > 0 || item.clue.length > 0);

  const limitedNewForeshadowItems = limitTimelineNewForeshadows(
    parsedForeshadowItems.filter((item) => item.pitId.length === 0)
  );

  const foreshadows = [
    ...parsedForeshadowItems
      .filter((item) => item.pitId.length > 0)
      .map(({ pitId: _pitId, confidence: _confidence, ...item }) => item),
    ...limitedNewForeshadowItems.map(({ pitId: _pitId, confidence: _confidence, ...item }) => item)
  ];

  const foreshadowSync = [
    ...parsedForeshadowItems.filter((item) => item.pitId.length > 0),
    ...limitedNewForeshadowItems
  ]
    .map((item): TimelineForeshadowSyncDraft => ({
      title: item.title,
      status: item.status,
      clue: item.clue,
      payoff: item.payoff,
      summary: item.summary,
      pitId: item.pitId,
      confidence: item.confidence
    }));

  return { storyTime, chapterSummary: chapterSummary && chapterSummary.summary.length > 0 ? chapterSummary : null, events, characterStates, foreshadows, foreshadowSync };
}

function parseChapterWrapUpUpdates(text: string): ChapterWrapUpParseResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return {
      plans: [],
      relationshipGraph: { nodes: [], links: [] },
      characterUpdates: []
    };
  }

  const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    return {
      plans: [],
      relationshipGraph: { nodes: [], links: [] },
      characterUpdates: []
    };
  }

  const payload = parsed as Record<string, unknown>;
  const rawPlans = Array.isArray(payload.plans) ? payload.plans : [];
  const plans = rawPlans
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      index: typeof item.index === 'number' && Number.isFinite(item.index) ? item.index : -1,
      status: item.status === 'done' ? 'done' as const : 'open' as const,
      reason: typeof item.reason === 'string' ? item.reason.trim() : ''
    }))
    .filter((item) => item.index >= 0);

  const relationshipPayload = payload.relationshipGraph && typeof payload.relationshipGraph === 'object'
    ? payload.relationshipGraph
    : { characters: [], items: [] };
  const relationshipGraph = parseChapterRelationshipGraphUpdates(JSON.stringify(relationshipPayload));

  const rawCharacterUpdates = Array.isArray(payload.characterUpdates) ? payload.characterUpdates : [];
  const characterUpdates = rawCharacterUpdates
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      characterName: typeof item.characterName === 'string' ? item.characterName.trim() : '',
      details: typeof item.details === 'string' ? item.details.trim() : ''
    }))
    .filter((item) => item.characterName && item.details);

  return {
    plans,
    relationshipGraph,
    characterUpdates
  };
}

function parseProofreadUpdates(text: string): ProofreadParseResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) {
    return { text: cleaned, changes: [] };
  }

  try {
    const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { text: cleaned, changes: [] };
    }
    const payload = parsed as Record<string, unknown>;
    const nextText = typeof payload.text === 'string'
      ? payload.text
      : typeof payload.correctedText === 'string'
        ? payload.correctedText
        : cleaned;
    const changes = Array.isArray(payload.changes)
      ? payload.changes
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .map((item) => ({
            before: typeof item.before === 'string' ? item.before.trim() : '',
            after: typeof item.after === 'string' ? item.after.trim() : '',
            reason: typeof item.reason === 'string' ? item.reason.trim() : ''
          }))
          .filter((item) => item.before || item.after)
      : [];
    return { text: nextText, changes };
  } catch {
    return { text: cleaned, changes: [] };
  }
}

function buildProofreadFallbackChanges(previousText: string, nextText: string): ProofreadChange[] {
  const previousParagraphs = getManuscriptParagraphs(previousText);
  const nextParagraphs = getManuscriptParagraphs(nextText);
  const total = Math.max(previousParagraphs.length, nextParagraphs.length);
  const changes: ProofreadChange[] = [];

  for (let index = 0; index < total; index += 1) {
    const before = previousParagraphs[index] ?? '';
    const after = nextParagraphs[index] ?? '';
    if (!before && !after) {
      continue;
    }
    if (before === after) {
      continue;
    }
    changes.push({
      before: before.length > 36 ? `${before.slice(0, 36)}…` : before,
      after: after.length > 36 ? `${after.slice(0, 36)}…` : after,
      reason: '自动比对生成'
    });
    if (changes.length >= 6) {
      break;
    }
  }

  if (changes.length > 0) {
    return changes;
  }

  if (previousText.trim() === nextText.trim()) {
    return [];
  }

  return [{
    before: previousText.trim().slice(0, 36) || '空',
    after: nextText.trim().slice(0, 36) || '空',
    reason: '自动比对生成'
  }];
}

function resolveProofreadChanges(previousText: string, nextText: string, parsedChanges: ProofreadChange[]): ProofreadChange[] {
  return parsedChanges.length > 0 ? parsedChanges : buildProofreadFallbackChanges(previousText, nextText);
}

function compactTimelineAiContent(content: string, maxLength = 14000): string {
  const normalized = content.replace(/\r\n/gu, '\n').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const headLength = Math.floor(maxLength * 0.62);
  const tailLength = maxLength - headLength;
  return [
    normalized.slice(0, headLength).trim(),
    `\n\n[中间正文过长，已省略 ${normalized.length - maxLength} 字，保留章节开头和结尾用于提取时间线]\n\n`,
    normalized.slice(-tailLength).trim()
  ].join('');
}

function getTimelineForeshadowOutcome(status: string): ChapterPitReviewOutcome {
  if (/回收|揭示|解答|兑现/u.test(status)) {
    return 'resolved';
  }
  if (/推进|响应|呼应|揭露|强化/u.test(status)) {
    return 'clear';
  }
  return 'partial';
}

function getForeshadowCandidateText(pits: StoryPitView[], currentDisplayNumber: number, referenceWindow = TIMELINE_LAYER_REFERENCE_WINDOW): string {
  const lowerBound = Math.max(1, currentDisplayNumber - referenceWindow);
  const candidates = pits
    .filter((pit) => {
      if (pit.status === 'resolved' || pit.progress_status === 'resolved') {
        return false;
      }
      const originIndex = pit.origin_chapter_index_no ?? 0;
      return originIndex === 0 || (originIndex >= lowerBound && originIndex < currentDisplayNumber);
    })
    .map((pit, index) => {
      const origin = pit.origin_chapter_index_no ? `第${pit.origin_chapter_index_no}章` : '手动伏笔';
      const note = (pit.note ?? '').replace(/\s+/gu, ' ').trim();
      return [
        `${index + 1}. pitId=${pit.id}`,
        `伏笔：${pit.content.replace(/\s+/gu, ' ').trim()}`,
        `状态：${getForeshadowStatusLabel(pit)}`,
        `埋设：${origin}`,
        note ? `说明：${note.slice(0, 220)}` : ''
      ].filter(Boolean).join('｜');
    });

  return candidates.length > 0 ? candidates.join('\n') : '无';
}

function getTimelinePrecedingChapterContextText(
  chapters: Chapter[],
  currentDisplayNumber: number,
  storyTimes: TimelineStoryTimeView[],
  chapterSummaries: TimelineChapterSummaryView[],
  events: TimelineEventView[],
  characterStates: TimelineCharacterStateView[],
  foreshadows: TimelineForeshadowView[],
  referenceWindow = TIMELINE_LAYER_REFERENCE_WINDOW
): string {
  const precedingChapters = chapters
    .filter((chapter) => chapter.index_no < currentDisplayNumber)
    .slice(-referenceWindow);

  if (precedingChapters.length === 0) {
    return '无';
  }

  return precedingChapters
    .map((chapter) => {
      const chapterStoryTimes = storyTimes.filter((item) => item.chapter_id === chapter.id);
      const chapterSummary = chapterSummaries.find((item) => item.chapter_id === chapter.id);
      const chapterEvents = events.filter((item) => item.chapter_id === chapter.id);
      const chapterStates = characterStates.filter((item) => item.chapter_id === chapter.id);
      const chapterForeshadows = foreshadows.filter((item) => item.chapter_id === chapter.id);
      const storyTimeText = chapterStoryTimes.length > 0
        ? chapterStoryTimes
            .map((item) => `${item.time_text || '未知'}${item.time_type !== 'unknown' ? `(${item.time_type})` : ''}`)
            .join('；')
        : '无';
      const eventText = chapterEvents.length > 0 ? chapterEvents.slice(0, 3).map((item) => item.title).join('；') : '无';
      const stateText = chapterStates.length > 0
        ? chapterStates.slice(0, 2).map((item) => `${item.character_name}${item.summary ? `：${item.summary}` : ''}`).join('；')
        : '无';
      const foreshadowText = chapterForeshadows.length > 0 ? chapterForeshadows.slice(0, 2).map((item) => item.title).join('；') : '无';
      const summaryText = chapterSummary ? chapterSummary.summary : '无';
      return `第${chapter.index_no}章《${chapter.title || '未命名章节'}》｜时间：${storyTimeText}｜摘要：${summaryText}｜剧情：${eventText}｜人物：${stateText}｜伏笔：${foreshadowText}`;
    })
    .join('\n');
}

function getTimelineChapterPoint(index: number, total: number): { x: number; y: number } {
  if (total <= 1) {
    return { x: 50, y: 50 };
  }
  const columns = Math.min(5, Math.max(2, total));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rows = Math.max(1, Math.ceil(total / columns));
  const isReverse = row % 2 === 1;
  const visualColumn = isReverse ? columns - 1 - column : column;
  const x = 12 + (visualColumn * 76) / Math.max(1, columns - 1);
  const y = rows === 1 ? 50 : 16 + (row * 68) / Math.max(1, rows - 1);
  return { x, y };
}

function getTimelineStoryPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  const pathPoints = [
    points[0],
    ...points,
    points[points.length - 1]
  ];

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = pathPoints[index];
    const p1 = pathPoints[index + 1];
    const p2 = pathPoints[index + 2];
    const p3 = pathPoints[index + 3];
    const tension = 0.16;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

function getTimelineWindowStart(selectedStart: number, selectedEnd: number): number {
  const selectedCount = Math.max(1, selectedEnd - selectedStart + 1);
  if (selectedCount >= TIMELINE_WINDOW_SIZE) {
    return selectedStart;
  }

  const missingCount = TIMELINE_WINDOW_SIZE - selectedCount;
  return Math.max(1, selectedStart - Math.floor(missingCount / 2));
}

function getCompressedTimelineDisplayNumbers(selectedStart: number, selectedEnd: number): Array<number | 'gap'> {
  const selectedCount = Math.max(1, selectedEnd - selectedStart + 1);
  if (selectedCount <= TIMELINE_WINDOW_SIZE) {
    const windowStart = getTimelineWindowStart(selectedStart, selectedEnd);
    return Array.from({ length: TIMELINE_WINDOW_SIZE }, (_, index) => windowStart + index);
  }

  const edgeCount = 6;
  const middleCount = TIMELINE_WINDOW_SIZE - edgeCount * 2 - 2;
  const middleCenter = (selectedStart + selectedEnd) / 2;
  let middleStart = Math.round(middleCenter - (middleCount - 1) / 2);
  middleStart = Math.max(selectedStart + edgeCount, middleStart);
  middleStart = Math.min(selectedEnd - edgeCount - middleCount + 1, middleStart);

  const head = Array.from({ length: edgeCount }, (_, index) => selectedStart + index);
  const middle = Array.from({ length: middleCount }, (_, index) => middleStart + index);
  const tailStart = selectedEnd - edgeCount + 1;
  const tail = Array.from({ length: edgeCount }, (_, index) => tailStart + index);

  return [...head, 'gap', ...middle, 'gap', ...tail];
}

function clampTimelineDetailPosition(
  x: number,
  y: number,
  panelWidth = 300,
  panelHeight = 160
): { x: number; y: number } {
  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
  const margin = 16;
  return {
    x: clamp(x, margin, Math.max(margin, viewportWidth - panelWidth - margin)),
    y: clamp(y, margin, Math.max(margin, viewportHeight - panelHeight - margin))
  };
}

function getTimelineDetailPositionFromRect(rect: DOMRect): { x: number; y: number } {
  return getTimelineDetailPositionFromRects(rect);
}

function getTimelineDetailPositionFromRects(
  anchorRect: DOMRect,
  panelWidth = 300,
  panelHeight = 160
): { x: number; y: number } {
  const gap = 10;
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight;
  const margin = 16;
  const x = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
  const roomBelow = viewportHeight - anchorRect.bottom - margin;
  const roomAbove = anchorRect.top - margin;
  const shouldPlaceAbove = roomBelow < panelHeight + gap && roomAbove > roomBelow;
  const y = shouldPlaceAbove
    ? anchorRect.top - panelHeight - gap
    : anchorRect.bottom + gap;

  return clampTimelineDetailPosition(x, y, panelWidth, panelHeight);
}

export function StudioPage({
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
  writerMode,
  saveStatusText,
  studioTab,
  sidebarSection,
  showCodexEditor,
  codexEditorState,
  formatTime,
  onBackHome,
  onUpdateProject,
  onSelectChapter,
  onCreateChapter,
  onDeleteChapter,
  onRestoreChapter,
  onDeleteChapterPermanent,
  onTitleChange,
  onContentChange,
  onBlurSave,
  onChatThreadNameChange,
  onChatDraftChange,
  onChatModelChange,
  onLoadAiConfig,
  onUpdateAiConfig,
  onDeleteAiConfig,
  onListAiModels,
  onUpdateChapterRefs,
  onUpdateChapterRelationshipGraph,
  onUpsertCharacterRelationship,
  onReplaceChapterTimelineLayers,
  onCreateForeshadowPit,
  onUpdateForeshadowPit,
  onDeleteForeshadowPit,
  onCreateChapterForeshadowPit,
  onRecordForeshadowResponse,
  onUpdateCurrentChapterPatch,
  onRunWritingAi,
  onFeedback,
  onSendChat,
  onNewChat,
  onSetStudioTab,
  onSetSidebarSection,
  onOpenCodex,
  onOpenNewCodexEntry,
  onOpenEditCodexEntry,
  onUpdateCharacterDetails,
  onDeleteCodexEntry,
  onCloseCodexEditor,
  onSaveCodexEntry,
  onUpdateCodexEditorField,
  onToggleWriterMode
}: StudioPageProps): JSX.Element {
  const shellRef = useRef<HTMLElement | null>(null);
  const newEntryMenuRef = useRef<HTMLDivElement | null>(null);
  const writingRefMenuRef = useRef<HTMLDivElement | null>(null);
  const writingModelMenuRef = useRef<HTMLDivElement | null>(null);
  const relationshipModelMenuRef = useRef<HTMLDivElement | null>(null);
  const timelineModelMenuRef = useRef<HTMLDivElement | null>(null);
  const globalChapterMenuRef = useRef<HTMLDivElement | null>(null);
  const relationshipCanvasRef = useRef<HTMLDivElement | null>(null);
  const timelineMapRef = useRef<HTMLDivElement | null>(null);
  const timelineDetailRef = useRef<HTMLElement | null>(null);
  const timelineDetailAnchorRectRef = useRef<DOMRect | null>(null);
  const timelineRangeSelectPendingRef = useRef(false);
  const relationshipDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const relationshipDragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const relationshipDragCharacterIdRef = useRef<string | null>(null);
  const timelineDetailDragMovedRef = useRef(false);
  const syncedChapterRelationshipGraphKeyRef = useRef('');
  const codexDetailPanelRef = useRef<HTMLDivElement | null>(null);
  const codexEditorPanelRef = useRef<HTMLDivElement | null>(null);
  const writingAiPromptPopoverRef = useRef<HTMLDivElement | null>(null);
  const manuscriptEditorRef = useRef<ManuscriptEditorHandle | null>(null);
  const manuscriptReadingRef = useRef<HTMLDivElement | null>(null);
  const savedAiSettingsKeyRef = useRef('');
  const latestAiSettingsKeyRef = useRef('');
  const savedAiPromptSettingsRef = useRef('');
  const totalWords = chapters.reduce((sum, chapter) => {
    if (currentChapter?.id === chapter.id) {
      return sum + liveWordCount;
    }
    return sum + countWords(chapter.content);
  }, 0);
  const getChapterWordCount = useCallback(
    (chapter: Chapter) => (currentChapter?.id === chapter.id ? liveWordCount : countWords(chapter.content)),
    [currentChapter?.id, liveWordCount]
  );
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(318);
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [newEntryMenuOpen, setNewEntryMenuOpen] = useState(false);
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [projectInfoSaving, setProjectInfoSaving] = useState(false);
  const [projectDraft, setProjectDraft] = useState({
    title: activeProject.title,
    description: activeProject.description,
    outline_text: activeProject.outline_text
  });
  const [aiSettingsMode, setAiSettingsMode] = useState<'edit' | 'catalog'>('edit');
  const [aiSettingsTab, setAiSettingsTab] = useState<'connections' | 'prompt'>('connections');
  const [aiPromptDraft, setAiPromptDraft] = useState(DEFAULT_AI_CHAT_SYSTEM_PROMPT);
  const [aiPromptTemplateDrafts, setAiPromptTemplateDrafts] = useState<AiPromptTemplates>({ ...DEFAULT_AI_PROMPT_TEMPLATES });
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [writingAiRunning, setWritingAiRunning] = useState<WritingAiAction | null>(null);
  const [writingAiResult, setWritingAiResult] = useState<{
    action: WritingAiAction;
    text: string;
    provider: string;
    model: string | null;
    target: 'selection' | 'chapter' | 'reference' | 'cursor';
    sourceText: string;
    insertionOffset: number | null;
  } | null>(null);
  const [proofreadAiRunning, setProofreadAiRunning] = useState(false);
  const [proofreadAiStatus, setProofreadAiStatus] = useState('');
  const [proofreadAiChanges, setProofreadAiChanges] = useState<ProofreadChange[]>([]);
  const [chapterWrapUpRunning, setChapterWrapUpRunning] = useState(false);
  const [chapterWrapUpStatus, setChapterWrapUpStatus] = useState('');
  const [writingAiExtraPrompts, setWritingAiExtraPrompts] = useState<Record<WritingAiAction, string>>({
    continue: '',
    rewrite: '',
    polish: '',
    generate: '',
    inspiration: ''
  });
  const [writingAiPromptAction, setWritingAiPromptAction] = useState<WritingAiAction | null>(null);
  const [writingRefMenuOpen, setWritingRefMenuOpen] = useState<WritingRefMenuKind | null>(null);
  const [selectedWritingForeshadowRefIds, setSelectedWritingForeshadowRefIds] = useState<string[]>([]);
  const [selectedWritingPlanRefIndexes, setSelectedWritingPlanRefIndexes] = useState<number[]>([]);
  const [manuscriptSelectionText, setManuscriptSelectionText] = useState('');
  const [manuscriptSearchQuery, setManuscriptSearchQuery] = useState('');
  const [manuscriptSearchStatus, setManuscriptSearchStatus] = useState('');
  const [manuscriptSearchIndex, setManuscriptSearchIndex] = useState(-1);
  const [writingModelMenuOpen, setWritingModelMenuOpen] = useState(false);
  const [relationshipModelMenuOpen, setRelationshipModelMenuOpen] = useState(false);
  const [timelineModelMenuOpen, setTimelineModelMenuOpen] = useState(false);
  const [globalChapterMenuOpen, setGlobalChapterMenuOpen] = useState(false);
  const [globalChapterInput, setGlobalChapterInput] = useState('');
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [aiModelsError, setAiModelsError] = useState('');
  const [aiSupportedModels, setAiSupportedModels] = useState<string[]>([]);
  const [aiApiKeyVisible, setAiApiKeyVisible] = useState(false);
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AiProviderConfig>({
    id: 'openai-compatible',
    providerType: 'openai-compatible',
    connectionName: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    defaultModel: 'gpt-5.4-mini',
    customModels: 'gpt-5.4-mini\ngpt-5.4\ngpt-4.1-mini'
  });
  const [chatModelMenuOpen, setChatModelMenuOpen] = useState(false);
  const [codexKindMenuOpen, setCodexKindMenuOpen] = useState(false);
  const [codexGroupsOpen, setCodexGroupsOpen] = useState({
    characters: false,
    background: false,
    settings: false,
    other: false
  });
  const [planSection, setPlanSection] = useState<PlanSection>('overview');
  const [foreshadowFilter, setForeshadowFilter] = useState<ForeshadowFilter>('all');
  const [writingPlanFilter, setWritingPlanFilter] = useState<WritingPlanFilter>('all');
  const [selectedForeshadowId, setSelectedForeshadowId] = useState<string | null>(null);
  const [foreshadowContentDraft, setForeshadowContentDraft] = useState('');
  const [foreshadowNoteDraft, setForeshadowNoteDraft] = useState('');
  const [foreshadowSaving, setForeshadowSaving] = useState(false);
  const [selectedWritingPlanIndex, setSelectedWritingPlanIndex] = useState(0);
  const [writingPlanDraft, setWritingPlanDraft] = useState('');
  const [scope, setScope] = useState<'everything' | 'chapter' | 'selection'>('everything');
  const [focusMode, setFocusMode] = useState(false);
  const [selectedCodexEntry, setSelectedCodexEntry] = useState<{ type: 'character' | 'lore'; id: string } | null>(null);

  const selectedCharacter = selectedCodexEntry?.type === 'character'
    ? characters.find((c) => c.id === selectedCodexEntry.id) ?? null
    : null;
  const selectedLoreEntry = selectedCodexEntry?.type === 'lore'
    ? loreEntries.find((l) => l.id === selectedCodexEntry.id) ?? null
    : null;

  const query = sidebarQuery.trim().toLowerCase();
  const aiSettingsActive = !projectInfoOpen && studioTab === 'settings';
  const showInspector = !projectInfoOpen && !focusMode && studioTab === 'write' && Boolean(currentChapter);
  const minMainWidth = studioTab === 'write' && !currentChapter ? 96 : 320;
  const effectiveSidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  const getShellWidth = useCallback(() => shellRef.current?.clientWidth ?? window.innerWidth, []);

  const getSidebarBounds = useCallback(
    (shellWidth: number, currentInspectorWidth: number) => {
      const maxByViewport =
        shellWidth - minMainWidth - CHROME_WIDTH - (showInspector ? currentInspectorWidth : 0);
      return {
        min: SIDEBAR_MIN_WIDTH,
        max: Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, maxByViewport))
      };
    },
    [minMainWidth, showInspector]
  );

  const getInspectorBounds = useCallback((shellWidth: number, currentSidebarWidth: number) => {
    const maxByViewport = shellWidth - minMainWidth - CHROME_WIDTH - currentSidebarWidth;
    return {
      min: INSPECTOR_MIN_WIDTH,
      max: Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, maxByViewport))
    };
  }, [minMainWidth]);

  const handleSidebarResize = useCallback((delta: number) => {
    if (sidebarCollapsed) {
      return;
    }
    const shellWidth = getShellWidth();
    setSidebarWidth((current) => {
      const bounds = getSidebarBounds(shellWidth, inspectorWidth);
      return clamp(current + delta, bounds.min, bounds.max);
    });
  }, [getShellWidth, getSidebarBounds, inspectorWidth, sidebarCollapsed]);

  const handleInspectorResize = useCallback((delta: number) => {
    const shellWidth = getShellWidth();
    setInspectorWidth((current) => {
      const bounds = getInspectorBounds(shellWidth, effectiveSidebarWidth);
      return clamp(current - delta, bounds.min, bounds.max);
    });
  }, [effectiveSidebarWidth, getInspectorBounds, getShellWidth]);

  const handleSetSidebarSection = useCallback(
    (section: StudioSidebarSection) => {
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
      }
      setProjectInfoOpen(false);
      onSetSidebarSection(section);
    },
    [onSetSidebarSection, sidebarCollapsed]
  );

  const openProjectInfo = useCallback(() => {
    setProjectDraft({
      title: activeProject.title,
      description: activeProject.description,
      outline_text: activeProject.outline_text
    });
    setProjectInfoOpen(true);
  }, [activeProject.description, activeProject.outline_text, activeProject.title]);

  const saveProjectInfoDraft = useCallback(async () => {
    const nextTitle = projectDraft.title.trim();
    if (!nextTitle) {
      return;
    }
    if (
      nextTitle === activeProject.title &&
      projectDraft.description === activeProject.description &&
      projectDraft.outline_text === activeProject.outline_text
    ) {
      return;
    }

    setProjectInfoSaving(true);
    await onUpdateProject({
      title: nextTitle,
      description: projectDraft.description,
      outline_text: projectDraft.outline_text
    });
    setProjectInfoSaving(false);
  }, [activeProject.description, activeProject.outline_text, activeProject.title, onUpdateProject, projectDraft.description, projectDraft.outline_text, projectDraft.title]);

  const closeProjectInfo = useCallback(() => {
    void saveProjectInfoDraft();
    setProjectInfoOpen(false);
  }, [saveProjectInfoDraft]);

  const handleSetStudioTab = useCallback(
    (tab: StudioTab) => {
      void saveProjectInfoDraft();
      setProjectInfoOpen(false);
      onSetStudioTab(tab);
    },
    [onSetStudioTab, saveProjectInfoDraft]
  );

  const openAiSettings = useCallback((tab: 'connections' | 'prompt' = 'connections') => {
    handleSetStudioTab('settings');
    setAiSettingsMode('edit');
    setAiSettingsTab(tab);
    const nextPrompt = aiSystemPrompt || DEFAULT_AI_CHAT_SYSTEM_PROMPT;
    const nextTemplates = aiPromptTemplates ?? { ...DEFAULT_AI_PROMPT_TEMPLATES };
    setAiPromptDraft(nextPrompt);
    setAiPromptTemplateDrafts(nextTemplates);
    savedAiPromptSettingsRef.current = getAiPromptSettingsKey({
      systemPrompt: nextPrompt,
      promptTemplates: nextTemplates
    });
    void onLoadAiConfig().then((config) => {
      if (config) {
        const configKey = getAiSettingsKey(config);
        savedAiSettingsKeyRef.current = configKey;
        latestAiSettingsKeyRef.current = configKey;
        setAiSettingsDraft(config);
      }
    });
  }, [aiPromptTemplates, aiSystemPrompt, handleSetStudioTab, onLoadAiConfig]);

  const persistAiSettings = useCallback(async (draft: AiProviderConfig) => {
    const draftKey = getAiSettingsKey(draft);
    setAiSettingsSaving(true);
    const config = await onUpdateAiConfig(draft);
    setAiSettingsSaving(false);
    if (config) {
      savedAiSettingsKeyRef.current = getAiSettingsKey(config);
      if (latestAiSettingsKeyRef.current === draftKey) {
        setAiSettingsDraft(config);
      }
    }
  }, [onUpdateAiConfig]);

  const handleAddAiConnection = useCallback((providerType: AiProviderConfig['providerType'] = 'openai-compatible') => {
    const template = providerType === 'openai' ? NEW_OPENAI_CONNECTION_DRAFT : NEW_AI_CONNECTION_DRAFT;
    const nextDraft = {
      ...template,
      id: crypto.randomUUID()
    };
    latestAiSettingsKeyRef.current = getAiSettingsKey(nextDraft);
    savedAiSettingsKeyRef.current = '';
    setAiSettingsDraft(nextDraft);
    setAiSupportedModels([]);
    setAiModelsError('');
    setAiApiKeyVisible(false);
    setAiSettingsTab('connections');
    setAiSettingsMode('edit');
    void persistAiSettings(nextDraft);
  }, [persistAiSettings]);

  const handleSelectAiConnection = useCallback((connection: AiProviderConfig) => {
    const connectionKey = getAiSettingsKey(connection);
    savedAiSettingsKeyRef.current = connectionKey;
    latestAiSettingsKeyRef.current = connectionKey;
    setAiSettingsDraft(connection);
    setAiSupportedModels(connection.customModels.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    setAiModelsError('');
    setAiSettingsMode('edit');
  }, []);

  const handleDeleteAiConnection = useCallback(async (connection: AiProviderConfig) => {
    await onDeleteAiConfig({ id: connection.id });
    if (connection.id === aiSettingsDraft.id) {
      const nextConnection = aiConnections.find((item) => item.id !== connection.id) ?? null;
      if (nextConnection) {
        setAiSettingsDraft(nextConnection);
        setAiSupportedModels(nextConnection.customModels.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
        latestAiSettingsKeyRef.current = getAiSettingsKey(nextConnection);
        savedAiSettingsKeyRef.current = getAiSettingsKey(nextConnection);
      } else {
        setAiSettingsMode('catalog');
      }
    }
  }, [aiConnections, aiSettingsDraft.id, onDeleteAiConfig]);

  const applyWritingAiResult = useCallback(() => {
    if (!writingAiResult) return;
    if (writingAiResult.action === 'continue') {
      if (writingAiResult.insertionOffset !== null) {
        const inserted = manuscriptEditorRef.current?.insertAtOffset(writingAiResult.text, writingAiResult.insertionOffset);
        if (!inserted) {
          const current = editor.content;
          const safeOffset = Math.min(Math.max(0, writingAiResult.insertionOffset), current.length);
          onContentChange(formatManuscriptParagraphs([
            current.slice(0, safeOffset),
            writingAiResult.text,
            current.slice(safeOffset)
          ].filter((part) => part.trim()).join('\n')));
        }
        return;
      }
      const joiner = editor.content.trim() ? '\n' : '';
      onContentChange(formatManuscriptParagraphs(`${editor.content}${joiner}${writingAiResult.text}`));
      return;
    }
    if ((writingAiResult.action === 'rewrite' || writingAiResult.action === 'polish') && writingAiResult.target === 'selection') {
      const replaced = manuscriptEditorRef.current?.replaceSelection(writingAiResult.text);
      if (!replaced) {
        const current = editor.content;
        const index = current.indexOf(writingAiResult.sourceText);
        if (index >= 0) {
          onContentChange(formatManuscriptParagraphs(`${current.slice(0, index)}${formatManuscriptParagraphs(writingAiResult.text)}${current.slice(index + writingAiResult.sourceText.length)}`));
        }
      }
      return;
    }
    if (writingAiResult.action === 'rewrite' || writingAiResult.action === 'polish' || writingAiResult.action === 'generate') {
      onContentChange(formatManuscriptParagraphs(writingAiResult.text));
    }
  }, [editor.content, onContentChange, writingAiResult]);

  const clearWritingAiResult = useCallback(() => {
    setWritingAiResult(null);
  }, []);

  const persistAiPromptSettings = useCallback(async (settings: { systemPrompt: string; promptTemplates: AiPromptTemplates }) => {
    setAiSettingsSaving(true);
    await onUpdateAiConfig({
      systemPrompt: settings.systemPrompt,
      promptTemplates: settings.promptTemplates
    });
    savedAiPromptSettingsRef.current = getAiPromptSettingsKey(settings);
    setAiSettingsSaving(false);
  }, [onUpdateAiConfig]);

  const handleNewCodexEntry = useCallback(
    (type: 'character' | 'lore', loreType?: string) => {
      setProjectInfoOpen(false);
      onSetSidebarSection('codex');
      setSelectedCodexEntry(null);
      setNewEntryMenuOpen(false);
      onOpenNewCodexEntry(type, loreType);
    },
    [onOpenNewCodexEntry, onSetSidebarSection]
  );

  const toggleCodexGroup = useCallback((group: keyof typeof codexGroupsOpen) => {
    setCodexGroupsOpen((current) => ({ ...current, [group]: !current[group] }));
  }, []);

  const visibleCharacters = query
    ? characters.filter((entry) => `${entry.name} ${entry.role_type} ${entry.summary}`.toLowerCase().includes(query))
    : characters;
  const visibleLore = query
    ? loreEntries.filter((entry) => `${entry.title} ${entry.type} ${entry.summary}`.toLowerCase().includes(query))
    : loreEntries;
  const visibleBackground = visibleLore.filter((entry) => entry.type === 'location');
  const visibleSettings = visibleLore.filter((entry) => entry.type === 'lore');
  const visibleOther = visibleLore.filter((entry) => entry.type !== 'location' && entry.type !== 'lore');
  const writingReferenceOptions = [
    ...characters.map((entry) => ({
      id: `character:${entry.id}`,
      rawId: entry.id,
      kind: 'character' as const,
      label: entry.name,
      type: '人物',
      text: [`人物：${entry.name}`, entry.role_type ? `定位：${entry.role_type}` : '', entry.summary ? `摘要：${entry.summary}` : '', entry.details ? `详情：${entry.details}` : '']
        .filter(Boolean)
        .join('\n')
    })),
    ...loreEntries.map((entry) => ({
      id: `lore:${entry.id}`,
      rawId: entry.id,
      kind: 'lore' as const,
      label: entry.title,
      type: entry.type === 'location' ? '背景' : entry.type === 'lore' ? '设定' : '其他',
      text: [`${entry.type === 'location' ? '背景' : entry.type === 'lore' ? '设定' : '其他'}：${entry.title}`, entry.summary ? `摘要：${entry.summary}` : '', entry.content ? `内容：${entry.content}` : '']
        .filter(Boolean)
      .join('\n')
    }))
  ];
  const isWritingReferenceSelected = (entry: (typeof writingReferenceOptions)[number]) => (
    entry.kind === 'character'
      ? chapterRefs?.characterIds.includes(entry.rawId) ?? false
      : chapterRefs?.loreEntryIds.includes(entry.rawId) ?? false
  );
  const selectedWritingReferenceOptions = writingReferenceOptions.filter(isWritingReferenceSelected);
  const availableWritingReferenceOptions = writingReferenceOptions.filter((entry) => !isWritingReferenceSelected(entry));
  const selectedWritingReferenceText = writingReferenceOptions
    .filter(isWritingReferenceSelected)
    .map((entry) => entry.text)
    .join('\n\n');
  const addWritingReference = useCallback(async (entry: (typeof writingReferenceOptions)[number]) => {
    if (!currentChapter) {
      return;
    }

    const currentCharacterIds = chapterRefs?.characterIds ?? [];
    const currentLoreEntryIds = chapterRefs?.loreEntryIds ?? [];

    await onUpdateChapterRefs({
      characterIds: entry.kind === 'character' ? Array.from(new Set([...currentCharacterIds, entry.rawId])) : currentCharacterIds,
      loreEntryIds: entry.kind === 'lore' ? Array.from(new Set([...currentLoreEntryIds, entry.rawId])) : currentLoreEntryIds
    });
    setWritingRefMenuOpen(null);
  }, [chapterRefs, currentChapter, onUpdateChapterRefs]);
  const removeWritingReference = useCallback(async (entry: (typeof writingReferenceOptions)[number]) => {
    if (!currentChapter) {
      return;
    }

    const currentCharacterIds = chapterRefs?.characterIds ?? [];
    const currentLoreEntryIds = chapterRefs?.loreEntryIds ?? [];

    await onUpdateChapterRefs({
      characterIds: entry.kind === 'character' ? currentCharacterIds.filter((id) => id !== entry.rawId) : currentCharacterIds,
      loreEntryIds: entry.kind === 'lore' ? currentLoreEntryIds.filter((id) => id !== entry.rawId) : currentLoreEntryIds
    });
  }, [chapterRefs, currentChapter, onUpdateChapterRefs]);
  const visibleChapters = query
    ? chapters.filter((chapter, index) => {
        const label = getChapterTitle(chapter, index + 1);
        return `${label} ${chapter.content} ${chapter.goal} ${chapter.outline_user} ${chapter.outline_ai}`.toLowerCase().includes(query);
      })
    : chapters;
  const visibleDeletedChapters = query
    ? deletedChapters.filter((chapter, index) => {
        const label = getChapterTitle(chapter, index + 1);
        return `${label} ${chapter.content}`.toLowerCase().includes(query);
      })
    : deletedChapters;
  const settingsAiConnections = aiConnections.length > 0 ? aiConnections : aiConfig ? [aiConfig] : [];
  const configuredChatModels = settingsAiConnections.flatMap((connection) => [
    connection.defaultModel,
    ...connection.customModels.split(/\r?\n/)
  ])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const fallbackChatModels = CHAT_MODEL_OPTIONS.map((option) => option.value);
  const chatModelValues = configuredChatModels.length > 0 ? configuredChatModels : fallbackChatModels;
  const chatModelOptions = Array.from(new Set([chatModel, ...chatModelValues])).filter(Boolean).map((model) => {
    const preset = CHAT_MODEL_OPTIONS.find((option) => option.value === model);
    return preset ?? { value: model, label: model };
  });

  const currentIndex = currentChapterDisplayNumber ?? currentChapter?.index_no ?? 1;
  const actNumber = Math.max(1, Math.ceil(currentIndex / 10));
  const scopeWordCount =
    scope === 'chapter' && currentChapter
      ? liveWordCount
      : scope === 'selection'
        ? Math.min(liveWordCount, 1200)
        : totalWords;
  const pageEstimate = scopeWordCount > 0 ? Math.max(1, Math.ceil(scopeWordCount / 900)) : 0;
  const readMinutes = scopeWordCount > 0 ? Math.max(1, Math.ceil(scopeWordCount / 420)) : 0;
  const beatText =
    currentChapter?.goal.trim() ||
    currentChapter?.outline_user.trim() ||
    currentChapter?.outline_ai.trim() ||
    '还没有章节摘要。';
  const currentChapterSummaryEntry =
    currentChapter ? timelineChapterSummaries.find((item) => item.chapter_id === currentChapter.id) ?? null : null;
  const currentChapterSummaryText = currentChapterSummaryEntry?.summary.trim() || '还没有章节总结。';
  const isChapterWrapUpDone = useCallback(
    (chapter: Chapter | null | undefined) => Boolean(chapter?.confirmed_fields_json?.includes(CHAPTER_AI_WRAPUP_DONE_FIELD)),
    []
  );
  const currentChapterWrapUpDone = isChapterWrapUpDone(currentChapter);
  const currentTimelineEvents = useMemo(
    () => (currentChapter ? timelineEvents.filter((item) => item.chapter_id === currentChapter.id) : []),
    [currentChapter, timelineEvents]
  );
  const currentTimelineCharacterStates = useMemo(
    () => (currentChapter ? timelineCharacterStates.filter((item) => item.chapter_id === currentChapter.id) : []),
    [currentChapter, timelineCharacterStates]
  );
  const currentTimelineForeshadows = useMemo(
    () => (currentChapter ? timelineForeshadows.filter((item) => item.chapter_id === currentChapter.id) : []),
    [currentChapter, timelineForeshadows]
  );
  const hookText = currentChapter?.next_hook.trim() || '还没有下一步钩子。';
  const chapterTitle = currentChapter ? getChapterTitle(currentChapter, currentIndex) : '未选择章节';
  const chapterDisplayNumberById = useMemo(() => {
    const next = new Map<string, number>();
    chapters.forEach((chapter, index) => {
      next.set(chapter.id, chapter.index_no || index + 1);
    });
    return next;
  }, [chapters]);
  const writingTimelineReferenceText = useMemo(() => {
    if (!currentChapter) {
      return '';
    }
    const currentDisplayNumber = chapterDisplayNumberById.get(currentChapter.id) ?? currentIndex;
    const minDisplayNumber = Math.max(1, currentDisplayNumber - 5);
    const referenceChapters = chapters.filter((chapter, index) => {
      const displayNumber = chapter.index_no || index + 1;
      return displayNumber >= minDisplayNumber && displayNumber < currentDisplayNumber;
    });

    return referenceChapters.map((chapter, index) => {
      const displayNumber = chapterDisplayNumberById.get(chapter.id) ?? index + 1;
      const storyTimes = timelineStoryTimes
        .filter((item) => item.chapter_id === chapter.id)
        .map((item) => `具体时间：${item.time_text}${item.summary ? `，${item.summary}` : ''}`);
      const summaries = timelineChapterSummaries
        .filter((item) => item.chapter_id === chapter.id)
        .map((item) => `章节总结：${item.summary}`);
      const events = timelineEvents
        .filter((item) => item.chapter_id === chapter.id)
        .map((item) => `剧情事件：${item.title} - ${item.summary}`);
      const characterStates = timelineCharacterStates
        .filter((item) => item.chapter_id === chapter.id)
        .map((item) => `人物状态：${item.character_name}${item.summary ? ` - ${item.summary}` : ''}`);

      return [
        `第${displayNumber}章 ${chapter.title || '未命名章节'}`,
        ...storyTimes,
        ...summaries,
        ...events,
        ...characterStates
      ].filter(Boolean).join('\n');
    }).filter(Boolean).join('\n\n');
  }, [chapterDisplayNumberById, chapters, currentChapter, currentIndex, timelineChapterSummaries, timelineCharacterStates, timelineEvents, timelineStoryTimes]);
  const writingOpenForeshadowText = useMemo(() => {
    return storyPits
      .filter((pit) => pit.status !== 'resolved' && pit.progress_status !== 'resolved')
      .map((pit) => [
        `伏笔ID：${pit.id}`,
        `内容：${pit.content}`,
        pit.origin_chapter_index_no ? `埋设：第${pit.origin_chapter_index_no}章 ${pit.origin_chapter_title ?? ''}`.trim() : '',
        pit.note ? `备注：${pit.note}` : ''
      ].filter(Boolean).join('\n'))
      .join('\n\n');
  }, [storyPits]);
  const writingOpenForeshadowRefs = storyPits.filter((pit) => pit.status !== 'resolved' && pit.progress_status !== 'resolved');
  const writingRelationshipContextText = useMemo(() => {
    const characterById = new Map(characters.map((character) => [character.id, character]));
    const structuredRelationships = characterRelationships.map((relationship) => {
      const left = characterById.get(relationship.character_a_id)?.name ?? '未知人物';
      const right = characterById.get(relationship.character_b_id)?.name ?? '未知人物';
      const latestEvent = relationship.events[relationship.events.length - 1];
      return `${left} - ${right}：${relationship.current_label}${latestEvent?.summary ? `（${latestEvent.summary}）` : ''}`;
    });
    const graphRelationships = (chapterRelationshipGraph?.links ?? []).map((link) => {
      const from = chapterRelationshipGraph?.nodes.find((node) => node.id === link.fromId)?.name ?? link.fromId;
      const to = chapterRelationshipGraph?.nodes.find((node) => node.id === link.toId)?.name ?? link.toId;
      return `${from} - ${to}：${link.label}${link.summary ? `（${link.summary}）` : ''}`;
    });

    return Array.from(new Set([...structuredRelationships, ...graphRelationships])).join('\n');
  }, [chapterRelationshipGraph, characterRelationships, characters]);
  const topCharacters = characters.slice(0, 6);
  const topLore = loreEntries.slice(0, 6);
  const writingPlans = useMemo(() => {
    const clues = currentChapter?.planning_clues_json ?? [];
    const statuses = currentChapter?.planning_status_json ?? [];
    return clues.map((content, index) => ({
      index,
      content,
      done: statuses[index] === 'done'
    }));
  }, [currentChapter?.planning_clues_json, currentChapter?.planning_status_json]);
  const writingOpenPlanRefs = writingPlans.filter((plan) => !plan.done);
  const selectedWritingForeshadowRefs = writingOpenForeshadowRefs.filter((pit) => selectedWritingForeshadowRefIds.includes(pit.id));
  const availableWritingForeshadowRefs = writingOpenForeshadowRefs.filter((pit) => !selectedWritingForeshadowRefIds.includes(pit.id));
  const selectedWritingPlanRefs = writingOpenPlanRefs.filter((plan) => selectedWritingPlanRefIndexes.includes(plan.index));
  const availableWritingPlanRefs = writingOpenPlanRefs.filter((plan) => !selectedWritingPlanRefIndexes.includes(plan.index));
  const writingOpenPlanText = useMemo(() => {
    return selectedWritingPlanRefs
      .map((plan, index) => `计划${index + 1}：${plan.content}`)
      .join('\n');
  }, [selectedWritingPlanRefs]);
  const selectedWritingForeshadowText = useMemo(() => {
    return selectedWritingForeshadowRefs
      .map((pit) => [
        `伏笔ID：${pit.id}`,
        `内容：${pit.content}`,
        pit.origin_chapter_index_no ? `埋设：第${pit.origin_chapter_index_no}章 ${pit.origin_chapter_title ?? ''}`.trim() : '',
        pit.note ? `备注：${pit.note}` : ''
      ].filter(Boolean).join('\n'))
      .join('\n\n');
  }, [selectedWritingForeshadowRefs]);
  const filteredWritingPlans = useMemo(() => {
    if (writingPlanFilter === 'done') {
      return writingPlans.filter((plan) => plan.done);
    }
    if (writingPlanFilter === 'open') {
      return writingPlans.filter((plan) => !plan.done);
    }
    return writingPlans;
  }, [writingPlanFilter, writingPlans]);
  const selectedWritingPlan =
    writingPlans.find((plan) => plan.index === selectedWritingPlanIndex) ??
    filteredWritingPlans[0] ??
    writingPlans[0] ??
    null;
  const persistWritingPlans = useCallback(async (plans: string[], statuses?: string[]) => {
    if (!currentChapter) {
      onFeedback('请先选择章节。');
      return null;
    }
    const normalizedPlans = plans.map((item) => item.trim()).filter(Boolean);
    const currentStatuses = statuses ?? currentChapter.planning_status_json ?? [];
    return onUpdateCurrentChapterPatch({
      planning_clues_json: normalizedPlans,
      planning_status_json: normalizedPlans.map((_, index) => currentStatuses[index] === 'done' ? 'done' : 'open')
    });
  }, [currentChapter, onFeedback, onUpdateCurrentChapterPatch]);
  const createWritingPlan = useCallback(async () => {
    if (!currentChapter) {
      onFeedback('请先选择章节。');
      return;
    }
    const nextContents = [...writingPlans.map((plan) => plan.content), '新计划'];
    const nextStatuses = [...writingPlans.map((plan) => plan.done ? 'done' : 'open'), 'open'];
    const saved = await persistWritingPlans(nextContents, nextStatuses);
    if (saved) {
      const nextIndex = Math.max(0, saved.planning_clues_json.length - 1);
      setSelectedWritingPlanIndex(nextIndex);
      setWritingPlanDraft(saved.planning_clues_json[nextIndex] ?? '');
      setWritingPlanFilter('all');
    }
  }, [currentChapter, onFeedback, persistWritingPlans, writingPlans]);
  const persistSelectedWritingPlan = useCallback(async () => {
    if (!currentChapter || !selectedWritingPlan) {
      return;
    }
    const nextText = writingPlanDraft.trim();
    if (!nextText) {
      onFeedback('计划内容不能为空。');
      setWritingPlanDraft(selectedWritingPlan.content);
      return;
    }
    if (nextText === selectedWritingPlan.content) {
      return;
    }
    const nextPlans = writingPlans.map((plan) => (plan.index === selectedWritingPlanIndex ? nextText : plan.content));
    const nextStatuses = writingPlans.map((plan) => plan.done ? 'done' : 'open');
    const saved = await persistWritingPlans(nextPlans, nextStatuses);
    if (saved) {
      setWritingPlanDraft(saved.planning_clues_json[selectedWritingPlanIndex] ?? '');
    }
  }, [currentChapter, onFeedback, persistWritingPlans, selectedWritingPlan, selectedWritingPlanIndex, writingPlanDraft, writingPlans]);
  const setSelectedWritingPlanDone = useCallback(async (done: boolean) => {
    if (!currentChapter || !selectedWritingPlan) {
      return;
    }
    const nextPlans = writingPlans.map((plan) => plan.content);
    const nextStatuses = writingPlans.map((plan) => (plan.index === selectedWritingPlan.index ? (done ? 'done' : 'open') : (plan.done ? 'done' : 'open')));
    await persistWritingPlans(nextPlans, nextStatuses);
  }, [currentChapter, persistWritingPlans, selectedWritingPlan, writingPlans]);
  const deleteWritingPlan = useCallback(async (indexToDelete: number) => {
    if (!currentChapter) {
      onFeedback('请先选择章节。');
      return;
    }
    const nextPlans = writingPlans.filter((plan) => plan.index !== indexToDelete).map((plan) => plan.content);
    const nextStatuses = writingPlans.filter((plan) => plan.index !== indexToDelete).map((plan) => plan.done ? 'done' : 'open');
    const saved = await persistWritingPlans(nextPlans, nextStatuses);
    if (saved) {
      const nextIndex = Math.min(indexToDelete, Math.max(0, saved.planning_clues_json.length - 1));
      setSelectedWritingPlanIndex(nextIndex);
      setWritingPlanDraft(saved.planning_clues_json[nextIndex] ?? '');
    }
  }, [currentChapter, onFeedback, persistWritingPlans, writingPlans]);
  useEffect(() => {
    if (writingPlans.length === 0) {
      setSelectedWritingPlanIndex(0);
      setWritingPlanDraft('');
      return;
    }
    const nextIndex = selectedWritingPlan?.index ?? Math.min(selectedWritingPlanIndex, writingPlans.length - 1);
    if (nextIndex !== selectedWritingPlanIndex) {
      setSelectedWritingPlanIndex(nextIndex);
    }
    setWritingPlanDraft(selectedWritingPlan?.content ?? writingPlans[nextIndex]?.content ?? '');
  }, [currentChapter?.id, selectedWritingPlan?.index, selectedWritingPlanIndex, writingPlans]);
  const filteredForeshadowPits = useMemo(() => {
    return storyPits.filter((pit) => {
      if (foreshadowFilter === 'resolved') {
        return pit.status === 'resolved' || pit.progress_status === 'resolved';
      }
      if (foreshadowFilter === 'open') {
        return pit.status !== 'resolved' && pit.progress_status !== 'resolved';
      }
      if (foreshadowFilter === 'active') {
        return pit.progress_status === 'partial' || pit.progress_status === 'clear';
      }
      return true;
    });
  }, [foreshadowFilter, storyPits]);
  const selectedForeshadow =
    storyPits.find((pit) => pit.id === selectedForeshadowId) ??
    filteredForeshadowPits[0] ??
    storyPits[0] ??
    null;
  const selectedForeshadowRecords = selectedForeshadow
    ? timelineForeshadows.filter((record) => foreshadowRecordMatchesPit(record, selectedForeshadow))
    : [];
  const getForeshadowResponseCount = useCallback(
    (pit: StoryPitView) => timelineForeshadows.filter((record) => foreshadowRecordMatchesPit(record, pit)).length,
    [timelineForeshadows]
  );
  const persistSelectedForeshadow = useCallback(async () => {
    if (!selectedForeshadow) {
      return;
    }
    const content = foreshadowContentDraft.trim();
    const note = foreshadowNoteDraft.trim();
    if (!content) {
      onFeedback('伏笔内容不能为空。');
      return;
    }
    if (content === selectedForeshadow.content && note === (selectedForeshadow.note ?? '')) {
      return;
    }
    setForeshadowSaving(true);
    const saved = await onUpdateForeshadowPit(selectedForeshadow.id, { content, note });
    setForeshadowSaving(false);
    if (saved) {
      setForeshadowContentDraft(saved.content);
      setForeshadowNoteDraft(saved.note ?? '');
    }
  }, [foreshadowContentDraft, foreshadowNoteDraft, onFeedback, onUpdateForeshadowPit, selectedForeshadow]);
  const createForeshadow = useCallback(async () => {
    const created = await onCreateForeshadowPit({
      content: '新伏笔',
      note: '在这里补充这个伏笔的说明、预计回收方式和相关人物。'
    });
    if (created) {
      setSelectedForeshadowId(created.id);
      setForeshadowContentDraft(created.content);
      setForeshadowNoteDraft(created.note ?? '');
      setForeshadowFilter('all');
    }
  }, [onCreateForeshadowPit]);
  useEffect(() => {
    if (!selectedForeshadow) {
      setSelectedForeshadowId(null);
      setForeshadowContentDraft('');
      setForeshadowNoteDraft('');
      return;
    }
    if (selectedForeshadow.id !== selectedForeshadowId) {
      setSelectedForeshadowId(selectedForeshadow.id);
    }
    setForeshadowContentDraft(selectedForeshadow.content);
    setForeshadowNoteDraft(selectedForeshadow.note ?? '');
  }, [selectedForeshadow?.id]);

  const relationshipCharacters = characters;
  const [relationshipSelectedId, setRelationshipSelectedId] = useState<string | null>(relationshipCharacters[0]?.id ?? null);
  const [relationshipDetailsDraft, setRelationshipDetailsDraft] = useState('');
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  const [relationshipAiRunning, setRelationshipAiRunning] = useState(false);
  const [relationshipGraphMode, setRelationshipGraphMode] = useState<RelationshipGraphMode>('library');
  const [chapterRelationshipAiRunning, setChapterRelationshipAiRunning] = useState(false);
  const [timelineAiRunning, setTimelineAiRunning] = useState(false);
  const [timelineStatusText, setTimelineStatusText] = useState('');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('events');
  const [timelineSelectedChapterId, setTimelineSelectedChapterId] = useState<string | null>(currentChapter?.id ?? chapters[0]?.id ?? null);
  const [timelineRangeStart, setTimelineRangeStart] = useState('1');
  const [timelineRangeEnd, setTimelineRangeEnd] = useState('15');
  const [timelineDetailOpen, setTimelineDetailOpen] = useState(Boolean(currentChapter ?? chapters[0]));
  const [timelineDetailPosition, setTimelineDetailPosition] = useState<{ x: number; y: number } | null>(null);
  const [timelineDetailDragging, setTimelineDetailDragging] = useState(false);
  const [relationshipNodePositionsByLayout, setRelationshipNodePositionsByLayout] = useState<Record<string, Record<string, { x: number; y: number }>>>({});
  const [relationshipDraggingId, setRelationshipDraggingId] = useState<string | null>(null);
  const libraryRelationshipCharacters = relationshipCharacters;
  const currentChapterRelationshipGraph = currentChapter ? chapterRelationshipGraph ?? { nodes: [], links: [] } : { nodes: [], links: [] };
  const activeRelationshipCharacters =
    relationshipGraphMode === 'chapter' ? currentChapterRelationshipGraph.nodes : libraryRelationshipCharacters;
  const relationshipLayoutKey = relationshipGraphMode === 'chapter'
    ? `chapter:${currentChapter?.id ?? 'none'}`
    : `library:${activeProject.id}`;
  const relationshipNodePositions = relationshipNodePositionsByLayout[relationshipLayoutKey] ?? {};
  const selectedRelationshipCharacter =
    activeRelationshipCharacters.find((entry) => entry.id === relationshipSelectedId) ?? activeRelationshipCharacters[0] ?? null;
  const relationshipGraphNodes = activeRelationshipCharacters.map((entry, index) => ({
    entry,
    ...(relationshipNodePositions[entry.id] ?? getRelationshipNodePosition(index, activeRelationshipCharacters.length))
  }));
  const selectedLibraryRelationshipCharacter =
    relationshipGraphMode === 'library'
      ? characters.find((entry) => entry.id === relationshipSelectedId) ?? null
      : null;
  const relationshipNodeIndexById = new Map(relationshipGraphNodes.map((node, index) => [node.entry.id, index]));
  const chapterGraphLinks = mergeRelationshipRenderLinks(currentChapterRelationshipGraph.links
    .map((link) => {
      const from = relationshipNodeIndexById.get(link.fromId);
      const to = relationshipNodeIndexById.get(link.toId);
      if (from === undefined || to === undefined) {
        return null;
      }
      return { from, to, inferred: false, label: link.label };
    })
    .filter((link): link is RelationshipRenderLink => link !== null));
  const libraryExplicitRelationshipLinks: RelationshipRenderLink[] = [];
  if (relationshipGraphMode === 'library') {
    relationshipGraphNodes.forEach((fromNode, fromIndex) => {
      relationshipGraphNodes.slice(fromIndex + 1).forEach((toNode, offset) => {
        const toIndex = fromIndex + offset + 1;
        const fromText = `${fromNode.entry.summary}\n${fromNode.entry.details}`;
        const toText = `${toNode.entry.summary}\n${toNode.entry.details}`;
        const structuredRelationship = characterRelationships.find((relationship) =>
          (relationship.character_a_id === fromNode.entry.id && relationship.character_b_id === toNode.entry.id) ||
          (relationship.character_a_id === toNode.entry.id && relationship.character_b_id === fromNode.entry.id)
        );
        if (structuredRelationship || fromText.includes(toNode.entry.name) || toText.includes(fromNode.entry.name)) {
          libraryExplicitRelationshipLinks.push({
            from: fromIndex,
            to: toIndex,
            inferred: false,
            label: structuredRelationship?.current_label || getRelationshipLinkLabel(fromNode.entry, toNode.entry)
          });
        }
      });
    });
  }
  const relationshipLinks = relationshipGraphMode === 'chapter'
    ? chapterGraphLinks
    : libraryExplicitRelationshipLinks.length > 0
      ? mergeRelationshipRenderLinks(libraryExplicitRelationshipLinks)
      : relationshipGraphNodes.slice(1).map((_node, index) => ({
          from: index,
          to: index + 1,
          inferred: true,
          label: getRelationshipLinkLabel(relationshipGraphNodes[index].entry, relationshipGraphNodes[index + 1].entry)
        }));
  const selectedChapterRelationshipLinks = selectedRelationshipCharacter
    ? currentChapterRelationshipGraph.links
        .filter((link) => link.fromId === selectedRelationshipCharacter.id || link.toId === selectedRelationshipCharacter.id)
        .map((link) => {
          const otherId = link.fromId === selectedRelationshipCharacter.id ? link.toId : link.fromId;
          const otherName = currentChapterRelationshipGraph.nodes.find((entry) => entry.id === otherId)?.name ?? '未知人物';
          return { ...link, otherName };
        })
    : [];
  const findCharacterRelationship = useCallback(
    (leftId: string, rightId: string) =>
      characterRelationships.find((relationship) =>
        (relationship.character_a_id === leftId && relationship.character_b_id === rightId) ||
        (relationship.character_a_id === rightId && relationship.character_b_id === leftId)
      ) ?? null,
    [characterRelationships]
  );
  const selectedLibraryRelationshipLinks =
    relationshipGraphMode === 'library' && selectedRelationshipCharacter
      ? libraryRelationshipCharacters
          .filter((entry) => entry.id !== selectedRelationshipCharacter.id)
          .map((entry) => {
            const relationship = findCharacterRelationship(selectedRelationshipCharacter.id, entry.id);
            return {
              id: entry.id,
              name: entry.name,
              label: relationship?.current_label ?? extractRelationshipLabel(relationshipDetailsDraft || selectedRelationshipCharacter.details, entry.name),
              events: compactRelationshipEvents(relationship?.events ?? [])
            };
          })
      : [];
  const parsedTimelineRangeStart = Number.parseInt(timelineRangeStart.trim(), 10);
  const parsedTimelineRangeEnd = Number.parseInt(timelineRangeEnd.trim(), 10);
  const timelineSelectedRangeStart = Number.isFinite(parsedTimelineRangeStart) && parsedTimelineRangeStart > 0
    ? parsedTimelineRangeStart
    : 1;
  const timelineSelectedRangeEnd = Math.max(
    timelineSelectedRangeStart,
    Number.isFinite(parsedTimelineRangeEnd) && parsedTimelineRangeEnd > 0
      ? parsedTimelineRangeEnd
      : timelineSelectedRangeStart
  );
  const chapterByDisplayNumber = useMemo(() => {
    const next = new Map<number, Chapter>();
    chapters.forEach((chapter, index) => {
      next.set(chapter.index_no || index + 1, chapter);
    });
    return next;
  }, [chapters]);
  const timelineMaxDisplayNumber = Math.max(
    chapters.length,
    ...chapters.map((chapter, index) => chapter.index_no || index + 1)
  );
  const timelineEffectiveRangeEnd = Math.min(timelineSelectedRangeEnd, Math.max(timelineSelectedRangeStart, timelineMaxDisplayNumber));
  const timelineWindowStart = getTimelineWindowStart(timelineSelectedRangeStart, timelineEffectiveRangeEnd);
  const timelineWindowEnd = timelineWindowStart + TIMELINE_WINDOW_SIZE - 1;
  const timelineRangeIsCompressed = timelineEffectiveRangeEnd - timelineSelectedRangeStart + 1 > TIMELINE_WINDOW_SIZE;
  const timelineDisplayNumbers = useMemo(
    () => getCompressedTimelineDisplayNumbers(timelineSelectedRangeStart, timelineEffectiveRangeEnd),
    [timelineEffectiveRangeEnd, timelineSelectedRangeStart]
  );
  const timelineSlots = useMemo(
    () =>
      TIMELINE_SLOT_POINTS.map((point, index) => {
        const displayNumber = timelineDisplayNumbers[index] ?? timelineWindowStart + index;
        const chapter = typeof displayNumber === 'number' ? chapterByDisplayNumber.get(displayNumber) ?? null : null;
        return {
          slotIndex: index + 1,
          isGap: displayNumber === 'gap',
          inSelectedRange: typeof displayNumber === 'number' && displayNumber >= timelineSelectedRangeStart && displayNumber <= timelineEffectiveRangeEnd,
          point,
          chapter,
          displayNumber,
          events: chapter ? timelineEvents.filter((event) => event.chapter_id === chapter.id) : [],
          chapterSummaries: chapter ? timelineChapterSummaries.filter((item) => item.chapter_id === chapter.id) : [],
          characterStates: chapter ? timelineCharacterStates.filter((state) => state.chapter_id === chapter.id) : [],
          foreshadows: chapter ? timelineForeshadows.filter((item) => item.chapter_id === chapter.id) : [],
          storyTimes: chapter ? timelineStoryTimes.filter((item) => item.chapter_id === chapter.id) : []
        };
      }),
    [chapterByDisplayNumber, timelineChapterSummaries, timelineCharacterStates, timelineDisplayNumbers, timelineEffectiveRangeEnd, timelineEvents, timelineForeshadows, timelineSelectedRangeStart, timelineStoryTimes, timelineWindowStart]
  );
  const selectedTimelineChapter =
    chapters.length === 0
      ? null
      :
    timelineSlots.find((node) => node.chapter?.id === timelineSelectedChapterId) ??
    timelineSlots.find((node) => node.chapter?.id === currentChapter?.id) ??
    timelineSlots.find((node) => node.chapter !== null) ??
    null;
  const timelineStoryPath = TIMELINE_STORY_PATH;
  const openTimelineDetailForChapter = useCallback((chapterId: string | null = currentChapter?.id ?? null) => {
    if (!chapterId) {
      return;
    }

    const target = timelineMapRef.current?.querySelector<HTMLButtonElement>(
      `.st-storyline-node[data-chapter-id="${CSS.escape(chapterId)}"]`
    );
    if (target) {
      const anchorRect = target.getBoundingClientRect();
      timelineDetailAnchorRectRef.current = anchorRect;
      setTimelineDetailPosition(getTimelineDetailPositionFromRect(anchorRect));
    }
    setTimelineSelectedChapterId(chapterId);
    setTimelineDetailOpen(true);
  }, [currentChapter?.id]);

  useEffect(() => {
    if (chapters.length === 0) {
      setTimelineSelectedChapterId(null);
      setTimelineDetailOpen(false);
      return;
    }
    if (!timelineSelectedChapterId || !timelineSlots.some((node) => node.chapter?.id === timelineSelectedChapterId)) {
      setTimelineSelectedChapterId(currentChapter?.id ?? timelineSlots.find((node) => node.chapter !== null)?.chapter?.id ?? null);
    }
  }, [chapters.length, currentChapter?.id, timelineSelectedChapterId, timelineSlots]);

  useEffect(() => {
    setTimelineRangeStart((current) => {
      if (current.trim().length > 0) {
        return current;
      }
      return '1';
    });
    setTimelineRangeEnd((current) => {
      if (current.trim().length > 0 && current !== '15') {
        return current;
      }
      return String(Math.max(1, Math.min(chapters.length, TIMELINE_WINDOW_SIZE)));
    });
  }, [chapters.length]);

  useEffect(() => {
    if (!timelineRangeSelectPendingRef.current) {
      return;
    }
    timelineRangeSelectPendingRef.current = false;

    if (chapters.length === 0 || !Number.isFinite(parsedTimelineRangeEnd) || parsedTimelineRangeEnd < 1) {
      return;
    }

    const targetChapter = chapterByDisplayNumber.get(timelineEffectiveRangeEnd);
    if (!targetChapter) {
      return;
    }

    setTimelineSelectedChapterId(targetChapter.id);
    openTimelineDetailForChapter(targetChapter.id);
  }, [chapterByDisplayNumber, chapters.length, openTimelineDetailForChapter, parsedTimelineRangeEnd, timelineEffectiveRangeEnd]);

  useEffect(() => {
    if (studioTab !== 'timeline') {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && timelineDetailRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('.st-storyline-node')) {
        return;
      }
      setTimelineDetailOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [studioTab]);

  useEffect(() => {
    if (studioTab !== 'timeline' || !timelineDetailOpen || !timelineSelectedChapterId || !timelineMapRef.current) {
      return;
    }

    const target = timelineMapRef.current.querySelector<HTMLButtonElement>(
      `.st-storyline-node[data-chapter-id="${CSS.escape(timelineSelectedChapterId)}"]`
    );
    if (!target) {
      return;
    }
    const anchorRect = target.getBoundingClientRect();
    timelineDetailAnchorRectRef.current = anchorRect;
    const nextPosition = getTimelineDetailPositionFromRect(anchorRect);
    const detailRect = timelineDetailRef.current?.getBoundingClientRect();
    setTimelineDetailPosition(
      detailRect
        ? getTimelineDetailPositionFromRects(anchorRect, detailRect.width, detailRect.height)
        : nextPosition
    );
  }, [studioTab, timelineDetailOpen, timelineSelectedChapterId, timelineSlots]);

  useLayoutEffect(() => {
    if (!timelineDetailOpen || !timelineDetailRef.current || !timelineDetailAnchorRectRef.current) {
      return;
    }

    const detailRect = timelineDetailRef.current.getBoundingClientRect();
    setTimelineDetailPosition(
      getTimelineDetailPositionFromRects(timelineDetailAnchorRectRef.current, detailRect.width, detailRect.height)
    );
  }, [timelineDetailOpen, selectedTimelineChapter?.chapter?.id, timelineMode]);

  useEffect(() => {
    setRelationshipNodePositionsByLayout((allLayouts) => {
      const current = allLayouts[relationshipLayoutKey] ?? {};
      let changed = false;
      const next: Record<string, { x: number; y: number }> = {};
      activeRelationshipCharacters.forEach((entry, index) => {
        const existing = current[entry.id];
        if (existing) {
          next[entry.id] = existing;
          return;
        }
        next[entry.id] = getRelationshipNodePosition(index, activeRelationshipCharacters.length);
        changed = true;
      });

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }
      if (!changed) {
        return allLayouts;
      }
      return {
        ...allLayouts,
        [relationshipLayoutKey]: next
      };
    });
  }, [activeRelationshipCharacters, relationshipLayoutKey]);

  useEffect(() => {
    if (activeRelationshipCharacters.length === 0) {
      setRelationshipSelectedId(null);
      return;
    }
    if (!relationshipSelectedId || !activeRelationshipCharacters.some((entry) => entry.id === relationshipSelectedId)) {
      setRelationshipSelectedId(activeRelationshipCharacters[0].id);
    }
  }, [activeRelationshipCharacters, relationshipSelectedId]);

  useEffect(() => {
    if (relationshipGraphMode === 'library') {
      setRelationshipDetailsDraft(selectedLibraryRelationshipCharacter?.details ?? '');
    }
  }, [relationshipGraphMode, selectedLibraryRelationshipCharacter?.details, selectedLibraryRelationshipCharacter?.id]);

  const persistRelationshipDetails = useCallback(async () => {
    if (!selectedLibraryRelationshipCharacter) {
      return;
    }
    const nextDetails = relationshipDetailsDraft.trim();
    if (nextDetails === selectedLibraryRelationshipCharacter.details) {
      return;
    }
    setRelationshipSaving(true);
    await onUpdateCharacterDetails(selectedLibraryRelationshipCharacter.id, nextDetails);
    setRelationshipSaving(false);
  }, [onUpdateCharacterDetails, relationshipDetailsDraft, selectedLibraryRelationshipCharacter]);

  const syncChapterRelationshipGraphToLibrary = useCallback(
    async (graph: ChapterRelationshipGraph): Promise<number> => {
      const libraryCharacterByName = new Map<string, Character>();
      for (const character of characters) {
        const name = normalizeRelationshipName(character.name);
        if (name) {
          libraryCharacterByName.set(name, character);
        }
      }
      const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      const relationshipKeys = new Set<string>();

      for (const link of graph.links) {
        const fromNode = graphNodeById.get(link.fromId);
        const toNode = graphNodeById.get(link.toId);
        if (!fromNode || !toNode) {
          continue;
        }

        const fromCharacter = libraryCharacterByName.get(normalizeRelationshipName(fromNode.name));
        const toCharacter = libraryCharacterByName.get(normalizeRelationshipName(toNode.name));
        if (!fromCharacter || !toCharacter) {
          continue;
        }

        const label = link.label.trim();
        if (!label) {
          continue;
        }

        const key = [fromCharacter.id, toCharacter.id].sort().join(':');
        relationshipKeys.add(key);
        await onUpsertCharacterRelationship({
          projectId: activeProject.id,
          characterAId: fromCharacter.id,
          characterBId: toCharacter.id,
          label,
          chapterId: currentChapter?.id ?? null,
          summary: link.summary
        });
      }

      return relationshipKeys.size;
    },
    [activeProject.id, characters, currentChapter?.id, onUpsertCharacterRelationship]
  );

  useEffect(() => {
    if (relationshipGraphMode !== 'library' || currentChapterRelationshipGraph.nodes.length === 0) {
      return;
    }

    const syncKey = JSON.stringify({
      chapterId: currentChapter?.id ?? '',
      nodes: currentChapterRelationshipGraph.nodes.map((node) => [node.id, node.name]),
      links: currentChapterRelationshipGraph.links.map((link) => [link.fromId, link.toId, link.label])
    });
    if (syncedChapterRelationshipGraphKeyRef.current === syncKey) {
      return;
    }

    syncedChapterRelationshipGraphKeyRef.current = syncKey;
    void syncChapterRelationshipGraphToLibrary(currentChapterRelationshipGraph);
  }, [currentChapter?.id, currentChapterRelationshipGraph, relationshipGraphMode, syncChapterRelationshipGraphToLibrary]);

  const runRelationshipGraphAi = useCallback(async () => {
    if (!currentChapter) {
      onFeedback('请先选中一章，再更新人物关系图。');
      return;
    }
    if (relationshipCharacters.length === 0) {
      onFeedback('当前章节还没有添加人物引用，无法更新关系图。');
      return;
    }

    await persistRelationshipDetails();

    const chapterRefLoreNames = (chapterRefs?.loreEntryIds ?? [])
      .map((loreEntryId) => loreEntries.find((entry) => entry.id === loreEntryId)?.title ?? '')
      .filter((name) => name.trim().length > 0);
    const templates = aiPromptTemplates ?? DEFAULT_AI_PROMPT_TEMPLATES;
    const characterContext = relationshipCharacters
      .map((entry) => [
        `人物：${entry.name}`,
        entry.role_type ? `别名/定位：${entry.role_type}` : '',
        entry.summary ? `摘要：${entry.summary}` : '',
        entry.details ? `已有关系：${entry.details}` : '已有关系：空'
      ].filter(Boolean).join('\n'))
      .join('\n\n');

    const instruction = [
      '任务：AI 更新关系图',
      templates.relationshipGraph,
      `当前章节：第 ${currentChapterDisplayNumber ?? currentChapter.index_no} 章《${currentChapter.title || '未命名章节'}》`,
      editor.content.trim() ? `当前章节正文：\n${editor.content.trim()}` : '当前章节正文：空',
      `当前章节涉及人物：${relationshipCharacters.map((entry) => entry.name).join('、')}`,
      chapterRefLoreNames.length > 0 ? `当前章节引用设定：${chapterRefLoreNames.join('、')}` : '当前章节引用设定：无',
      `当前人物关系记忆：\n${characterContext}`
    ].join('\n\n');

    setRelationshipAiRunning(true);
    try {
      const result = await onRunWritingAi({ instruction });
      if (!result?.message.trim()) {
        onFeedback('AI 没有返回可用的关系图数据。');
        return;
      }

      let updates: Array<{ characterName: string; details: string }> = [];
      try {
        updates = parseRelationshipGraphUpdates(result.message);
      } catch {
        onFeedback('AI 返回的关系图不是可解析的 JSON，请检查人物关系图 Prompt。');
        return;
      }

      const characterByName = new Map(relationshipCharacters.map((entry) => [entry.name.trim(), entry]));
      let updatedCount = 0;
      for (const item of updates) {
        const character = characterByName.get(item.characterName);
        if (!character) {
          continue;
        }
        const saved = await onUpdateCharacterDetails(character.id, item.details);
        if (saved) {
          updatedCount += 1;
          if (saved.id === selectedRelationshipCharacter?.id) {
            setRelationshipDetailsDraft(saved.details);
          }
        }
      }

      if (updatedCount === 0) {
        onFeedback('AI 没有匹配到当前章节人物，请检查返回的人物名。');
        return;
      }
      onFeedback(`已更新 ${updatedCount} 个人物的关系图`);
    } finally {
      setRelationshipAiRunning(false);
    }
  }, [
    aiPromptTemplates,
    chapterRefs,
    currentChapter,
    currentChapterDisplayNumber,
    editor.content,
    loreEntries,
    onFeedback,
    onRunWritingAi,
    onUpdateCharacterDetails,
    persistRelationshipDetails,
    relationshipCharacters,
    selectedRelationshipCharacter
  ]);

  const runChapterRelationshipGraphAi = useCallback(async (nextMode: RelationshipGraphMode = 'chapter') => {
    if (!currentChapter) {
      onFeedback('请先选中一章，再生成当前章节关系图。');
      return;
    }
    if (!editor.content.trim()) {
      onFeedback('当前章节还没有正文，无法生成章节关系图。');
      return;
    }

    const instruction = [
      '任务：生成当前章节关系图',
      '只根据当前章节正文判断本章出现的人物和人物关系，不要使用资料库里的长期关系记忆，也不要补写正文没有描述的关系。',
      '请先列出当前章节里出现的全部人物节点，即使资料库里没有这个人物也要输出。',
      '关系标签必须是 2 到 8 个汉字的短关系名，比如：青梅竹马、邻居、亲兄弟、同伴、敌人。没有明确关系不要输出这条边。',
      '请只输出 JSON：{"characters":[{"name":"人物名","role":"角色定位","summary":"一句话简介"}],"items":[{"from":"人物名","to":"人物名","label":"短关系名","summary":"一句话说明正文中哪里体现了这个关系"}]}，不要输出解释、标题或 Markdown。',
      `当前章节：第 ${currentChapterDisplayNumber ?? currentChapter.index_no} 章《${currentChapter.title || '未命名章节'}》`,
      editor.content.trim() ? `当前章节正文：\n${editor.content.trim()}` : '当前章节正文：空'
    ].join('\n\n');

    setChapterRelationshipAiRunning(true);
    try {
      const result = await onRunWritingAi({ instruction });
      if (!result?.message.trim()) {
        onFeedback('AI 没有返回当前章节关系图。');
        return;
      }

      let graph: ChapterRelationshipGraph = { nodes: [], links: [] };
      try {
        graph = parseChapterRelationshipGraphUpdates(result.message);
      } catch {
        onFeedback('AI 返回的章节关系图不是可解析的 JSON。');
        return;
      }

      if (graph.nodes.length === 0) {
        await onUpdateChapterRelationshipGraph({ nodes: [], links: [] });
        onFeedback('当前章节没有解析到人物节点。');
        return;
      }

      await onUpdateChapterRelationshipGraph(graph);
      const syncedCount = await syncChapterRelationshipGraphToLibrary(graph);
      setRelationshipGraphMode(nextMode);
      setRelationshipSelectedId(graph.links[0]?.fromId ?? graph.nodes[0].id);
      onFeedback(`已生成 ${graph.nodes.length} 个当前章节人物节点和 ${graph.links.length} 条关系，同步 ${syncedCount} 个资料库人物`);
    } finally {
      setChapterRelationshipAiRunning(false);
    }
  }, [
    currentChapter,
    currentChapterDisplayNumber,
    editor.content,
    onFeedback,
    onRunWritingAi,
    onUpdateChapterRelationshipGraph,
    syncChapterRelationshipGraphToLibrary
  ]);

  const runTimelineEventAi = useCallback(async () => {
    if (!currentChapter) {
      setTimelineStatusText('请先在顶部章节选择里选中一章。');
      onFeedback('请先选中一章，再更新时间线。');
      return;
    }
    if (!editor.content.trim()) {
      setTimelineStatusText('当前章节还没有正文，无法生成时间线。');
      onFeedback('当前章节还没有正文，无法生成时间线。');
      return;
    }

    const timelineAiContent = compactTimelineAiContent(editor.content);
    const templates = aiPromptTemplates ?? DEFAULT_AI_PROMPT_TEMPLATES;
    const currentDisplayNumber = currentChapterDisplayNumber ?? currentChapter.index_no;
    const storyTimeReferenceText = getTimelinePrecedingChapterContextText(
      chapters,
      currentDisplayNumber,
      timelineStoryTimes,
      timelineChapterSummaries,
      timelineEvents,
      timelineCharacterStates,
      timelineForeshadows,
      TIMELINE_STORY_TIME_REFERENCE_WINDOW
    );
    const layerReferenceText = getTimelinePrecedingChapterContextText(
      chapters,
      currentDisplayNumber,
      timelineStoryTimes,
      timelineChapterSummaries,
      timelineEvents,
      timelineCharacterStates,
      timelineForeshadows,
      TIMELINE_LAYER_REFERENCE_WINDOW
    );
    const foreshadowCandidatesText = getForeshadowCandidateText(storyPits, currentDisplayNumber, TIMELINE_LAYER_REFERENCE_WINDOW);
    const runWithTimeout = async (instruction: string): Promise<WritingAiActionResult | null> => {
      let timedOut = false;
      const result = await Promise.race([
        onRunWritingAi({ instruction }),
        new Promise<WritingAiActionResult | null>((resolve) => {
          window.setTimeout(() => {
            timedOut = true;
            resolve(null);
          }, 180000);
        })
      ]);
      if (timedOut) {
        return null;
      }
      return result;
    };

    const storyTimeInstruction = [
      templates.timelineStoryTime,
      `前文时间线摘要：\n${storyTimeReferenceText}`,
      '请优先结合前文时间判断当前章节是否发生在穿越前、穿越后、回忆、倒叙或插叙位置。',
      '重要：没有日历日期不等于未知。只要正文能明确推出“穿越前/穿越后第几天、刚穿越、回到小时候、几岁、八九十年代、季节、早晨/夜晚”等，就必须写成具体的相对故事时间，timeType 用 relative。',
      '例如：正文写“林风六岁”“晨光”“老式木床”“刚穿越回八九十年代”，应输出 timeText 为“刚穿越回八九十年代的小时候，穿越后第一天清晨”，不能输出未知时间。',
      '只有正文完全没有任何时代、阶段、先后、昼夜、季节、年龄线索时，才允许 unknown。',
      `当前章节：第 ${currentDisplayNumber} 章《${currentChapter.title || '未命名章节'}》`,
      `当前章节正文：\n${timelineAiContent}`
    ].join('\n\n');

    let timedOut = false;
    setTimelineStatusText('正在提取具体时间...');
    setTimelineAiRunning(true);
    try {
      const storyTimeResult = await runWithTimeout(storyTimeInstruction);
      if (!storyTimeResult) {
        timedOut = true;
      }
      if (timedOut) {
        setTimelineStatusText('模型响应时间过长，本次已停止等待。可以换更快的模型，或稍后再试。');
        onFeedback('AI 更新时间线超时');
        return;
      }
      if (!storyTimeResult?.message.trim()) {
        setTimelineStatusText('AI 没有返回具体时间内容。');
        onFeedback('AI 没有返回具体时间内容。');
        return;
      }

      let storyTimeData: TimelineLayerParseResult = { storyTime: null, chapterSummary: null, events: [], characterStates: [], foreshadows: [], foreshadowSync: [] };
      try {
        storyTimeData = parseTimelineLayerUpdates(storyTimeResult.message);
      } catch {
        setTimelineStatusText('AI 返回的具体时间内容不是可解析的 JSON。');
        onFeedback('AI 返回的具体时间内容不是可解析的 JSON。');
        return;
      }

      const storyTimeAnchor = storyTimeData.storyTime;
      const storyTimeAnchorText = storyTimeAnchor
        ? `本章具体时间：${storyTimeAnchor.time_text || '未知'}（${storyTimeAnchor.time_type}）\n说明：${storyTimeAnchor.summary || '无'}`
        : '本章具体时间：未知';

      const instruction = [
        templates.timeline,
        `前文时间线摘要：\n${layerReferenceText}`,
        storyTimeAnchorText,
        '后续输出必须以上述具体时间为锚点，剧情事件、人物状态和伏笔动作都要重点参考当前章节时间，同时共同参考前 10 章时间线，不要改写时间。如果正文明显是穿越前、回忆或倒叙，就把时间放在前文时间之前。',
        `当前章节：第 ${currentDisplayNumber} 章《${currentChapter.title || '未命名章节'}》`,
        `当前章节正文：\n${timelineAiContent}`,
        `当前章节之前未回收/推进中的伏笔候选：\n${foreshadowCandidatesText}`
      ].join('\n\n');

      setTimelineStatusText('正在生成具体时间、剧情、人物状态和伏笔...');
      const result = await runWithTimeout(instruction);
      if (!result) {
        timedOut = true;
      }
      if (timedOut) {
        setTimelineStatusText('模型响应时间过长，本次已停止等待。可以换更快的模型，或稍后再试。');
        onFeedback('AI 更新时间线超时');
        return;
      }
      if (!result?.message.trim()) {
        setTimelineStatusText('AI 没有返回时间线内容。');
        onFeedback('AI 没有返回时间线内容。');
        return;
      }

      let data: TimelineLayerParseResult = { storyTime: storyTimeAnchor ?? null, chapterSummary: null, events: [], characterStates: [], foreshadows: [], foreshadowSync: [] };
      try {
        data = parseTimelineLayerUpdates(result.message);
      } catch {
        setTimelineStatusText('AI 返回的时间线内容不是可解析的 JSON。');
        onFeedback('AI 返回的时间线内容不是可解析的 JSON。');
        return;
      }
      if (!data.storyTime && storyTimeAnchor) {
        data.storyTime = storyTimeAnchor;
      }
      if (!data.chapterSummary && storyTimeData.chapterSummary) {
        data.chapterSummary = storyTimeData.chapterSummary;
      }

      await onReplaceChapterTimelineLayers(data);
      let syncedForeshadows = 0;
      for (const item of data.foreshadowSync) {
        const content = (item.title || item.summary || item.clue).trim();
        if (!content) {
          continue;
        }
        const note = [
          item.summary,
          item.clue ? `证据：${item.clue}` : '',
          item.payoff ? `回收：${item.payoff}` : '',
          item.confidence !== null ? `置信度：${item.confidence}` : ''
        ].filter(Boolean).join('\n');
        if (item.pitId) {
          const saved = await onRecordForeshadowResponse({
            pitId: item.pitId,
            outcome: getTimelineForeshadowOutcome(item.status),
            note
          });
          if (saved) {
            syncedForeshadows += 1;
          }
          continue;
        }

        if (/埋设|新伏笔/u.test(item.status)) {
          const created = await onCreateChapterForeshadowPit({
            content,
            note
          });
          if (created) {
            syncedForeshadows += 1;
          }
        }
      }
      openTimelineDetailForChapter(currentChapter.id);
      const totalCount = (data.storyTime ? 1 : 0) + (data.chapterSummary?.summary ? 1 : 0) + data.events.length + data.characterStates.length + data.foreshadows.length;
      const status = totalCount > 0
        ? `已更新 ${data.storyTime ? 1 : 0} 条具体时间、${data.chapterSummary?.summary ? 1 : 0} 条章节总结、${data.events.length} 条剧情、${data.characterStates.length} 条人物状态、${data.foreshadows.length} 条伏笔${syncedForeshadows > 0 ? `，同步 ${syncedForeshadows} 条伏笔库记录` : ''}。`
        : '当前章节没有解析到时间线内容。';
      setTimelineStatusText(status);
      onFeedback(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setTimelineStatusText(`AI 更新失败：${message}`);
      onFeedback(`AI 更新时间线失败：${message}`);
    } finally {
      setTimelineAiRunning(false);
    }
  }, [
    currentChapter,
    currentChapterDisplayNumber,
    editor.content,
    aiPromptTemplates,
    chapters,
    timelineStoryTimes,
    timelineChapterSummaries,
    timelineEvents,
    timelineCharacterStates,
    timelineForeshadows,
    onFeedback,
    onCreateChapterForeshadowPit,
    openTimelineDetailForChapter,
    onReplaceChapterTimelineLayers,
    onRecordForeshadowResponse,
    onRunWritingAi,
    storyPits
  ]);

  const runChapterWrapUpAi = useCallback(async () => {
    if (!currentChapter) {
      onFeedback('请先选择章节。');
      return;
    }
    if (!editor.content.trim()) {
      onFeedback('当前章节还没有正文，无法执行一键总结。');
      return;
    }

    const templates = aiPromptTemplates ?? DEFAULT_AI_PROMPT_TEMPLATES;
    const currentDisplayNumber = currentChapterDisplayNumber ?? currentChapter.index_no;
    const timelineReferenceText = getTimelinePrecedingChapterContextText(
      chapters,
      currentDisplayNumber,
      timelineStoryTimes,
      timelineChapterSummaries,
      timelineEvents,
      timelineCharacterStates,
      timelineForeshadows,
      TIMELINE_LAYER_REFERENCE_WINDOW
    );
    const currentStoryTimeText = timelineStoryTimes
      .filter((item) => item.chapter_id === currentChapter.id)
      .map((item) => `${item.time_text || '未知'}（${item.time_type}）${item.summary ? `：${item.summary}` : ''}`)
      .join('\n');
    const currentTimelineSummaryText = [
      currentStoryTimeText ? `具体时间：\n${currentStoryTimeText}` : '',
      currentChapterSummaryEntry ? `章节总结：\n${currentChapterSummaryEntry.summary}` : '',
      currentTimelineEvents.length > 0
        ? `剧情事件：\n${currentTimelineEvents.map((item, index) => `${index + 1}. ${item.title}${item.summary ? `：${item.summary}` : ''}`).join('\n')}`
        : '',
      currentTimelineCharacterStates.length > 0
        ? `人物状态：\n${currentTimelineCharacterStates.map((item, index) => `${index + 1}. ${item.character_name}：${item.summary || [item.mood, item.goal, item.stance, item.physical_state].filter(Boolean).join(' / ')}`).join('\n')}`
        : '',
      currentTimelineForeshadows.length > 0
        ? `伏笔动作：\n${currentTimelineForeshadows.map((item, index) => `${index + 1}. ${item.title} · ${item.status}${item.summary ? `：${item.summary}` : ''}`).join('\n')}`
        : ''
    ].filter(Boolean).join('\n\n');
    const relationshipContext = chapterRelationshipGraph
      ? JSON.stringify({
          characters: chapterRelationshipGraph.nodes.map((node) => ({ name: node.name, role: node.role_type, summary: node.summary })),
          items: chapterRelationshipGraph.links.map((link) => {
            const from = chapterRelationshipGraph.nodes.find((node) => node.id === link.fromId)?.name ?? link.fromId;
            const to = chapterRelationshipGraph.nodes.find((node) => node.id === link.toId)?.name ?? link.toId;
            return { from, to, label: link.label, summary: link.summary };
          })
        })
      : '{"characters":[],"items":[]}';
    const codexCharacterContext = characters
      .map((entry) => [
        `人物：${entry.name}`,
        entry.role_type ? `定位：${entry.role_type}` : '',
        entry.summary ? `摘要：${entry.summary}` : '',
        entry.details ? `资料：${entry.details}` : '资料：空'
      ].filter(Boolean).join('\n'))
      .join('\n\n');
    const planContext = writingPlans.length > 0
      ? writingPlans.map((plan) => `计划${plan.index + 1}：${plan.content}\n当前状态：${plan.done ? 'done' : 'open'}`).join('\n\n')
      : '无';

    setChapterWrapUpRunning(true);
    setChapterWrapUpStatus('正在更新时间线...');
    try {
      await runTimelineEventAi();

      setChapterWrapUpStatus('正在判断计划、关系和资料库人物...');
      const instruction = [
        templates.chapterWrapUp,
        `当前章节：第 ${currentDisplayNumber} 章《${currentChapter.title || '未命名章节'}》`,
        `前 10 章时间线摘要：\n${timelineReferenceText}`,
        `当前章节时间线结果：\n${currentTimelineSummaryText || '空'}`,
        `当前章节创作计划：\n${planContext}`,
        `当前章节已有关系图：\n${relationshipContext}`,
        `资料库人物：\n${codexCharacterContext || '空'}`,
        `当前章节正文：\n${compactTimelineAiContent(editor.content)}`
      ].join('\n\n');

      const result = await onRunWritingAi({ instruction });
      if (!result?.message.trim()) {
        setChapterWrapUpStatus('AI 没有返回一键总结结果。');
        onFeedback('AI 一键总结没有返回可用内容。');
        return;
      }

      let parsed: ChapterWrapUpParseResult;
      try {
        parsed = parseChapterWrapUpUpdates(result.message);
      } catch {
        setChapterWrapUpStatus('AI 返回的一键总结内容不是可解析的 JSON。');
        onFeedback('AI 一键总结返回格式错误。');
        return;
      }

      if (writingPlans.length > 0 && parsed.plans.length > 0) {
        const nextStatuses = writingPlans.map((plan) => {
          const matched = parsed.plans.find((item) => item.index === plan.index);
          return matched?.status === 'done' ? 'done' : 'open';
        });
        await persistWritingPlans(writingPlans.map((plan) => plan.content), nextStatuses);
      }

      if (parsed.relationshipGraph.nodes.length > 0 || parsed.relationshipGraph.links.length > 0) {
        await onUpdateChapterRelationshipGraph(parsed.relationshipGraph);
        await syncChapterRelationshipGraphToLibrary(parsed.relationshipGraph);
      }

      if (!currentChapter.confirmed_fields_json.includes(CHAPTER_AI_WRAPUP_DONE_FIELD)) {
        await onUpdateCurrentChapterPatch({
          confirmed_fields_json: [...currentChapter.confirmed_fields_json, CHAPTER_AI_WRAPUP_DONE_FIELD]
        });
      }

      if (parsed.characterUpdates.length > 0) {
        const chapterText = editor.content;
        const characterByName = new Map(characters.map((entry) => [entry.name.trim(), entry]));
        let updatedCount = 0;
        for (const item of parsed.characterUpdates) {
          const character = characterByName.get(item.characterName);
          if (!character) {
            continue;
          }
          if (!chapterText.includes(character.name)) {
            continue;
          }
          const saved = await onUpdateCharacterDetails(character.id, item.details);
          if (saved) {
            updatedCount += 1;
          }
        }
        const planDoneCount = parsed.plans.filter((item) => item.status === 'done').length;
        const status = `已完成一键总结：时间线已更新，计划完成 ${planDoneCount}/${writingPlans.length}，关系图已同步，资料库人物更新 ${updatedCount} 个。`;
        setChapterWrapUpStatus(status);
        onFeedback(status);
        return;
      }

      const planDoneCount = parsed.plans.filter((item) => item.status === 'done').length;
      const status = `已完成一键总结：时间线已更新，计划完成 ${planDoneCount}/${writingPlans.length}，关系图已同步。`;
      setChapterWrapUpStatus(status);
      onFeedback(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setChapterWrapUpStatus(`AI 一键总结失败：${message}`);
      onFeedback(`AI 一键总结失败：${message}`);
    } finally {
      setChapterWrapUpRunning(false);
    }
  }, [
    aiPromptTemplates,
    chapterRelationshipGraph,
    chapters,
    characters,
    compactTimelineAiContent,
    currentChapter,
    currentChapterDisplayNumber,
    currentChapterSummaryEntry,
    currentTimelineCharacterStates,
    currentTimelineEvents,
    currentTimelineForeshadows,
    editor.content,
    onFeedback,
    onRunWritingAi,
    onUpdateCurrentChapterPatch,
    onUpdateChapterRelationshipGraph,
    onUpdateCharacterDetails,
    persistWritingPlans,
    runTimelineEventAi,
    syncChapterRelationshipGraphToLibrary,
    timelineChapterSummaries,
    timelineCharacterStates,
    timelineEvents,
    timelineForeshadows,
    timelineStoryTimes,
    writingPlans
  ]);

  const handleSelectRelationshipCharacter = useCallback(
    (characterId: string) => {
      if (relationshipGraphMode === 'library') {
        void persistRelationshipDetails();
      }
      setRelationshipSelectedId(characterId);
    },
    [persistRelationshipDetails, relationshipGraphMode]
  );

  const handleDeleteRelationshipCharacter = useCallback(
    (entry: Character) => {
      void onDeleteCodexEntry(entry);
    },
    [onDeleteCodexEntry]
  );

  const getRelationshipCanvasPointerPosition = useCallback((event: RelationshipNodePointerEvent) => {
    const rect = relationshipCanvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 12, 88),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 12, 88)
    };
  }, []);

  const handleRelationshipNodePointerDown = useCallback(
    (event: RelationshipNodePointerEvent, characterId: string, nodePosition: { x: number; y: number }) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      relationshipDragCharacterIdRef.current = characterId;
      const position = getRelationshipCanvasPointerPosition(event);
      if (position) {
        relationshipDragStartRef.current = { x: position.x, y: position.y, moved: false };
        relationshipDragOffsetRef.current = {
          x: nodePosition.x - position.x,
          y: nodePosition.y - position.y
        };
      }
    },
    [getRelationshipCanvasPointerPosition]
  );

  const handleRelationshipNodePointerMove = useCallback(
    (event: RelationshipNodePointerEvent, characterId: string) => {
      if (relationshipDragCharacterIdRef.current !== characterId || event.buttons !== 1) {
        return;
      }

      const position = getRelationshipCanvasPointerPosition(event);
      if (position) {
        const start = relationshipDragStartRef.current;
        if (start && !start.moved && Math.hypot(position.x - start.x, position.y - start.y) < 1.2) {
          return;
        }
        if (start) {
          start.moved = true;
        }
        setRelationshipDraggingId(characterId);
        const offset = relationshipDragOffsetRef.current ?? { x: 0, y: 0 };
        setRelationshipNodePositionsByLayout((current) => ({
          ...current,
          [relationshipLayoutKey]: {
            ...(current[relationshipLayoutKey] ?? {}),
            [characterId]: {
              x: clamp(position.x + offset.x, 12, 88),
              y: clamp(position.y + offset.y, 12, 88)
            }
          }
        }));
      }
    },
    [getRelationshipCanvasPointerPosition, relationshipLayoutKey]
  );

  const handleRelationshipNodePointerUp = useCallback((event: RelationshipNodePointerEvent) => {
    if (relationshipDragCharacterIdRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    relationshipDragCharacterIdRef.current = null;
    relationshipDragOffsetRef.current = null;
    relationshipDragStartRef.current = null;
    setRelationshipDraggingId(null);
  }, []);

  const updateCurrentChapterRelationshipGraph = useCallback(
    (updater: (graph: ChapterRelationshipGraph) => ChapterRelationshipGraph) => {
      if (!currentChapter) {
        return;
      }
      const nextGraph = updater(currentChapterRelationshipGraph);
      void onUpdateChapterRelationshipGraph(nextGraph).then((saved) => {
        if (saved) {
          void syncChapterRelationshipGraphToLibrary(saved);
        }
      });
    },
    [currentChapter, currentChapterRelationshipGraph, onUpdateChapterRelationshipGraph, syncChapterRelationshipGraphToLibrary]
  );

  const updateChapterRelationshipLink = useCallback(
    (linkId: string, patch: Partial<Pick<ChapterRelationshipGraphLink, 'label' | 'summary'>>) => {
      updateCurrentChapterRelationshipGraph((graph) => ({
        ...graph,
        links: graph.links.map((link) => (link.id === linkId ? { ...link, ...patch } : link))
      }));
    },
    [updateCurrentChapterRelationshipGraph]
  );

  const updateLibraryRelationshipLine = useCallback(
    (targetCharacterId: string, label: string) => {
      if (!selectedLibraryRelationshipCharacter) {
        return;
      }
      void onUpsertCharacterRelationship({
        projectId: activeProject.id,
        characterAId: selectedLibraryRelationshipCharacter.id,
        characterBId: targetCharacterId,
        label,
        chapterId: currentChapter?.id ?? null,
        summary: ''
      });
    },
    [activeProject.id, currentChapter?.id, onUpsertCharacterRelationship, selectedLibraryRelationshipCharacter]
  );

  const deleteChapterRelationshipLink = useCallback(
    (linkId: string) => {
      updateCurrentChapterRelationshipGraph((graph) => ({
        ...graph,
        links: graph.links.filter((link) => link.id !== linkId)
      }));
    },
    [updateCurrentChapterRelationshipGraph]
  );

  const handleSelectCharacterFromSidebar = useCallback(
    (entry: Character) => {
      setSelectedCodexEntry({ type: 'character', id: entry.id });
      onOpenEditCodexEntry(entry);
    },
    [onOpenEditCodexEntry]
  );

  const handleOpenRelationshipCharacter = useCallback(
    (entry: RelationshipGraphEntry) => {
      if (relationshipGraphMode === 'library') {
        void persistRelationshipDetails();
      }
      setRelationshipSelectedId(entry.id);
    },
    [persistRelationshipDetails, relationshipGraphMode]
  );

  const handleSelectChapterFromSidebar = useCallback(
    (chapterId: string) => {
      onSelectChapter(chapterId);
      handleSetStudioTab('write');
    },
    [handleSetStudioTab, onSelectChapter]
  );

  const handleSelectGlobalChapter = useCallback(
    (chapterId: string) => {
      onSelectChapter(chapterId);
      setGlobalChapterMenuOpen(false);
      setGlobalChapterInput('');
    },
    [onSelectChapter]
  );

  const handleSelectGlobalChapterNumber = useCallback(() => {
    const nextIndex = Number.parseInt(globalChapterInput.trim(), 10);
    if (!Number.isFinite(nextIndex) || nextIndex < 1) {
      return;
    }

    const chapter =
      chapters.find((item, index) => (item.index_no || index + 1) === nextIndex) ??
      chapters[nextIndex - 1] ??
      null;
    if (!chapter) {
      onFeedback(`没有第 ${nextIndex} 章`);
      return;
    }

    onSelectChapter(chapter.id);
    setGlobalChapterMenuOpen(false);
    setGlobalChapterInput('');
  }, [chapters, globalChapterInput, onFeedback, onSelectChapter]);

  const getTextMatchesInElement = useCallback((root: HTMLElement, queryText: string): HTMLElement[] => {
    const matches: HTMLElement[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      if (text.includes(queryText)) {
        const element = node.parentElement ?? root;
        const target = element.closest('p') ?? element;
        if (!matches.includes(target)) {
          matches.push(target);
        }
      }
      node = walker.nextNode();
    }
    return matches;
  }, []);

  const locateManuscriptSearch = useCallback(() => {
    const queryText = manuscriptSearchQuery.trim();
    if (!queryText) {
      setManuscriptSearchStatus('');
      setManuscriptSearchIndex(-1);
      return;
    }
    if (!editor.content.includes(queryText)) {
      setManuscriptSearchStatus('未找到');
      setManuscriptSearchIndex(-1);
      return;
    }

    const root = writerMode === 'edit'
      ? manuscriptEditorRef.current?.element
      : manuscriptReadingRef.current;
    if (!root) {
      setManuscriptSearchStatus('未找到');
      setManuscriptSearchIndex(-1);
      return;
    }

    const matches = getTextMatchesInElement(root, queryText);
    if (matches.length === 0) {
      setManuscriptSearchStatus('未找到');
      setManuscriptSearchIndex(-1);
      return;
    }

    const nextIndex = manuscriptSearchIndex >= 0 && manuscriptSearchIndex < matches.length - 1
      ? manuscriptSearchIndex + 1
      : 0;
    root.querySelectorAll('.st-manuscript-search-hit').forEach((item) => {
      item.classList.remove('st-manuscript-search-hit');
    });
    const target = matches[nextIndex];
    target.classList.add('st-manuscript-search-hit');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setManuscriptSearchIndex(nextIndex);
    setManuscriptSearchStatus(`${nextIndex + 1}/${matches.length}`);
  }, [editor.content, getTextMatchesInElement, manuscriptSearchIndex, manuscriptSearchQuery, writerMode]);

  useEffect(() => {
    if (studioTab === 'relationships') {
      setProjectInfoOpen(false);
      onSetSidebarSection('codex');
      setCodexGroupsOpen((current) => ({ ...current, characters: true }));
    }
  }, [onSetSidebarSection, studioTab]);

  useEffect(() => {
    if (studioTab === 'relationships') {
      setCodexGroupsOpen((current) => ({ ...current, characters: true }));
    }
  }, [characters, studioTab]);

  useEffect(() => {
    setManuscriptSearchIndex(-1);
    setManuscriptSearchStatus('');
    manuscriptEditorRef.current?.element?.querySelectorAll('.st-manuscript-search-hit').forEach((item) => {
      item.classList.remove('st-manuscript-search-hit');
    });
    manuscriptReadingRef.current?.querySelectorAll('.st-manuscript-search-hit').forEach((item) => {
      item.classList.remove('st-manuscript-search-hit');
    });
  }, [currentChapter?.id, editor.content, writerMode]);
  const runWritingAi = useCallback(async (action: WritingAiAction) => {
    if (!currentChapter) return;
    const templates = aiPromptTemplates ?? DEFAULT_AI_PROMPT_TEMPLATES;
    const actionLabel = WRITING_AI_ACTIONS.find((item) => item.key === action)?.label ?? action;
    const userPrompt = writingAiExtraPrompts[action].trim();
    const templateKey = action === 'generate' ? 'generate' : action;
    const useContinueContext = action === 'continue' || action === 'generate' || action === 'inspiration';
    const selectedText = (action === 'rewrite' || action === 'polish')
      ? manuscriptSelectionText.trim() || manuscriptEditorRef.current?.getSelectionText().trim() || ''
      : '';
    const cursorAnchor: ManuscriptCursorAnchor | null = action === 'continue'
      ? manuscriptEditorRef.current?.getCursorAnchor() ?? null
      : null;
    const continueContent = cursorAnchor?.beforeText || editor.content || '（当前正文为空）';
    const writingTarget: 'selection' | 'chapter' | 'reference' | 'cursor' = action === 'inspiration'
      ? 'reference'
      : selectedText
        ? 'selection'
        : cursorAnchor
          ? 'cursor'
          : 'chapter';
    const targetContent = selectedText || continueContent;
    const instruction = [
      `任务：${actionLabel}`,
      templates[templateKey],
      selectedWritingReferenceText ? `请重点参考以下资料库内容：\n${selectedWritingReferenceText}` : '',
      useContinueContext && writingTimelineReferenceText ? `必须参考前 5 章时间线内容：\n${writingTimelineReferenceText}` : '',
      useContinueContext && selectedWritingForeshadowText ? `只参考以下已引用的未回收伏笔，已回收伏笔不要作为待响应目标：\n${selectedWritingForeshadowText}` : '',
      useContinueContext && writingOpenPlanText ? `必须参考以下未完成创作计划：\n${writingOpenPlanText}` : '',
      useContinueContext && writingRelationshipContextText ? `必须参考以下人物关系：\n${writingRelationshipContextText}` : '',
      userPrompt ? `本次补充提示：\n${userPrompt}` : '',
      `当前章节标题：${editor.title || chapterTitle}`,
      selectedText || cursorAnchor ? `当前章节全文上下文：\n${editor.content || '（当前正文为空）'}` : '',
      cursorAnchor ? `本次续写锚点前文：\n${cursorAnchor.beforeText || '（锚点前为空）'}` : '',
      cursorAnchor?.afterText ? `锚点后的正文仅用于避免重复或衔接冲突，不要续写到这里之后：\n${cursorAnchor.afterText}` : '',
      selectedText ? `本次只处理以下选中文本：\n${selectedText}` : `当前正文：\n${targetContent}`,
      action === 'continue' ? (cursorAnchor ? '请只输出可直接插入续写锚点处的续写内容；主要承接锚点前文，不要依据锚点后的正文继续发展。' : '请只输出可直接追加到正文后的续写内容。') : '',
      action === 'rewrite' ? (selectedText ? '请只输出选中文本改写后的内容，不要输出全文。' : '请只输出改写后的完整正文。') : '',
      action === 'polish' ? (selectedText ? '请只输出选中文本润色后的内容，不要输出全文。' : '请只输出润色后的完整正文。') : '',
      action === 'generate' ? '请根据本章标题、已有正文和本次补充提示生成完整本章正文；如果已有正文，请融合并补全，不要输出提纲、说明或总结。' : '',
      action === 'inspiration' ? '请只输出灵感方向和可选写法，不要直接写正文，不要替换当前正文。' : ''
    ].filter(Boolean).join('\n\n');

    setWritingAiRunning(action);
    const result = await onRunWritingAi({ instruction });
    setWritingAiRunning(null);
    if (!result) return;
    setWritingAiResult({
      action,
      text: result.message,
      provider: result.provider,
      model: result.model,
      target: writingTarget,
      sourceText: selectedText,
      insertionOffset: cursorAnchor?.offset ?? null
    });
  }, [aiPromptTemplates, chapterTitle, currentChapter, editor.content, editor.title, manuscriptSelectionText, onRunWritingAi, selectedWritingForeshadowText, selectedWritingReferenceText, writingAiExtraPrompts, writingOpenPlanText, writingRelationshipContextText, writingTimelineReferenceText]);

  const runProofreadAi = useCallback(async () => {
    if (!currentChapter) {
      onFeedback('请先选择章节。');
      return;
    }
    if (!editor.content.trim()) {
      onFeedback('当前章节还没有正文，无法纠错。');
      return;
    }

    const templates = aiPromptTemplates ?? DEFAULT_AI_PROMPT_TEMPLATES;
    const instruction = [
      templates.proofread,
      `当前章节标题：${editor.title || chapterTitle}`,
      `当前正文：\n${editor.content}`
    ].join('\n\n');

    setProofreadAiRunning(true);
    setProofreadAiStatus('正在识别错别字...');
    setProofreadAiChanges([]);
    try {
      const result = await onRunWritingAi({ instruction });
      const parsed = parseProofreadUpdates(result?.message ?? '');
      const correctedText = parsed.text.trim();
      const resolvedChanges = resolveProofreadChanges(editor.content, correctedText, parsed.changes);
      if (!correctedText) {
        setProofreadAiStatus('AI 没有返回纠错结果。');
        onFeedback('AI 没有返回纠错结果。');
        return;
      }

      if (correctedText === editor.content.trim()) {
        setProofreadAiChanges(resolvedChanges);
        setProofreadAiStatus('未发现需要自动修改的错别字。');
        onFeedback('未发现需要自动修改的错别字。');
        return;
      }

      onContentChange(formatManuscriptParagraphs(correctedText));
      setProofreadAiChanges(resolvedChanges);
      setProofreadAiStatus(resolvedChanges.length > 0 ? `已自动完成纠错，共 ${resolvedChanges.length} 处。` : '已自动完成纠错。');
      onFeedback(resolvedChanges.length > 0 ? `已自动完成纠错，共 ${resolvedChanges.length} 处。` : '已自动完成纠错。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setProofreadAiStatus(`AI 纠错失败：${message}`);
      onFeedback(`AI 纠错失败：${message}`);
    } finally {
      setProofreadAiRunning(false);
    }
  }, [aiPromptTemplates, chapterTitle, currentChapter, editor.content, editor.title, onContentChange, onFeedback, onRunWritingAi]);
  const codexKind = getCodexEditorKind(codexEditorState);
  const codexKindOption = CODEX_KIND_OPTIONS.find((option) => option.value === codexKind) ?? CODEX_KIND_OPTIONS[0];
  const chatModelOption = chatModelOptions.find((option) => option.value === chatModel) ?? chatModelOptions[0] ?? CHAT_MODEL_OPTIONS[0];
  const CodexKindIcon = codexKindOption.icon;
  const codexTitleValue = codexEditorState.type === 'character' ? codexEditorState.name : codexEditorState.loreTitle;
  const codexDetailValue = codexEditorState.type === 'character' ? codexEditorState.details : codexEditorState.loreContent;

  const handleCodexKindChange = useCallback(
    (nextKind: StudioCodexKind) => {
      const nextOption = CODEX_KIND_OPTIONS.find((option) => option.value === nextKind) ?? CODEX_KIND_OPTIONS[0];
      const title = codexEditorState.type === 'character' ? codexEditorState.name : codexEditorState.loreTitle;
      const detail = codexEditorState.type === 'character' ? codexEditorState.details : codexEditorState.loreContent;

      if (codexEditorState.id) {
        if (codexEditorState.type === 'character' && nextOption.type !== 'character') {
          return;
        }
        if (codexEditorState.type === 'lore' && nextOption.type !== 'lore') {
          return;
        }
      }

      if (nextOption.type === 'character') {
        onUpdateCodexEditorField('type', 'character');
        onUpdateCodexEditorField('name', title);
        onUpdateCodexEditorField('roleType', '');
        onUpdateCodexEditorField('details', detail);
        onUpdateCodexEditorField('loreType', '');
        return;
      }

      onUpdateCodexEditorField('type', 'lore');
      onUpdateCodexEditorField('loreType', nextOption.value);
      onUpdateCodexEditorField('loreTitle', title);
      onUpdateCodexEditorField('loreContent', detail);
      onUpdateCodexEditorField('roleType', '');
    },
    [codexEditorState.details, codexEditorState.id, codexEditorState.loreContent, codexEditorState.loreTitle, codexEditorState.name, codexEditorState.type, onUpdateCodexEditorField]
  );

  const handleSelectCodexKind = useCallback(
    (nextKind: StudioCodexKind) => {
      handleCodexKindChange(nextKind);
      setCodexKindMenuOpen(false);
    },
    [handleCodexKindChange]
  );

  useEffect(() => {
    const syncPanelWidths = () => {
      const shellWidth = getShellWidth();

      setSidebarWidth((currentSidebarWidth) => {
        const sidebarBounds = getSidebarBounds(shellWidth, inspectorWidth);
        const nextSidebarWidth = clamp(currentSidebarWidth, sidebarBounds.min, sidebarBounds.max);

        setInspectorWidth((currentInspectorWidth) => {
          const inspectorBounds = getInspectorBounds(shellWidth, sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : nextSidebarWidth);
          return clamp(currentInspectorWidth, inspectorBounds.min, inspectorBounds.max);
        });

        return nextSidebarWidth;
      });
    };

    syncPanelWidths();
    window.addEventListener('resize', syncPanelWidths);

    return () => window.removeEventListener('resize', syncPanelWidths);
  }, [getInspectorBounds, getShellWidth, getSidebarBounds, inspectorWidth, sidebarCollapsed]);

  useEffect(() => {
    if (!newEntryMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && newEntryMenuRef.current?.contains(target)) {
        return;
      }
      setNewEntryMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNewEntryMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [newEntryMenuOpen]);

  useEffect(() => {
    if (!writingRefMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && writingRefMenuRef.current?.contains(target)) {
        return;
      }
      setWritingRefMenuOpen(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWritingRefMenuOpen(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [writingRefMenuOpen]);

  useEffect(() => {
    if (!writingModelMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && writingModelMenuRef.current?.contains(target)) {
        return;
      }
      setWritingModelMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWritingModelMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [writingModelMenuOpen]);

  useEffect(() => {
    if (!writingAiPromptAction) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && writingAiPromptPopoverRef.current?.contains(target)) {
        return;
      }
      setWritingAiPromptAction(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWritingAiPromptAction(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [writingAiPromptAction]);

  useEffect(() => {
    if (!relationshipModelMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && relationshipModelMenuRef.current?.contains(target)) {
        return;
      }
      setRelationshipModelMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRelationshipModelMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [relationshipModelMenuOpen]);

  useEffect(() => {
    if (!timelineModelMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && timelineModelMenuRef.current?.contains(target)) {
        return;
      }
      setTimelineModelMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTimelineModelMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [timelineModelMenuOpen]);

  useEffect(() => {
    if (!globalChapterMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && globalChapterMenuRef.current?.contains(target)) {
        return;
      }
      setGlobalChapterMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGlobalChapterMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [globalChapterMenuOpen]);

  useEffect(() => {
    setWritingRefMenuOpen(null);
    setSelectedWritingForeshadowRefIds([]);
    setSelectedWritingPlanRefIndexes([]);
    setManuscriptSelectionText('');
  }, [currentChapter?.id]);

  useEffect(() => {
    if (projectInfoOpen) {
      return;
    }

    setProjectDraft({
      title: activeProject.title,
      description: activeProject.description,
      outline_text: activeProject.outline_text
    });
  }, [activeProject.description, activeProject.outline_text, activeProject.title, projectInfoOpen]);

  useEffect(() => {
    latestAiSettingsKeyRef.current = getAiSettingsKey(aiSettingsDraft);
  }, [aiSettingsDraft]);

  useEffect(() => {
    const nextPrompt = aiSystemPrompt || DEFAULT_AI_CHAT_SYSTEM_PROMPT;
    const nextTemplates = aiPromptTemplates ?? { ...DEFAULT_AI_PROMPT_TEMPLATES };
    savedAiPromptSettingsRef.current = getAiPromptSettingsKey({
      systemPrompt: nextPrompt,
      promptTemplates: nextTemplates
    });
    if (!aiSettingsActive || aiSettingsTab !== 'prompt') {
      setAiPromptDraft(nextPrompt);
      setAiPromptTemplateDrafts(nextTemplates);
    }
  }, [aiPromptTemplates, aiSettingsActive, aiSettingsTab, aiSystemPrompt]);

  useEffect(() => {
    if (aiConfig) {
      const configKey = getAiSettingsKey(aiConfig);
      savedAiSettingsKeyRef.current = configKey;
      latestAiSettingsKeyRef.current = configKey;
      setAiSettingsDraft(aiConfig);
      setAiSupportedModels(aiConfig.customModels.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    }
  }, [aiConfig]);

  useEffect(() => {
    if (!aiSettingsActive || aiSettingsTab !== 'prompt') {
      return undefined;
    }
    const nextSettings = {
      systemPrompt: aiPromptDraft,
      promptTemplates: aiPromptTemplateDrafts
    };
    if (getAiPromptSettingsKey(nextSettings) === savedAiPromptSettingsRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void persistAiPromptSettings(nextSettings);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [aiPromptDraft, aiPromptTemplateDrafts, aiSettingsActive, aiSettingsTab, persistAiPromptSettings]);

  useEffect(() => {
    if (!aiSettingsActive || aiSettingsMode !== 'edit' || !aiSettingsDraft.id) {
      return undefined;
    }
    if (!aiSettingsDraft.connectionName.trim()) {
      return undefined;
    }

    const nextKey = getAiSettingsKey(aiSettingsDraft);
    if (nextKey === savedAiSettingsKeyRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void persistAiSettings(aiSettingsDraft);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [aiSettingsDraft, aiSettingsMode, aiSettingsActive, persistAiSettings]);

  useEffect(() => {
    if (!aiSettingsActive) {
      return undefined;
    }
    const baseUrl = aiSettingsDraft.baseUrl.trim();
    const apiKey = aiSettingsDraft.apiKey.trim();
    if (!baseUrl || !apiKey) {
      setAiSupportedModels([]);
      setAiModelsError('');
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAiModelsLoading(true);
      setAiModelsError('');
      void onListAiModels({ baseUrl, apiKey })
        .then((models) => {
          if (cancelled) return;
          setAiModelsLoading(false);
          setAiSupportedModels(models);
          if (models.length > 0) {
            setAiSettingsDraft((current) => {
              const next = {
                ...current,
                customModels: models.join('\n'),
                defaultModel: models.includes(current.defaultModel) ? current.defaultModel : models[0]
              };
              return next;
            });
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setAiModelsLoading(false);
          setAiModelsError(error instanceof Error ? error.message : String(error));
        });
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [aiSettingsDraft.apiKey, aiSettingsDraft.baseUrl, aiSettingsActive, onListAiModels]);

  useEffect(() => {
    if (!projectInfoOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void saveProjectInfoDraft();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [projectDraft.description, projectDraft.title, projectInfoOpen, saveProjectInfoDraft]);

  useEffect(() => {
    if (!selectedCodexEntry) return;
    if (showCodexEditor) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && codexDetailPanelRef.current?.contains(target)) {
        return;
      }
      setSelectedCodexEntry(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCodexEntry(null);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedCodexEntry, showCodexEditor]);

  useEffect(() => {
    if (!showCodexEditor) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && codexEditorPanelRef.current?.contains(target)) {
        return;
      }
      onCloseCodexEditor();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseCodexEditor();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCloseCodexEditor, showCodexEditor]);

  return (
    <section
      ref={shellRef}
      className={`st-page${focusMode ? ' focus-mode' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={{ ['--st-sidebar-width' as string]: `${effectiveSidebarWidth}px` }}
    >
      <aside
        className="st-sidebar"
        style={{ width: effectiveSidebarWidth, minWidth: effectiveSidebarWidth, maxWidth: effectiveSidebarWidth, flexBasis: effectiveSidebarWidth }}
      >
        <div className="st-sidebar-head">
          <button
            type="button"
            className="st-sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          >
            <span aria-hidden="true" />
          </button>
          <div className="st-project-row">
            <div className="st-project-actions">
              <button type="button" className="st-icon-btn st-icon-btn-quiet" onClick={onBackHome} aria-label="返回书架">
                <ArrowLeft size={16} />
              </button>
            </div>
            <div className="st-sidebar-info">
              <div className="st-project-info-anchor">
                <button
                  type="button"
                  className="st-sidebar-title st-sidebar-title-button"
                  onClick={openProjectInfo}
                  aria-pressed={projectInfoOpen}
                >
                  {activeProject.title}
                </button>
              </div>
              <div className="st-sidebar-stats">{chapters.length} 章 · {totalWords} 字</div>
            </div>
          </div>

          <nav className="st-sidebar-nav">
            <button
              type="button"
              className={`st-sidebar-nav-item${sidebarSection === 'codex' ? ' active' : ''}`}
              onClick={() => handleSetSidebarSection('codex')}
            >
              <LibraryBig size={15} />
              <span>资料库</span>
            </button>
            <button
              type="button"
              className={`st-sidebar-nav-item${sidebarSection === 'chapters' ? ' active' : ''}`}
              onClick={() => handleSetSidebarSection('chapters')}
            >
              <BookOpen size={15} />
              <span>章节</span>
            </button>
            <button
              type="button"
              className={`st-sidebar-nav-item${sidebarSection === 'recycle' ? ' active' : ''}`}
              onClick={() => handleSetSidebarSection('recycle')}
            >
              <Trash2 size={15} />
              <span>回收站</span>
            </button>
          </nav>

          <div className="st-sidebar-tools">
            <div className={`st-sidebar-tool-row${sidebarSection === 'recycle' ? ' compact' : ''}`}>
              <label className="st-search-shell">
                <Search size={14} />
                <input
                  className="st-search-input"
                  value={sidebarQuery}
                  onChange={(event) => setSidebarQuery(event.target.value)}
                  placeholder={sidebarSection === 'codex' ? '搜索条目...' : '搜索章节...'}
                />
              </label>
              <button type="button" className="st-square-tool-btn" aria-label="筛选条目">
                <ListFilter size={14} />
              </button>
              {sidebarSection === 'codex' ? (
                <div className="st-entry-menu-anchor" ref={newEntryMenuRef}>
                  <button
                    type="button"
                    className="st-new-entry-btn"
                    aria-haspopup="menu"
                    aria-expanded={newEntryMenuOpen}
                    onClick={() => setNewEntryMenuOpen((current) => !current)}
                  >
                    <Plus size={14} />
                    <span>新建条目</span>
                  </button>
                  {newEntryMenuOpen ? (
                    <div className="st-new-entry-menu" role="menu">
                      <button type="button" className="st-new-entry-menu-item" role="menuitem" onClick={() => handleNewCodexEntry('character')}>
                        <UserRound size={15} />
                        <span>人物</span>
                      </button>
                      <button type="button" className="st-new-entry-menu-item" role="menuitem" onClick={() => handleNewCodexEntry('lore', 'location')}>
                        <MapPin size={15} />
                        <span>背景</span>
                      </button>
                      <button type="button" className="st-new-entry-menu-item" role="menuitem" onClick={() => handleNewCodexEntry('lore', 'lore')}>
                        <FileText size={15} />
                        <span>设定</span>
                      </button>
                      <button type="button" className="st-new-entry-menu-item" role="menuitem" onClick={() => handleNewCodexEntry('lore', 'other')}>
                        <LibraryBig size={15} />
                        <span>其他</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : sidebarSection === 'chapters' ? (
                <button
                  type="button"
                  className="st-new-entry-btn"
                  onClick={onCreateChapter}
                >
                  <Plus size={14} />
                  <span>新建章节</span>
                </button>
              ) : null}
              <button type="button" className="st-square-tool-btn" aria-label="侧栏设置">
                <Settings size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="st-sidebar-content">
          {sidebarSection === 'codex' ? (
            <div className="st-sidebar-groups">
              {visibleCharacters.length > 0 ? (
              <section className="st-sidebar-group">
                <div className="st-group-head">
                  <span>人物</span>
                  <div className="st-group-actions">
                    <span>{visibleCharacters.length} 条</span>
                    <button type="button" className="st-group-action-btn" aria-label="新建人物" onClick={() => handleNewCodexEntry('character')}>
                      +
                    </button>
                    <button
                      type="button"
                      className={`st-group-action-btn st-group-toggle${codexGroupsOpen.characters ? ' open' : ''}`}
                      aria-label={codexGroupsOpen.characters ? '收起人物' : '展开人物'}
                      onClick={() => toggleCodexGroup('characters')}
                    />
                  </div>
                </div>
                {codexGroupsOpen.characters && visibleCharacters.length === 0 ? (
                  <div className="st-section-empty">还没有匹配的人物条目。</div>
                ) : codexGroupsOpen.characters ? (
                  visibleCharacters.map((entry) => (
                    <div
                      key={entry.id}
                      className={`st-codex-row${selectedCodexEntry?.type === 'character' && selectedCodexEntry.id === entry.id ? ' selected' : ''}`}
                      onClick={() => handleSelectCharacterFromSidebar(entry)}
                    >
                      <span className="st-codex-mark person">{entry.name.slice(0, 1)}</span>
                      <div className="st-codex-copy">
                        <div className="st-codex-title">{entry.name}</div>
                        <div className="st-codex-meta">{entry.role_type || '角色'}</div>
                      </div>
                      <button
                        type="button"
                        className="st-row-delete-btn"
                        aria-label={`删除人物 ${entry.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteRelationshipCharacter(entry);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : null}
              </section>
              ) : null}

              {visibleBackground.length > 0 ? (
              <section className="st-sidebar-group">
                <div className="st-group-head">
                  <span>背景</span>
                  <div className="st-group-actions">
                    <span>{visibleBackground.length} 条</span>
                    <button type="button" className="st-group-action-btn" aria-label="新建背景" onClick={() => handleNewCodexEntry('lore', 'location')}>
                      +
                    </button>
                    <button
                      type="button"
                      className={`st-group-action-btn st-group-toggle${codexGroupsOpen.background ? ' open' : ''}`}
                      aria-label={codexGroupsOpen.background ? '收起背景' : '展开背景'}
                      onClick={() => toggleCodexGroup('background')}
                    />
                  </div>
                </div>
                {codexGroupsOpen.background && visibleBackground.length === 0 ? (
                  <div className="st-section-empty">还没有匹配的背景条目。</div>
                ) : codexGroupsOpen.background ? (
                  visibleBackground.map((entry) => (
                    <div
                      key={entry.id}
                      className={`st-codex-row st-codex-row-no-delete${selectedCodexEntry?.type === 'lore' && selectedCodexEntry.id === entry.id ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedCodexEntry({ type: 'lore', id: entry.id });
                        onOpenEditCodexEntry(entry);
                      }}
                    >
                      <span className="st-codex-mark location">{entry.title.slice(0, 1)}</span>
                      <div className="st-codex-copy">
                        <div className="st-codex-title">{entry.title}</div>
                        <div className="st-codex-meta">背景</div>
                      </div>
                    </div>
                  ))
                ) : null}
              </section>
              ) : null}

              {visibleSettings.length > 0 ? (
              <section className="st-sidebar-group">
                <div className="st-group-head">
                  <span>设定</span>
                  <div className="st-group-actions">
                    <span>{visibleSettings.length} 条</span>
                    <button type="button" className="st-group-action-btn" aria-label="新建设定" onClick={() => handleNewCodexEntry('lore', 'lore')}>
                      +
                    </button>
                    <button
                      type="button"
                      className={`st-group-action-btn st-group-toggle${codexGroupsOpen.settings ? ' open' : ''}`}
                      aria-label={codexGroupsOpen.settings ? '收起设定' : '展开设定'}
                      onClick={() => toggleCodexGroup('settings')}
                    />
                  </div>
                </div>
                {codexGroupsOpen.settings && visibleSettings.length === 0 ? (
                  <div className="st-section-empty">还没有匹配的设定条目。</div>
                ) : codexGroupsOpen.settings ? (
                  visibleSettings.map((entry) => (
                    <div
                      key={entry.id}
                      className={`st-codex-row st-codex-row-no-delete${selectedCodexEntry?.type === 'lore' && selectedCodexEntry.id === entry.id ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedCodexEntry({ type: 'lore', id: entry.id });
                        onOpenEditCodexEntry(entry);
                      }}
                    >
                      <span className="st-codex-mark lore">{entry.title.slice(0, 1)}</span>
                      <div className="st-codex-copy">
                        <div className="st-codex-title">{entry.title}</div>
                        <div className="st-codex-meta">设定</div>
                      </div>
                    </div>
                  ))
                ) : null}
              </section>
              ) : null}

              {visibleOther.length > 0 ? (
              <section className="st-sidebar-group">
                <div className="st-group-head">
                  <span>其他</span>
                  <div className="st-group-actions">
                    <span>{visibleOther.length} 条</span>
                    <button type="button" className="st-group-action-btn" aria-label="新建其他" onClick={() => handleNewCodexEntry('lore', 'other')}>
                      +
                    </button>
                    <button
                      type="button"
                      className={`st-group-action-btn st-group-toggle${codexGroupsOpen.other ? ' open' : ''}`}
                      aria-label={codexGroupsOpen.other ? '收起其他' : '展开其他'}
                      onClick={() => toggleCodexGroup('other')}
                    />
                  </div>
                </div>
                {codexGroupsOpen.other ? (
                  visibleOther.map((entry) => (
                    <div
                      key={entry.id}
                      className={`st-codex-row st-codex-row-no-delete${selectedCodexEntry?.type === 'lore' && selectedCodexEntry.id === entry.id ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedCodexEntry({ type: 'lore', id: entry.id });
                        onOpenEditCodexEntry(entry);
                      }}
                    >
                      <span className="st-codex-mark lore">{entry.title.slice(0, 1)}</span>
                      <div className="st-codex-copy">
                        <div className="st-codex-title">{entry.title}</div>
                        <div className="st-codex-meta">其他</div>
                      </div>
                    </div>
                  ))
                ) : null}
              </section>
              ) : null}
            </div>
          ) : null}

          {sidebarSection === 'chapters' ? (
            <div className="st-chapter-list">
              {visibleChapters.length === 0 ? (
                <div className="st-section-empty">没有匹配章节。</div>
              ) : (
                visibleChapters.map((chapter, index) => {
                  const chapterIndex = chapter.index_no || index + 1;
                  return (
                    <div
                      key={chapter.id}
                      className={`st-chapter-item${currentChapter?.id === chapter.id ? ' active' : ''}`}
                      onClick={() => handleSelectChapterFromSidebar(chapter.id)}
                    >
                      <span className="st-chapter-num">{chapterIndex}</span>
                      <span className="st-chapter-title">
                        <span>{getChapterTitle(chapter, chapterIndex)}</span>
                        {isChapterWrapUpDone(chapter) ? <span className="st-ai-wrapup-dot" title="已完成 AI 一键总结" /> : null}
                      </span>
                      <span className="st-chapter-words">{getChapterWordCount(chapter)}</span>
                      <button
                        type="button"
                        className="st-row-delete-btn st-chapter-delete-btn"
                        aria-label={`删除章节 ${getChapterTitle(chapter, chapterIndex)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteChapter(chapter.id, chapter.title);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {sidebarSection === 'recycle' ? (
            <div className="st-sidebar-groups">
              <section className="st-sidebar-group">
                <div className="st-group-head">
                  <span>已删除章节</span>
                  <span>{visibleDeletedChapters.length}</span>
                </div>
                {visibleDeletedChapters.length === 0 ? (
                  <div className="st-section-empty">回收站为空。</div>
                ) : (
                  visibleDeletedChapters.map((chapter, index) => (
                    <div key={chapter.id} className="st-recycle-row">
                      <div className="st-codex-copy">
                        <div className="st-codex-title">{getChapterTitle(chapter, index + 1)}</div>
                        <div className="st-codex-meta">删除于 {formatTime(chapter.deleted_at ?? chapter.updated_at)}</div>
                      </div>
                      <div className="st-inline-actions">
                        <button
                          type="button"
                          className="st-inline-action"
                          onClick={() => onRestoreChapter(chapter.id, chapter.title)}
                        >
                          鎭㈠
                        </button>
                        <button
                          type="button"
                          className="st-inline-action danger"
                          onClick={() => onDeleteChapterPermanent(chapter.id, chapter.title)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>
          ) : null}
        </div>
      </aside>

      {!sidebarCollapsed ? <ResizableDivider onResize={handleSidebarResize} className="st-divider-sidebar" /> : null}

      <div className="st-main">
        <header className="st-topbar">
          <div className="st-mode-tabs">
            <div className="st-global-chapter-select" ref={globalChapterMenuRef}>
                <button
                  type="button"
                  className="st-global-chapter-button"
                  aria-haspopup="menu"
                  aria-expanded={globalChapterMenuOpen}
                  onClick={() => setGlobalChapterMenuOpen((current) => !current)}
                  disabled={chapters.length === 0}
                >
                  <span>{currentChapter ? `第${currentIndex}章` : chapters.length > 0 ? '选择章节' : '暂无章节'}</span>
                  <span className={`st-chat-model-caret${globalChapterMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                </button>
                {globalChapterMenuOpen ? (
                  <div className="st-global-chapter-menu" role="menu">
                    <form
                      className="st-global-chapter-jump"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleSelectGlobalChapterNumber();
                      }}
                    >
                      <span>跳到</span>
                      <input
                        value={globalChapterInput}
                        onChange={(event) => setGlobalChapterInput(event.target.value)}
                        inputMode="numeric"
                        placeholder="章节号"
                      />
                    </form>
                    {chapters.map((chapter, index) => {
                      const chapterIndex = chapter.index_no || index + 1;
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          role="menuitem"
                          className={currentChapter?.id === chapter.id ? 'active' : ''}
                          onClick={() => handleSelectGlobalChapter(chapter.id)}
                        >
                          <span>第{chapterIndex}章</span>
                          <small>{getChapterWordCount(chapter)} 字</small>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
            </div>
            <button
              type="button"
              className={`st-mode-tab${!projectInfoOpen && studioTab === 'plan' ? ' active' : ''}`}
              onClick={() => handleSetStudioTab('plan')}
            >
              <BookCopy size={14} />
              <span>规划</span>
            </button>
            <button
              type="button"
              className={`st-mode-tab${!projectInfoOpen && studioTab === 'write' ? ' active' : ''}`}
              onClick={() => handleSetStudioTab('write')}
            >
              <BookOpen size={14} />
              <span>写作</span>
            </button>
            <button
              type="button"
              className={`st-mode-tab${!projectInfoOpen && studioTab === 'chat' ? ' active' : ''}`}
              onClick={() => handleSetStudioTab('chat')}
            >
              <MessageSquare size={14} />
              <span>对话</span>
            </button>
            <button
              type="button"
              className={`st-mode-tab${!projectInfoOpen && studioTab === 'relationships' ? ' active' : ''}`}
              onClick={() => handleSetStudioTab('relationships')}
            >
              <Network size={14} />
              <span>人物关系</span>
            </button>
            <button
              type="button"
              className={`st-mode-tab${!projectInfoOpen && studioTab === 'timeline' ? ' active' : ''}`}
              onClick={() => handleSetStudioTab('timeline')}
            >
              <ListTree size={14} />
              <span>时间线</span>
            </button>
            <button type="button" className="st-mode-tab st-mode-tab-disabled" disabled>
              <Eye size={14} />
              <span>审阅</span>
            </button>
            <button
              type="button"
              className={`st-mode-tab${aiSettingsActive ? ' active' : ''}`}
              onClick={() => openAiSettings()}
            >
              <Settings size={14} />
              <span>设置</span>
            </button>
          </div>

          <div className="st-topbar-center" />

          <div className="st-topbar-actions" />
        </header>

        {aiSettingsActive ? (
          <div className="st-ai-settings-panel" aria-label="AI 连接设置">
            <div className="st-ai-settings-head">
              <h2>设置</h2>
            </div>
            <div className="st-ai-settings-tabs">
              <button
                type="button"
                className={aiSettingsTab === 'connections' ? 'active' : ''}
                onClick={() => {
                  setAiSettingsTab('connections');
                  setAiSettingsMode('edit');
                }}
              >
                <Settings size={14} />
                <span>AI 连接</span>
              </button>
              <button
                type="button"
                className={aiSettingsTab === 'prompt' ? 'active' : ''}
                onClick={() => {
                  setAiSettingsTab('prompt');
                  setAiSettingsMode('edit');
                }}
              >
                <MessageSquare size={14} />
                <span>Prompt</span>
              </button>
            </div>
            <div className="st-ai-settings-copy">
              <h3>{aiSettingsTab === 'prompt' ? '提示词管理' : '已连接的 AI 供应商'}</h3>
              <p>
                {aiSettingsTab === 'prompt'
                  ? '这里管理所有 AI 提示词，包括对话、写作和人物关系图。作品和章节上下文会在发送时自动追加。'
                  : '这里可以分别添加官方 OpenAI 连接，或添加使用 /chat/completions 的 OpenAI 兼容连接。'}
              </p>
            </div>
            <div className={`st-ai-settings-body${aiSettingsTab === 'prompt' ? ' prompt-only' : ''}`}>
              {aiSettingsTab === 'connections' ? (
              <aside className="st-ai-connection-list">
                <div className="st-ai-connection-list-head">
                  <span>你的连接</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAiSettingsTab('connections');
                      setAiSettingsMode('catalog');
                    }}
                  >
                    <Plus size={13} />
                    <span>新建</span>
                  </button>
                </div>
                {settingsAiConnections.map((connection) => (
                  <div
                    key={connection.id}
                    className={`st-ai-connection-item${connection.id === aiSettingsDraft.id ? ' active' : ''}`}
                  >
                    <button type="button" className="st-ai-connection-main" onClick={() => handleSelectAiConnection(connection)}>
                      <AiProviderIcon providerType={connection.providerType} size={15} />
                      <span>
                        <strong>{connection.connectionName || (connection.providerType === 'openai' ? 'OpenAI' : 'OpenAI Compatible')}</strong>
                        <small>
                          {connection.customModels.split(/\r?\n/).filter(Boolean).length || 0} 个模型
                          {connection.id === activeAiConnectionId ? ' · 当前' : ''}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="st-ai-connection-delete"
                      aria-label={`删除 ${connection.connectionName || 'AI 连接'}`}
                      onClick={() => void handleDeleteAiConnection(connection)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </aside>
              ) : null}
              {aiSettingsTab === 'prompt' ? (
                <section className="st-ai-connection-editor">
                  <div className="st-ai-connection-editor-head">
                    <MessageSquare size={16} />
                    <strong>对话 Prompt</strong>
                    {aiSettingsSaving ? <span>自动保存中...</span> : null}
                  </div>
                  <label className="st-ai-field st-ai-prompt-field">
                    <span>系统 Prompt</span>
                    <small>用于规定 AI 的身份、语气、能力边界和回答习惯。下方会自动附加当前作品/章节上下文。</small>
                    <textarea
                      value={aiPromptDraft}
                      onChange={(event) => setAiPromptDraft(event.target.value)}
                      placeholder={DEFAULT_AI_CHAT_SYSTEM_PROMPT}
                    />
                  </label>
                  <button
                    type="button"
                    className="st-ai-reset-prompt-btn"
                    onClick={() => setAiPromptDraft(DEFAULT_AI_CHAT_SYSTEM_PROMPT)}
                  >
                    恢复默认 Prompt
                  </button>
                  <section className="st-ai-relationship-prompt">
                    <div className="st-ai-relationship-prompt-head">
                      <Network size={16} />
                      <strong>人物关系图 Prompt</strong>
                      {aiSettingsSaving ? <span>自动保存中...</span> : null}
                    </div>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>关系图提示词</span>
                      <small>用于一次性更新当前章节涉及的所有人物关系，并输出可直接保存的 JSON。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.relationshipGraph}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, relationshipGraph: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.relationshipGraph}
                      />
                    </label>
                  </section>
                  <section className="st-ai-relationship-prompt">
                    <div className="st-ai-relationship-prompt-head">
                      <ListTree size={16} />
                      <strong>时间线 Prompt</strong>
                      {aiSettingsSaving ? <span>自动保存中...</span> : null}
                    </div>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>具体时间提示词</span>
                      <small>先参考前 5 章时间线抽取故事时间，包括穿越前后、回忆、倒叙和相对时间；如果正文明确写出年代、昼夜、年龄或穿越节点，也要优先标记出来。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.timelineStoryTime}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, timelineStoryTime: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.timelineStoryTime}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>时间线提示词</span>
                      <small>参考前 10 章时间线，一次性生成章节总结、剧情事件、人物状态和伏笔动作；章节总结同步到规划，伏笔动作同步到伏笔库，并优先补充具体时间。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.timeline}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, timeline: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.timeline}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>AI 一键总结提示词</span>
                      <small>用于串行同步当前章节：先更新时间线，再判断创作计划完成状态，更新人物关系图，并只更新本章实际出现且资料库里已存在的人物稳定信息。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.chapterWrapUp}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, chapterWrapUp: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.chapterWrapUp}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>AI 纠错提示词</span>
                      <small>用于识别并自动修正文中的错别字、漏字、多字、明显误用字和标点错误；只改文字错误，不改剧情和风格。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.proofread}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, proofread: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.proofread}
                      />
                    </label>
                  </section>
                  <div className="st-ai-prompt-template-grid" aria-label="常用提示词">
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>续写提示词</span>
                      <small>用于续写正文。会参考前 5 章时间线、未回收伏笔、人物关系、资料库引用和当前章节正文；如果正文中有光标锚点，则主要读取锚点前文，生成内容应用时插入锚点处。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.continue}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, continue: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.continue}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>改写提示词</span>
                      <small>用于改写正文。会参考资料库引用和当前章节正文。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.rewrite}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, rewrite: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.rewrite}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>润色提示词</span>
                      <small>用于润色正文。会参考资料库引用和当前章节正文。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.polish}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, polish: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.polish}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>全章</span>
                      <small>用于生成完整章节。参考内容与续写一致：前 5 章时间线、未回收伏笔、人物关系、资料库引用和当前章节正文。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.generate}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, generate: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.generate}
                      />
                    </label>
                    <label className="st-ai-field st-ai-prompt-field">
                      <span>灵感提示词</span>
                      <small>用于卡文时生成接下来可写的灵感。参考内容与全章一致，但只输出方向、冲突、伏笔和写法建议，不直接写正文。</small>
                      <textarea
                        value={aiPromptTemplateDrafts.inspiration}
                        onChange={(event) => setAiPromptTemplateDrafts((current) => ({ ...current, inspiration: event.target.value }))}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATES.inspiration}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="st-ai-reset-prompt-btn"
                    onClick={() => setAiPromptTemplateDrafts({ ...DEFAULT_AI_PROMPT_TEMPLATES })}
                  >
                    恢复默认常用提示词
                  </button>
                </section>
              ) : aiSettingsMode === 'catalog' ? (
                <section className="st-ai-vendor-catalog">
                  <article className="st-ai-vendor-card">
                    <div>
                      <OpenAiIcon size={22} />
                      <div>
                        <strong>OpenAI</strong>
                        <p>连接官方 OpenAI API，使用 OpenAI 专属接口。</p>
                        <span>官方 OpenAI 连接</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleAddAiConnection('openai')}>
                      添加
                    </button>
                  </article>
                  <article className="st-ai-vendor-card">
                    <div>
                      <CompatibleAiIcon size={22} />
                      <div>
                        <strong>OpenAI compatible</strong>
                        <p>连接任意兼容 OpenAI API 的供应商。</p>
                        <span>统一使用 /chat/completions</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleAddAiConnection('openai-compatible')}>
                      添加
                    </button>
                  </article>
                </section>
              ) : (
                <section className="st-ai-connection-editor">
                  <div className="st-ai-connection-editor-head">
                    <AiProviderIcon providerType={aiSettingsDraft.providerType} size={16} />
                    <strong>{aiSettingsDraft.providerType === 'openai' ? 'OpenAI' : 'OpenAI compatible'}</strong>
                    {aiSettingsSaving ? <span>自动保存中...</span> : null}
                  </div>
                  <label className="st-ai-field">
                    <span>连接名称</span>
                    <small>给这个连接取一个容易识别的名字。</small>
                    <input
                      value={aiSettingsDraft.connectionName}
                      onChange={(event) => setAiSettingsDraft((current) => ({ ...current, connectionName: event.target.value }))}
                    />
                  </label>
                  <label className="st-ai-field">
                    <span>Base URL</span>
                    <small>
                      {aiSettingsDraft.providerType === 'openai'
                        ? '官方 OpenAI 默认使用 https://api.openai.com/v1。'
                        : '例如 DeepSeek 可填 https://api.deepseek.com/v1，其他兼容服务通常也以 /v1 结尾。'}
                    </small>
                    <input
                      value={aiSettingsDraft.baseUrl}
                      onChange={(event) => setAiSettingsDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="st-ai-field">
                    <span>API Key</span>
                    <small>保存在本机设备上。</small>
                    <div className="st-ai-key-row">
                      <input
                        type={aiApiKeyVisible ? 'text' : 'password'}
                        value={aiSettingsDraft.apiKey}
                        onChange={(event) => setAiSettingsDraft((current) => ({ ...current, apiKey: event.target.value }))}
                      />
                      <button type="button" onClick={() => setAiApiKeyVisible((current) => !current)}>
                        {aiApiKeyVisible ? '隐藏' : '显示'}
                      </button>
                    </div>
                  </label>
                  <div className="st-ai-supported-models">
                    <span>支持的模型</span>
                    {aiModelsLoading ? <p>正在获取模型...</p> : null}
                    {!aiModelsLoading && aiModelsError ? <p>{aiModelsError}</p> : null}
                    {!aiModelsLoading && !aiModelsError && aiSupportedModels.length === 0 ? <p>暂无模型</p> : null}
                    {!aiModelsLoading && aiSupportedModels.length > 0 ? (
                      <div>
                        {aiSupportedModels.map((model) => (
                          <button
                            key={model}
                            type="button"
                            className={model === aiSettingsDraft.defaultModel ? 'active' : ''}
                            onClick={() => setAiSettingsDraft((current) => ({ ...current, defaultModel: model }))}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : null}

        <div className={`st-content${aiSettingsActive ? ' st-content-hidden' : ''}${studioTab === 'plan' && planSection === 'foreshadows' ? ' st-content-no-scroll' : ''}`}>
          {projectInfoOpen ? (
            <div className="st-workspace st-project-info-workspace">
              <div className="st-canvas-shell">
                <div className="st-canvas st-project-info-canvas">
                  <div className="st-canvas-overline">作品</div>
                  <div className="st-canvas-heading st-project-info-heading">
                    <h1>书籍信息</h1>
                    <button type="button" className="st-icon-btn st-project-info-close-inline" onClick={closeProjectInfo} aria-label="关闭书籍信息">
                      <X size={15} />
                    </button>
                  </div>

                  <section className="st-project-info-editor" aria-label="书籍信息" aria-busy={projectInfoSaving}>
                    <label className="st-project-info-field st-project-info-field-large">
                      <span>书名</span>
                      <input
                        value={projectDraft.title}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="输入书名"
                        autoFocus
                      />
                    </label>

                    <label className="st-project-info-field st-project-info-field-large">
                      <span>简介</span>
                      <textarea
                        value={projectDraft.description}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder="写下这本书的简介"
                        rows={9}
                      />
                    </label>
                  </section>
                </div>
              </div>
            </div>
          ) : null}

          {!projectInfoOpen && studioTab === 'write' && currentChapter ? (
            <div className="st-workspace st-write-workspace" style={{ ['--st-inspector-width' as string]: `${inspectorWidth}px` }}>
              <div className="st-canvas-shell">
                <div className="st-canvas st-write-canvas">
                  <div className="st-write-chapter-head">
                    <div className="st-write-chapter-heading">
                      <span className="st-write-chapter-index">第{currentIndex}章</span>
                      {writerMode === 'edit' ? (
                        <input
                          className="st-write-title-input st-write-title-input-plain"
                          value={editor.title}
                          onChange={(event) => onTitleChange(event.target.value)}
                          onBlur={onBlurSave}
                          placeholder="未命名章节"
                        />
                      ) : (
                        <h1 className="st-write-title-text st-write-title-text-plain">{editor.title.trim() || '未命名章节'}</h1>
                      )}
                      <span className="st-write-word-count">{liveWordCount} 字</span>
                      {currentChapterWrapUpDone ? <span className="st-ai-wrapup-badge">已总结</span> : null}
                    </div>
                    <div className="st-write-search" role="search">
                      <Search size={13} />
                      <input
                        value={manuscriptSearchQuery}
                        onChange={(event) => {
                          setManuscriptSearchQuery(event.target.value);
                          setManuscriptSearchStatus('');
                          setManuscriptSearchIndex(-1);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.stopPropagation();
                            locateManuscriptSearch();
                          }
                        }}
                        placeholder="搜索正文"
                        aria-label="搜索当前正文"
                      />
                      {manuscriptSearchQuery ? (
                        <button
                          type="button"
                          aria-label="清空搜索"
                          onClick={() => {
                            setManuscriptSearchQuery('');
                            setManuscriptSearchStatus('');
                            setManuscriptSearchIndex(-1);
                            manuscriptEditorRef.current?.element?.querySelectorAll('.st-manuscript-search-hit').forEach((item) => {
                              item.classList.remove('st-manuscript-search-hit');
                            });
                            manuscriptReadingRef.current?.querySelectorAll('.st-manuscript-search-hit').forEach((item) => {
                              item.classList.remove('st-manuscript-search-hit');
                            });
                          }}
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                      {manuscriptSearchStatus ? <small>{manuscriptSearchStatus}</small> : null}
                    </div>
                    <div className="st-write-chapter-actions">
                      <button type="button" className="st-toolbar-btn" onClick={onToggleWriterMode}>
                        {writerMode === 'edit' ? '阅读' : '编辑'}
                      </button>
                      <button type="button" className="st-toolbar-btn" onClick={() => setFocusMode((current) => !current)}>
                        {focusMode ? '退出专注' : '专注'}
                      </button>
                    </div>
                  </div>
                  {writerMode === 'edit' ? (
                    <ManuscriptEditor
                      ref={manuscriptEditorRef}
                      className="st-write-editor st-write-editor-plain"
                      value={editor.content}
                      onChange={onContentChange}
                      onBlurSave={onBlurSave}
                      onSelectionTextChange={setManuscriptSelectionText}
                      placeholder="开始写正文..."
                      autoFocus
                    />
                  ) : (
                    <div className="st-write-reading" ref={manuscriptReadingRef}>
                      {editor.content.trim() ? (
                        getManuscriptParagraphs(editor.content)
                          .map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>)
                      ) : (
                        <p className="st-write-empty">本章还没有正文。</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {showInspector ? <ResizableDivider onResize={handleInspectorResize} className="st-divider-workspace" /> : null}

              {showInspector ? (
              <aside className="st-inspector st-writing-ai-panel">
                <section className="st-writing-ai-section st-writing-ai-header-section">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">AI 写作</span>
                    <div className="st-chat-model-select st-writing-model-select" ref={writingModelMenuRef}>
                      <button
                        type="button"
                        className="st-chat-model-button st-writing-model-button"
                        aria-haspopup="menu"
                        aria-expanded={writingModelMenuOpen}
                        onClick={() => setWritingModelMenuOpen((current) => !current)}
                      >
                        <span>{chatModelOption.label}</span>
                        <span className={`st-chat-model-caret${writingModelMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                      </button>
                      {writingModelMenuOpen ? (
                        <div className="st-chat-model-menu st-writing-model-menu" role="menu">
                          {chatModelOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              role="menuitem"
                              className={`st-chat-model-menu-item${option.value === chatModel ? ' active' : ''}`}
                              onClick={() => {
                                onChatModelChange(option.value);
                                setWritingModelMenuOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <div className="st-writing-ai-scroll">
                <section className="st-writing-ai-section">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">引用</span>
                    <div className="st-writing-ref-actions" ref={writingRefMenuRef}>
                      <button
                        type="button"
                        className="st-writing-ref-add"
                        aria-expanded={writingRefMenuOpen === 'library'}
                        onClick={() => setWritingRefMenuOpen((open) => open === 'library' ? null : 'library')}
                      >
                        资料库
                      </button>
                      <button
                        type="button"
                        className="st-writing-ref-add"
                        aria-expanded={writingRefMenuOpen === 'foreshadow'}
                        onClick={() => setWritingRefMenuOpen((open) => open === 'foreshadow' ? null : 'foreshadow')}
                      >
                        伏笔
                      </button>
                      <button
                        type="button"
                        className="st-writing-ref-add"
                        aria-expanded={writingRefMenuOpen === 'plan'}
                        onClick={() => setWritingRefMenuOpen((open) => open === 'plan' ? null : 'plan')}
                      >
                        计划
                      </button>
                      {writingRefMenuOpen === 'library' ? (
                        <div className="st-writing-ref-menu">
                          {availableWritingReferenceOptions.length > 0 ? (
                            availableWritingReferenceOptions.map((entry) => (
                              <button key={entry.id} type="button" onClick={() => void addWritingReference(entry)}>
                                <span>{entry.label}</span>
                                <small>{entry.type}</small>
                              </button>
                            ))
                          ) : (
                            <div className="st-writing-ref-menu-empty">没有可添加的资料</div>
                          )}
                        </div>
                      ) : null}
                      {writingRefMenuOpen === 'foreshadow' ? (
                        <div className="st-writing-ref-menu">
                          {availableWritingForeshadowRefs.length > 0 ? (
                            availableWritingForeshadowRefs.map((pit) => (
                              <button
                                key={pit.id}
                                type="button"
                                onClick={() => {
                                  setSelectedWritingForeshadowRefIds((current) => [...current, pit.id]);
                                  setWritingRefMenuOpen(null);
                                }}
                              >
                                <span>{pit.content}</span>
                                <small>未回收伏笔</small>
                              </button>
                            ))
                          ) : (
                            <div className="st-writing-ref-menu-empty">没有可添加的未回收伏笔</div>
                          )}
                        </div>
                      ) : null}
                      {writingRefMenuOpen === 'plan' ? (
                        <div className="st-writing-ref-menu">
                          {availableWritingPlanRefs.length > 0 ? (
                            availableWritingPlanRefs.map((plan) => (
                              <button
                                key={`${plan.index}-${plan.content}`}
                                type="button"
                                onClick={() => {
                                  setSelectedWritingPlanRefIndexes((current) => [...current, plan.index]);
                                  setWritingRefMenuOpen(null);
                                }}
                              >
                                <span>{plan.content}</span>
                                <small>未完成计划</small>
                              </button>
                            ))
                          ) : (
                            <div className="st-writing-ref-menu-empty">没有可添加的未完成计划</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="st-writing-ref-list">
                    {selectedWritingReferenceOptions.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={`st-writing-ref-item active ${entry.kind === 'character' ? 'person' : entry.type === '背景' ? 'location' : entry.type === '设定' ? 'setting' : 'other'}`}
                          onClick={() => void removeWritingReference(entry)}
                        >
                          <span>{entry.label}</span>
                        </button>
                    ))}
                    {selectedWritingForeshadowRefs.map((pit) => (
                      <button
                        key={pit.id}
                        type="button"
                        className="st-writing-ref-item active st-writing-ref-static foreshadow"
                        title={pit.content}
                        onClick={() => setSelectedWritingForeshadowRefIds((current) => current.filter((id) => id !== pit.id))}
                      >
                        {pit.content.length > 7 ? `${pit.content.slice(0, 7)}...` : pit.content}
                      </button>
                    ))}
                    {selectedWritingPlanRefs.map((plan) => (
                      <button
                        key={`${plan.index}-${plan.content}`}
                        type="button"
                        className="st-writing-ref-item active st-writing-ref-static plan"
                        title={plan.content}
                        onClick={() => setSelectedWritingPlanRefIndexes((current) => current.filter((index) => index !== plan.index))}
                      >
                        {plan.content.length > 7 ? `${plan.content.slice(0, 7)}...` : plan.content}
                      </button>
                    ))}
                    {selectedWritingReferenceOptions.length + selectedWritingForeshadowRefs.length + selectedWritingPlanRefs.length === 0 ? (
                      <p className="st-empty-copy">还没有添加引用。</p>
                    ) : null}
                  </div>
                </section>

                <section className="st-writing-ai-section st-writing-ai-action-section">
                  <div className="st-writing-ai-stack">
                    {WRITING_AI_ACTIONS.map((action) => (
                      <div className="st-writing-ai-action-row" key={action.key}>
                        <button
                          type="button"
                          className="st-writing-ai-run-button"
                          onClick={() => void runWritingAi(action.key)}
                          disabled={Boolean(writingAiRunning)}
                        >
                          <Sparkles size={14} />
                          <span>{writingAiRunning === action.key ? '生成中' : action.label}</span>
                        </button>
                        <div
                          className={`st-writing-ai-prompt-anchor${writingAiPromptAction === action.key ? ' expanded' : ''}`}
                          ref={writingAiPromptAction === action.key ? writingAiPromptPopoverRef : undefined}
                        >
                          <div className="st-writing-ai-prompt-input-wrap">
                            <input
                              className="st-writing-ai-prompt-input"
                              value={writingAiExtraPrompts[action.key]}
                              onChange={(event) => setWritingAiExtraPrompts((current) => ({ ...current, [action.key]: event.target.value }))}
                              onFocus={() => setWritingAiPromptAction(action.key)}
                              placeholder={action.placeholder}
                              aria-expanded={writingAiPromptAction === action.key}
                            />
                          </div>
                          {writingAiPromptAction === action.key ? (
                            <div className="st-writing-ai-prompt-menu">
                              <textarea
                                value={writingAiExtraPrompts[action.key]}
                                onChange={(event) => setWritingAiExtraPrompts((current) => ({ ...current, [action.key]: event.target.value }))}
                              placeholder={action.placeholder}
                              rows={4}
                              autoFocus
                            />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="st-writing-ai-section st-writing-ai-result">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">AI 结果</span>
                    {writingAiResult ? <span className="st-writing-ai-model">{writingAiResult.model}</span> : null}
                  </div>
                  {writingAiResult ? (
                    <>
                      <div className="st-writing-ai-target">
                        {writingAiResult.target === 'selection' ? '当前处理：选中文本' : writingAiResult.target === 'reference' ? '当前处理：灵感参考' : writingAiResult.target === 'cursor' ? '当前处理：续写锚点' : '当前处理：全文'}
                      </div>
                      <p>{writingAiResult.text}</p>
                      <div className="st-writing-ai-result-actions">
                        {writingAiResult.action !== 'inspiration' ? (
                          <button type="button" className="st-writing-ai-apply" onClick={applyWritingAiResult}>
                            应用
                          </button>
                        ) : null}
                        <button type="button" className="st-writing-ai-apply st-writing-ai-cancel" onClick={clearWritingAiResult}>
                          取消
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="st-empty-copy">选择引用资料后，点击上方 AI 操作生成结果。</p>
                  )}
                </section>

                <section className="st-writing-ai-section st-writing-ai-wrapup st-writing-ai-proofread">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">AI 纠错</span>
                  </div>
                  <button
                    type="button"
                    className="st-writing-ai-run-button st-writing-ai-wrapup-button"
                    onClick={() => void runProofreadAi()}
                    disabled={proofreadAiRunning || Boolean(writingAiRunning) || !editor.content.trim()}
                  >
                    <Sparkles size={14} />
                    <span>{proofreadAiRunning ? '纠错中' : '自动纠错'}</span>
                  </button>
                  <p className="st-writing-ai-wrapup-copy">
                    识别错别字、漏字、多字和明显误用字，并直接修正当前正文。
                  </p>
                  {proofreadAiStatus ? (
                    <div className="st-writing-ai-wrapup-status">{proofreadAiStatus}</div>
                  ) : null}
                  {proofreadAiChanges.length > 0 ? (
                    <div className="st-proofread-change-list" aria-label="AI 纠错修改记录">
                      {proofreadAiChanges.slice(0, 6).map((change, index) => (
                        <div className="st-proofread-change-item" key={`${index}-${change.before}-${change.after}`}>
                          <div>
                            <span>{change.before || '空'}</span>
                            <i aria-hidden="true">→</i>
                            <strong>{change.after || '空'}</strong>
                          </div>
                          {change.reason ? <small>{change.reason}</small> : null}
                        </div>
                      ))}
                      {proofreadAiChanges.length > 6 ? (
                        <small className="st-proofread-change-more">还有 {proofreadAiChanges.length - 6} 处未显示</small>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section className="st-writing-ai-section st-writing-ai-wrapup">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">AI 一键总结</span>
                  </div>
                  <button
                    type="button"
                    className="st-writing-ai-run-button st-writing-ai-wrapup-button"
                    onClick={() => void runChapterWrapUpAi()}
                    disabled={chapterWrapUpRunning || timelineAiRunning || chapterRelationshipAiRunning}
                  >
                    <Sparkles size={14} />
                    <span>{chapterWrapUpRunning ? '处理中' : '更新时间线 / 计划 / 人物'}</span>
                  </button>
                  <p className="st-writing-ai-wrapup-copy">
                    先更新具体时间和时间线，再同步计划状态、人物关系，以及本章出现人物的资料库信息。
                  </p>
                  <div className={`st-ai-wrapup-state${currentChapterWrapUpDone ? ' done' : ''}`}>
                    <span>{currentChapterWrapUpDone ? '已完成总结' : '本章还未完成总结'}</span>
                  </div>
                  {chapterWrapUpStatus ? (
                    <div className="st-writing-ai-wrapup-status">{chapterWrapUpStatus}</div>
                  ) : null}
                </section>
                </div>
              </aside>
              ) : null}
            </div>
          ) : null}

          {!projectInfoOpen && studioTab === 'write' && !currentChapter ? (
            <div className="st-workspace st-workspace-empty">
              <div className="st-canvas-shell">
                <div className="st-canvas">
                  <div className="st-canvas-overline">写作</div>
                  <div className="st-canvas-heading">
                    <h1>写作区</h1>
                    <span>{chapters.length > 0 ? '从左侧选择一个章节。' : '先创建第一章开始写作。'}</span>
                  </div>

                  <section className="st-empty-manuscript-card">
                    <div className="st-panel-topline">
                      <span className="st-panel-label">正文</span>
                      <BookOpen size={14} />
                    </div>
                    <p className="st-empty-manuscript-copy">
                      {chapters.length > 0
                        ? '从章节列表选择一章，右侧会切换成正文写作区。'
                        : '当前还没有章节。先创建一章，再用资料库配合右侧写作。'}
                    </p>
                    <div className="st-empty-manuscript-actions">
                      <button type="button" className="st-primary-action" onClick={onCreateChapter}>
                        <FilePlus2 size={14} />
                        <span>新建章节</span>
                      </button>
                      <button type="button" className="st-ghost-action" onClick={() => onSetSidebarSection('chapters')}>
                        <BookOpen size={14} />
                        <span>打开章节</span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : null}

          {!projectInfoOpen && studioTab === 'plan' ? (
            <div className="st-workspace st-plan-workspace" style={{ ['--st-inspector-width' as string]: `${inspectorWidth}px` }}>
              <div className="st-canvas-shell">
                <div className="st-canvas">
                  <div className="st-plan-tabs" role="tablist" aria-label="规划分区">
                    <button type="button" className={planSection === 'overview' ? 'active' : ''} onClick={() => setPlanSection('overview')}>
                      <BookCopy size={14} />
                      <span>故事总览</span>
                    </button>
                    <button type="button" className={planSection === 'summaries' ? 'active' : ''} onClick={() => setPlanSection('summaries')}>
                      <FileText size={14} />
                      <span>章节摘要</span>
                    </button>
                    <button type="button" className={planSection === 'plans' ? 'active' : ''} onClick={() => setPlanSection('plans')}>
                      <ListTree size={14} />
                      <span>创作计划</span>
                    </button>
                    <button type="button" className={planSection === 'foreshadows' ? 'active' : ''} onClick={() => setPlanSection('foreshadows')}>
                      <Eye size={14} />
                      <span>伏笔库</span>
                    </button>
                  </div>

                  {planSection === 'overview' ? (
                    <section className="st-plan-panel st-plan-overview">
                      <div className="st-plan-panel-head">
                        <span>作品级</span>
                        <strong>总大纲</strong>
                      </div>
                      <label className="st-plan-text-block st-plan-outline-block">
                        <span>大纲</span>
                        <textarea
                          value={projectDraft.outline_text}
                          onChange={(event) => setProjectDraft((current) => ({ ...current, outline_text: event.target.value }))}
                          placeholder="写下整本书的大方向、主线、核心冲突和结局预期。"
                          rows={10}
                        />
                      </label>
                    </section>
                  ) : null}

                  {planSection === 'summaries' ? (
                    <section className="st-plan-panel">
                      <div className="st-plan-panel-head">
                        <span>章节级</span>
                        <strong>章节摘要总结</strong>
                      </div>
                      <div className="st-plan-lane">
                        <div className="st-plan-row">
                          <span>当前章节摘要</span>
                          <p>{currentChapter ? currentChapterSummaryText : '先选择一个章节，再查看这一章的长期记忆摘要。'}</p>
                        </div>
                        <div className="st-plan-row">
                          <span>全书摘要索引</span>
                          {timelineChapterSummaries.length > 0 ? (
                            <div className="st-plan-summary-list">
                              {timelineChapterSummaries.map((item) => (
                                <div key={item.id} className="st-plan-summary-item">
                                  <strong>第 {item.chapter_index_no} 章 · {item.chapter_title || '未命名章节'}</strong>
                                  <p>{item.summary}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p>这里以后按章节显示简短总结，供 AI 长期记忆读取。</p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {planSection === 'plans' ? (
                    <section className="st-plan-panel st-plan-panel-writing-plans">
                      <div className="st-foreshadow-toolbar">
                        <div className="st-foreshadow-actions">
                          <button type="button" className="st-ghost-action" onClick={() => void createWritingPlan()} disabled={!currentChapter}>
                            <Plus size={14} />
                            <span>新建计划</span>
                          </button>
                        </div>
                        <div className="st-inline-toggle st-foreshadow-filter-toggle" role="tablist" aria-label="创作计划筛选">
                          {([
                            ['all', '全部'],
                            ['open', '未完成'],
                            ['done', '已完成']
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={writingPlanFilter === value ? 'active' : ''}
                              role="tab"
                              aria-selected={writingPlanFilter === value}
                              onClick={() => setWritingPlanFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="st-foreshadow-layout st-writing-plan-layout">
                        <div className="st-foreshadow-list-scroll">
                          <div className="st-foreshadow-list" role="list" aria-label="创作计划列表">
                            {!currentChapter ? (
                              <div className="st-foreshadow-empty">先选择一个章节。</div>
                            ) : filteredWritingPlans.length > 0 ? (
                              filteredWritingPlans.map((plan) => (
                                <div
                                  key={`${plan.index}-${plan.content.slice(0, 16)}`}
                                  className={`st-foreshadow-row${selectedWritingPlan?.index === plan.index ? ' active' : ''}`}
                                >
                                  <button
                                    type="button"
                                    className="st-foreshadow-row-main-button"
                                    onClick={() => {
                                      setSelectedWritingPlanIndex(plan.index);
                                      setWritingPlanDraft(plan.content);
                                    }}
                                  >
                                    <div className="st-foreshadow-row-main">
                                      <strong title={plan.content}>{plan.content.length > 7 ? `${plan.content.slice(0, 7)}...` : plan.content}</strong>
                                    </div>
                                    <div className="st-foreshadow-row-meta">
                                      <span>{currentChapterDisplayNumber ? `第${currentChapterDisplayNumber}章` : '当前章节'}</span>
                                      <span>{plan.done ? '已完成' : '未完成'}</span>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    className="st-foreshadow-row-delete"
                                    aria-label={`删除计划 ${plan.content}`}
                                    onClick={() => void deleteWritingPlan(plan.index)}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="st-foreshadow-empty">{writingPlans.length > 0 ? '当前筛选下没有计划。' : '还没有计划，先新建一个。'}</div>
                            )}
                          </div>
                        </div>

                        <div className="st-foreshadow-detail">
                          {currentChapter && selectedWritingPlan ? (
                            <>
                              <div className="st-foreshadow-detail-head">
                                <div>
                                  <span>{selectedWritingPlan.done ? '已完成' : '未完成'}</span>
                                  <strong>计划详情</strong>
                                </div>
                              </div>

                              <div className="st-foreshadow-detail-scroll">
                                <label className="st-foreshadow-field">
                                  <span>计划内容</span>
                                  <textarea
                                    value={writingPlanDraft}
                                    onChange={(event) => setWritingPlanDraft(event.target.value)}
                                    onBlur={() => void persistSelectedWritingPlan()}
                                    rows={8}
                                    placeholder="写下当前章节的临时想法、后续方向或待验证设想。"
                                  />
                                </label>

                                <div className="st-writing-plan-status-row">
                                  <span>状态：</span>
                                  <button
                                    type="button"
                                    className={`st-writing-plan-status-chip${selectedWritingPlan.done ? ' done' : ' open'}`}
                                    onClick={() => void setSelectedWritingPlanDone(!selectedWritingPlan.done)}
                                  >
                                    {selectedWritingPlan.done ? '已完成' : '未完成'}
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="st-empty-copy">{currentChapter ? '先从左边选一个计划。' : '选择章节后，这里显示当前章节计划。'}</p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {planSection === 'foreshadows' ? (
                    <section className="st-plan-panel st-plan-panel-foreshadows">
                      <div className="st-foreshadow-toolbar">
                        <div className="st-foreshadow-actions">
                          <button type="button" className="st-ghost-action" onClick={() => void createForeshadow()}>
                            <Plus size={14} />
                            <span>新建伏笔</span>
                          </button>
                        </div>
                        <div className="st-inline-toggle st-foreshadow-filter-toggle" role="tablist" aria-label="伏笔筛选">
                          {([
                            ['all', '全部'],
                            ['open', '未回收'],
                            ['active', '推进中'],
                            ['resolved', '已回收']
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={foreshadowFilter === value ? 'active' : ''}
                              role="tab"
                              aria-selected={foreshadowFilter === value}
                              onClick={() => setForeshadowFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="st-foreshadow-layout">
                        <div className="st-foreshadow-list-scroll">
                          <div className="st-foreshadow-list" role="list" aria-label="伏笔列表">
                            {filteredForeshadowPits.length > 0 ? filteredForeshadowPits.map((pit) => (
                              <div
                                key={pit.id}
                                className={`st-foreshadow-row${selectedForeshadow?.id === pit.id ? ' active' : ''}`}
                              >
                                <button
                                  type="button"
                                  className="st-foreshadow-row-main-button"
                                  onClick={() => {
                                    setSelectedForeshadowId(pit.id);
                                    setForeshadowContentDraft(pit.content);
                                    setForeshadowNoteDraft(pit.note ?? '');
                                  }}
                                >
                                  <div className="st-foreshadow-row-main">
                                    <strong>{pit.content}</strong>
                                  </div>
                                  <div className="st-foreshadow-row-meta">
                                    <span>{getForeshadowOriginLabel(pit)}</span>
                                    <span>{getForeshadowResponseCount(pit)} 次响应</span>
                                    <span>{getForeshadowResolvedLabel(pit)}</span>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  className="st-foreshadow-row-delete"
                                  aria-label={`删除伏笔 ${pit.content}`}
                                  onClick={() => {
                                    setSelectedForeshadowId(pit.id);
                                    void onDeleteForeshadowPit(pit.id).then((deleted) => {
                                      if (!deleted) {
                                        return;
                                      }
                                      const next = storyPits.find((item) => item.id !== pit.id) ?? null;
                                      setSelectedForeshadowId(next?.id ?? null);
                                      setForeshadowContentDraft(next?.content ?? '');
                                      setForeshadowNoteDraft(next?.note ?? '');
                                    });
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )) : (
                              <div className="st-foreshadow-empty">还没有伏笔，先新建一个。</div>
                            )}
                          </div>
                        </div>

                        <div className="st-foreshadow-detail">
                          {selectedForeshadow ? (
                            <>
                              <div className="st-foreshadow-detail-head">
                                <div>
                                  <span>{getForeshadowStatusLabel(selectedForeshadow)}</span>
                                  <strong>伏笔详情</strong>
                                </div>
                                <span>{getForeshadowResponseCount(selectedForeshadow)} 次响应</span>
                              </div>

                              <div className="st-foreshadow-detail-scroll">
                                <label className="st-foreshadow-field">
                                  <span>伏笔内容</span>
                                  <textarea
                                    value={foreshadowContentDraft}
                                    onChange={(event) => setForeshadowContentDraft(event.target.value)}
                                    onBlur={() => void persistSelectedForeshadow()}
                                    rows={3}
                                    placeholder="例如：玉佩裂痕、古井异常、村长的谎言..."
                                  />
                                </label>

                                <label className="st-foreshadow-field">
                                  <span>说明 / 备注</span>
                                  <textarea
                                    value={foreshadowNoteDraft}
                                    onChange={(event) => setForeshadowNoteDraft(event.target.value)}
                                    onBlur={() => void persistSelectedForeshadow()}
                                    rows={4}
                                    placeholder="写下这个伏笔要怎么埋、怎么响、怎么回收。"
                                  />
                                </label>

                                <div className="st-foreshadow-meta-grid">
                                  <div>
                                    <span>首次埋设</span>
                                    <strong>{getForeshadowOriginLabel(selectedForeshadow)}</strong>
                                  </div>
                                  <div>
                                    <span>回收章节</span>
                                    <strong>{getForeshadowResolvedLabel(selectedForeshadow)}</strong>
                                  </div>
                                  <div>
                                    <span>状态</span>
                                    <strong>{getForeshadowStatusLabel(selectedForeshadow)}</strong>
                                  </div>
                                  <div>
                                    <span>创建方式</span>
                                    <strong>{getForeshadowCreationMethodLabel(selectedForeshadow)}</strong>
                                  </div>
                                </div>

                                <div className="st-foreshadow-trace">
                                  <div className="st-foreshadow-trace-head">
                                    <span>章节响应记录</span>
                                  </div>
                                  {selectedForeshadowRecords.length > 0 ? (
                                    selectedForeshadowRecords.map((record) => (
                                      <article key={record.id} className="st-foreshadow-trace-item">
                                        <div className="st-foreshadow-trace-meta">
                                          <strong>{record.chapter_title ? `第${record.chapter_index_no}章 · ${record.chapter_title}` : `第${record.chapter_index_no}章`}</strong>
                                          <span>{record.status || '推进'}</span>
                                        </div>
                                        {record.summary ? <p>{record.summary}</p> : null}
                                        {record.clue ? <p>线索：{record.clue}</p> : null}
                                        {record.payoff ? <p>回收：{record.payoff}</p> : null}
                                      </article>
                                    ))
                                  ) : (
                                    <p className="st-empty-copy">这个伏笔还没有匹配到章节响应记录。</p>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="st-empty-copy">先从左边选一个伏笔。</p>
                          )}
                        </div>
                      </div>
                    </section>
                  ) : null}
              </div>

              </div>

              {showInspector ? <ResizableDivider onResize={handleInspectorResize} className="st-divider-workspace" /> : null}

              {showInspector ? (
              <aside className="st-inspector">
                <section className="st-inspector-card">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">选中章节</span>
                  </div>
                  <h3>{currentChapter ? chapterTitle : '未选择章节'}</h3>
                  <p>{currentChapter ? beatText : '点击左侧或中间卡片，把某一章送入写作工作台。'}</p>
                </section>

                <section className="st-inspector-card">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">故事上下文</span>
                  </div>
                  <div className="st-chip-group">
                    {topCharacters.map((entry) => (
                      <span key={entry.id} className="st-chip person">
                        {entry.name}
                      </span>
                    ))}
                    {topLore.map((entry) => (
                      <span key={entry.id} className="st-chip lore">
                        {entry.title}
                      </span>
                    ))}
                  </div>
                </section>
              </aside>
              ) : null}
            </div>
          ) : null}

          {!projectInfoOpen && studioTab === 'relationships' ? (
            <div className="st-workspace st-relationships-workspace">
              <div className="st-relationships-shell">
                <section className="st-relationship-panel st-relationship-map">
                  <div className="st-panel-topline">
                    <div className="st-relationship-map-title">
                      <span className="st-panel-label">关系图</span>
                      <div className="st-relationship-mode-toggle" role="tablist" aria-label="关系图模式">
                        <button
                          type="button"
                          className={relationshipGraphMode === 'library' ? 'active' : ''}
                          role="tab"
                          aria-selected={relationshipGraphMode === 'library'}
                          onClick={() => setRelationshipGraphMode('library')}
                        >
                          资料库
                        </button>
                        <button
                          type="button"
                          className={relationshipGraphMode === 'chapter' ? 'active' : ''}
                          role="tab"
                          aria-selected={relationshipGraphMode === 'chapter'}
                          onClick={() => setRelationshipGraphMode('chapter')}
                        >
                          当前章节
                        </button>
                      </div>
                    </div>
                    <div className="st-relationship-map-actions">
                      <button type="button" className="st-text-link" onClick={() => openAiSettings('prompt')}>
                        <Network size={13} />
                        <span>关系 Prompt</span>
                      </button>
                      <div className="st-chat-model-select st-relationship-model-select" ref={relationshipModelMenuRef}>
                        <button
                          type="button"
                          className="st-chat-model-button st-relationship-model-button"
                          aria-haspopup="menu"
                          aria-expanded={relationshipModelMenuOpen}
                          onClick={() => setRelationshipModelMenuOpen((current) => !current)}
                        >
                          <span>{chatModelOption.label}</span>
                          <span className={`st-chat-model-caret${relationshipModelMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                        </button>
                        {relationshipModelMenuOpen ? (
                          <div className="st-chat-model-menu st-relationship-model-menu" role="menu">
                            {chatModelOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitem"
                                className={`st-chat-model-menu-item${option.value === chatModel ? ' active' : ''}`}
                                onClick={() => {
                                  onChatModelChange(option.value);
                                  setRelationshipModelMenuOpen(false);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {activeRelationshipCharacters.length > 0 ? (
                    <div className="st-relationship-canvas" ref={relationshipCanvasRef}>
                      <svg className="st-relationship-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        {relationshipLinks.map((link, index) => {
                          const fromNode = relationshipGraphNodes[link.from];
                          const toNode = relationshipGraphNodes[link.to];
                          if (!fromNode || !toNode) {
                            return null;
                          }

                          const active =
                            selectedRelationshipCharacter
                              ? fromNode.entry.id === selectedRelationshipCharacter.id || toNode.entry.id === selectedRelationshipCharacter.id
                              : false;
                          const shape = getRelationshipLinkShape(fromNode, toNode, index);

                          return (
                            <path
                              key={`${link.from}-${link.to}-${index}`}
                              d={shape.path}
                              className={`st-relationship-link${link.inferred ? ' inferred' : ''}${active ? ' active' : ''}`}
                            />
                          );
                        })}
                      </svg>
                      {relationshipLinks.map((link, index) => {
                        const fromNode = relationshipGraphNodes[link.from];
                        const toNode = relationshipGraphNodes[link.to];
                        if (!fromNode || !toNode) {
                          return null;
                        }

                        const active =
                          selectedRelationshipCharacter
                            ? fromNode.entry.id === selectedRelationshipCharacter.id || toNode.entry.id === selectedRelationshipCharacter.id
                            : false;
                        const shape = getRelationshipLinkShape(fromNode, toNode, index);

                        return (
                          <span
                            key={`label-${link.from}-${link.to}-${index}`}
                            className={`st-relationship-link-label${link.inferred ? ' inferred' : ''}${active ? ' active' : ''}`}
                            style={{ left: `${shape.labelX}%`, top: `${shape.labelY}%` }}
                            title={link.label}
                          >
                            {link.label}
                          </span>
                        );
                      })}
                      {relationshipGraphNodes.map((node, index) => (
                        <button
                          key={node.entry.id}
                          type="button"
                          className={`st-relationship-node${selectedRelationshipCharacter?.id === node.entry.id ? ' active' : ''}${relationshipDraggingId === node.entry.id ? ' dragging' : ''}`}
                          style={{ left: `${node.x}%`, top: `${node.y}%` }}
                          onPointerDown={(event) => handleRelationshipNodePointerDown(event, node.entry.id, { x: node.x, y: node.y })}
                          onPointerMove={(event) => handleRelationshipNodePointerMove(event, node.entry.id)}
                          onPointerUp={(event) => handleRelationshipNodePointerUp(event)}
                          onPointerCancel={(event) => handleRelationshipNodePointerUp(event)}
                          onClick={() => handleOpenRelationshipCharacter(node.entry)}
                        >
                          <span>{node.entry.name.slice(0, 1)}</span>
                          <strong>{node.entry.name}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="st-relationship-empty">
                      <Network size={30} />
                      <h3>{relationshipGraphMode === 'library' ? '还没有本章人物关系' : '还没有当前章节关系图'}</h3>
                      <p>{relationshipGraphMode === 'library' ? '把人物加入当前章节引用后，这里会自动变成关系图。' : '点击 AI 更新章节关系图，生成本章里出现的人物关系。'}</p>
                    </div>
                  )}
                </section>

                <section className="st-relationship-panel st-relationship-detail">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">{relationshipGraphMode === 'library' ? '人物关系' : '当前章节关系'}</span>
                    {relationshipGraphMode === 'library' ? (
                      <button
                        type="button"
                        className="st-ghost-action"
                        onClick={() => void runChapterRelationshipGraphAi('library')}
                        disabled={!currentChapter || chapterRelationshipAiRunning || !editor.content.trim()}
                      >
                        <Sparkles size={14} />
                        <span>{chapterRelationshipAiRunning ? '生成中' : 'AI 更新章节关系图'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="st-ghost-action"
                        onClick={() => void runChapterRelationshipGraphAi()}
                        disabled={!currentChapter || chapterRelationshipAiRunning || !editor.content.trim()}
                      >
                        <Sparkles size={14} />
                        <span>{chapterRelationshipAiRunning ? '生成中' : 'AI 更新章节关系图'}</span>
                      </button>
                    )}
                  </div>
                  {relationshipGraphMode === 'library' ? (
                    selectedRelationshipCharacter ? (
                      <>
                        <h3>{selectedRelationshipCharacter.name}</h3>
                        {selectedLibraryRelationshipLinks.length > 0 ? (
                          <div className="st-relationship-line-list">
                            {selectedLibraryRelationshipLinks.map((link) => (
                              <div key={link.id} className="st-relationship-line-item">
                                <label className="st-relationship-line-row">
                                  <span>{link.name}</span>
                                  <input
                                    value={link.label}
                                    onChange={(event) => updateLibraryRelationshipLine(link.id, event.target.value)}
                                    placeholder="关系"
                                  />
                                </label>
                                {link.events.length > 0 ? (
                                  <div className="st-relationship-history">
                                    {link.events.map((event) => (
                                      <span key={event.id}>
                                        {event.chapter_index_no ? `第${event.chapter_index_no}章` : '手动'} {event.label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="st-empty-copy">当前还没有可编辑的明确关系。</p>
                        )}
                      </>
                    ) : (
                      <p className="st-empty-copy">请选择一个人物查看关系内容。</p>
                    )
                  ) : selectedRelationshipCharacter ? (
                    <>
                      <h3>{selectedRelationshipCharacter.name}</h3>
                      <div className="st-chapter-relationship-list">
                        {selectedChapterRelationshipLinks.length > 0 ? (
                          selectedChapterRelationshipLinks.map((link, index) => (
                            <article key={link.id || `${link.fromId}-${link.toId}-${index}`}>
                              <div className="st-chapter-relationship-title">
                                <span>与{link.otherName}：</span>
                                <input
                                  value={link.label}
                                  onChange={(event) => updateChapterRelationshipLink(link.id, { label: event.target.value.slice(0, 8) })}
                                  placeholder="关系"
                                />
                                <button type="button" aria-label={`删除与${link.otherName}的关系`} onClick={() => deleteChapterRelationshipLink(link.id)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              <textarea
                                value={link.summary}
                                onChange={(event) => updateChapterRelationshipLink(link.id, { summary: event.target.value })}
                                placeholder="补充这条关系在当前章节中的说明..."
                                rows={3}
                              />
                            </article>
                          ))
                        ) : (
                          <p className="st-empty-copy">当前章节里还没有关于这个人物的明确关系说明。</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="st-empty-copy">请选择一个人物查看当前章节关系。</p>
                  )}
                </section>
              </div>
            </div>
          ) : null}

          {!projectInfoOpen && studioTab === 'timeline' ? (
            <div className="st-workspace st-timeline-workspace">
              <aside className="st-timeline-side" aria-label="时间线内容类型">
                <button
                  type="button"
                  className={timelineMode === 'storyTime' ? 'active' : ''}
                  onClick={() => {
                    setTimelineMode('storyTime');
                    openTimelineDetailForChapter();
                  }}
                >
                  具体时间
                </button>
                <button
                  type="button"
                  className={timelineMode === 'events' ? 'active' : ''}
                  onClick={() => {
                    setTimelineMode('events');
                    openTimelineDetailForChapter();
                  }}
                >
                  剧情事件
                </button>
                <button
                  type="button"
                  className={timelineMode === 'characterStates' ? 'active' : ''}
                  onClick={() => {
                    setTimelineMode('characterStates');
                    openTimelineDetailForChapter();
                  }}
                >
                  人物状态
                </button>
                <button
                  type="button"
                  className={timelineMode === 'foreshadows' ? 'active' : ''}
                  onClick={() => {
                    setTimelineMode('foreshadows');
                    openTimelineDetailForChapter();
                  }}
                >
                  伏笔回收
                </button>
                <button
                  type="button"
                  className={timelineMode === 'chapterSummary' ? 'active' : ''}
                  onClick={() => {
                    setTimelineMode('chapterSummary');
                    openTimelineDetailForChapter();
                  }}
                >
                  章节总结
                </button>
              </aside>

              <main className="st-timeline-main">
                <div className="st-timeline-head">
                  <div className="st-timeline-intro">
                    <strong>整体剧情线</strong>
                    <span>点代表章节，亮点代表已经生成时间线内容。</span>
                  </div>

                  <div className="st-timeline-actions">
                    <div className="st-timeline-range" aria-label="时间线章节范围">
                      <span>章节</span>
                      <input
                        value={timelineRangeStart}
                        onChange={(event) => {
                          timelineRangeSelectPendingRef.current = true;
                          setTimelineRangeStart(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                        }}
                        inputMode="numeric"
                        aria-label="开始章节"
                      />
                      <i>~</i>
                      <input
                        value={timelineRangeEnd}
                        onChange={(event) => {
                          timelineRangeSelectPendingRef.current = true;
                          if (currentChapter) {
                            setTimelineSelectedChapterId(currentChapter.id);
                          }
                          setTimelineRangeEnd(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                        }}
                        inputMode="numeric"
                        aria-label="结束章节"
                      />
                      <small>{timelineRangeIsCompressed ? '压缩' : `${timelineWindowStart}-${timelineWindowEnd}`}</small>
                    </div>

                    <div className="st-chat-model-select st-timeline-model-select" ref={timelineModelMenuRef}>
                      <span className="st-timeline-model-label">模型</span>
                      <button
                        type="button"
                        className="st-chat-model-button st-timeline-model-button"
                        aria-haspopup="menu"
                        aria-expanded={timelineModelMenuOpen}
                        onClick={() => setTimelineModelMenuOpen((open) => !open)}
                      >
                        <span>{chatModelOptions.find((option) => option.value === chatModel)?.label ?? chatModel}</span>
                        <span className={`st-chat-model-caret${timelineModelMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                      </button>
                      {timelineModelMenuOpen ? (
                        <div className="st-chat-model-menu st-timeline-model-menu" role="menu">
                          {chatModelOptions.map((option) => (
                            <button
                              type="button"
                              key={option.value}
                              className={option.value === chatModel ? 'active' : ''}
                              onClick={() => {
                                onChatModelChange(option.value);
                                setTimelineModelMenuOpen(false);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="st-ai-inline-button"
                      onClick={() => {
                        openTimelineDetailForChapter();
                        void runTimelineEventAi();
                      }}
                      disabled={timelineAiRunning}
                    >
                      <Sparkles size={15} />
                      <span>{timelineAiRunning ? '生成中' : 'AI 更新章节时间线'}</span>
                    </button>
                  </div>
                </div>

                {timelineStatusText ? (
                  <div className="st-timeline-status">{timelineStatusText}</div>
                ) : null}

                <div className="st-storyline-map" ref={timelineMapRef}>
                  {chapters.length > 0 ? (
                    <>
                      <svg className="st-storyline-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <path
                          d={timelineStoryPath}
                          className="st-storyline-path soft"
                        />
                        <path
                          d={timelineStoryPath}
                          className="st-storyline-path"
                        />
                      </svg>
                      {timelineSlots.map((node) => {
                        if (node.isGap) {
                          return (
                            <span
                              key={node.slotIndex}
                              className="st-storyline-gap"
                              style={{ left: `${node.point.x}%`, top: `${node.point.y}%` }}
                              aria-hidden="true"
                            >
                              ...
                            </span>
                          );
                        }
                        if (!node.chapter || typeof node.displayNumber !== 'number') {
                          return null;
                        }
                        const nodeChapter = node.chapter;
                        return (
                          <button
                            type="button"
                            key={node.slotIndex}
                            className={`st-storyline-node${node.inSelectedRange ? ' in-range' : ' out-range'}${selectedTimelineChapter?.chapter?.id === nodeChapter.id ? ' active' : ''}${node.events.length + node.chapterSummaries.length + node.characterStates.length + node.foreshadows.length + node.storyTimes.length > 0 ? ' has-events' : ''}`}
                            style={{ left: `${node.point.x}%`, top: `${node.point.y}%` }}
                            data-chapter-id={nodeChapter.id}
                            onClick={(event) => {
                              const anchorRect = event.currentTarget.getBoundingClientRect();
                              if (timelineDetailOpen && timelineSelectedChapterId === nodeChapter.id) {
                                setTimelineDetailOpen(false);
                                return;
                              }
                              timelineDetailAnchorRectRef.current = anchorRect;
                              setTimelineDetailPosition(getTimelineDetailPositionFromRect(anchorRect));
                              setTimelineSelectedChapterId(nodeChapter.id);
                              setTimelineDetailOpen(true);
                              onSelectChapter(nodeChapter.id);
                              setTimelineMode((mode) => mode || 'events');
                            }}
                            aria-label={`第 ${node.displayNumber} 章`}
                          >
                            <span>{node.slotIndex}</span>
                            <small>第{node.displayNumber}章</small>
                          </button>
                        );
                      })}
                      {timelineDetailOpen && typeof document !== 'undefined'
                        ? createPortal(
                      <aside
                        className={`st-timeline-detail${timelineDetailDragging ? ' dragging' : ''}`}
                        ref={timelineDetailRef}
                        style={timelineDetailPosition ? { position: 'fixed', left: `${timelineDetailPosition.x}px`, top: `${timelineDetailPosition.y}px`, right: 'auto' } : undefined}
                        onPointerDown={(event) => {
                          if (event.button !== 0) {
                            return;
                          }
                          const detailRect = timelineDetailRef.current?.getBoundingClientRect();
                          if (!detailRect) {
                            return;
                          }
                          event.currentTarget.setPointerCapture(event.pointerId);
                          timelineDetailAnchorRectRef.current = null;
                          setTimelineDetailDragging(true);
                          timelineDetailDragMovedRef.current = false;
                          const offsetX = event.clientX - detailRect.left;
                          const offsetY = event.clientY - detailRect.top;
                          const startX = event.clientX;
                          const startY = event.clientY;
                          const handlePointerMove = (moveEvent: PointerEvent) => {
                            if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 3) {
                              timelineDetailDragMovedRef.current = true;
                            }
                            const nextX = moveEvent.clientX - offsetX;
                            const nextY = moveEvent.clientY - offsetY;
                            const width = detailRect.width || 300;
                            const height = detailRect.height || 160;
                            setTimelineDetailPosition(clampTimelineDetailPosition(nextX, nextY, width, height));
                          };
                          const handlePointerUp = () => {
                            setTimelineDetailDragging(false);
                            window.removeEventListener('pointermove', handlePointerMove);
                            window.removeEventListener('pointerup', handlePointerUp);
                            window.setTimeout(() => {
                              timelineDetailDragMovedRef.current = false;
                            }, 0);
                          };
                          window.addEventListener('pointermove', handlePointerMove);
                          window.addEventListener('pointerup', handlePointerUp);
                        }}
                      >
                        {selectedTimelineChapter ? (
                          <>
                            <div className="st-timeline-detail-head">
                              <span>第 {selectedTimelineChapter.displayNumber} 章 · {selectedTimelineChapter.chapter?.title || '未命名章节'}</span>
                            </div>
                            {timelineMode === 'storyTime' ? (
                              selectedTimelineChapter.storyTimes.length > 0 ? (
                                <div className="st-timeline-detail-list">
                                  {selectedTimelineChapter.storyTimes.map((item) => (
                                    <article
                                      key={item.id}
                                      className="st-timeline-detail-event st-timeline-detail-time"
                                      onClick={() => {
                                        if (!timelineDetailDragMovedRef.current) {
                                          setTimelineDetailOpen(false);
                                        }
                                      }}
                                    >
                                      <div className="st-timeline-detail-body">
                                        <div className="st-timeline-event-title">
                                          <span>{item.time_type === 'absolute' ? '具体' : item.time_type === 'relative' ? '相对' : '未知'}</span>
                                          <strong>{item.time_text || '未知时间'}</strong>
                                        </div>
                                        {item.summary ? <p>{item.summary}</p> : null}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="st-empty-copy">这一章还没有具体时间，点击 AI 更新章节时间线后会写入这里。</p>
                              )
                            ) : timelineMode === 'events' ? (
                              selectedTimelineChapter.events.length > 0 ? (
                                <div className="st-timeline-detail-list">
                                  {selectedTimelineChapter.events.map((event) => (
                                    <article
                                      key={event.id}
                                      className="st-timeline-detail-event"
                                      onClick={() => {
                                        if (!timelineDetailDragMovedRef.current) {
                                          setTimelineDetailOpen(false);
                                        }
                                      }}
                                    >
                                      <div className="st-timeline-detail-body">
                                        <div className="st-timeline-event-title">
                                          {event.event_type ? <span>{event.event_type}</span> : null}
                                          <strong>{event.title}</strong>
                                        </div>
                                        {event.summary ? <p>{event.summary}</p> : null}
                                        {event.character_names_json.length > 0 ? (
                                          <div className="st-timeline-characters">
                                            {event.character_names_json.map((name) => (
                                              <span key={name}>{name}</span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="st-empty-copy">这一章还没有剧情事件，点击 AI 更新章节时间线后会写入这里。</p>
                              )
                            ) : timelineMode === 'characterStates' ? (
                              selectedTimelineChapter.characterStates.length > 0 ? (
                                <div className="st-timeline-detail-list">
                                  {selectedTimelineChapter.characterStates.map((state) => (
                                    <article
                                      key={state.id}
                                      className="st-timeline-detail-event st-timeline-detail-state"
                                      onClick={() => {
                                        if (!timelineDetailDragMovedRef.current) {
                                          setTimelineDetailOpen(false);
                                        }
                                      }}
                                    >
                                      <div className="st-timeline-detail-body">
                                        <div className="st-timeline-event-title">
                                          <span>状态</span>
                                          <strong>{state.character_name}</strong>
                                        </div>
                                        <div className="st-timeline-state-meta">
                                          {[state.mood, state.goal, state.stance, state.physical_state].filter(Boolean).map((item) => (
                                            <span key={item}>{item}</span>
                                          ))}
                                        </div>
                                        {state.summary ? <p>{state.summary}</p> : null}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="st-empty-copy">这一章还没有人物状态，点击 AI 更新章节时间线后会写入这里。</p>
                              )
                            ) : timelineMode === 'chapterSummary' ? (
                              selectedTimelineChapter.chapterSummaries.length > 0 ? (
                                <div className="st-timeline-detail-list">
                                  {selectedTimelineChapter.chapterSummaries.map((item) => (
                                    <article
                                      key={item.id}
                                      className="st-timeline-detail-event st-timeline-detail-summary"
                                      onClick={() => {
                                        if (!timelineDetailDragMovedRef.current) {
                                          setTimelineDetailOpen(false);
                                        }
                                      }}
                                    >
                                      <div className="st-timeline-detail-body">
                                        <div className="st-timeline-event-title">
                                          <span>摘要</span>
                                          <strong>章节总结</strong>
                                        </div>
                                        {item.summary ? <p>{item.summary}</p> : null}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="st-empty-copy">这一章还没有章节总结，点击 AI 更新章节时间线后会写入这里。</p>
                              )
                            ) : (
                              selectedTimelineChapter.foreshadows.length > 0 ? (
                                <div className="st-timeline-detail-list">
                                  {selectedTimelineChapter.foreshadows.map((item) => (
                                    <article
                                      key={item.id}
                                      className="st-timeline-detail-event st-timeline-detail-foreshadow"
                                      onClick={() => {
                                        if (!timelineDetailDragMovedRef.current) {
                                          setTimelineDetailOpen(false);
                                        }
                                      }}
                                    >
                                      <div className="st-timeline-detail-body">
                                        <div className="st-timeline-event-title">
                                          {item.status ? <span>{item.status}</span> : null}
                                          <strong>{item.title}</strong>
                                        </div>
                                        {item.summary ? <p>{item.summary}</p> : null}
                                        {item.clue || item.payoff ? (
                                          <div className="st-timeline-clue-lines">
                                            {item.clue ? <span>线索：{item.clue}</span> : null}
                                            {item.payoff ? <span>回收：{item.payoff}</span> : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <p className="st-empty-copy">这一章还没有伏笔记录，点击 AI 更新章节时间线后会写入这里。</p>
                              )
                            )}
                          </>
                        ) : (
                          <p className="st-empty-copy">请选择一个章节节点。</p>
                        )}
                      </aside>, document.body)
                        : null}
                    </>
                  ) : (
                    <div className="st-timeline-empty compact">
                      <ListTree size={28} />
                      <h3>还没有章节</h3>
                      <p>先新建章节，整体剧情线会按章节生成。</p>
                    </div>
                  )}
                </div>
              </main>
            </div>
          ) : null}


          {!projectInfoOpen && studioTab === 'chat' ? (
            <div className="st-workspace st-chat-workspace">
              <div className="st-canvas-shell">
                <div className="st-canvas st-chat-canvas">
                <section className="st-chat-panel st-chat-panel-live">
                  <div className="st-chat-scroll">
                    {chatMessages.length === 0 ? (
                      <div className="st-chat-empty">
                        <MessageSquare size={26} />
                        <h3>这是一个新的对话</h3>
                        <p>从下面输入问题开始。当前作品和章节上下文会自动带入。</p>
                      </div>
                    ) : (
                      chatMessages.map((message, index) => (
                        <article key={`${message.role}-${index}`} className={`st-chat-message ${message.role}`}>
                          <div className="st-chat-message-role">
                            {message.role === 'user'
                              ? '你'
                              : ['AI', message.provider, message.model].filter(Boolean).join(' · ')}
                          </div>
                          <p>{message.content}</p>
                        </article>
                      ))
                    )}
                    {chatSending ? (
                      <article className="st-chat-message assistant pending">
                        <div className="st-chat-message-role">AI</div>
                        <p>正在思考...</p>
                      </article>
                    ) : null}
                  </div>

                  <form
                    className="st-chat-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSendChat();
                    }}
                  >
                    <textarea
                      className="st-chat-input"
                      value={chatDraft}
                      onChange={(event) => onChatDraftChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          onSendChat();
                        }
                      }}
                      placeholder="问剧情、人物、设定，或让 AI 复盘当前章节..."
                      rows={3}
                    />
                    <div className="st-chat-composer-footer">
                      <div className="st-chat-model-select">
                        <span>General Chat</span>
                        <button
                          type="button"
                          className="st-chat-model-button"
                          aria-haspopup="menu"
                          aria-expanded={chatModelMenuOpen}
                          onClick={() => setChatModelMenuOpen((current) => !current)}
                        >
                          <span>{chatModelOption.label}</span>
                          <span className={`st-chat-model-caret${chatModelMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                        </button>
                        {chatModelMenuOpen ? (
                          <div className="st-chat-model-menu" role="menu">
                            {chatModelOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="menuitem"
                                className={`st-chat-model-menu-item${option.value === chatModel ? ' active' : ''}`}
                                onClick={() => {
                                  onChatModelChange(option.value);
                                  setChatModelMenuOpen(false);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button type="submit" className="st-chat-send-btn" disabled={chatSending || chatDraft.trim().length === 0}>
                        <Send size={15} />
                        <span>{chatSending ? '发送中' : '发送'}</span>
                      </button>
                    </div>
                  </form>
                </section>

                <section className="st-chat-panel">
                  <div className="st-chat-placeholder">
                    <MessageSquare size={26} />
                    <h3>AI 对话入口</h3>
                    <p>这里适合放剧情推演、人物对白润色、上下文问答和章节复盘。</p>
                  </div>
                  <div className="st-chat-composer">
                    <input className="st-chat-input" placeholder="输入你想让 AI 处理的内容..." disabled />
                    <button type="button" className="st-primary-action" disabled>
                      发送
                    </button>
                  </div>
                </section>
              </div>

              </div>

              {showInspector ? <ResizableDivider onResize={handleInspectorResize} className="st-divider-workspace" /> : null}

              {showInspector ? (
              <aside className="st-inspector">
                <section className="st-inspector-card">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">实时上下文</span>
                  </div>
                  <p>{currentChapter ? `${chapterTitle} · ${liveWordCount} 字` : '还没有选择章节'}</p>
                </section>

                <section className="st-inspector-card">
                  <div className="st-panel-topline">
                    <span className="st-panel-label">建议提示</span>
                  </div>
                  <div className="st-suggestion-list">
                    <span>扩写这一段冲突</span>
                    <span>检查人物说话口吻</span>
                    <span>给出下一场景转场方案</span>
                  </div>
                </section>
              </aside>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

        {showCodexEditor && codexEditorState.type ? (
          <div ref={codexEditorPanelRef} className="st-codex-editor-panel" role="dialog" aria-label={`${codexKindOption.label}条目`}>
            <div className="st-codex-entry-head">
              <div className="st-codex-entry-main">
                <div className="st-codex-kind-anchor">
                  <button
                    type="button"
                    className="st-codex-kind-button"
                    aria-haspopup="menu"
                    aria-expanded={codexKindMenuOpen}
                    onClick={() => setCodexKindMenuOpen((current) => !current)}
                  >
                    <CodexKindIcon size={15} />
                    <span>{codexKindOption.label}</span>
                    <span className={`st-codex-kind-caret${codexKindMenuOpen ? ' open' : ''}`} aria-hidden="true" />
                  </button>

                  {codexKindMenuOpen ? (
                    <div className="st-new-entry-menu st-codex-kind-menu" role="menu">
                      {CODEX_KIND_OPTIONS.map((option) => {
                        const OptionIcon = option.icon;
                        const disabled =
                          Boolean(codexEditorState.id) &&
                          ((codexEditorState.type === 'character' && option.type !== 'character') ||
                            (codexEditorState.type === 'lore' && option.type !== 'lore'));

                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`st-new-entry-menu-item${option.value === codexKind ? ' active' : ''}`}
                            role="menuitem"
                            disabled={disabled}
                            onClick={() => handleSelectCodexKind(option.value)}
                          >
                            <OptionIcon size={15} />
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <input
                  className="st-codex-title-input"
                  value={codexTitleValue}
                  onChange={(event) =>
                    codexEditorState.type === 'character'
                      ? onUpdateCodexEditorField('name', event.target.value)
                      : onUpdateCodexEditorField('loreTitle', event.target.value)
                  }
                  placeholder="未命名条目"
                  autoFocus
                />
              </div>

              <div className="st-codex-entry-side">
                <div className="st-codex-entry-avatar" aria-hidden="true">
                  <CodexKindIcon size={42} />
                </div>
                <div className="st-codex-entry-mentions">0 次提及</div>
                <button type="button" className="st-codex-entry-close" onClick={onCloseCodexEditor} aria-label="关闭条目面板">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="st-codex-entry-body">
              <label className="st-codex-entry-field">
                <span>别名/简称</span>
                <input
                  type="text"
                  value={codexEditorState.type === 'character' ? codexEditorState.roleType : codexEditorState.loreType}
                  onChange={(event) =>
                    codexEditorState.type === 'character'
                      ? onUpdateCodexEditorField('roleType', event.target.value)
                      : onUpdateCodexEditorField('loreType', event.target.value)
                  }
                  placeholder="添加别名..."
                />
              </label>

              <label className="st-codex-entry-field">
                <span>摘要</span>
                <textarea
                  value={codexEditorState.summary}
                  onChange={(event) => onUpdateCodexEditorField('summary', event.target.value)}
                  placeholder="写下简短摘要..."
                  rows={5}
                />
              </label>

              <label className="st-codex-entry-field">
                <span>详细信息</span>
                <textarea
                  value={codexDetailValue}
                  onChange={(event) =>
                    codexEditorState.type === 'character'
                      ? onUpdateCodexEditorField('details', event.target.value)
                      : onUpdateCodexEditorField('loreContent', event.target.value)
                  }
                  placeholder="补充人物经历、关系、设定细节..."
                  rows={5}
                />
              </label>

              {codexEditorState.type === 'lore' ? (
                <label className="st-codex-entry-field">
                  <span>标签</span>
                  <input
                    type="text"
                    value={codexEditorState.loreTags.join(', ')}
                    onChange={(event) =>
                      onUpdateCodexEditorField(
                        'loreTags',
                        event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean)
                      )
                    }
                    placeholder="重要, 伏笔, 已解锁"
                  />
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
    </section>
  );
}
