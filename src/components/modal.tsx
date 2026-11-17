import type { ReactNode } from "react";
import { Button, Dialog, DialogClose, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog size="lg">
        <div className="grid gap-2 p-5 pb-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-kumo-line px-5 py-3">
            {footer}
          </div>
        ) : null}
        <DialogClose render={<Button variant="secondary">Close</Button>} />
      </Dialog>
    </DialogRoot>
  );
}

export function ModalFooter({ onClose, submitLabel = "Save", onSubmit, loading }: { onClose: () => void; submitLabel?: string; onSubmit?: () => void; loading?: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      {onSubmit ? (
        <Button variant="primary" onClick={onSubmit} loading={loading}>
          {submitLabel}
        </Button>
      ) : null}
    </>
  );
}