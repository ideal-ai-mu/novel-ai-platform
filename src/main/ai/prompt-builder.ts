import type { ChapterAiContext, PromptPayload, PromptSection } from './provider';

function taskLabel(taskType: ChapterAiContext['taskType']): string {
  switch (taskType) {
    case 'summarizeChapterFromContent':
      return '根据当前正文更新章节摘要';
    case 'generateChapterTitle':
      return '基于 AI 参考上下文生成章节标题';
    case 'generateChapterGoal':
      return '基于 AI 参考上下文生成本章目标';
    case 'generateChapterPitsFromContent':
      return '根据当前章节内容生成新增坑候选';
    case 'proposeOutlineUpdate':
      return '提出章节梗概更新建议';
    case 'generateChapterSuggestions':
      return '生成章节 AI 建议';
    default:
      return taskType;
  }
}

function withFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function formatCharacters(context: ChapterAiContext): string {
  if (context.linkedCharacters.length === 0) {
    return '暂无已关联角色';
  }

  return context.linkedCharacters
    .map((character) => {
      const parts = [character.name, character.roleType, character.summary].map((item) => item.trim()).filter(Boolean);
      return `- ${parts.join(' / ')}`;
    })
    .join('\n');
}

function formatLore(context: ChapterAiContext): string {
  if (context.linkedLore.length === 0) {
    return '暂无已关联设定';
  }

  return context.linkedLore
    .map((entry) => {
      const parts = [entry.title, entry.type, entry.summary].map((item) => item.trim()).filter(Boolean);
      return `- ${parts.join(' / ')}`;
    })
    .join('\n');
}

function formatReferenceChapters(context: ChapterAiContext): string {
  if (context.referenceChapters.length === 0) {
    return '暂无参考章节';
  }

  return context.referenceChapters
    .map((item) => {
      const summary = withFallback(item.outlineUser, '暂未填写摘要');
      return `- 第 ${item.number} 章《${item.title}》 [${item.mode}] / ${summary}`;
    })
    .join('\n');
}

function formatCreatedPits(context: ChapterAiContext): string {
  if (context.createdPits.length === 0) {
    return '本章未埋坑';
  }

  return context.createdPits.map((pit) => `- ${pit.content}`).join('\n');
}

function formatResolvedPits(context: ChapterAiContext): string {
  if (context.resolvedPits.length === 0) {
    return '本章未填坑';
  }

  return context.resolvedPits
    .map((pit) => `- ${pit.content}（来源：${pit.originLabel}）`)
    .join('\n');
}

function buildReferenceSections(context: ChapterAiContext): PromptSection[] {
  return [
    {
      label: '当前章节',
      content: `第 ${context.chapter.number} 章《${withFallback(context.chapter.title, '未填写章节标题')}》`
    },
    {
      label: '本章目标',
      content: withFallback(context.chapter.goal, '未填写本章目标')
    },
    {
      label: '本章摘要',
      content: withFallback(context.chapter.outlineUser, '未填写本章摘要')
    },
    {
      label: '章末钩子 / 下一章引子',
      content: withFallback(context.chapter.nextHook, '未填写章末钩子 / 下一章引子')
    },
    {
      label: '已关联角色',
      content: formatCharacters(context)
    },
    {
      label: '已关联设定',
      content: formatLore(context)
    },
    {
      label: '参考章节',
      content: formatReferenceChapters(context)
    },
    {
      label: '本章填坑',
      content: formatResolvedPits(context)
    },
    {
      label: '本章埋坑',
      content: formatCreatedPits(context)
    }
  ];
}

function buildSummaryReferenceSections(context: ChapterAiContext): PromptSection[] {
  return [
    {
      label: '当前章节',
      content: `第 ${context.chapter.number} 章《${withFallback(context.chapter.title, '未填写章节标题')}》`
    },
    {
      label: '本章目标',
      content: withFallback(context.chapter.goal, '未填写本章目标')
    },
    {
      label: '章末钩子 / 下一章引子',
      content: withFallback(context.chapter.nextHook, '未填写章末钩子 / 下一章引子')
    },
    {
      label: '已关联角色',
      content: formatCharacters(context)
    },
    {
      label: '已关联设定',
      content: formatLore(context)
    },
    {
      label: '参考章节',
      content: formatReferenceChapters(context)
    },
    {
      label: '本章填坑',
      content: formatResolvedPits(context)
    },
    {
      label: '本章埋坑',
      content: formatCreatedPits(context)
    },
    {
      label: '当前正文（节选）',
      content: withFallback(compactText(context.chapter.content, 320), '当前正文为空')
    }
  ];
}

function buildTaskSections(context: ChapterAiContext, referenceSections: PromptSection[]): PromptSection[] {
  if (context.taskType === 'generateChapterTitle' || context.taskType === 'generateChapterGoal') {
    return [
      {
        label: '任务类型',
        content: taskLabel(context.taskType)
      },
      {
        label: '项目信息',
        content: [withFallback(context.project.title, '未填写项目标题'), withFallback(context.project.description, '未填写项目简介')].join('\n')
      },
      ...referenceSections
    ];
  }

  if (context.taskType === 'generateChapterPitsFromContent') {
    return [
      {
        label: '任务类型',
        content: taskLabel(context.taskType)
      },
      {
        label: '项目信息',
        content: [withFallback(context.project.title, '未填写项目标题'), withFallback(context.project.description, '未填写项目简介')].join('\n')
      },
      ...referenceSections,
      {
        label: '当前正文',
        content: withFallback(context.chapter.content, '当前正文为空')
      }
    ];
  }

  if (context.taskType === 'summarizeChapterFromContent') {
    return [
      {
        label: '任务类型',
        content: taskLabel(context.taskType)
      },
      {
        label: '项目信息',
        content: [withFallback(context.project.title, '未填写项目标题'), withFallback(context.project.description, '未填写项目简介')].join('\n')
      },
      ...referenceSections,
      {
        label: '当前正文',
        content: withFallback(context.chapter.content, '当前正文为空')
      }
    ];
  }

  return [
    {
      label: '任务类型',
      content: taskLabel(context.taskType)
    },
    {
      label: '项目信息',
      content: [withFallback(context.project.title, '未填写项目标题'), withFallback(context.project.description, '未填写项目简介')].join('\n')
    },
    ...referenceSections,
    {
      label: '当前正文',
      content: withFallback(context.chapter.content, '当前正文为空')
    }
  ];
}

function buildReferenceText(sections: PromptSection[]): string {
  return sections.map((section) => `【${section.label}】\n${section.content}`).join('\n\n');
}

function buildSystemPrompt(taskType: ChapterAiContext['taskType']): string {
  switch (taskType) {
    case 'generateChapterTitle':
      return [
        '你是长篇小说创作助手。',
        '请基于给定的章节参考上下文，输出一个适合作为当前章标题的中文候选。',
        '要求：简洁、聚焦、像小说章节名，不要解释，不要分点。'
      ].join('\n');
    case 'generateChapterGoal':
      return [
        '你是长篇小说创作助手。',
        '请基于给定的章节参考上下文，输出一条适合作为“本章目标”的中文候选。',
        '要求：一句话说明本章要推进的核心任务、冲突或结果，不要解释，不要分点。'
      ].join('\n');
    case 'generateChapterPitsFromContent':
      return [
        '你是长篇小说创作助手。',
        '请根据当前章节正文为主，并参考当前章节规划与上下文，生成 2 到 4 条值得后文回应的坑位候选。',
        '要求：',
        '1. 每行一条。',
        '2. 聚焦未解问题、伏笔、线索或悬念。',
        '3. 不要输出编号，不要解释。'
      ].join('\n');
    case 'summarizeChapterFromContent':
      return [
        '你是长篇小说创作助手。',
        '你的任务是严格根据当前章节正文里已经实际写出的内容，生成一段适合作为本章摘要的中文文本。',
        '输出要求：',
        '1. 输出一段简洁、可直接写入本章摘要的中文文本。',
        '2. 只根据当前正文生成，不要把已有摘要、目标、钩子、参考章节重新改写进结果。',
        '3. 不要递归套用旧摘要，不要回显提示词，不要输出分析过程。',
        '4. 不要分点，不要使用标题。'
      ].join('\n');
    default:
      return '你是长篇小说创作助手，请根据提供的结构化上下文输出中文结果。';
  }
}

function buildUserPrompt(sections: PromptSection[]): string {
  return sections.map((section) => `【${section.label}】\n${section.content}`).join('\n\n');
}

export class PromptBuilder {
  public build(context: ChapterAiContext): PromptPayload {
    const referenceSections = context.taskType === 'summarizeChapterFromContent' ? buildSummaryReferenceSections(context) : buildReferenceSections(context);
    const sections = buildTaskSections(context, referenceSections);

    return {
      taskType: context.taskType,
      taskLabel: taskLabel(context.taskType),
      referenceText: buildReferenceText(referenceSections),
      sections,
      systemPrompt: buildSystemPrompt(context.taskType),
      userPrompt: buildUserPrompt(sections),
      context
    };
  }
}

export const promptBuilder = new PromptBuilder();
