import type { IpcResult } from '../../shared/ipc';

export type IpcResultWrapper = <T>(handler: () => Promise<T> | T) => Promise<IpcResult<T>>;
