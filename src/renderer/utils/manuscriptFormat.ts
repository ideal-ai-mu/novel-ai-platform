export const MANUSCRIPT_PARAGRAPH_INDENT = '\u3000\u3000';

const LEADING_PARAGRAPH_SPACE_PATTERN = /^[ \t\u3000]+/u;
const BLANK_LINE_PATTERN = /\n[ \t\u3000]*\n+/gu;

export function collapseManuscriptBlankLines(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(BLANK_LINE_PATTERN, '\n');
}

export function stripManuscriptParagraphIndent(value: string): string {
  return value.replace(LEADING_PARAGRAPH_SPACE_PATTERN, '');
}

export function formatManuscriptParagraphs(value: string): string {
  return collapseManuscriptBlankLines(value)
    .split('\n')
    .map((line) => stripManuscriptParagraphIndent(line).trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => `${MANUSCRIPT_PARAGRAPH_INDENT}${line.trimStart()}`)
    .join('\n');
}

export function getManuscriptParagraphs(value: string): string[] {
  return collapseManuscriptBlankLines(value)
    .trim()
    .split('\n')
    .map((line) => stripManuscriptParagraphIndent(line).trim())
    .filter(Boolean);
}

export function insertManuscriptParagraphBreak(
  value: string,
  selectionStart: number,
  selectionEnd: number
): { value: string; cursor: number } {
  const normalized = collapseManuscriptBlankLines(value);
  const lineStart = normalized.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const currentLineBeforeCursor = normalized.slice(lineStart, selectionStart);

  if (!currentLineBeforeCursor.replace(/[ \t\u3000]/gu, '').length && selectionStart === selectionEnd) {
    return { value: normalized, cursor: selectionStart };
  }

  const insertion = `\n${MANUSCRIPT_PARAGRAPH_INDENT}`;
  const nextValue = collapseManuscriptBlankLines(
    `${normalized.slice(0, selectionStart)}${insertion}${normalized.slice(selectionEnd)}`
  );

  return {
    value: nextValue,
    cursor: selectionStart + insertion.length
  };
}

export function insertManuscriptText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string
): { value: string; cursor: number } {
  const insertion = formatManuscriptParagraphs(text);
  const nextValue = collapseManuscriptBlankLines(`${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`);

  return {
    value: nextValue,
    cursor: selectionStart + insertion.length
  };
}
