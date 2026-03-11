import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/preload-api';

// Keep preload self-contained. In Electron sandboxed preload, relative runtime
// imports can fail before exposeInMainWorld runs, which makes window.appApi
// disappear entirely.
const IPC_CHANNELS = {
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
  CHAPTER_LIST_CREATED_PITS: 'chapter.listCreatedPits',
  CHAPTER_LIST_RESOLVED_PITS: 'chapter.listResolvedPits',
  CHAPTER_GET_PIT_SUGGESTIONS: 'chapter.getPitSuggestions',
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

const appApi: AppApi = {
  app: {
    init: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INIT),
    onAutosaveIntervalChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, seconds: number) => {
        listener(seconds as 0 | 5 | 10 | 30 | 60);
      };
      ipcRenderer.on(IPC_CHANNELS.APP_AUTOSAVE_INTERVAL_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.APP_AUTOSAVE_INTERVAL_CHANGED, handler);
      };
    }
  },
  project: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input),
    get: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, input)
  },
  chapter: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE, input),
    get: (chapterId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GET, { chapterId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_DELETE, input),
    getRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_REFS_GET, input),
    updateRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_REFS_UPDATE, input),
    getContextRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CONTEXT_REFS_GET, input),
    addContextRef: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CONTEXT_REF_ADD, input),
    removeContextRef: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CONTEXT_REF_REMOVE, input),
    updateContextRef: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CONTEXT_REF_UPDATE, input),
    autoPickContextRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CONTEXT_REFS_AUTO_PICK, input),
    listOutlinesByProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST_OUTLINES_BY_PROJECT, input),
    listCreatedPits: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST_CREATED_PITS, input),
    listResolvedPits: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST_RESOLVED_PITS, input),
    getPitSuggestions: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GET_PIT_SUGGESTIONS, input),
    createPitFromSuggestion: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE_PIT_FROM_SUGGESTION, input),
    createPitManual: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE_PIT_MANUAL, input),
    createPit: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE_PIT, input),
    generatePitsFromContent: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GENERATE_PITS_FROM_CONTENT, input),
    applyGeneratedPits: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_APPLY_GENERATED_PITS, input),
    resolvePit: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_RESOLVE_PIT, input),
    unresolvePit: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_UNRESOLVE_PIT, input)
  },
  ai: {
    extractOutline: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_EXTRACT_OUTLINE, input),
    generateChapterTitle: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_CHAPTER_TITLE, input),
    generateChapterGoal: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_CHAPTER_GOAL, input)
  },
  pit: {
    listByProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_LIST_BY_PROJECT, input),
    listGroupedByProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_LIST_GROUPED_BY_PROJECT, input),
    listAvailableForChapter: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_LIST_AVAILABLE_FOR_CHAPTER, input),
    createManual: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_CREATE_MANUAL, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_DELETE, input)
  },
  character: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_CREATE, input),
    get: (characterId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_GET, { characterId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_DELETE, input)
  },
  lore: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.LORE_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.LORE_CREATE, input),
    get: (loreEntryId) => ipcRenderer.invoke(IPC_CHANNELS.LORE_GET, { loreEntryId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.LORE_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.LORE_DELETE, input)
  },
  suggestion: {
    listByEntity: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_LIST_BY_ENTITY, input),
    createMock: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_CREATE_MOCK, input),
    apply: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_APPLY, input),
    reject: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_REJECT, input)
  }
};

contextBridge.exposeInMainWorld('appApi', appApi);
