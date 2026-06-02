import type { ReactNode } from 'react';

type ChapterToolbarProps = {
  settingsOpen: boolean;
  settingsMenu: ReactNode;
  onOpenSettings: () => void;
  onScheduleSettingsClose: () => void;
  onCreateChapter: () => void;
};

export function ChapterToolbar({
  settingsOpen,
  settingsMenu,
  onOpenSettings,
  onScheduleSettingsClose,
  onCreateChapter
}: ChapterToolbarProps): JSX.Element {
  return (
    <div className="chapters-header-actions">
      <div className="chapters-menu-anchor" onMouseEnter={onOpenSettings} onMouseLeave={onScheduleSettingsClose}>
        <button
          type="button"
          className="chapters-inline-link chapters-menu-trigger"
          aria-expanded={settingsOpen}
          onClick={onOpenSettings}
        >
          设置
          <span className={`chapters-inline-caret ${settingsOpen ? 'expanded' : ''}`} aria-hidden="true" />
        </button>
        {settingsMenu}
      </div>
      <button type="button" className="home-primary-button chapters-primary-button" onClick={onCreateChapter}>
        新建章节
      </button>
    </div>
  );
}
