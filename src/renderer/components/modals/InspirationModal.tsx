export type InspirationModalProps = {
  tagOptions: string[];
  selectedTags: string[];
  prompt: string;
  draft: string;
  onToggleTag: (tag: string) => void;
  onPromptChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  onUseForBook: () => void;
};

export function InspirationModal({
  tagOptions,
  selectedTags,
  prompt,
  draft,
  onToggleTag,
  onPromptChange,
  onDraftChange,
  onGenerate,
  onClose,
  onUseForBook
}: InspirationModalProps): JSX.Element {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>开书灵感</h3>
          <button type="button" className="home-link-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="modal-body inspiration-body">
          <div className="inspiration-step-row">
            <span className="inspiration-step active">1. 选择灵感标签</span>
            <span className="inspiration-step">2. 生成灵感情节</span>
            <span className="inspiration-step">3. 生成小说大纲</span>
          </div>

          <div className="inspiration-tags">
            {tagOptions.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`inspiration-tag ${active ? 'active' : ''}`}
                  onClick={() => onToggleTag(tag)}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <label>
            <span>灵感补充</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="写得越具体，生成的故事提纲越完整。"
              rows={5}
            />
          </label>

          <div className="modal-actions inline">
            <button type="button" className="home-primary-button" onClick={onGenerate}>
              生成灵感
            </button>
          </div>

          {draft ? (
            <label>
              <span>灵感草稿</span>
              <textarea value={draft} onChange={(event) => onDraftChange(event.target.value)} rows={9} />
            </label>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="home-outline-button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="home-primary-button" onClick={onUseForBook}>
            用这条灵感创建新书
          </button>
        </div>
      </div>
    </div>
  );
}
