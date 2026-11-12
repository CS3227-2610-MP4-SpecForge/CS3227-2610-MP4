"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NotificationBanner } from "./notification-banner";
import { sessionEndedMessage } from "./http";

type Notification = { id: number; message: string; danger: boolean };
type Notifications = {
  notify(message: string, danger?: boolean): void;
  registerHost(element: HTMLElement): () => void;
};
const NotificationContext = createContext<Notifications | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification>();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string, danger = false) => {
    // The persistent session banner already says this; a toast would cover it.
    if (message && message !== sessionEndedMessage) setNotification({ id: ++sequence.current, message, danger });
  }, []);
  const registerHost = useCallback((element: HTMLElement) => {
    setHost(element);
    return () => setHost(current => (current === element ? null : current));
  }, []);
  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(
      () => setNotification(current => (current?.id === notification.id ? undefined : current)),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [notification]);
  const context = useMemo(() => ({ notify, registerHost }), [notify, registerHost]);
  const banner = notification && (
    <NotificationBanner key={notification.id} message={notification.message} danger={notification.danger} />
  );
  return (
    <NotificationContext.Provider value={context}>
      {children}
      {host ? createPortal(banner, host) : banner}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("Notifications require NotificationProvider.");
  return context;
}

/** Keep local recovery state after the transient feedback disappears. */
export function useNotificationState(danger = false) {
  const [value, setValue] = useState("");
  const { notify } = useNotifications();
  const update = useCallback(
    (next: string, overrideDanger = danger) => {
      setValue(next);
      if (next) notify(next, overrideDanger);
    },
    [notify, danger],
  );
  return [value, update] as const;
}
