"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Button } from "./button";
import { Modal } from "./modal";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};
type Request = ConfirmOptions & { id: number; resolve(result: boolean): void; returnFocus: Element | null };
type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

// Styled replacement for window.confirm. Requests queue and are asked one at a
// time; each resolves true only from its confirm button.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const sequence = useRef(0);
  const confirm = useCallback<Confirm>(
    options =>
      new Promise(resolve => {
        const request = { ...options, id: ++sequence.current, resolve, returnFocus: document.activeElement };
        setQueue(current => [...current, request]);
      }),
    [],
  );
  const current = queue[0];
  const restore = useRef<Element | null>(null);
  const answer = useCallback((request: Request, result: boolean) => {
    restore.current = request.returnFocus;
    setQueue(pending => pending.filter(item => item !== request));
    request.resolve(result);
  }, []);
  // Return focus once the dialog has closed: the page is inert while it is open.
  useEffect(() => {
    const target = restore.current;
    restore.current = null;
    if (!current && target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
  }, [current]);
  // A question about the previous page must not outlive it.
  const pathname = usePathname();
  useEffect(
    () => () =>
      setQueue(pending => {
        for (const request of pending) request.resolve(false);
        return [];
      }),
    [pathname],
  );
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && <ConfirmDialog key={current.id} request={current} onAnswer={result => answer(current, result)} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onAnswer }: { request: Request; onAnswer(result: boolean): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  // Runs after Modal's own effect has opened the dialog and focused its content.
  useEffect(() => cancel.current?.focus({ preventScroll: true }), []);
  return (
    <Modal
      label={request.title}
      contentLabel={`${request.title} details`}
      closeLabel="Close confirmation"
      className="confirm-modal"
      onClose={() => onAnswer(false)}
      title={<h2>{request.title}</h2>}
      footer={
        <>
          <Button ref={cancel} type="button" className="secondary" onClick={() => onAnswer(false)}>
            {request.cancelLabel ?? "Cancel"}
          </Button>
          <Button type="button" className={request.danger ? "danger" : ""} onClick={() => onAnswer(true)}>
            {request.confirmLabel}
          </Button>
        </>
      }
    >
      {request.message && <p className="confirm-message">{request.message}</p>}
    </Modal>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("Confirmations require ConfirmProvider.");
  return context;
}
