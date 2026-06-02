import { useEffect, useRef } from 'react';
import type { Character, LoreEntry, NovelProject } from '../../shared/ipc';
import type { CodexSection } from '../types';
import type { CodexEditorState, CodexEntry } from '../hooks/workspace/useCodexController';

export type CodexPageProps = {
  activeProject: NovelProject | null;
  codexSection: CodexSection;
  characters: Character[];
  loreEntries: LoreEntry[];
  selectedEntry: CodexEntry | null;
  searchQuery: string;
  showEditor: boolean;
  editorState: CodexEditorState;
  isLoading: boolean;
  filteredEntries: CodexEntry[];
  onSelectSection: (section: CodexSection) => void;
  onSelectEntry: (entry: CodexEntry | null) => void;
  onOpenNewEntryEditor: (type: 'character' | 'lore') => void;
  onOpenEditEntryEditor: (entry: CodexEntry) => void;
  onCloseEditor: () => void;
  onSaveEntry: () => Promise<void>;
  onDeleteEntry: (entry: CodexEntry) => void;
  onBack: () => void;
  onSearchChange: (query: string) => void;
  onUpdateEditorField: <K extends keyof CodexEditorState>(field: K, value: CodexEditorState[K]) => void;
};

export function CodexPage({
  activeProject,
  codexSection,
  characters,
  loreEntries,
  selectedEntry,
  searchQuery,
  showEditor,
  editorState,
  isLoading,
  filteredEntries,
  onSelectSection,
  onSelectEntry,
  onOpenNewEntryEditor,
  onOpenEditEntryEditor,
  onCloseEditor,
  onSaveEntry,
  onDeleteEntry,
  onBack,
  onSearchChange,
  onUpdateEditorField
}: CodexPageProps): JSX.Element {
  const editorModalRef = useRef<HTMLDivElement | null>(null);
  const sectionTitle = codexSection === 'characters' ? '人物百科' : '设定资料';
  const entryCount = codexSection === 'characters' ? characters.length : loreEntries.length;

  useEffect(() => {
    if (!showEditor) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && editorModalRef.current?.contains(target)) {
        return;
      }

      onCloseEditor();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseEditor();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCloseEditor, showEditor]);

  return (
    <section className="codex-page-shell">
      <header className="codex-page-header">
        <div className="codex-page-header-left">
          <button type="button" className="codex-back-btn" onClick={onBack}>
            <span className="codex-back-icon">←</span>
            <span>返回</span>
          </button>
          <h1 className="codex-page-title">{sectionTitle}</h1>
          {activeProject && <span className="codex-project-name">《{activeProject.title}》</span>}
        </div>
        <div className="codex-page-header-right">
          <div className="codex-section-tabs">
            <button
              type="button"
              className={`codex-tab ${codexSection === 'characters' ? 'active' : ''}`}
              onClick={() => onSelectSection('characters')}
            >
              人物
              <span className="codex-tab-count">{characters.length}</span>
            </button>
            <button
              type="button"
              className={`codex-tab ${codexSection === 'lore' ? 'active' : ''}`}
              onClick={() => onSelectSection('lore')}
            >
              设定
              <span className="codex-tab-count">{loreEntries.length}</span>
            </button>
          </div>
          <button
            type="button"
            className="codex-add-btn"
            onClick={() => onOpenNewEntryEditor(codexSection === 'characters' ? 'character' : 'lore')}
          >
            + 新建
          </button>
        </div>
      </header>

      <div className="codex-page-body">
        <div className="codex-list-panel">
          <div className="codex-search-bar">
            <input
              type="text"
              className="codex-search-input"
              placeholder="搜索名称、类型、摘要..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="codex-entry-list">
            {isLoading ? (
              <div className="codex-loading">加载中...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="codex-empty">
                <p>暂无{codexSection === 'characters' ? '角色' : '设定'}</p>
                <button
                  type="button"
                  className="codex-empty-add-btn"
                  onClick={() => onOpenNewEntryEditor(codexSection === 'characters' ? 'character' : 'lore')}
                >
                  创建第一个{codexSection === 'characters' ? '角色' : '设定'}
                </button>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isChar = 'role_type' in entry;
                const name = isChar ? (entry as Character).name : (entry as LoreEntry).title;
                const subtype = isChar ? (entry as Character).role_type : (entry as LoreEntry).type;
                const summary = (entry as Character | LoreEntry).summary;

                return (
                  <div
                    key={entry.id}
                    className={`codex-entry-card ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
                    onClick={() => {
                      onCloseEditor();
                      onSelectEntry(entry);
                    }}
                  >
                    <div className="codex-entry-card-header">
                      <span className="codex-entry-name">{name}</span>
                      {subtype && <span className="codex-entry-subtype">{subtype}</span>}
                    </div>
                    {summary && <p className="codex-entry-summary">{summary}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="codex-detail-panel">
          {selectedEntry ? (
            <div className="codex-detail-view">
              <div className="codex-detail-header">
                <div className="codex-detail-title-row">
                  <h2 className="codex-detail-title">
                    {'role_type' in selectedEntry
                      ? (selectedEntry as Character).name
                      : (selectedEntry as LoreEntry).title}
                  </h2>
                  <div className="codex-detail-actions">
                    <button
                      type="button"
                      className="codex-detail-edit-btn"
                      onClick={() => onOpenEditEntryEditor(selectedEntry)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="codex-detail-delete-btn"
                      onClick={() => onDeleteEntry(selectedEntry)}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {'role_type' in selectedEntry ? (
                  <div className="codex-detail-meta">
                    <span className="codex-detail-role">
                      角色类型：{(selectedEntry as Character).role_type || '未设置'}
                    </span>
                  </div>
                ) : (
                  <div className="codex-detail-meta">
                    <span className="codex-detail-type">类型：{(selectedEntry as LoreEntry).type}</span>
                    {(selectedEntry as LoreEntry).tags_json.length > 0 && (
                      <div className="codex-detail-tags">
                        {(selectedEntry as LoreEntry).tags_json.map((tag) => (
                          <span key={tag} className="codex-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {'summary' in selectedEntry && selectedEntry.summary && (
                <div className="codex-detail-section">
                  <h3>简介</h3>
                  <p className="codex-detail-text">{selectedEntry.summary}</p>
                </div>
              )}

              {'details' in selectedEntry && (selectedEntry as Character).details && (
                <div className="codex-detail-section">
                  <h3>详细信息</h3>
                  <p className="codex-detail-text">{(selectedEntry as Character).details}</p>
                </div>
              )}

              {'content' in selectedEntry && (selectedEntry as LoreEntry).content && (
                <div className="codex-detail-section">
                  <h3>详细内容</h3>
                  <p className="codex-detail-text">{(selectedEntry as LoreEntry).content}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="codex-detail-empty">
              <p>选择一个{codexSection === 'characters' ? '角色' : '设定'}查看详情</p>
              <p className="codex-detail-empty-hint">或点击左侧「新建」按钮创建新条目</p>
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <div className="codex-editor-overlay">
          <div ref={editorModalRef} className="codex-editor-modal">
            <div className="codex-editor-header">
              <h2>{editorState.id ? '编辑' : '新建'}{editorState.type === 'character' ? '角色' : '设定'}</h2>
              <button type="button" className="codex-editor-close" onClick={onCloseEditor}>
                ×
              </button>
            </div>

            <div className="codex-editor-body">
              {editorState.type === 'character' ? (
                <>
                  <div className="codex-editor-field">
                    <label htmlFor="char-name">角色名称 *</label>
                    <input
                      id="char-name"
                      type="text"
                      value={editorState.name}
                      onChange={(e) => onUpdateEditorField('name', e.target.value)}
                      placeholder="输入角色名称"
                    />
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="char-role">角色类型</label>
                    <select
                      id="char-role"
                      value={editorState.roleType}
                      onChange={(e) => onUpdateEditorField('roleType', e.target.value)}
                    >
                      <option value="">请选择</option>
                      <option value="主角">主角</option>
                      <option value="配角">配角</option>
                      <option value="反派">反派</option>
                      <option value="配角">配角</option>
                      <option value="导师">导师</option>
                      <option value="盟友">盟友</option>
                      <option value="恋人">恋人</option>
                      <option value="家人">家人</option>
                      <option value="对手">对手</option>
                      <option value="神秘人">神秘人</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="char-summary">简介</label>
                    <textarea
                      id="char-summary"
                      value={editorState.summary}
                      onChange={(e) => onUpdateEditorField('summary', e.target.value)}
                      placeholder="简要描述这个角色"
                      rows={3}
                    />
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="char-details">详细信息</label>
                    <textarea
                      id="char-details"
                      value={editorState.details}
                      onChange={(e) => onUpdateEditorField('details', e.target.value)}
                      placeholder="角色的详细背景、性格特点、外貌特征等"
                      rows={6}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="codex-editor-field">
                    <label htmlFor="lore-title">设定标题 *</label>
                    <input
                      id="lore-title"
                      type="text"
                      value={editorState.loreTitle}
                      onChange={(e) => onUpdateEditorField('loreTitle', e.target.value)}
                      placeholder="输入设定标题"
                    />
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="lore-type">设定类型</label>
                    <select
                      id="lore-type"
                      value={editorState.loreType}
                      onChange={(e) => onUpdateEditorField('loreType', e.target.value)}
                    >
                      <option value="location">地点</option>
                      <option value="organization">组织</option>
                      <option value="item">物品</option>
                      <option value="event">事件</option>
                      <option value="race">种族</option>
                      <option value="culture">文化</option>
                      <option value="magic">魔法/能力</option>
                      <option value="technology">科技</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="lore-summary">简介</label>
                    <textarea
                      id="lore-summary"
                      value={editorState.summary}
                      onChange={(e) => onUpdateEditorField('summary', e.target.value)}
                      placeholder="简要描述这个设定"
                      rows={3}
                    />
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="lore-content">详细内容</label>
                    <textarea
                      id="lore-content"
                      value={editorState.loreContent}
                      onChange={(e) => onUpdateEditorField('loreContent', e.target.value)}
                      placeholder="设定详细内容"
                      rows={6}
                    />
                  </div>
                  <div className="codex-editor-field">
                    <label htmlFor="lore-tags">标签（用逗号分隔）</label>
                    <input
                      id="lore-tags"
                      type="text"
                      value={editorState.loreTags.join(', ')}
                      onChange={(e) =>
                        onUpdateEditorField(
                          'loreTags',
                          e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                        )
                      }
                      placeholder="如：重要, 伏笔, 已解锁"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="codex-editor-footer">
              <button type="button" className="codex-editor-cancel" onClick={onCloseEditor}>
                取消
              </button>
              <button type="button" className="codex-editor-save" onClick={() => void onSaveEntry()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
