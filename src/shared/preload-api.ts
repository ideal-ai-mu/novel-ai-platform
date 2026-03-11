import type {
  AiExtractOutlineInput,
  AiExtractOutlineResult,
  AiGenerateChapterFieldInput,
  AiGenerateChapterFieldResult,
  AiSuggestion,
  AppInitData,
  AutosaveIntervalSeconds,
  Chapter,
  ChapterApplyGeneratedPitsInput,
  ChapterAutoPickContextRefsInput,
  ChapterContextRefAddInput,
  ChapterContextRefRemoveInput,
  ChapterContextRefUpdateInput,
  ChapterContextRefView,
  ChapterContextRefsGetInput,
  ChapterCreateInput,
  ChapterCreatePitFromSuggestionInput,
  ChapterCreatePitManualInput,
  ChapterCreatePitInput,
  ChapterDeleteInput,
  ChapterGeneratePitsFromContentInput,
  ChapterGeneratePitsFromContentResult,
  ChapterGetPitSuggestionsInput,
  ChapterPitSuggestionsResult,
  ChapterListCreatedPitsInput,
  ChapterListOutlinesByProjectInput,
  ChapterListResolvedPitsInput,
  ChapterOutlineOverviewItem,
  ChapterRefs,
  ChapterRefsGetInput,
  ChapterRefsUpdateInput,
  ChapterResolvePitInput,
  ChapterUnresolvePitInput,
  ChapterUpdateInput,
  Character,
  CharacterCreateInput,
  CharacterDeleteInput,
  CharacterUpdateInput,
  DeleteResult,
  IpcResult,
  LoreEntry,
  LoreEntryCreateInput,
  LoreEntryDeleteInput,
  LoreEntryUpdateInput,
  NovelProject,
  PitCreateManualInput,
  PitDeleteInput,
  PitGroupedByProjectResult,
  PitListAvailableForChapterInput,
  PitListByProjectInput,
  PitListGroupedByProjectInput,
  PitUpdateInput,
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectGetInput,
  StoryPitView,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionListByEntityInput,
  SuggestionRejectInput,
  SuggestionRejectResult
} from './ipc';

export type AppApi = {
  app: {
    init: () => Promise<IpcResult<AppInitData>>;
    onAutosaveIntervalChanged: (listener: (seconds: AutosaveIntervalSeconds) => void) => () => void;
  };
  project: {
    list: () => Promise<IpcResult<NovelProject[]>>;
    create: (input: ProjectCreateInput) => Promise<IpcResult<NovelProject>>;
    get: (input: ProjectGetInput) => Promise<IpcResult<NovelProject>>;
    delete: (input: ProjectDeleteInput) => Promise<IpcResult<DeleteResult>>;
  };
  chapter: {
    list: (projectId: string) => Promise<IpcResult<Chapter[]>>;
    create: (input: ChapterCreateInput) => Promise<IpcResult<Chapter>>;
    get: (chapterId: string) => Promise<IpcResult<Chapter>>;
    update: (input: ChapterUpdateInput) => Promise<IpcResult<Chapter>>;
    delete: (input: ChapterDeleteInput) => Promise<IpcResult<DeleteResult>>;
    getRefs: (input: ChapterRefsGetInput) => Promise<IpcResult<ChapterRefs>>;
    updateRefs: (input: ChapterRefsUpdateInput) => Promise<IpcResult<ChapterRefs>>;
    getContextRefs: (input: ChapterContextRefsGetInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    addContextRef: (input: ChapterContextRefAddInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    removeContextRef: (input: ChapterContextRefRemoveInput) => Promise<IpcResult<DeleteResult>>;
    updateContextRef: (input: ChapterContextRefUpdateInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    autoPickContextRefs: (input: ChapterAutoPickContextRefsInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    listOutlinesByProject: (input: ChapterListOutlinesByProjectInput) => Promise<IpcResult<ChapterOutlineOverviewItem[]>>;
    listCreatedPits: (input: ChapterListCreatedPitsInput) => Promise<IpcResult<StoryPitView[]>>;
    listResolvedPits: (input: ChapterListResolvedPitsInput) => Promise<IpcResult<StoryPitView[]>>;
    getPitSuggestions: (input: ChapterGetPitSuggestionsInput) => Promise<IpcResult<ChapterPitSuggestionsResult>>;
    createPitFromSuggestion: (input: ChapterCreatePitFromSuggestionInput) => Promise<IpcResult<StoryPitView>>;
    createPitManual: (input: ChapterCreatePitManualInput) => Promise<IpcResult<StoryPitView>>;
    createPit: (input: ChapterCreatePitInput) => Promise<IpcResult<StoryPitView>>;
    generatePitsFromContent: (
      input: ChapterGeneratePitsFromContentInput
    ) => Promise<IpcResult<ChapterGeneratePitsFromContentResult>>;
    applyGeneratedPits: (input: ChapterApplyGeneratedPitsInput) => Promise<IpcResult<StoryPitView[]>>;
    resolvePit: (input: ChapterResolvePitInput) => Promise<IpcResult<StoryPitView>>;
    unresolvePit: (input: ChapterUnresolvePitInput) => Promise<IpcResult<StoryPitView>>;
  };
  ai: {
    extractOutline: (input: AiExtractOutlineInput) => Promise<IpcResult<AiExtractOutlineResult>>;
    generateChapterTitle: (input: AiGenerateChapterFieldInput) => Promise<IpcResult<AiGenerateChapterFieldResult>>;
    generateChapterGoal: (input: AiGenerateChapterFieldInput) => Promise<IpcResult<AiGenerateChapterFieldResult>>;
  };
  pit: {
    listByProject: (input: PitListByProjectInput) => Promise<IpcResult<StoryPitView[]>>;
    listGroupedByProject: (input: PitListGroupedByProjectInput) => Promise<IpcResult<PitGroupedByProjectResult>>;
    listAvailableForChapter: (input: PitListAvailableForChapterInput) => Promise<IpcResult<StoryPitView[]>>;
    createManual: (input: PitCreateManualInput) => Promise<IpcResult<StoryPitView>>;
    update: (input: PitUpdateInput) => Promise<IpcResult<StoryPitView>>;
    delete: (input: PitDeleteInput) => Promise<IpcResult<DeleteResult>>;
  };
  character: {
    list: (projectId: string) => Promise<IpcResult<Character[]>>;
    create: (input: CharacterCreateInput) => Promise<IpcResult<Character>>;
    get: (characterId: string) => Promise<IpcResult<Character>>;
    update: (input: CharacterUpdateInput) => Promise<IpcResult<Character>>;
    delete: (input: CharacterDeleteInput) => Promise<IpcResult<DeleteResult>>;
  };
  lore: {
    list: (projectId: string) => Promise<IpcResult<LoreEntry[]>>;
    create: (input: LoreEntryCreateInput) => Promise<IpcResult<LoreEntry>>;
    get: (loreEntryId: string) => Promise<IpcResult<LoreEntry>>;
    update: (input: LoreEntryUpdateInput) => Promise<IpcResult<LoreEntry>>;
    delete: (input: LoreEntryDeleteInput) => Promise<IpcResult<DeleteResult>>;
  };
  suggestion: {
    listByEntity: (input: SuggestionListByEntityInput) => Promise<IpcResult<AiSuggestion[]>>;
    createMock: (input: SuggestionCreateMockInput) => Promise<IpcResult<AiSuggestion>>;
    apply: (input: SuggestionApplyInput) => Promise<IpcResult<SuggestionApplyResult>>;
    reject: (input: SuggestionRejectInput) => Promise<IpcResult<SuggestionRejectResult>>;
  };
};
