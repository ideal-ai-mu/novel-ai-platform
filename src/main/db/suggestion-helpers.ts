import type { Chapter } from '../../shared/ipc';

export type PatchChange = { field: string; value: unknown };

export function parsePatchChanges(patch: Record<string, unknown>): PatchChange[] {
  const raw = patch.changes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      field: typeof item.field === 'string' ? item.field : '',
      value: item.value
    }))
    .filter((item) => item.field.length > 0);
}

export function normalizeChapterPatchValue(field: string, value: unknown): string | null {
  if (field === 'status') {
    if (value === 'draft' || value === 'review' || value === 'final') {
      return value;
    }
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }
  return value;
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function buildOutlineAiText(chapter: Chapter): string {
  const goal = compactText(chapter.goal, 80) || '尚未填写本章目标，可先明确本章要推进的核心冲突。';
  const outlineUser = compactText(chapter.outline_user, 140) || '当前本章梗概为空，可以先给出一版结构化规划。';
  const nextHook = compactText(chapter.next_hook, 80) || '尚未填写章末钩子，建议在结尾留下新的信息差或风险信号。';
  const contentContext = compactText(chapter.content, 180) || '当前正文较少，可先建立场景压力，再把核心冲突推到台前。';
  const chapterLabel = chapter.title.trim() || `第${chapter.index_no}章`;

  return [
    `建议版《${chapterLabel}》章节梗概：`,
    `围绕“${goal}”推进本章主线。`,
    `延续当前梗概：${outlineUser}`,
    `正文应重点呈现：${contentContext}`,
    `结尾建议落在：${nextHook}`
  ].join('\n');
}

function buildOutlineUserSuggestionValue(chapter: Chapter): string {
  const goal = compactText(chapter.goal, 80);
  const contentSummary = compactText(chapter.content, 140);
  const nextHook = compactText(chapter.next_hook, 80);
  const lines = [
    goal ? `目标：${goal}` : `目标：推进 ${chapter.title.trim() || `第${chapter.index_no}章`} 的核心冲突。`,
    contentSummary ? `本章梗概：${contentSummary}` : '本章梗概：先建立压力场景，再逐步揭示新的阻力。',
    nextHook ? `章末钩子：${nextHook}` : '章末钩子：结尾需要留下新的悬念或代价。'
  ];

  return lines.join('\n');
}

export function buildMockChapterSuggestion(
  chapter: Chapter,
  existingCount: number
): {
  kind: string;
  summary: string;
  patch: Record<string, unknown>;
} {
  if (existingCount % 3 === 0) {
    return {
      kind: 'mock.chapter.outline_ai',
      summary: 'Mock 建议：补充 AI 梗概参考',
      patch: {
        changes: [
          {
            field: 'outline_ai',
            value: buildOutlineAiText(chapter)
          }
        ]
      }
    };
  }

  if (existingCount % 2 === 0) {
    const chapterLabel = chapter.title.trim() || `第${chapter.index_no}章`;
    return {
      kind: 'mock.chapter.planning',
      summary: 'Mock 建议：补强章节规划层',
      patch: {
        changes: [
          {
            field: 'goal',
            value: chapter.goal.trim() || `让 ${chapterLabel} 更早暴露核心冲突与代价。`
          },
          {
            field: 'next_hook',
            value: chapter.next_hook.trim() || '章末加入新的警告、误导或更高风险的线索。'
          },
          {
            field: 'outline_user',
            value: chapter.outline_user.trim() || buildOutlineUserSuggestionValue(chapter)
          }
        ]
      }
    };
  }

  const contentValue = chapter.content.trim()
    ? `${chapter.content.trim()}\n\n风声忽然停住，主角这才意识到真正的危险已经贴近。`
    : '本章可以先让主角处于被动局面，再通过一条异常信息把冲突推到台前。';

  return {
    kind: 'mock.chapter.content',
    summary: 'Mock 建议：补强正文层',
    patch: {
      changes: [
        {
          field: 'content',
          value: contentValue
        }
      ]
    }
  };
}
