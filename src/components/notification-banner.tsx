"use client";
import { useEffect } from "react";

/** Render inside the active modal when present so the overlay stays in its top layer. */
export function NotificationBanner({ message, onDismiss }: { message: string; onDismiss(): void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return <div className="notification-banner" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}
