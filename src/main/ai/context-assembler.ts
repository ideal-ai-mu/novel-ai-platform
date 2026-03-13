import type { BuildChapterAiContextInput, ChapterAiContext } from './provider';

function buildPitOriginLabel(indexNo: number | null, title: string | null): string {
  if (indexNo !== null && title && title.trim().length > 0) {
    return `第 ${indexNo} 章《${title}》`;
  }
  if (indexNo !== null) {
    return `第 ${indexNo} 章`;
  }
  return '作者手动设定';
}

export class ContextAssembler {
  public assembleChapterContext(input: BuildChapterAiContextInput): ChapterAiContext {
    return {
      taskType: input.taskType,
      project: {
        id: input.project.id,
        title: input.project.title,
        description: input.project.description
      },
      chapter: {
        id: input.chapter.id,
        number: input.chapter.index_no,
        title: input.chapter.title,
        goal: input.chapter.goal,
        outlineUser: input.chapter.outline_user,
        planningClues: input.chapter.planning_clues_json,
        foreshadowNotes: input.chapter.foreshadow_notes_json,
        nextHook: input.chapter.next_hook,
        content: input.chapter.content
      },
      linkedCharacters: input.linkedCharacters.map((character) => ({
        id: character.id,
        name: character.name,
        roleType: character.role_type,
        summary: character.summary,
        details: character.details
      })),
      linkedLore: input.linkedLoreEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        type: entry.type,
        summary: entry.summary,
        content: entry.content
      })),
      referenceChapters: input.referenceChapters.map((item) => ({
        id: item.ref_chapter_id,
        number: item.ref_chapter_index_no,
        title: item.ref_chapter_title,
        mode: item.mode,
        outlineUser: item.ref_outline_user,
        updatedAt: item.ref_updated_at
      })),
      plannedPits: input.plannedPits.map((item) => ({
        id: item.id,
        pitId: item.pit.id,
        content: item.pit.content,
        originLabel: buildPitOriginLabel(item.pit.origin_chapter_index_no, item.pit.origin_chapter_title),
        progressStatus: item.pit.progress_status
      })),
      pitReviews: input.pitReviews.map((item) => ({
        id: item.id,
        pitId: item.pit.id,
        content: item.pit.content,
        originLabel: buildPitOriginLabel(item.pit.origin_chapter_index_no, item.pit.origin_chapter_title),
        outcome: item.outcome,
        note: item.note ?? ''
      })),
      pitCandidates: input.pitCandidates.map((item) => ({
        id: item.id,
        content: item.content,
        status: item.status
      }))
    };
  }
}

export const contextAssembler = new ContextAssembler();
