import type { ReactNode } from 'react';
import type { HomeMenu } from '../../types';

type HomeEmptyStateProps = {
  homeMenu: HomeMenu;
  renderEntryMenu: (menu: Exclude<HomeMenu, null>) => ReactNode;
  onOpenHomeMenu: (menu: Exclude<HomeMenu, null>) => void;
  onScheduleHomeMenuClose: () => void;
};

export function HomeEmptyState({
  homeMenu,
  renderEntryMenu,
  onOpenHomeMenu,
  onScheduleHomeMenuClose
}: HomeEmptyStateProps): JSX.Element {
  return (
    <section className="home-empty-state">
      <div className="home-empty-illustration">✦</div>
      <p>先创建一本新书，开始你的写作。</p>
      <div className="home-empty-actions">
        <div className="home-menu-anchor home-menu-anchor-start" onMouseEnter={() => onOpenHomeMenu('write')} onMouseLeave={onScheduleHomeMenuClose}>
          <button
            type="button"
            className="home-primary-button home-empty-write-button"
            aria-expanded={homeMenu === 'write'}
            onClick={() => onOpenHomeMenu('write')}
          >
            去写作
          </button>
          {renderEntryMenu('write')}
        </div>
      </div>
    </section>
  );
}
