import { randomUUID } from 'node:crypto';
import type {
  Chapter,
  ChapterApplyGeneratedPitsInput,
  ChapterClearPitReviewInput,
  ChapterCreatePitCandidateManualInput,
  ChapterCreatePitFromSuggestionInput,
  ChapterCreatePitInput,
  ChapterCreatePitManualInput,
  ChapterDeletePitCandidateInput,
  ChapterListCreatedPitsInput,
  ChapterListPitCandidatesInput,
  ChapterListPitReviewsInput,
  ChapterListPlannedPitsInput,
  ChapterListResolvedPitsInput,
  ChapterPitCandidate,
  ChapterPitCandidateStatus,
  ChapterPitPlan,
  ChapterPitPlanView,
  ChapterPitReview,
  ChapterPitReviewOutcome,
  ChapterPitReviewView,
  ChapterPlanPitResponseInput,
  ChapterResolvePitInput,
  ChapterReviewPitCandidateInput,
  ChapterReviewPitResponseInput,
  ChapterUnplanPitResponseInput,
  ChapterUnresolvePitInput,
  ChapterUpdatePitCandidateInput,
  DeleteResult,
  NovelProject,
  PitCreateManualInput,
  PitDeleteInput,
  PitGroupedByProjectResult,
  PitListAvailableForChapterInput,
  PitListByProjectInput,
  PitListGroupedByProjectInput,
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

export function listPitsGroupedByProjectRepository(context: PitRepositoryContext, input: PitListGroupedByProjectInput): PitGroupedByProjectResult {
  const pits = listPitsByProjectRepository(context, { projectId: input.projectId });
  const chapterGroupsMap = new Map<string, { chapterId: string; index_no: number; title: string; pits: StoryPitView[] }>();
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

export function listAvailablePitsForChapterRepository(context: PitRepositoryContext, input: PitListAvailableForChapterInput): StoryPitView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  return context.listStoryPits(
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

export function listChapterCreatedPitsRepository(context: PitRepositoryContext, input: ChapterListCreatedPitsInput): StoryPitView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  return context.listStoryPits('p.origin_chapter_id = ?', [chapter.id]);
}

export function listChapterResolvedPitsRepository(context: PitRepositoryContext, input: ChapterListResolvedPitsInput): StoryPitView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  return context.listStoryPits('p.resolved_in_chapter_id = ?', [chapter.id]);
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

export function planPitResponseRepository(context: PitRepositoryContext, input: ChapterPlanPitResponseInput): ChapterPitPlanView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const pit = context.getStoryPitOrThrow(input.pitId);
  context.validatePitResolvableForChapter(chapter, pit);

  const existing = context.queryOne<{ id: unknown }>(
    `SELECT id FROM chapter_pit_plans WHERE chapter_id = ? AND pit_id = ?`,
    [chapter.id, pit.id]
  );
  if (!existing) {
    const timestamp = context.nowIso();
    context.run(
      `INSERT INTO chapter_pit_plans (id, chapter_id, pit_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), chapter.id, pit.id, timestamp, timestamp]
    );
    context.persist();
  }

  return listChapterPlannedPitsRepository(context, { chapterId: chapter.id });
}

export function unplanPitResponseRepository(context: PitRepositoryContext, input: ChapterUnplanPitResponseInput): DeleteResult {
  const chapter = context.getChapterOrThrow(input.chapterId);
  context.getStoryPitOrThrow(input.pitId);
  context.run(`DELETE FROM chapter_pit_plans WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, input.pitId]);
  context.run(`DELETE FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, input.pitId]);
  context.persist();
  return { deleted: true };
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

export function clearPitReviewRepository(context: PitRepositoryContext, input: ChapterClearPitReviewInput): DeleteResult {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const pit = context.getStoryPitOrThrow(input.pitId);
  context.run(`DELETE FROM chapter_pit_reviews WHERE chapter_id = ? AND pit_id = ?`, [chapter.id, pit.id]);
  if (pit.resolved_in_chapter_id === chapter.id) {
    context.run(
      `UPDATE story_pits
       SET progress_status = 'unaddressed', status = 'open', resolved_in_chapter_id = NULL, updated_at = ?
       WHERE id = ?`,
      [context.nowIso(), pit.id]
    );
  }
  context.persist();
  return { deleted: true };
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

export function createPitCandidateManualRepository(context: PitRepositoryContext, input: ChapterCreatePitCandidateManualInput): ChapterPitCandidate {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const content = (input.content ?? '').trim();
  if (!content) {
    throw new AppError('VALIDATION_ERROR', 'Pit candidate content is required');
  }
  const timestamp = context.nowIso();
  const id = randomUUID();
  context.run(
    `INSERT INTO chapter_pit_candidates (id, chapter_id, content, status, story_pit_id, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', NULL, ?, ?)`,
    [id, chapter.id, content, timestamp, timestamp]
  );
  context.persist();
  return context.getPitCandidateOrThrow(id);
}

export function updatePitCandidateRepository(context: PitRepositoryContext, input: ChapterUpdatePitCandidateInput): ChapterPitCandidate {
  const current = context.getPitCandidateOrThrow(input.candidateId);
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
      context.run(`UPDATE story_pits SET content = ?, updated_at = ? WHERE id = ?`, [content, context.nowIso(), current.story_pit_id]);
    }
  }
  if (patch.status !== undefined) {
    assign('status', context.ensureChapterPitCandidateStatus(patch.status));
  }
  if (sets.length === 0) {
    return current;
  }
  assign('updated_at', context.nowIso());
  values.push(current.id);
  context.run(`UPDATE chapter_pit_candidates SET ${sets.join(', ')} WHERE id = ?`, values);
  context.persist();
  return context.getPitCandidateOrThrow(current.id);
}

export function deletePitCandidateRepository(context: PitRepositoryContext, input: ChapterDeletePitCandidateInput): DeleteResult {
  const candidate = context.getPitCandidateOrThrow(input.candidateId);
  if (candidate.story_pit_id) {
    context.run(`DELETE FROM story_pits WHERE id = ?`, [candidate.story_pit_id]);
  }
  context.run(`DELETE FROM chapter_pit_candidates WHERE id = ?`, [candidate.id]);
  context.persist();
  return { deleted: true };
}

export function reviewPitCandidateRepository(context: PitRepositoryContext, input: ChapterReviewPitCandidateInput): ChapterPitCandidate {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const candidate = context.getPitCandidateOrThrow(input.candidateId);
  if (candidate.chapter_id !== chapter.id) {
    throw new AppError('VALIDATION_ERROR', 'Candidate does not belong to the current chapter');
  }
  const status = context.ensureChapterPitCandidateStatus(input.status);
  const timestamp = context.nowIso();
  let storyPitId = candidate.story_pit_id;

  if (status === 'confirmed') {
    if (storyPitId) {
      context.run(`UPDATE story_pits SET content = ?, updated_at = ? WHERE id = ?`, [candidate.content, timestamp, storyPitId]);
    } else {
      const created = context.insertStoryPit({
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
    context.run(`DELETE FROM story_pits WHERE id = ?`, [storyPitId]);
    storyPitId = null;
  }

  context.run(
    `UPDATE chapter_pit_candidates
     SET status = ?, story_pit_id = ?, updated_at = ?
     WHERE id = ?`,
    [status, storyPitId, timestamp, candidate.id]
  );
  context.persist();
  return context.getPitCandidateOrThrow(candidate.id);
}

export function createChapterPitRepository(context: PitRepositoryContext, input: ChapterCreatePitInput): StoryPitView {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const content = (input.content ?? '').trim();
  if (!content) {
    throw new AppError('VALIDATION_ERROR', 'Pit content is required');
  }

  return context.insertStoryPit({
    projectId: chapter.project_id,
    type: 'chapter',
    originChapterId: chapter.id,
    creationMethod: 'manual',
    content,
    note: input.note ?? null
  });
}

export function createChapterPitManualRepository(context: PitRepositoryContext, input: ChapterCreatePitManualInput): StoryPitView {
  return createChapterPitRepository(context, {
    chapterId: input.chapterId,
    content: input.content,
    note: input.note ?? null
  });
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

export function applyGeneratedPitsRepository(context: PitRepositoryContext, input: ChapterApplyGeneratedPitsInput): StoryPitView[] {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const candidates = Array.from(
    new Set(
      context.ensureStringArray(input.candidates, 'candidates')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
  if (candidates.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'At least one pit candidate is required');
  }

  context.run('BEGIN');
  try {
    for (const content of candidates) {
      const timestamp = context.nowIso();
      context.run(
        `INSERT INTO story_pits (
           id, project_id, type, origin_chapter_id, creation_method, content, status,
           progress_status, resolved_in_chapter_id, sort_order, note, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), chapter.project_id, 'chapter', chapter.id, 'ai', content, 'open', 'unaddressed', null, null, null, timestamp, timestamp]
      );
    }
    context.run('COMMIT');
  } catch (error) {
    context.run('ROLLBACK');
    throw error;
  }

  context.persist();
  return listChapterCreatedPitsRepository(context, { chapterId: chapter.id });
}

export function resolvePitRepository(context: PitRepositoryContext, input: ChapterResolvePitInput): StoryPitView {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const pit = context.getStoryPitOrThrow(input.pitId);
  context.validatePitResolvableForChapter(chapter, pit);
  context.run(
    `UPDATE story_pits
     SET status = 'resolved', progress_status = 'resolved', resolved_in_chapter_id = ?, updated_at = ?
     WHERE id = ?`,
    [chapter.id, context.nowIso(), pit.id]
  );
  context.persist();
  return context.getStoryPitViewOrThrow(pit.id);
}

export function unresolvePitRepository(context: PitRepositoryContext, input: ChapterUnresolvePitInput): StoryPitView {
  const chapter = context.getChapterOrThrow(input.chapterId);
  const pit = context.getStoryPitOrThrow(input.pitId);
  if (pit.resolved_in_chapter_id !== chapter.id) {
    throw new AppError('VALIDATION_ERROR', 'Pit is not resolved in the current chapter');
  }

  context.run(
    `UPDATE story_pits
     SET status = 'open', progress_status = 'unaddressed', resolved_in_chapter_id = NULL, updated_at = ?
     WHERE id = ?`,
    [context.nowIso(), pit.id]
  );
  context.persist();
  return context.getStoryPitViewOrThrow(pit.id);
}
