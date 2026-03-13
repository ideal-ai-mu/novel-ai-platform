import type { AiTaskType, ChapterAiContext, PromptPayload, PromptSection } from './provider';

type BuildPromptOptions = {
  transientInstruction?: string;
};

function compactText(value: string, maxLength = 240): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildSection(label: string, content: string): PromptSection {
  return {
    label,
    content: content.trim() || '暂无可用内容'
  };
}

function buildList(lines: string[], emptyText: string): string {
  if (lines.length === 0) {
    return emptyText;
  }
  return lines.map((line) => `- ${line}`).join('\n');
}

function buildReferenceText(sections: PromptSection[]): string {
  return sections
    .map((section) => `【${section.label}】\n${section.content}`)
    .join('\n\n')
    .trim();
}

function formatCharacters(context: ChapterAiContext): string {
  return buildList(
    context.linkedCharacters.map((character) => [character.name, character.roleType, character.summary].filter((item) => item.trim().length > 0).join(' / ')),
    '暂无已关联角色'
  );
}

function formatLore(context: ChapterAiContext): string {
  return buildList(
    context.linkedLore.map((entry) => [entry.title, entry.type, entry.summary].filter((item) => item.trim().length > 0).join(' / ')),
    '暂无已关联设定'
  );
}

function formatReferenceChapters(context: ChapterAiContext): string {
  return buildList(
    context.referenceChapters.map((chapter) => `第 ${chapter.number} 章《${chapter.title}》 [${chapter.mode}] ${chapter.outlineUser || '暂未填写梗概'}`),
    '暂无历史章节引用'
  );
}

function formatPlannedPits(context: ChapterAiContext): string {
  return buildList(
    context.plannedPits.map((plan) => `${plan.content}（来源：${plan.originLabel}）`),
    '暂无计划回应坑'
  );
}

function formatForeshadowNotes(context: ChapterAiContext): string {
  return buildList(context.chapter.foreshadowNotes, '暂无本章伏笔');
}

function formatPitReviews(context: ChapterAiContext): string {
  return buildList(
    context.pitReviews.map((review) => `${review.content}（结果：${review.outcome}${review.note ? `；说明：${review.note}` : ''}）`),
    '暂无填坑总结'
  );
}

function formatPitCandidates(context: ChapterAiContext): string {
  return buildList(
    context.pitCandidates.map((candidate) => `${candidate.content}（状态：${candidate.status}）`),
    '暂无埋坑确认候选'
  );
}

function buildSectionsForTask(context: ChapterAiContext): PromptSection[] {
  switch (context.taskType) {
    case 'summarizeChapterFromContent':
      return [buildSection('当前正文', context.chapter.content)];
    case 'generateChapterTitle':
      return [
        buildSection('当前章节', `第 ${context.chapter.number} 章《${context.chapter.title || '未命名章节'}》`),
        buildSection('本章目标', context.chapter.goal),
        buildSection('章末钩子 / 下一章引子', context.chapter.nextHook),
        buildSection('已关联角色', formatCharacters(context)),
        buildSection('已关联设定', formatLore(context)),
        buildSection('参考章节', formatReferenceChapters(context)),
        buildSection('本章线索', formatPlannedPits(context)),
        buildSection('本章伏笔', formatForeshadowNotes(context)),
        buildSection('正文摘要预览', compactText(context.chapter.content, 500))
      ];
    case 'generateChapterGoal':
      return [
        buildSection('当前章节', `第 ${context.chapter.number} 章《${context.chapter.title || '未命名章节'}》`),
        buildSection('章末钩子 / 下一章引子', context.chapter.nextHook),
        buildSection('已关联角色', formatCharacters(context)),
        buildSection('已关联设定', formatLore(context)),
        buildSection('参考章节', formatReferenceChapters(context)),
        buildSection('本章线索', formatPlannedPits(context)),
        buildSection('本章伏笔', formatForeshadowNotes(context)),
        buildSection('正文摘要预览', compactText(context.chapter.content, 500))
      ];
    case 'generateChapterNextHook':
      return [
        buildSection('当前章节', `第 ${context.chapter.number} 章《${context.chapter.title || '未命名章节'}》`),
        buildSection('本章目标', context.chapter.goal),
        buildSection('当前正文', compactText(context.chapter.content, 1200)),
        buildSection('本章正式摘要', context.chapter.outlineUser),
        buildSection('已关联角色', formatCharacters(context)),
        buildSection('已关联设定', formatLore(context)),
        buildSection('参考章节', formatReferenceChapters(context)),
        buildSection('本章线索', formatPlannedPits(context)),
        buildSection('填坑总结', formatPitReviews(context)),
        buildSection('本章伏笔', formatForeshadowNotes(context))
      ];
    case 'generateChapterPitsFromContent':
      return [
        buildSection('当前章节', `第 ${context.chapter.number} 章《${context.chapter.title || '未命名章节'}》`),
        buildSection('本章目标', context.chapter.goal),
        buildSection('章末钩子 / 下一章引子', context.chapter.nextHook),
        buildSection('当前正文', compactText(context.chapter.content, 1500))
      ];
    case 'reviewChapterPitResponses':
      return [
        buildSection('当前正文', compactText(context.chapter.content, 1500)),
        buildSection('本章计划回应坑', formatPlannedPits(context))
      ];
    case 'reviewChapterPitCandidates':
      return [
        buildSection('当前正文', compactText(context.chapter.content, 1800))
      ];
    case 'proposeOutlineUpdate':
      return [
        buildSection('当前正文', compactText(context.chapter.content, 1500)),
        buildSection('当前摘要', context.chapter.outlineUser)
      ];
    case 'generateChapterSuggestions':
      return [
        buildSection('当前正文', compactText(context.chapter.content, 1500)),
        buildSection('参考章节', formatReferenceChapters(context))
      ];
    default:
      return [buildSection('当前正文', compactText(context.chapter.content, 1500))];
  }
}

function buildSystemPrompt(taskType: AiTaskType): string {
  switch (taskType) {
    case 'summarizeChapterFromContent':
      return '你是小说编辑助手。只基于提供的当前正文生成一段“本章摘要”。不要重复原文，不要编造不存在的信息。';
    case 'generateChapterTitle':
      return '你是小说编辑助手。请基于上下文给出一个简洁、有辨识度的章节标题候选，仅输出标题文本本身。';
    case 'generateChapterGoal':
      return '你是小说编辑助手。请基于上下文给出一个清晰的本章目标候选，仅输出一段目标文本。';
    case 'generateChapterNextHook':
      return '你是小说编辑助手。请基于上下文给出一个章末钩子候选，强调下一章牵引力。仅输出候选文本。';
    case 'generateChapterPitsFromContent':
      return '你是小说编辑助手。请基于当前章节正文提炼 2-4 条可作为后续伏笔/未解线索的候选，每行一条。';
    case 'reviewChapterPitResponses':
      return '你是小说写作验收助手。请仅输出 JSON：{"items":[{"pitId":"...","outcome":"none|partial|clear|resolved","note":"..."}]}。pitId 必须来自输入。';
    case 'reviewChapterPitCandidates':
      return '你是小说写作验收助手。请仅输出 JSON：{"existingItems":[{"candidateId":"...","status":"draft|weak|confirmed|discarded"}],"newItems":[{"content":"...","status":"weak|confirmed"}]}。根据正文判断“本章伏笔”是否成立，并可补充正文中新出现的有效新坑候选。';
    default:
      return '你是小说编辑助手。请根据输入上下文输出可直接使用的候选文本。';
  }
}

function buildUserPrompt(taskLabel: string, referenceText: string, transientInstruction?: string): string {
  const parts = [`任务：${taskLabel}`];
  if (transientInstruction && transientInstruction.trim()) {
    parts.push(`本次提示词：${transientInstruction.trim()}`);
  }
  parts.push('上下文：');
  parts.push(referenceText);
  return parts.join('\n\n');
}

function taskLabelFor(taskType: AiTaskType): string {
  switch (taskType) {
    case 'summarizeChapterFromContent':
      return '提炼本章摘要';
    case 'generateChapterTitle':
      return '生成章节标题候选';
    case 'generateChapterGoal':
      return '生成本章目标候选';
    case 'generateChapterNextHook':
      return '生成章末钩子候选';
    case 'generateChapterPitsFromContent':
      return '生成本章伏笔候选';
    case 'reviewChapterPitResponses':
      return '生成填坑总结候选';
    case 'reviewChapterPitCandidates':
      return '分析埋坑确认候选';
    case 'proposeOutlineUpdate':
      return '更新摘要建议';
    case 'generateChapterSuggestions':
      return '生成章节建议';
    default:
      return 'AI 任务';
  }
}

class PromptBuilder {
  public build(context: ChapterAiContext, options: BuildPromptOptions = {}): PromptPayload {
    const sections = buildSectionsForTask(context);
    const referenceText = buildReferenceText(sections);
    const taskLabel = taskLabelFor(context.taskType);

    return {
      taskType: context.taskType,
      taskLabel,
      sections,
      referenceText,
      systemPrompt: buildSystemPrompt(context.taskType),
      userPrompt: buildUserPrompt(taskLabel, referenceText, options.transientInstruction),
      transientInstruction: options.transientInstruction?.trim() || undefined,
      context
    };
  }
}

export const promptBuilder = new PromptBuilder();
