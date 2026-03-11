import type { BuildChapterAiContextInput, ChapterAiContext } from './provider';

function buildPitOriginLabel(input: BuildChapterAiContextInput['resolvedPits'][number]): string {
  if (input.origin_chapter_index_no !== null && input.origin_chapter_title) {
    return `第 ${input.origin_chapter_index_no} 章《${input.origin_chapter_title}》`;
  }
  return '作者手动坑';
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
      createdPits: input.createdPits.map((pit) => ({
        id: pit.id,
        content: pit.content
      })),
      resolvedPits: input.resolvedPits.map((pit) => ({
        id: pit.id,
        content: pit.content,
        originLabel: buildPitOriginLabel(pit)
      }))
    };
  }
}

export const contextAssembler = new ContextAssembler();
