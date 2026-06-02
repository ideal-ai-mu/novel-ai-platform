import { randomUUID } from 'node:crypto';
import type { DeleteResult, NovelProject, ProjectCreateInput, ProjectUpdateInput } from '../../../shared/ipc';
import { AppError } from '../errors';

type ProjectRow = Record<keyof NovelProject, unknown>;

export type ProjectRepositoryContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  nowIso: () => string;
  mapProject: (row: ProjectRow) => NovelProject;
  deleteChapterSuggestions: (chapterIds: string[]) => void;
  getProject: (projectId: string) => NovelProject;
};

export function listProjectsRepository(context: ProjectRepositoryContext): NovelProject[] {
  const rows = context.queryAll<ProjectRow>(
    `SELECT id, title, description, outline_text, stages_json, created_at, updated_at, source, is_deleted, deleted_at
      FROM novel_projects
     WHERE is_deleted = 0
     ORDER BY updated_at DESC, created_at DESC`
  );

  return rows.map(context.mapProject);
}

export function listDeletedProjectsRepository(context: ProjectRepositoryContext): NovelProject[] {
  const rows = context.queryAll<ProjectRow>(
    `SELECT id, title, description, outline_text, stages_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM novel_projects
     WHERE is_deleted = 1
     ORDER BY deleted_at DESC, updated_at DESC`
  );
  return rows.map(context.mapProject);
}

export function createProjectRepository(context: ProjectRepositoryContext, input: ProjectCreateInput): NovelProject {
  const title = (input.title ?? '').trim();
  if (!title) {
    throw new AppError('VALIDATION_ERROR', 'Project title is required');
  }

  const id = randomUUID();
  const timestamp = context.nowIso();
  const description = input.description ?? '';
  const source = input.source ?? 'user';

  context.run(
    `INSERT INTO novel_projects (id, title, description, outline_text, stages_json, created_at, updated_at, source, is_deleted, deleted_at)
     VALUES (?, ?, ?, '', '[]', ?, ?, ?, 0, NULL)`,
    [id, title, description, timestamp, timestamp, source]
  );
  context.persist();

  const row = context.queryOne<ProjectRow>(
    `SELECT id, title, description, outline_text, stages_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM novel_projects
     WHERE id = ?`,
    [id]
  );

  if (!row) {
    throw new AppError('INTERNAL_ERROR', 'Failed to read created project');
  }

  return context.mapProject(row);
}

export function getProjectRepository(context: ProjectRepositoryContext, projectId: string): NovelProject {
  const row = context.queryOne<ProjectRow>(
    `SELECT id, title, description, outline_text, stages_json, created_at, updated_at, source, is_deleted, deleted_at
     FROM novel_projects
     WHERE id = ?`,
    [projectId]
  );

  if (!row) {
    throw new AppError('NOT_FOUND', 'Project not found');
  }

  return context.mapProject(row);
}

export function updateProjectRepository(context: ProjectRepositoryContext, input: ProjectUpdateInput): NovelProject {
  const existing = context.getProject(input.projectId);
  const title = input.patch.title === undefined ? existing.title : input.patch.title.trim();
  const description = input.patch.description === undefined ? existing.description : input.patch.description;
  const outlineText = input.patch.outline_text === undefined ? existing.outline_text : input.patch.outline_text;
  const stagesJson = input.patch.stages_json === undefined ? existing.stages_json : input.patch.stages_json;

  if (!title) {
    throw new AppError('VALIDATION_ERROR', 'Project title is required');
  }

  const updatedAt = context.nowIso();
  context.run(
    `UPDATE novel_projects
        SET title = ?, description = ?, outline_text = ?, stages_json = ?, updated_at = ?
      WHERE id = ?`,
    [title, description, outlineText, JSON.stringify(stagesJson), updatedAt, input.projectId]
  );
  context.persist();

  return context.getProject(input.projectId);
}

export function deleteProjectRepository(context: ProjectRepositoryContext, projectId: string): DeleteResult {
  context.getProject(projectId);
  const deletedAt = context.nowIso();
  context.run('UPDATE novel_projects SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?', [deletedAt, deletedAt, projectId]);
  context.persist();
  return { deleted: true };
}

export function restoreProjectRepository(context: ProjectRepositoryContext, projectId: string): DeleteResult {
  context.getProject(projectId);
  const restoredAt = context.nowIso();
  context.run('UPDATE novel_projects SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?', [restoredAt, projectId]);
  context.persist();
  return { deleted: true };
}

export function deleteProjectPermanentRepository(context: ProjectRepositoryContext, projectId: string): DeleteResult {
  context.getProject(projectId);

  const chapterIdRows = context.queryAll<{ id: unknown }>('SELECT id FROM chapters WHERE project_id = ?', [projectId]);
  if (chapterIdRows.length > 0) {
    const chapterIds = chapterIdRows.map((row) => String(row.id));
    context.deleteChapterSuggestions(chapterIds);
  }

  context.run('DELETE FROM novel_projects WHERE id = ?', [projectId]);
  context.persist();
  return { deleted: true };
}
