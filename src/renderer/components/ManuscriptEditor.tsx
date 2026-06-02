import { createPortal } from 'react-dom';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  formatManuscriptParagraphs,
  getManuscriptParagraphs,
  stripManuscriptParagraphIndent
} from '../utils/manuscriptFormat';

type ManuscriptEditorProps = {
  value: string;
  className: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onBlurSave: () => void;
  onSelectionTextChange?: (value: string) => void;
};

const PARAGRAPH_CLASS = 'manuscript-editor-paragraph';
type SelectionHighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type CursorAnchorRect = {
  left: number;
  top: number;
  height: number;
};
export type ManuscriptCursorAnchor = {
  offset: number;
  beforeText: string;
  afterText: string;
};

function readEditorContent(element: HTMLDivElement): string {
  const blockTexts = Array.from(element.children)
    .map((child) => stripManuscriptParagraphIndent(child.textContent ?? '').trim())
    .filter(Boolean);

  if (blockTexts.length > 0) {
    return formatManuscriptParagraphs(blockTexts.join('\n'));
  }

  return formatManuscriptParagraphs(element.innerText);
}

function writeEditorContent(element: HTMLDivElement, value: string): void {
  element.replaceChildren();
  const paragraphs = getManuscriptParagraphs(value);
  const visibleParagraphs = paragraphs.length > 0 ? paragraphs : [''];

  visibleParagraphs.forEach((paragraph) => {
    const node = document.createElement('p');
    node.className = PARAGRAPH_CLASS;
    if (paragraph) {
      node.textContent = paragraph;
    } else {
      node.appendChild(document.createElement('br'));
    }
    element.appendChild(node);
  });
}

function insertPlainText(text: string): void {
  document.execCommand('insertText', false, text);
}

function setParagraphContent(paragraph: HTMLParagraphElement, text: string): void {
  paragraph.replaceChildren();
  if (text) {
    paragraph.textContent = text;
    return;
  }
  paragraph.appendChild(document.createElement('br'));
}

function getClosestEditorParagraph(node: Node, editor: HTMLDivElement): HTMLParagraphElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const paragraph = element?.closest<HTMLParagraphElement>(`p.${PARAGRAPH_CLASS}`);
  return paragraph && editor.contains(paragraph) ? paragraph : null;
}

function getTextOffsetWithin(element: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  try {
    range.setEnd(container, offset);
    return range.toString().length;
  } catch {
    return element.textContent?.length ?? 0;
  } finally {
    range.detach();
  }
}

function placeCaretAtStart(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.setStart(element, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function splitParagraphAtSelection(editor: HTMLDivElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return false;
  }

  const paragraph = getClosestEditorParagraph(range.startContainer, editor);
  if (!paragraph) {
    return false;
  }

  if (!range.collapsed) {
    range.deleteContents();
  }

  const offset = getTextOffsetWithin(paragraph, range.startContainer, range.startOffset);
  const content = paragraph.textContent ?? '';
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  const nextParagraph = document.createElement('p');
  nextParagraph.className = PARAGRAPH_CLASS;

  setParagraphContent(paragraph, before);
  setParagraphContent(nextParagraph, after);
  paragraph.after(nextParagraph);
  placeCaretAtStart(nextParagraph);
  return true;
}

function getSelectionHighlightRects(range: Range): SelectionHighlightRect[] {
  return Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }));
}

export type ManuscriptEditorHandle = {
  element: HTMLDivElement | null;
  getCursorAnchor: () => ManuscriptCursorAnchor | null;
  insertAtOffset: (text: string, offset: number) => string | null;
  getSelectionText: () => string;
  replaceSelection: (text: string) => string | null;
};

function getSelectedTextInEditor(element: HTMLDivElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return '';
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return '';
  }
  return range.toString().trim();
}

function getParagraphTextForOffset(paragraph: HTMLParagraphElement): string {
  return stripManuscriptParagraphIndent(paragraph.textContent ?? '').trimEnd();
}

function getCaretAnchorInEditor(element: HTMLDivElement): ManuscriptCursorAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return null;
  }
  const paragraph = getClosestEditorParagraph(range.startContainer, element);
  if (!paragraph) {
    return null;
  }

  const paragraphs = Array.from(element.querySelectorAll<HTMLParagraphElement>(`p.${PARAGRAPH_CLASS}`));
  const paragraphIndex = paragraphs.indexOf(paragraph);
  if (paragraphIndex < 0) {
    return null;
  }

  const currentOffset = getTextOffsetWithin(paragraph, range.startContainer, range.startOffset);
  const normalizedParagraphs = paragraphs.map(getParagraphTextForOffset);
  const beforeParagraphs = normalizedParagraphs.slice(0, paragraphIndex);
  const currentText = normalizedParagraphs[paragraphIndex] ?? '';
  const afterParagraphs = normalizedParagraphs.slice(paragraphIndex + 1);
  const beforeText = formatManuscriptParagraphs([
    ...beforeParagraphs,
    currentText.slice(0, currentOffset)
  ].join('\n'));
  const afterText = formatManuscriptParagraphs([
    currentText.slice(currentOffset),
    ...afterParagraphs
  ].join('\n'));
  const offset = beforeText.length + (beforeText && afterText ? 1 : 0);

  return {
    offset,
    beforeText,
    afterText
  };
}

function getCaretAnchorRect(element: HTMLDivElement): CursorAnchorRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  const paragraph = getClosestEditorParagraph(range.startContainer, element);
  const fallbackRect = paragraph?.getBoundingClientRect();
  const top = rect.top || fallbackRect?.top || 0;
  const left = rect.left || fallbackRect?.left || 0;
  const height = rect.height || fallbackRect?.height || 24;

  if (!top && !left) {
    return null;
  }

  return {
    left,
    top,
    height
  };
}

export const ManuscriptEditor = forwardRef<ManuscriptEditorHandle, ManuscriptEditorProps>(function ManuscriptEditor({
  value,
  className,
  placeholder,
  autoFocus = false,
  onChange,
  onBlurSave,
  onSelectionTextChange
}: ManuscriptEditorProps, ref): JSX.Element {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const emittedValueRef = useRef('');
  const selectionTextRef = useRef('');
  const selectionRangeRef = useRef<Range | null>(null);
  const cursorAnchorRef = useRef<ManuscriptCursorAnchor | null>(null);
  const [selectionRects, setSelectionRects] = useState<SelectionHighlightRect[]>([]);
  const [cursorAnchorRect, setCursorAnchorRect] = useState<CursorAnchorRect | null>(null);

  const clearSelectionCache = useCallback(() => {
    selectionTextRef.current = '';
    selectionRangeRef.current = null;
    setSelectionRects([]);
    onSelectionTextChange?.('');
  }, [onSelectionTextChange]);

  const refreshSelectionOverlay = useCallback(() => {
    const range = selectionRangeRef.current;
    if (!range) {
      setSelectionRects([]);
      return;
    }
    setSelectionRects(getSelectionHighlightRects(range));
  }, []);

  const refreshCursorAnchor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      cursorAnchorRef.current = null;
      setCursorAnchorRect(null);
      return;
    }
    cursorAnchorRef.current = getCaretAnchorInEditor(editor);
    setCursorAnchorRect(cursorAnchorRef.current ? getCaretAnchorRect(editor) : null);
  }, []);

  useImperativeHandle(ref, () => ({
    element: editorRef.current,
    getCursorAnchor: () => cursorAnchorRef.current || (editorRef.current ? getCaretAnchorInEditor(editorRef.current) : null),
    insertAtOffset: (text: string, offset: number) => {
      const editor = editorRef.current;
      if (!editor) {
        return null;
      }
      const current = readEditorContent(editor);
      const insertion = formatManuscriptParagraphs(text);
      const safeOffset = Math.min(Math.max(0, offset), current.length);
      const before = current.slice(0, safeOffset);
      const after = current.slice(safeOffset);
      const nextValue = formatManuscriptParagraphs([
        before,
        insertion,
        after
      ].filter((part) => part.trim()).join('\n'));
      writeEditorContent(editor, nextValue);
      emittedValueRef.current = nextValue;
      clearSelectionCache();
      cursorAnchorRef.current = null;
      setCursorAnchorRect(null);
      onChange(nextValue);
      window.setTimeout(onBlurSave, 0);
      return nextValue;
    },
    getSelectionText: () => selectionTextRef.current || (editorRef.current ? getSelectedTextInEditor(editorRef.current) : ''),
    replaceSelection: (text: string) => {
      const editor = editorRef.current;
      if (!editor || !selectionTextRef.current) {
        return null;
      }
      const current = readEditorContent(editor);
      const index = current.indexOf(selectionTextRef.current);
      if (index < 0) {
        return null;
      }
      const formattedInsertion = formatManuscriptParagraphs(text);
      const nextValue = formatManuscriptParagraphs(
        `${current.slice(0, index)}${formattedInsertion}${current.slice(index + selectionTextRef.current.length)}`
      );
      writeEditorContent(editor, nextValue);
      emittedValueRef.current = nextValue;
      clearSelectionCache();
      onChange(nextValue);
      window.setTimeout(onBlurSave, 0);
      return nextValue;
    }
  }), [clearSelectionCache, onBlurSave, onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (value === emittedValueRef.current) {
      return;
    }

    clearSelectionCache();
    cursorAnchorRef.current = null;
    setCursorAnchorRect(null);
    writeEditorContent(editor, value);
    emittedValueRef.current = value;
  }, [clearSelectionCache, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return undefined;
    }
    const refreshCursor = () => {
      refreshSelectionOverlay();
      if (cursorAnchorRef.current) {
        setCursorAnchorRect(getCaretAnchorRect(editor));
      }
    };
    editor.addEventListener('scroll', refreshCursor);
    window.addEventListener('resize', refreshCursor);
    window.addEventListener('scroll', refreshCursor, true);
    return () => {
      editor.removeEventListener('scroll', refreshCursor);
      window.removeEventListener('resize', refreshCursor);
      window.removeEventListener('scroll', refreshCursor, true);
    };
  }, [refreshSelectionOverlay]);

  useEffect(() => clearSelectionCache, [clearSelectionCache]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    editorRef.current?.focus();
  }, [autoFocus]);

  const syncContent = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const nextValue = readEditorContent(editor);
    clearSelectionCache();
    emittedValueRef.current = nextValue;
    onChange(nextValue);
  }, [clearSelectionCache, onChange]);

  const handleInput = useCallback(() => {
    syncContent();
  }, [syncContent]);

  const updateSelectionText = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const selectedText = getSelectedTextInEditor(editor);
    if (!selectedText) {
      clearSelectionCache();
      refreshCursorAnchor();
      return;
    }

    cursorAnchorRef.current = null;
    setCursorAnchorRect(null);
    const formatted = formatManuscriptParagraphs(selectedText);
    selectionTextRef.current = formatted;
    onSelectionTextChange?.(formatted);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0).cloneRange();
      selectionRangeRef.current = range;
      setSelectionRects(getSelectionHighlightRects(range));
    }
  }, [clearSelectionCache, onSelectionTextChange, refreshCursorAnchor]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor || !splitParagraphAtSelection(editor)) {
      document.execCommand('insertParagraph');
    }
    window.requestAnimationFrame(syncContent);
  }, [syncContent]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }
    event.preventDefault();
    insertPlainText(formatManuscriptParagraphs(pastedText).replace(/\n/g, '\n'));
    window.requestAnimationFrame(syncContent);
  }, [syncContent]);

  const handleBlur = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      onBlurSave();
      return;
    }
    const formatted = readEditorContent(editor);
    emittedValueRef.current = formatted;
    onChange(formatted);
    window.setTimeout(onBlurSave, 0);
  }, [onBlurSave, onChange]);

  return (
    <>
      <div
        ref={editorRef}
        className={`${className}${value.trim() ? '' : ' manuscript-editor-empty'}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onMouseUp={updateSelectionText}
        onKeyUp={updateSelectionText}
        onBlur={handleBlur}
      />
      {selectionRects.length > 0
        ? createPortal(
            <div className="manuscript-editor-selection-overlay" aria-hidden="true">
              {selectionRects.map((rect, index) => (
                <span
                  key={`${index}-${rect.left}-${rect.top}-${rect.width}-${rect.height}`}
                  style={{
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`
                  }}
                />
              ))}
            </div>,
            document.body
          )
        : null}
      {cursorAnchorRect
        ? createPortal(
            <div
              className="manuscript-editor-cursor-anchor"
              style={{
                left: `${cursorAnchorRect.left}px`,
                top: `${cursorAnchorRect.top}px`,
                height: `${cursorAnchorRect.height}px`
              }}
              aria-hidden="true"
            />,
            document.body
          )
        : null}
    </>
  );
});
