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
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_REFS_GET: 'chapter.refs.get',
  CHAPTER_REFS_UPDATE: 'chapter.refs.update',
  CHAPTER_CONTEXT_REFS_GET: 'chapter.getContextRefs',
  CHAPTER_CONTEXT_REF_ADD: 'chapter.addContextRef',
  CHAPTER_CONTEXT_REF_REMOVE: 'chapter.removeContextRef',
  CHAPTER_CONTEXT_REF_UPDATE: 'chapter.updateContextRef',
  CHAPTER_CONTEXT_REFS_AUTO_PICK: 'chapter.autoPickContextRefs',
  CHAPTER_LIST_OUTLINES_BY_PROJECT: 'chapter.listOutlinesByProject',
  AI_EXTRACT_OUTLINE: 'ai.extractOutline',
  AI_GENERATE_CHAPTER_TITLE: 'ai.generateChapterTitle',
  AI_GENERATE_CHAPTER_GOAL: 'ai.generateChapterGoal',
  AI_GENERATE_CHAPTER_NEXT_HOOK: 'ai.generateChapterNextHook',
  AI_REVIEW_CHAPTER_PIT_RESPONSES: 'ai.reviewChapterPitResponses',
  AI_REVIEW_CHAPTER_PIT_CANDIDATES: 'ai.reviewChapterPitCandidates',
  CHAPTER_LIST_CREATED_PITS: 'chapter.listCreatedPits',
  CHAPTER_LIST_RESOLVED_PITS: 'chapter.listResolvedPits',
  CHAPTER_GET_PIT_SUGGESTIONS: 'chapter.getPitSuggestions',
  CHAPTER_LIST_PLANNED_PITS: 'chapter.listPlannedPits',
  CHAPTER_PLAN_PIT_RESPONSE: 'chapter.planPitResponse',
  CHAPTER_UNPLAN_PIT_RESPONSE: 'chapter.unplanPitResponse',
  CHAPTER_LIST_PIT_REVIEWS: 'chapter.listPitReviews',
  CHAPTER_REVIEW_PIT_RESPONSE: 'chapter.reviewPitResponse',
  CHAPTER_CLEAR_PIT_REVIEW: 'chapter.clearPitReview',
  CHAPTER_LIST_PIT_CANDIDATES: 'chapter.listPitCandidates',
  CHAPTER_CREATE_PIT_CANDIDATE_MANUAL: 'chapter.createPitCandidateManual',
  CHAPTER_UPDATE_PIT_CANDIDATE: 'chapter.updatePitCandidate',
  CHAPTER_DELETE_PIT_CANDIDATE: 'chapter.deletePitCandidate',
  CHAPTER_REVIEW_PIT_CANDIDATE: 'chapter.reviewPitCandidate',
  CHAPTER_CREATE_PIT_FROM_SUGGESTION: 'chapter.createPitFromSuggestion',
  CHAPTER_CREATE_PIT_MANUAL: 'chapter.createPitManual',
  CHAPTER_CREATE_PIT: 'chapter.createPit',
  CHAPTER_GENERATE_PITS_FROM_CONTENT: 'chapter.generatePitsFromContent',
  CHAPTER_APPLY_GENERATED_PITS: 'chapter.applyGeneratedPits',
  CHAPTER_RESOLVE_PIT: 'chapter.resolvePit',
  CHAPTER_UNRESOLVE_PIT: 'chapter.unresolvePit',
  PIT_LIST_BY_PROJECT: 'pit.listByProject',
  PIT_LIST_GROUPED_BY_PROJECT: 'pit.listGroupedByProject',
  PIT_LIST_AVAILABLE_FOR_CHAPTER: 'pit.listAvailableForChapter',
  PIT_CREATE_MANUAL: 'pit.createManual',
  PIT_UPDATE: 'pit.update',
  PIT_DELETE: 'pit.delete',
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
  pits_enabled: boolean;
  goal: string;
  outline_ai: string;
  outline_user: string;
  planning_clues_json: string[];
  foreshadow_notes_json: string[];
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

export type ChapterContextRefMode = 'auto' | 'manual' | 'pinned';

export type ChapterContextRef = {
  id: string;
  chapter_id: string;
  ref_chapter_id: string;
  mode: ChapterContextRefMode;
  weight: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterContextRefView = ChapterContextRef & {
  ref_chapter_index_no: number;
  ref_chapter_title: string;
  ref_outline_user: string;
  ref_updated_at: string;
  ref_content_excerpt: string;
};

export type ChapterOutlineOverviewItem = {
  chapterId: string;
  index_no: number;
  title: string;
  outline_user: string;
  updated_at: string;
};

export type StoryPitType = 'chapter' | 'manual';
export type StoryPitCreationMethod = 'ai' | 'manual';
export type StoryPitStatus = 'open' | 'resolved';
export type StoryPitProgressStatus = 'unaddressed' | 'partial' | 'clear' | 'resolved';

export type StoryPit = {
  id: string;
  project_id: string;
  type: StoryPitType;
  origin_chapter_id: string | null;
  creation_method: StoryPitCreationMethod;
  content: string;
  status: StoryPitStatus;
  progress_status: StoryPitProgressStatus;
  resolved_in_chapter_id: string | null;
  sort_order: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type StoryPitView = StoryPit & {
  origin_chapter_index_no: number | null;
  origin_chapter_title: string | null;
  resolved_in_chapter_index_no: number | null;
  resolved_in_chapter_title: string | null;
};

export type StoryPitChapterGroup = {
  chapterId: string;
  index_no: number;
  title: string;
  pits: StoryPitView[];
};

export type PitGroupedByProjectResult = {
  chapterGroups: StoryPitChapterGroup[];
  manualPits: StoryPitView[];
};

export type ChapterPitPlan = {
  id: string;
  chapter_id: string;
  pit_id: string;
  created_at: string;
  updated_at: string;
};

export type ChapterPitPlanView = ChapterPitPlan & {
  pit: StoryPitView;
};

export type ChapterPitReviewOutcome = 'none' | 'partial' | 'clear' | 'resolved';

export type ChapterPitReview = {
  id: string;
  chapter_id: string;
  pit_id: string;
  outcome: ChapterPitReviewOutcome;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ChapterPitReviewView = ChapterPitReview & {
  pit: StoryPitView;
};

export type ChapterPitCandidateStatus = 'draft' | 'weak' | 'confirmed' | 'discarded';

export type ChapterPitCandidate = {
  id: string;
  chapter_id: string;
  content: string;
  status: ChapterPitCandidateStatus;
  story_pit_id: string | null;
  created_at: string;
  updated_at: string;
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

export type AiExtractOutlineResult = {
  chapterId: string;
  candidateOutline: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiGenerateChapterField = 'title' | 'goal' | 'next_hook';

export type AiGenerateChapterFieldResult = {
  chapterId: string;
  field: AiGenerateChapterField;
  candidateText: string;
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiPitResponseReviewItem = {
  pitId: string;
  outcome: ChapterPitReviewOutcome;
  note: string;
};

export type AiReviewChapterPitResponsesInput = {
  chapterId: string;
  promptText?: string;
};

export type AiReviewChapterPitResponsesResult = {
  chapterId: string;
  items: AiPitResponseReviewItem[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type AiPitCandidateReviewItem = {
  candidateId: string;
  status: ChapterPitCandidateStatus;
};

export type AiNewPitCandidateSuggestion = {
  content: string;
  status: ChapterPitCandidateStatus;
};

export type AiReviewChapterPitCandidatesInput = {
  chapterId: string;
  promptText?: string;
};

export type AiReviewChapterPitCandidatesResult = {
  chapterId: string;
  existingItems: AiPitCandidateReviewItem[];
  newItems: AiNewPitCandidateSuggestion[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type ChapterGeneratePitsFromContentResult = {
  chapterId: string;
  candidates: string[];
  provider: string;
  model: string | null;
  referenceText: string;
};

export type ChapterPitSuggestionsResult = {
  chapterId: string;
  candidates: string[];
  provider: string;
  model: string | null;
  referenceText: string;
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
  pitsEnabled?: boolean;
  goal?: string;
  outlineAi?: string;
  outlineUser?: string;
  planningCluesJson?: string[];
  foreshadowNotesJson?: string[];
  content?: string;
  nextHook?: string;
  source?: ChapterSource;
};

export type ChapterUpdatePatch = Partial<
  Pick<
    Chapter,
    | 'title'
    | 'status'
    | 'pits_enabled'
    | 'goal'
    | 'outline_ai'
    | 'outline_user'
    | 'planning_clues_json'
    | 'foreshadow_notes_json'
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

export type AiExtractOutlineInput = {
  chapterId: string;
  promptText?: string;
};

export type AiGenerateChapterFieldInput = {
  chapterId: string;
  promptText?: string;
};

export type ChapterRefsGetInput = {
  chapterId: string;
};

export type ChapterRefsUpdateInput = {
  chapterId: string;
  characterIds: string[];
  loreEntryIds: string[];
};

export type ChapterContextRefsGetInput = {
  chapterId: string;
};

export type ChapterContextRefAddInput = {
  chapterId: string;
  refChapterId: string;
  mode?: Exclude<ChapterContextRefMode, 'auto'>;
  weight?: number;
  note?: string | null;
};

export type ChapterContextRefRemoveInput = {
  contextRefId: string;
};

export type ChapterContextRefUpdateInput = {
  contextRefId: string;
  patch: Partial<Pick<ChapterContextRef, 'mode' | 'weight' | 'note'>>;
};

export type ChapterAutoPickContextRefsInput = {
  chapterId: string;
  limit?: number;
};

export type ChapterListOutlinesByProjectInput = {
  projectId: string;
};

export type PitListByProjectInput = {
  projectId: string;
};

export type PitListGroupedByProjectInput = {
  projectId: string;
};

export type PitListAvailableForChapterInput = {
  chapterId: string;
};

export type PitCreateManualInput = {
  projectId: string;
  content: string;
  note?: string | null;
};

export type PitUpdatePatch = Partial<Pick<StoryPit, 'content' | 'note' | 'sort_order'>>;

export type PitUpdateInput = {
  pitId: string;
  patch: PitUpdatePatch;
};

export type PitDeleteInput = {
  pitId: string;
};

export type ChapterListCreatedPitsInput = {
  chapterId: string;
};

export type ChapterListResolvedPitsInput = {
  chapterId: string;
};

export type ChapterGetPitSuggestionsInput = {
  chapterId: string;
  promptText?: string;
};

export type ChapterListPlannedPitsInput = {
  chapterId: string;
};

export type ChapterPlanPitResponseInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterUnplanPitResponseInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterListPitReviewsInput = {
  chapterId: string;
};

export type ChapterReviewPitResponseInput = {
  chapterId: string;
  pitId: string;
  outcome: ChapterPitReviewOutcome;
  note?: string | null;
};

export type ChapterClearPitReviewInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterListPitCandidatesInput = {
  chapterId: string;
};

export type ChapterCreatePitCandidateManualInput = {
  chapterId: string;
  content: string;
};

export type ChapterPitCandidateUpdatePatch = Partial<Pick<ChapterPitCandidate, 'content' | 'status'>>;

export type ChapterUpdatePitCandidateInput = {
  candidateId: string;
  patch: ChapterPitCandidateUpdatePatch;
};

export type ChapterDeletePitCandidateInput = {
  candidateId: string;
};

export type ChapterReviewPitCandidateInput = {
  chapterId: string;
  candidateId: string;
  status: ChapterPitCandidateStatus;
};

export type ChapterCreatePitFromSuggestionInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterCreatePitManualInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterCreatePitInput = {
  chapterId: string;
  content: string;
  note?: string | null;
};

export type ChapterGeneratePitsFromContentInput = {
  chapterId: string;
};

export type ChapterApplyGeneratedPitsInput = {
  chapterId: string;
  candidates: string[];
};

export type ChapterResolvePitInput = {
  chapterId: string;
  pitId: string;
};

export type ChapterUnresolvePitInput = {
  chapterId: string;
  pitId: string;
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
