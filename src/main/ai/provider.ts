import type {
  Character,
  Chapter,
  ChapterContextRefMode,
  ChapterContextRefView,
  LoreEntry,
  NovelProject,
  StoryPitView
} from '../../shared/ipc';

export type AiTaskType =
  | 'summarizeChapterFromContent'
  | 'generateChapterTitle'
  | 'generateChapterGoal'
  | 'generateChapterPitsFromContent'
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
  createdPits: Array<{
    id: string;
    content: string;
  }>;
  resolvedPits: Array<{
    id: string;
    content: string;
    originLabel: string;
  }>;
};

export type BuildChapterAiContextInput = {
  taskType: AiTaskType;
  project: NovelProject;
  chapter: Chapter;
  linkedCharacters: Character[];
  linkedLoreEntries: LoreEntry[];
  referenceChapters: ChapterContextRefView[];
  createdPits: StoryPitView[];
  resolvedPits: StoryPitView[];
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
  generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult>;
  proposeOutlineUpdate(payload: PromptPayload): Promise<AiTextResult>;
  generateChapterSuggestions(payload: PromptPayload): Promise<AiTextResult>;
}
