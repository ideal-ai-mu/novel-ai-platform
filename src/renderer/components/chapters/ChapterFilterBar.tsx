import type { ChapterCollectionTab } from '../../types';

type ChapterFilterBarProps = {
  collectionTab: ChapterCollectionTab;
  chapterSearch: string;
  onSearchChange: (value: string) => void;
};

export function ChapterFilterBar({
  collectionTab,
  chapterSearch,
  onSearchChange
}: ChapterFilterBarProps): JSX.Element {
  return (
    <div className="chapters-toolbar">
      <div className="chapters-toolbar-group">
        {collectionTab === 'manage' ? (
          <div className="chapters-toolbar-label">全部章节</div>
        ) : (
          <div className="chapters-toolbar-label recycle-hint">这里显示已删除章节，可恢复或永久删除。</div>
        )}
      </div>
      <label className="chapters-search-wrap">
        <span className="chapters-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="chapters-search"
          value={chapterSearch}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索章节"
        />
      </label>
    </div>
  );
}
