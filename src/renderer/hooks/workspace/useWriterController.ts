import { useCallback, useState } from 'react';
import type { AutosaveIntervalSeconds, Chapter, NovelProject } from '../../../shared/ipc';
import type { ChapterEditorState, WriterMode } from '../../types';
import type { WriterPageProps } from '../../pages/WriterPage';

type UseWriterControllerArgs = {
  activeProject: NovelProject | null;
  currentChapter: Chapter | null;
  currentChapterDisplayNumber: number | null;
  editor: ChapterEditorState;
  liveWordCount: number;
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
  autosaveLabel: string;
  saveStatusText: string;
  setWorkspaceView: (view: 'home' | 'studio' | 'codex') => void;
  setSelectedChapterId: (chapterId: string | null) => void;
  setEditor: React.Dispatch<React.SetStateAction<ChapterEditorState>>;
  saveChapterDraft: (reason: 'timer' | 'blur' | 'switch' | 'manual') => Promise<boolean>;
};

export function useWriterController({
  activeProject,
  currentChapter,
  currentChapterDisplayNumber,
  editor,
  liveWordCount,
  autosaveLabel,
  saveStatusText,
  setWorkspaceView,
  setSelectedChapterId,
  setEditor,
  saveChapterDraft
}: UseWriterControllerArgs) {
  const [writerMode, setWriterMode] = useState<WriterMode>('edit');

  const openWriter = useCallback(
    async (chapterId: string, _backTarget: 'home' | 'studio' = 'studio', mode: WriterMode = 'edit') => {
      await saveChapterDraft('switch');
      setWriterMode(mode);
      setSelectedChapterId(chapterId);
      setWorkspaceView('studio');
    },
    [saveChapterDraft, setSelectedChapterId, setWorkspaceView]
  );

  const handleWriterBack = useCallback(() => {
    void (async () => {
      await saveChapterDraft('switch');
      setWorkspaceView('home');
    })();
  }, [saveChapterDraft, setWorkspaceView]);

  const handleWriterTitleChange = useCallback((value: string) => {
    setEditor((prev) => ({ ...prev, title: value }));
  }, [setEditor]);

  const handleWriterContentChange = useCallback((value: string) => {
    setEditor((prev) => ({ ...prev, content: value }));
  }, [setEditor]);

  const handleWriterBlurSave = useCallback(() => {
    void saveChapterDraft('blur');
  }, [saveChapterDraft]);

  const handleEnterEditMode = useCallback(() => {
    setWriterMode('edit');
  }, []);

  const writerPageProps: WriterPageProps = {
    activeProject,
    currentChapter,
    currentChapterDisplayNumber,
    editor,
    liveWordCount,
    writerMode,
    writerBackTarget: 'home',
    autosaveIntervalSeconds: 10,
    saveStatusText,
    autosaveLabel,
    onBack: handleWriterBack,
    onEnterEditMode: handleEnterEditMode,
    onTitleChange: handleWriterTitleChange,
    onContentChange: handleWriterContentChange,
    onBlurSave: handleWriterBlurSave
  };

  return {
    writerMode,
    openWriter,
    writerPageProps,
    handleWriterBack,
    handleEnterEditMode,
    handleWriterTitleChange,
    handleWriterContentChange,
    handleWriterBlurSave
  };
}
