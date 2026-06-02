import type { NovelProject } from '../../shared/ipc';
import type { CodexSection } from '../types';

export type SidebarNavProps = {
  homeSection: 'projects' | 'trash';
  projectsExpanded: boolean;
  trashExpanded: boolean;
  projects: NovelProject[];
  deletedProjects: NovelProject[];
  selectedProjectId: string | null;
  selectedDeletedProjectId: string | null;
  formatTime: (value: string) => string;
  onToggleProjectsExpanded: () => void;
  onSelectEmptyProjects: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenInspiration: () => void;
  onToggleTrashExpanded: () => void;
  onSelectEmptyTrash: () => void;
  onSelectDeletedProject: (projectId: string) => void;
  onOpenCodex: (section?: CodexSection) => void;
};

export function SidebarNav({
  homeSection,
  projectsExpanded,
  trashExpanded,
  projects,
  deletedProjects,
  selectedProjectId,
  selectedDeletedProjectId,
  formatTime,
  onToggleProjectsExpanded,
  onSelectEmptyProjects,
  onSelectProject,
  onOpenInspiration,
  onToggleTrashExpanded,
  onSelectEmptyTrash,
  onSelectDeletedProject,
  onOpenCodex
}: SidebarNavProps): JSX.Element {
  return (
    <aside className="home-sidebar">
      <div className="home-sidebar-header">
        <div className="home-brand">小说 AI 工作台</div>
      </div>

      <div className="home-sidebar-list">
        <button type="button" className="home-nav-section" onClick={onToggleProjectsExpanded}>
          <span className="home-nav-label">
            <span className="home-nav-icon home-nav-icon-projects" aria-hidden="true" />
            <span>作品管理</span>
          </span>
          <span className={`home-nav-chevron ${projectsExpanded ? 'expanded' : ''}`} aria-hidden="true" />
        </button>
        {projectsExpanded ? (
          <div className="home-nav-sublist">
            {projects.length === 0 ? (
              <button
                type="button"
                className={`home-nav-empty-item ${homeSection === 'projects' && !selectedProjectId ? 'active' : ''}`}
                onClick={onSelectEmptyProjects}
              >
                创建你的第一本小说
              </button>
            ) : null}
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`home-project-item ${selectedProjectId === project.id && homeSection === 'projects' ? 'active' : ''}`}
                onClick={() => onSelectProject(project.id)}
              >
                <span>{project.title}</span>
                <small>{formatTime(project.updated_at)}</small>
              </button>
            ))}
          </div>
        ) : null}

        <button type="button" className="home-nav-section" onClick={() => onOpenCodex('characters')}>
          <span className="home-nav-label">
            <span className="home-nav-icon home-nav-icon-codex" aria-hidden="true" />
            <span>人物百科</span>
          </span>
        </button>

        <button type="button" className="home-nav-section" onClick={() => onOpenCodex('lore')}>
          <span className="home-nav-label">
            <span className="home-nav-icon home-nav-icon-lore" aria-hidden="true" />
            <span>设定资料</span>
          </span>
        </button>

        <button type="button" className="home-nav-section" onClick={onOpenInspiration}>
          <span className="home-nav-label">
            <span className="home-nav-icon home-nav-icon-inspiration" aria-hidden="true" />
            <span>开书灵感</span>
          </span>
        </button>

        <button type="button" className="home-nav-section" onClick={onToggleTrashExpanded}>
          <span className="home-nav-label">
            <span className="home-nav-icon home-nav-icon-trash" aria-hidden="true" />
            <span>作品回收</span>
          </span>
          <span className={`home-nav-chevron ${trashExpanded ? 'expanded' : ''}`} aria-hidden="true" />
        </button>
        {trashExpanded ? (
          <div className="home-nav-sublist">
            {deletedProjects.length === 0 ? (
              <button
                type="button"
                className={`home-nav-empty-item ${homeSection === 'trash' && !selectedDeletedProjectId ? 'active' : ''}`}
                onClick={onSelectEmptyTrash}
              >
                当前没有回收作品
              </button>
            ) : null}
            {deletedProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`home-project-item ${selectedDeletedProjectId === project.id && homeSection === 'trash' ? 'active' : ''}`}
                onClick={() => onSelectDeletedProject(project.id)}
              >
                <span>{project.title}</span>
                <small>{formatTime(project.deleted_at ?? project.updated_at)}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
