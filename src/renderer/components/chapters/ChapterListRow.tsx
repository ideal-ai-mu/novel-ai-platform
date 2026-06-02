import type { Chapter } from '../../../shared/ipc';

type ChapterListRowProps = {
  chapter: Chapter;
  title: string;
  formatTime: (value: string) => string;
  onOpenReader: (chapterId: string) => void;
  onOpenWriter: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
};

export function ChapterListRow({
  chapter,
  title,
  formatTime,
  onOpenReader,
  onOpenWriter,
  onDeleteChapter
}: ChapterListRowProps): JSX.Element {
  return (
    <article className="chapter-row">
      <button type="button" className="chapter-row-title" onClick={() => onOpenReader(chapter.id)}>
        {title}
      </button>
      <span className="chapter-row-meta">{chapter.word_count} 字</span>
      <time className="chapter-row-time">{formatTime(chapter.updated_at)}</time>
      <div className="chapter-row-actions" aria-label="章节操作">
        <button
          type="button"
          className="chapter-row-icon"
          aria-label={`编辑 ${title}`}
          onClick={() => onOpenWriter(chapter.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          className="chapter-row-icon danger"
          aria-label={`删除 ${title}`}
          onClick={() => onDeleteChapter(chapter.id, title)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
    </article>
  );
}
