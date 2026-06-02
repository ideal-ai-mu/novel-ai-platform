import { Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { NovelProject } from '../../shared/ipc';
import type { HomeMenu, HomeSection } from '../types';
import { HomeEmptyState } from '../components/home/HomeEmptyState';

const COVER_PALETTES = [
  ['#9f4a3f', '#d9795f', '#2e3150', '#e8d7b8', '#8fc6a2'],
  ['#7f4a45', '#c98168', '#2d3034', '#f0b083', '#3f624f'],
  ['#4c556f', '#9c6f61', '#d9a477', '#252b35', '#d7c2a1'],
  ['#6e3444', '#b85e5b', '#f0c37e', '#1f2630', '#7ea087'],
  ['#403b54', '#8f5f65', '#d98f70', '#25282f', '#d7d0b7']
];

type CoverStyle = CSSProperties & Record<'--cover-bg' | '--cover-a' | '--cover-b' | '--cover-c' | '--cover-d' | '--cover-e' | '--cover-tilt' | '--cover-flow', string>;

function hashText(value: string): number {
  return [...value].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function getProjectCoverStyle(project: NovelProject): CoverStyle {
  const hash = Math.abs(hashText(`${project.id}:${project.title}`));
  const palette = COVER_PALETTES[hash % COVER_PALETTES.length];
  return {
    '--cover-bg': palette[3],
    '--cover-a': palette[0],
    '--cover-b': palette[1],
    '--cover-c': palette[2],
    '--cover-d': palette[3],
    '--cover-e': palette[4],
    '--cover-tilt': `${(hash % 13) - 6}deg`,
    '--cover-flow': `${(hash % 21) - 10}px`
  };
}

function getProjectCoverClass(project: NovelProject): string {
  const hash = Math.abs(hashText(`${project.id}:${project.title}`));
  return `home-book-cover generated cover-template-${hash % 4}`;
}

export type HomePageProps = {
  homeSection: HomeSection;
  projects: NovelProject[];
  deletedProjects: NovelProject[];
  selectedProjectId: string | null;
  activeProject: NovelProject | null;
  homeMenu: HomeMenu;
  projectActionsOpen: boolean;
  renderEntryMenu: (menu: Exclude<HomeMenu, null>) => React.ReactNode;
  onOpenHomeMenu: (menu: Exclude<HomeMenu, null>) => void;
  onScheduleHomeMenuClose: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenStudio: (projectId: string) => void;
  onOpenInspiration: () => void;
  onOpenProjects: () => void;
  onOpenTrash: () => void;
  onDeleteProjectToTrash: (projectId: string) => void;
  onRestoreProject: (projectId: string) => void;
  onDeleteProjectPermanent: (projectId: string, title: string) => void;
  onCreateBook: () => void;
  getProjectCoverText: (project: NovelProject | null) => string;
  formatTime: (value: string) => string;
};

export function HomePage({
  homeSection,
  projects,
  deletedProjects,
  selectedProjectId,
  homeMenu,
  renderEntryMenu,
  onOpenHomeMenu,
  onScheduleHomeMenuClose,
  onSelectProject,
  onOpenStudio,
  onOpenInspiration,
  onOpenProjects,
  onOpenTrash,
  onDeleteProjectToTrash,
  onRestoreProject,
  onDeleteProjectPermanent,
  onCreateBook,
  getProjectCoverText,
  formatTime
}: HomePageProps): JSX.Element {
  // Trash section
  if (homeSection === 'trash') {
    return (
      <section className="home-full-page">
        <header className="home-full-header">
          <div className="home-full-nav">
            <button type="button" className="home-full-nav-btn" onClick={onOpenProjects}>
              ← 返回作品
            </button>
          </div>
          <h1 className="home-full-title">作品回收站</h1>
          <p className="home-full-subtitle">删除的作品会先进入回收站，你可以恢复或永久删除。</p>
        </header>

        <div className="home-full-body">
          {deletedProjects.length === 0 ? (
            <div className="home-empty-hero">
              <div className="home-empty-illustration">⌂</div>
              <h3>当前没有回收作品</h3>
              <p>删除的作品会先进入作品回收，你可以在那里恢复或永久删除。</p>
            </div>
          ) : (
            <div className="home-book-grid">
              {deletedProjects.map((project) => (
                <div key={project.id} className="home-book-card">
                  <div className={`${getProjectCoverClass(project)} deleted`} style={getProjectCoverStyle(project)} aria-label={`${getProjectCoverText(project)}封面`}>
                    <span className="home-cover-band band-a" />
                    <span className="home-cover-band band-b" />
                    <span className="home-cover-band band-c" />
                    <span className="home-cover-band band-d" />
                  </div>
                  <div className="home-book-card-info">
                    <div className="home-book-card-title">{project.title}</div>
                    <div className="home-book-card-meta">删除于 {formatTime(project.deleted_at ?? project.updated_at)}</div>
                    <div className="home-book-card-actions">
                      <button
                        type="button"
                        className="home-book-action-btn primary"
                        onClick={() => onRestoreProject(project.id)}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="home-book-action-btn danger"
                        onClick={() => onDeleteProjectPermanent(project.id, project.title)}
                      >
                        永久删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Main projects section - full page, no sidebar
  return (
    <section className="home-full-page">
      <header className="home-full-header">
        <nav className="home-full-topbar">
          <div className="home-full-brand">小说 AI 工作台</div>
          <div className="home-full-topbar-links">
            <button type="button" className="home-full-topbar-link" onClick={onOpenTrash}>
              回收站
            </button>
          </div>
        </nav>

        <div className="home-full-hero">
          <h1 className="home-full-title">你的小说</h1>
          <p className="home-full-subtitle">选择一部作品继续创作，或创建新的故事。</p>
        </div>
      </header>

      <div className="home-full-body">
        {projects.length === 0 ? (
          <HomeEmptyState
            homeMenu={homeMenu}
            renderEntryMenu={renderEntryMenu}
            onOpenHomeMenu={onOpenHomeMenu}
            onScheduleHomeMenuClose={onScheduleHomeMenuClose}
          />
        ) : (
          <div className="home-book-grid">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`home-book-card ${selectedProjectId === project.id ? 'selected' : ''}`}
                onClick={() => onOpenStudio(project.id)}
              >
                <div className={getProjectCoverClass(project)} style={getProjectCoverStyle(project)} aria-label={`${getProjectCoverText(project)}封面`}>
                  <span className="home-cover-band band-a" />
                  <span className="home-cover-band band-b" />
                  <span className="home-cover-band band-c" />
                  <span className="home-cover-band band-d" />
                </div>
                <div className="home-book-card-info">
                  <div className="home-book-card-row">
                    <div className="home-book-card-title">{project.title}</div>
                    <button
                      type="button"
                      className="home-book-delete-btn"
                      title="删除作品"
                      onClick={(e) => { e.stopPropagation(); onDeleteProjectToTrash(project.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="home-book-card-meta">{formatTime(project.updated_at)}</div>
                </div>
              </div>
            ))}

            <div className="home-book-card add-new" onClick={onCreateBook}>
              <div className="home-book-cover add-new">+</div>
              <div className="home-book-card-info">
                <div className="home-book-card-title">创建新书</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
