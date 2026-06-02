import { randomUUID } from 'node:crypto';
import type {
  Character,
  CharacterCreateInput,
  CharacterUpdateInput,
  DeleteResult,
  EntitySource,
  LoreEntry,
  LoreEntryCreateInput,
  LoreEntryUpdateInput,
  NovelProject
} from '../../../shared/ipc';
import { AppError } from '../errors';

type CharacterRow = Record<'id' | 'project_id' | 'name' | 'role_type' | 'summary' | 'details' | 'source' | 'created_at' | 'updated_at', unknown>;
type LoreEntryRow = Record<'id' | 'project_id' | 'type' | 'title' | 'summary' | 'content' | 'tags_json' | 'source' | 'created_at' | 'updated_at', unknown>;

export type KnowledgeRepositoryContext = {
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  nowIso: () => string;
  getProject: (projectId: string) => NovelProject;
  getCharacterOrThrow: (characterId: string) => Character;
  getLoreEntryOrThrow: (loreEntryId: string) => LoreEntry;
  ensureEntitySource: (source: unknown) => EntitySource;
  ensureStringArray: (value: unknown, fieldName: string) => string[];
  mapCharacter: (row: CharacterRow) => Character;
  mapLoreEntry: (row: LoreEntryRow) => LoreEntry;
};

export function listCharactersRepository(context: KnowledgeRepositoryContext, projectId: string): Character[] {
  const rows = context.queryAll<CharacterRow>(
    `SELECT id, project_id, name, role_type, summary, details, source, created_at, updated_at
     FROM characters
     WHERE project_id = ?
     ORDER BY updated_at DESC, created_at DESC`,
    [projectId]
  );

  return rows.map(context.mapCharacter);
}

export function createCharacterRepository(context: KnowledgeRepositoryContext, input: CharacterCreateInput): Character {
  context.getProject(input.projectId);
  const name = (input.name ?? '').trim();
  if (!name) {
    throw new AppError('VALIDATION_ERROR', 'Character name is required');
  }

  const id = randomUUID();
  const timestamp = context.nowIso();
  const roleType = input.roleType ?? '';
  const summary = input.summary ?? '';
  const details = input.details ?? '';
  const source = input.source ?? 'user';

  context.run(
    `INSERT INTO characters (id, project_id, name, role_type, summary, details, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.projectId, name, roleType, summary, details, context.ensureEntitySource(source), timestamp, timestamp]
  );
  context.persist();

  return context.getCharacterOrThrow(id);
}

export function getCharacterRepository(context: KnowledgeRepositoryContext, characterId: string): Character {
  return context.getCharacterOrThrow(characterId);
}

export function updateCharacterRepository(context: KnowledgeRepositoryContext, input: CharacterUpdateInput): Character {
  const current = context.getCharacterOrThrow(input.characterId);
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
    assign('source', context.ensureEntitySource(patch.source));
  }

  if (sets.length === 0) {
    return current;
  }

  assign('updated_at', context.nowIso());
  values.push(input.characterId);
  context.run(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();
  return context.getCharacterOrThrow(input.characterId);
}

export function deleteCharacterRepository(context: KnowledgeRepositoryContext, characterId: string): DeleteResult {
  context.getCharacterOrThrow(characterId);
  context.run('DELETE FROM characters WHERE id = ?', [characterId]);
  context.persist();
  return { deleted: true };
}

export function listLoreEntriesRepository(context: KnowledgeRepositoryContext, projectId: string): LoreEntry[] {
  const rows = context.queryAll<LoreEntryRow>(
    `SELECT id, project_id, type, title, summary, content, tags_json, source, created_at, updated_at
     FROM lore_entries
     WHERE project_id = ?
     ORDER BY updated_at DESC, created_at DESC`,
    [projectId]
  );

  return rows.map(context.mapLoreEntry);
}

export function createLoreEntryRepository(context: KnowledgeRepositoryContext, input: LoreEntryCreateInput): LoreEntry {
  context.getProject(input.projectId);
  const type = (input.type ?? '').trim();
  const title = (input.title ?? '').trim();
  if (!type) {
    throw new AppError('VALIDATION_ERROR', 'LoreEntry type is required');
  }
  if (!title) {
    throw new AppError('VALIDATION_ERROR', 'LoreEntry title is required');
  }

  const id = randomUUID();
  const timestamp = context.nowIso();
  const summary = input.summary ?? '';
  const content = input.content ?? '';
  const tags = input.tagsJson ?? [];
  const source = input.source ?? 'user';

  context.run(
    `INSERT INTO lore_entries (id, project_id, type, title, summary, content, tags_json, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.projectId,
      type,
      title,
      summary,
      content,
      JSON.stringify(context.ensureStringArray(tags, 'tagsJson')),
      context.ensureEntitySource(source),
      timestamp,
      timestamp
    ]
  );
  context.persist();

  return context.getLoreEntryOrThrow(id);
}

export function getLoreEntryRepository(context: KnowledgeRepositoryContext, loreEntryId: string): LoreEntry {
  return context.getLoreEntryOrThrow(loreEntryId);
}

export function updateLoreEntryRepository(context: KnowledgeRepositoryContext, input: LoreEntryUpdateInput): LoreEntry {
  const current = context.getLoreEntryOrThrow(input.loreEntryId);
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
    assign('tags_json', JSON.stringify(context.ensureStringArray(patch.tags_json, 'tags_json')));
  }
  if (patch.source !== undefined) {
    assign('source', context.ensureEntitySource(patch.source));
  }

  if (sets.length === 0) {
    return current;
  }

  assign('updated_at', context.nowIso());
  values.push(input.loreEntryId);
  context.run(`UPDATE lore_entries SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();
  return context.getLoreEntryOrThrow(input.loreEntryId);
}

export function deleteLoreEntryRepository(context: KnowledgeRepositoryContext, loreEntryId: string): DeleteResult {
  context.getLoreEntryOrThrow(loreEntryId);
  context.run('DELETE FROM lore_entries WHERE id = ?', [loreEntryId]);
  context.persist();
  return { deleted: true };
}
