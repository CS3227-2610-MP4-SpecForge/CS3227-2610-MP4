export const ticketStatuses = { to_do: "To do", in_progress: "In progress", in_review: "In review", done: "Done", cancelled: "Cancelled" } as const;
export const ticketPriorities = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const;
export type TicketStatus = keyof typeof ticketStatuses;
export type TicketPriority = keyof typeof ticketPriorities;
export type Delivery = { ticket_number: number; delivery_revision: number; due_date: string | null; priority: TicketPriority; status: TicketStatus; assignee_ids: string[] };
export function deliveryOf(item: Delivery): Delivery {
  const { ticket_number, delivery_revision, due_date, priority, status, assignee_ids } = item;
  return { ticket_number, delivery_revision, due_date, priority, status, assignee_ids };
}
export type TicketMember = { user_id: string; app_role: "PM" | "Developer" };
export type TicketActivity = { id: string; request_id: string; actor_id: string | null; kind: "published" | "delivery_updated" | "requirements_updated" | "comment"; body: string | null; changes: Record<string, { from: unknown; to: unknown }>; created_at: string };
export function localDay(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
export function deadlineLabel(item: Delivery & { submitted_at: string | null }, today = localDay()) {
  if (!item.due_date) return "Unscheduled";
  if (!item.submitted_at || item.status === "done" || item.status === "cancelled") return item.due_date;
  return item.due_date < today ? `Overdue · ${item.due_date}` : item.due_date === today ? "Due today" : item.due_date;
}
