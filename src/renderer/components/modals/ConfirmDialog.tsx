import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  danger?: boolean;
  resolve: ((value: boolean) => void) | null;
};

const initialState: ConfirmState = {
  open: false,
  title: '',
  message: '',
  danger: false,
  resolve: null
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(initialState);

  const confirm = useCallback((title: string, message: string, danger?: boolean): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, title, message, danger, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState(initialState);
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState(initialState);
  }, [state.resolve]);

  return { confirm, confirmState: state, handleConfirm, handleCancel };
}

export type ConfirmDialogProps = {
  title: string;
  message: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, danger, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-icon">
          <AlertTriangle size={24} />
        </div>
        <h3 className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="modal-btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button type="button" className={danger ? 'modal-btn-danger' : 'modal-btn-primary'} onClick={onConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
