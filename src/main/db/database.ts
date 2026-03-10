import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { app } from 'electron';
import type {
  AppliedChange,
  AiSuggestion,
  AppInitData,
  Chapter,
  ChapterCreateInput,
  ChapterUpdateInput,
  NovelProject,
  ProjectCreateInput,
  SuggestionApplyInput,
  SuggestionApplyResult,
  SuggestionCreateMockInput,
  SuggestionRejectInput,
  SuggestionRejectResult,
  SuggestionResult,
  SuggestionListByEntityInput
} from '../../shared/ipc';

const CURRENT_SCHEMA_VERSION = 1;
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
  | 'goal'
  | 'outline_ai'
  | 'outline_user'
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

function mapChapter(row: ChapterRow): Chapter {
  const confirmedRaw = typeof row.confirmed_fields_json === 'string' ? row.confirmed_fields_json : '[]';

  return {
    id: String(row.id),
    project_id: String(row.project_id),
    index_no: Number(row.index_no),
    title: String(row.title),
    status: row.status as Chapter['status'],
    goal: String(row.goal ?? ''),
    outline_ai: String(row.outline_ai ?? ''),
    outline_user: String(row.outline_user ?? ''),
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

function buildDefaultPatch(entityType: string): Record<string, unknown> {
  if (entityType === 'Chapter') {
    return {
      changes: [
        {
          field: 'next_hook',
          value: '主角在雨夜收到一封没有署名的警告信。'
        }
      ]
    };
  }

  return {
    changes: [
      {
        field: 'title',
        value: 'Mock 建议变更'
      }
    ]
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

  public getInitData(): AppInitData {
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

  public listChapters(projectId: string): Chapter[] {
    const rows = this.queryAll<ChapterRow>(
      `SELECT id, project_id, index_no, title, status, goal, outline_ai, outline_user,
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
      goal: input.goal ?? '',
      outline_ai: input.outlineAi ?? '',
      outline_user: input.outlineUser ?? '',
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
         id, project_id, index_no, title, status, goal, outline_ai, outline_user, content, next_hook,
         word_count, revision, confirmed_fields_json, created_at, updated_at, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        chapter.project_id,
        chapter.index_no,
        chapter.title,
        chapter.status,
        chapter.goal,
        chapter.outline_ai,
        chapter.outline_user,
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
      `SELECT id, project_id, index_no, title, status, goal, outline_ai, outline_user,
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
    if (typeof patch.goal === 'string') {
      assign('goal', patch.goal);
    }
    if (typeof patch.outline_ai === 'string') {
      assign('outline_ai', patch.outline_ai);
    }
    if (typeof patch.outline_user === 'string') {
      assign('outline_user', patch.outline_user);
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

    const timestamp = nowIso();
    const id = randomUUID();
    const patch = buildDefaultPatch(input.entityType);

    this.run(
      `INSERT INTO ai_suggestions (
         id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.entityType,
        input.entityId,
        'mock.patch',
        JSON.stringify(patch),
        'pending',
        'Mock 建议：可用于联调右侧建议面板',
        'mock',
        JSON.stringify({ appliedChanges: [], blockedFields: [] }),
        timestamp
      ]
    );
    this.persist();

    const row = this.queryOne<SuggestionRow>(
      `SELECT id, entity_type, entity_id, kind, patch_json, status, summary, source, result_json, created_at
       FROM ai_suggestions
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new AppError('INTERNAL_ERROR', 'Failed to read created suggestion');
    }

    return mapSuggestion(row);
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
      `SELECT id, project_id, index_no, title, status, goal, outline_ai, outline_user,
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
        goal TEXT NOT NULL DEFAULT '',
        outline_ai TEXT NOT NULL DEFAULT '',
        outline_user TEXT NOT NULL DEFAULT '',
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

      CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, index_no);
      CREATE INDEX IF NOT EXISTS idx_suggestions_entity ON ai_suggestions(entity_type, entity_id, created_at);
    `);

    this.ensureSuggestionColumns();

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
