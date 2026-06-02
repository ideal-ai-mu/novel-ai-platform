export type WorkspaceView = 'home' | 'studio' | 'codex';
export type HomeMenu = 'create' | 'write' | null;
export type ChaptersMenu = 'settings' | null;
export type WriterMode = 'read' | 'edit';
export type SaveReason = 'timer' | 'blur' | 'switch' | 'manual';
export type HomeSection = 'projects' | 'trash';
export type ChapterCollectionTab = 'manage' | 'recycle';
export type CodexSection = 'characters' | 'lore';
export type CodexEntryType = 'character' | 'lore';
export type StudioTab = 'write' | 'plan' | 'chat' | 'relationships' | 'timeline' | 'settings';
export type StudioSidebarSection = 'codex' | 'chapters' | 'recycle';

export type ChapterEditorState = {
  title: string;
  content: string;
};
