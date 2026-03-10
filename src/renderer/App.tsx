import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AiSuggestion,
  AppInitData,
  Chapter,
  ChapterStatus,
  IpcResult,
  NovelProject
} from '../shared/ipc';

type InitState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: AppInitData }
  | { phase: 'error'; message: string };

function statusText(state: InitState): string {
  if (state.phase === 'loading') {
    return 'app.init: loading';
  }

  if (state.phase === 'error') {
    return `app.init: error (${state.message})`;
  }

  return `app.init: ready (${state.data.topology})`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

export function App(): JSX.Element {
  const [initState, setInitState] = useState<InitState>({ phase: 'loading' });
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [feedback, setFeedback] = useState<string>('');

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const [editorTitle, setEditorTitle] = useState('');
  const [editorStatus, setEditorStatus] = useState<ChapterStatus>('draft');
  const [editorGoal, setEditorGoal] = useState('');
  const [editorOutlineUser, setEditorOutlineUser] = useState('');
  const [editorNextHook, setEditorNextHook] = useState('');
  const [editorContent, setEditorContent] = useState('');

  const loadProjects = useCallback(async () => {
    const result = await window.appApi.project.list();
    if (!result.ok) {
      setFeedback(`加载项目失败: ${result.error.message}`);
      return;
    }

    setProjects(result.data);
    if (result.data.length === 0) {
      setSelectedProjectId(null);
      return;
    }

    setSelectedProjectId((prev) => {
      if (prev && result.data.some((project) => project.id === prev)) {
        return prev;
      }

      return result.data[0].id;
    });
  }, []);

  const loadChapters = useCallback(async (projectId: string) => {
    const result = await window.appApi.chapter.list(projectId);
    if (!result.ok) {
      setFeedback(`加载章节失败: ${result.error.message}`);
      return;
    }

    setChapters(result.data);
    if (result.data.length === 0) {
      setSelectedChapterId(null);
      return;
    }

    setSelectedChapterId((prev) => {
      if (prev && result.data.some((chapter) => chapter.id === prev)) {
        return prev;
      }
      return result.data[0].id;
    });
  }, []);

  const loadChapter = useCallback(async (chapterId: string) => {
    const result = await window.appApi.chapter.get(chapterId);
    if (!result.ok) {
      setFeedback(`加载章节详情失败: ${result.error.message}`);
      return;
    }

    setCurrentChapter(result.data);
  }, []);

  const loadSuggestions = useCallback(async (chapterId: string) => {
    const result = await window.appApi.suggestion.listByEntity({
      entityType: 'Chapter',
      entityId: chapterId
    });

    if (!result.ok) {
      setFeedback(`加载建议失败: ${result.error.message}`);
      return;
    }

    setSuggestions(result.data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const result: IpcResult<AppInitData> = await window.appApi.app.init();

        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setInitState({ phase: 'error', message: result.error.message });
          return;
        }

        setInitState({ phase: 'ready', data: result.data });
        await loadProjects();
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'unknown error';
        setInitState({ phase: 'error', message });
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChapters([]);
      setSelectedChapterId(null);
      return;
    }

    void loadChapters(selectedProjectId);
  }, [selectedProjectId, loadChapters]);

  useEffect(() => {
    if (!selectedChapterId) {
      setCurrentChapter(null);
      setSuggestions([]);
      return;
    }

    void loadChapter(selectedChapterId);
    void loadSuggestions(selectedChapterId);
  }, [selectedChapterId, loadChapter, loadSuggestions]);

  useEffect(() => {
    if (!currentChapter) {
      setEditorTitle('');
      setEditorStatus('draft');
      setEditorGoal('');
      setEditorOutlineUser('');
      setEditorNextHook('');
      setEditorContent('');
      return;
    }

    setEditorTitle(currentChapter.title);
    setEditorStatus(currentChapter.status);
    setEditorGoal(currentChapter.goal);
    setEditorOutlineUser(currentChapter.outline_user);
    setEditorNextHook(currentChapter.next_hook);
    setEditorContent(currentChapter.content);
  }, [currentChapter]);

  const onCreateProject = async () => {
    const title = newProjectTitle.trim();
    if (!title) {
      setFeedback('请输入项目标题');
      return;
    }

    const result = await window.appApi.project.create({
      title,
      description: newProjectDesc,
      source: 'user'
    });

    if (!result.ok) {
      setFeedback(`创建项目失败: ${result.error.message}`);
      return;
    }

    setNewProjectTitle('');
    setNewProjectDesc('');
    await loadProjects();
    setSelectedProjectId(result.data.id);
    setFeedback('项目已创建');
  };

  const onCreateChapter = async () => {
    if (!selectedProjectId) {
      setFeedback('请先选择项目');
      return;
    }

    const title = newChapterTitle.trim() || `第 ${chapters.length + 1} 章`;
    const result = await window.appApi.chapter.create({
      projectId: selectedProjectId,
      title,
      status: 'draft',
      source: 'user'
    });

    if (!result.ok) {
      setFeedback(`创建章节失败: ${result.error.message}`);
      return;
    }

    setNewChapterTitle('');
    await loadChapters(selectedProjectId);
    setSelectedChapterId(result.data.id);
    setFeedback('章节已创建');
  };

  const onSaveChapter = async () => {
    if (!currentChapter) {
      setFeedback('请先选择章节');
      return;
    }

    const result = await window.appApi.chapter.update({
      chapterId: currentChapter.id,
      actor: 'user',
      patch: {
        title: editorTitle,
        status: editorStatus,
        goal: editorGoal,
        outline_user: editorOutlineUser,
        next_hook: editorNextHook,
        content: editorContent,
        source: 'user'
      }
    });

    if (!result.ok) {
      setFeedback(`保存章节失败: ${result.error.message}`);
      return;
    }

    setCurrentChapter(result.data);
    if (selectedProjectId) {
      await loadChapters(selectedProjectId);
    }
    setFeedback(`章节已保存（revision: ${result.data.revision}）`);
  };

  const onCreateMockSuggestion = async () => {
    if (!selectedChapterId) {
      setFeedback('请先选择章节');
      return;
    }

    const result = await window.appApi.suggestion.createMock({
      entityType: 'Chapter',
      entityId: selectedChapterId
    });

    if (!result.ok) {
      setFeedback(`创建建议失败: ${result.error.message}`);
      return;
    }

    await loadSuggestions(selectedChapterId);
    setFeedback('Mock 建议已创建');
  };

  const footerText = useMemo(() => statusText(initState), [initState]);
  const canEdit = Boolean(currentChapter);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>Novel AI Studio</h1>
        <span className={`status-pill status-${initState.phase}`}>{footerText}</span>
      </header>

      <main className="columns">
        <section className="panel panel-left">
          <h2>项目 / 章节导航</h2>
          <div className="form-row">
            <input
              value={newProjectTitle}
              onChange={(event) => setNewProjectTitle(event.target.value)}
              placeholder="新项目标题"
            />
            <button onClick={() => void onCreateProject()}>新建项目</button>
          </div>
          <div className="form-row">
            <input
              value={newProjectDesc}
              onChange={(event) => setNewProjectDesc(event.target.value)}
              placeholder="项目简介（可选）"
            />
          </div>

          <div className="list-section">
            <strong>项目列表</strong>
            <div className="list-box">
              {projects.length === 0 && <div className="muted">暂无项目</div>}
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`list-item ${selectedProjectId === project.id ? 'active' : ''}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  {project.title}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <input
              value={newChapterTitle}
              onChange={(event) => setNewChapterTitle(event.target.value)}
              placeholder="新章节标题"
              disabled={!selectedProjectId}
            />
            <button onClick={() => void onCreateChapter()} disabled={!selectedProjectId}>
              新建章节
            </button>
          </div>

          <div className="list-section">
            <strong>章节列表</strong>
            <div className="list-box">
              {chapters.length === 0 && <div className="muted">暂无章节</div>}
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  className={`list-item ${selectedChapterId === chapter.id ? 'active' : ''}`}
                  onClick={() => setSelectedChapterId(chapter.id)}
                >
                  {chapter.index_no}. {chapter.title}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel panel-center">
          <h2>正文编辑区</h2>
          <div className="form-grid">
            <label>
              标题
              <input
                value={editorTitle}
                onChange={(event) => setEditorTitle(event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label>
              状态
              <select
                value={editorStatus}
                onChange={(event) => setEditorStatus(event.target.value as ChapterStatus)}
                disabled={!canEdit}
              >
                <option value="draft">draft</option>
                <option value="review">review</option>
                <option value="final">final</option>
              </select>
            </label>
          </div>

          <label className="block-label">
            本章目标（goal）
            <input
              value={editorGoal}
              onChange={(event) => setEditorGoal(event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <label className="block-label">
            用户大纲（outline_user）
            <textarea
              className="small-textarea"
              value={editorOutlineUser}
              onChange={(event) => setEditorOutlineUser(event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <label className="block-label">
            下一章钩子（next_hook）
            <input
              value={editorNextHook}
              onChange={(event) => setEditorNextHook(event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <label className="block-label">
            正文（content）
            <textarea
              className="editor-placeholder"
              value={editorContent}
              onChange={(event) => setEditorContent(event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <div className="actions">
            <button onClick={() => void onSaveChapter()} disabled={!canEdit}>
              保存章节
            </button>
            {currentChapter && (
              <span className="meta">
                word_count: {currentChapter.word_count} | revision: {currentChapter.revision}
              </span>
            )}
          </div>
        </section>

        <section className="panel panel-right">
          <h2>AI 建议 / 待确认更新</h2>
          <div className="actions">
            <button onClick={() => void onCreateMockSuggestion()} disabled={!selectedChapterId}>
              生成 Mock 建议
            </button>
          </div>
          <div className="list-box">
            {suggestions.length === 0 && <div className="muted">当前章节暂无建议</div>}
            {suggestions.map((suggestion) => (
              <div className="suggestion-item" key={suggestion.id}>
                <strong>{suggestion.summary}</strong>
                <div>kind: {suggestion.kind}</div>
                <div>status: {suggestion.status}</div>
                <div>source: {suggestion.source}</div>
                <div>created: {formatTime(suggestion.created_at)}</div>
              </div>
            ))}
          </div>

          <div className="feedback">{feedback || '就绪'}</div>
          {initState.phase === 'ready' && (
            <div className="meta">
              db: {initState.data.dbPath}
              <br />
              schemaVersion: {initState.data.schemaVersion}
            </div>
          )}
          <div className="meta">
            recentProjects: {initState.phase === 'ready' ? initState.data.recentProjects.length : 0}
          </div>
        </section>
      </main>
    </div>
  );
}
