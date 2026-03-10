export const IPC_CHANNELS = {
  APP_INIT: 'app.init',
  APP_AUTOSAVE_INTERVAL_CHANGED: 'app.autosaveIntervalChanged',
  PROJECT_LIST: 'project.list',
  PROJECT_CREATE: 'project.create',
  PROJECT_GET: 'project.get',
  PROJECT_DELETE: 'project.delete',
  CHAPTER_LIST: 'chapter.list',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_UPDATE: 'chapter.update',
  CHAPTER_GENERATE_OUTLINE_AI: 'chapter.generateOutlineAi',
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_REFS_GET: 'chapter.refs.get',
  CHAPTER_REFS_UPDATE: 'chapter.refs.update',
  CHARACTER_LIST: 'character.list',
  CHARACTER_CREATE: 'character.create',
  CHARACTER_GET: 'character.get',
  CHARACTER_UPDATE: 'character.update',
  CHARACTER_DELETE: 'character.delete',
  LORE_LIST: 'lore.list',
  LORE_CREATE: 'lore.create',
  LORE_GET: 'lore.get',
  LORE_UPDATE: 'lore.update',
  LORE_DELETE: 'lore.delete',
  SUGGESTION_LIST_BY_ENTITY: 'suggestion.listByEntity',
  SUGGESTION_CREATE_MOCK: 'suggestion.createMock',
  SUGGESTION_APPLY: 'suggestion.apply',
  SUGGESTION_REJECT: 'suggestion.reject'
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
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
};

export type AutosaveIntervalSeconds = 0 | 5 | 10 | 30 | 60;

export type NovelProjectSource = 'user' | 'imported';
export type EntitySource = 'user' | 'ai_summary' | 'imported';

export type NovelProject = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  source: NovelProjectSource;
};

export type ChapterStatus = 'draft' | 'review' | 'final';
export type ChapterSource = EntitySource;

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

export type ChapterRefs = {
  chapterId: string;
  characterIds: string[];
  loreEntryIds: string[];
};

export type Character = {
  id: string;
  project_id: string;
  name: string;
  role_type: string;
  summary: string;
  details: string;
  source: EntitySource;
  created_at: string;
  updated_at: string;
};

export type LoreEntry = {
  id: string;
  project_id: string;
  type: string;
  title: string;
  summary: string;
  content: string;
  tags_json: string[];
  source: EntitySource;
  created_at: string;
  updated_at: string;
};

export type AiSuggestionStatus = 'pending' | 'applied' | 'rejected' | 'partially_applied';
export type AiSuggestionSource = 'mock' | 'chapter_summary' | 'manual';

export type AppliedChange = {
  field: string;
  previousValue: unknown;
  newValue: unknown;
};

export type SuggestionResult = {
  appliedChanges: AppliedChange[];
  blockedFields: string[];
};

export type AiSuggestion = {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  patch_json: Record<string, unknown>;
  status: AiSuggestionStatus;
  summary: string;
  source: AiSuggestionSource;
  result_json: SuggestionResult;
  created_at: string;
};

export type ChapterGenerateOutlineAiResult = {
  chapter: Chapter;
  suggestion: AiSuggestion | null;
};

export type ProjectCreateInput = {
  title: string;
  description?: string;
  source?: NovelProjectSource;
};

export type ProjectGetInput = {
  projectId: string;
};

export type ProjectDeleteInput = {
  projectId: string;
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

export type ChapterDeleteInput = {
  chapterId: string;
};

export type ChapterGenerateOutlineAiInput = {
  chapterId: string;
};

export type ChapterRefsGetInput = {
  chapterId: string;
};

export type ChapterRefsUpdateInput = {
  chapterId: string;
  characterIds: string[];
  loreEntryIds: string[];
};

export type CharacterCreateInput = {
  projectId: string;
  name: string;
  roleType?: string;
  summary?: string;
  details?: string;
  source?: EntitySource;
};

export type CharacterUpdatePatch = Partial<Pick<Character, 'name' | 'role_type' | 'summary' | 'details' | 'source'>>;

export type CharacterUpdateInput = {
  characterId: string;
  patch: CharacterUpdatePatch;
};

export type CharacterDeleteInput = {
  characterId: string;
};

export type LoreEntryCreateInput = {
  projectId: string;
  type: string;
  title: string;
  summary?: string;
  content?: string;
  tagsJson?: string[];
  source?: EntitySource;
};

export type LoreEntryUpdatePatch = Partial<
  Pick<LoreEntry, 'type' | 'title' | 'summary' | 'content' | 'tags_json' | 'source'>
>;

export type LoreEntryUpdateInput = {
  loreEntryId: string;
  patch: LoreEntryUpdatePatch;
};

export type LoreEntryDeleteInput = {
  loreEntryId: string;
};

export type DeleteResult = {
  deleted: true;
};

export type SuggestionListByEntityInput = {
  entityType: string;
  entityId: string;
};

export type SuggestionCreateMockInput = {
  entityType: string;
  entityId: string;
};

export type SuggestionApplyInput = {
  suggestionId: string;
};

export type SuggestionApplyResult = {
  status: AiSuggestionStatus;
  appliedChanges: AppliedChange[];
  blockedFields: string[];
};

export type SuggestionRejectInput = {
  suggestionId: string;
};

export type SuggestionRejectResult = {
  status: 'rejected';
};
