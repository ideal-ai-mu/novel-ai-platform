import { randomUUID } from 'node:crypto';
import type {
  Chapter,
  ChapterAutoPickContextRefsInput,
  ChapterContextRef,
  ChapterContextRefAddInput,
  ChapterContextRefRemoveInput,
  ChapterContextRefUpdateInput,
  ChapterContextRefView,
  ChapterContextRefsGetInput,
  ChapterOutlineOverviewItem,
  ChapterRefs,
  ChapterRefsUpdateInput,
  Character,
  DeleteResult,
  LoreEntry,
  NovelProject
} from '../../../shared/ipc';
import { AppError } from '../errors';
import { ensureChapterContextRefMode, nowIso } from '../mappers';

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

export function addChapterContextRefRepository(
  context: ContextRefRepositoryContext,
  input: ChapterContextRefAddInput
): ChapterContextRefView[] {
  const currentChapter = context.getChapterOrThrow(input.chapterId);
  const refChapter = context.getChapterOrThrow(input.refChapterId);
  const mode = ensureChapterContextRefMode(input.mode ?? 'manual');
  if (mode === 'auto') {
    throw new AppError('VALIDATION_ERROR', 'Use autoPickContextRefs for auto mode');
  }

  context.validateContextRefTarget(currentChapter, refChapter);

  const timestamp = nowIso();
  const note = typeof input.note === 'string' ? input.note.trim() : null;
  const weight = typeof input.weight === 'number' && Number.isFinite(input.weight) ? input.weight : context.defaultContextRefWeight(mode);
  const existing = context.queryOne<{ id: unknown }>(
    'SELECT id FROM chapter_context_refs WHERE chapter_id = ? AND ref_chapter_id = ?',
    [currentChapter.id, refChapter.id]
  );

  if (existing) {
    context.run(
      `UPDATE chapter_context_refs
       SET mode = ?, weight = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [mode, weight, note, timestamp, String(existing.id)]
    );
    context.persist();
    return context.listChapterContextRefs(currentChapter.id);
  }

  context.run(
    `INSERT INTO chapter_context_refs (
       id, chapter_id, ref_chapter_id, mode, weight, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), currentChapter.id, refChapter.id, mode, weight, note, timestamp, timestamp]
  );
  context.persist();
  return context.listChapterContextRefs(currentChapter.id);
}

export function updateChapterContextRefRepository(
  context: ContextRefRepositoryContext,
  input: ChapterContextRefUpdateInput
): ChapterContextRefView[] {
  const current = context.getChapterContextRefOrThrow(input.contextRefId);
  const patch = input.patch ?? {};
  const sets: string[] = [];
  const values: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.mode !== undefined) {
    assign('mode', ensureChapterContextRefMode(patch.mode));
  }
  if (patch.weight !== undefined) {
    if (typeof patch.weight !== 'number' || !Number.isFinite(patch.weight)) {
      throw new AppError('VALIDATION_ERROR', 'weight must be a finite number');
    }
    assign('weight', patch.weight);
  }
  if (patch.note !== undefined) {
    if (patch.note !== null && typeof patch.note !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'note must be a string or null');
    }
    assign('note', patch.note === null ? null : patch.note.trim());
  }

  if (sets.length === 0) {
    return context.listChapterContextRefs(current.chapter_id);
  }

  assign('updated_at', nowIso());
  values.push(current.id);
  context.run(`UPDATE chapter_context_refs SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();
  return context.listChapterContextRefs(current.chapter_id);
}

export function removeChapterContextRefRepository(
  context: ContextRefRepositoryContext,
  input: ChapterContextRefRemoveInput
): DeleteResult {
  const current = context.getChapterContextRefOrThrow(input.contextRefId);
  context.run('DELETE FROM chapter_context_refs WHERE id = ?', [current.id]);
  context.persist();
  return { deleted: true };
}

export function autoPickChapterContextRefsRepository(
  context: ContextRefRepositoryContext,
  input: ChapterAutoPickContextRefsInput
): ChapterContextRefView[] {
  const currentChapter = context.getChapterOrThrow(input.chapterId);
  const limit = context.normalizeAutoPickLimit(input.limit);
  const existing = context.listChapterContextRefs(currentChapter.id);
  const protectedIds = new Set(
    existing.filter((item) => item.mode === 'manual' || item.mode === 'pinned').map((item) => item.ref_chapter_id)
  );

  const candidates = context
    .listChapters(currentChapter.project_id)
    .filter((chapter) => chapter.index_no < currentChapter.index_no && !protectedIds.has(chapter.id))
    .sort((left, right) => right.index_no - left.index_no)
    .slice(0, limit);

  context.run('BEGIN');
  try {
    context.run(`DELETE FROM chapter_context_refs WHERE chapter_id = ? AND mode = 'auto'`, [currentChapter.id]);

    for (const [index, chapter] of candidates.entries()) {
      const timestamp = nowIso();
      context.run(
        `INSERT INTO chapter_context_refs (
           id, chapter_id, ref_chapter_id, mode, weight, note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          currentChapter.id,
          chapter.id,
          'auto',
          context.defaultContextRefWeight('auto') - index,
          null,
          timestamp,
          timestamp
        ]
      );
    }

    context.run('COMMIT');
  } catch (error) {
    context.run('ROLLBACK');
    throw error;
  }

  context.persist();
  return context.listChapterContextRefs(currentChapter.id);
}

export function listChapterOutlinesByProjectRepository(
  context: ContextRefRepositoryContext,
  projectId: string
): ChapterOutlineOverviewItem[] {
  context.getProject(projectId);
  return context.listChapters(projectId).map((chapter) => ({
    chapterId: chapter.id,
    index_no: chapter.index_no,
    title: chapter.title,
    outline_user: chapter.outline_user,
    updated_at: chapter.updated_at
  }));
}
