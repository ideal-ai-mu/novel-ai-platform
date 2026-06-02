import type { RefObject } from 'react';
import type { NovelProject } from '../../../shared/ipc';

type ProjectSummaryStripProps = {
  project: NovelProject;
  activeProjectUpdateText: string;
  chapterCount: number;
  totalWordCount: number;
  activeProjectStatus: string;
  projectActionsOpen: boolean;
  projectActionsRef: RefObject<HTMLDivElement>;
  onOpenProjectActions: () => void;
  onScheduleProjectActionsClose: () => void;
  onToggleProjectActions: () => void;
  onDeleteProjectToTrash: () => void;
  onOpenChapterManagement: () => void;
  onCreateChapter: () => void;
  getProjectCoverText: (project: NovelProject | null) => string;
};

export function ProjectSummaryStrip({
  project,
  activeProjectUpdateText,
  chapterCount,
  totalWordCount,
  activeProjectStatus,
  projectActionsOpen,
  projectActionsRef,
  onOpenProjectActions,
  onScheduleProjectActionsClose,
  onToggleProjectActions,
  onDeleteProjectToTrash,
  onOpenChapterManagement,
  onCreateChapter,
  getProjectCoverText
}: ProjectSummaryStripProps): JSX.Element {
  return (
    <section className="home-project-overview">
      <div className="home-project-strip">
        <div className="home-work-cover">{getProjectCoverText(project)}</div>
        <div className="home-project-strip-meta">
          <div className="home-project-strip-title">{project.title}</div>
          <p className="home-project-updated">最近更新：{activeProjectUpdateText}</p>
          <div className="home-project-metrics">
            <span>{chapterCount} 章</span>
            <span>{totalWordCount} 字</span>
            <span>{activeProjectStatus}</span>
          </div>
        </div>
        <div className="home-project-strip-actions">
          <div
            className="home-project-menu-anchor"
            ref={projectActionsRef}
            onMouseEnter={onOpenProjectActions}
            onMouseLeave={onScheduleProjectActionsClose}
          >
            <button
              type="button"
              className="home-inline-menu-button"
              aria-expanded={projectActionsOpen}
              onClick={onToggleProjectActions}
            >
              作品相关 <span className={`home-inline-caret ${projectActionsOpen ? 'expanded' : ''}`} aria-hidden="true" />
            </button>
            {projectActionsOpen ? (
              <div className="home-project-menu">
                <button type="button" className="home-project-menu-item danger" onClick={onDeleteProjectToTrash}>
                  删除作品
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="home-link-button strong" onClick={onOpenChapterManagement}>
            章节管理
          </button>
          <button type="button" className="home-primary-button home-compact-primary-button" onClick={onCreateChapter}>
            创建章节
          </button>
        </div>
      </div>
      <p className="home-project-tipline">
        <span className="home-project-tip-icon">!</span>
        <span>作品相关入口暂只保留删除作品。章节管理、创建章节继续走当前真实数据链路。</span>
      </p>
    </section>
  );
}
