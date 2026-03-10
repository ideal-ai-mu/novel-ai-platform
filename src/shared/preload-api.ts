import type {
  AiSuggestion,
  AppInitData,
  Chapter,
  ChapterCreateInput,
  ChapterUpdateInput,
  IpcResult,
  NovelProject,
  ProjectCreateInput,
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
  };
  project: {
    list: () => Promise<IpcResult<NovelProject[]>>;
    create: (input: ProjectCreateInput) => Promise<IpcResult<NovelProject>>;
  };
  chapter: {
    list: (projectId: string) => Promise<IpcResult<Chapter[]>>;
    create: (input: ChapterCreateInput) => Promise<IpcResult<Chapter>>;
    get: (chapterId: string) => Promise<IpcResult<Chapter>>;
    update: (input: ChapterUpdateInput) => Promise<IpcResult<Chapter>>;
  };
  suggestion: {
    listByEntity: (input: SuggestionListByEntityInput) => Promise<IpcResult<AiSuggestion[]>>;
    createMock: (input: SuggestionCreateMockInput) => Promise<IpcResult<AiSuggestion>>;
    apply: (input: SuggestionApplyInput) => Promise<IpcResult<SuggestionApplyResult>>;
    reject: (input: SuggestionRejectInput) => Promise<IpcResult<SuggestionRejectResult>>;
  };
};
