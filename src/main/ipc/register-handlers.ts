import { registerAiIpc } from './ai-ipc';
import { registerAppProjectIpc } from './app-project-ipc';
import { registerChapterIpc } from './chapter-ipc';
import { registerKnowledgeIpc } from './knowledge-ipc';
import type { RegisterIpcHandlersOptions } from './runtime';
import { registerPitSuggestionIpc } from './pit-suggestion-ipc';

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  registerAppProjectIpc(options);
  registerChapterIpc();
  registerAiIpc();
  registerPitSuggestionIpc();
  registerKnowledgeIpc();
}
