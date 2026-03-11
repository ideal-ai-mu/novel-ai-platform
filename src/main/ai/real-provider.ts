import type { AiProvider, AiTextResult, PromptPayload } from './provider';

export class RealAiProvider implements AiProvider {
  public readonly name = 'real';

  public async summarizeChapterFromContent(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }

  public async generateChapterTitle(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }

  public async generateChapterGoal(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }

  public async generateChapterPitsFromContent(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }

  public async proposeOutlineUpdate(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }

  public async generateChapterSuggestions(_payload: PromptPayload): Promise<AiTextResult> {
    throw new Error('Real AI provider is not configured in the current sprint');
  }
}
