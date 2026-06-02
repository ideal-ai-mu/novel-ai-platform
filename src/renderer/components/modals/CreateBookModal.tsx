import { X } from 'lucide-react';

export type CreateBookModalProps = {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function CreateBookModal({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onClose,
  onSubmit
}: CreateBookModalProps): JSX.Element {
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>创建新书</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <label>
            <span>书名</span>
            <input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="请输入书名" autoFocus />
          </label>
          <label>
            <span>简介（可选）</span>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="先写一句作品简介，后面再补充完整设定与结构。"
              rows={4}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" className="modal-btn-primary" onClick={onSubmit}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
