import type { ReactNode } from 'react';
import type { HomeMenu, HomeSection } from '../../types';

type HomeHeaderProps = {
  homeSection: HomeSection;
  homeMenu: HomeMenu;
  renderEntryMenu: (menu: Exclude<HomeMenu, null>) => ReactNode;
  onOpenHomeMenu: (menu: Exclude<HomeMenu, null>) => void;
  onScheduleHomeMenuClose: () => void;
};

export function HomeHeader({
  homeSection,
  homeMenu,
  renderEntryMenu,
  onOpenHomeMenu,
  onScheduleHomeMenuClose
}: HomeHeaderProps): JSX.Element {
  const title = homeSection === 'trash' ? '作品回收' : '我的小说';
  const subtitle =
    homeSection === 'trash'
      ? '左侧展开回收作品后，可在这里查看、恢复或永久删除。'
      : '左侧只保留作品管理、开书灵感、作品回收。章节管理仍然进入独立页面。';

  return (
    <header className="home-topbar">
      <div>
        <div className="home-page-eyebrow">{title}</div>
        <p className="home-page-subtitle">{subtitle}</p>
      </div>
      <div className="home-top-actions">
        <div className="home-menu-anchor" onMouseEnter={() => onOpenHomeMenu('create')} onMouseLeave={onScheduleHomeMenuClose}>
          <button
            type="button"
            className="home-top-link-button"
            aria-expanded={homeMenu === 'create'}
            onClick={() => onOpenHomeMenu('create')}
          >
            <span>创建新书</span>
            <span className="home-top-link-badge">+</span>
          </button>
          {renderEntryMenu('create')}
        </div>
      </div>
    </header>
  );
}
