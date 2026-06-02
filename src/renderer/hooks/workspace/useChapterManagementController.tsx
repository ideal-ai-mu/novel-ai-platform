import { useCallback, useMemo, useState } from 'react';
import type { Chapter, Character, LoreEntry, NovelProject } from '../../../shared/ipc';
import type { ChapterCollectionTab, ChaptersMenu } from '../../types';
import type { ChapterManagementPageProps } from '../../pages/ChapterManagementPage';
import {
  buildChapterDisplayNumbers,
  buildRawChapterDisplayNumbers,
  compareChaptersByOrder,
  formatChapterDisplayTitle,
  getChapterDisplayNumber
} from '../../utils/chapterDisplay';

type UseChapterManagementControllerArgs = {
  activeProject: NovelProject | null;
  chapters: Chapter[];
  deletedChapters: Chapter[];
  selectedChapterId: string | null;
  chaptersMenu: ChaptersMenu;
  characters: Character[];
  loreEntries: LoreEntry[];
  setWorkspaceView: (view: 'home' | 'chapters' | 'writer') => void;
  setChaptersMenu: (menu: ChaptersMenu) => void;
  openChaptersMenu: (menu: Exclude<ChaptersMenu, null>) => void;
  scheduleChaptersMenuClose: () => void;
  createChapterFromWorkspace: () => Promise<void>;
  openWriter: (chapterId: string, backTarget: 'home' | 'chapters', mode?: 'read' | 'edit') => Promise<void>;
  deleteChapterById: (chapterId: string, title: string) => Promise<void>;
  restoreChapterById: (chapterId: string, title: string) => Promise<void>;
  deleteChapterPermanentById: (chapterId: string, title: string) => Promise<void>;
  openCodex: () => void;
  formatTime: (value: string) => string;
};

export function useChapterManagementController({
  activeProject,
  chapters,
  deletedChapters,
  selectedChapterId,
  chaptersMenu,
  characters,
  loreEntries,
  setWorkspaceView,
  setChaptersMenu,
  openChaptersMenu,
  scheduleChaptersMenuClose,
  createChapterFromWorkspace,
  openWriter,
  deleteChapterById,
  restoreChapterById,
  deleteChapterPermanentById,
  openCodex,
  formatTime
}: UseChapterManagementControllerArgs) {
  const [chapterCollectionTab, setChapterCollectionTab] = useState<ChapterCollectionTab>('manage');
  const [chapterSearch, setChapterSearch] = useState('');
  const chapterDisplayNumbers = useMemo(() => buildChapterDisplayNumbers(chapters), [chapters]);
  const deletedChapterDisplayNumbers = useMemo(() => buildRawChapterDisplayNumbers(deletedChapters), [deletedChapters]);

  const filteredChapters = useMemo(() => {
    const keyword = chapterSearch.trim().toLowerCase();
    return chapters
      .filter((chapter) => {
        if (!keyword) {
          return true;
        }

        const displayNumber = getChapterDisplayNumber(chapter, chapterDisplayNumbers);
        const haystack = `${displayNumber} 第${displayNumber}章 ${chapter.title} ${chapter.content}`.toLowerCase();
        return haystack.includes(keyword);
      })
      .sort(compareChaptersByOrder);
  }, [chapterDisplayNumbers, chapterSearch, chapters]);

  const filteredDeletedChapters = useMemo(() => {
    const keyword = chapterSearch.trim().toLowerCase();
    return deletedChapters.filter((chapter) => {
      if (!keyword) {
        return true;
      }

      const displayNumber = getChapterDisplayNumber(chapter, deletedChapterDisplayNumbers);
      const haystack = `${displayNumber} 第${displayNumber}章 ${chapter.title} ${chapter.content}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [chapterSearch, deletedChapterDisplayNumbers, deletedChapters]);

  const renderChaptersMenu = useCallback(
    (menu: Exclude<ChaptersMenu, null>) => {
      if (chaptersMenu !== menu) {
        return null;
      }

      return (
        <div className="chapters-inline-menu">
          <button
            type="button"
            className="chapters-inline-menu-item"
            onClick={() => setChaptersMenu(null)}
          >
            基础设置
          </button>
        </div>
      );
    },
    [chaptersMenu, setChaptersMenu]
  );

  const handleCreateChapterFromChapters = useCallback(() => {
    void createChapterFromWorkspace();
  }, [createChapterFromWorkspace]);

  const handleOpenWriterFromChapters = useCallback(
    (chapterId: string) => {
      void openWriter(chapterId, 'chapters', 'edit');
    },
    [openWriter]
  );

  const handleOpenReaderFromChapters = useCallback(
    (chapterId: string) => {
      void openWriter(chapterId, 'chapters', 'read');
    },
    [openWriter]
  );

  const handleDeleteChapter = useCallback(
    (chapterId: string, title: string) => {
      void deleteChapterById(chapterId, title);
    },
    [deleteChapterById]
  );

  const handleRestoreChapter = useCallback(
    (chapterId: string, title: string) => {
      void restoreChapterById(chapterId, title);
    },
    [restoreChapterById]
  );

  const handleDeleteChapterPermanent = useCallback(
    (chapterId: string, title: string) => {
      void deleteChapterPermanentById(chapterId, title);
    },
    [deleteChapterPermanentById]
  );

  const chapterManagementPageProps: ChapterManagementPageProps | null = activeProject
    ? {
        activeProject,
        chapterCollectionTab,
        chaptersMenu,
        selectedChapterId,
        chapterSearch,
        filteredChapters,
        filteredDeletedChapters,
        characters,
        loreEntries,
        renderChaptersMenu,
        formatTime,
        onBackHome: () => setWorkspaceView('home'),
        onSelectManageTab: () => setChapterCollectionTab('manage'),
        onSelectRecycleTab: () => setChapterCollectionTab('recycle'),
        onOpenChaptersMenu: openChaptersMenu,
        onScheduleChaptersMenuClose: scheduleChaptersMenuClose,
        onCreateChapter: handleCreateChapterFromChapters,
        onSearchChange: setChapterSearch,
        formatChapterTitle: (chapter) => formatChapterDisplayTitle(chapter, chapterDisplayNumbers),
        formatDeletedChapterTitle: (chapter) => formatChapterDisplayTitle(chapter, deletedChapterDisplayNumbers),
        onOpenReader: handleOpenReaderFromChapters,
        onOpenWriter: handleOpenWriterFromChapters,
        onDeleteChapter: handleDeleteChapter,
        onRestoreChapter: handleRestoreChapter,
        onDeleteChapterPermanent: handleDeleteChapterPermanent,
        onOpenCodex: openCodex
      }
    : null;

  return {
    chapterCollectionTab,
    chapterSearch,
    chapterManagementPageProps
  };
}
