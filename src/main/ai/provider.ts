import type {
  Character,
  Chapter,
  ChapterContextRefMode,
  ChapterContextRefView,
  ChapterPitCandidate,
  ChapterPitPlanView,
  ChapterPitReviewView,
  LoreEntry,
  NovelProject,
  StoryPitView
} from '../../shared/ipc';

export type AiTaskType =
  | 'summarizeChapterFromContent'
  | 'generateChapterTitle'
  | 'generateChapterGoal'
  | 'generateChapterNextHook'
  | 'generateChapterPitsFromContent'
  | 'reviewChapterPitResponses'
  | 'reviewChapterPitCandidates'
  | 'proposeOutlineUpdate'
  | 'generateChapterSuggestions';

export type ChapterAiContext = {
  taskType: AiTaskType;
  project: {
    id: string;
    title: string;
    description: string;
  };
  chapter: {
    id: string;
    number: number;
    title: string;
    goal: string;
    outlineUser: string;
    planningClues: string[];
    foreshadowNotes: string[];
    nextHook: string;
    content: string;
  };
  linkedCharacters: Array<{
    id: string;
    name: string;
    roleType: string;
    summary: string;
    details: string;
  }>;
  linkedLore: Array<{
    id: string;
    title: string;
    type: string;
    summary: string;
    content: string;
  }>;
  referenceChapters: Array<{
    id: string;
    number: number;
    title: string;
    mode: ChapterContextRefMode;
    outlineUser: string;
    updatedAt: string;
  }>;
  plannedPits: Array<{
    id: string;
    pitId: string;
    content: string;
    originLabel: string;
    progressStatus: StoryPitView['progress_status'];
  }>;
  pitReviews: Array<{
    id: string;
    pitId: string;
    content: string;
    originLabel: string;
    outcome: ChapterPitReviewView['outcome'];
    note: string;
  }>;
  pitCandidates: Array<{
    id: string;
    content: string;
    status: ChapterPitCandidate['status'];
  }>;
};

export type BuildChapterAiContextInput = {
  taskType: AiTaskType;
  project: NovelProject;
  chapter: Chapter;
  linkedCharacters: Character[];
  linkedLoreEntries: LoreEntry[];
  referenceChapters: ChapterContextRefView[];
  plannedPits: ChapterPitPlanView[];
  pitReviews: ChapterPitReviewView[];
  pitCandidates: ChapterPitCandidate[];
};

export type PromptSection = {
  label: string;
  content: string;
};

export type PromptPayload = {
  taskType: AiTaskType;
  taskLabel: string;
  referenceText: string;
  sections: PromptSection[];
  systemPrompt: string;
  userPrompt: string;
  transientInstruction?: string;
  context: ChapterAiContext;
};

export type AiTextResult = {
  provider: string;
  model: string | null;
  text: string;
};

export interface AiProvider {
  readonly name: string;
  summarizeChapterFromContent(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterTitle(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterGoal(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterNextHook(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult>;
  reviewChapterPitResponses(payload: PromptPayload): Promise<AiTextResult>;
  reviewChapterPitCandidates(payload: PromptPayload): Promise<AiTextResult>;
  proposeOutlineUpdate(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterSuggestions(payload: PromptPayload): Promise<AiTextResult>;
}

