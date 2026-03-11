import type { AiProvider, AiTextResult, PromptPayload } from './provider';

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\s+/gu, ' ').trim();
}

function splitIntoSentences(content: string): string[] {
  return normalizeContent(content)
    .split(/(?<=[。！？!?])/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function compactText(parts: string[], maxLength: number): string {
  const combined = parts.join('');
  if (combined.length <= maxLength) {
    return combined;
  }
  return `${combined.slice(0, maxLength).trim()}...`;
}

function toTitleSeed(payload: PromptPayload): string {
  const candidates = [
    payload.context.chapter.outlineUser,
    payload.context.chapter.goal,
    payload.context.chapter.nextHook,
    payload.context.createdPits[0]?.content ?? '',
    payload.context.resolvedPits[0]?.content ?? ''
  ];

  const source = candidates.map((item) => item.trim()).find((item) => item.length > 0) ?? '';
  const cleaned = source.replace(/[“”"'《》【】]/gu, '').replace(/[，。！？：；,.!?:;]/gu, ' ').trim();
  if (!cleaned) {
    return `第${payload.context.chapter.number}章 新转折`;
  }

  const token = cleaned.split(/\s+/u)[0] ?? cleaned;
  return token.slice(0, 12) || `第${payload.context.chapter.number}章 新转折`;
}

function summarizeFromPayload(payload: PromptPayload): string {
  const content = payload.context.chapter.content;
  const sentences = splitIntoSentences(content);
  const title = payload.context.chapter.title.trim();
  const goal = payload.context.chapter.goal.trim();
  const nextHook = payload.context.chapter.nextHook.trim();
  const firstResolved = payload.context.resolvedPits[0]?.content.trim() ?? '';
  const firstCreated = payload.context.createdPits[0]?.content.trim() ?? '';
  const firstReference = payload.context.referenceChapters[0]?.outlineUser.trim() ?? '';
  const parts: string[] = [];

  if (sentences.length > 0) {
    parts.push(compactText(sentences.slice(0, 4), 160));
  }

  if (!parts.length && title) {
    parts.push(`本章围绕“${compactText([title], 24)}”展开。`);
  }
  if (goal) {
    parts.push(`聚焦“${compactText([goal], 30)}”。`);
  }
  if (firstResolved) {
    parts.push(`回应了“${compactText([firstResolved], 24)}”。`);
  }
  if (firstCreated) {
    parts.push(`并引出“${compactText([firstCreated], 24)}”这一后续线索。`);
  }
  if (nextHook) {
    parts.push(`章末将线索推进到“${compactText([nextHook], 24)}”。`);
  }
  if (!sentences.length && firstReference) {
    parts.push(`延续前文“${compactText([firstReference], 26)}”的脉络继续推进。`);
  }

  const unique = Array.from(new Set(parts.filter((item) => item.trim().length > 0)));
  if (unique.length === 0) {
    return '当前正文和 AI 参考内容都不足，暂时无法生成本章摘要。';
  }

  return compactText(unique, 220);
}

function generateGoalFromPayload(payload: PromptPayload): string {
  const outline = payload.context.chapter.outlineUser.trim();
  const nextHook = payload.context.chapter.nextHook.trim();
  const firstResolved = payload.context.resolvedPits[0]?.content.trim() ?? '';
  const firstCreated = payload.context.createdPits[0]?.content.trim() ?? '';
  const base = outline || payload.context.chapter.goal.trim() || payload.context.referenceChapters[0]?.outlineUser.trim() || '推进当前章节的核心冲突';
  const parts = [`围绕“${compactText([base], 28)}”推进本章主线`];

  if (firstResolved) {
    parts.push(`回应“${compactText([firstResolved], 18)}”`);
  }
  if (firstCreated) {
    parts.push(`并埋下“${compactText([firstCreated], 18)}”`);
  }
  if (nextHook) {
    parts.push(`把结尾推向“${compactText([nextHook], 18)}”`);
  }

  return `${parts.join('，')}。`;
}

function generatePitsFromPayload(payload: PromptPayload): string {
  const content = payload.context.chapter.content;
  const sentences = splitIntoSentences(content);
  const candidates: string[] = [];
  const title = payload.context.chapter.title.trim();
  const goal = payload.context.chapter.goal.trim();
  const nextHook = payload.context.chapter.nextHook.trim();
  const outline = payload.context.chapter.outlineUser.trim();
  const firstReference = payload.context.referenceChapters[0]?.outlineUser.trim() ?? '';
  const firstSentence = sentences[0] ?? '';
  const secondSentence = sentences[1] ?? '';

  if (firstSentence) {
    candidates.push(`“${compactText([firstSentence], 22)}”引出的后续影响仍待回应。`);
  }
  if (secondSentence) {
    candidates.push(`“${compactText([secondSentence], 22)}”这一异常细节可以发展成后续伏笔。`);
  }
  if (title) {
    candidates.push(`围绕“${compactText([title], 16)}”这一章名对应的真实含义，后文仍可继续展开。`);
  }
  if (goal) {
    candidates.push(`为了完成“${compactText([goal], 20)}”，仍有一层更深的代价或阻碍没有揭开。`);
  }
  if (outline) {
    candidates.push(`围绕“${compactText([outline], 20)}”的真实代价或隐藏信息还未完全揭示。`);
  }
  if (nextHook) {
    candidates.push(`${nextHook}背后的真实原因仍未揭晓。`);
  }
  if (firstReference) {
    candidates.push(`与前文章节中“${compactText([firstReference], 20)}”相关的线索，还可以在后文得到回应。`);
  }

  const unique = Array.from(new Set(candidates)).slice(0, 4);
  if (unique.length === 0) {
    return '当前上下文不足，暂时无法生成新增坑候选。';
  }
  return unique.join('\n');
}

export class MockAiProvider implements AiProvider {
  public readonly name = 'mock';

  public async summarizeChapterFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return {
      provider: this.name,
      model: 'mock-outline-v4',
      text: summarizeFromPayload(payload)
    };
  }

  public async generateChapterTitle(payload: PromptPayload): Promise<AiTextResult> {
    return {
      provider: this.name,
      model: 'mock-title-v1',
      text: toTitleSeed(payload)
    };
  }

  public async generateChapterGoal(payload: PromptPayload): Promise<AiTextResult> {
    return {
      provider: this.name,
      model: 'mock-goal-v1',
      text: generateGoalFromPayload(payload)
    };
  }

  public async generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return {
      provider: this.name,
      model: 'mock-pits-v1',
      text: generatePitsFromPayload(payload)
    };
  }

  public async proposeOutlineUpdate(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('proposeOutlineUpdate is not implemented in the mock provider yet');
  }

  public async generateChapterSuggestions(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('generateChapterSuggestions is not implemented in the mock provider yet');
  }
}
