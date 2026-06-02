import { useCallback, useState } from 'react';
import type { AppApi } from '../../../shared/preload-api';
import type { Chapter, IpcResult, NovelProject } from '../../../shared/ipc';
import type { CodexSection, HomeMenu, HomeSection, WorkspaceView, WriterMode } from '../../types';
import type { CreateBookModalProps } from '../../components/modals/CreateBookModal';
import type { InspirationModalProps } from '../../components/modals/InspirationModal';
import type { HomePageProps } from '../../pages/HomePage';

type UseHomeControllerArgs = {
  workspaceView: WorkspaceView;
  projects: NovelProject[];
  deletedProjects: NovelProject[];
  activeProject: NovelProject | null;
  selectedProjectId: string | null;
  chapters: Chapter[];
  totalWordCount: number;
  homeMenu: HomeMenu;
  projectActionsOpen: boolean;
  openHomeMenu: (menu: Exclude<HomeMenu, null>) => void;
  scheduleHomeMenuClose: () => void;
  cancelHomeMenuClose: () => void;
  setHomeMenu: (menu: HomeMenu) => void;
  setSelectedProjectId: (projectId: string | null) => void;
  setSelectedDeletedProjectId: (projectId: string | null) => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  resolveAppApi: () => AppApi | null;
  unwrapResult: <T>(result: IpcResult<T>, onError: (message: string) => void, prefix: string) => Promise<T | null>;
  onFeedback: (message: string) => void;
  customConfirm: (title: string, message: string, danger?: boolean) => Promise<boolean>;
  refreshProjectCollections: () => Promise<void>;
  loadChapters: (projectId: string, preferredChapterId?: string | null) => Promise<Chapter[]>;
  createProjectTitle: string;
  createChapterTitle: string;
  defaultInspirationPrompt: string;
  inspirationTagOptions: string[];
  getProjectCoverText: (project: NovelProject | null) => string;
  formatTime: (value: string) => string;
  openWriter: (chapterId: string, backTarget: 'home' | 'studio', mode?: WriterMode) => Promise<void>;
  openChapterManagement: () => Promise<void>;
  openCodex: (section?: CodexSection) => void;
  resetActiveChapter: () => void;
};

function buildInspirationDraft(tags: string[], prompt: string): string {
  const tagsText = tags.length > 0 ? tags.join(' / ') : '未选择灵感标签';
  const basePrompt = prompt.trim() || '请根据已选灵感标签生成一个适合长篇小说开篇创作的故事方向。';
  return [
    `灵感标签：${tagsText}`,
    '',
    `灵感提示：${basePrompt}`,
    '',
    '建议从主角、初始冲突、世界设定和长线目标四个维度，给出一个可继续展开的新书方向。',
    '如果能落到一句话梗概和一条开篇建议，会更适合直接进入创作。'
  ].join('\n');
}

export function useHomeController({
  workspaceView,
  projects,
  deletedProjects,
  activeProject,
  selectedProjectId,
  chapters,
  totalWordCount,
  homeMenu,
  projectActionsOpen,
  openHomeMenu,
  scheduleHomeMenuClose,
  cancelHomeMenuClose,
  setHomeMenu,
  setSelectedProjectId,
  setSelectedDeletedProjectId,
  setWorkspaceView,
  resolveAppApi,
  unwrapResult,
  onFeedback,
  customConfirm,
  refreshProjectCollections,
  loadChapters,
  createProjectTitle,
  createChapterTitle,
  defaultInspirationPrompt,
  inspirationTagOptions,
  getProjectCoverText,
  formatTime,
  openWriter,
  openChapterManagement,
  openCodex,
  resetActiveChapter
}: UseHomeControllerArgs) {
  const [homeSection, setHomeSection] = useState<HomeSection>('projects');
  const [showCreateBookModal, setShowCreateBookModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [showInspirationModal, setShowInspirationModal] = useState(false);
  const [inspirationTags, setInspirationTags] = useState<string[]>([]);
  const [inspirationPrompt, setInspirationPrompt] = useState('');
  const [inspirationDraft, setInspirationDraft] = useState('');

  const createProjectRecord = useCallback(
    async (title: string, description: string): Promise<NovelProject | null> => {
      const api = resolveAppApi();
      if (!api) {
        onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return null;
      }

      const project = await unwrapResult(
        await api.project.create({ title: title.trim(), description: description.trim() }),
        onFeedback,
        '创建作品失败：'
      );
      if (!project) {
        return null;
      }

      await refreshProjectCollections();
      setSelectedProjectId(project.id);
      onFeedback(`已创建作品：${project.title}`);
      return project;
    },
    [onFeedback, refreshProjectCollections, resolveAppApi, setSelectedProjectId, unwrapResult]
  );

  const createChapterRecord = useCallback(
    async (projectId: string, title: string): Promise<Chapter | null> => {
      const api = resolveAppApi();
      if (!api) {
        onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
        return null;
      }

      const chapter = await unwrapResult(
        await api.chapter.create({ projectId, title: title.trim() || createChapterTitle }),
        onFeedback,
        '创建章节失败：'
      );
      if (!chapter) {
        return null;
      }

      await loadChapters(projectId, chapter.id);
      onFeedback(`已创建章节：${chapter.title}`);
      return chapter;
    },
    [createChapterTitle, loadChapters, onFeedback, resolveAppApi, unwrapResult]
  );

  const renderEntryMenu = useCallback(
    (menu: Exclude<HomeMenu, null>) =>
      homeMenu === menu ? (
        <div className="home-popover-menu">
          <button type="button" className="home-popover-item" onClick={() => { cancelHomeMenuClose(); setHomeMenu(null); setShowCreateBookModal(true); }}>
            <strong>创建书本</strong>
            <span>先建立书名和简介，再继续补充章节与正文内容。</span>
          </button>
        </div>
      ) : null,
    [cancelHomeMenuClose, homeMenu, setHomeMenu]
  );

  const handleCreateProjectSubmit = useCallback(async () => {
    const title = newProjectTitle.trim();
    if (!title) {
      onFeedback('请输入作品标题。');
      return;
    }

    const created = await createProjectRecord(title, newProjectDesc);
    if (!created) {
      return;
    }

    setShowCreateBookModal(false);
    setNewProjectTitle('');
    setNewProjectDesc('');
    setWorkspaceView('studio');
  }, [createProjectRecord, newProjectDesc, newProjectTitle, onFeedback, setWorkspaceView]);

  const handleOpenStudio = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setWorkspaceView('studio');
  }, [setSelectedProjectId, setWorkspaceView]);

  const handleDeleteProjectToTrash = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!await customConfirm('删除作品', `确认删除作品《${project.title}》并移入作品回收吗？`)) {
      return;
    }

    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.project.delete({ projectId: project.id });
    if (!result.ok) {
      onFeedback(`删除作品失败：${result.error.message}`);
      return;
    }

    resetActiveChapter();
    setWorkspaceView('home');
    setHomeSection('projects');
    setSelectedProjectId(null);
    setSelectedDeletedProjectId(null);
    await refreshProjectCollections();
    onFeedback(`已移入作品回收：${project.title}`);
  }, [onFeedback, projects, refreshProjectCollections, resetActiveChapter, resolveAppApi, setSelectedDeletedProjectId, setSelectedProjectId, setWorkspaceView]);

  const handleRestoreProject = useCallback(async (projectId: string) => {
    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.project.restore({ projectId });
    if (!result.ok) {
      onFeedback(`恢复作品失败：${result.error.message}`);
      return;
    }

    await refreshProjectCollections();
    setHomeSection('projects');
    setSelectedProjectId(projectId);
    setSelectedDeletedProjectId(null);
    setWorkspaceView('home');
    onFeedback('作品已恢复。');
  }, [onFeedback, refreshProjectCollections, resolveAppApi, setSelectedDeletedProjectId, setSelectedProjectId, setWorkspaceView]);

  const handleDeleteProjectPermanent = useCallback(async (projectId: string, title: string) => {
    if (!await customConfirm('永久删除', `确认永久删除作品《${title}》？此操作不可恢复。`, true)) {
      return;
    }

    const api = resolveAppApi();
    if (!api) {
      onFeedback('Preload API 不可用，请通过 Electron 启动应用。');
      return;
    }

    const result = await api.project.deletePermanent({ projectId });
    if (!result.ok) {
      onFeedback(`永久删除作品失败：${result.error.message}`);
      return;
    }

    await refreshProjectCollections();
    onFeedback(`已永久删除：${title}`);
  }, [onFeedback, refreshProjectCollections, resolveAppApi]);

  const handleToggleInspirationTag = useCallback((tag: string) => {
    setInspirationTags((prev) => (prev.includes(tag) ? prev.filter((item) => tag !== item) : [...prev, tag]));
  }, []);

  const handleGenerateInspiration = useCallback(() => {
    setInspirationDraft(buildInspirationDraft(inspirationTags, inspirationPrompt || defaultInspirationPrompt));
  }, [defaultInspirationPrompt, inspirationPrompt, inspirationTags]);

  const handleUseInspirationForBook = useCallback(() => {
    setShowInspirationModal(false);
    setShowCreateBookModal(true);
    if (inspirationDraft.trim()) {
      setNewProjectDesc(inspirationDraft.trim());
    }
  }, [inspirationDraft]);

  const handleSelectProject = useCallback((projectId: string) => {
    setWorkspaceView('home');
    setHomeSection('projects');
    setSelectedProjectId(projectId);
  }, [setSelectedProjectId, setWorkspaceView]);

  const handleOpenInspiration = useCallback(() => {
    setShowInspirationModal(true);
  }, []);

  const handleCreateBook = useCallback(() => {
    setShowCreateBookModal(true);
  }, []);

  const homePageProps: HomePageProps = {
    homeSection,
    projects,
    deletedProjects,
    selectedProjectId,
    activeProject,
    homeMenu,
    projectActionsOpen,
    renderEntryMenu,
    onOpenHomeMenu: openHomeMenu,
    onScheduleHomeMenuClose: scheduleHomeMenuClose,
    onSelectProject: handleSelectProject,
    onOpenStudio: handleOpenStudio,
    onOpenInspiration: handleOpenInspiration,
    onOpenProjects: () => {
      setHomeSection('projects');
      setSelectedDeletedProjectId(null);
      setWorkspaceView('home');
    },
    onOpenTrash: () => {
      setHomeSection('trash');
    },
    onDeleteProjectToTrash: handleDeleteProjectToTrash,
    onRestoreProject: (projectId) => void handleRestoreProject(projectId),
    onDeleteProjectPermanent: (projectId, title) => void handleDeleteProjectPermanent(projectId, title),
    onCreateBook: handleCreateBook,
    getProjectCoverText,
    formatTime
  };

  const createBookModalProps: CreateBookModalProps = {
    title: newProjectTitle,
    description: newProjectDesc,
    onTitleChange: setNewProjectTitle,
    onDescriptionChange: setNewProjectDesc,
    onClose: () => setShowCreateBookModal(false),
    onSubmit: () => void handleCreateProjectSubmit()
  };

  const inspirationModalProps: InspirationModalProps = {
    tagOptions: inspirationTagOptions,
    selectedTags: inspirationTags,
    prompt: inspirationPrompt,
    draft: inspirationDraft,
    onToggleTag: handleToggleInspirationTag,
    onPromptChange: setInspirationPrompt,
    onDraftChange: setInspirationDraft,
    onGenerate: handleGenerateInspiration,
    onClose: () => setShowInspirationModal(false),
    onUseForBook: handleUseInspirationForBook
  };

  return {
    homeSection,
    showCreateBookModal,
    showInspirationModal,
    homePageProps,
    createBookModalProps,
    inspirationModalProps
  };
}
