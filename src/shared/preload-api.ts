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
    getContextRefs: (input: ChapterContextRefsGetInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    addContextRef: (input: ChapterContextRefAddInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    removeContextRef: (input: ChapterContextRefRemoveInput) => Promise<IpcResult<DeleteResult>>;
    updateContextRef: (input: ChapterContextRefUpdateInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    autoPickContextRefs: (input: ChapterAutoPickContextRefsInput) => Promise<IpcResult<ChapterContextRefView[]>>;
    listOutlinesByProject: (input: ChapterListOutlinesByProjectInput) => Promise<IpcResult<ChapterOutlineOverviewItem[]>>;
    listCreatedPits: (input: ChapterListCreatedPitsInput) => Promise<IpcResult<StoryPitView[]>>;
    listResolvedPits: (input: ChapterListResolvedPitsInput) => Promise<IpcResult<StoryPitView[]>>;
    listPlannedPits: (input: ChapterListPlannedPitsInput) => Promise<IpcResult<ChapterPitPlanView[]>>;
    planPitResponse: (input: ChapterPlanPitResponseInput) => Promise<IpcResult<ChapterPitPlanView[]>>;
    unplanPitResponse: (input: ChapterUnplanPitResponseInput) => Promise<IpcResult<DeleteResult>>;
    listPitReviews: (input: ChapterListPitReviewsInput) => Promise<IpcResult<ChapterPitReviewView[]>>;
    reviewPitResponse: (input: ChapterReviewPitResponseInput) => Promise<IpcResult<ChapterPitReviewView>>;
    clearPitReview: (input: ChapterClearPitReviewInput) => Promise<IpcResult<DeleteResult>>;
    listPitCandidates: (input: ChapterListPitCandidatesInput) => Promise<IpcResult<ChapterPitCandidate[]>>;
    createPitCandidateManual: (input: ChapterCreatePitCandidateManualInput) => Promise<IpcResult<ChapterPitCandidate>>;
    updatePitCandidate: (input: ChapterUpdatePitCandidateInput) => Promise<IpcResult<ChapterPitCandidate>>;
    deletePitCandidate: (input: ChapterDeletePitCandidateInput) => Promise<IpcResult<DeleteResult>>;
    reviewPitCandidate: (input: ChapterReviewPitCandidateInput) => Promise<IpcResult<ChapterPitCandidate>>;
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
    generateChapterNextHook: (input: AiGenerateChapterFieldInput) => Promise<IpcResult<AiGenerateChapterFieldResult>>;
    reviewChapterPitResponses: (input: AiReviewChapterPitResponsesInput) => Promise<IpcResult<AiReviewChapterPitResponsesResult>>;
    reviewChapterPitCandidates: (input: AiReviewChapterPitCandidatesInput) => Promise<IpcResult<AiReviewChapterPitCandidatesResult>>;
    chat: (input: AiChatInput) => Promise<IpcResult<AiChatResult>>;
    getConfig: () => Promise<IpcResult<AiProviderConfigState>>;
    updateConfig: (input: AiProviderConfigUpdateInput) => Promise<IpcResult<AiProviderConfigState>>;
    deleteConfig: (input: AiProviderConfigDeleteInput) => Promise<IpcResult<AiProviderConfigState>>;
    listModels: (input: AiProviderListModelsInput) => Promise<IpcResult<AiProviderListModelsResult>>;
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
    listRelationships: (input: CharacterRelationshipListInput) => Promise<IpcResult<CharacterRelationshipView[]>>;
    upsertRelationship: (input: CharacterRelationshipUpsertInput) => Promise<IpcResult<CharacterRelationshipView[]>>;
  };
  timeline: {
    listEventsByProject: (input: TimelineEventListByProjectInput) => Promise<IpcResult<TimelineEventView[]>>;
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
