import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi } from '../shared/preload-api';

const CHANNELS = {
  APP_INIT: 'app.init',
  PROJECT_LIST: 'project.list',
  PROJECT_CREATE: 'project.create',
  CHAPTER_LIST: 'chapter.list',
  CHAPTER_CREATE: 'chapter.create',
  CHAPTER_GET: 'chapter.get',
  CHAPTER_UPDATE: 'chapter.update',
  SUGGESTION_LIST_BY_ENTITY: 'suggestion.listByEntity',
  SUGGESTION_CREATE_MOCK: 'suggestion.createMock',
  SUGGESTION_APPLY: 'suggestion.apply',
  SUGGESTION_REJECT: 'suggestion.reject'
} as const;

const appApi: AppApi = {
  app: {
    init: () => ipcRenderer.invoke(CHANNELS.APP_INIT)
  },
  project: {
    list: () => ipcRenderer.invoke(CHANNELS.PROJECT_LIST),
    create: (input) => ipcRenderer.invoke(CHANNELS.PROJECT_CREATE, input)
  },
  chapter: {
    list: (projectId) => ipcRenderer.invoke(CHANNELS.CHAPTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_CREATE, input),
    get: (chapterId) => ipcRenderer.invoke(CHANNELS.CHAPTER_GET, { chapterId }),
    update: (input) => ipcRenderer.invoke(CHANNELS.CHAPTER_UPDATE, input)
  },
  suggestion: {
    listByEntity: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_LIST_BY_ENTITY, input),
    createMock: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_CREATE_MOCK, input),
    apply: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_APPLY, input),
    reject: (input) => ipcRenderer.invoke(CHANNELS.SUGGESTION_REJECT, input)
  }
};

contextBridge.exposeInMainWorld('appApi', appApi);
