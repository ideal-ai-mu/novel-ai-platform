import type { Chapter, Character, LoreEntry, NovelProject } from '../../shared/ipc';
import {
  countWords,
  ensureChapterPitCandidateStatus,
  ensureChapterPitReviewOutcome,
  ensureDotPathList,
  ensureEntitySource,
  ensureStringArray,
  mapChapter,
  mapChapterPitCandidate,
  mapChapterPitPlan,
  mapChapterPitReview,
  mapCharacter,
  mapLoreEntry,
  mapProject,
  mapSuggestion,
  nowIso
} from './mappers';
import {
  defaultContextRefWeight,
  getChapterContextRefOrThrow,
  getChapterOrThrow,
  getCharacterOrThrow,
  getLoreEntryOrThrow,
  getPitCandidateOrThrow,
  getStoryPitOrThrow,
  getStoryPitViewOrThrow,
  getSuggestionOrThrow,
  insertStoryPit,
  listChapterCharacters,
  listChapterContextRefs,
  listChapterLoreEntries,
  listRecentProjects,
  listStoryPits,
  normalizeAutoPickLimit,
  softDeleteChaptersByIds,
  validateContextRefTarget,
  validatePitResolvableForChapter,
  validateProjectEntityIds,
  deleteChapterSuggestions,
  type EntityLoaderContext
} from './entity-loaders';
import { buildMockChapterSuggestion, normalizeChapterPatchValue, parsePatchChanges } from './suggestion-helpers';
import type { ChapterRepositoryContext } from './repositories/chapter-repository';
import type { ContextRefRepositoryContext } from './repositories/context-ref-repository';
import type { KnowledgeRepositoryContext } from './repositories/knowledge-repository';
import type { PitRepositoryContext } from './repositories/pit-repository';
import type { ProjectRepositoryContext } from './repositories/project-repository';
import type { SuggestionRepositoryContext } from './repositories/suggestion-repository';

export type DatabaseCoreContext = EntityLoaderContext & {
  getProject: (projectId: string) => NovelProject;
  listChapters: (projectId: string) => Chapter[];
  updateChapter: (input: import('../../shared/ipc').ChapterUpdateInput) => Chapter;
};

export function createProjectRepositoryContext(deps: DatabaseCoreContext): ProjectRepositoryContext {
  return {
    queryOne: deps.queryOne,
    queryAll: deps.queryAll,
    run: deps.run,
    persist: deps.persist,
    nowIso,
    mapProject,
    deleteChapterSuggestions: (chapterIds) => deleteChapterSuggestions(deps, chapterIds),
    getProject: deps.getProject
  };
}

export function createChapterRepositoryContext(deps: DatabaseCoreContext): ChapterRepositoryContext {
  return {
    queryOne: deps.queryOne,
    queryAll: deps.queryAll,
    run: deps.run,
    persist: deps.persist,
    nowIso,
    countWords,
    ensureStringArray,
    ensureDotPathList,
    mapChapter,
    getChapterOrThrow: (chapterId) => getChapterOrThrow(deps, chapterId),
    softDeleteChaptersByIds: (chapterIds, timestamp) => softDeleteChaptersByIds(deps, chapterIds, timestamp),
    deleteChapterSuggestions: (chapterIds) => deleteChapterSuggestions(deps, chapterIds)
  };
}

export function createContextRefRepositoryContext(deps: DatabaseCoreContext): ContextRefRepositoryContext {
  return {
    queryOne: deps.queryOne,
    run: deps.run,
    persist: deps.persist,
    getProject: deps.getProject,
    getChapterOrThrow: (chapterId) => getChapterOrThrow(deps, chapterId),
    getChapterContextRefOrThrow: (contextRefId) => getChapterContextRefOrThrow(deps, contextRefId),
    listChapterContextRefs: (chapterId) => listChapterContextRefs(deps, chapterId),
    listChapterCharacters: (chapterId) => listChapterCharacters(deps, chapterId),
    listChapterLoreEntries: (chapterId) => listChapterLoreEntries(deps, chapterId),
    listChapters: deps.listChapters,
    ensureStringArray,
    validateProjectEntityIds: (tableName, projectId, ids, label) => validateProjectEntityIds(deps, tableName, projectId, ids, label),
    validateContextRefTarget,
    normalizeAutoPickLimit,
    defaultContextRefWeight
  };
}

export function createPitRepositoryContext(deps: DatabaseCoreContext): PitRepositoryContext {
  return {
    queryOne: deps.queryOne,
    queryAll: deps.queryAll,
    run: deps.run,
    persist: deps.persist,
    nowIso,
    getProject: deps.getProject,
    getChapterOrThrow: (chapterId) => getChapterOrThrow(deps, chapterId),
    getStoryPitOrThrow: (pitId) => getStoryPitOrThrow(deps, pitId),
    getStoryPitViewOrThrow: (pitId) => getStoryPitViewOrThrow(deps, pitId),
    getPitCandidateOrThrow: (candidateId) => getPitCandidateOrThrow(deps, candidateId),
    listStoryPits: (whereClause, params) => listStoryPits(deps, whereClause, params),
    insertStoryPit: (input) => insertStoryPit(deps, input),
    validatePitResolvableForChapter: (chapter, pit) => validatePitResolvableForChapter(deps, chapter, pit),
    ensureStringArray,
    ensureChapterPitReviewOutcome,
    ensureChapterPitCandidateStatus,
    mapChapterPitPlan,
    mapChapterPitReview,
    mapChapterPitCandidate
  };
}

export function createKnowledgeRepositoryContext(deps: DatabaseCoreContext): KnowledgeRepositoryContext {
  return {
    queryAll: deps.queryAll,
    run: deps.run,
    persist: deps.persist,
    nowIso,
    getProject: deps.getProject,
    getCharacterOrThrow: (characterId) => getCharacterOrThrow(deps, characterId),
    getLoreEntryOrThrow: (loreEntryId) => getLoreEntryOrThrow(deps, loreEntryId),
    ensureEntitySource,
    ensureStringArray,
    mapCharacter,
    mapLoreEntry
  };
}

export function createSuggestionRepositoryContext(deps: DatabaseCoreContext): SuggestionRepositoryContext {
  return {
    queryOne: deps.queryOne,
    queryAll: deps.queryAll,
    run: deps.run,
    persist: deps.persist,
    nowIso,
    getChapterOrThrow: (chapterId) => getChapterOrThrow(deps, chapterId),
    getSuggestionOrThrow: (suggestionId) => getSuggestionOrThrow(deps, suggestionId),
    updateChapter: deps.updateChapter,
    mapSuggestion,
    buildMockChapterSuggestion,
    parsePatchChanges,
    normalizeChapterPatchValue
  };
}

export function listRecentProjectsWithContext(
  deps: DatabaseCoreContext,
  limit: number
): Array<{ id: string; title: string; updated_at: string }> {
  return listRecentProjects(deps, limit);
}
