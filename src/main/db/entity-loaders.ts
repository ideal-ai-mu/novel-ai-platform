import { randomUUID } from 'node:crypto';
import type {
  AiSuggestion,
  Chapter,
  ChapterContextRef,
  ChapterContextRefView,
  Character,
  LoreEntry,
  StoryPitCreationMethod,
  StoryPitType,
  StoryPitView
} from '../../shared/ipc';
import { AppError } from './errors';
import {
  ensureChapterContextRefMode,
  mapChapter,
  mapChapterContextRef,
  mapChapterPitCandidate,
  mapCharacter,
  mapLoreEntry,
  mapStoryPit,
  mapSuggestion,
  nowIso,
  type ChapterContextRefRow,
  type ChapterPitCandidateRow,
  type ChapterRow,
  type CharacterRow,
  type LoreEntryRow,
  type StoryPitRow,
  type SuggestionRow
} from './mappers';

export type EntityLoaderContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
};

export function getChapterOrThrow(context: EntityLoaderContext, chapterId: string): Chapter {
  const row = context.queryOne<ChapterRow>(
    `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
            planning_clues_json, planning_status_json, foreshadow_notes_json,
            content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM chapters
     WHERE id = ?`,
    [chapterId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Chapter not found');
  }

  return mapChapter(row);
}

export function getCharacterOrThrow(context: EntityLoaderContext, characterId: string): Character {
  const row = context.queryOne<CharacterRow>(
    `SELECT id, project_id, name, role_type, summary, details, source, created_at, updated_at
     FROM characters
     WHERE id = ?`,
    [characterId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Character not found');
  }

  return mapCharacter(row);
}

export function getLoreEntryOrThrow(context: EntityLoaderContext, loreEntryId: string): LoreEntry {
  const row = context.queryOne<LoreEntryRow>(
    `SELECT id, project_id, type, title, summary, content, tags_json, source, created_at, updated_at
     FROM lore_entries
     WHERE id = ?`,
    [loreEntryId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'LoreEntry not found');
  }

  return mapLoreEntry(row);
}

export function getChapterContextRefOrThrow(context: EntityLoaderContext, contextRefId: string): ChapterContextRef {
  const row = context.queryOne<Record<'id' | 'chapter_id' | 'ref_chapter_id' | 'mode' | 'weight' | 'note' | 'created_at' | 'updated_at', unknown>>(
    `SELECT id, chapter_id, ref_chapter_id, mode, weight, note, created_at, updated_at
     FROM chapter_context_refs
     WHERE id = ?`,
    [contextRefId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Chapter context ref not found');
  }

  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    ref_chapter_id: String(row.ref_chapter_id),
    mode: ensureChapterContextRefMode(row.mode),
    weight: Number(row.weight ?? 0),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function listChapterContextRefs(context: EntityLoaderContext, chapterId: string): ChapterContextRefView[] {
  const rows = context.queryAll<ChapterContextRefRow>(
    `SELECT refs.id,
            refs.chapter_id,
            refs.ref_chapter_id,
            refs.mode,
            refs.weight,
            refs.note,
            refs.created_at,
            refs.updated_at,
            ref_chapter.index_no AS ref_chapter_index_no,
            ref_chapter.title AS ref_chapter_title,
            ref_chapter.outline_user AS ref_outline_user,
            ref_chapter.updated_at AS ref_updated_at,
            ref_chapter.content AS ref_content
     FROM chapter_context_refs refs
     INNER JOIN chapters ref_chapter ON ref_chapter.id = refs.ref_chapter_id
     WHERE refs.chapter_id = ?
     ORDER BY
       CASE refs.mode
         WHEN 'pinned' THEN 0
         WHEN 'manual' THEN 1
         ELSE 2
       END,
       refs.weight DESC,
       ref_chapter.index_no DESC,
       refs.created_at ASC`,
    [chapterId]
  );

  return rows.map(mapChapterContextRef);
}

export function listStoryPits(context: EntityLoaderContext, whereClause: string, params: unknown[]): StoryPitView[] {
  const rows = context.queryAll<StoryPitRow>(
    `SELECT
       p.id,
       p.project_id,
       p.type,
       p.origin_chapter_id,
       p.creation_method,
       p.content,
       p.status,
       p.progress_status,
       p.resolved_in_chapter_id,
       p.sort_order,
       p.note,
       p.created_at,
       p.updated_at,
       oc.index_no AS origin_chapter_index_no,
       oc.title AS origin_chapter_title,
       rc.index_no AS resolved_in_chapter_index_no,
       rc.title AS resolved_in_chapter_title
     FROM story_pits p
     LEFT JOIN chapters oc ON oc.id = p.origin_chapter_id
     LEFT JOIN chapters rc ON rc.id = p.resolved_in_chapter_id
     WHERE ${whereClause}
     ORDER BY
       CASE p.progress_status WHEN 'unaddressed' THEN 0 WHEN 'partial' THEN 1 WHEN 'clear' THEN 2 ELSE 3 END,
       CASE WHEN oc.index_no IS NULL THEN 999999 ELSE oc.index_no END ASC,
       p.created_at ASC,
       p.updated_at DESC`,
    params
  );

  return rows.map(mapStoryPit);
}

export function getStoryPitOrThrow(context: EntityLoaderContext, pitId: string): StoryPitView {
  const row = context.queryOne<StoryPitRow>(
    `SELECT
       p.id,
       p.project_id,
       p.type,
       p.origin_chapter_id,
       p.creation_method,
       p.content,
       p.status,
       p.progress_status,
       p.resolved_in_chapter_id,
       p.sort_order,
       p.note,
       p.created_at,
       p.updated_at,
       oc.index_no AS origin_chapter_index_no,
       oc.title AS origin_chapter_title,
       rc.index_no AS resolved_in_chapter_index_no,
       rc.title AS resolved_in_chapter_title
     FROM story_pits p
     LEFT JOIN chapters oc ON oc.id = p.origin_chapter_id
     LEFT JOIN chapters rc ON rc.id = p.resolved_in_chapter_id
     WHERE p.id = ?`,
    [pitId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Story pit not found');
  }

  return mapStoryPit(row);
}

export function getStoryPitViewOrThrow(context: EntityLoaderContext, pitId: string): StoryPitView {
  return getStoryPitOrThrow(context, pitId);
}

export function getPitCandidateOrThrow(context: EntityLoaderContext, candidateId: string): import('../../shared/ipc').ChapterPitCandidate {
  const row = context.queryOne<ChapterPitCandidateRow>(
    `SELECT id, chapter_id, content, status, story_pit_id, created_at, updated_at
     FROM chapter_pit_candidates
     WHERE id = ?`,
    [candidateId]
  );
  if (!row) {
    throw new AppError('NOT_FOUND', 'Pit candidate not found');
  }
  return mapChapterPitCandidate(row);
}

export function listChapterCharacters(context: EntityLoaderContext, chapterId: string): Character[] {
  const rows = context.queryAll<CharacterRow>(
    `SELECT c.id, c.project_id, c.name, c.role_type, c.summary, c.details, c.source, c.created_at, c.updated_at
     FROM characters c
     INNER JOIN chapter_character_links links ON links.character_id = c.id
     WHERE links.chapter_id = ?
     ORDER BY links.created_at ASC`,
    [chapterId]
  );

  return rows.map(mapCharacter);
}

export function listChapterLoreEntries(context: EntityLoaderContext, chapterId: string): LoreEntry[] {
  const rows = context.queryAll<LoreEntryRow>(
    `SELECT l.id, l.project_id, l.type, l.title, l.summary, l.content, l.tags_json, l.source, l.created_at, l.updated_at
     FROM lore_entries l
     INNER JOIN chapter_lore_links links ON links.lore_entry_id = l.id
     WHERE links.chapter_id = ?
     ORDER BY links.created_at ASC`,
    [chapterId]
  );

  return rows.map(mapLoreEntry);
}

export function validateProjectEntityIds(
  context: EntityLoaderContext,
  tableName: 'characters' | 'lore_entries',
  projectId: string,
  ids: string[],
  entityLabel: string
): void {
  if (ids.length === 0) {
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = context.queryAll<{ id: unknown }>(
    `SELECT id FROM ${tableName} WHERE project_id = ? AND id IN (${placeholders})`,
    [projectId, ...ids]
  );
  const foundIds = new Set(rows.map((row) => String(row.id)));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError('VALIDATION_ERROR', `${entityLabel} does not exist in selected project: ${missing.join(', ')}`);
  }
}

export function validateContextRefTarget(currentChapter: Chapter, refChapter: Chapter): void {
  if (currentChapter.id === refChapter.id) {
    throw new AppError('VALIDATION_ERROR', 'Cannot reference current chapter itself');
  }
  if (currentChapter.project_id !== refChapter.project_id) {
    throw new AppError('VALIDATION_ERROR', 'Context ref chapter must belong to the same project');
  }
  if (refChapter.index_no >= currentChapter.index_no) {
    throw new AppError('VALIDATION_ERROR', 'Context ref chapter must be a previous chapter');
  }
}

export function normalizeAutoPickLimit(input: number | undefined): number {
  if (input === undefined) {
    return 3;
  }
  if (!Number.isFinite(input)) {
    throw new AppError('VALIDATION_ERROR', 'limit must be a finite number');
  }
  return Math.min(Math.max(Math.trunc(input), 2), 4);
}

export function defaultContextRefWeight(mode: ChapterContextRef['mode']): number {
  switch (mode) {
    case 'pinned':
      return 300;
    case 'manual':
      return 200;
    case 'auto':
      return 100;
    default:
      return 0;
  }
}

export function ensurePitsEnabled(chapter: Chapter): void {
  if (!chapter.pits_enabled) {
    throw new AppError('VALIDATION_ERROR', '当前章节未开启埋坑，暂时不能编辑或生成本章坑位');
  }
}

export function validatePitResolvableForChapter(context: EntityLoaderContext, chapter: Chapter, pit: StoryPitView): void {
  if (pit.project_id !== chapter.project_id) {
    throw new AppError('VALIDATION_ERROR', 'Pit must belong to the same project');
  }
  if (pit.status === 'resolved' && pit.resolved_in_chapter_id !== chapter.id) {
    throw new AppError('VALIDATION_ERROR', 'Pit is already resolved in another chapter');
  }
  if (pit.type === 'chapter') {
    if (!pit.origin_chapter_id) {
      throw new AppError('VALIDATION_ERROR', 'Chapter pit must have an origin chapter');
    }
    const originChapter = getChapterOrThrow(context, pit.origin_chapter_id);
    if (originChapter.index_no >= chapter.index_no) {
      throw new AppError('VALIDATION_ERROR', 'Cannot resolve a pit from the current or future chapter');
    }
  }
}

export function deleteChapterSuggestions(context: EntityLoaderContext, chapterIds: string[]): void {
  if (chapterIds.length === 0) {
    return;
  }
  const placeholders = chapterIds.map(() => '?').join(', ');
  context.run(`DELETE FROM ai_suggestions WHERE entity_type = 'Chapter' AND entity_id IN (${placeholders})`, chapterIds);
}

export function softDeleteChaptersByIds(context: EntityLoaderContext, chapterIds: string[], timestamp = nowIso()): void {
  if (chapterIds.length === 0) {
    return;
  }
  const placeholders = chapterIds.map(() => '?').join(', ');
  context.run(
    `UPDATE story_pits
     SET status = 'open', resolved_in_chapter_id = NULL, updated_at = ?
     WHERE resolved_in_chapter_id IN (${placeholders})`,
    [timestamp, ...chapterIds]
  );
  context.run(
    `UPDATE chapters
     SET is_deleted = 1, deleted_at = ?, updated_at = ?
     WHERE id IN (${placeholders})`,
    [timestamp, timestamp, ...chapterIds]
  );
}

export function insertStoryPit(
  context: EntityLoaderContext,
  input: {
    projectId: string;
    type: StoryPitType;
    originChapterId: string | null;
    creationMethod: StoryPitCreationMethod;
    content: string;
    note?: string | null;
  }
): StoryPitView {
  const timestamp = nowIso();
  const pitId = randomUUID();
  context.run(
    `INSERT INTO story_pits (
       id, project_id, type, origin_chapter_id, creation_method, content, status,
       progress_status, resolved_in_chapter_id, sort_order, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pitId,
      input.projectId,
      input.type,
      input.originChapterId,
      input.creationMethod,
      input.content,
      'open',
      'unaddressed',
      null,
      null,
      input.note ?? null,
      timestamp,
      timestamp
    ]
  );
  context.persist();
  return getStoryPitViewOrThrow(context, pitId);
}

export function listRecentProjects(
  context: EntityLoaderContext,
  limit: number
): Array<{ id: string; title: string; updated_at: string }> {
  const rows = context.queryAll<{ id: unknown; title: unknown; updated_at: unknown }>(
    `SELECT id, title, updated_at
     FROM novel_projects
     WHERE is_deleted = 0
     ORDER BY updated_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    updated_at: String(row.updated_at)
  }));
}

export function getSuggestionOrThrow(context: EntityLoaderContext, suggestionId: string): AiSuggestion {
  const row = context.queryOne<SuggestionRow>(
    `SELECT id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
     FROM ai_suggestions
     WHERE id = ?`,
    [suggestionId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Suggestion not found');
  }

  return mapSuggestion(row);
}
