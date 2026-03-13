import type { AiProvider, AiTextResult, PromptPayload } from './provider';

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+/gu, ' ').trim();
}

function splitSentences(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  const segments = normalized
    .split(/[。！？!?]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return segments.length > 0 ? segments : [normalized];
}

function compactText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function firstNonEmpty(values: Array<string | undefined>): string {
  return values.map((value) => value?.trim() ?? '').find((value) => value.length > 0) ?? '';
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function extractKeywords(value: string): string[] {
  const tokens = (value.match(/[\p{Script=Han}A-Za-z0-9]{2,}/gu) ?? []).map((token) => token.toLowerCase());
  return unique(tokens).slice(0, 20);
}

function overlapScore(seed: string, content: string): number {
  const seedWords = extractKeywords(seed);
  if (seedWords.length === 0) {
    return 0;
  }
  const text = content.toLowerCase();
  const matched = seedWords.filter((word) => text.includes(word)).length;
  return matched / seedWords.length;
}

function summarizeFromContent(payload: PromptPayload): string {
  const sentences = splitSentences(payload.context.chapter.content);
  if (sentences.length === 0) {
    return '';
  }
  return compactText(sentences.slice(0, 2).join('。') + '。', 220);
}

function titleFromContext(payload: PromptPayload): string {
  const seed = firstNonEmpty([
    payload.context.chapter.goal,
    payload.context.chapter.nextHook,
    payload.context.chapter.content,
    payload.context.referenceChapters[0]?.outlineUser
  ]);
  if (!seed) {
    return `第${payload.context.chapter.number}章`;
  }
  const keyword = extractKeywords(seed)[0] ?? compactText(seed, 8);
  return compactText(keyword, 12);
}

function goalFromContext(payload: PromptPayload): string {
  const seed = firstNonEmpty([
    payload.context.chapter.nextHook,
    payload.context.referenceChapters[0]?.outlineUser,
    payload.context.chapter.content,
    payload.context.chapter.title
  ]);
  if (!seed) {
    return '推进本章核心冲突，并为下一章埋下明确牵引。';
  }
  return `围绕“${compactText(seed, 18)}”推进本章主线，并留下可延续的下一章入口。`;
}

function nextHookFromContext(payload: PromptPayload): string {
  const sentences = splitSentences(payload.context.chapter.content);
  const seed = firstNonEmpty([
    sentences[sentences.length - 1],
    payload.context.chapter.nextHook,
    payload.context.pitCandidates[0]?.content
  ]);
  if (!seed) {
    return '章末抛出一个未解信息，迫使读者进入下一章。';
  }
  return `章末让主角面对“${compactText(seed, 20)}”，并把关键悬念延续到下一章。`;
}

function pitSuggestionsFromContext(payload: PromptPayload): string {
  const sentences = splitSentences(payload.context.chapter.content);
  const candidates: string[] = [];

  if (sentences[0]) {
    candidates.push(`“${compactText(sentences[0], 24)}”引出的后续影响仍待回应。`);
  }
  if (sentences[1]) {
    candidates.push(`“${compactText(sentences[1], 24)}”这一细节可以发展成后续伏笔。`);
  }
  if (payload.context.chapter.title.trim()) {
    candidates.push(`围绕“${compactText(payload.context.chapter.title, 16)}”这一章名对应的真实含义，后文仍可继续展开。`);
  }
  if (payload.context.chapter.goal.trim()) {
    candidates.push(`为了完成“${compactText(payload.context.chapter.goal, 18)}”，仍有一层更深的代价或阻碍没有揭开。`);
  }

  return unique(candidates).slice(0, 4).join('\n');
}

function buildPitResponseReviewJson(payload: PromptPayload): string {
  const content = payload.context.chapter.content;
  const items = payload.context.plannedPits.map((plan) => {
    const score = overlapScore(plan.content, content);
    const outcome = score >= 0.65 ? 'resolved' : score >= 0.45 ? 'clear' : score >= 0.2 ? 'partial' : 'none';
    const note =
      outcome === 'none'
        ? '正文中尚未出现足够证据。'
        : outcome === 'partial'
          ? '正文中有触达，但回应仍不充分。'
          : outcome === 'clear'
            ? '正文已有较明确回应。'
            : '正文已形成完整回应闭环。';
    return {
      pitId: plan.pitId,
      outcome,
      note
    };
  });

  return JSON.stringify({ items }, null, 2);
}

function buildPitCandidateReviewJson(payload: PromptPayload): string {
  const content = payload.context.chapter.content;

  const existingItems = payload.context.pitCandidates.map((candidate) => {
    const score = overlapScore(candidate.content, content);
    const status = score >= 0.55 ? 'confirmed' : score >= 0.25 ? 'weak' : 'draft';
    return {
      candidateId: candidate.id,
      status
    };
  });

  const fromForeshadow = payload.context.chapter.foreshadowNotes.map((note) => {
    const score = overlapScore(note, content);
    return {
      content: compactText(note, 120),
      status: score >= 0.55 ? 'confirmed' : score >= 0.25 ? 'weak' : 'draft'
    };
  });

  const sentences = splitSentences(content);
  const fromContent = sentences.slice(0, 2).map((sentence) => {
    const content = `"${compactText(sentence, 30)}"可能已经在正文中形成新的后续线索。`;
    const score = overlapScore(content, payload.context.chapter.content);
    return {
      content,
      status: score >= 0.55 ? 'confirmed' : score >= 0.25 ? 'weak' : 'draft'
    };
  });

  const existingContents = new Set(payload.context.pitCandidates.map((item) => normalizeText(item.content)));
  const newItems = [...fromForeshadow, ...fromContent]
    .map((item) => ({
      content: normalizeText(item.content),
      status: item.status
    }))
    .filter((item) => item.content.length > 0)
    .filter((item) => !existingContents.has(item.content))
    .filter((item, index, array) => array.findIndex((x) => x.content === item.content) === index)
    .slice(0, 6);

  return JSON.stringify({ existingItems, newItems }, null, 2);
}

export class MockAiProvider implements AiProvider {
  public readonly name = 'mock';

  public async summarizeChapterFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-outline-v7', text: summarizeFromContent(payload) };
  }

  public async generateChapterTitle(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-title-v4', text: titleFromContext(payload) };
  }

  public async generateChapterGoal(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-goal-v4', text: goalFromContext(payload) };
  }

  public async generateChapterNextHook(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-next-hook-v3', text: nextHookFromContext(payload) };
  }

  public async generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-pits-v4', text: pitSuggestionsFromContext(payload) };
  }

  public async reviewChapterPitResponses(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-pit-review-v2', text: buildPitResponseReviewJson(payload) };
  }

  public async reviewChapterPitCandidates(payload: PromptPayload): Promise<AiTextResult> {
    return { provider: this.name, model: 'mock-pit-candidate-v2', text: buildPitCandidateReviewJson(payload) };
  }

  public async proposeOutlineUpdate(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('proposeOutlineUpdate is not implemented in the mock provider yet');
  }

  public async generateChapterSuggestions(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('generateChapterSuggestions is not implemented in the mock provider yet');
  }
}


