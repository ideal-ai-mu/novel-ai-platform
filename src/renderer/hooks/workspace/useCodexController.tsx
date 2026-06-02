import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppApi } from '../../../shared/preload-api';
import type { Character, IpcResult, LoreEntry, NovelProject } from '../../../shared/ipc';
import type { CodexSection, WorkspaceView } from '../../types';

type UseCodexControllerArgs = {
  activeProject: NovelProject | null;
  setWorkspaceView: (view: WorkspaceView) => void;
  resolveAppApi: () => AppApi | null;
  unwrapResult: <T>(result: IpcResult<T>, onError: (message: string) => void, prefix: string) => Promise<T | null>;
  onFeedback: (message: string) => void;
  customConfirm: (title: string, message: string, danger?: boolean) => Promise<boolean>;
};

export type CodexEntry = Character | LoreEntry;

export type CodexEditorState = {
  type: 'character' | 'lore' | null;
  id: string | null;
  name: string;
  roleType: string;
  summary: string;
  details: string;
  loreType: string;
  loreTitle: string;
  loreContent: string;
  loreTags: string[];
};

const DEFAULT_CHARACTER_NAME = '未命名人物';
const DEFAULT_LORE_TITLE = '未命名设定';

function defaultEditorState(): CodexEditorState {
  return {
    type: null,
    id: null,
    name: '',
    roleType: '',
    summary: '',
    details: '',
    loreType: 'location',
    loreTitle: '',
    loreContent: '',
    loreTags: []
  };
}

function isCharacter(entry: CodexEntry): entry is Character {
  return 'role_type' in entry;
}

function isLore(entry: CodexEntry): entry is LoreEntry {
  return 'type' in entry && !('role_type' in entry);
}

function getEditorSnapshot(state: CodexEditorState): string {
  return JSON.stringify({
    type: state.type,
    id: state.id,
    name: state.name,
    roleType: state.roleType,
    summary: state.summary,
    details: state.details,
    loreType: state.loreType,
    loreTitle: state.loreTitle,
    loreContent: state.loreContent,
    loreTags: state.loreTags
  });
}

export function useCodexController({
  activeProject,
  setWorkspaceView,
  resolveAppApi,
  unwrapResult,
  onFeedback,
  customConfirm
}: UseCodexControllerArgs) {
  const [codexSection, setCodexSection] = useState<CodexSection>('characters');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loreEntries, setLoreEntries] = useState<LoreEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editorState, setEditorState] = useState<CodexEditorState>(defaultEditorState());
  const [isLoading, setIsLoading] = useState(false);
  const lastSavedEditorSnapshotRef = useRef(getEditorSnapshot(defaultEditorState()));

  const currentEntries = codexSection === 'characters' ? characters : loreEntries;

  const filteredEntries = currentEntries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    if (isCharacter(entry)) {
      return (
        entry.name.toLowerCase().includes(query) ||
        entry.role_type.toLowerCase().includes(query) ||
        entry.summary.toLowerCase().includes(query)
      );
    }
    if (isLore(entry)) {
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query) ||
        entry.summary.toLowerCase().includes(query) ||
        entry.tags_json.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return false;
  });

  const loadCharacters = useCallback(async () => {
    if (!activeProject) return;
    const api = resolveAppApi();
    if (!api) return;

    setIsLoading(true);
    const data = await unwrapResult(await api.character.list(activeProject.id), onFeedback, '加载角色失败');
    setIsLoading(false);
    if (data) setCharacters(data);
  }, [activeProject, resolveAppApi, unwrapResult, onFeedback]);

  const loadLoreEntries = useCallback(async () => {
    if (!activeProject) return;
    const api = resolveAppApi();
    if (!api) return;

    setIsLoading(true);
    const data = await unwrapResult(await api.lore.list(activeProject.id), onFeedback, '加载设定失败');
    setIsLoading(false);
    if (data) setLoreEntries(data);
  }, [activeProject, resolveAppApi, unwrapResult, onFeedback]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCharacters(), loadLoreEntries()]);
  }, [loadCharacters, loadLoreEntries]);

  const handleOpenCodex = useCallback(
    (section?: CodexSection) => {
      if (section) setCodexSection(section);
      if (!activeProject) {
        onFeedback('请先选择一个作品');
        return;
      }
      setWorkspaceView('studio');
      void loadAll();
    },
    [activeProject, loadAll, onFeedback, setWorkspaceView]
  );

  const handleSelectSection = useCallback(
    (section: CodexSection) => {
      setCodexSection(section);
      setSelectedEntry(null);
      setSearchQuery('');
    },
    []
  );

  const handleSelectEntry = useCallback((entry: CodexEntry | null) => {
    setSelectedEntry(entry);
  }, []);

  const openNewEntryEditor = useCallback(
    (type: 'character' | 'lore', loreType?: string) => {
      setEditorState({
        type,
        id: null,
        name: '',
        roleType: '',
        summary: '',
        details: '',
        loreType: type === 'lore' ? loreType ?? 'location' : '',
        loreTitle: '',
        loreContent: '',
        loreTags: []
      });
      setShowEditor(true);
    },
    []
  );

  const openEditEntryEditor = useCallback(async (entry: CodexEntry) => {
    if (showEditor && editorState.id && editorState.id !== entry.id) {
      await persistEditorState(editorState, true);
    }

    if (isCharacter(entry)) {
      const nextState: CodexEditorState = {
        type: 'character',
        id: entry.id,
        name: entry.name,
        roleType: entry.role_type,
        summary: entry.summary,
        details: entry.details,
        loreType: '',
        loreTitle: '',
        loreContent: '',
        loreTags: []
      };
      lastSavedEditorSnapshotRef.current = getEditorSnapshot(nextState);
      setEditorState(nextState);
    } else if (isLore(entry)) {
      const nextState: CodexEditorState = {
        type: 'lore',
        id: entry.id,
        name: '',
        roleType: '',
        summary: '',
        details: '',
        loreType: entry.type,
        loreTitle: entry.title,
        loreContent: entry.content,
        loreTags: entry.tags_json
      };
      lastSavedEditorSnapshotRef.current = getEditorSnapshot(nextState);
      setEditorState(nextState);
    }
    setShowEditor(true);
  }, [editorState, showEditor]);

  const openOrCreateEntryEditor = useCallback(
    async (type: 'character' | 'lore', loreType?: string) => {
      if (!activeProject) {
        onFeedback('请先选择一个作品');
        return;
      }

      const api = resolveAppApi();
      if (!api) {
        onFeedback('请通过 Electron 启动应用。');
        return;
      }

      if (type === 'character') {
        const existing = characters.find((entry) => entry.name.trim() === DEFAULT_CHARACTER_NAME);
        if (existing) {
          await openEditEntryEditor(existing);
          return;
        }

        const result = await unwrapResult(
          await api.character.create({
            projectId: activeProject.id,
            name: DEFAULT_CHARACTER_NAME,
            roleType: '',
            summary: '',
            details: ''
          }),
          onFeedback,
          '创建角色失败'
        );
        if (result) {
          setCharacters((prev) => [...prev, result]);
          setSelectedEntry(result);
          await openEditEntryEditor(result);
        }
        return;
      }

      const nextLoreType = loreType ?? 'location';
      const existing = loreEntries.find(
        (entry) => entry.type === nextLoreType && entry.title.trim() === DEFAULT_LORE_TITLE
      );
      if (existing) {
        await openEditEntryEditor(existing);
        return;
      }

      const result = await unwrapResult(
        await api.lore.create({
          projectId: activeProject.id,
          type: nextLoreType,
          title: DEFAULT_LORE_TITLE,
          summary: '',
          content: '',
          tagsJson: []
        }),
        onFeedback,
        '创建设定失败'
      );
      if (result) {
        setLoreEntries((prev) => [...prev, result]);
        setSelectedEntry(result);
        await openEditEntryEditor(result);
      }
    },
    [activeProject, characters, loreEntries, onFeedback, openEditEntryEditor, resolveAppApi, unwrapResult]
  );

  const closeEditor = useCallback(() => {
    setShowEditor(false);
    const nextState = defaultEditorState();
    lastSavedEditorSnapshotRef.current = getEditorSnapshot(nextState);
    setEditorState(nextState);
  }, []);

  const persistEditorState = useCallback(
    async (state: CodexEditorState, silent = false): Promise<boolean> => {
      const api = resolveAppApi();
      if (!api || !activeProject) {
        onFeedback('请通过 Electron 启动应用。');
        return false;
      }

      if (state.type === 'character') {
        const name = state.name.trim() || DEFAULT_CHARACTER_NAME;
        if (!name) {
          onFeedback('请输入角色名称');
          return false;
        }

        if (state.id) {
          const result = await unwrapResult(
            await api.character.update({
              characterId: state.id,
              patch: {
                name,
                role_type: state.roleType,
                summary: state.summary,
                details: state.details
              }
            }),
            onFeedback,
            '更新角色失败'
          );
          if (result) {
            setCharacters((prev) => prev.map((c) => (c.id === result.id ? result : c)));
            setSelectedEntry(result);
            if (!silent) onFeedback(`已更新角色：${name}`);
            return true;
          }
        } else {
          const result = await unwrapResult(
            await api.character.create({
              projectId: activeProject.id,
              name,
              roleType: state.roleType,
              summary: state.summary,
              details: state.details
            }),
            onFeedback,
            '创建角色失败'
          );
          if (result) {
            setCharacters((prev) => [...prev, result]);
            setSelectedEntry(result);
            if (!silent) onFeedback(`已创建角色：${name}`);
            return true;
          }
        }
      } else if (state.type === 'lore') {
        const title = state.loreTitle.trim() || DEFAULT_LORE_TITLE;
        if (!title) {
          onFeedback('请输入设定标题');
          return false;
        }

        if (state.id) {
          const result = await unwrapResult(
            await api.lore.update({
              loreEntryId: state.id,
              patch: {
                type: state.loreType,
                title,
                summary: state.summary,
                content: state.loreContent,
                tags_json: state.loreTags
              }
            }),
            onFeedback,
            '更新设定失败'
          );
          if (result) {
            setLoreEntries((prev) => prev.map((l) => (l.id === result.id ? result : l)));
            setSelectedEntry(result);
            if (!silent) onFeedback(`已更新设定：${title}`);
            return true;
          }
        } else {
          const result = await unwrapResult(
            await api.lore.create({
              projectId: activeProject.id,
              type: state.loreType,
              title,
              summary: state.summary,
              content: state.loreContent,
              tagsJson: state.loreTags
            }),
            onFeedback,
            '创建设定失败'
          );
          if (result) {
            setLoreEntries((prev) => [...prev, result]);
            setSelectedEntry(result);
            if (!silent) onFeedback(`已创建设定：${title}`);
            return true;
          }
        }
      }

      return false;
    },
    [activeProject, onFeedback, resolveAppApi, unwrapResult]
  );

  const saveEntry = useCallback(
    async () => {
      const saved = await persistEditorState(editorState);
      if (!saved) return;
      closeEditor();
    },
    [closeEditor, editorState, persistEditorState]
  );

  const handleDeleteEntry = useCallback(
    async (entry: CodexEntry) => {
      const isChar = isCharacter(entry);
      const name = isChar ? (entry as Character).name : (entry as LoreEntry).title;

      if (!await customConfirm('删除确认', `确认删除${isChar ? '角色' : '设定'}「${name}」？`)) {
        return;
      }

      const api = resolveAppApi();
      if (!api) {
        onFeedback('请通过 Electron 启动应用。');
        return;
      }

      if (isChar) {
        const result = await unwrapResult(
          await api.character.delete({ characterId: (entry as Character).id }),
          onFeedback,
          '删除角色失败'
        );
        if (result?.deleted) {
          setCharacters((prev) => prev.filter((c) => c.id !== (entry as Character).id));
          if (selectedEntry?.id === (entry as Character).id) setSelectedEntry(null);
          onFeedback(`已删除角色：${name}`);
        }
      } else {
        const result = await unwrapResult(
          await api.lore.delete({ loreEntryId: (entry as LoreEntry).id }),
          onFeedback,
          '删除设定失败'
        );
        if (result?.deleted) {
          setLoreEntries((prev) => prev.filter((l) => l.id !== (entry as LoreEntry).id));
          if (selectedEntry?.id === (entry as LoreEntry).id) setSelectedEntry(null);
          onFeedback(`已删除设定：${name}`);
        }
      }
    },
    [onFeedback, resolveAppApi, selectedEntry, unwrapResult]
  );

  const updateCharacterDetails = useCallback(
    async (characterId: string, details: string): Promise<Character | null> => {
      const api = resolveAppApi();
      if (!api || !activeProject) {
        onFeedback('请通过 Electron 启动应用。');
        return null;
      }

      const result = await unwrapResult(
        await api.character.update({
          characterId,
          patch: { details }
        }),
        onFeedback,
        '更新人物关系说明失败'
      );
      if (result) {
        setCharacters((prev) => prev.map((item) => (item.id === result.id ? result : item)));
        if (selectedEntry?.id === result.id) {
          setSelectedEntry(result);
        }
      }
      return result;
    },
    [activeProject, onFeedback, resolveAppApi, selectedEntry, unwrapResult]
  );

  const handleBack = useCallback(() => {
    setWorkspaceView('home');
    setSelectedEntry(null);
    setSearchQuery('');
  }, [setWorkspaceView]);

  const updateEditorField = useCallback(
    <K extends keyof CodexEditorState>(field: K, value: CodexEditorState[K]) => {
      setEditorState((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  useEffect(() => {
    if (!showEditor || !editorState.id || !editorState.type) {
      return undefined;
    }

    const snapshot = getEditorSnapshot(editorState);
    if (snapshot === lastSavedEditorSnapshotRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void persistEditorState(editorState, true).then((saved) => {
        if (saved) {
          lastSavedEditorSnapshotRef.current = snapshot;
        }
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [editorState, persistEditorState, showEditor]);

  return {
    codexSection,
    characters,
    loreEntries,
    selectedEntry,
    searchQuery,
    showEditor,
    editorState,
    isLoading,
    filteredEntries,
    loadAll,
    handleOpenCodex,
    handleSelectSection,
    handleSelectEntry,
    openNewEntryEditor,
    openOrCreateEntryEditor,
    openEditEntryEditor,
    closeEditor,
    saveEntry,
    handleDeleteEntry,
    updateCharacterDetails,
    handleBack,
    setSearchQuery,
    updateEditorField
  };
}
