import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc';
import type * as Shared from '../../shared/ipc';
import { appDatabase } from '../db/database';
import { ensureDatabaseReady, withIpcResult } from './runtime';

export function registerKnowledgeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CHARACTER_LIST, async (_event, input: { projectId: string }): Promise<Shared.IpcResult<Shared.Character[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listCharacters(input.projectId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHARACTER_CREATE, async (_event, input: Shared.CharacterCreateInput): Promise<Shared.IpcResult<Shared.Character>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createCharacter(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHARACTER_GET, async (_event, input: { characterId: string }): Promise<Shared.IpcResult<Shared.Character>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.getCharacter(input.characterId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHARACTER_UPDATE, async (_event, input: Shared.CharacterUpdateInput): Promise<Shared.IpcResult<Shared.Character>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.updateCharacter(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.CHARACTER_DELETE, async (_event, input: Shared.CharacterDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.deleteCharacter(input.characterId);
    })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_RELATIONSHIP_LIST,
    async (_event, input: Shared.CharacterRelationshipListInput): Promise<Shared.IpcResult<Shared.CharacterRelationshipView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.listCharacterRelationships(input);
      })
  );

  ipcMain.handle(
    IPC_CHANNELS.CHARACTER_RELATIONSHIP_UPSERT,
    async (_event, input: Shared.CharacterRelationshipUpsertInput): Promise<Shared.IpcResult<Shared.CharacterRelationshipView[]>> =>
      withIpcResult(async () => {
        await ensureDatabaseReady();
        return appDatabase.upsertCharacterRelationship(input);
      })
  );

  ipcMain.handle(IPC_CHANNELS.LORE_LIST, async (_event, input: { projectId: string }): Promise<Shared.IpcResult<Shared.LoreEntry[]>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.listLoreEntries(input.projectId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.LORE_CREATE, async (_event, input: Shared.LoreEntryCreateInput): Promise<Shared.IpcResult<Shared.LoreEntry>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.createLoreEntry(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.LORE_GET, async (_event, input: { loreEntryId: string }): Promise<Shared.IpcResult<Shared.LoreEntry>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.getLoreEntry(input.loreEntryId);
    })
  );

  ipcMain.handle(IPC_CHANNELS.LORE_UPDATE, async (_event, input: Shared.LoreEntryUpdateInput): Promise<Shared.IpcResult<Shared.LoreEntry>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.updateLoreEntry(input);
    })
  );

  ipcMain.handle(IPC_CHANNELS.LORE_DELETE, async (_event, input: Shared.LoreEntryDeleteInput): Promise<Shared.IpcResult<Shared.DeleteResult>> =>
    withIpcResult(async () => {
      await ensureDatabaseReady();
      return appDatabase.deleteLoreEntry(input.loreEntryId);
    })
  );
}
