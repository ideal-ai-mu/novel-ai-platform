import type { Chapter } from '../../shared/ipc';

export function compareChaptersByOrder(left: Chapter, right: Chapter): number {
  if (left.index_no !== right.index_no) {
    return left.index_no - right.index_no;
  }
  return left.created_at.localeCompare(right.created_at);
}

export function buildChapterDisplayNumbers(chapters: Chapter[]): Map<string, number> {
  const displayNumbers = new Map<string, number>();
  chapters
    .slice()
    .sort(compareChaptersByOrder)
    .forEach((chapter, index) => {
      displayNumbers.set(chapter.id, index + 1);
    });

  return displayNumbers;
}

export function buildRawChapterDisplayNumbers(chapters: Chapter[]): Map<string, number> {
  return new Map(chapters.map((chapter) => [chapter.id, chapter.index_no] as const));
}

export function getChapterDisplayNumber(chapter: Chapter, displayNumbers: Map<string, number>): number {
  return displayNumbers.get(chapter.id) ?? chapter.index_no;
}

export function formatChapterDisplayTitle(chapter: Chapter, displayNumbers: Map<string, number>): string {
  const chapterNumber = getChapterDisplayNumber(chapter, displayNumbers);
  const trimmedTitle = chapter.title.trim();
  return trimmedTitle ? `第${chapterNumber}章：${trimmedTitle}` : `第${chapterNumber}章`;
}
