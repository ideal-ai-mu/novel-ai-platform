import { randomUUID } from 'node:crypto';
import type {
  AiSuggestion,
  AppliedChange,
  Chapter,
  ChapterUpdateInput,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionRejectInput,
  SuggestionRejectResult,
  SuggestionResult,
  SuggestionListByEntityInput
} from '../../../shared/ipc';
import { AppError } from '../errors';

type SuggestionRow = Record<
  'id' | 'entity_type' | 'entity_id' | 'kind' | 'patch_json' | 'status' | 'summary' | 'source' | 'result_json' | 'created_at',
  unknown
>;

type PatchChange = { field: string; value: unknown };

type ChapterSuggestionPatchField = 'title' | 'status' | 'goal' | 'outline_user' | 'next_hook' | 'content';

export type SuggestionRepositoryContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  nowIso: () => string;
  getChapterOrThrow: (chapterId: string) => Chapter;
  getSuggestionOrThrow: (suggestionId: string) => AiSuggestion;
  updateChapter: (input: ChapterUpdateInput) => Chapter;
  mapSuggestion: (row: SuggestionRow) => AiSuggestion;
  buildMockChapterSuggestion: (chapter: Chapter, existingCount: number) => {
    kind: string;
    summary: string;
    patch: Record<string, unknown>;
  };
  parsePatchChanges: (patch: Record<string, unknown>) => PatchChange[];
  normalizeChapterPatchValue: (field: string, value: unknown) => string | null;
};

const DOT_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export function listSuggestionsByEntityRepository(context: SuggestionRepositoryContext, input: SuggestionListByEntityInput): AiSuggestion[] {
  if (input.entityType !== 'Chapter') {
    throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
  }

  const rows = context.queryAll<SuggestionRow>(
    `SELECT id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
     FROM ai_suggestions
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC`,
    [input.entityType, input.entityId]
  );

  return rows.map(context.mapSuggestion);
}

export function createMockSuggestionRepository(context: SuggestionRepositoryContext, input: SuggestionCreateMockInput): AiSuggestion {
  if (!input.entityType || !input.entityId) {
    throw new AppError('VALIDATION_ERROR', 'entityType and entityId are required');
  }
  if (input.entityType !== 'Chapter') {
    throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
  }

  const chapter = context.getChapterOrThrow(input.entityId);
  const existingCountRow = context.queryOne<{ total: unknown }>(
    'SELECT COUNT(*) AS total FROM ai_suggestions WHERE entity_type = ? AND entity_id = ?',
    [input.entityType, input.entityId]
  );
  const existingCount = existingCountRow ? Number(existingCountRow.total ?? 0) : 0;
  const payload = context.buildMockChapterSuggestion(chapter, existingCount);
  const timestamp = context.nowIso();
  const id = randomUUID();

  context.run(
    `INSERT INTO ai_suggestions (
       id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.entityType,
      input.entityId,
      payload.kind,
      JSON.stringify(payload.patch),
      'pending',
      payload.summary,
      'mock',
      JSON.stringify({ appliedChanges: [], blockedFields: [] }),
      timestamp
    ]
  );
  context.persist();

  return context.getSuggestionOrThrow(id);
}

export function applySuggestionRepository(context: SuggestionRepositoryContext, input: SuggestionApplyInput): SuggestionApplyResult {
  const suggestion = context.getSuggestionOrThrow(input.suggestionId);
  if (suggestion.status !== 'pending') {
    throw new AppError('VALIDATION_ERROR', 'Only pending suggestion can be applied');
  }
  if (suggestion.entity_type !== 'Chapter') {
    throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
  }

  const chapter = context.getChapterOrThrow(suggestion.entity_id);
  const changes = context.parsePatchChanges(suggestion.patch_json);
  if (changes.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Suggestion patch_json.changes is empty');
  }

  const chapterFieldMap: Record<string, ChapterSuggestionPatchField> = {
    title: 'title',
    status: 'status',
    goal: 'goal',
    outline_user: 'outline_user',
    next_hook: 'next_hook',
    content: 'content'
  };

  const blockedSet = new Set<string>();
  const patch: Partial<Record<ChapterSuggestionPatchField, string>> = {};
  const appliedByField = new Map<string, AppliedChange>();

  for (const change of changes) {
    const field = change.field;
    if (!DOT_PATH_REGEX.test(field)) {
      blockedSet.add(field);
      continue;
    }

    if (chapter.confirmed_fields_json.includes(field)) {
      blockedSet.add(field);
      continue;
    }

    const patchField = chapterFieldMap[field];
    if (!patchField) {
      blockedSet.add(field);
      continue;
    }

    const normalized = context.normalizeChapterPatchValue(field, change.value);
    if (normalized === null) {
      blockedSet.add(field);
      continue;
    }

    patch[patchField] = normalized;
    appliedByField.set(field, {
      field,
      previousValue: (chapter as Record<string, unknown>)[patchField],
      newValue: normalized
    });
  }

  if (Object.keys(patch).length > 0) {
    context.updateChapter({
      chapterId: chapter.id,
      actor: 'ai_suggestion',
      patch: patch as ChapterUpdateInput['patch']
    });
  }

  const blockedFields = Array.from(blockedSet);
  const appliedChanges = Array.from(appliedByField.values());
  if (appliedChanges.length === 0 && blockedFields.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'No valid changes to apply');
  }

  const status: SuggestionApplyResult['status'] = blockedFields.length > 0 ? 'partially_applied' : 'applied';
  const result: SuggestionResult = {
    appliedChanges,
    blockedFields
  };

  context.run(`UPDATE ai_suggestions SET status = ?, result_json = ? WHERE id = ?`, [
    status,
    JSON.stringify(result),
    input.suggestionId
  ]);
  context.persist();

  return {
    status,
    appliedChanges,
    blockedFields
  };
}

export function rejectSuggestionRepository(context: SuggestionRepositoryContext, input: SuggestionRejectInput): SuggestionRejectResult {
  const suggestion = context.getSuggestionOrThrow(input.suggestionId);
  if (suggestion.status !== 'pending' && suggestion.status !== 'rejected') {
    throw new AppError('VALIDATION_ERROR', 'Only pending suggestion can be rejected');
  }

  if (suggestion.status !== 'rejected') {
    context.run(`UPDATE ai_suggestions SET status = ? WHERE id = ?`, ['rejected', input.suggestionId]);
    context.persist();
  }

  return { status: 'rejected' };
}
