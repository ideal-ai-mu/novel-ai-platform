import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ChaptersMenu, HomeMenu } from '../../types';

function clearTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function useWorkspaceMenus() {
  const [homeMenu, setHomeMenu] = useState<HomeMenu>(null);
  const [projectActionsOpen, setProjectActionsOpen] = useState(false);
  const [chaptersMenu, setChaptersMenu] = useState<ChaptersMenu>(null);

  const homeMenuCloseTimerRef = useRef<number | null>(null);
  const projectActionsCloseTimerRef = useRef<number | null>(null);
  const chaptersMenuCloseTimerRef = useRef<number | null>(null);
  const projectActionsRef = useRef<HTMLDivElement>(null);

  const cancelHomeMenuClose = useCallback(() => {
    clearTimer(homeMenuCloseTimerRef);
  }, []);

  const scheduleHomeMenuClose = useCallback(() => {
    cancelHomeMenuClose();
    homeMenuCloseTimerRef.current = window.setTimeout(() => {
      setHomeMenu(null);
      homeMenuCloseTimerRef.current = null;
    }, 220);
  }, [cancelHomeMenuClose]);

  const openHomeMenu = useCallback(
    (menu: Exclude<HomeMenu, null>) => {
      cancelHomeMenuClose();
      setHomeMenu(menu);
    },
    [cancelHomeMenuClose]
  );

  const cancelProjectActionsClose = useCallback(() => {
    clearTimer(projectActionsCloseTimerRef);
  }, []);

  const scheduleProjectActionsClose = useCallback(() => {
    cancelProjectActionsClose();
    projectActionsCloseTimerRef.current = window.setTimeout(() => {
      setProjectActionsOpen(false);
      projectActionsCloseTimerRef.current = null;
    }, 180);
  }, [cancelProjectActionsClose]);

  const openProjectActions = useCallback(() => {
    cancelProjectActionsClose();
    setProjectActionsOpen(true);
  }, [cancelProjectActionsClose]);

  const toggleProjectActions = useCallback(() => {
    cancelProjectActionsClose();
    setProjectActionsOpen((prev) => !prev);
  }, [cancelProjectActionsClose]);

  const cancelChaptersMenuClose = useCallback(() => {
    clearTimer(chaptersMenuCloseTimerRef);
  }, []);

  const scheduleChaptersMenuClose = useCallback(() => {
    cancelChaptersMenuClose();
    chaptersMenuCloseTimerRef.current = window.setTimeout(() => {
      setChaptersMenu(null);
      chaptersMenuCloseTimerRef.current = null;
    }, 180);
  }, [cancelChaptersMenuClose]);

  const openChaptersMenu = useCallback(
    (menu: Exclude<ChaptersMenu, null>) => {
      cancelChaptersMenuClose();
      setChaptersMenu(menu);
    },
    [cancelChaptersMenuClose]
  );

  useEffect(() => {
    return () => {
      clearTimer(homeMenuCloseTimerRef);
      clearTimer(projectActionsCloseTimerRef);
      clearTimer(chaptersMenuCloseTimerRef);
    };
  }, []);

  useEffect(() => {
    if (!projectActionsOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && projectActionsRef.current?.contains(target)) {
        return;
      }
      setProjectActionsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [projectActionsOpen]);

  return {
    homeMenu,
    setHomeMenu,
    projectActionsOpen,
    setProjectActionsOpen,
    chaptersMenu,
    setChaptersMenu,
    projectActionsRef,
    cancelHomeMenuClose,
    scheduleHomeMenuClose,
    openHomeMenu,
    scheduleProjectActionsClose,
    openProjectActions,
    toggleProjectActions,
    scheduleChaptersMenuClose,
    openChaptersMenu
  };
}
