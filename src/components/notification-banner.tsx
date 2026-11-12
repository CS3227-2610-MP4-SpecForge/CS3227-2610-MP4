"use client";

/** The provider hosts this viewport overlay inside the active modal's top layer. */
export function NotificationBanner({ message, danger = false }: { message: string; danger?: boolean }) {
  return (
    <div
      className={`notification-banner${danger ? " danger" : ""}`}
      role={danger ? "alert" : "status"}
      aria-live={danger ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
