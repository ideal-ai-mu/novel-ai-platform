import type {
  AiSuggestion,
  AutosaveIntervalSeconds,
  AppInitData,
  ChapterRefs,
  ChapterDeleteInput,
  ChapterGenerateOutlineAiInput,
  ChapterGenerateOutlineAiResult,
  ChapterRefsGetInput,
  ChapterRefsUpdateInput,
  Chapter,
  ChapterCreateInput,
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
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectGetInput,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionRejectInput,
  SuggestionRejectResult,
  SuggestionListByEntityInput
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
    generateOutlineAi: (input: ChapterGenerateOutlineAiInput) => Promise<IpcResult<ChapterGenerateOutlineAiResult>>;
    delete: (input: ChapterDeleteInput) => Promise<IpcResult<DeleteResult>>;
    getRefs: (input: ChapterRefsGetInput) => Promise<IpcResult<ChapterRefs>>;
    updateRefs: (input: ChapterRefsUpdateInput) => Promise<IpcResult<ChapterRefs>>;
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
