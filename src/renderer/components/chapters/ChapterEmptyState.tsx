type ChapterEmptyStateVariant = 'empty' | 'search-empty' | 'recycle-empty';

type ChapterEmptyStateProps = {
  variant: ChapterEmptyStateVariant;
};

const EMPTY_STATE_COPY: Record<ChapterEmptyStateVariant, { title: string; description?: string }> = {
  empty: {
    title: '暂无章节内容',
    description: '点击右上角“新建章节”开始写作。'
  },
  'search-empty': {
    title: '没有找到匹配章节',
    description: '试试更短的关键词，或清空搜索后查看。'
  },
  'recycle-empty': {
    title: '当前没有回收章节'
  }
};

export function ChapterEmptyState({ variant }: ChapterEmptyStateProps): JSX.Element {
  const copy = EMPTY_STATE_COPY[variant];

  return (
    <div className="chapters-empty-state">
      <div className="chapters-empty-illustration" aria-hidden="true">
        <span className="chapters-empty-box-base" />
        <span className="chapters-empty-box-lid" />
      </div>
      <p>{copy.title}</p>
      {copy.description ? <span className="chapters-empty-copy">{copy.description}</span> : null}
    </div>
  );
}
