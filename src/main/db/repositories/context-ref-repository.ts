import type {
  Chapter,
  ChapterContextRef,
  ChapterContextRefView,
  ChapterContextRefsGetInput,
  ChapterRefs,
  ChapterRefsUpdateInput,
  Character,
  LoreEntry,
  NovelProject
} from '../../../shared/ipc';
import { nowIso } from '../mappers';

export type ContextRefRepositoryContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  getProject: (projectId: string) => NovelProject;
  getChapterOrThrow: (chapterId: string) => Chapter;
  getChapterContextRefOrThrow: (contextRefId: string) => ChapterContextRef;
  listChapterContextRefs: (chapterId: string) => ChapterContextRefView[];
  listChapterCharacters: (chapterId: string) => Character[];
  listChapterLoreEntries: (chapterId: string) => LoreEntry[];
  listChapters: (projectId: string) => Chapter[];
  ensureStringArray: (value: unknown, fieldName: string) => string[];
  validateProjectEntityIds: (
    tableName: 'characters' | 'lore_entries',
    projectId: string,
    ids: string[],
    entityLabel: string
  ) => void;
  validateContextRefTarget: (currentChapter: Chapter, refChapter: Chapter) => void;
  normalizeAutoPickLimit: (input: number | undefined) => number;
  defaultContextRefWeight: (mode: ChapterContextRef['mode']) => number;
};

export function getChapterRefsRepository(context: ContextRefRepositoryContext, chapterId: string): ChapterRefs {
  const chapter = context.getChapterOrThrow(chapterId);
  const characters = context.listChapterCharacters(chapterId);
  const loreEntries = context.listChapterLoreEntries(chapterId);

  return {
    chapterId: chapter.id,
    characterIds: characters.map((row) => row.id),
    loreEntryIds: loreEntries.map((row) => row.id)
  };
}

export function updateChapterRefsRepository(context: ContextRefRepositoryContext, input: ChapterRefsUpdateInput): ChapterRefs {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const characterIds = Array.from(new Set(context.ensureStringArray(input.characterIds, 'characterIds')));
  const loreEntryIds = Array.from(new Set(context.ensureStringArray(input.loreEntryIds, 'loreEntryIds')));

  context.validateProjectEntityIds('characters', chapter.project_id, characterIds, 'Character');
  context.validateProjectEntityIds('lore_entries', chapter.project_id, loreEntryIds, 'LoreEntry');

  context.run('BEGIN');
  try {
    context.run('DELETE FROM chapter_character_links WHERE chapter_id = ?', [chapter.id]);
    context.run('DELETE FROM chapter_lore_links WHERE chapter_id = ?', [chapter.id]);

    for (const characterId of characterIds) {
      context.run(
        `INSERT INTO chapter_character_links (chapter_id, character_id, created_at)
         VALUES (?, ?, ?)`,
        [chapter.id, characterId, nowIso()]
      );
    }

    for (const loreEntryId of loreEntryIds) {
      context.run(
        `INSERT INTO chapter_lore_links (chapter_id, lore_entry_id, created_at)
         VALUES (?, ?, ?)`,
        [chapter.id, loreEntryId, nowIso()]
      );
    }

    context.run('COMMIT');
  } catch (error) {
    context.run('ROLLBACK');
    throw error;
  }

  context.persist();
  return getChapterRefsRepository(context, chapter.id);
}

export function getChapterContextRefsRepository(
  context: ContextRefRepositoryContext,
  input: ChapterContextRefsGetInput
): ChapterContextRefView[] {
  context.getChapterOrThrow(input.chapterId);
  return context.listChapterContextRefs(input.chapterId);
}
