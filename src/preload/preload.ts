import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/preload-api';

// Keep preload self-contained. In Electron sandboxed preload, relative runtime
// imports can fail before exposeInMainWorld runs, which makes window.appApi
// disappear entirely.
const IPC_CHANNELS = {
  APP_INIT: 'app.init',
  APP_AUTOSAVE_INTERVAL_CHANGED: 'app.autosaveIntervalChanged',
  APP_SET_AUTOSAVE_INTERVAL: 'app.setAutosaveInterval',
  APP_MENU_ACTION: 'app.menuAction',
  APP_GET_STORAGE_INFO: 'app.getStorageInfo',
  APP_CHANGE_DATA_LOCATION: 'app.changeDataLocation',
  APP_OPEN_DATA_LOCATION: 'app.openDataLocation',
  APP_RESTORE_DEFAULT_LOCATION: 'app.restoreDefaultLocation',
  PROJECT_LIST: 'project.list',
  PROJECT_LIST_DELETED: 'project.listDeleted',
  PROJECT_CREATE: 'project.create',
  PROJECT_GET: 'project.get',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  PROJECT_RESTORE: 'project.restore',
  PROJECT_DELETE_PERMANENT: 'project.deletePermanent',
  CHAPTER_LIST: 'chapter.list',
  CHAPTER_LIST_DELETED: 'chapter.listDeleted',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_UPDATE: 'chapter.update',
  CHAPTER_DELETE: 'chapter.delete',
  CHAPTER_RESTORE: 'chapter.restore',
  CHAPTER_DELETE_PERMANENT: 'chapter.deletePermanent',
  CHAPTER_REFS_GET: 'chapter.refs.get',
  CHAPTER_REFS_UPDATE: 'chapter.refs.update',
  CHAPTER_RELATIONSHIP_GRAPH_GET: 'chapter.relationshipGraph.get',
  CHAPTER_RELATIONSHIP_GRAPH_UPDATE: 'chapter.relationshipGraph.update',
  AI_CHAT: 'ai.chat',
  AI_CONFIG_GET: 'ai.config.get',
  AI_CONFIG_UPDATE: 'ai.config.update',
  AI_CONFIG_DELETE: 'ai.config.delete',
  AI_CONFIG_LIST_MODELS: 'ai.config.listModels',
  CHAPTER_REVIEW_PIT_RESPONSE: 'chapter.reviewPitResponse',
  CHAPTER_GET_PIT_SUGGESTIONS: 'chapter.getPitSuggestions',
  CHAPTER_CREATE_PIT_FROM_SUGGESTION: 'chapter.createPitFromSuggestion',
  PIT_LIST_BY_PROJECT: 'pit.listByProject',
  PIT_CREATE_MANUAL: 'pit.createManual',
  PIT_UPDATE: 'pit.update',
  PIT_DELETE: 'pit.delete',
  CHARACTER_LIST: 'character.list',
  CHARACTER_CREATE: 'character.create',
  CHARACTER_GET: 'character.get',
  CHARACTER_UPDATE: 'character.update',
  CHARACTER_DELETE: 'character.delete',
  CHARACTER_RELATIONSHIP_LIST: 'character.relationship.list',
  CHARACTER_RELATIONSHIP_UPSERT: 'character.relationship.upsert',
  TIMELINE_EVENT_REPLACE_CHAPTER: 'timeline.event.replaceChapter',
  TIMELINE_LAYER_LIST_BY_PROJECT: 'timeline.layer.listByProject',
  TIMELINE_LAYER_REPLACE_CHAPTER: 'timeline.layer.replaceChapter',
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
    },
    setAutosaveInterval: (input) => ipcRenderer.invoke(IPC_CHANNELS.APP_SET_AUTOSAVE_INTERVAL, input),
    menuAction: (input) => ipcRenderer.invoke(IPC_CHANNELS.APP_MENU_ACTION, input),
    getStorageInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_STORAGE_INFO),
    changeDataLocation: () => ipcRenderer.invoke(IPC_CHANNELS.APP_CHANGE_DATA_LOCATION),
    openDataLocation: () => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_DATA_LOCATION),
    restoreDefaultLocation: () => ipcRenderer.invoke(IPC_CHANNELS.APP_RESTORE_DEFAULT_LOCATION)
  },
  project: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    listDeleted: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST_DELETED),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input),
    get: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, input),
    restore: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_RESTORE, input),
    deletePermanent: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE_PERMANENT, input)
  },
  chapter: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST, { projectId }),
    listDeleted: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST_DELETED, input),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE, input),
    get: (chapterId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GET, { chapterId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_DELETE, input),
    restore: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_RESTORE, input),
    deletePermanent: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_DELETE_PERMANENT, input),
    getRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_REFS_GET, input),
    updateRefs: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_REFS_UPDATE, input),
    getRelationshipGraph: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_RELATIONSHIP_GRAPH_GET, input),
    updateRelationshipGraph: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_RELATIONSHIP_GRAPH_UPDATE, input),
    reviewPitResponse: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_REVIEW_PIT_RESPONSE, input),
    getPitSuggestions: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GET_PIT_SUGGESTIONS, input),
    createPitFromSuggestion: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE_PIT_FROM_SUGGESTION, input)
  },
  ai: {
    chat: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, input),
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_GET),
    updateConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_UPDATE, input),
    deleteConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_DELETE, input),
    listModels: (input) => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_LIST_MODELS, input)
  },
  pit: {
    listByProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_LIST_BY_PROJECT, input),
    createManual: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_CREATE_MANUAL, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.PIT_DELETE, input)
  },
  character: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_CREATE, input),
    get: (characterId) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_GET, { characterId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_DELETE, input),
    listRelationships: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_RELATIONSHIP_LIST, input),
    upsertRelationship: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHARACTER_RELATIONSHIP_UPSERT, input)
  },
  timeline: {
    replaceChapterEvents: (input) => ipcRenderer.invoke(IPC_CHANNELS.TIMELINE_EVENT_REPLACE_CHAPTER, input),
    listLayersByProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.TIMELINE_LAYER_LIST_BY_PROJECT, input),
    replaceChapterLayers: (input) => ipcRenderer.invoke(IPC_CHANNELS.TIMELINE_LAYER_REPLACE_CHAPTER, input)
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
