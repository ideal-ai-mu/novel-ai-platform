import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { app } from 'electron';
import type {
  AppliedChange,
  AiGenerateChapterField,
  AiSuggestion,
  AppInitData,
  ChapterApplyGeneratedPitsInput,
  ChapterAutoPickContextRefsInput,
  ChapterClearPitReviewInput,
  ChapterContextRef,
  ChapterContextRefAddInput,
  ChapterContextRefRemoveInput,
  ChapterContextRefUpdateInput,
  ChapterContextRefView,
  ChapterContextRefsGetInput,
  ChapterCreatePitFromSuggestionInput,
  ChapterCreatePitCandidateManualInput,
  ChapterCreatePitManualInput,
  ChapterCreatePitInput,
  ChapterDeletePitCandidateInput,
  ChapterGetPitSuggestionsInput,
  ChapterOutlineOverviewItem,
  ChapterRefs,
  Chapter,
  ChapterRefsUpdateInput,
  ChapterCreateInput,
  ChapterGeneratePitsFromContentInput,
  ChapterGeneratePitsFromContentResult,
  ChapterListPitCandidatesInput,
  ChapterListPitReviewsInput,
  ChapterListPlannedPitsInput,
  ChapterListCreatedPitsInput,
  ChapterListResolvedPitsInput,
  ChapterPitCandidate,
  ChapterPitCandidateStatus,
  ChapterPitPlan,
  ChapterPitPlanView,
  ChapterPitReview,
  ChapterPitReviewOutcome,
  ChapterPitReviewView,
  ChapterPlanPitResponseInput,
  ChapterReviewPitCandidateInput,
  ChapterReviewPitResponseInput,
  ChapterResolvePitInput,
  ChapterUnplanPitResponseInput,
  ChapterUnresolvePitInput,
  ChapterUpdatePitCandidateInput,
  Character,
  CharacterCreateInput,
  CharacterUpdateInput,
  DeleteResult,
  EntitySource,
  LoreEntry,
  LoreEntryCreateInput,
  LoreEntryUpdateInput,
  ChapterUpdateInput,
  NovelProject,
  PitCreateManualInput,
  PitDeleteInput,
  PitGroupedByProjectResult,
  PitListAvailableForChapterInput,
  PitListByProjectInput,
  PitListGroupedByProjectInput,
  PitUpdateInput,
  ProjectCreateInput,
  StoryPit,
  StoryPitCreationMethod,
  StoryPitProgressStatus,
  StoryPitStatus,
  StoryPitType,
  StoryPitView,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionRejectInput,
  SuggestionRejectResult,
  SuggestionResult,
  SuggestionListByEntityInput
} from '../../shared/ipc';

const CURRENT_SCHEMA_VERSION = 4;
const DOT_PATH_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

type SqlJsStatement = {
  bind: (params?: unknown[] | Record<string, unknown>) => void;
  step: () => boolean;
  getAsObject: () => Record<string, unknown>;
  free: () => void;
};

type SqlJsDatabase = {
  run: (sql: string, params?: unknown[] | Record<string, unknown>) => void;
  prepare: (sql: string) => SqlJsStatement;
  export: () => Uint8Array;
  close: () => void;
};

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

type ProjectRow = Record<keyof NovelProject, unknown>;
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
  | 'foreshadow_notes_json'
  | 'content'
  | 'next_hook'
  | 'word_count'
  | 'revision'
  | 'confirmed_fields_json'
  | 'created_at'
  | 'updated_at'
  | 'source',
  unknown
>;
type SuggestionRow = Record<
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
type CharacterRow = Record<
  'id' | 'project_id' | 'name' | 'role_type' | 'summary' | 'details' | 'source' | 'created_at' | 'updated_at',
  unknown
>;
type LoreEntryRow = Record<
  'id' | 'project_id' | 'type' | 'title' | 'summary' | 'content' | 'tags_json' | 'source' | 'created_at' | 'updated_at',
  unknown
>;
type ChapterContextRefRow = Record<
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
type StoryPitRow = Record<
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
type ChapterPitPlanRow = Record<'id' | 'chapter_id' | 'pit_id' | 'created_at' | 'updated_at', unknown>;
type ChapterPitReviewRow = Record<'id' | 'chapter_id' | 'pit_id' | 'outcome' | 'note' | 'created_at' | 'updated_at', unknown>;
type ChapterPitCandidateRow = Record<'id' | 'chapter_id' | 'content' | 'status' | 'story_pit_id' | 'created_at' | 'updated_at', unknown>;

export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function countWords(content: string): number {
  const chunks = content.trim().match(/\S+/gu);
  return chunks ? chunks.length : 0;
}

function ensureDotPathList(paths: unknown): string[] {
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

function parseJsonObject(value: string): Record<string, unknown> {
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

function parseDotPathArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const allStrings = parsed.every((item) => typeof item === 'string');
    return allStrings ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
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

function ensureStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a string array`);
  }
  return value;
}

function ensureEntitySource(source: unknown): EntitySource {
  if (source === 'user' || source === 'ai_summary' || source === 'imported') {
    return source;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid source');
}

function mapChapter(row: ChapterRow): Chapter {
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
    foreshadow_notes_json: parseStringArray(typeof row.foreshadow_notes_json === 'string' ? row.foreshadow_notes_json : '[]'),
    content: String(row.content ?? ''),
    next_hook: String(row.next_hook ?? ''),
    word_count: Number(row.word_count ?? 0),
    revision: Number(row.revision ?? 1),
    confirmed_fields_json: parseDotPathArray(confirmedRaw),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    source: row.source as Chapter['source']
  };
}

function mapCharacter(row: CharacterRow): Character {
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

function mapLoreEntry(row: LoreEntryRow): LoreEntry {
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

function ensureChapterContextRefMode(mode: unknown): ChapterContextRef['mode'] {
  if (mode === 'auto' || mode === 'manual' || mode === 'pinned') {
    return mode;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter context ref mode');
}

function ensureStoryPitType(type: unknown): StoryPitType {
  if (type === 'chapter' || type === 'manual') {
    return type;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit type');
}

function ensureStoryPitCreationMethod(method: unknown): StoryPitCreationMethod {
  if (method === 'ai' || method === 'manual') {
    return method;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit creation method');
}

function ensureStoryPitStatus(status: unknown): StoryPitStatus {
  if (status === 'open' || status === 'resolved') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit status');
}

function ensureStoryPitProgressStatus(status: unknown): StoryPitProgressStatus {
  if (status === 'unaddressed' || status === 'partial' || status === 'clear' || status === 'resolved') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid story pit progress status');
}

function ensureChapterPitReviewOutcome(outcome: unknown): ChapterPitReviewOutcome {
  if (outcome === 'none' || outcome === 'partial' || outcome === 'clear' || outcome === 'resolved') {
    return outcome;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter pit review outcome');
}

function ensureChapterPitCandidateStatus(status: unknown): ChapterPitCandidateStatus {
  if (status === 'draft' || status === 'weak' || status === 'confirmed' || status === 'discarded') {
    return status;
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid chapter pit candidate status');
}

function buildContentExcerpt(content: string, maxLength = 120): string {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function mapChapterContextRef(row: ChapterContextRefRow): ChapterContextRefView {
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

function mapStoryPit(row: StoryPitRow): StoryPitView {
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

function mapChapterPitPlan(row: ChapterPitPlanRow): ChapterPitPlan {
  return {
    id: String(row.id),
    chapter_id: String(row.chapter_id),
    pit_id: String(row.pit_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

function mapChapterPitReview(row: ChapterPitReviewRow): ChapterPitReview {
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

function mapChapterPitCandidate(row: ChapterPitCandidateRow): ChapterPitCandidate {
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

function mapSuggestion(row: SuggestionRow): AiSuggestion {
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

function parseSuggestionResult(value: string): SuggestionResult {
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

type PatchChange = { field: string; value: unknown };

function parsePatchChanges(patch: Record<string, unknown>): PatchChange[] {
  const raw = patch.changes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      field: typeof item.field === 'string' ? item.field : '',
      value: item.value
    }))
    .filter((item) => item.field.length > 0);
}

function normalizeChapterPatchValue(field: string, value: unknown): string | null {
  if (field === 'status') {
    if (value === 'draft' || value === 'review' || value === 'final') {
      return value;
    }
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }
  return value;
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function buildOutlineAiText(chapter: Chapter, characters: Character[], loreEntries: LoreEntry[]): string {
  const goal = compactText(chapter.goal, 80) || '尚未填写本章目标，可先明确本章要推进的核心冲突。';
  const outlineUser = compactText(chapter.outline_user, 140) || '当前本章梗概为空，可以先给出一版结构化规划。';
  const nextHook = compactText(chapter.next_hook, 80) || '尚未填写章末钩子，建议在结尾留下新的信息差或危险信号。';
  const contentContext = compactText(chapter.content, 180) || '当前正文较少，可先建立场景压力，再把核心冲突推到台前。';
  const characterNames = characters.length > 0 ? characters.map((item) => item.name).join('、') : '暂无关联角色';
  const loreTitles = loreEntries.length > 0 ? loreEntries.map((item) => item.title).join('、') : '暂无关联设定';
  const chapterLabel = chapter.title.trim() || `第${chapter.index_no}章`;

  return [
    `建议版《${chapterLabel}》章节梗概：`,
    `围绕“${goal}”推进本章主线。`,
    `延续当前梗概：${outlineUser}`,
    `正文应重点呈现：${contentContext}`,
    `角色牵引：${characterNames}`,
    `设定牵引：${loreTitles}`,
    `结尾建议落在：${nextHook}`
  ].join('\n');
}

function buildOutlineUserSuggestionValue(chapter: Chapter): string {
  const goal = compactText(chapter.goal, 80);
  const contentSummary = compactText(chapter.content, 140);
  const nextHook = compactText(chapter.next_hook, 80);
  const lines = [
    goal ? `目标：${goal}` : `目标：推进 ${chapter.title.trim() || `第${chapter.index_no}章`} 的核心冲突。`,
    contentSummary ? `本章梗概：${contentSummary}` : '本章梗概：先建立压力场景，再逐步揭示新的阻力。',
    nextHook ? `章末钩子：${nextHook}` : '章末钩子：结尾需要留下新的悬念或代价。'
  ];

  return lines.join('\n');
}

function buildMockChapterSuggestion(
  chapter: Chapter,
  existingCount: number
): {
  kind: string;
  summary: string;
  patch: Record<string, unknown>;
} {
  const chapterLabel = chapter.title.trim() || `第${chapter.index_no}章`;

  if (existingCount % 2 === 0) {
    return {
      kind: 'mock.chapter.planning',
      summary: 'Mock 建议：补强章节规划层',
      patch: {
        changes: [
          {
            field: 'goal',
            value: chapter.goal.trim() || `让 ${chapterLabel} 更早暴露核心冲突与代价。`
          },
          {
            field: 'next_hook',
            value: chapter.next_hook.trim() || '章末加入新的警告、误导或更高风险的线索。'
          }
        ]
      }
    };
  }

  const contentValue = chapter.content.trim()
    ? `${chapter.content.trim()}\n\n风声忽然停住，主角这才意识到真正的危险已经贴近。`
    : '本章可以先让主角处于被动局面，再通过一条异常信息把冲突推到台前。';

  return {
    kind: 'mock.chapter.content',
    summary: 'Mock 建议：补强正文层',
    patch: {
      changes: [
        {
          field: 'content',
          value: contentValue
        }
      ]
    }
  };
}

export class AppDatabase {
  private db: SqlJsDatabase | null = null;
  private dbPath = '';
  private initPromise: Promise<void> | null = null;

  public async init(): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  public close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
    }
  }

  public getInitData(): Omit<AppInitData, 'autosaveIntervalSeconds'> {
    const row = this.queryOne<{ value: unknown }>("SELECT value FROM app_meta WHERE key = 'schema_version'");
    const schemaVersion =
      row && typeof row.value === 'string'
        ? Number.parseInt(row.value, 10) || CURRENT_SCHEMA_VERSION
        : CURRENT_SCHEMA_VERSION;

    return {
      schemaVersion,
      dbPath: this.dbPath,
      topology: 'single-db-multi-project',
      recentProjects: this.listRecentProjects(5)
    };
  }

  public listProjects(): NovelProject[] {
    const rows = this.queryAll<ProjectRow>(
      `SELECT id, title, description, created_at, updated_at, source
       FROM novel_projects
       ORDER BY updated_at DESC, created_at DESC`
    );

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ''),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      source: row.source as NovelProject['source']
    }));
  }

  public createProject(input: ProjectCreateInput): NovelProject {
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new AppError('VALIDATION_ERROR', 'Project title is required');
    }

    const id = randomUUID();
    const timestamp = nowIso();
    const description = input.description ?? '';
    const source = input.source ?? 'user';

    this.run(
      `INSERT INTO novel_projects (id, title, description, created_at, updated_at, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, title, description, timestamp, timestamp, source]
    );
    this.persist();

    const row = this.queryOne<ProjectRow>(
      `SELECT id, title, description, created_at, updated_at, source
       FROM novel_projects
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new AppError('INTERNAL_ERROR', 'Failed to read created project');
    }

    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ''),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      source: row.source as NovelProject['source']
    };
  }

  public getProject(projectId: string): NovelProject {
    const row = this.queryOne<ProjectRow>(
      `SELECT id, title, description, created_at, updated_at, source
       FROM novel_projects
       WHERE id = ?`,
      [projectId]
    );

    if (!row) {
      throw new AppError('NOT_FOUND', 'Project not found');
    }

    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ''),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      source: row.source as NovelProject['source']
    };
  }

  public deleteProject(projectId: string): DeleteResult {
    this.getProject(projectId);

    const chapterIdRows = this.queryAll<{ id: unknown }>('SELECT id FROM chapters WHERE project_id = ?', [projectId]);
    if (chapterIdRows.length > 0) {
      const chapterIds = chapterIdRows.map((row) => String(row.id));
      this.deleteChapterSuggestions(chapterIds);
    }

    this.run('DELETE FROM novel_projects WHERE id = ?', [projectId]);
    this.persist();
    return { deleted: true };
  }

  public listChapters(projectId: string): Chapter[] {
    const rows = this.queryAll<ChapterRow>(
      `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
              planning_clues_json, foreshadow_notes_json,
              content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source
       FROM chapters
       WHERE project_id = ?
       ORDER BY index_no ASC, created_at ASC`,
      [projectId]
    );

    return rows.map(mapChapter);
  }

  public createChapter(input: ChapterCreateInput): Chapter {
    const projectId = input.projectId;
    const project = this.queryOne<{ id: unknown }>('SELECT id FROM novel_projects WHERE id = ?', [projectId]);
    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found');
    }

    const title = (input.title ?? '').trim();
    if (!title) {
      throw new AppError('VALIDATION_ERROR', 'Chapter title is required');
    }

    const maxRow = this.queryOne<{ maxIndex: unknown }>(
      'SELECT MAX(index_no) AS maxIndex FROM chapters WHERE project_id = ?',
      [projectId]
    );
    const maxIndex = maxRow && maxRow.maxIndex !== null ? Number(maxRow.maxIndex) : 0;

    const id = randomUUID();
    const timestamp = nowIso();
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
      foreshadow_notes_json: input.foreshadowNotesJson ?? [],
      content,
      next_hook: input.nextHook ?? '',
      word_count: countWords(content),
      revision: 1,
      confirmed_fields_json: [],
      created_at: timestamp,
      updated_at: timestamp,
      source: input.source ?? 'user'
    };

    this.run(
      `INSERT INTO chapters (
         id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user, planning_clues_json,
         foreshadow_notes_json, content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(chapter.foreshadow_notes_json),
        chapter.content,
        chapter.next_hook,
        chapter.word_count,
        chapter.revision,
        JSON.stringify(chapter.confirmed_fields_json),
        chapter.created_at,
        chapter.updated_at,
        chapter.source
      ]
    );
    this.persist();

    return this.getChapterOrThrow(id);
  }

  public getChapter(chapterId: string): Chapter {
    return this.getChapterOrThrow(chapterId);
  }

  public updateChapter(input: ChapterUpdateInput): Chapter {
    const row = this.queryOne<ChapterRow>(
      `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
              planning_clues_json, foreshadow_notes_json,
              content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source
       FROM chapters
       WHERE id = ?`,
      [input.chapterId]
    );

    if (!row) {
      throw new AppError('NOT_FOUND', 'Chapter not found');
    }

    const current = mapChapter(row);
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
        throw new AppError(
          'CONFLICT_USER_CONFIRMED',
          `Cannot overwrite confirmed fields: ${blocked.join(', ')}`
        );
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
      assign('planning_clues_json', JSON.stringify(ensureStringArray(patch.planning_clues_json, 'planning_clues_json')));
    }
    if (patch.foreshadow_notes_json !== undefined) {
      assign('foreshadow_notes_json', JSON.stringify(ensureStringArray(patch.foreshadow_notes_json, 'foreshadow_notes_json')));
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
      const confirmed = ensureDotPathList(patch.confirmed_fields_json);
      assign('confirmed_fields_json', JSON.stringify(confirmed));
    }

    const wordCount = countWords(nextContent);
    const revision = current.revision + 1;
    const updatedAt = nowIso();
    assign('word_count', wordCount);
    assign('revision', revision);
    assign('updated_at', updatedAt);

    values.push(input.chapterId);
    this.run(`UPDATE chapters SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();

    return this.getChapterOrThrow(input.chapterId);
  }

  public deleteChapter(chapterId: string): DeleteResult {
    this.getChapterOrThrow(chapterId);
    this.deleteChapterSuggestions([chapterId]);
    this.run(
      `UPDATE story_pits
       SET status = 'open', resolved_in_chapter_id = NULL, updated_at = ?
       WHERE resolved_in_chapter_id = ?`,
      [nowIso(), chapterId]
    );
    this.run('DELETE FROM chapters WHERE id = ?', [chapterId]);
    this.persist();
    return { deleted: true };
  }

  public getChapterRefs(chapterId: string): ChapterRefs {
    const chapter = this.getChapterOrThrow(chapterId);

    const characterRows = this.queryAll<{ character_id: unknown }>(
      `SELECT character_id
       FROM chapter_character_links
       WHERE chapter_id = ?
       ORDER BY rowid ASC`,
      [chapterId]
    );

    const loreRows = this.queryAll<{ lore_entry_id: unknown }>(
      `SELECT lore_entry_id
       FROM chapter_lore_links
       WHERE chapter_id = ?
       ORDER BY rowid ASC`,
      [chapterId]
    );

    return {
      chapterId: chapter.id,
      characterIds: characterRows.map((row) => String(row.character_id)),
      loreEntryIds: loreRows.map((row) => String(row.lore_entry_id))
    };
  }

  public updateChapterRefs(input: ChapterRefsUpdateInput): ChapterRefs {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const characterIds = Array.from(new Set(ensureStringArray(input.characterIds, 'characterIds')));
    const loreEntryIds = Array.from(new Set(ensureStringArray(input.loreEntryIds, 'loreEntryIds')));

    this.validateProjectEntityIds('characters', chapter.project_id, characterIds, 'Character');
    this.validateProjectEntityIds('lore_entries', chapter.project_id, loreEntryIds, 'LoreEntry');

    this.run('BEGIN');
    try {
      this.run('DELETE FROM chapter_character_links WHERE chapter_id = ?', [chapter.id]);
      this.run('DELETE FROM chapter_lore_links WHERE chapter_id = ?', [chapter.id]);

      for (const characterId of characterIds) {
        this.run(
          `INSERT INTO chapter_character_links (chapter_id, character_id, created_at)
           VALUES (?, ?, ?)`,
          [chapter.id, characterId, nowIso()]
        );
      }

      for (const loreEntryId of loreEntryIds) {
        this.run(
          `INSERT INTO chapter_lore_links (chapter_id, lore_entry_id, created_at)
           VALUES (?, ?, ?)`,
          [chapter.id, loreEntryId, nowIso()]
        );
      }

      this.run('COMMIT');
    } catch (error) {
      this.run('ROLLBACK');
      throw error;
    }

    this.persist();
    return this.getChapterRefs(chapter.id);
  }

  public getChapterContextRefs(input: ChapterContextRefsGetInput): ChapterContextRefView[] {
    this.getChapterOrThrow(input.chapterId);
    return this.listChapterContextRefs(input.chapterId);
  }

  public addChapterContextRef(input: ChapterContextRefAddInput): ChapterContextRefView[] {
    const currentChapter = this.getChapterOrThrow(input.chapterId);
    const refChapter = this.getChapterOrThrow(input.refChapterId);
    const mode = ensureChapterContextRefMode(input.mode ?? 'manual');
    if (mode === 'auto') {
      throw new AppError('VALIDATION_ERROR', 'Use autoPickContextRefs for auto mode');
    }

    this.validateContextRefTarget(currentChapter, refChapter);

    const timestamp = nowIso();
    const note = typeof input.note === 'string' ? input.note.trim() : null;
    const weight = typeof input.weight === 'number' && Number.isFinite(input.weight) ? input.weight : this.defaultContextRefWeight(mode);
    const existing = this.queryOne<{ id: unknown }>(
      'SELECT id FROM chapter_context_refs WHERE chapter_id = ? AND ref_chapter_id = ?',
      [currentChapter.id, refChapter.id]
    );

    if (existing) {
      this.run(
        `UPDATE chapter_context_refs
         SET mode = ?, weight = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [mode, weight, note, timestamp, String(existing.id)]
      );
      this.persist();
      return this.listChapterContextRefs(currentChapter.id);
    }

    this.run(
      `INSERT INTO chapter_context_refs (
         id, chapter_id, ref_chapter_id, mode, weight, note, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), currentChapter.id, refChapter.id, mode, weight, note, timestamp, timestamp]
    );
    this.persist();
    return this.listChapterContextRefs(currentChapter.id);
  }

  public updateChapterContextRef(input: ChapterContextRefUpdateInput): ChapterContextRefView[] {
    const current = this.getChapterContextRefOrThrow(input.contextRefId);
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
      return this.listChapterContextRefs(current.chapter_id);
    }

    assign('updated_at', nowIso());
    values.push(current.id);
    this.run(`UPDATE chapter_context_refs SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();
    return this.listChapterContextRefs(current.chapter_id);
  }

  public removeChapterContextRef(input: ChapterContextRefRemoveInput): DeleteResult {
    const current = this.getChapterContextRefOrThrow(input.contextRefId);
    this.run('DELETE FROM chapter_context_refs WHERE id = ?', [current.id]);
    this.persist();
    return { deleted: true };
  }

  public autoPickChapterContextRefs(input: ChapterAutoPickContextRefsInput): ChapterContextRefView[] {
    const currentChapter = this.getChapterOrThrow(input.chapterId);
    const limit = this.normalizeAutoPickLimit(input.limit);
    const existing = this.listChapterContextRefs(currentChapter.id);
    const protectedIds = new Set(
      existing.filter((item) => item.mode === 'manual' || item.mode === 'pinned').map((item) => item.ref_chapter_id)
    );

    const candidates = this.listChapters(currentChapter.project_id)
      .filter((chapter) => chapter.index_no < currentChapter.index_no && !protectedIds.has(chapter.id))
      .sort((left, right) => right.index_no - left.index_no)
      .slice(0, limit);

    this.run('BEGIN');
    try {
      this.run(`DELETE FROM chapter_context_refs WHERE chapter_id = ? AND mode = 'auto'`, [currentChapter.id]);

      for (const [index, chapter] of candidates.entries()) {
        const timestamp = nowIso();
        this.run(
          `INSERT INTO chapter_context_refs (
             id, chapter_id, ref_chapter_id, mode, weight, note, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            currentChapter.id,
            chapter.id,
            'auto',
            this.defaultContextRefWeight('auto') - index,
            null,
            timestamp,
            timestamp
          ]
        );
      }

      this.run('COMMIT');
    } catch (error) {
      this.run('ROLLBACK');
      throw error;
    }

    this.persist();
    return this.listChapterContextRefs(currentChapter.id);
  }

  public listChapterOutlinesByProject(projectId: string): ChapterOutlineOverviewItem[] {
    this.getProject(projectId);
    return this.listChapters(projectId).map((chapter) => ({
      chapterId: chapter.id,
      index_no: chapter.index_no,
      title: chapter.title,
      outline_user: chapter.outline_user,
      updated_at: chapter.updated_at
    }));
  }

  public listPitsByProject(input: PitListByProjectInput): StoryPitView[] {
    this.getProject(input.projectId);
    return this.listStoryPits(
      `p.project_id = ?`,
      [input.projectId]
    );
  }

  public listPitsGroupedByProject(input: PitListGroupedByProjectInput): PitGroupedByProjectResult {
    const pits = this.listPitsByProject({ projectId: input.projectId });
    const chapterGroupsMap = new Map<
      string,
      {
        chapterId: string;
        index_no: number;
        title: string;
        pits: StoryPitView[];
      }
    >();
    const manualPits: StoryPitView[] = [];

    for (const pit of pits) {
      if (pit.type === 'manual' || pit.origin_chapter_id === null || pit.origin_chapter_index_no === null || !pit.origin_chapter_title) {
        manualPits.push(pit);
        continue;
      }

      const group = chapterGroupsMap.get(pit.origin_chapter_id) ?? {
        chapterId: pit.origin_chapter_id,
        index_no: pit.origin_chapter_index_no,
        title: pit.origin_chapter_title,
        pits: []
      };
      group.pits.push(pit);
      chapterGroupsMap.set(pit.origin_chapter_id, group);
    }

    return {
      chapterGroups: Array.from(chapterGroupsMap.values()).sort((left, right) => left.index_no - right.index_no),
      manualPits
    };
  }

  public listAvailablePitsForChapter(input: PitListAvailableForChapterInput): StoryPitView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    return this.listStoryPits(
      `p.project_id = ?
       AND p.progress_status != 'resolved'
       AND (
         p.type = 'manual'
         OR (
           p.type = 'chapter'
           AND p.origin_chapter_id IS NOT NULL
           AND oc.index_no < ?
         )
       )`,
      [chapter.project_id, chapter.index_no]
    );
  }

  public createManualPit(input: PitCreateManualInput): StoryPitView {
    this.getProject(input.projectId);
    const content = (input.content ?? '').trim();
    if (!content) {
      throw new AppError('VALIDATION_ERROR', 'Pit content is required');
    }

    return this.insertStoryPit({
      projectId: input.projectId,
      type: 'manual',
      originChapterId: null,
      creationMethod: 'manual',
      content,
      note: input.note ?? null
    });
  }

  public updatePit(input: PitUpdateInput): StoryPitView {
    const current = this.getStoryPitOrThrow(input.pitId);
    const patch = input.patch ?? {};
    const sets: string[] = [];
    const values: unknown[] = [];

    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (typeof patch.content === 'string') {
      const content = patch.content.trim();
      if (!content) {
        throw new AppError('VALIDATION_ERROR', 'Pit content cannot be empty');
      }
      assign('content', content);
    }
    if (patch.note !== undefined) {
      if (patch.note !== null && typeof patch.note !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'note must be a string or null');
      }
      assign('note', patch.note === null ? null : patch.note.trim());
    }
    if (patch.sort_order !== undefined) {
      if (patch.sort_order !== null && (!Number.isFinite(patch.sort_order) || !Number.isInteger(patch.sort_order))) {
        throw new AppError('VALIDATION_ERROR', 'sort_order must be an integer or null');
      }
      assign('sort_order', patch.sort_order);
    }

    if (sets.length === 0) {
      return this.getStoryPitViewOrThrow(current.id);
    }

    assign('updated_at', nowIso());
    values.push(current.id);
    this.run(`UPDATE story_pits SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();
    return this.getStoryPitViewOrThrow(current.id);
  }

  public deletePit(input: PitDeleteInput): DeleteResult {
    this.getStoryPitOrThrow(input.pitId);
    this.run('DELETE FROM story_pits WHERE id = ?', [input.pitId]);
    this.persist();
    return { deleted: true };
  }

  public listChapterCreatedPits(input: ChapterListCreatedPitsInput): StoryPitView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    return this.listStoryPits('p.origin_chapter_id = ?', [chapter.id]);
  }

  public listChapterResolvedPits(input: ChapterListResolvedPitsInput): StoryPitView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    return this.listStoryPits('p.resolved_in_chapter_id = ?', [chapter.id]);
  }

  public listChapterPlannedPits(input: ChapterListPlannedPitsInput): ChapterPitPlanView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const rows = this.queryAll<ChapterPitPlanRow>(
      `SELECT id, chapter_id, pit_id, created_at, updated_at
       FROM chapter_pit_plans
       WHERE chapter_id = ?
       ORDER BY created_at ASC`,
      [chapter.id]
    );
    return rows.map((row) => {
      const plan = mapChapterPitPlan(row);
      return {
        ...plan,
        pit: this.getStoryPitViewOrThrow(plan.pit_id)
      };
    });
  }

  public planPitResponse(input: ChapterPlanPitResponseInput): ChapterPitPlanView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const pit = this.getStoryPitOrThrow(input.pitId);
    this.validatePitResolvableForChapter(chapter, pit);

    const existing = this.queryOne<{ id: unknown }>(
      `SELECT id FROM chapter_pit_plans WHERE chapter_id = ? AND pit_id = ?`,
      [chapter.id, pit.id]
    );
    if (!existing) {
      const timestamp = nowIso();
      this.run(
        `INSERT INTO chapter_pit_plans (id, chapter_id, pit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), chapter.id, pit.id, timestamp, timestamp]
      );
      this.persist();
    }

    return this.listChapterPlannedPits({ chapterId: chapter.id });
  }

  public unplanPitResponse(input: ChapterUnplanPitResponseInput): DeleteResult {
    const chapter = this.getChapterOrThrow(input.chapterId);
    this.getStoryPitOrThrow(input.pitId);
    this.run(`DELETE FROM chapter_pit_plans WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, input.pitId]);
    this.run(`DELETE FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, input.pitId]);
    this.persist();
    return { deleted: true };
  }

  public listChapterPitReviews(input: ChapterListPitReviewsInput): ChapterPitReviewView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const rows = this.queryAll<ChapterPitReviewRow>(
      `SELECT id, chapter_id, pit_id, outcome, note, created_at, updated_at
       FROM chapter_pit_reviews
       WHERE chapter_id = ?
       ORDER BY updated_at DESC, created_at ASC`,
      [chapter.id]
    );
    return rows.map((row) => {
      const review = mapChapterPitReview(row);
      return {
        ...review,
        pit: this.getStoryPitViewOrThrow(review.pit_id)
      };
    });
  }

  public reviewPitResponse(input: ChapterReviewPitResponseInput): ChapterPitReviewView {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const pit = this.getStoryPitOrThrow(input.pitId);
    this.validatePitResolvableForChapter(chapter, pit);
    const outcome = ensureChapterPitReviewOutcome(input.outcome);
    const note = input.note === null || input.note === undefined ? null : String(input.note).trim();
    const timestamp = nowIso();
    const existing = this.queryOne<{ id: unknown }>(
      `SELECT id FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`,
      [chapter.id, pit.id]
    );

    if (existing) {
      this.run(
        `UPDATE chapter_pit_reviews
         SET outcome = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [outcome, note, timestamp, String(existing.id)]
      );
    } else {
      this.run(
        `INSERT INTO chapter_pit_reviews (id, chapter_id, pit_id, outcome, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), chapter.id, pit.id, outcome, note, timestamp, timestamp]
      );
    }

    const progressStatus: StoryPitProgressStatus =
      outcome === 'resolved' ? 'resolved' : outcome === 'clear' ? 'clear' : outcome === 'partial' ? 'partial' : 'unaddressed';
    const resolvedInChapterId = outcome === 'resolved' ? chapter.id : pit.resolved_in_chapter_id === chapter.id ? null : pit.resolved_in_chapter_id;
    const status: StoryPitStatus = outcome === 'resolved' ? 'resolved' : resolvedInChapterId ? 'resolved' : 'open';
    this.run(
      `UPDATE story_pits
       SET progress_status = ?, status = ?, resolved_in_chapter_id = ?, updated_at = ?
       WHERE id = ?`,
      [progressStatus, status, resolvedInChapterId, timestamp, pit.id]
    );
    this.persist();

    const review = this.queryOne<ChapterPitReviewRow>(
      `SELECT id, chapter_id, pit_id, outcome, note, created_at, updated_at
       FROM chapter_pit_reviews
       WHERE chapter_id = ? AND pit_id = ?`,
      [chapter.id, pit.id]
    );
    if (!review) {
      throw new AppError('INTERNAL_ERROR', 'Pit review was not saved');
    }
    return {
      ...mapChapterPitReview(review),
      pit: this.getStoryPitViewOrThrow(pit.id)
    };
  }

  public clearPitReview(input: ChapterClearPitReviewInput): DeleteResult {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const pit = this.getStoryPitOrThrow(input.pitId);
    this.run(`DELETE FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, pit.id]);
    if (pit.resolved_in_chapter_id === chapter.id) {
      this.run(
        `UPDATE story_pits
         SET progress_status = 'unaddressed', status = 'open', resolved_in_chapter_id = NULL, updated_at = ?
         WHERE id = ?`,
        [nowIso(), pit.id]
      );
    }
    this.persist();
    return { deleted: true };
  }

  public listChapterPitCandidates(input: ChapterListPitCandidatesInput): ChapterPitCandidate[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const rows = this.queryAll<ChapterPitCandidateRow>(
      `SELECT id, chapter_id, content, status, story_pit_id, created_at, updated_at
       FROM chapter_pit_candidates
       WHERE chapter_id = ?
       ORDER BY created_at ASC`,
      [chapter.id]
    );
    return rows.map(mapChapterPitCandidate);
  }

  public createPitCandidateManual(input: ChapterCreatePitCandidateManualInput): ChapterPitCandidate {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const content = (input.content ?? '').trim();
    if (!content) {
      throw new AppError('VALIDATION_ERROR', 'Pit candidate content is required');
    }
    const timestamp = nowIso();
    const id = randomUUID();
    this.run(
      `INSERT INTO chapter_pit_candidates (id, chapter_id, content, status, story_pit_id, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', NULL, ?, ?)`,
      [id, chapter.id, content, timestamp, timestamp]
    );
    this.persist();
    return this.getPitCandidateOrThrow(id);
  }

  public updatePitCandidate(input: ChapterUpdatePitCandidateInput): ChapterPitCandidate {
    const current = this.getPitCandidateOrThrow(input.candidateId);
    const patch = input.patch ?? {};
    const sets: string[] = [];
    const values: unknown[] = [];
    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (typeof patch.content === 'string') {
      const content = patch.content.trim();
      if (!content) {
        throw new AppError('VALIDATION_ERROR', 'Pit candidate content cannot be empty');
      }
      assign('content', content);
      if (current.story_pit_id) {
        this.run(`UPDATE story_pits SET content = ?, updated_at = ? WHERE id = ?`, [content, nowIso(), current.story_pit_id]);
      }
    }
    if (patch.status !== undefined) {
      assign('status', ensureChapterPitCandidateStatus(patch.status));
    }
    if (sets.length === 0) {
      return current;
    }
    assign('updated_at', nowIso());
    values.push(current.id);
    this.run(`UPDATE chapter_pit_candidates SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();
    return this.getPitCandidateOrThrow(current.id);
  }

  public deletePitCandidate(input: ChapterDeletePitCandidateInput): DeleteResult {
    const candidate = this.getPitCandidateOrThrow(input.candidateId);
    if (candidate.story_pit_id) {
      this.run(`DELETE FROM story_pits WHERE id = ?`, [candidate.story_pit_id]);
    }
    this.run(`DELETE FROM chapter_pit_candidates WHERE id = ?`, [candidate.id]);
    this.persist();
    return { deleted: true };
  }

  public reviewPitCandidate(input: ChapterReviewPitCandidateInput): ChapterPitCandidate {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const candidate = this.getPitCandidateOrThrow(input.candidateId);
    if (candidate.chapter_id !== chapter.id) {
      throw new AppError('VALIDATION_ERROR', 'Candidate does not belong to the current chapter');
    }
    const status = ensureChapterPitCandidateStatus(input.status);
    const timestamp = nowIso();
    let storyPitId = candidate.story_pit_id;

    if (status === 'confirmed') {
      if (storyPitId) {
        this.run(`UPDATE story_pits SET content = ?, updated_at = ? WHERE id = ?`, [candidate.content, timestamp, storyPitId]);
      } else {
        const created = this.insertStoryPit({
          projectId: chapter.project_id,
          type: 'chapter',
          originChapterId: chapter.id,
          creationMethod: 'manual',
          content: candidate.content,
          note: null
        });
        storyPitId = created.id;
      }
    } else if (storyPitId) {
      this.run(`DELETE FROM story_pits WHERE id = ?`, [storyPitId]);
      storyPitId = null;
    }

    this.run(
      `UPDATE chapter_pit_candidates
       SET status = ?, story_pit_id = ?, updated_at = ?
       WHERE id = ?`,
      [status, storyPitId, timestamp, candidate.id]
    );
    this.persist();
    return this.getPitCandidateOrThrow(candidate.id);
  }

  public createChapterPit(input: ChapterCreatePitInput): StoryPitView {
    const chapter = this.getChapterOrThrow(input.chapterId);

    const content = (input.content ?? '').trim();
    if (!content) {
      throw new AppError('VALIDATION_ERROR', 'Pit content is required');
    }

    return this.insertStoryPit({
      projectId: chapter.project_id,
      type: 'chapter',
      originChapterId: chapter.id,
      creationMethod: 'manual',
      content,
      note: input.note ?? null
    });
  }

  public createChapterPitManual(input: ChapterCreatePitManualInput): StoryPitView {
    return this.createChapterPit({
      chapterId: input.chapterId,
      content: input.content,
      note: input.note ?? null
    });
  }

  public createChapterPitFromSuggestion(input: ChapterCreatePitFromSuggestionInput): StoryPitView {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const content = (input.content ?? '').trim();
    if (!content) {
      throw new AppError('VALIDATION_ERROR', 'Pit content is required');
    }

    return this.insertStoryPit({
      projectId: chapter.project_id,
      type: 'chapter',
      originChapterId: chapter.id,
      creationMethod: 'ai',
      content,
      note: input.note ?? null
    });
  }

  public applyGeneratedPits(input: ChapterApplyGeneratedPitsInput): StoryPitView[] {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const candidates = Array.from(
      new Set(
        ensureStringArray(input.candidates, 'candidates')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );
    if (candidates.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one pit candidate is required');
    }

    this.run('BEGIN');
    try {
      for (const content of candidates) {
        const timestamp = nowIso();
        this.run(
           `INSERT INTO story_pits (
             id, project_id, type, origin_chapter_id, creation_method, content, status,
             progress_status, resolved_in_chapter_id, sort_order, note, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), chapter.project_id, 'chapter', chapter.id, 'ai', content, 'open', 'unaddressed', null, null, null, timestamp, timestamp]
        );
      }
      this.run('COMMIT');
    } catch (error) {
      this.run('ROLLBACK');
      throw error;
    }

    this.persist();
    return this.listChapterCreatedPits({ chapterId: chapter.id });
  }

  public resolvePit(input: ChapterResolvePitInput): StoryPitView {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const pit = this.getStoryPitOrThrow(input.pitId);
    this.validatePitResolvableForChapter(chapter, pit);
    this.run(
      `UPDATE story_pits
       SET status = 'resolved', progress_status = 'resolved', resolved_in_chapter_id = ?, updated_at = ?
       WHERE id = ?`,
      [chapter.id, nowIso(), pit.id]
    );
    this.persist();
    return this.getStoryPitViewOrThrow(pit.id);
  }

  public unresolvePit(input: ChapterUnresolvePitInput): StoryPitView {
    const chapter = this.getChapterOrThrow(input.chapterId);
    const pit = this.getStoryPitOrThrow(input.pitId);
    if (pit.resolved_in_chapter_id !== chapter.id) {
      throw new AppError('VALIDATION_ERROR', 'Pit is not resolved in the current chapter');
    }

    this.run(
      `UPDATE story_pits
       SET status = 'open', progress_status = 'unaddressed', resolved_in_chapter_id = NULL, updated_at = ?
       WHERE id = ?`,
      [nowIso(), pit.id]
    );
    this.persist();
    return this.getStoryPitViewOrThrow(pit.id);
  }

  public listCharacters(projectId: string): Character[] {
    const rows = this.queryAll<CharacterRow>(
      `SELECT id, project_id, name, role_type, summary, details, source, created_at, updated_at
       FROM characters
       WHERE project_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    );

    return rows.map(mapCharacter);
  }

  public createCharacter(input: CharacterCreateInput): Character {
    this.getProject(input.projectId);
    const name = (input.name ?? '').trim();
    if (!name) {
      throw new AppError('VALIDATION_ERROR', 'Character name is required');
    }

    const id = randomUUID();
    const timestamp = nowIso();
    const roleType = input.roleType ?? '';
    const summary = input.summary ?? '';
    const details = input.details ?? '';
    const source = input.source ?? 'user';

    this.run(
      `INSERT INTO characters (id, project_id, name, role_type, summary, details, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.projectId, name, roleType, summary, details, ensureEntitySource(source), timestamp, timestamp]
    );
    this.persist();

    return this.getCharacterOrThrow(id);
  }

  public getCharacter(characterId: string): Character {
    return this.getCharacterOrThrow(characterId);
  }

  public updateCharacter(input: CharacterUpdateInput): Character {
    const current = this.getCharacterOrThrow(input.characterId);
    const patch = input.patch ?? {};
    const sets: string[] = [];
    const values: unknown[] = [];

    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (typeof patch.name === 'string') {
      const name = patch.name.trim();
      if (!name) {
        throw new AppError('VALIDATION_ERROR', 'Character name cannot be empty');
      }
      assign('name', name);
    }
    if (typeof patch.role_type === 'string') {
      assign('role_type', patch.role_type);
    }
    if (typeof patch.summary === 'string') {
      assign('summary', patch.summary);
    }
    if (typeof patch.details === 'string') {
      assign('details', patch.details);
    }
    if (patch.source !== undefined) {
      assign('source', ensureEntitySource(patch.source));
    }

    if (sets.length === 0) {
      return current;
    }

    assign('updated_at', nowIso());
    values.push(input.characterId);
    this.run(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();
    return this.getCharacterOrThrow(input.characterId);
  }

  public deleteCharacter(characterId: string): DeleteResult {
    this.getCharacterOrThrow(characterId);
    this.run('DELETE FROM characters WHERE id = ?', [characterId]);
    this.persist();
    return { deleted: true };
  }

  public listLoreEntries(projectId: string): LoreEntry[] {
    const rows = this.queryAll<LoreEntryRow>(
      `SELECT id, project_id, type, title, summary, content, tags_json, source, created_at, updated_at
       FROM lore_entries
       WHERE project_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    );

    return rows.map(mapLoreEntry);
  }

  public createLoreEntry(input: LoreEntryCreateInput): LoreEntry {
    this.getProject(input.projectId);
    const type = (input.type ?? '').trim();
    const title = (input.title ?? '').trim();
    if (!type) {
      throw new AppError('VALIDATION_ERROR', 'LoreEntry type is required');
    }
    if (!title) {
      throw new AppError('VALIDATION_ERROR', 'LoreEntry title is required');
    }

    const id = randomUUID();
    const timestamp = nowIso();
    const summary = input.summary ?? '';
    const content = input.content ?? '';
    const tags = input.tagsJson ?? [];
    const source = input.source ?? 'user';

    this.run(
      `INSERT INTO lore_entries (id, project_id, type, title, summary, content, tags_json, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        type,
        title,
        summary,
        content,
        JSON.stringify(ensureStringArray(tags, 'tagsJson')),
        ensureEntitySource(source),
        timestamp,
        timestamp
      ]
    );
    this.persist();

    return this.getLoreEntryOrThrow(id);
  }

  public getLoreEntry(loreEntryId: string): LoreEntry {
    return this.getLoreEntryOrThrow(loreEntryId);
  }

  public updateLoreEntry(input: LoreEntryUpdateInput): LoreEntry {
    const current = this.getLoreEntryOrThrow(input.loreEntryId);
    const patch = input.patch ?? {};
    const sets: string[] = [];
    const values: unknown[] = [];

    const assign = (column: string, value: unknown) => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (typeof patch.type === 'string') {
      const type = patch.type.trim();
      if (!type) {
        throw new AppError('VALIDATION_ERROR', 'LoreEntry type cannot be empty');
      }
      assign('type', type);
    }
    if (typeof patch.title === 'string') {
      const title = patch.title.trim();
      if (!title) {
        throw new AppError('VALIDATION_ERROR', 'LoreEntry title cannot be empty');
      }
      assign('title', title);
    }
    if (typeof patch.summary === 'string') {
      assign('summary', patch.summary);
    }
    if (typeof patch.content === 'string') {
      assign('content', patch.content);
    }
    if (patch.tags_json !== undefined) {
      assign('tags_json', JSON.stringify(ensureStringArray(patch.tags_json, 'tags_json')));
    }
    if (patch.source !== undefined) {
      assign('source', ensureEntitySource(patch.source));
    }

    if (sets.length === 0) {
      return current;
    }

    assign('updated_at', nowIso());
    values.push(input.loreEntryId);
    this.run(`UPDATE lore_entries SET ${sets.join(', ')} WHERE id = ?`, values);
    this.persist();
    return this.getLoreEntryOrThrow(input.loreEntryId);
  }

  public deleteLoreEntry(loreEntryId: string): DeleteResult {
    this.getLoreEntryOrThrow(loreEntryId);
    this.run('DELETE FROM lore_entries WHERE id = ?', [loreEntryId]);
    this.persist();
    return { deleted: true };
  }

  public listSuggestionsByEntity(input: SuggestionListByEntityInput): AiSuggestion[] {
    if (input.entityType !== 'Chapter') {
      throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
    }

    const rows = this.queryAll<SuggestionRow>(
      `SELECT id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
       FROM ai_suggestions
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC`,
      [input.entityType, input.entityId]
    );

    return rows.map(mapSuggestion);
  }

  public createMockSuggestion(input: SuggestionCreateMockInput): AiSuggestion {
    if (!input.entityType || !input.entityId) {
      throw new AppError('VALIDATION_ERROR', 'entityType and entityId are required');
    }
    if (input.entityType !== 'Chapter') {
      throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
    }

    const chapter = this.getChapterOrThrow(input.entityId);
    const existingCountRow = this.queryOne<{ total: unknown }>(
      'SELECT COUNT(*) AS total FROM ai_suggestions WHERE entity_type = ? AND entity_id = ?',
      [input.entityType, input.entityId]
    );
    const existingCount = existingCountRow ? Number(existingCountRow.total ?? 0) : 0;
    const payload = buildMockChapterSuggestion(chapter, existingCount);
    const timestamp = nowIso();
    const id = randomUUID();

    this.run(
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
    this.persist();

    return this.getSuggestionOrThrow(id);
  }

  public applySuggestion(input: SuggestionApplyInput): SuggestionApplyResult {
    const suggestion = this.getSuggestionOrThrow(input.suggestionId);
    if (suggestion.status !== 'pending') {
      throw new AppError('VALIDATION_ERROR', 'Only pending suggestion can be applied');
    }
    if (suggestion.entity_type !== 'Chapter') {
      throw new AppError('VALIDATION_ERROR', 'Only Chapter suggestion is supported in this sprint');
    }

    const chapter = this.getChapterOrThrow(suggestion.entity_id);
    const changes = parsePatchChanges(suggestion.patch_json);
    if (changes.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Suggestion patch_json.changes is empty');
    }

    type ChapterSuggestionPatchField = 'title' | 'status' | 'goal' | 'outline_user' | 'next_hook' | 'content';
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

      const normalized = normalizeChapterPatchValue(field, change.value);
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
      this.updateChapter({
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

    const status: SuggestionApplyResult['status'] =
      blockedFields.length > 0 ? 'partially_applied' : 'applied';
    const result: SuggestionResult = {
      appliedChanges,
      blockedFields
    };

    this.run(`UPDATE ai_suggestions SET status = ?, result_json = ? WHERE id = ?`, [
      status,
      JSON.stringify(result),
      input.suggestionId
    ]);
    this.persist();

    return {
      status,
      appliedChanges,
      blockedFields
    };
  }

  public rejectSuggestion(input: SuggestionRejectInput): SuggestionRejectResult {
    const suggestion = this.getSuggestionOrThrow(input.suggestionId);
    if (suggestion.status !== 'pending' && suggestion.status !== 'rejected') {
      throw new AppError('VALIDATION_ERROR', 'Only pending suggestion can be rejected');
    }

    if (suggestion.status !== 'rejected') {
      this.run(`UPDATE ai_suggestions SET status = ? WHERE id = ?`, ['rejected', input.suggestionId]);
      this.persist();
    }

    return { status: 'rejected' };
  }

  private async doInit(): Promise<void> {
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });

    this.dbPath = path.join(userDataPath, 'novel-ai-studio.db');
    const sqlFactory = (await initSqlJs({
      locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
    })) as unknown as SqlJsStatic;

    const fileExists = fs.existsSync(this.dbPath);
    if (fileExists) {
      const existing = fs.readFileSync(this.dbPath);
      this.db = new sqlFactory.Database(new Uint8Array(existing));
    } else {
      this.db = new sqlFactory.Database();
    }

    this.run('PRAGMA foreign_keys = ON;');
    this.bootstrapSchema();
    this.persist();
  }

  private getChapterOrThrow(chapterId: string): Chapter {
    const row = this.queryOne<ChapterRow>(
      `SELECT id, project_id, index_no, title, status, pits_enabled, goal, outline_ai, outline_user,
              planning_clues_json, foreshadow_notes_json,
              content, next_hook, word_count, revision, confirmed_fields_json, created_at, updated_at, source
       FROM chapters
       WHERE id = ?`,
      [chapterId]
    );

    if (!row) {
      throw new AppError('NOT_FOUND', 'Chapter not found');
    }

    return mapChapter(row);
  }

  private getCharacterOrThrow(characterId: string): Character {
    const row = this.queryOne<CharacterRow>(
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

  private getLoreEntryOrThrow(loreEntryId: string): LoreEntry {
    const row = this.queryOne<LoreEntryRow>(
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

  private getChapterContextRefOrThrow(contextRefId: string): ChapterContextRef {
    const row = this.queryOne<Record<'id' | 'chapter_id' | 'ref_chapter_id' | 'mode' | 'weight' | 'note' | 'created_at' | 'updated_at', unknown>>(
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

  private listChapterContextRefs(chapterId: string): ChapterContextRefView[] {
    const rows = this.queryAll<ChapterContextRefRow>(
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

  private listStoryPits(whereClause: string, params: unknown[]): StoryPitView[] {
    const rows = this.queryAll<StoryPitRow>(
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

  private insertStoryPit(input: {
    projectId: string;
    type: StoryPitType;
    originChapterId: string | null;
    creationMethod: StoryPitCreationMethod;
    content: string;
    note?: string | null;
  }): StoryPitView {
    const timestamp = nowIso();
    const pitId = randomUUID();
    this.run(
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
    this.persist();
    return this.getStoryPitViewOrThrow(pitId);
  }

  private listChapterCharacters(chapterId: string): Character[] {
    const rows = this.queryAll<CharacterRow>(
      `SELECT c.id, c.project_id, c.name, c.role_type, c.summary, c.details, c.source, c.created_at, c.updated_at
       FROM characters c
       INNER JOIN chapter_character_links links ON links.character_id = c.id
       WHERE links.chapter_id = ?
       ORDER BY links.created_at ASC`,
      [chapterId]
    );

    return rows.map(mapCharacter);
  }

  private listChapterLoreEntries(chapterId: string): LoreEntry[] {
    const rows = this.queryAll<LoreEntryRow>(
      `SELECT l.id, l.project_id, l.type, l.title, l.summary, l.content, l.tags_json, l.source, l.created_at, l.updated_at
       FROM lore_entries l
       INNER JOIN chapter_lore_links links ON links.lore_entry_id = l.id
       WHERE links.chapter_id = ?
       ORDER BY links.created_at ASC`,
      [chapterId]
    );

    return rows.map(mapLoreEntry);
  }

  private validateProjectEntityIds(
    tableName: 'characters' | 'lore_entries',
    projectId: string,
    ids: string[],
    entityLabel: string
  ): void {
    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.queryAll<{ id: unknown }>(
      `SELECT id FROM ${tableName} WHERE project_id = ? AND id IN (${placeholders})`,
      [projectId, ...ids]
    );
    const foundIds = new Set(rows.map((row) => String(row.id)));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError('VALIDATION_ERROR', `${entityLabel} does not exist in selected project: ${missing.join(', ')}`);
    }
  }

  private validateContextRefTarget(currentChapter: Chapter, refChapter: Chapter): void {
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

  private normalizeAutoPickLimit(input: number | undefined): number {
    if (input === undefined) {
      return 3;
    }
    if (!Number.isFinite(input)) {
      throw new AppError('VALIDATION_ERROR', 'limit must be a finite number');
    }
    return Math.min(Math.max(Math.trunc(input), 2), 4);
  }

  private defaultContextRefWeight(mode: ChapterContextRef['mode']): number {
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

  private ensurePitsEnabled(chapter: Chapter): void {
    if (!chapter.pits_enabled) {
      throw new AppError('VALIDATION_ERROR', '当前章节未开启埋坑，暂时不能编辑或生成本章坑位');
    }
  }

  private getStoryPitOrThrow(pitId: string): StoryPitView {
    const row = this.queryOne<StoryPitRow>(
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

  private getStoryPitViewOrThrow(pitId: string): StoryPitView {
    return this.getStoryPitOrThrow(pitId);
  }

  private getPitCandidateOrThrow(candidateId: string): ChapterPitCandidate {
    const row = this.queryOne<ChapterPitCandidateRow>(
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

  private validatePitResolvableForChapter(chapter: Chapter, pit: StoryPitView): void {
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
      const originChapter = this.getChapterOrThrow(pit.origin_chapter_id);
      if (originChapter.index_no >= chapter.index_no) {
        throw new AppError('VALIDATION_ERROR', 'Cannot resolve a pit from the current or future chapter');
      }
    }
  }

  private deleteChapterSuggestions(chapterIds: string[]): void {
    if (chapterIds.length === 0) {
      return;
    }
    const placeholders = chapterIds.map(() => '?').join(', ');
    this.run(`DELETE FROM ai_suggestions WHERE entity_type = 'Chapter' AND entity_id IN (${placeholders})`, chapterIds);
  }

  private bootstrapSchema(): void {
    this.run(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS novel_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        index_no INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        pits_enabled INTEGER NOT NULL DEFAULT 0,
        goal TEXT NOT NULL DEFAULT '',
        outline_ai TEXT NOT NULL DEFAULT '',
        outline_user TEXT NOT NULL DEFAULT '',
        planning_clues_json TEXT NOT NULL DEFAULT '[]',
        foreshadow_notes_json TEXT NOT NULL DEFAULT '[]',
        content TEXT NOT NULL DEFAULT '',
        next_hook TEXT NOT NULL DEFAULT '',
        word_count INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        confirmed_fields_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role_type TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS lore_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapter_character_links (
        chapter_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (chapter_id, character_id),
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapter_lore_links (
        chapter_id TEXT NOT NULL,
        lore_entry_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (chapter_id, lore_entry_id),
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(lore_entry_id) REFERENCES lore_entries(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapter_context_refs (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        ref_chapter_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0,
        note TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(ref_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        patch_json TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT NOT NULL,
        result_json TEXT NOT NULL DEFAULT '{"appliedChanges":[],"blockedFields":[]}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS story_pits (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        origin_chapter_id TEXT DEFAULT NULL,
        creation_method TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        progress_status TEXT NOT NULL DEFAULT 'unaddressed',
        resolved_in_chapter_id TEXT DEFAULT NULL,
        sort_order INTEGER DEFAULT NULL,
        note TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES novel_projects(id) ON DELETE CASCADE,
        FOREIGN KEY(origin_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(resolved_in_chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS chapter_pit_plans (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        pit_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(pit_id) REFERENCES story_pits(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapter_pit_reviews (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        pit_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        note TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(pit_id) REFERENCES story_pits(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapter_pit_candidates (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        story_pit_id TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
        FOREIGN KEY(story_pit_id) REFERENCES story_pits(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, index_no);
      CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_lore_project ON lore_entries(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_chapter_character_links_chapter ON chapter_character_links(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_chapter_lore_links_chapter ON chapter_lore_links(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_chapter_context_refs_chapter ON chapter_context_refs(chapter_id, mode, weight);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_context_refs_pair ON chapter_context_refs(chapter_id, ref_chapter_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_entity ON ai_suggestions(entity_type, entity_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_story_pits_project ON story_pits(project_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_story_pits_origin ON story_pits(origin_chapter_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_story_pits_resolved ON story_pits(resolved_in_chapter_id, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_pit_plans_pair ON chapter_pit_plans(chapter_id, pit_id);
      CREATE INDEX IF NOT EXISTS idx_chapter_pit_plans_chapter ON chapter_pit_plans(chapter_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chapter_pit_reviews_pair ON chapter_pit_reviews(chapter_id, pit_id);
      CREATE INDEX IF NOT EXISTS idx_chapter_pit_reviews_chapter ON chapter_pit_reviews(chapter_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_chapter_pit_candidates_chapter ON chapter_pit_candidates(chapter_id, updated_at);
    `);

    this.ensureChapterColumns();
    this.ensureSuggestionColumns();
    this.ensurePitWorkflowSchema();

    const row = this.queryOne<{ value: unknown }>("SELECT value FROM app_meta WHERE key = 'schema_version'");
    if (!row) {
      this.run("INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)", [String(CURRENT_SCHEMA_VERSION)]);
      return;
    }

    const current = Number.parseInt(String(row.value), 10) || CURRENT_SCHEMA_VERSION;
    if (current < CURRENT_SCHEMA_VERSION) {
      // Placeholder for future migrations.
      this.run("UPDATE app_meta SET value = ? WHERE key = 'schema_version'", [String(CURRENT_SCHEMA_VERSION)]);
    }
  }

  private ensureSuggestionColumns(): void {
    const columns = this.queryAll<{ name: unknown }>('PRAGMA table_info(ai_suggestions)');
    const names = new Set(columns.map((item) => String(item.name)));
    if (!names.has('result_json')) {
      this.run(
        `ALTER TABLE ai_suggestions ADD COLUMN result_json TEXT NOT NULL DEFAULT '{"appliedChanges":[],"blockedFields":[]}'`
      );
    }
  }

  private ensurePitWorkflowSchema(): void {
    const pitColumns = this.queryAll<{ name: unknown }>('PRAGMA table_info(story_pits)');
    const pitNames = new Set(pitColumns.map((item) => String(item.name)));
    if (!pitNames.has('progress_status')) {
      this.run(`ALTER TABLE story_pits ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'unaddressed'`);
      this.run(
        `UPDATE story_pits
         SET progress_status = CASE status
           WHEN 'resolved' THEN 'resolved'
           ELSE 'unaddressed'
         END
         WHERE progress_status IS NULL OR progress_status = ''`
      );
    }

    const candidateColumns = this.queryAll<{ name: unknown }>('PRAGMA table_info(chapter_pit_candidates)');
    const candidateNames = new Set(candidateColumns.map((item) => String(item.name)));
    if (candidateColumns.length > 0 && !candidateNames.has('story_pit_id')) {
      this.run(`ALTER TABLE chapter_pit_candidates ADD COLUMN story_pit_id TEXT DEFAULT NULL`);
    }
  }

  private ensureChapterColumns(): void {
    const columns = this.queryAll<{ name: unknown }>('PRAGMA table_info(chapters)');
    const names = new Set(columns.map((item) => String(item.name)));
    if (!names.has('pits_enabled')) {
      this.run(`ALTER TABLE chapters ADD COLUMN pits_enabled INTEGER NOT NULL DEFAULT 0`);
    }
    if (!names.has('planning_clues_json')) {
      this.run(`ALTER TABLE chapters ADD COLUMN planning_clues_json TEXT NOT NULL DEFAULT '[]'`);
    }
    if (!names.has('foreshadow_notes_json')) {
      this.run(`ALTER TABLE chapters ADD COLUMN foreshadow_notes_json TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  private listRecentProjects(limit: number): Array<{ id: string; title: string; updated_at: string }> {
    const rows = this.queryAll<{ id: unknown; title: unknown; updated_at: unknown }>(
      `SELECT id, title, updated_at
       FROM novel_projects
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

  private getSuggestionOrThrow(suggestionId: string): AiSuggestion {
    const row = this.queryOne<SuggestionRow>(
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

  private persist(): void {
    const db = this.getDb();
    const data = db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private run(sql: string, params: unknown[] = []): void {
    const db = this.getDb();
    if (params.length > 0) {
      db.run(sql, params);
      return;
    }
    db.run(sql);
  }

  private queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
    const rows = this.queryAll<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  private queryAll<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    try {
      if (params.length > 0) {
        stmt.bind(params);
      }

      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  private getDb(): SqlJsDatabase {
    if (!this.db) {
      throw new AppError('INIT_FAILED', 'Database is not initialized');
    }
    return this.db;
  }
}

export const appDatabase = new AppDatabase();

