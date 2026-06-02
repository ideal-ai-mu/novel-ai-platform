import { useCallback, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { AutosaveIntervalSeconds, Chapter, NovelProject } from '../../shared/ipc';
import type { ChapterEditorState, WriterMode } from '../types';
import {
  collapseManuscriptBlankLines,
  getManuscriptParagraphs,
  insertManuscriptParagraphBreak,
  insertManuscriptText
} from '../utils/manuscriptFormat';

export type WriterPageProps = {
  activeProject: NovelProject | null;
  currentChapter: Chapter | null;
  currentChapterDisplayNumber: number | null;
  editor: ChapterEditorState;
  liveWordCount: number;
  writerMode: WriterMode;
  writerBackTarget: string;
  autosaveIntervalSeconds: AutosaveIntervalSeconds;
  saveStatusText: string;
  autosaveLabel: string;
  onBack: () => void;
  onEnterEditMode: () => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onBlurSave: () => void;
};

function formatStatusText(writerMode: WriterMode, autosaveLabel: string, saveStatusText: string) {
  if (writerMode === 'read') {
    return '阅读模式';
  }

  if (saveStatusText.trim()) {
    return saveStatusText;
  }

  return `自动保存：${autosaveLabel}`;
}

function renderReadParagraphs(content: string): JSX.Element[] {
  const paragraphs = getManuscriptParagraphs(content);
  if (!paragraphs.length) {
    return [];
  }

  return paragraphs.map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
  ));
}

export function WriterPage({
  activeProject,
  currentChapter,
  currentChapterDisplayNumber,
  editor,
  liveWordCount,
  writerMode,
  autosaveLabel,
  saveStatusText,
  onBack,
  onEnterEditMode,
  onTitleChange,
  onContentChange,
  onBlurSave
}: WriterPageProps): JSX.Element {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreSelection = useCallback((cursor: number) => {
    window.requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) {
        return;
      }
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  }, []);

  const handleEditorPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }
    event.preventDefault();
    const textarea = event.currentTarget;
    const next = insertManuscriptText(editor.content, textarea.selectionStart, textarea.selectionEnd, pastedText);
    onContentChange(next.value);
    restoreSelection(next.cursor);
  }, [editor.content, onContentChange, restoreSelection]);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const textarea = event.currentTarget;
    const next = insertManuscriptParagraphBreak(editor.content, textarea.selectionStart, textarea.selectionEnd);
    onContentChange(next.value);
    restoreSelection(next.cursor);
  }, [editor.content, onContentChange, restoreSelection]);

  if (!activeProject || !currentChapter) {
    return (
      <section className="writer-workspace writer-workspace-empty">
        <div className="writer-empty-state">
          <h2>未选择章节</h2>
          <p>请先返回章节管理，选择一个章节后再进入阅读或写作。</p>
          <button type="button" className="home-outline-button" onClick={onBack}>
            返回章节管理
          </button>
        </div>
      </section>
    );
  }

  const chapterDisplayNumber = currentChapterDisplayNumber ?? currentChapter.index_no;
  const chapterLabel = `第${chapterDisplayNumber}章`;
  const chapterTitle = editor.title.trim();
  const readParagraphs = renderReadParagraphs(editor.content);

  return (
    <section className={`writer-workspace ${writerMode === 'read' ? 'writer-workspace-read' : ''}`}>
      <header className="writer-header">
        <div className="writer-header-left">
          <button type="button" className="writer-header-back" onClick={onBack} aria-label="返回章节管理">
            <span aria-hidden="true"></span>
          </button>
          <div className="writer-header-copy">
            <div className="writer-bookline">{activeProject.title}</div>
            <div className="writer-subline">
              <span>{chapterLabel}</span>
              <span>{`正文 ${liveWordCount} 字`}</span>
              <span>{formatStatusText(writerMode, autosaveLabel, saveStatusText)}</span>
            </div>
          </div>
        </div>

        <div className="writer-header-actions">
          {writerMode === 'read' ? (
            <button type="button" className="home-primary-button writer-mode-switch" onClick={onEnterEditMode}>
              进入编辑
            </button>
          ) : null}
          <div className="writer-save-state">{writerMode === 'read' ? '阅读模式' : saveStatusText || '已保存'}</div>
        </div>
      </header>

      <div className="writer-stage">
        <div className="writer-titleline">
          <span className="writer-title-prefix">第</span>
          <span className="writer-title-number">{chapterDisplayNumber}</span>
          <span className="writer-title-prefix">章</span>
          {writerMode === 'read' ? (
            <span className="writer-title-text">{chapterTitle || '未命名章节'}</span>
          ) : (
            <input
              className="writer-title-input"
              value={editor.title}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={onBlurSave}
              placeholder="请输入标题"
              aria-label="章节标题"
            />
          )}
        </div>

        {writerMode === 'read' ? (
          <div className="writer-reading-content" aria-label="正文">
            {readParagraphs.length > 0 ? readParagraphs : <p className="writer-reading-empty">本章还没有正文。</p>}
          </div>
        ) : (
          <textarea
            ref={editorRef}
            className="writer-content-editor"
            value={editor.content}
            onChange={(event) => onContentChange(collapseManuscriptBlankLines(event.target.value))}
            onKeyDown={handleEditorKeyDown}
            onPaste={handleEditorPaste}
            onBlur={onBlurSave}
            placeholder="开始写正文"
            aria-label="正文"
          />
        )}
      </div>
    </section>
  );
}
