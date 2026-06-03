import { randomUUID } from 'node:crypto';
import type {
  Chapter,
  ChapterCreatePitFromSuggestionInput,
  ChapterListPitCandidatesInput,
  ChapterListPitReviewsInput,
  ChapterListPlannedPitsInput,
  ChapterPitCandidate,
  ChapterPitCandidateStatus,
  ChapterPitPlan,
  ChapterPitPlanView,
  ChapterPitReview,
  ChapterPitReviewOutcome,
  ChapterPitReviewView,
  ChapterReviewPitResponseInput,
  DeleteResult,
  NovelProject,
  PitCreateManualInput,
  PitDeleteInput,
  PitListByProjectInput,
  PitUpdateInput,
  StoryPitCreationMethod,
  StoryPitProgressStatus,
  StoryPitStatus,
  StoryPitType,
  StoryPitView
} from '../../../shared/ipc';
import { AppError } from '../errors';

type ChapterPitPlanRow = Record<'id' | 'chapter_id' | 'pit_id' | 'created_at' | 'updated_at', unknown>;
type ChapterPitReviewRow = Record<'id' | 'chapter_id' | 'pit_id' | 'outcome' | 'note' | 'created_at' | 'updated_at', unknown>;
type ChapterPitCandidateRow = Record<'id' | 'chapter_id' | 'content' | 'status' | 'story_pit_id' | 'created_at' | 'updated_at', unknown>;

export type PitRepositoryContext = {
  queryOne: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  queryAll: <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => T[];
  run: (sql: string, params?: unknown[]) => void;
  persist: () => void;
  nowIso: () => string;
  getProject: (projectId: string) => NovelProject;
  getChapterOrThrow: (chapterId: string) => Chapter;
  getStoryPitOrThrow: (pitId: string) => StoryPitView;
  getStoryPitViewOrThrow: (pitId: string) => StoryPitView;
  getPitCandidateOrThrow: (candidateId: string) => ChapterPitCandidate;
  listStoryPits: (whereClause: string, params: unknown[]) => StoryPitView[];
  insertStoryPit: (input: {
    projectId: string;
    type: StoryPitType;
    originChapterId: string | null;
    creationMethod: StoryPitCreationMethod;
    content: string;
    note?: string | null;
  }) => StoryPitView;
  validatePitResolvableForChapter: (chapter: Chapter, pit: StoryPitView) => void;
  ensureStringArray: (value: unknown, fieldName: string) => string[];
  ensureChapterPitReviewOutcome: (outcome: unknown) => ChapterPitReviewOutcome;
  ensureChapterPitCandidateStatus: (status: unknown) => ChapterPitCandidateStatus;
  mapChapterPitPlan: (row: ChapterPitPlanRow) => ChapterPitPlan;
  mapChapterPitReview: (row: ChapterPitReviewRow) => ChapterPitReview;
  mapChapterPitCandidate: (row: ChapterPitCandidateRow) => ChapterPitCandidate;
};

export function listPitsByProjectRepository(context: PitRepositoryContext, input: PitListByProjectInput): StoryPitView[] {
  context.getProject(input.projectId);
  return context.listStoryPits('p.project_id = ?', [input.projectId]);
}

export function createManualPitRepository(context: PitRepositoryContext, input: PitCreateManualInput): StoryPitView {
  context.getProject(input.projectId);
  const content = (input.content ?? '').trim();
  if (!content) {
    throw new AppError('VALIDATION_ERROR', 'Pit content is required');
  }

  return context.insertStoryPit({
    projectId: input.projectId,
    type: 'manual',
    originChapterId: null,
    creationMethod: 'manual',
    content,
    note: input.note ?? null
  });
}

export function updatePitRepository(context: PitRepositoryContext, input: PitUpdateInput): StoryPitView {
  const current = context.getStoryPitOrThrow(input.pitId);
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
    return context.getStoryPitViewOrThrow(current.id);
  }

  assign('updated_at', context.nowIso());
  values.push(current.id);
  context.run(`UPDATE story_pits SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();
  return context.getStoryPitViewOrThrow(current.id);
}

export function deletePitRepository(context: PitRepositoryContext, input: PitDeleteInput): DeleteResult {
  context.getStoryPitOrThrow(input.pitId);
  context.run('DELETE FROM story_pits WHERE id = ?', [input.pitId]);
  context.persist();
  return { deleted: true };
}

export function listChapterPlannedPitsRepository(context: PitRepositoryContext, input: ChapterListPlannedPitsInput): ChapterPitPlanView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const rows = context.queryAll<ChapterPitPlanRow>(
    `SELECT id, chapter_id, pit_id, created_at, updated_at
     FROM chapter_pit_plans
     WHERE chapter_id = ?
     ORDER BY created_at ASC`,
    [chapter.id]
  );
  return rows.map((row) => {
    const plan = context.mapChapterPitPlan(row);
    return {
      ...plan,
      pit: context.getStoryPitViewOrThrow(plan.pit_id)
    };
  });
}

export function listChapterPitReviewsRepository(context: PitRepositoryContext, input: ChapterListPitReviewsInput): ChapterPitReviewView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const rows = context.queryAll<ChapterPitReviewRow>(
    `SELECT id, chapter_id, pit_id, outcome, note, created_at, updated_at
     FROM chapter_pit_reviews
     WHERE chapter_id = ?
     ORDER BY updated_at DESC, created_at ASC`,
    [chapter.id]
  );
  return rows.map((row) => {
    const review = context.mapChapterPitReview(row);
    return {
      ...review,
      pit: context.getStoryPitViewOrThrow(review.pit_id)
    };
  });
}

export function reviewPitResponseRepository(context: PitRepositoryContext, input: ChapterReviewPitResponseInput): ChapterPitReviewView {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const pit = context.getStoryPitOrThrow(input.pitId);
  context.validatePitResolvableForChapter(chapter, pit);
  const outcome = context.ensureChapterPitReviewOutcome(input.outcome);
  const note = input.note === null || input.note === undefined ? null : String(input.note).trim();
  const timestamp = context.nowIso();
  const existing = context.queryOne<{ id: unknown }>(
    `SELECT id FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`,
    [chapter.id, pit.id]
  );

  if (existing) {
    context.run(
      `UPDATE chapter_pit_reviews
       SET outcome = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      [outcome, note, timestamp, String(existing.id)]
    );
  } else {
    context.run(
      `INSERT INTO chapter_pit_reviews (id, chapter_id, pit_id, outcome, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), chapter.id, pit.id, outcome, note, timestamp, timestamp]
    );
  }

  const progressStatus: StoryPitProgressStatus =
    outcome === 'resolved' ? 'resolved' : outcome === 'clear' ? 'clear' : outcome === 'partial' ? 'partial' : 'unaddressed';
  const resolvedInChapterId = outcome === 'resolved' ? chapter.id : pit.resolved_in_chapter_id === chapter.id ? null : pit.resolved_in_chapter_id;
  const status: StoryPitStatus = outcome === 'resolved' ? 'resolved' : resolvedInChapterId ? 'resolved' : 'open';
  context.run(
    `UPDATE story_pits
     SET progress_status = ?, status = ?, resolved_in_chapter_id = ?, updated_at = ?
     WHERE id = ?`,
    [progressStatus, status, resolvedInChapterId, timestamp, pit.id]
  );
  context.persist();

  const review = context.queryOne<ChapterPitReviewRow>(
    `SELECT id, chapter_id, pit_id, outcome, note, created_at, updated_at
     FROM chapter_pit_reviews
     WHERE chapter_id = ? AND pit_id = ?`,
    [chapter.id, pit.id]
  );
  if (!review) {
    throw new AppError('INTERNAL_ERROR', 'Pit review was not saved');
  }
  return {
    ...context.mapChapterPitReview(review),
    pit: context.getStoryPitViewOrThrow(pit.id)
  };
}

export function listChapterPitCandidatesRepository(context: PitRepositoryContext, input: ChapterListPitCandidatesInput): ChapterPitCandidate[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const rows = context.queryAll<ChapterPitCandidateRow>(
    `SELECT id, chapter_id, content, status, story_pit_id, created_at, updated_at
     FROM chapter_pit_candidates
     WHERE chapter_id = ?
     ORDER BY created_at ASC`,
    [chapter.id]
  );
  return rows.map(context.mapChapterPitCandidate);
}

export function createChapterPitFromSuggestionRepository(context: PitRepositoryContext, input: ChapterCreatePitFromSuggestionInput): StoryPitView {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const content = (input.content ?? '').trim();
  if (!content) {
    throw new AppError('VALIDATION_ERROR', 'Pit content is required');
  }

  return context.insertStoryPit({
    projectId: chapter.project_id,
    type: 'chapter',
    originChapterId: chapter.id,
    creationMethod: 'ai',
    content,
    note: input.note ?? null
  });
}
