import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export { Button } from "./button";

export function BackLink({
  href,
  children,
  fullPage = false,
}: {
  href: string;
  children: ReactNode;
  fullPage?: boolean;
}) {
  const NavigationLink = fullPage ? "a" : Link;
  return (
    <NavigationLink className="back-link" href={href}>
      <ArrowLeft className="ui-icon" aria-hidden="true" focusable="false" />
      {children}
    </NavigationLink>
  );
}

// Characters used against a field limit, counted per character as the server
// counts them, so an emoji is one. Over the limit it turns the danger colour.
export function CharacterCount({ id, value, limit }: { id: string; value: string; limit: number }) {
  const used = [...value].length;
  return (
    <span id={id} className={`character-count${used > limit ? " over-limit" : ""}`}>
      {used.toLocaleString("en")} / {limit.toLocaleString("en")}
      <span className="visually-hidden"> characters</span>
    </span>
  );
}

export function Field({
  label,
  id,
  hint,
  limit,
  "aria-describedby": describedBy,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string; limit?: number }) {
  const description = [limit !== undefined && `${id}-count`, hint && `${id}-hint`, describedBy]
    .filter(Boolean)
    .join(" ");
  const input = <input id={id} aria-describedby={description || undefined} {...props} />;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {limit === undefined ? (
        input
      ) : (
        <div className="counted-input">
          {input}
          <CharacterCount id={`${id}-count`} value={String(props.value ?? "")} limit={limit} />
        </div>
      )}
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`notice ${danger ? "danger" : ""}`} role={danger ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function TextareaField({
  label,
  id,
  limit,
  "aria-describedby": describedBy,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; limit?: number }) {
  const description = [limit !== undefined && `${id}-count`, describedBy].filter(Boolean).join(" ");
  const textarea = <textarea id={id} rows={4} aria-describedby={description || undefined} {...props} />;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {limit === undefined ? (
        textarea
      ) : (
        <div className="counted-input">
          {textarea}
          <CharacterCount id={`${id}-count`} value={String(props.value ?? "")} limit={limit} />
        </div>
      )}
    </div>
  );
}

export { Pill, type PillTone } from "./pill";
export { Dropdown, type DropdownOption } from "./dropdown";

export { DatePicker } from "./date-picker";

export { NotificationBanner } from "./notification-banner";

export { useNotifications, useNotificationState } from "./notifications";

export { Modal } from "./modal";
