type ChapterHeaderBarProps = {
  title: string;
  onBack: () => void;
};

export function ChapterHeaderBar({ title, onBack }: ChapterHeaderBarProps): JSX.Element {
  return (
    <header className="chapters-header">
      <div className="chapters-breadcrumb">
        <button type="button" className="chapters-back-link" onClick={onBack} aria-label="返回首页">
          <span className="chapters-back-arrow" aria-hidden="true"></span>
        </button>
        <h2>{title}</h2>
      </div>
    </header>
  );
}
