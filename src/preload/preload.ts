import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/preload-api';

const CHANNELS = {
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

const appApi: AppApi = {
  app: {
    init: () => ipcRenderer.invoke(CHANNELS.APP_INIT),
    onAutosaveIntervalChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, seconds: number) => {
        listener(seconds as 0 | 5 | 10 | 30 | 60);
      };
      ipcRenderer.on(CHANNELS.APP_AUTOSAVE_INTERVAL_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(CHANNELS.APP_AUTOSAVE_INTERVAL_CHANGED, handler);
      };
    }
  },
  project: {
    list: () => ipcRenderer.invoke(CHANNELS.PROJECT_LIST),
    create: (input) => ipcRenderer.invoke(CHANNELS.PROJECT_CREATE, input),
    get: (input) => ipcRenderer.invoke(CHANNELS.PROJECT_GET, input),
    delete: (input) => ipcRenderer.invoke(CHANNELS.PROJECT_DELETE, input)
  },
  chapter: {
    list: (projectId) => ipcRenderer.invoke(CHANNELS.CHAPTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_CREATE, input),
    get: (chapterId) => ipcRenderer.invoke(CHANNELS.CHAPTER_GET, { chapterId }),
    update: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_UPDATE, input),
    generateOutlineAi: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_GENERATE_OUTLINE_AI, input),
    delete: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_DELETE, input),
    getRefs: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_REFS_GET, input),
    updateRefs: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_REFS_UPDATE, input)
  },
  character: {
    list: (projectId) => ipcRenderer.invoke(CHANNELS.CHARACTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(CHANNELS.CHARACTER_CREATE, input),
    get: (characterId) => ipcRenderer.invoke(CHANNELS.CHARACTER_GET, { characterId }),
    update: (input) => ipcRenderer.invoke(CHANNELS.CHARACTER_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(CHANNELS.CHARACTER_DELETE, input)
  },
  lore: {
    list: (projectId) => ipcRenderer.invoke(CHANNELS.LORE_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(CHANNELS.LORE_CREATE, input),
    get: (loreEntryId) => ipcRenderer.invoke(CHANNELS.LORE_GET, { loreEntryId }),
    update: (input) => ipcRenderer.invoke(CHANNELS.LORE_UPDATE, input),
    delete: (input) => ipcRenderer.invoke(CHANNELS.LORE_DELETE, input)
  },
  suggestion: {
    listByEntity: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_LIST_BY_ENTITY, input),
    createMock: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_CREATE_MOCK, input),
    apply: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_APPLY, input),
    reject: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_REJECT, input)
  }
};

contextBridge.exposeInMainWorld('appApi', appApi);
