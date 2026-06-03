import type {
  AiExtractOutlineInput,
  AiExtractOutlineResult,
  AiGenerateChapterFieldInput,
  AiGenerateChapterFieldResult,
  AiChatInput,
  AiChatResult,
  AiProviderConfig,
  AiProviderConfigDeleteInput,
  AiProviderConfigState,
  AiProviderListModelsInput,
  AiProviderListModelsResult,
  AiProviderConfigUpdateInput,
  AiReviewChapterPitCandidatesInput,
  AiReviewChapterPitCandidatesResult,
  AiReviewChapterPitResponsesInput,
  AiReviewChapterPitResponsesResult,
  AiSuggestion,
  AppInitData,
  AppMenuActionInput,
  AppSetAutosaveIntervalInput,
  AppStorageInfo,
  AutosaveIntervalSeconds,
  Chapter,
  ChapterApplyGeneratedPitsInput,
  ChapterAutoPickContextRefsInput,
  ChapterClearPitReviewInput,
  ChapterContextRefAddInput,
  ChapterContextRefRemoveInput,
  ChapterContextRefUpdateInput,
  ChapterContextRefView,
  ChapterContextRefsGetInput,
  ChapterCreateInput,
  ChapterCreatePitCandidateManualInput,
  ChapterCreatePitFromSuggestionInput,
  ChapterCreatePitManualInput,
  ChapterCreatePitInput,
  ChapterDeletePitCandidateInput,
  ChapterDeleteInput,
  ChapterDeletePermanentInput,
  ChapterGeneratePitsFromContentInput,
  ChapterGeneratePitsFromContentResult,
  ChapterGetPitSuggestionsInput,
  ChapterListDeletedInput,
  ChapterListPitCandidatesInput,
  ChapterListPitReviewsInput,
  ChapterListPlannedPitsInput,
  ChapterPitSuggestionsResult,
  ChapterPitCandidate,
  ChapterPitPlanView,
  ChapterPitReviewView,
  ChapterPlanPitResponseInput,
  ChapterListCreatedPitsInput,
  ChapterListOutlinesByProjectInput,
  ChapterListResolvedPitsInput,
  ChapterOutlineOverviewItem,
  ChapterRelationshipGraph,
  ChapterRelationshipGraphGetInput,
  ChapterRelationshipGraphUpdateInput,
  ChapterRefs,
  ChapterRefsGetInput,
  ChapterRefsUpdateInput,
  ChapterRestoreInput,
  ChapterReviewPitCandidateInput,
  ChapterReviewPitResponseInput,
  ChapterResolvePitInput,
  ChapterUnplanPitResponseInput,
  ChapterUnresolvePitInput,
  ChapterUpdatePitCandidateInput,
  ChapterUpdateInput,
  Character,
  CharacterCreateInput,
  CharacterDeleteInput,
  CharacterRelationshipListInput,
  CharacterRelationshipUpsertInput,
  CharacterRelationshipView,
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
  ProjectRestoreInput,
  ProjectUpdateInput,
  StoryPitView,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionListByEntityInput,
  SuggestionRejectInput,
  SuggestionRejectResult,
  TimelineEventReplaceChapterInput,
  TimelineEventListByProjectInput,
  TimelineEventView,
  TimelineLayerData,
  TimelineLayerListByProjectInput,
  TimelineLayerReplaceChapterInput
} from './ipc';

export type AppApi = {
  app: {
    init: () => Promise<IpcResult<AppInitData>>;
    onAutosaveIntervalChanged: (listener: (seconds: AutosaveIntervalSeconds) => void) => () => void;
    setAutosaveInterval: (input: AppSetAutosaveIntervalInput) => Promise<IpcResult<AutosaveIntervalSeconds>>;
    menuAction: (input: AppMenuActionInput) => Promise<IpcResult<void>>;
    getStorageInfo: () => Promise<IpcResult<AppStorageInfo>>;
    changeDataLocation: () => Promise<IpcResult<void>>;
    openDataLocation: () => Promise<IpcResult<void>>;
    restoreDefaultLocation: () => Promise<IpcResult<void>>;
  };
  project: {
    list: () => Promise<IpcResult<NovelProject[]>>;
    listDeleted: () => Promise<IpcResult<NovelProject[]>>;
    create: (input: ProjectCreateInput) => Promise<IpcResult<NovelProject>>;
    get: (input: ProjectGetInput) => Promise<IpcResult<NovelProject>>;
    update: (input: ProjectUpdateInput) => Promise<IpcResult<NovelProject>>;
    delete: (input: ProjectDeleteInput) => Promise<IpcResult<DeleteResult>>;
    restore: (input: ProjectRestoreInput) => Promise<IpcResult<DeleteResult>>;
    deletePermanent: (input: ProjectDeleteInput) => Promise<IpcResult<DeleteResult>>;
  };
  chapter: {
    list: (projectId: string) => Promise<IpcResult<Chapter[]>>;
    listDeleted: (input: ChapterListDeletedInput) => Promise<IpcResult<Chapter[]>>;
    create: (input: ChapterCreateInput) => Promise<IpcResult<Chapter>>;
    get: (chapterId: string) => Promise<IpcResult<Chapter>>;
    update: (input: ChapterUpdateInput) => Promise<IpcResult<Chapter>>;
    delete: (input: ChapterDeleteInput) => Promise<IpcResult<DeleteResult>>;
    restore: (input: ChapterRestoreInput) => Promise<IpcResult<DeleteResult>>;
    deletePermanent: (input: ChapterDeletePermanentInput) => Promise<IpcResult<DeleteResult>>;
    getRefs: (input: ChapterRefsGetInput) => Promise<IpcResult<ChapterRefs>>;
    updateRefs: (input: ChapterRefsUpdateInput) => Promise<IpcResult<ChapterRefs>>;
    getRelationshipGraph: (input: ChapterRelationshipGraphGetInput) => Promise<IpcResult<ChapterRelationshipGraph>>;
    updateRelationshipGraph: (input: ChapterRelationshipGraphUpdateInput) => Promise<IpcResult<ChapterRelationshipGraph>>;
    reviewPitResponse: (input: ChapterReviewPitResponseInput) => Promise<IpcResult<ChapterPitReviewView>>;
    getPitSuggestions: (input: ChapterGetPitSuggestionsInput) => Promise<IpcResult<ChapterPitSuggestionsResult>>;
    createPitFromSuggestion: (input: ChapterCreatePitFromSuggestionInput) => Promise<IpcResult<StoryPitView>>;
  };
  ai: {
    chat: (input: AiChatInput) => Promise<IpcResult<AiChatResult>>;
    getConfig: () => Promise<IpcResult<AiProviderConfigState>>;
    updateConfig: (input: AiProviderConfigUpdateInput) => Promise<IpcResult<AiProviderConfigState>>;
    deleteConfig: (input: AiProviderConfigDeleteInput) => Promise<IpcResult<AiProviderConfigState>>;
    listModels: (input: AiProviderListModelsInput) => Promise<IpcResult<AiProviderListModelsResult>>;
  };
  pit: {
    listByProject: (input: PitListByProjectInput) => Promise<IpcResult<StoryPitView[]>>;
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
    listRelationships: (input: CharacterRelationshipListInput) => Promise<IpcResult<CharacterRelationshipView[]>>;
    upsertRelationship: (input: CharacterRelationshipUpsertInput) => Promise<IpcResult<CharacterRelationshipView[]>>;
  };
  timeline: {
    replaceChapterEvents: (input: TimelineEventReplaceChapterInput) => Promise<IpcResult<TimelineEventView[]>>;
    listLayersByProject: (input: TimelineLayerListByProjectInput) => Promise<IpcResult<TimelineLayerData>>;
    replaceChapterLayers: (input: TimelineLayerReplaceChapterInput) => Promise<IpcResult<TimelineLayerData>>;
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
