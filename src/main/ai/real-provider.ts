import { AppError } from '../db/errors';
import { getAiProviderConfigForModel } from './ai-config';
import type { AiProvider, AiTextResult, ChatPromptPayload, PromptPayload } from './provider';

type OpenAIResponseContent = {
  text?: string;
  content?: string;
};

type OpenAIResponseItem = {
  content?: OpenAIResponseContent[] | string;
};

type OpenAIResponseBody = {
  output_text?: string;
  output?: OpenAIResponseItem[];
  error?: {
    message?: string;
  };
};

type ChatCompletionBody = {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: string;
    };
    delta?: {
      content?: unknown;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function parseJsonBody<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseEventStreamBodies(raw: string): unknown[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== '[DONE]')
    .map((line) => parseJsonBody<unknown>(line))
    .filter((body): body is unknown => body !== null);
}

function extractProviderError(raw: string): string {
  const json = parseJsonBody<{ error?: { message?: string } }>(raw);
  if (json?.error?.message) {
    return json.error.message;
  }

  for (const body of parseEventStreamBodies(raw)) {
    const message = (body as { error?: { message?: string } }).error?.message;
    if (message) {
      return message;
    }
  }

  return '';
}

function extractContentText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractContentText).join('');
  }

  if (value && typeof value === 'object') {
    const record = value as {
      text?: unknown;
      content?: unknown;
      output_text?: unknown;
      delta?: unknown;
      value?: unknown;
      completion?: unknown;
      answer?: unknown;
      result?: unknown;
      reasoning_content?: unknown;
    };
    return [
      extractContentText(record.text),
      extractContentText(record.content),
      extractContentText(record.output_text),
      extractContentText(record.delta),
      extractContentText(record.value),
      extractContentText(record.completion),
      extractContentText(record.answer),
      extractContentText(record.result),
      extractContentText(record.reasoning_content)
    ].join('');
  }

  return '';
}

function describeResponseShape(value: unknown, depth = 0): unknown {
  if (depth > 3) {
    return '...';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? [describeResponseShape(value[0], depth + 1)] : [];
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 12)
        .map(([key, entry]) => [key, typeof entry === 'string' ? `string(${entry.length})` : describeResponseShape(entry, depth + 1)])
    );
  }

  return typeof value;
}

function buildEmptyTextDebug(raw: string): string {
  const bodies = parseJsonBody<unknown>(raw) ? [parseJsonBody<unknown>(raw)] : parseEventStreamBodies(raw);
  const shape = bodies[0] ? describeResponseShape(bodies[0]) : raw.slice(0, 220);
  return `chat returned empty text；返回结构：${JSON.stringify(shape).slice(0, 500)}`;
}

function extractResponseText(body: OpenAIResponseBody): string {
  if (typeof body.output_text === 'string') {
    return body.output_text;
  }

  return (body.output ?? [])
    .map((item) => extractContentText(item.content))
    .join('')
    .trim();
}

function extractResponseTextFromRaw(raw: string): string {
  const json = parseJsonBody<OpenAIResponseBody>(raw);
  if (json) {
    return extractResponseText(json);
  }

  return parseEventStreamBodies(raw)
    .map((body) => {
      const event = body as {
        delta?: string;
        response?: OpenAIResponseBody;
        output_text?: string;
      };
      return event.delta ?? event.output_text ?? (event.response ? extractResponseText(event.response) : '');
    })
    .filter(Boolean)
    .join('')
    .trim();
}

function extractChatCompletionText(raw: string): string {
  const json = parseJsonBody<ChatCompletionBody>(raw);
  if (json) {
    const chatText = json.choices?.map((choice) => (
      extractContentText(choice.message?.content) ||
      extractContentText(choice.delta?.content) ||
      extractContentText((choice as { text?: unknown }).text) ||
      choice.message?.reasoning_content ||
      choice.delta?.reasoning_content ||
      ''
    )).join('').trim() ?? '';
    return chatText || extractResponseText(json as OpenAIResponseBody) || extractContentText(json);
  }

  return parseEventStreamBodies(raw)
    .map((body) => {
      const chunk = body as ChatCompletionBody & {
        delta?: unknown;
        output_text?: unknown;
        response?: OpenAIResponseBody;
        type?: string;
      };
      const chatText = chunk.choices?.map((choice) => (
        extractContentText(choice.delta?.content) ||
        extractContentText(choice.message?.content) ||
        extractContentText((choice as { text?: unknown }).text) ||
        choice.delta?.reasoning_content ||
        choice.message?.reasoning_content ||
        ''
      )).join('') ?? '';
      return chatText ||
        extractContentText(chunk.delta) ||
        extractContentText(chunk.output_text) ||
        (chunk.response ? extractResponseText(chunk.response) : '') ||
        extractContentText(chunk);
    })
    .join('')
    .trim();
}

export class RealAiProvider implements AiProvider {
  public readonly name = 'openai';

  private readonly apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  private readonly model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
  private readonly endpoint = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
  private async createResponse(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, modelOverride?: string): Promise<AiTextResult> {
    if (!this.apiKey) {
      throw new AppError('AI_NOT_CONFIGURED', '缺少 OPENAI_API_KEY，无法调用真实大模型');
    }

    const model = modelOverride?.trim() || this.model;
    const input = [
      {
        role: 'developer',
        content: systemPrompt
      },
      ...messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    const response = await fetch(`${this.endpoint.replace(/\/$/u, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input
      })
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new AppError('AI_PROVIDER_ERROR', extractProviderError(raw) || `OpenAI request failed: ${response.status}`);
    }

    return {
      provider: this.name,
      model,
      text: extractResponseTextFromRaw(raw)
    };
  }

  private runPrompt(payload: PromptPayload): Promise<AiTextResult> {
    return this.createResponse(payload.systemPrompt, [{ role: 'user', content: payload.userPrompt }]);
  }

  private async createChatCompletion(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string,
    options: { apiKey: string; baseUrl: string; providerName: string }
  ): Promise<AiTextResult> {
    if (!options.apiKey) {
      throw new AppError('AI_NOT_CONFIGURED', '请先在模型配置里填写 API Key');
    }

    const response = await fetch(`${options.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new AppError('AI_PROVIDER_ERROR', extractProviderError(raw) || `AI request failed: ${response.status}`);
    }

    const text = extractChatCompletionText(raw);
    if (!text) {
      throw new AppError('AI_OUTPUT_INVALID', buildEmptyTextDebug(raw));
    }

    return {
      provider: options.providerName,
      model,
      text
    };
  }

  private async createResponsesCompletion(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string,
    options: { apiKey: string; baseUrl: string; providerName: string }
  ): Promise<AiTextResult> {
    if (!options.apiKey) {
      throw new AppError('AI_NOT_CONFIGURED', '请先在模型配置里填写 API Key');
    }

    const response = await fetch(`${options.baseUrl.replace(/\/$/u, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'developer', content: systemPrompt },
          ...messages
        ]
      })
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new AppError('AI_PROVIDER_ERROR', extractProviderError(raw) || `Responses API request failed: ${response.status}`);
    }

    const text = extractResponseTextFromRaw(raw);
    if (!text) {
      throw new AppError('AI_OUTPUT_INVALID', buildEmptyTextDebug(raw));
    }

    return {
      provider: options.providerName,
      model,
      text
    };
  }

  public summarizeChapterFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public generateChapterTitle(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public generateChapterGoal(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public generateChapterNextHook(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public generateChapterPitsFromContent(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public reviewChapterPitResponses(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public reviewChapterPitCandidates(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public proposeOutlineUpdate(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public generateChapterSuggestions(payload: PromptPayload): Promise<AiTextResult> {
    return this.runPrompt(payload);
  }

  public chat(payload: ChatPromptPayload): Promise<AiTextResult> {
    const config = getAiProviderConfigForModel(payload.model);
    const model = payload.model?.trim() || config.defaultModel || this.model;
    const options = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      providerName: config.connectionName
    };

    return config.providerType === 'openai'
      ? this.createResponsesCompletion(payload.systemPrompt, payload.messages, model, options)
      : this.createChatCompletion(payload.systemPrompt, payload.messages, model, options);
  }
}
