import axe from "axe-core";
import type { ReactNode } from "react";
import { expect } from "vitest";
import { render } from "vitest-browser-react";
import { NotificationProvider } from "@/components/notifications";

/** Render one component inside the providers every app page supplies. */
export function renderComponent(ui: ReactNode) {
  return render(<NotificationProvider>{ui}</NotificationProvider>);
}

/** Fail on serious or critical accessibility violations in the rendered page. */
export async function expectAccessible(root: Element = document.body) {
  const result = await axe.run(root, { resultTypes: ["violations"] });
  const violations = result.violations
    .filter(violation => violation.impact === "serious" || violation.impact === "critical")
    .map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(" ")).join(", ")})`);
  expect(violations).toEqual([]);
}
