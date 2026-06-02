import type { ChapterCollectionTab } from '../../types';

type ChapterTabsProps = {
  activeTab: ChapterCollectionTab;
  onSelectManageTab: () => void;
  onSelectRecycleTab: () => void;
};

export function ChapterTabs({
  activeTab,
  onSelectManageTab,
  onSelectRecycleTab
}: ChapterTabsProps): JSX.Element {
  return (
    <div className="chapters-tabs" role="tablist" aria-label="章节视图切换">
      <button
        type="button"
        className={`chapters-tab ${activeTab === 'manage' ? 'active' : 'muted'}`}
        onClick={onSelectManageTab}
      >
        章节管理
      </button>
      <button
        type="button"
        className={`chapters-tab ${activeTab === 'recycle' ? 'active' : 'muted'}`}
        onClick={onSelectRecycleTab}
      >
        章节回收站
      </button>
    </div>
  );
}
