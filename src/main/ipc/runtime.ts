import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { AppError } from '../db/errors';

export type RegisterIpcHandlersOptions = {
  getAutosaveIntervalSeconds: () => Shared.AutosaveIntervalSeconds;
};

function toIpcError(error: unknown): Shared.IpcError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown error'
  };
}

export async function withIpcResult<T>(handler: () => T | Promise<T>): Promise<Shared.IpcResult<T>> {
  try {
    const data = await handler();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toIpcError(error) };
  }
}

export async function ensureDatabaseReady(): Promise<void> {
  await appDatabase.init();
}
