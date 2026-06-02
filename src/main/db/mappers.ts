import type {
  AppliedChange,
  AiSuggestion,
  Chapter,
  ChapterContextRef,
  ChapterContextRefView,
  ChapterPitCandidate,
  ChapterPitCandidateStatus,
  ChapterPitPlan,
  ChapterPitReview,
  ChapterPitReviewOutcome,
  Character,
  EntitySource,
  LoreEntry,
  NovelProject,
  StoryPitCreationMethod,
  StoryPitProgressStatus,
  StoryPitStatus,
  StoryPitType,
  StoryPitView,
  SuggestionResult
} from '../../shared/ipc';
import { AppError } from './errors';

export const DOT_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export type ProjectRow = Record<keyof NovelProject, unknown>;
export type ChapterRow = Record<
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
export type SuggestionRow = Record<
  | 'id'
  | 'entity_type'
  | 'entity_id'
  | 'kind'
  | 'patch_json'
  | 'status'
  | 'summary'
  | 'source'
  | 'result_json'
  | 'created_at',
  unknown
>;
export type CharacterRow = Record<
  'id' | 'project_id' | 'name' | 'role_type' | 'summary' | 'details' | 'source' | 'created_at' | 'updated_at',
  unknown
>;
export type LoreEntryRow = Record<
  'id' | 'project_id' | 'type' | 'title' | 'summary' | 'content' | 'tags_json' | 'source' | 'created_at' | 'updated_at',
  unknown
>;
export type ChapterContextRefRow = Record<
  | 'id'
  | 'chapter_id'
  | 'ref_chapter_id'
  | 'mode'
  | 'weight'
  | 'note'
  | 'created_at'
  | 'updated_at'
  | 'ref_chapter_index_no'
  | 'ref_chapter_title'
  | 'ref_outline_user'
  | 'ref_updated_at'
  | 'ref_content',
  unknown
>;
export type StoryPitRow = Record<
  | 'id'
  | 'project_id'
  | 'type'
  | 'origin_chapter_id'
  | 'creation_method'
  | 'content'
  | 'status'
  | 'progress_status'
  | 'resolved_in_chapter_id'
  | 'sort_order'
  | 'note'
  | 'created_at'
  | 'updated_at'
  | 'origin_chapter_index_no'
  | 'origin_chapter_title'
  | 'resolved_in_chapter_index_no'
  | 'resolved_in_chapter_title',
  unknown
>;
export type ChapterPitPlanRow = Record<'id' | 'chapter_id' | 'pit_id' | 'created_at' | 'updated_at', unknown>;
export type ChapterPitReviewRow = Record<'id' | 'chapter_id' | 'pit_id' | 'outcome' | 'note' | 'created_at' | 'updated_at', unknown>;
export type ChapterPitCandidateRow = Record<'id' | 'chapter_id' | 'content' | 'status' | 'story_pit_id' | 'created_at' | 'updated_at', unknown>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function countWords(content: string): number {
  return content.replace(/\s+/gu, '').length;
}

export function ensureDotPathList(paths: unknown): string[] {
  if (!Array.isArray(paths) || !paths.every((value) => typeof value === 'string')) {
    throw new AppError('VALIDATION_ERROR', 'confirmed_fields_json must be a string array');
  }

  for (const item of paths) {
    if (!DOT_PATH_REGEX.test(item)) {
      throw new AppError('VALIDATION_ERROR', `Invalid dot-path: ${item}`);
    }
  }

  return paths;
}

export function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export function parseDotPathArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.every((item) => typeof item === 'string') ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.every((item) => typeof item === 'string') ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function ensureStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a string array`);
  }
  return value;
}

export function ensureEntitySource(source: unknown): EntitySource {
  if (source === 'user' || source === 'ai_summary' || source === 'imported') {
    return source;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid source');
}

export function ensureChapterContextRefMode(mode: unknown): ChapterContextRef['mode'] {
  if (mode === 'auto' || mode === 'manual' || mode === 'pinned') {
    return mode;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter context ref mode');
}

export function ensureStoryPitType(type: unknown): StoryPitType {
  if (type === 'chapter' || type === 'manual') {
    return type;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit type');
}

export function ensureStoryPitCreationMethod(method: unknown): StoryPitCreationMethod {
  if (method === 'ai' || method === 'manual') {
    return method;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit creation method');
}

export function ensureStoryPitStatus(status: unknown): StoryPitStatus {
  if (status === 'open' || status === 'resolved') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit status');
}

export function ensureStoryPitProgressStatus(status: unknown): StoryPitProgressStatus {
  if (status === 'unaddressed' || status === 'partial' || status === 'clear' || status === 'resolved') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit progress status');
}

export function ensureChapterPitReviewOutcome(outcome: unknown): ChapterPitReviewOutcome {
  if (outcome === 'none' || outcome === 'partial' || outcome === 'clear' || outcome === 'resolved') {
    return outcome;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter pit review outcome');
}

export function ensureChapterPitCandidateStatus(status: unknown): ChapterPitCandidateStatus {
  if (status === 'draft' || status === 'weak' || status === 'confirmed' || status === 'discarded') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter pit candidate status');
}

export function buildContentExcerpt(content: string, maxLength = 120): string {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

export function mapChapter(row: ChapterRow): Chapter {
  const confirmedRaw = typeof row.confirmed_fields_json === 'string' ? row.confirmed_fields_json : '[]';

  return {
    id: String(row.id),
    project_id: String(row.project_id),
    index_no: Number(row.index_no),
    title: String(row.title),
    status: row.status as Chapter['status'],
    pits_enabled: Boolean(Number(row.pits_enabled ?? 0)),
    goal: String(row.goal ?? ''),
    outline_ai: String(row.outline_ai ?? ''),
    outline_user: String(row.outline_user ?? ''),
    planning_clues_json: parseStringArray(typeof row.planning_clues_json === 'string' ? row.planning_clues_json : '[]'),
    planning_status_json: parseStringArray(typeof row.planning_status_json === 'string' ? row.planning_status_json : '[]'),
    foreshadow_notes_json: parseStringArray(typeof row.foreshadow_notes_json === 'string' ? row.foreshadow_notes_json : '[]'),
    content: String(row.content ?? ''),
    next_hook: String(row.next_hook ?? ''),
    word_count: Number(row.word_count ?? 0),
    revision: Number(row.revision ?? 1),
    confirmed_fields_json: parseDotPathArray(confirmedRaw),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    source: row.source as Chapter['source'],
    is_deleted: Boolean(Number(row.is_deleted ?? 0)),
    deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at)
  };
}

export function mapCharacter(row: CharacterRow): Character {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    name: String(row.name),
    role_type: String(row.role_type ?? ''),
    summary: String(row.summary ?? ''),
    details: String(row.details ?? ''),
    source: row.source as Character['source'],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function mapLoreEntry(row: LoreEntryRow): LoreEntry {
  const tagsRaw = typeof row.tags_json === 'string' ? row.tags_json : '[]';
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    type: String(row.type),
    title: String(row.title),
    summary: String(row.summary ?? ''),
    content: String(row.content ?? ''),
    tags_json: parseStringArray(tagsRaw),
    source: row.source as LoreEntry['source'],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function mapProject(row: ProjectRow): NovelProject {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    outline_text: String(row.outline_text ?? ''),
    stages_json: (() => {
      const raw = typeof row.stages_json === 'string' ? row.stages_json : '[]';
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed
          .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
          .map((item) => ({
            id: String(item.id ?? ''),
            title: String(item.title ?? ''),
            summary: String(item.summary ?? ''),
            status: (item.status === 'complete' ? 'complete' : 'incomplete') as 'complete' | 'incomplete'
          }))
          .filter((item) => item.id || item.title || item.summary);
      } catch {
        return [];
      }
    })(),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    source: row.source as NovelProject['source'],
    is_deleted: Boolean(Number(row.is_deleted ?? 0)),
    deleted_at: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at)
  };
}

export function mapChapterContextRef(row: ChapterContextRefRow): ChapterContextRefView {
  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    ref_chapter_id: String(row.ref_chapter_id),
    mode: ensureChapterContextRefMode(row.mode),
    weight: Number(row.weight ?? 0),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    ref_chapter_index_no: Number(row.ref_chapter_index_no),
    ref_chapter_title: String(row.ref_chapter_title ?? ''),
    ref_outline_user: String(row.ref_outline_user ?? ''),
    ref_updated_at: String(row.ref_updated_at ?? ''),
    ref_content_excerpt: buildContentExcerpt(String(row.ref_content ?? ''))
  };
}

export function mapStoryPit(row: StoryPitRow): StoryPitView {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    type: ensureStoryPitType(row.type),
    origin_chapter_id: row.origin_chapter_id === null || row.origin_chapter_id === undefined ? null : String(row.origin_chapter_id),
    creation_method: ensureStoryPitCreationMethod(row.creation_method),
    content: String(row.content ?? ''),
    status: ensureStoryPitStatus(row.status),
    progress_status: ensureStoryPitProgressStatus(row.progress_status ?? (row.status === 'resolved' ? 'resolved' : 'unaddressed')),
    resolved_in_chapter_id:
      row.resolved_in_chapter_id === null || row.resolved_in_chapter_id === undefined ? null : String(row.resolved_in_chapter_id),
    sort_order: row.sort_order === null || row.sort_order === undefined ? null : Number(row.sort_order),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    origin_chapter_index_no:
      row.origin_chapter_index_no === null || row.origin_chapter_index_no === undefined ? null : Number(row.origin_chapter_index_no),
    origin_chapter_title:
      row.origin_chapter_title === null || row.origin_chapter_title === undefined ? null : String(row.origin_chapter_title),
    resolved_in_chapter_index_no:
      row.resolved_in_chapter_index_no === null || row.resolved_in_chapter_index_no === undefined
        ? null
        : Number(row.resolved_in_chapter_index_no),
    resolved_in_chapter_title:
      row.resolved_in_chapter_title === null || row.resolved_in_chapter_title === undefined
        ? null
        : String(row.resolved_in_chapter_title)
  };
}

export function mapChapterPitPlan(row: ChapterPitPlanRow): ChapterPitPlan {
  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    pit_id: String(row.pit_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function mapChapterPitReview(row: ChapterPitReviewRow): ChapterPitReview {
  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    pit_id: String(row.pit_id),
    outcome: ensureChapterPitReviewOutcome(row.outcome),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function mapChapterPitCandidate(row: ChapterPitCandidateRow): ChapterPitCandidate {
  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    content: String(row.content ?? ''),
    status: ensureChapterPitCandidateStatus(row.status),
    story_pit_id: row.story_pit_id === null || row.story_pit_id === undefined ? null : String(row.story_pit_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export function parseSuggestionResult(value: string): SuggestionResult {
  const parsed = parseJsonObject(value);
  const rawApplied = parsed.appliedChanges;
  const rawBlocked = parsed.blockedFields;

  const appliedChanges: AppliedChange[] = Array.isArray(rawApplied)
    ? rawApplied
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({
          field: String(item.field ?? ''),
          previousValue: item.previousValue,
          newValue: item.newValue
        }))
        .filter((item) => item.field.length > 0)
    : [];

  const blockedFields =
    Array.isArray(rawBlocked) && rawBlocked.every((item) => typeof item === 'string')
      ? (rawBlocked as string[])
      : [];

  return {
    appliedChanges,
    blockedFields
  };
}

export function mapSuggestion(row: SuggestionRow): AiSuggestion {
  const patchRaw = typeof row.patch_json === 'string' ? row.patch_json : '{}';
  const resultRaw = typeof row.result_json === 'string' ? row.result_json : '{}';
  return {
    id: String(row.id),
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    kind: String(row.kind),
    patch_json: parseJsonObject(patchRaw),
    status: row.status as AiSuggestion['status'],
    summary: String(row.summary),
    source: row.source as AiSuggestion['source'],
    result_json: parseSuggestionResult(resultRaw),
    created_at: String(row.created_at)
  };
}
