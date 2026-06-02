import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppMenuAction, AppStorageInfo, AutosaveIntervalSeconds } from '../../shared/ipc';

type MenuNode =
  | { kind: 'separator' }
  | { kind: 'item'; label: string; accel?: string; onClick: () => void; checked?: boolean; disabled?: boolean }
  | { kind: 'submenu'; label: string; items: MenuNode[] };

type TopMenu = { label: string; items: MenuNode[] };

const AUTOSAVE_CHOICES: { seconds: AutosaveIntervalSeconds; label: string }[] = [
  { seconds: 0, label: '关闭' },
  { seconds: 5, label: '5 秒' },
  { seconds: 10, label: '10 秒（默认）' },
  { seconds: 30, label: '30 秒' },
  { seconds: 60, label: '60 秒' }
];

function appApi() {
  return typeof window !== 'undefined' ? window.appApi : null;
}

type AppMenuBarProps = {
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
};

export function AppMenuBar({ autosaveIntervalSeconds }: AppMenuBarProps): JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<AppStorageInfo | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpenMenu(null);
    setOpenSubmenu(null);
  }, []);

  const refreshStorageInfo = useCallback(async () => {
    const api = appApi();
    if (!api) {
      return;
    }
    const result = await api.app.getStorageInfo();
    if (result.ok) {
      setStorageInfo(result.data);
    }
  }, []);

  // Load the current data location only when the 设置 menu is opened.
  useEffect(() => {
    if (openMenu === '设置') {
      void refreshStorageInfo();
    }
  }, [openMenu, refreshStorageInfo]);

  // Close on outside click or Escape while a menu is open.
  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu, close]);

  const runAction = useCallback((action: AppMenuAction) => {
    void appApi()?.app.menuAction({ action });
  }, []);

  const setAutosave = useCallback((seconds: AutosaveIntervalSeconds) => {
    void appApi()?.app.setAutosaveInterval({ seconds });
  }, []);

  const menus: TopMenu[] = [
    {
      label: '文件',
      items: [{ kind: 'item', label: '退出', accel: 'Alt+F4', onClick: () => runAction('quit') }]
    },
    {
      label: '编辑',
      items: [
        { kind: 'item', label: '撤销', accel: 'Ctrl+Z', onClick: () => runAction('undo') },
        { kind: 'item', label: '重做', accel: 'Ctrl+Y', onClick: () => runAction('redo') },
        { kind: 'separator' },
        { kind: 'item', label: '剪切', accel: 'Ctrl+X', onClick: () => runAction('cut') },
        { kind: 'item', label: '复制', accel: 'Ctrl+C', onClick: () => runAction('copy') },
        { kind: 'item', label: '粘贴', accel: 'Ctrl+V', onClick: () => runAction('paste') },
        { kind: 'item', label: '全选', accel: 'Ctrl+A', onClick: () => runAction('selectAll') }
      ]
    },
    {
      label: '视图',
      items: [
        { kind: 'item', label: '重新加载', accel: 'Ctrl+R', onClick: () => runAction('reload') },
        { kind: 'item', label: '强制重新加载', accel: 'Ctrl+Shift+R', onClick: () => runAction('forceReload') },
        { kind: 'item', label: '开发者工具', accel: 'F12', onClick: () => runAction('toggleDevTools') },
        { kind: 'separator' },
        { kind: 'item', label: '实际大小', accel: 'Ctrl+0', onClick: () => runAction('resetZoom') },
        { kind: 'item', label: '放大', accel: 'Ctrl+=', onClick: () => runAction('zoomIn') },
        { kind: 'item', label: '缩小', accel: 'Ctrl+-', onClick: () => runAction('zoomOut') },
        { kind: 'separator' },
        { kind: 'item', label: '切换全屏', accel: 'F11', onClick: () => runAction('toggleFullscreen') }
      ]
    },
    {
      label: '窗口',
      items: [
        { kind: 'item', label: '最小化', onClick: () => runAction('minimize') },
        { kind: 'item', label: '关闭窗口', onClick: () => runAction('closeWindow') }
      ]
    },
    {
      label: '设置',
      items: [
        {
          kind: 'submenu',
          label: '自动保存',
          items: AUTOSAVE_CHOICES.map((choice) => ({
            kind: 'item' as const,
            label: choice.label,
            checked: autosaveIntervalSeconds === choice.seconds,
            onClick: () => setAutosave(choice.seconds)
          }))
        },
        {
          kind: 'submenu',
          label: '数据存放位置',
          items: [
            {
              kind: 'item',
              label: storageInfo ? `当前位置：${storageInfo.dbPath}` : '当前位置：（读取中…）',
              disabled: true,
              onClick: () => undefined
            },
            { kind: 'separator' },
            { kind: 'item', label: '更改位置…', onClick: () => void appApi()?.app.changeDataLocation() },
            { kind: 'item', label: '在文件管理器中打开', onClick: () => void appApi()?.app.openDataLocation() },
            {
              kind: 'item',
              label: '恢复默认位置',
              disabled: !storageInfo?.isCustom,
              onClick: () => void appApi()?.app.restoreDefaultLocation()
            }
          ]
        }
      ]
    },
    {
      label: '帮助',
      items: [{ kind: 'item', label: '关于 小说 AI 工作台', onClick: () => runAction('about') }]
    }
  ];

  const handleItem = (item: Extract<MenuNode, { kind: 'item' }>) => {
    if (item.disabled) {
      return;
    }
    item.onClick();
    close();
  };

  const renderNode = (node: MenuNode, key: string): JSX.Element => {
    if (node.kind === 'separator') {
      return <div key={key} className="app-menu-separator" />;
    }
    if (node.kind === 'submenu') {
      const open = openSubmenu === node.label;
      return (
        <div
          key={key}
          className="app-menu-subroot"
          onMouseEnter={() => setOpenSubmenu(node.label)}
          onMouseLeave={() => setOpenSubmenu((current) => (current === node.label ? null : current))}
        >
          <button type="button" className={`app-menu-item app-menu-item-submenu ${open ? 'active' : ''}`}>
            <span className="app-menu-item-check" />
            <span className="app-menu-item-label">{node.label}</span>
            <span className="app-menu-item-arrow">▸</span>
          </button>
          {open ? (
            <div className="app-menu-flyout">
              {node.items.map((child, index) => renderNode(child, `${node.label}-${index}`))}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <button
        key={key}
        type="button"
        className={`app-menu-item ${node.disabled ? 'disabled' : ''}`}
        onClick={() => handleItem(node)}
        disabled={node.disabled}
      >
        <span className="app-menu-item-check">{node.checked ? '✓' : ''}</span>
        <span className="app-menu-item-label">{node.label}</span>
        {node.accel ? <span className="app-menu-item-accel">{node.accel}</span> : null}
      </button>
    );
  };

  return (
    <div className="app-menubar" ref={barRef}>
      {menus.map((menu) => (
        <div key={menu.label} className="app-menubar-root">
          <button
            type="button"
            className={`app-menubar-label ${openMenu === menu.label ? 'active' : ''}`}
            onClick={() => setOpenMenu((current) => (current === menu.label ? null : menu.label))}
            onMouseEnter={() => {
              if (openMenu) {
                setOpenMenu(menu.label);
                setOpenSubmenu(null);
              }
            }}
          >
            {menu.label}
          </button>
          {openMenu === menu.label ? (
            <div className="app-menu-dropdown">
              {menu.items.map((item, index) => renderNode(item, `${menu.label}-${index}`))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
