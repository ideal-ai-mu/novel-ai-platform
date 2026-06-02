import { AppMenuBar } from './components/AppMenuBar';
import { ConfirmDialog } from './components/modals/ConfirmDialog';
import { CreateBookModal } from './components/modals/CreateBookModal';
import { InspirationModal } from './components/modals/InspirationModal';
import { HomePage } from './pages/HomePage';
import { StudioPage } from './pages/StudioPage';
import { useWorkspaceController } from './hooks/useWorkspaceController';

export function App(): JSX.Element {
  const controller = useWorkspaceController();
  const isHome = controller.workspaceView === 'home';
  // The menu bar replaces the native OS menu, so it must be present in every state
  // (including the error screen, whose recovery hint points the user at it).
  const menuBar = <AppMenuBar autosaveIntervalSeconds={controller.autosaveIntervalSeconds} />;

  if (controller.initState.phase === 'loading') {
    return (
      <div className="home-full-shell">
        {menuBar}
        <div className="app-screen-state">正在加载应用…</div>
      </div>
    );
  }

  if (controller.initState.phase === 'error') {
    return (
      <div className="home-full-shell">
        {menuBar}
        <div className="app-screen-state">
          <div className="app-screen-card">
            <h2>初始化失败</h2>
            <p>{controller.initState.message}</p>
            <p className="app-screen-hint">
              如果你最近更改过数据存放位置，请点击窗口顶部菜单「设置 → 数据存放位置 → 恢复默认位置」恢复，你的小说数据仍在原来的文件夹中。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-full-shell">
      {menuBar}
      <main className="home-full-main">
        {controller.workspaceView === 'home' ? (
          <HomePage {...controller.homePageProps} />
        ) : null}

        {(controller.workspaceView === 'studio' || controller.workspaceView === 'codex') && controller.studioPageProps ? (
          <StudioPage {...controller.studioPageProps} />
        ) : null}

        {isHome ? (
          <footer className="home-footer-row">
            <span className={`home-alert ${controller.initState.phase}`}>{controller.initStatusText}</span>
            <div className="home-footer-meta">{controller.feedback || `自动保存：${controller.autosaveLabel}`}</div>
          </footer>
        ) : null}
      </main>

      {controller.showCreateBookModal ? <CreateBookModal {...controller.createBookModalProps} /> : null}
      {controller.showInspirationModal ? <InspirationModal {...controller.inspirationModalProps} /> : null}
      {controller.confirmState.open ? (
        <ConfirmDialog
          title={controller.confirmState.title}
          message={controller.confirmState.message}
          danger={controller.confirmState.danger}
          onConfirm={controller.onConfirmOk}
          onCancel={controller.onConfirmCancel}
        />
      ) : null}
    </div>
  );
}
