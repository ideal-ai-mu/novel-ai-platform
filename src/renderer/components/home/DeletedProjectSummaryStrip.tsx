import type { NovelProject } from '../../../shared/ipc';

type DeletedProjectSummaryStripProps = {
  project: NovelProject;
  formatTime: (value: string) => string;
  onRestoreProject: (projectId: string) => void;
  onDeleteProjectPermanent: (projectId: string, title: string) => void;
  getProjectCoverText: (project: NovelProject | null) => string;
};

export function DeletedProjectSummaryStrip({
  project,
  formatTime,
  onRestoreProject,
  onDeleteProjectPermanent,
  getProjectCoverText
}: DeletedProjectSummaryStripProps): JSX.Element {
  return (
    <section className="home-project-overview">
      <div className="home-project-strip is-trash">
        <div className="home-work-cover">{getProjectCoverText(project)}</div>
        <div className="home-project-strip-meta">
          <div className="home-project-strip-title">{project.title}</div>
          <p className="home-project-updated">删除时间：{formatTime(project.deleted_at ?? project.updated_at)}</p>
          <div className="home-project-metrics">
            <span>已移入回收站</span>
            <span>{project.deleted_at ? formatTime(project.deleted_at) : '-'}</span>
          </div>
        </div>
        <div className="home-project-strip-actions">
          <button type="button" className="home-link-button strong" onClick={() => onRestoreProject(project.id)}>
            恢复作品
          </button>
          <button type="button" className="home-link-button danger" onClick={() => onDeleteProjectPermanent(project.id, project.title)}>
            永久删除
          </button>
        </div>
      </div>
      <p className="home-project-tipline">
        <span className="home-project-tip-icon trash">⌫</span>
        <span>回收站中的作品不会参与正常创作流程。恢复后会重新出现在左侧作品管理列表中。</span>
      </p>
    </section>
  );
}
