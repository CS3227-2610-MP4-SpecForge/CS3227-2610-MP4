import type { ReactNode } from "react";
export type PillTone = "gray" | "yellow" | "orange" | "red" | "blue" | "purple" | "green";
export function Pill({ tone = "gray", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
