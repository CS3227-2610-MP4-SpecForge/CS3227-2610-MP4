"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { useNotifications } from "./notifications";

// Shared native modal: owns showModal, body scroll lock, initial focus, Esc
// and the notification host. Callers restore focus in onClose.
export function Modal({ label, contentLabel = `${label} content`, title, closeLabel, onClose, className = "", footer, children }: {
  label: string; contentLabel?: string; title?: ReactNode; closeLabel: string; onClose(): void; className?: string; footer?: ReactNode; children: ReactNode;
}) {
  const { registerHost } = useNotifications();
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    const unregister = registerHost(dialog);
    contentRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => { unregister(); dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [registerHost]);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={label} onClose={() => { if (!ref.current?.open) onClose(); }}>
    <header className="modal-toolbar">
      {title && <div className="modal-title">{title}</div>}
      <Button className="secondary modal-close" onClick={onClose} aria-label={closeLabel}><X className="ui-icon" aria-hidden="true" focusable="false" /></Button>
    </header>
    <div ref={contentRef} tabIndex={-1} className="modal-content" role="region" aria-label={contentLabel}>{children}</div>
    {footer && <footer className="modal-footer">{footer}</footer>}
  </dialog>;
}
