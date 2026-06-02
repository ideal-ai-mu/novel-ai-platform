import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { app } from 'electron';
import type * as Ipc from '../../shared/ipc';
import { AppError } from './errors';
import { getDataDirectory, setDataDirectory } from '../app-settings';
import {
  bootstrapSchema as initializeSchema,
  CURRENT_SCHEMA_VERSION
} from './schema';
import { listRecentProjects, type EntityLoaderContext } from './entity-loaders';
import {
  createChapterRepositoryContext,
  createContextRefRepositoryContext,
  createKnowledgeRepositoryContext,
  createPitRepositoryContext,
  createProjectRepositoryContext,
  createSuggestionRepositoryContext,
  type DatabaseCoreContext
} from './repository-contexts';
import {
  createProjectRepository,
  deleteProjectPermanentRepository,
  deleteProjectRepository,
  getProjectRepository,
  listDeletedProjectsRepository,
  listProjectsRepository,
  restoreProjectRepository,
  updateProjectRepository
} from './repositories/project-repository';
import {
  createChapterRepository,
  deleteChapterPermanentRepository,
  deleteChapterRepository,
  getChapterRepository,
  listChaptersRepository,
  listDeletedChaptersRepository,
  restoreChapterRepository,
  updateChapterRepository
} from './repositories/chapter-repository';
import {
  addChapterContextRefRepository,
  autoPickChapterContextRefsRepository,
  getChapterContextRefsRepository,
  getChapterRefsRepository,
  listChapterOutlinesByProjectRepository,
  removeChapterContextRefRepository,
  updateChapterContextRefRepository,
  updateChapterRefsRepository
} from './repositories/context-ref-repository';
import {
  applyGeneratedPitsRepository,
  clearPitReviewRepository,
  createChapterPitFromSuggestionRepository,
  createChapterPitManualRepository,
  createChapterPitRepository,
  createManualPitRepository,
  createPitCandidateManualRepository,
  deletePitCandidateRepository,
  deletePitRepository,
  listAvailablePitsForChapterRepository,
  listChapterCreatedPitsRepository,
  listChapterPitCandidatesRepository,
  listChapterPitReviewsRepository,
  listChapterPlannedPitsRepository,
  listChapterResolvedPitsRepository,
  listPitsByProjectRepository,
  listPitsGroupedByProjectRepository,
  planPitResponseRepository,
  resolvePitRepository,
  reviewPitCandidateRepository,
  reviewPitResponseRepository,
  unplanPitResponseRepository,
  unresolvePitRepository,
  updatePitCandidateRepository,
  updatePitRepository
} from './repositories/pit-repository';
import {
  createCharacterRepository,
  createLoreEntryRepository,
  deleteCharacterRepository,
  deleteLoreEntryRepository,
  getCharacterRepository,
  getLoreEntryRepository,
  listCharactersRepository,
  listLoreEntriesRepository,
  updateCharacterRepository,
  updateLoreEntryRepository
} from './repositories/knowledge-repository';
import {
  applySuggestionRepository,
  createMockSuggestionRepository,
  listSuggestionsByEntityRepository,
  rejectSuggestionRepository
} from './repositories/suggestion-repository';

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

function normalizeRelationshipLabel(label: string): string {
  const compact = label.replace(/\s+/gu, '').replace(/关系$/u, '');
  const groups: Array<[string, string[]]> = [
    ['朋友', ['朋友', '好朋友', '好友', '挚友', '友人']],
    ['恋人', ['恋人', '情侣', '爱人', '相爱', '伴侣']],
    ['邻居', ['邻居', '邻里', '住得近', '同住附近']],
    ['兄弟', ['兄弟', '亲兄弟', '哥哥弟弟', '哥弟']],
    ['姐妹', ['姐妹', '亲姐妹', '姐姐妹妹', '姐妺']],
    ['母子', ['母子', '母亲', '妈妈', '母亲儿子']],
    ['父子', ['父子', '父亲', '爸爸', '父亲儿子']],
    ['母女', ['母女', '母亲女儿']],
    ['父女', ['父女', '父亲女儿']],
    ['祖孙', ['祖孙', '祖孙关系', '爷孙', '奶孙']],
    ['同伴', ['同伴', '伙伴', '队友', '搭档']],
    ['敌人', ['敌人', '仇人', '死敌', '对手']],
    ['师徒', ['师徒', '师父徒弟', '师傅徒弟']]
  ];
  for (const [canonical, values] of groups) {
    if (values.some((value) => compact === value || compact.includes(value))) {
      return canonical;
    }
  }
  return compact;
}

const DB_FILENAME = 'novel-ai-studio.db';

// The sql.js WASM factory is expensive to construct and never changes across
// re-opens, so build it once and reuse it (relocating the database must NOT
// re-run initSqlJs).
let cachedSqlFactory: SqlJsStatic | null = null;

function locateSqlWasm(file: string): string {
  // Packaged: the .wasm is shipped as an extraResource (see electron-builder
  // config) at <resources>/<file>. Dev: read it straight from node_modules.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, file);
  }
  return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
}

async function getSqlFactory(): Promise<SqlJsStatic> {
  if (!cachedSqlFactory) {
    cachedSqlFactory = (await initSqlJs({
      locateFile: locateSqlWasm
    })) as unknown as SqlJsStatic;
  }
  return cachedSqlFactory;
}

function isDefaultDir(dir: string): boolean {
  return samePath(dir, app.getPath('userData'));
}

function samePath(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

export class AppDatabase {
  private db: SqlJsDatabase | null = null;
  private dbPath = '';
  private initPromise: Promise<void> | null = null;
  private relocating = false;

  public async init(): Promise<void> {
    if (this.db) {
      return;
    }

    if (!this.initPromise) {
      // Clear the cached promise on failure so a later retry (e.g. recovering via
      // the menu after an unreachable custom location) re-runs init instead of
      // re-throwing the same stale rejection forever.
      this.initPromise = this.doInit().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }

  public close(): void {
    if (this.db) {
      try {
        this.persist();
      } catch (error) {
        // Never throw out of close()/before-quit — an exception there can wedge quit.
        console.error('Failed to persist database on close:', error);
      }
    }
    this.reset();
  }

  // Always tears the connection fully down: closes the db if present and clears
  // the cached init promise so the next init() re-runs cleanly.
  private reset(): void {
    try {
      this.db?.close();
    } catch {
      /* ignore close errors */
    } finally {
      this.db = null;
      this.initPromise = null;
    }
  }

  public getInitData(): Omit<Ipc.AppInitData, 'autosaveIntervalSeconds'> {
    const row = this.queryOne<{ value: unknown }>("SELECT value FROM app_meta WHERE key = 'schema_version'");
    const schemaVersion = row ? Number(row.value) : CURRENT_SCHEMA_VERSION;
    return {
      schemaVersion,
      dbPath: this.dbPath,
      topology: 'single-db-multi-project',
      recentProjects: listRecentProjects(this.createLoaderContext(), 5)
    };
  }

  public getStorageInfo(): { dbPath: string; dataDir: string; defaultDir: string; isCustom: boolean } {
    const defaultDir = app.getPath('userData');
    const configuredDir = getDataDirectory();
    const dataDir = this.dbPath ? path.dirname(this.dbPath) : (configuredDir ?? defaultDir);
    return {
      dbPath: this.dbPath || path.join(dataDir, DB_FILENAME),
      dataDir,
      defaultDir,
      isCustom: !isDefaultDir(dataDir)
    };
  }

  // Move all data into a user-chosen (empty) folder. Safe by construction: copies,
  // verifies, atomically renames, opens the new copy, persists the setting, and only
  // then removes the old file — any failure leaves the original data untouched.
  public relocate(targetDir: string): Promise<{ dbPath: string }> {
    return this.withRelocateLock(() => this.moveCurrentTo(targetDir));
  }

  public restoreDefaultLocation(options: { force?: boolean } = {}): Promise<{ dbPath: string }> {
    return this.withRelocateLock(async () => {
      const defaultDir = app.getPath('userData');

      let currentLive = false;
      try {
        await this.init();
        currentLive = true;
      } catch {
        currentLive = false;
      }

      if (currentLive) {
        if (isDefaultDir(path.dirname(this.dbPath))) {
          // Already on the default location — nothing to do.
          return { dbPath: this.dbPath };
        }
        // Normal case: move the live data back to the default location.
        return this.moveCurrentTo(defaultDir);
      }

      // The current (custom) location is unreachable. Do NOT silently adopt whatever
      // database happens to sit at the default location (it may be a stale leftover or
      // a restored backup) or clear the setting — that would orphan the real data that
      // still lives on the offline location while reporting success. Keep everything
      // intact and tell the user to reconnect it.
      if (!options.force) {
        throw new AppError(
          'CUSTOM_LOCATION_UNREACHABLE',
          '当前的数据存放位置无法访问，你的小说数据仍然保存在那个文件夹/磁盘里。请重新连接它后重启应用即可恢复。'
        );
      }

      // The user explicitly chose to abandon the unreachable location and start from
      // the default one (adopting an existing default database, or creating an empty
      // one). The data on the unreachable location is left untouched.
      this.reset();
      setDataDirectory(null);
      this.initPromise = this.openAt(defaultDir, true).catch((error) => {
        this.initPromise = null;
        throw error;
      });
      await this.initPromise;
      return { dbPath: this.dbPath };
    });
  }

  public listProjects(): Ipc.NovelProject[] {
    return listProjectsRepository(createProjectRepositoryContext(this.createCoreContext()));
  }

  public listDeletedProjects(): Ipc.NovelProject[] {
    return listDeletedProjectsRepository(createProjectRepositoryContext(this.createCoreContext()));
  }

  public createProject(input: Ipc.ProjectCreateInput): Ipc.NovelProject {
    return createProjectRepository(createProjectRepositoryContext(this.createCoreContext()), input);
  }

  public getProject(projectId: string): Ipc.NovelProject {
    return getProjectRepository(createProjectRepositoryContext(this.createCoreContext()), projectId);
  }

  public updateProject(input: Ipc.ProjectUpdateInput): Ipc.NovelProject {
    return updateProjectRepository(createProjectRepositoryContext(this.createCoreContext()), input);
  }

  public deleteProject(projectId: string): Ipc.DeleteResult {
    return deleteProjectRepository(createProjectRepositoryContext(this.createCoreContext()), projectId);
  }

  public restoreProject(projectId: string): Ipc.DeleteResult {
    return restoreProjectRepository(createProjectRepositoryContext(this.createCoreContext()), projectId);
  }

  public deleteProjectPermanent(projectId: string): Ipc.DeleteResult {
    return deleteProjectPermanentRepository(createProjectRepositoryContext(this.createCoreContext()), projectId);
  }

  public listChapters(projectId: string): Ipc.Chapter[] {
    return listChaptersRepository(createChapterRepositoryContext(this.createCoreContext()), projectId);
  }

  public listDeletedChapters(projectId: string): Ipc.Chapter[] {
    return listDeletedChaptersRepository(createChapterRepositoryContext(this.createCoreContext()), projectId);
  }

  public createChapter(input: Ipc.ChapterCreateInput): Ipc.Chapter {
    return createChapterRepository(createChapterRepositoryContext(this.createCoreContext()), input);
  }

  public getChapter(chapterId: string): Ipc.Chapter {
    return getChapterRepository(createChapterRepositoryContext(this.createCoreContext()), chapterId);
  }

  public updateChapter(input: Ipc.ChapterUpdateInput): Ipc.Chapter {
    return updateChapterRepository(createChapterRepositoryContext(this.createCoreContext()), input);
  }

  public deleteChapter(chapterId: string): Ipc.DeleteResult {
    return deleteChapterRepository(createChapterRepositoryContext(this.createCoreContext()), chapterId);
  }

  public restoreChapter(chapterId: string): Ipc.DeleteResult {
    return restoreChapterRepository(createChapterRepositoryContext(this.createCoreContext()), chapterId);
  }

  public deleteChapterPermanent(chapterId: string): Ipc.DeleteResult {
    return deleteChapterPermanentRepository(createChapterRepositoryContext(this.createCoreContext()), chapterId);
  }

  public getChapterRefs(chapterId: string): Ipc.ChapterRefs {
    return getChapterRefsRepository(createContextRefRepositoryContext(this.createCoreContext()), chapterId);
  }

  public updateChapterRefs(input: Ipc.ChapterRefsUpdateInput): Ipc.ChapterRefs {
    return updateChapterRefsRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public getChapterRelationshipGraph(input: Ipc.ChapterRelationshipGraphGetInput): Ipc.ChapterRelationshipGraph {
    const chapter = this.getChapter(input.chapterId);
    const row = this.queryOne<{ graph_json: unknown }>(
      'SELECT graph_json FROM chapter_relationship_graphs WHERE chapter_id = ?',
      [chapter.id]
    );

    return this.normalizeChapterRelationshipGraph(row?.graph_json);
  }

  public updateChapterRelationshipGraph(input: Ipc.ChapterRelationshipGraphUpdateInput): Ipc.ChapterRelationshipGraph {
    const chapter = this.getChapter(input.chapterId);
    const graph = this.normalizeChapterRelationshipGraph(input.graph);
    const timestamp = new Date().toISOString();

    this.run(
      `INSERT INTO chapter_relationship_graphs (chapter_id, graph_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chapter_id) DO UPDATE SET
         graph_json = excluded.graph_json,
         updated_at = excluded.updated_at`,
      [chapter.id, JSON.stringify(graph), timestamp]
    );
    this.persist();
    return graph;
  }

  public getChapterContextRefs(input: Ipc.ChapterContextRefsGetInput): Ipc.ChapterContextRefView[] {
    return getChapterContextRefsRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public addChapterContextRef(input: Ipc.ChapterContextRefAddInput): Ipc.ChapterContextRefView[] {
    return addChapterContextRefRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public updateChapterContextRef(input: Ipc.ChapterContextRefUpdateInput): Ipc.ChapterContextRefView[] {
    return updateChapterContextRefRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public removeChapterContextRef(input: Ipc.ChapterContextRefRemoveInput): Ipc.DeleteResult {
    return removeChapterContextRefRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public autoPickChapterContextRefs(input: Ipc.ChapterAutoPickContextRefsInput): Ipc.ChapterContextRefView[] {
    return autoPickChapterContextRefsRepository(createContextRefRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterOutlinesByProject(projectId: string): Ipc.ChapterOutlineOverviewItem[] {
    return listChapterOutlinesByProjectRepository(createContextRefRepositoryContext(this.createCoreContext()), projectId);
  }

  public listPitsByProject(input: Ipc.PitListByProjectInput): Ipc.StoryPitView[] {
    return listPitsByProjectRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listPitsGroupedByProject(input: Ipc.PitListGroupedByProjectInput): Ipc.PitGroupedByProjectResult {
    return listPitsGroupedByProjectRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listAvailablePitsForChapter(input: Ipc.PitListAvailableForChapterInput): Ipc.StoryPitView[] {
    return listAvailablePitsForChapterRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public createManualPit(input: Ipc.PitCreateManualInput): Ipc.StoryPitView {
    return createManualPitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public updatePit(input: Ipc.PitUpdateInput): Ipc.StoryPitView {
    return updatePitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public deletePit(input: Ipc.PitDeleteInput): Ipc.DeleteResult {
    return deletePitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterCreatedPits(input: Ipc.ChapterListCreatedPitsInput): Ipc.StoryPitView[] {
    return listChapterCreatedPitsRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterResolvedPits(input: Ipc.ChapterListResolvedPitsInput): Ipc.StoryPitView[] {
    return listChapterResolvedPitsRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterPlannedPits(input: Ipc.ChapterListPlannedPitsInput): Ipc.ChapterPitPlanView[] {
    return listChapterPlannedPitsRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public planPitResponse(input: Ipc.ChapterPlanPitResponseInput): Ipc.ChapterPitPlanView[] {
    return planPitResponseRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public unplanPitResponse(input: Ipc.ChapterUnplanPitResponseInput): Ipc.DeleteResult {
    return unplanPitResponseRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterPitReviews(input: Ipc.ChapterListPitReviewsInput): Ipc.ChapterPitReviewView[] {
    return listChapterPitReviewsRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public reviewPitResponse(input: Ipc.ChapterReviewPitResponseInput): Ipc.ChapterPitReviewView {
    return reviewPitResponseRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public clearPitReview(input: Ipc.ChapterClearPitReviewInput): Ipc.DeleteResult {
    return clearPitReviewRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listChapterPitCandidates(input: Ipc.ChapterListPitCandidatesInput): Ipc.ChapterPitCandidate[] {
    return listChapterPitCandidatesRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public createPitCandidateManual(input: Ipc.ChapterCreatePitCandidateManualInput): Ipc.ChapterPitCandidate {
    return createPitCandidateManualRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public updatePitCandidate(input: Ipc.ChapterUpdatePitCandidateInput): Ipc.ChapterPitCandidate {
    return updatePitCandidateRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public deletePitCandidate(input: Ipc.ChapterDeletePitCandidateInput): Ipc.DeleteResult {
    return deletePitCandidateRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public reviewPitCandidate(input: Ipc.ChapterReviewPitCandidateInput): Ipc.ChapterPitCandidate {
    return reviewPitCandidateRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public createChapterPit(input: Ipc.ChapterCreatePitInput): Ipc.StoryPitView {
    return createChapterPitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public createChapterPitManual(input: Ipc.ChapterCreatePitManualInput): Ipc.StoryPitView {
    return createChapterPitManualRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public createChapterPitFromSuggestion(input: Ipc.ChapterCreatePitFromSuggestionInput): Ipc.StoryPitView {
    return createChapterPitFromSuggestionRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public applyGeneratedPits(input: Ipc.ChapterApplyGeneratedPitsInput): Ipc.StoryPitView[] {
    return applyGeneratedPitsRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public resolvePit(input: Ipc.ChapterResolvePitInput): Ipc.StoryPitView {
    return resolvePitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public unresolvePit(input: Ipc.ChapterUnresolvePitInput): Ipc.StoryPitView {
    return unresolvePitRepository(createPitRepositoryContext(this.createCoreContext()), input);
  }

  public listCharacters(projectId: string): Ipc.Character[] {
    return listCharactersRepository(createKnowledgeRepositoryContext(this.createCoreContext()), projectId);
  }

  public createCharacter(input: Ipc.CharacterCreateInput): Ipc.Character {
    return createCharacterRepository(createKnowledgeRepositoryContext(this.createCoreContext()), input);
  }

  public getCharacter(characterId: string): Ipc.Character {
    return getCharacterRepository(createKnowledgeRepositoryContext(this.createCoreContext()), characterId);
  }

  public updateCharacter(input: Ipc.CharacterUpdateInput): Ipc.Character {
    return updateCharacterRepository(createKnowledgeRepositoryContext(this.createCoreContext()), input);
  }

  public deleteCharacter(characterId: string): Ipc.DeleteResult {
    return deleteCharacterRepository(createKnowledgeRepositoryContext(this.createCoreContext()), characterId);
  }

  public listCharacterRelationships(input: Ipc.CharacterRelationshipListInput): Ipc.CharacterRelationshipView[] {
    this.getProject(input.projectId);
    const relationships = this.queryAll<{
      id: unknown;
      project_id: unknown;
      character_a_id: unknown;
      character_b_id: unknown;
      current_label: unknown;
      updated_at: unknown;
    }>(
      `SELECT id, project_id, character_a_id, character_b_id, current_label, updated_at
       FROM character_relationships
       WHERE project_id = ?
       ORDER BY updated_at DESC`,
      [input.projectId]
    );
    const events = this.queryAll<{
      id: unknown;
      relationship_id: unknown;
      chapter_id: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
      label: unknown;
      summary: unknown;
      created_at: unknown;
      updated_at: unknown;
    }>(
      `SELECT e.id, e.relationship_id, e.chapter_id, c.index_no AS chapter_index_no, c.title AS chapter_title,
              e.label, e.summary, e.created_at, e.updated_at
       FROM character_relationship_events e
       JOIN character_relationships r ON r.id = e.relationship_id
       LEFT JOIN chapters c ON c.id = e.chapter_id
       WHERE r.project_id = ?
       ORDER BY e.created_at ASC`,
      [input.projectId]
    );
    const eventsByRelationshipId = new Map<string, Ipc.CharacterRelationshipEventView[]>();
    for (const event of events) {
      const relationshipId = String(event.relationship_id);
      const list = eventsByRelationshipId.get(relationshipId) ?? [];
      list.push({
        id: String(event.id),
        relationship_id: relationshipId,
        chapter_id: event.chapter_id === null || event.chapter_id === undefined ? null : String(event.chapter_id),
        chapter_index_no: event.chapter_index_no === null || event.chapter_index_no === undefined ? null : Number(event.chapter_index_no),
        chapter_title: event.chapter_title === null || event.chapter_title === undefined ? null : String(event.chapter_title),
        label: String(event.label ?? ''),
        summary: String(event.summary ?? ''),
        created_at: String(event.created_at),
        updated_at: String(event.updated_at)
      });
      eventsByRelationshipId.set(relationshipId, list);
    }

    return relationships.map((relationship) => {
      const id = String(relationship.id);
      return {
        id,
        project_id: String(relationship.project_id),
        character_a_id: String(relationship.character_a_id),
        character_b_id: String(relationship.character_b_id),
        current_label: String(relationship.current_label ?? ''),
        updated_at: String(relationship.updated_at),
        events: eventsByRelationshipId.get(id) ?? []
      };
    });
  }

  public upsertCharacterRelationship(input: Ipc.CharacterRelationshipUpsertInput): Ipc.CharacterRelationshipView[] {
    const project = this.getProject(input.projectId);
    const characterA = this.getCharacter(input.characterAId);
    const characterB = this.getCharacter(input.characterBId);
    if (characterA.project_id !== project.id || characterB.project_id !== project.id) {
      throw new AppError('VALIDATION_ERROR', 'Characters must belong to the project');
    }
    if (characterA.id === characterB.id) {
      throw new AppError('VALIDATION_ERROR', 'Relationship requires two different characters');
    }
    if (input.chapterId) {
      const chapter = this.getChapter(input.chapterId);
      if (chapter.project_id !== project.id) {
        throw new AppError('VALIDATION_ERROR', 'Chapter must belong to the project');
      }
    }

    const [characterAId, characterBId] = [characterA.id, characterB.id].sort();
    const label = input.label.trim();
    if (!label) {
      return this.listCharacterRelationships({ projectId: project.id });
    }
    const normalizedLabel = normalizeRelationshipLabel(label);
    const summary = input.summary?.trim() ?? '';
    const timestamp = new Date().toISOString();
    let relationship = this.queryOne<{ id: unknown; current_label: unknown }>(
      `SELECT id, current_label FROM character_relationships
       WHERE project_id = ? AND character_a_id = ? AND character_b_id = ?`,
      [project.id, characterAId, characterBId]
    );

    if (!relationship) {
      const id = randomUUID();
      this.run(
        `INSERT INTO character_relationships (id, project_id, character_a_id, character_b_id, current_label, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, project.id, characterAId, characterBId, label, timestamp]
      );
      relationship = { id, current_label: label };
    } else if (normalizeRelationshipLabel(String(relationship.current_label ?? '')) === normalizedLabel) {
      return this.listCharacterRelationships({ projectId: project.id });
    } else {
      this.run('UPDATE character_relationships SET current_label = ?, updated_at = ? WHERE id = ?', [
        label,
        timestamp,
        String(relationship.id)
      ]);
    }

    const relationshipId = String(relationship.id);
    const existingEvent = input.chapterId
      ? this.queryOne<{ id: unknown; label: unknown; summary: unknown }>(
          `SELECT id, label, summary FROM character_relationship_events
           WHERE relationship_id = ? AND chapter_id = ?`,
          [relationshipId, input.chapterId]
        )
      : null;

    if (existingEvent) {
      if (String(existingEvent.label ?? '') !== label || String(existingEvent.summary ?? '') !== summary) {
        this.run(
          `UPDATE character_relationship_events
           SET label = ?, summary = ?, updated_at = ?
           WHERE id = ?`,
          [label, summary, timestamp, String(existingEvent.id)]
        );
      }
    } else {
      this.run(
        `INSERT INTO character_relationship_events (id, relationship_id, chapter_id, label, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), relationshipId, input.chapterId ?? null, label, summary, timestamp, timestamp]
      );
    }

    this.persist();
    return this.listCharacterRelationships({ projectId: project.id });
  }

  public listTimelineEventsByProject(input: Ipc.TimelineEventListByProjectInput): Ipc.TimelineEventView[] {
    this.getProject(input.projectId);
    return this.queryAll<{
      id: unknown;
      project_id: unknown;
      chapter_id: unknown;
      event_type: unknown;
      title: unknown;
      summary: unknown;
      character_names_json: unknown;
      sort_order: unknown;
      source: unknown;
      created_at: unknown;
      updated_at: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
    }>(
      `SELECT e.id, e.project_id, e.chapter_id, e.event_type, e.title, e.summary,
              e.character_names_json, e.sort_order, e.source, e.created_at, e.updated_at,
              c.index_no AS chapter_index_no, c.title AS chapter_title
       FROM timeline_events e
       JOIN chapters c ON c.id = e.chapter_id
       WHERE e.project_id = ? AND c.is_deleted = 0
       ORDER BY c.index_no ASC, e.sort_order ASC, e.created_at ASC`,
      [input.projectId]
    ).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      chapter_id: String(row.chapter_id),
      event_type: String(row.event_type ?? ''),
      title: String(row.title ?? ''),
      summary: String(row.summary ?? ''),
      character_names_json: this.parseStringArray(row.character_names_json),
      sort_order: Number(row.sort_order ?? 0),
      source: (row.source === 'user' ? 'user' : 'ai') as Ipc.TimelineEventSource,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      chapter_index_no: Number(row.chapter_index_no ?? 0),
      chapter_title: String(row.chapter_title ?? '')
    }));
  }

  public replaceChapterTimelineEvents(input: Ipc.TimelineEventReplaceChapterInput): Ipc.TimelineEventView[] {
    const project = this.getProject(input.projectId);
    const chapter = this.getChapter(input.chapterId);
    if (chapter.project_id !== project.id) {
      throw new AppError('VALIDATION_ERROR', 'Chapter must belong to the project');
    }

    const timestamp = new Date().toISOString();
    this.run('DELETE FROM timeline_events WHERE project_id = ? AND chapter_id = ?', [project.id, chapter.id]);
    input.events
      .map((event, index) => ({
        event_type: event.event_type.trim().slice(0, 24),
        title: event.title.trim().slice(0, 120),
        summary: event.summary.trim().slice(0, 500),
        character_names_json: event.character_names_json
          .map((name) => name.trim())
          .filter((name, nameIndex, names) => name.length > 0 && names.indexOf(name) === nameIndex)
          .slice(0, 12),
        sort_order: index
      }))
      .filter((event) => event.title.length > 0 || event.summary.length > 0)
      .forEach((event) => {
        this.run(
          `INSERT INTO timeline_events (
            id, project_id, chapter_id, event_type, title, summary,
            character_names_json, sort_order, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
          [
            randomUUID(),
            project.id,
            chapter.id,
            event.event_type,
            event.title || event.summary.slice(0, 40),
            event.summary,
            JSON.stringify(event.character_names_json),
            event.sort_order,
            timestamp,
            timestamp
          ]
        );
      });

    this.persist();
    return this.listTimelineEventsByProject({ projectId: project.id });
  }

  public listTimelineLayersByProject(input: Ipc.TimelineLayerListByProjectInput): Ipc.TimelineLayerData {
    const events = this.listTimelineEventsByProject({ projectId: input.projectId });
    this.getProject(input.projectId);
    const storyTimes = this.queryAll<{
      id: unknown;
      project_id: unknown;
      chapter_id: unknown;
      time_text: unknown;
      time_type: unknown;
      summary: unknown;
      confidence: unknown;
      source: unknown;
      created_at: unknown;
      updated_at: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
    }>(
      `SELECT t.id, t.project_id, t.chapter_id, t.time_text, t.time_type, t.summary,
              t.confidence, t.source, t.created_at, t.updated_at,
              c.index_no AS chapter_index_no, c.title AS chapter_title
       FROM timeline_story_times t
       JOIN chapters c ON c.id = t.chapter_id
       WHERE t.project_id = ? AND c.is_deleted = 0
       ORDER BY c.index_no ASC, t.updated_at ASC`,
      [input.projectId]
    ).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      chapter_id: String(row.chapter_id),
      time_text: String(row.time_text ?? ''),
      time_type: (row.time_type === 'absolute' || row.time_type === 'relative' ? row.time_type : 'unknown') as Ipc.TimelineStoryTimeType,
      summary: String(row.summary ?? ''),
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      source: (row.source === 'user' ? 'user' : 'ai') as Ipc.TimelineEventSource,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      chapter_index_no: Number(row.chapter_index_no ?? 0),
      chapter_title: String(row.chapter_title ?? '')
    }));

    const chapterSummaries = this.queryAll<{
      id: unknown;
      project_id: unknown;
      chapter_id: unknown;
      summary: unknown;
      confidence: unknown;
      source: unknown;
      created_at: unknown;
      updated_at: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
    }>(
      `SELECT s.id, s.project_id, s.chapter_id, s.summary, s.confidence, s.source, s.created_at, s.updated_at,
              c.index_no AS chapter_index_no, c.title AS chapter_title
       FROM timeline_chapter_summaries s
       JOIN chapters c ON c.id = s.chapter_id
       WHERE s.project_id = ? AND c.is_deleted = 0
       ORDER BY c.index_no ASC, s.updated_at ASC`,
      [input.projectId]
    ).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      chapter_id: String(row.chapter_id),
      summary: String(row.summary ?? ''),
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      source: (row.source === 'user' ? 'user' : 'ai') as Ipc.TimelineEventSource,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      chapter_index_no: Number(row.chapter_index_no ?? 0),
      chapter_title: String(row.chapter_title ?? '')
    }));

    const characterStates = this.queryAll<{
      id: unknown;
      project_id: unknown;
      chapter_id: unknown;
      character_name: unknown;
      mood: unknown;
      goal: unknown;
      stance: unknown;
      physical_state: unknown;
      summary: unknown;
      sort_order: unknown;
      source: unknown;
      created_at: unknown;
      updated_at: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
    }>(
      `SELECT s.id, s.project_id, s.chapter_id, s.character_name, s.mood, s.goal, s.stance,
              s.physical_state, s.summary, s.sort_order, s.source, s.created_at, s.updated_at,
              c.index_no AS chapter_index_no, c.title AS chapter_title
       FROM timeline_character_states s
       JOIN chapters c ON c.id = s.chapter_id
       WHERE s.project_id = ? AND c.is_deleted = 0
       ORDER BY c.index_no ASC, s.sort_order ASC, s.created_at ASC`,
      [input.projectId]
    ).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      chapter_id: String(row.chapter_id),
      character_name: String(row.character_name ?? ''),
      mood: String(row.mood ?? ''),
      goal: String(row.goal ?? ''),
      stance: String(row.stance ?? ''),
      physical_state: String(row.physical_state ?? ''),
      summary: String(row.summary ?? ''),
      sort_order: Number(row.sort_order ?? 0),
      source: (row.source === 'user' ? 'user' : 'ai') as Ipc.TimelineEventSource,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      chapter_index_no: Number(row.chapter_index_no ?? 0),
      chapter_title: String(row.chapter_title ?? '')
    }));

    const foreshadows = this.queryAll<{
      id: unknown;
      project_id: unknown;
      chapter_id: unknown;
      title: unknown;
      status: unknown;
      clue: unknown;
      payoff: unknown;
      summary: unknown;
      sort_order: unknown;
      source: unknown;
      created_at: unknown;
      updated_at: unknown;
      chapter_index_no: unknown;
      chapter_title: unknown;
    }>(
      `SELECT f.id, f.project_id, f.chapter_id, f.title, f.status, f.clue, f.payoff,
              f.summary, f.sort_order, f.source, f.created_at, f.updated_at,
              c.index_no AS chapter_index_no, c.title AS chapter_title
       FROM timeline_foreshadows f
       JOIN chapters c ON c.id = f.chapter_id
       WHERE f.project_id = ? AND c.is_deleted = 0
       ORDER BY c.index_no ASC, f.sort_order ASC, f.created_at ASC`,
      [input.projectId]
    ).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      chapter_id: String(row.chapter_id),
      title: String(row.title ?? ''),
      status: String(row.status ?? ''),
      clue: String(row.clue ?? ''),
      payoff: String(row.payoff ?? ''),
      summary: String(row.summary ?? ''),
      sort_order: Number(row.sort_order ?? 0),
      source: (row.source === 'user' ? 'user' : 'ai') as Ipc.TimelineEventSource,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      chapter_index_no: Number(row.chapter_index_no ?? 0),
      chapter_title: String(row.chapter_title ?? '')
    }));

    return { storyTimes, chapterSummaries, events, characterStates, foreshadows };
  }

  public replaceChapterTimelineLayers(input: Ipc.TimelineLayerReplaceChapterInput): Ipc.TimelineLayerData {
    const project = this.getProject(input.projectId);
    const chapter = this.getChapter(input.chapterId);
    if (chapter.project_id !== project.id) {
      throw new AppError('VALIDATION_ERROR', 'Chapter must belong to the project');
    }

    this.replaceChapterTimelineEvents({
      projectId: project.id,
      chapterId: chapter.id,
      events: input.data.events
    });

    const timestamp = new Date().toISOString();
    this.run('DELETE FROM timeline_story_times WHERE project_id = ? AND chapter_id = ?', [project.id, chapter.id]);
    if (input.data.storyTime) {
      const storyTime = {
        time_text: input.data.storyTime.time_text.trim().slice(0, 120),
        time_type: input.data.storyTime.time_type === 'absolute' || input.data.storyTime.time_type === 'relative' ? input.data.storyTime.time_type : 'unknown',
        summary: input.data.storyTime.summary.trim().slice(0, 500),
        confidence: typeof input.data.storyTime.confidence === 'number' && Number.isFinite(input.data.storyTime.confidence)
          ? Math.max(0, Math.min(1, input.data.storyTime.confidence))
          : null
      };
      if (storyTime.time_text.length > 0 || storyTime.summary.length > 0 || storyTime.time_type !== 'unknown') {
        this.run(
          `INSERT INTO timeline_story_times (
            id, project_id, chapter_id, time_text, time_type, summary, confidence,
            source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
          [
            randomUUID(),
            project.id,
            chapter.id,
            storyTime.time_text,
            storyTime.time_type,
            storyTime.summary,
            storyTime.confidence,
            timestamp,
            timestamp
          ]
        );
      }
    }
    this.run('DELETE FROM timeline_chapter_summaries WHERE project_id = ? AND chapter_id = ?', [project.id, chapter.id]);
    if (input.data.chapterSummary) {
      const chapterSummary = {
        summary: input.data.chapterSummary.summary.trim().slice(0, 800),
        confidence: typeof input.data.chapterSummary.confidence === 'number' && Number.isFinite(input.data.chapterSummary.confidence)
          ? Math.max(0, Math.min(1, input.data.chapterSummary.confidence))
          : null
      };
      if (chapterSummary.summary.length > 0) {
        this.run(
          `INSERT INTO timeline_chapter_summaries (
            id, project_id, chapter_id, summary, confidence, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?)`,
          [
            randomUUID(),
            project.id,
            chapter.id,
            chapterSummary.summary,
            chapterSummary.confidence,
            timestamp,
            timestamp
          ]
        );
      }
    }
    this.run('DELETE FROM timeline_character_states WHERE project_id = ? AND chapter_id = ?', [project.id, chapter.id]);
    input.data.characterStates
      .map((state, index) => ({
        character_name: state.character_name.trim().slice(0, 80),
        mood: state.mood.trim().slice(0, 80),
        goal: state.goal.trim().slice(0, 160),
        stance: state.stance.trim().slice(0, 160),
        physical_state: state.physical_state.trim().slice(0, 160),
        summary: state.summary.trim().slice(0, 500),
        sort_order: index
      }))
      .filter((state) => state.character_name.length > 0 || state.summary.length > 0)
      .forEach((state) => {
        this.run(
          `INSERT INTO timeline_character_states (
            id, project_id, chapter_id, character_name, mood, goal, stance,
            physical_state, summary, sort_order, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
          [
            randomUUID(),
            project.id,
            chapter.id,
            state.character_name || state.summary.slice(0, 24),
            state.mood,
            state.goal,
            state.stance,
            state.physical_state,
            state.summary,
            state.sort_order,
            timestamp,
            timestamp
          ]
        );
      });

    this.run('DELETE FROM timeline_foreshadows WHERE project_id = ? AND chapter_id = ?', [project.id, chapter.id]);
    input.data.foreshadows
      .map((item, index) => ({
        title: item.title.trim().slice(0, 120),
        status: item.status.trim().slice(0, 40),
        clue: item.clue.trim().slice(0, 300),
        payoff: item.payoff.trim().slice(0, 300),
        summary: item.summary.trim().slice(0, 500),
        sort_order: index
      }))
      .filter((item) => item.title.length > 0 || item.summary.length > 0 || item.clue.length > 0)
      .forEach((item) => {
        this.run(
          `INSERT INTO timeline_foreshadows (
            id, project_id, chapter_id, title, status, clue, payoff,
            summary, sort_order, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
          [
            randomUUID(),
            project.id,
            chapter.id,
            item.title || item.summary.slice(0, 40) || item.clue.slice(0, 40),
            item.status,
            item.clue,
            item.payoff,
            item.summary,
            item.sort_order,
            timestamp,
            timestamp
          ]
        );
      });

    this.persist();
    return this.listTimelineLayersByProject({ projectId: project.id });
  }

  public listLoreEntries(projectId: string): Ipc.LoreEntry[] {
    return listLoreEntriesRepository(createKnowledgeRepositoryContext(this.createCoreContext()), projectId);
  }

  public createLoreEntry(input: Ipc.LoreEntryCreateInput): Ipc.LoreEntry {
    return createLoreEntryRepository(createKnowledgeRepositoryContext(this.createCoreContext()), input);
  }

  public getLoreEntry(loreEntryId: string): Ipc.LoreEntry {
    return getLoreEntryRepository(createKnowledgeRepositoryContext(this.createCoreContext()), loreEntryId);
  }

  public updateLoreEntry(input: Ipc.LoreEntryUpdateInput): Ipc.LoreEntry {
    return updateLoreEntryRepository(createKnowledgeRepositoryContext(this.createCoreContext()), input);
  }

  public deleteLoreEntry(loreEntryId: string): Ipc.DeleteResult {
    return deleteLoreEntryRepository(createKnowledgeRepositoryContext(this.createCoreContext()), loreEntryId);
  }

  public listSuggestionsByEntity(input: Ipc.SuggestionListByEntityInput): Ipc.AiSuggestion[] {
    return listSuggestionsByEntityRepository(createSuggestionRepositoryContext(this.createCoreContext()), input);
  }

  public createMockSuggestion(input: Ipc.SuggestionCreateMockInput): Ipc.AiSuggestion {
    return createMockSuggestionRepository(createSuggestionRepositoryContext(this.createCoreContext()), input);
  }

  public applySuggestion(input: Ipc.SuggestionApplyInput): Ipc.SuggestionApplyResult {
    return applySuggestionRepository(createSuggestionRepositoryContext(this.createCoreContext()), input);
  }

  public rejectSuggestion(input: Ipc.SuggestionRejectInput): Ipc.SuggestionRejectResult {
    return rejectSuggestionRepository(createSuggestionRepositoryContext(this.createCoreContext()), input);
  }

  private createLoaderContext(): EntityLoaderContext {
    return {
      queryOne: this.queryOne.bind(this),
      queryAll: this.queryAll.bind(this),
      run: this.run.bind(this),
      persist: this.persist.bind(this)
    };
  }

  private createCoreContext(): DatabaseCoreContext {
    return {
      ...this.createLoaderContext(),
      getProject: this.getProject.bind(this),
      listChapters: this.listChapters.bind(this),
      updateChapter: this.updateChapter.bind(this)
    };
  }

  private async doInit(): Promise<void> {
    const defaultDir = app.getPath('userData');
    const configuredDir = getDataDirectory();

    if (configuredDir && !isDefaultDir(configuredDir)) {
      // Custom location: the database must already be there (we put it there during
      // relocate). Never silently create an empty db at a custom/removable path —
      // that would hide the real data and look like everything was lost.
      await this.openAt(configuredDir, false);
    } else {
      await this.openAt(defaultDir, true);
    }
  }

  // Opens (or, when allowCreate, creates) the database at <dir>/DB_FILENAME and
  // publishes (db, dbPath) together so callers never observe a torn state.
  private async openAt(dir: string, allowCreate: boolean): Promise<void> {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      throw new AppError(
        'INIT_FAILED',
        `数据存放位置不可用：${dir}。请确认该文件夹或磁盘可以访问，或在「设置 → 数据存放位置 → 恢复默认位置」切回默认目录。`
      );
    }

    const targetDb = path.join(dir, DB_FILENAME);
    const factory = await getSqlFactory();
    const exists = fs.existsSync(targetDb);
    if (!exists && !allowCreate) {
      throw new AppError(
        'INIT_FAILED',
        `在数据存放位置找不到数据库文件：${targetDb}。如果它在可移动磁盘或同步盘上，请先连接该位置；或在「设置 → 数据存放位置 → 恢复默认位置」切回默认目录。`
      );
    }

    const db = exists
      ? new factory.Database(new Uint8Array(fs.readFileSync(targetDb)))
      : new factory.Database();

    // Publish db + path as a pair, then run the synchronous bootstrap with no
    // intervening await, so no IPC handler can see a db that doesn't match dbPath.
    this.db = db;
    this.dbPath = targetDb;
    try {
      this.run('PRAGMA foreign_keys = ON;');
      this.bootstrapSchema();
      this.persist();
    } catch (error) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      this.db = null;
      throw error;
    }
  }

  private async withRelocateLock<T>(fn: () => Promise<T>): Promise<T> {
    if (this.relocating) {
      throw new AppError('VALIDATION_ERROR', '正在更改数据存放位置，请稍候再试。');
    }
    this.relocating = true;
    try {
      return await fn();
    } finally {
      this.relocating = false;
    }
  }

  private async moveCurrentTo(targetDir: string): Promise<{ dbPath: string }> {
    await this.init();
    const oldPath = this.dbPath;
    const oldDir = path.dirname(oldPath);
    const targetFinal = path.join(targetDir, DB_FILENAME);

    if (samePath(oldPath, targetFinal)) {
      return { dbPath: oldPath };
    }

    // Flush the latest committed state before copying.
    this.persist();
    fs.mkdirSync(targetDir, { recursive: true });

    // Refuse a folder that already holds a database — moving would overwrite or
    // silently adopt a stale library. Require an empty destination.
    if (fs.existsSync(targetFinal)) {
      throw new AppError(
        'VALIDATION_ERROR',
        '该文件夹里已经有一个数据库文件（novel-ai-studio.db）。请选择一个空文件夹，避免覆盖已有数据。'
      );
    }

    // Copy to a temp name, verify integrity, then atomically rename into place.
    // A failure anywhere here (including a half-written copy from a full/yanked disk)
    // cleans up the temp file and leaves the original untouched.
    const tmpPath = `${targetFinal}.migrating-${Date.now()}`;
    try {
      fs.copyFileSync(oldPath, tmpPath, fs.constants.COPYFILE_EXCL);
      this.verifyMovedCopy(tmpPath, oldPath);
    } catch (error) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        /* ignore */
      }
      throw error;
    }
    fs.renameSync(tmpPath, targetFinal);

    // Switch the live connection to the new location. Persist the setting only AFTER
    // the new database opens; on failure roll back to the still-intact old database.
    this.reset();
    this.initPromise = this.openAt(targetDir, false).catch((error) => {
      this.initPromise = null;
      throw error;
    });
    try {
      await this.initPromise;
    } catch (error) {
      this.reset();
      this.initPromise = this.openAt(oldDir, false).catch((err) => {
        this.initPromise = null;
        throw err;
      });
      await this.initPromise.catch((reopenError) => {
        // The old database is still on disk and init() self-heals on the next call;
        // log so a genuine reattach failure is not silently masked.
        console.error('Failed to reopen old database after a failed relocate:', reopenError);
      });
      try {
        fs.rmSync(targetFinal, { force: true });
      } catch {
        /* ignore */
      }
      throw error;
    }

    setDataDirectory(isDefaultDir(targetDir) ? null : targetDir);

    // The new database is live and the setting is saved — remove the old file.
    try {
      if (fs.existsSync(oldPath) && !samePath(oldPath, targetFinal)) {
        fs.rmSync(oldPath, { force: true });
      }
    } catch (error) {
      console.error('Failed to remove old database after move:', error);
    }

    return { dbPath: this.dbPath };
  }

  // Confirms a freshly copied database file is a complete, valid copy of the source
  // before we trust it (and eventually delete the original).
  private verifyMovedCopy(tmpPath: string, sourcePath: string): void {
    if (fs.statSync(tmpPath).size !== fs.statSync(sourcePath).size) {
      throw new AppError('INTERNAL_ERROR', '复制后的数据库文件大小与原文件不一致，已取消移动，原数据未改动。');
    }
    if (!cachedSqlFactory) {
      throw new AppError('INTERNAL_ERROR', 'SQL 引擎尚未初始化，已取消移动，原数据未改动。');
    }

    const probe = new cachedSqlFactory.Database(new Uint8Array(fs.readFileSync(tmpPath)));
    try {
      const integrity = this.readScalar(probe, 'PRAGMA integrity_check', 'integrity_check');
      if (String(integrity ?? '').toLowerCase() !== 'ok') {
        throw new AppError('INTERNAL_ERROR', '复制后的数据库未通过完整性校验，已取消移动，原数据未改动。');
      }
      const copyCount = this.countRows(probe, 'SELECT COUNT(*) AS n FROM projects');
      if (copyCount !== this.countProjects()) {
        throw new AppError('INTERNAL_ERROR', '复制后的数据条数与原数据库不一致，已取消移动，原数据未改动。');
      }
    } finally {
      probe.close();
    }
  }

  private countProjects(): number {
    const row = this.queryOne<{ n: unknown }>('SELECT COUNT(*) AS n FROM projects');
    return row ? Number(row.n) : 0;
  }

  private countRows(db: SqlJsDatabase, sql: string): number {
    const stmt = db.prepare(sql);
    try {
      if (stmt.step()) {
        return Number((stmt.getAsObject() as { n?: unknown }).n ?? 0);
      }
      return 0;
    } finally {
      stmt.free();
    }
  }

  private readScalar(db: SqlJsDatabase, sql: string, column: string): unknown {
    const stmt = db.prepare(sql);
    try {
      if (stmt.step()) {
        return stmt.getAsObject()[column];
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  private bootstrapSchema(): void {
    initializeSchema({
      run: this.run.bind(this),
      queryOne: this.queryOne.bind(this),
      queryAll: this.queryAll.bind(this)
    });
  }

  private persist(): void {
    // Capture (db, dbPath) as a pair so a concurrent relocate can never export one
    // database into another database's file.
    const db = this.db;
    const dbPath = this.dbPath;
    if (!db || !dbPath) {
      return;
    }
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
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

  private parseStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value !== 'string') {
      return [];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private normalizeChapterRelationshipGraph(value: unknown): Ipc.ChapterRelationshipGraph {
    let raw: unknown = value;
    if (typeof value === 'string') {
      try {
        raw = JSON.parse(value) as unknown;
      } catch {
        raw = null;
      }
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { nodes: [], links: [] };
    }

    const record = raw as Record<string, unknown>;
    const nodes = Array.isArray(record.nodes)
      ? record.nodes
          .map((item): Ipc.ChapterRelationshipGraphNode | null => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return null;
            }
            const node = item as Record<string, unknown>;
            const id = typeof node.id === 'string' ? node.id.trim() : '';
            const name = typeof node.name === 'string' ? node.name.trim() : '';
            if (!id || !name) {
              return null;
            }
            return {
              id,
              name,
              role_type: typeof node.role_type === 'string' ? node.role_type : '',
              summary: typeof node.summary === 'string' ? node.summary : '',
              details: typeof node.details === 'string' ? node.details : ''
            };
          })
          .filter((item): item is Ipc.ChapterRelationshipGraphNode => item !== null)
      : [];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const links = Array.isArray(record.links)
      ? record.links
          .map((item): Ipc.ChapterRelationshipGraphLink | null => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return null;
            }
            const link = item as Record<string, unknown>;
            const id = typeof link.id === 'string' ? link.id.trim() : '';
            const fromId = typeof link.fromId === 'string' ? link.fromId.trim() : '';
            const toId = typeof link.toId === 'string' ? link.toId.trim() : '';
            if (!id || !fromId || !toId || fromId === toId || !nodeIds.has(fromId) || !nodeIds.has(toId)) {
              return null;
            }
            return {
              id,
              fromId,
              toId,
              label: typeof link.label === 'string' ? link.label.trim().slice(0, 8) : '',
              summary: typeof link.summary === 'string' ? link.summary : ''
            };
          })
          .filter((item): item is Ipc.ChapterRelationshipGraphLink => item !== null)
      : [];

    return { nodes, links };
  }
}

export const appDatabase = new AppDatabase();
