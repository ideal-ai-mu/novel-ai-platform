import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { DEFAULT_AI_CHAT_SYSTEM_PROMPT, DEFAULT_AI_PROMPT_TEMPLATES } from '../../shared/ipc';
import type { AiPromptTemplates, AiProviderConfig, AiProviderConfigDeleteInput, AiProviderConfigState, AiProviderConfigUpdateInput } from '../../shared/ipc';
import { AppError } from '../db/errors';

const DEFAULT_AI_CONFIG: AiProviderConfig = {
  id: 'openai-compatible',
  providerType: 'openai-compatible',
  connectionName: 'OpenAI Compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: 'gpt-5.4-mini',
  customModels: 'gpt-5.4-mini\ngpt-5.4\ngpt-4.1-mini'
};

const EMPTY_AI_CONFIG: AiProviderConfig = {
  id: '',
  providerType: 'openai-compatible',
  connectionName: 'OpenAI Compatible',
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  customModels: ''
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-provider-config.json');
}

function normalizeConfig(value: Partial<AiProviderConfig>, fallback: AiProviderConfig): AiProviderConfig {
  return {
    id: value.id?.trim() || fallback.id || randomUUID(),
    providerType: value.providerType === 'openai' ? 'openai' : value.providerType === 'openai-compatible' ? 'openai-compatible' : fallback.providerType,
    connectionName: value.connectionName?.trim() || fallback.connectionName,
    baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl.trim() : fallback.baseUrl,
    apiKey: value.apiKey ?? fallback.apiKey,
    defaultModel: typeof value.defaultModel === 'string' ? value.defaultModel.trim() : fallback.defaultModel,
    customModels: value.customModels ?? fallback.customModels
  };
}

function getMigratedSystemPrompt(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return DEFAULT_AI_CHAT_SYSTEM_PROMPT;
  }

  const raw = value as {
    systemPrompt?: unknown;
    connections?: Array<{ systemPrompt?: unknown }>;
  };

  if (typeof raw.systemPrompt === 'string') {
    return raw.systemPrompt;
  }

  const migrated = raw.connections?.find((connection) => typeof connection.systemPrompt === 'string')?.systemPrompt;
  return typeof migrated === 'string' ? migrated : DEFAULT_AI_CHAT_SYSTEM_PROMPT;
}

function normalizePromptTemplates(value: unknown): AiPromptTemplates {
  const raw = value && typeof value === 'object'
    ? (value as { promptTemplates?: Record<string, unknown> }).promptTemplates
    : null;

  return {
    continue: typeof raw?.continue === 'string' ? raw.continue : DEFAULT_AI_PROMPT_TEMPLATES.continue,
    rewrite: typeof raw?.rewrite === 'string' ? raw.rewrite : DEFAULT_AI_PROMPT_TEMPLATES.rewrite,
    polish: typeof raw?.polish === 'string' ? raw.polish : DEFAULT_AI_PROMPT_TEMPLATES.polish,
    generate: typeof raw?.generate === 'string' ? raw.generate : (typeof raw?.['summarize'] === 'string' ? raw['summarize'] : DEFAULT_AI_PROMPT_TEMPLATES.generate),
    inspiration: typeof raw?.inspiration === 'string' ? raw.inspiration : DEFAULT_AI_PROMPT_TEMPLATES.inspiration,
    relationshipGraph: typeof raw?.relationshipGraph === 'string' ? raw.relationshipGraph : DEFAULT_AI_PROMPT_TEMPLATES.relationshipGraph,
    timelineStoryTime: typeof raw?.timelineStoryTime === 'string' ? raw.timelineStoryTime : DEFAULT_AI_PROMPT_TEMPLATES.timelineStoryTime,
    timeline: typeof raw?.timeline === 'string' ? raw.timeline : DEFAULT_AI_PROMPT_TEMPLATES.timeline,
    chapterWrapUp: typeof raw?.chapterWrapUp === 'string' ? raw.chapterWrapUp : DEFAULT_AI_PROMPT_TEMPLATES.chapterWrapUp,
    proofread: typeof raw?.proofread === 'string' ? raw.proofread : DEFAULT_AI_PROMPT_TEMPLATES.proofread
  };
}

function normalizeConfigState(value: unknown): AiProviderConfigState {
  if (value && typeof value === 'object' && Array.isArray((value as Partial<AiProviderConfigState>).connections)) {
    const rawState = value as Partial<AiProviderConfigState>;
    const connections = (rawState.connections ?? [])
      .map((connection) => normalizeConfig(connection, EMPTY_AI_CONFIG))
      .filter((connection) => connection.id.trim().length > 0);
    const fallbackConnections = connections.length > 0 ? connections : [getDefaultConfig()];
    const activeConnectionId = fallbackConnections.some((connection) => connection.id === rawState.activeConnectionId)
      ? rawState.activeConnectionId ?? fallbackConnections[0].id
      : fallbackConnections[0].id;
    return {
      connections: fallbackConnections,
      activeConnectionId,
      systemPrompt: getMigratedSystemPrompt(value),
      promptTemplates: normalizePromptTemplates(value)
    };
  }

  return {
    connections: [normalizeConfig(value as Partial<AiProviderConfig>, getDefaultConfig())],
    activeConnectionId: (value as Partial<AiProviderConfig> | null)?.id?.trim() || DEFAULT_AI_CONFIG.id,
    systemPrompt: getMigratedSystemPrompt(value),
    promptTemplates: normalizePromptTemplates(value)
  };
}

function getDefaultConfig(): AiProviderConfig {
  return {
    ...DEFAULT_AI_CONFIG,
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_AI_CONFIG.baseUrl,
    defaultModel: process.env.OPENAI_MODEL?.trim() || DEFAULT_AI_CONFIG.defaultModel
  };
}

function writeConfigState(state: AiProviderConfigState): void {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(state, null, 2), 'utf8');
}

export function getAiProviderConfigState(): AiProviderConfigState {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return normalizeConfigState(JSON.parse(raw) as unknown);
  } catch {
    const defaultConfig = getDefaultConfig();
    return {
      connections: [defaultConfig],
      activeConnectionId: defaultConfig.id,
      systemPrompt: DEFAULT_AI_CHAT_SYSTEM_PROMPT,
      promptTemplates: normalizePromptTemplates(null)
    };
  }
}

export function getAiProviderConfig(): AiProviderConfig {
  const state = getAiProviderConfigState();
  return state.connections.find((connection) => connection.id === state.activeConnectionId) ?? state.connections[0] ?? getDefaultConfig();
}

function connectionHasModel(connection: AiProviderConfig, model: string): boolean {
  const models = connection.customModels
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return connection.defaultModel === model || models.includes(model);
}

export function getAiProviderConfigForModel(model?: string): AiProviderConfig {
  const state = getAiProviderConfigState();
  const activeConfig = state.connections.find((connection) => connection.id === state.activeConnectionId) ?? state.connections[0] ?? getDefaultConfig();
  const requestedModel = model?.trim();
  if (!requestedModel || connectionHasModel(activeConfig, requestedModel)) {
    return activeConfig;
  }

  return state.connections.find((connection) => connectionHasModel(connection, requestedModel)) ?? activeConfig;
}

export function updateAiProviderConfig(input: AiProviderConfigUpdateInput): AiProviderConfigState {
  const state = getAiProviderConfigState();
  const nextSystemPrompt = typeof input.systemPrompt === 'string' ? input.systemPrompt : state.systemPrompt;
  const nextPromptTemplates = input.promptTemplates
    ? normalizePromptTemplates({ promptTemplates: { ...state.promptTemplates, ...input.promptTemplates } })
    : state.promptTemplates;
  const connectionKeys: Array<keyof AiProviderConfig> = ['id', 'providerType', 'connectionName', 'baseUrl', 'apiKey', 'defaultModel', 'customModels'];
  if (!connectionKeys.some((key) => typeof input[key] !== 'undefined')) {
    const nextState = {
      ...state,
      systemPrompt: nextSystemPrompt,
      promptTemplates: nextPromptTemplates
    };
    writeConfigState(nextState);
    return nextState;
  }

  const inputId = input.id?.trim() || randomUUID();
  const existingIndex = state.connections.findIndex((connection) => connection.id === inputId);
  const fallback = existingIndex >= 0 ? state.connections[existingIndex] : { ...EMPTY_AI_CONFIG, id: inputId };
  const nextConnection = normalizeConfig({ ...fallback, ...input, id: inputId }, fallback);
  const nextConnections = [...state.connections];

  if (existingIndex >= 0) {
    nextConnections[existingIndex] = nextConnection;
  } else {
    nextConnections.push(nextConnection);
  }

  const nextState = {
    connections: nextConnections,
    activeConnectionId: nextConnection.id,
    systemPrompt: nextSystemPrompt,
    promptTemplates: nextPromptTemplates
  };
  writeConfigState(nextState);
  return nextState;
}

export function deleteAiProviderConfig(input: AiProviderConfigDeleteInput): AiProviderConfigState {
  const state = getAiProviderConfigState();
  const deleteId = input.id.trim();
  if (!deleteId) {
    throw new AppError('VALIDATION_ERROR', '缺少要删除的连接 ID');
  }

  const nextConnections = state.connections.filter((connection) => connection.id !== deleteId);
  if (nextConnections.length === state.connections.length) {
    return state;
  }

  const fallbackConnection = nextConnections[0] ?? getDefaultConfig();
  const finalConnections = nextConnections.length > 0 ? nextConnections : [fallbackConnection];
  const nextState = {
    ...state,
    connections: finalConnections,
    activeConnectionId: state.activeConnectionId === deleteId ? fallbackConnection.id : state.activeConnectionId
  };
  writeConfigState(nextState);
  return nextState;
}

type ModelListResponse = {
  data?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
};

export async function listCompatibleModels(input: { baseUrl: string; apiKey: string }): Promise<string[]> {
  const baseUrl = input.baseUrl.trim();
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return [];
  }

  const response = await fetch(`${baseUrl.replace(/\/$/u, '')}/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  const body = (await response.json()) as ModelListResponse;
  if (!response.ok) {
    throw new AppError('AI_PROVIDER_ERROR', body.error?.message || `Failed to fetch models: ${response.status}`);
  }

  return Array.from(
    new Set((body.data ?? []).map((item) => item.id?.trim() ?? '').filter((id) => id.length > 0))
  );
}
