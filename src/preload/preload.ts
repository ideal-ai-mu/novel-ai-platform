import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type { AppApi } from '../shared/preload-api';

const appApi: AppApi = {
  app: {
    init: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INIT)
  },
  project: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, input)
  },
  chapter: {
    list: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_LIST, { projectId }),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_CREATE, input),
    get: (chapterId) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_GET, { chapterId }),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.CHAPTER_UPDATE, input)
  },
  suggestion: {
    listByEntity: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_LIST_BY_ENTITY, input),
    createMock: (input) => ipcRenderer.invoke(IPC_CHANNELS.SUGGESTION_CREATE_MOCK, input)
  }
};

contextBridge.exposeInMainWorld('appApi', appApi);
