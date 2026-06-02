import { randomUUID } from 'node:crypto';
import type {
  Chapter,
  ChapterCreateInput,
  ChapterDeletePermanentInput,
  ChapterUpdateInput,
  DeleteResult
} from '../../../shared/ipc';
import { AppError } from '../errors';

type ChapterRow = Record<
  | 'id'
  | 'project_id'
  | 'index_no'
  | 'title'
  | 'status'
  | 'pits_enabled'
  | 'goal'
  | 'outline_ai'
  | 'outline_user'
  | 'planning_clues_json'
  | 'planning_status_json'
  | 'foreshadow_notes_json'
  | 'content'
  | 'next_hook'
  | 'word_count'
  | 'revision'
  | 'confirmed_fields_json'
  | 'created_at'
  | 'updated_at'
  | 'source'
  | 'is_deleted'
  | 'deleted_at',
  unknown
>;

export type ChapterRepositoryContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  nowIso: () => string;
  countWords: (content: string) => number;
  ensureStringArray: (value: unknown, fieldName: string) => string[];
  ensureDotPathList: (value: unknown) => string[];
  mapChapter: (row: ChapterRow) => Chapter;
  getChapterOrThrow: (chapterId: string) => Chapter;
  softDeleteChaptersByIds: (chapterIds: string[], timestamp?: string) => void;
  deleteChapterSuggestions: (chapterIds: string[]) => void;
};

export function listChaptersRepository(context: ChapterRepositoryContext, projectId: string): Chapter[] {
  const rows = context.queryAll<ChapterRow>(
    `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
            planning_clues_json, planning_status_json, foreshadow_notes_json,
            content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM chapters
     WHERE project_id = ? AND is_deleted = 0
     ORDER BY index_no ASC, created_at ASC`,
    [projectId]
  );

  return rows.map(context.mapChapter);
}

export function listDeletedChaptersRepository(context: ChapterRepositoryContext, projectId: string): Chapter[] {
  const rows = context.queryAll<ChapterRow>(
    `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
            planning_clues_json, planning_status_json, foreshadow_notes_json,
            content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM chapters
     WHERE project_id = ? AND is_deleted = 1
     ORDER BY deleted_at DESC, updated_at DESC, index_no ASC`,
    [projectId]
  );

  return rows.map(context.mapChapter);
}

export function createChapterRepository(context: ChapterRepositoryContext, input: ChapterCreateInput): Chapter {
  const projectId = input.projectId;
  const project = context.queryOne<{ id: unknown }>('SELECT id FROM novel_projects WHERE id = ?', [projectId]);
  if (!project) {
    throw new AppError('NOT_FOUND', 'Project not found');
  }

  const title = (input.title ?? '').trim();
  if (!title) {
    throw new AppError('VALIDATION_ERROR', 'Chapter title is required');
  }

  const maxRow = context.queryOne<{ maxIndex: unknown }>('SELECT MAX(index_no) AS maxIndex FROM chapters WHERE project_id = ?', [projectId]);
  const maxIndex = maxRow && maxRow.maxIndex !== null ? Number(maxRow.maxIndex) : 0;

  const id = randomUUID();
  const timestamp = context.nowIso();
  const content = input.content ?? '';
  const chapter: Chapter = {
    id,
    project_id: projectId,
    index_no: input.indexNo ?? maxIndex + 1,
    title,
    status: input.status ?? 'draft',
    pits_enabled: Boolean(input.pitsEnabled ?? false),
    goal: input.goal ?? '',
    outline_ai: input.outlineAi ?? '',
    outline_user: input.outlineUser ?? '',
    planning_clues_json: input.planningCluesJson ?? [],
    planning_status_json: [],
    foreshadow_notes_json: input.foreshadowNotesJson ?? [],
    content,
    next_hook: input.nextHook ?? '',
    word_count: context.countWords(content),
    revision: 1,
    confirmed_fields_json: [],
    created_at: timestamp,
    updated_at: timestamp,
    source: input.source ?? 'user',
    is_deleted: false,
    deleted_at: null
  };

  context.run(
    `INSERT INTO chapters (
       id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user, planning_clues_json, planning_status_json,
       foreshadow_notes_json, content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source, is_deleted, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      chapter.id,
      chapter.project_id,
      chapter.index_no,
      chapter.title,
      chapter.status,
      chapter.pits_enabled ? 1 : 0,
      chapter.goal,
      chapter.outline_ai,
      chapter.outline_user,
      JSON.stringify(chapter.planning_clues_json),
      JSON.stringify(chapter.planning_status_json),
      JSON.stringify(chapter.foreshadow_notes_json),
      chapter.content,
      chapter.next_hook,
      chapter.word_count,
      chapter.revision,
      JSON.stringify(chapter.confirmed_fields_json),
      chapter.created_at,
      chapter.updated_at,
      chapter.source,
      0,
      null
    ]
  );
  context.persist();

  return context.getChapterOrThrow(id);
}

export function getChapterRepository(context: ChapterRepositoryContext, chapterId: string): Chapter {
  return context.getChapterOrThrow(chapterId);
}

export function updateChapterRepository(context: ChapterRepositoryContext, input: ChapterUpdateInput): Chapter {
  const row = context.queryOne<ChapterRow>(
    `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
            planning_clues_json, planning_status_json, foreshadow_notes_json,
            content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM chapters
     WHERE id = ?`,
    [input.chapterId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Chapter not found');
  }

  const current = context.mapChapter(row);
  const patch = input.patch ?? {};
  const patchKeys = Object.keys(patch) as Array<keyof typeof patch>;

  if (patchKeys.length === 0) {
    return current;
  }

  const actor = input.actor ?? 'user';
  const confirmedFields = current.confirmed_fields_json;
  const changedFields = patchKeys.filter((key) => key !== 'source') as string[];

  if (actor !== 'user') {
    const blocked = changedFields.filter((field) => confirmedFields.includes(field));
    if (blocked.length > 0) {
      throw new AppError('CONFLICT_USER_CONFIRMED', `Cannot overwrite confirmed fields: ${blocked.join(', ')}`);
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let nextContent = current.content;

  const assign = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };

  if (typeof patch.title === 'string') {
    const title = patch.title.trim();
    if (!title) {
      throw new AppError('VALIDATION_ERROR', 'Chapter title cannot be empty');
    }
    assign('title', title);
  }
  if (typeof patch.status === 'string') {
    assign('status', patch.status);
  }
  if (typeof patch.pits_enabled === 'boolean') {
    assign('pits_enabled', patch.pits_enabled ? 1 : 0);
  }
  if (typeof patch.goal === 'string') {
    assign('goal', patch.goal);
  }
  if (typeof patch.outline_ai === 'string') {
    assign('outline_ai', patch.outline_ai);
  }
  if (typeof patch.outline_user === 'string') {
    assign('outline_user', patch.outline_user);
  }
  if (patch.planning_clues_json !== undefined) {
    assign('planning_clues_json', JSON.stringify(context.ensureStringArray(patch.planning_clues_json, 'planning_clues_json')));
  }
  if (patch.planning_status_json !== undefined) {
    assign('planning_status_json', JSON.stringify(context.ensureStringArray(patch.planning_status_json, 'planning_status_json')));
  }
  if (patch.foreshadow_notes_json !== undefined) {
    assign('foreshadow_notes_json', JSON.stringify(context.ensureStringArray(patch.foreshadow_notes_json, 'foreshadow_notes_json')));
  }
  if (typeof patch.content === 'string') {
    nextContent = patch.content;
    assign('content', patch.content);
  }
  if (typeof patch.next_hook === 'string') {
    assign('next_hook', patch.next_hook);
  }
  if (typeof patch.source === 'string') {
    assign('source', patch.source);
  }
  if (patch.confirmed_fields_json !== undefined) {
    const confirmed = context.ensureDotPathList(patch.confirmed_fields_json);
    assign('confirmed_fields_json', JSON.stringify(confirmed));
  }

  const wordCount = context.countWords(nextContent);
  const revision = current.revision + 1;
  const updatedAt = context.nowIso();
  assign('word_count', wordCount);
  assign('revision', revision);
  assign('updated_at', updatedAt);

  values.push(input.chapterId);
  context.run(`UPDATE chapters SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();

  return context.getChapterOrThrow(input.chapterId);
}

export function deleteChapterRepository(context: ChapterRepositoryContext, chapterId: string): DeleteResult {
  context.getChapterOrThrow(chapterId);
  context.softDeleteChaptersByIds([chapterId]);
  context.persist();
  return { deleted: true };
}

export function restoreChapterRepository(context: ChapterRepositoryContext, chapterId: string): DeleteResult {
  context.getChapterOrThrow(chapterId);
  const timestamp = context.nowIso();

  context.run(
    `UPDATE chapters
     SET is_deleted = 0, deleted_at = NULL, updated_at = ?
     WHERE id = ?`,
    [timestamp, chapterId]
  );
  context.persist();
  return { deleted: false };
}

export function deleteChapterPermanentRepository(context: ChapterRepositoryContext, chapterId: string): DeleteResult {
  context.getChapterOrThrow(chapterId);
  const timestamp = context.nowIso();
  context.deleteChapterSuggestions([chapterId]);
  context.run(
    `UPDATE story_pits
     SET status = 'open', resolved_in_chapter_id = NULL, updated_at = ?
     WHERE resolved_in_chapter_id = ?`,
    [timestamp, chapterId]
  );
  context.run('DELETE FROM chapters WHERE id = ?', [chapterId]);
  context.persist();
  return { deleted: true };
}
