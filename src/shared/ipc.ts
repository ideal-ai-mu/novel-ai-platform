export const IPC_CHANNELS = {
  APP_INIT: 'app.init',
  PROJECT_LIST: 'project.list',
  PROJECT_CREATE: 'project.create',
  CHAPTER_LIST: 'chapter.list',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_UPDATE: 'chapter.update',
  SUGGESTION_LIST_BY_ENTITY: 'suggestion.listByEntity',
  SUGGESTION_CREATE_MOCK: 'suggestion.createMock'
} as const;

export type IpcError = {
  code: string;
  message: string;
};

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export type Topology = 'single-db-multi-project';

export type RecentProject = {
  id: string;
  title: string;
  updated_at: string;
};

export type AppInitData = {
  schemaVersion: number;
  dbPath: string;
  topology: Topology;
  recentProjects: RecentProject[];
};

export type NovelProjectSource = 'user' | 'imported';

export type NovelProject = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  source: NovelProjectSource;
};

export type ChapterStatus = 'draft' | 'review' | 'final';
export type ChapterSource = 'user' | 'ai_summary' | 'imported';

export type Chapter = {
  id: string;
  project_id: string;
  index_no: number;
  title: string;
  status: ChapterStatus;
  goal: string;
  outline_ai: string;
  outline_user: string;
  content: string;
  next_hook: string;
  word_count: number;
  revision: number;
  confirmed_fields_json: string[];
  created_at: string;
  updated_at: string;
  source: ChapterSource;
};

export type AiSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';
export type AiSuggestionSource = 'mock' | 'chapter_summary' | 'manual';

export type AiSuggestion = {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  patch_json: Record<string, unknown>;
  status: AiSuggestionStatus;
  summary: string;
  source: AiSuggestionSource;
  created_at: string;
};

export type ProjectCreateInput = {
  title: string;
  description?: string;
  source?: NovelProjectSource;
};

export type ChapterCreateInput = {
  projectId: string;
  title: string;
  indexNo?: number;
  status?: ChapterStatus;
  goal?: string;
  outlineAi?: string;
  outlineUser?: string;
  content?: string;
  nextHook?: string;
  source?: ChapterSource;
};

export type ChapterUpdatePatch = Partial<
  Pick<
    Chapter,
    | 'title'
    | 'status'
    | 'goal'
    | 'outline_ai'
    | 'outline_user'
    | 'content'
    | 'next_hook'
    | 'confirmed_fields_json'
    | 'source'
  >
>;

export type ChapterUpdateInput = {
  chapterId: string;
  patch: ChapterUpdatePatch;
  actor?: 'user' | 'ai_suggestion';
};

export type SuggestionListByEntityInput = {
  entityType: string;
  entityId: string;
};

export type SuggestionCreateMockInput = {
  entityType: string;
  entityId: string;
};
