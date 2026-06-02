import type { Chapter } from '../../../shared/ipc';

type ChapterRecycleRowProps = {
  chapter: Chapter;
  title: string;
  formatTime: (value: string) => string;
  onRestoreChapter: (chapterId: string, title: string) => void;
  onDeleteChapterPermanent: (chapterId: string, title: string) => void;
};

export function ChapterRecycleRow({
  chapter,
  title,
  formatTime,
  onRestoreChapter,
  onDeleteChapterPermanent
}: ChapterRecycleRowProps): JSX.Element {
  return (
    <article className="chapter-row recycle-row">
      <div className="chapter-row-title static">{title}</div>
      <span className="chapter-row-meta">{chapter.word_count} 字</span>
      <time className="chapter-row-time">{formatTime(chapter.deleted_at ?? chapter.updated_at)}</time>
      <div className="chapter-row-actions" aria-label="回收章节操作">
        <button
          type="button"
          className="chapter-row-inline-action"
          onClick={() => onRestoreChapter(chapter.id, title)}
        >
          恢复
        </button>
        <button
          type="button"
          className="chapter-row-inline-action danger"
          onClick={() => onDeleteChapterPermanent(chapter.id, title)}
        >
          永久删除
        </button>
      </div>
    </article>
  );
}
