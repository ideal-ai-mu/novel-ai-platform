import type * as Shared from '../../shared/ipc';
import { DEFAULT_AI_CHAT_SYSTEM_PROMPT } from '../../shared/ipc';
import { aiService } from '../ai/ai-service';
import { getAiProviderConfigState } from '../ai/ai-config';
import { contextAssembler } from '../ai/context-assembler';
import { promptBuilder } from '../ai/prompt-builder';
import type { AiTaskType, ChatPromptPayload, PromptPayload } from '../ai/provider';
import { appDatabase } from '../db/database';
import { AppError } from '../db/errors';

export type LoadedChapterAiResources = {
  chapter: Shared.Chapter;
  project: Shared.NovelProject;
  linkedCharacters: Shared.Character[];
  linkedLoreEntries: Shared.LoreEntry[];
  referenceChapters: Shared.ChapterContextRefView[];
  plannedPits: Shared.ChapterPitPlanView[];
  pitReviews: Shared.ChapterPitReviewView[];
  pitCandidates: Shared.ChapterPitCandidate[];
};

export function hasMeaningfulAiReferenceContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.goal.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.outline_user.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.chapter.foreshadow_notes_json.length > 0 ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.plannedPits.length > 0 ||
      resources.pitCandidates.length > 0 ||
      resources.pitReviews.length > 0
  );
}

export function hasMeaningfulSummaryExtractionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(resources.chapter.content.trim());
}

export function hasMeaningfulPitSuggestionContext(resources: LoadedChapterAiResources): boolean {
  return Boolean(
    resources.chapter.content.trim() ||
      resources.chapter.title.trim() ||
      resources.chapter.goal.trim() ||
      resources.chapter.next_hook.trim() ||
      resources.chapter.foreshadow_notes_json.length > 0 ||
      resources.linkedCharacters.length > 0 ||
      resources.linkedLoreEntries.length > 0 ||
      resources.referenceChapters.length > 0 ||
      resources.plannedPits.length > 0
  );
}

export function normalizeAiFieldCandidate(text: string): string {
  return text.trim().replace(/^[\s"'“”‘’《》【】]+|[\s"'“”‘’《》【】]+$/gu, '');
}

function normalizePitCandidate(text: string): string {
  return text
    .trim()
    .replace(/^[-*\d.)\s]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parsePitCandidates(text: string): string[] {
  const lines = text
    .split(/\r?\n+/u)
    .map(normalizePitCandidate)
    .filter((item) => item.length > 0);

  if (lines.length > 0) {
    return Array.from(new Set(lines)).slice(0, 6);
  }

  const single = normalizePitCandidate(text);
  return single ? [single] : [];
}

function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('AI returned non-object JSON');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new AppError('AI_OUTPUT_INVALID', error instanceof Error ? error.message : 'AI returned invalid JSON');
  }
}

function ensurePitReviewOutcomeValue(value: unknown): Shared.ChapterPitReviewOutcome {
  return value === 'none' || value === 'partial' || value === 'clear' || value === 'resolved' ? value : 'none';
}

function ensurePitCandidateStatusValue(value: unknown): Shared.ChapterPitCandidateStatus {
  return value === 'draft' || value === 'weak' || value === 'confirmed' || value === 'discarded' ? value : 'draft';
}

export function parseAiPitResponseReviewItems(
  text: string,
  plannedPits: Shared.ChapterPitPlanView[]
): Shared.AiReviewChapterPitResponsesResult['items'] {
  const json = parseJsonRecord(text);
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const plannedByPitId = new Map(plannedPits.map((plan) => [plan.pit.id, plan]));

  const items = rawItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const pitId = typeof item.pitId === 'string' ? item.pitId : '';
      if (!plannedByPitId.has(pitId)) {
        return null;
      }
      return {
        pitId,
        outcome: ensurePitReviewOutcomeValue(item.outcome),
        note: typeof item.note === 'string' ? item.note.trim() : ''
      };
    })
    .filter((item): item is Shared.AiReviewChapterPitResponsesResult['items'][number] => item !== null);

  return Array.from(new Map(items.map((item) => [item.pitId, item])).values());
}

export function parseAiPitCandidateReviewItems(
  text: string,
  pitCandidates: Shared.ChapterPitCandidate[]
): Pick<Shared.AiReviewChapterPitCandidatesResult, 'existingItems' | 'newItems'> {
  const json = parseJsonRecord(text);
  const rawExistingItems = Array.isArray(json.existingItems) ? json.existingItems : [];
  const rawNewItems = Array.isArray(json.newItems) ? json.newItems : [];
  const candidateById = new Map(pitCandidates.map((candidate) => [candidate.id, candidate]));

  const existingItems = rawExistingItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const candidateId = typeof item.candidateId === 'string' ? item.candidateId : '';
      if (!candidateById.has(candidateId)) {
        return null;
      }
      return {
        candidateId,
        status: ensurePitCandidateStatusValue(item.status)
      };
    })
    .filter((item): item is Shared.AiReviewChapterPitCandidatesResult['existingItems'][number] => item !== null);

  const newItems = rawNewItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      content: typeof item.content === 'string' ? normalizePitCandidate(item.content) : '',
      status: ensurePitCandidateStatusValue(item.status)
    }))
    .filter((item) => item.content.length > 0);

  return {
    existingItems: Array.from(new Map(existingItems.map((item) => [item.candidateId, item])).values()),
    newItems: Array.from(new Map(newItems.map((item) => [item.content, item])).values())
  };
}

export async function loadChapterAiResources(chapterId: string): Promise<LoadedChapterAiResources> {
  const chapter = appDatabase.getChapter(chapterId);
  const project = appDatabase.getProject(chapter.project_id);
  const refs = appDatabase.getChapterRefs(chapter.id);
  const allCharacters = appDatabase.listCharacters(chapter.project_id);
  const allLoreEntries = appDatabase.listLoreEntries(chapter.project_id);
  const linkedCharacters = refs.characterIds
    .map((characterId) => allCharacters.find((character) => character.id === characterId) ?? null)
    .filter((character): character is Shared.Character => character !== null);
  const linkedLoreEntries = refs.loreEntryIds
    .map((loreEntryId) => allLoreEntries.find((entry) => entry.id === loreEntryId) ?? null)
    .filter((entry): entry is Shared.LoreEntry => entry !== null);

  return {
    chapter,
    project,
    linkedCharacters,
    linkedLoreEntries,
    referenceChapters: appDatabase.getChapterContextRefs({ chapterId }),
    plannedPits: appDatabase.listChapterPlannedPits({ chapterId }),
    pitReviews: appDatabase.listChapterPitReviews({ chapterId }),
    pitCandidates: appDatabase.listChapterPitCandidates({ chapterId })
  };
}

export async function buildChapterPromptPayload(
  chapterId: string,
  taskType: AiTaskType,
  options: { promptText?: string } = {}
): Promise<{ resources: LoadedChapterAiResources; payload: PromptPayload }> {
  const resources = await loadChapterAiResources(chapterId);
  const context = contextAssembler.assembleChapterContext({
    taskType,
    project: resources.project,
    chapter: resources.chapter,
    linkedCharacters: resources.linkedCharacters,
    linkedLoreEntries: resources.linkedLoreEntries,
    referenceChapters: resources.referenceChapters,
    plannedPits: resources.plannedPits,
    pitReviews: resources.pitReviews,
    pitCandidates: resources.pitCandidates
  });

  return {
    resources,
    payload: promptBuilder.build(context, { transientInstruction: options.promptText })
  };
}

function compactChatText(value: string, maxLength: number): string {
  const normalized = value.replace(/\r\n/gu, '\n').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildChatReferenceText(project: Shared.NovelProject, chapter: Shared.Chapter | null): string {
  const parts: string[] = [
    `作品：${project.title}`,
    project.description ? `作品简介：${compactChatText(project.description, 600)}` : ''
  ];

  if (chapter) {
    parts.push(`当前章节：第 ${chapter.index_no} 章《${chapter.title || '未命名章节'}》`);
    parts.push(chapter.goal ? `本章目标：${compactChatText(chapter.goal, 400)}` : '');
    parts.push(chapter.outline_user ? `本章摘要：${compactChatText(chapter.outline_user, 700)}` : '');
    parts.push(chapter.next_hook ? `下一章钩子：${compactChatText(chapter.next_hook, 400)}` : '');
    parts.push(chapter.content ? `当前正文节选：${compactChatText(chapter.content, 1600)}` : '');
  }

  return parts.filter((part) => part.trim().length > 0).join('\n');
}

export function buildAiChatPayload(input: Shared.AiChatInput): ChatPromptPayload {
  const project = appDatabase.getProject(input.projectId);
  const chapter = input.chapterId ? appDatabase.getChapter(input.chapterId) : null;
  if (chapter && chapter.project_id !== project.id) {
    throw new AppError('VALIDATION_ERROR', '章节不属于当前作品');
  }

  const messages = input.messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    throw new AppError('VALIDATION_ERROR', '请输入要发送给 AI 的内容');
  }

  const referenceText = buildChatReferenceText(project, chapter);
  const configState = getAiProviderConfigState();
  const basePrompt = configState.systemPrompt.trim() || DEFAULT_AI_CHAT_SYSTEM_PROMPT;
  const systemPrompt = [
    basePrompt,
    referenceText ? `以下是当前作品上下文，只在有帮助时引用：\n${referenceText}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemPrompt,
    messages,
    referenceText,
    model: input.model?.trim() || undefined
  };
}

export async function ensureChapterHasInitialOutline(chapter: Shared.Chapter): Promise<Shared.Chapter> {
  if (chapter.outline_user.trim() || !chapter.content.trim()) {
    return chapter;
  }

  try {
    const { resources, payload } = await buildChapterPromptPayload(chapter.id, 'summarizeChapterFromContent');
    if (!hasMeaningfulSummaryExtractionContext(resources)) {
      return chapter;
    }

    const aiResult = await aiService.summarizeChapterFromContent(payload);
    const candidateOutline = aiResult.text.trim();
    if (!candidateOutline) {
      return chapter;
    }

    return appDatabase.updateChapter({
      chapterId: chapter.id,
      patch: {
        outline_user: candidateOutline
      }
    });
  } catch {
    return chapter;
  }
}

