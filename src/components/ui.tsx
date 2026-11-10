import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export { Button } from "./button";

export function BackLink({ href, children, fullPage = false }: { href: string; children: ReactNode; fullPage?: boolean }) {
  const NavigationLink = fullPage ? "a" : Link;
  return <NavigationLink className="back-link" href={href}>
    <ArrowLeft className="ui-icon" aria-hidden="true" focusable="false" />{children}
  </NavigationLink>;
}

export function Field({ label, id, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}</div>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div className={`notice ${danger ? "danger" : ""}`} role={danger ? "alert" : "status"}>{children}</div>;
}

export function TextareaField({ label, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><textarea id={id} rows={4} {...props} /></div>;
}

export { Pill, type PillTone } from "./pill";
export { Dropdown, type DropdownOption } from "./dropdown";

export { DatePicker } from "./date-picker";

export { NotificationBanner } from "./notification-banner";
