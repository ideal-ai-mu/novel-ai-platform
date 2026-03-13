import { AppError } from '../db/database';
import { MockAiProvider } from './mock-provider';
import type { AiProvider, AiTextResult, PromptPayload } from './provider';
import { RealAiProvider } from './real-provider';

function createProvider(): AiProvider {
  const configuredProvider = process.env.NOVEL_AI_PROVIDER?.trim().toLowerCase();
  if (configuredProvider === 'real') {
    return new RealAiProvider();
  }
  return new MockAiProvider();
}

export class AIService {
  constructor(private readonly provider: AiProvider) {}

  private async ensureTextResult(operation: string, action: Promise<AiTextResult>): Promise<AiTextResult> {
    const result = await action;
    const text = result.text.trim();
    if (!text) {
      throw new AppError('AI_OUTPUT_INVALID', `${operation} returned empty text`);
    }

    return {
      ...result,
      text
    };
  }

  public summarizeChapterFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('summarizeChapterFromContent', this.provider.summarizeChapterFromContent(payload));
  }

  public generateChapterTitle(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('generateChapterTitle', this.provider.generateChapterTitle(payload));
  }

  public generateChapterGoal(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('generateChapterGoal', this.provider.generateChapterGoal(payload));
  }

  public generateChapterNextHook(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('generateChapterNextHook', this.provider.generateChapterNextHook(payload));
  }

  public generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('generateChapterPitsFromContent', this.provider.generateChapterPitsFromContent(payload));
  }

  public reviewChapterPitResponses(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('reviewChapterPitResponses', this.provider.reviewChapterPitResponses(payload));
  }

  public reviewChapterPitCandidates(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('reviewChapterPitCandidates', this.provider.reviewChapterPitCandidates(payload));
  }

  public proposeOutlineUpdate(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('proposeOutlineUpdate', this.provider.proposeOutlineUpdate(payload));
  }

  public generateChapterSuggestions(payload: PromptPayload): Promise<AiTextResult> {
    return this.ensureTextResult('generateChapterSuggestions', this.provider.generateChapterSuggestions(payload));
  }
}

export const aiService = new AIService(createProvider());
