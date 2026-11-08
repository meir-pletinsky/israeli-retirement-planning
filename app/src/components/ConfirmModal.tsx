import { useId } from "react";

import { ModalFrame } from "./ModalFrame";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const bodyId = useId();
  if (!open) return null;

  return (
    <ModalFrame
      onClose={onCancel}
      panelClassName="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      describedBy={bodyId}
    >
      {(titleId) => (
        <>
          <h3 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h3>
          <p id={bodyId} className="mt-2 text-sm text-slate-600">
            {body}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              data-autofocus
              className="btn btn-ghost text-slate-700 hover:bg-slate-100"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </ModalFrame>
  );
}
