import { ticketPriorities, ticketStatuses, type TicketPriority, type TicketStatus } from "@/delivery";
import { Pill, type PillTone } from "./pill";
import type { DropdownOption } from "./dropdown";
const priorityTones: Record<TicketPriority, PillTone> = { low: "yellow", medium: "orange", high: "red" };
const statusTones: Record<TicketStatus, PillTone> = {
  to_do: "gray",
  in_progress: "blue",
  in_review: "purple",
  done: "green",
  cancelled: "gray",
};
export const priorityOptions: DropdownOption<TicketPriority>[] = (
  Object.keys(ticketPriorities) as TicketPriority[]
).map(value => ({ value, label: ticketPriorities[value], tone: priorityTones[value] }));
export const statusOptions: DropdownOption<TicketStatus>[] = (Object.keys(ticketStatuses) as TicketStatus[]).map(
  value => ({ value, label: ticketStatuses[value], tone: statusTones[value] }),
);
export function PriorityPill({ value }: { value: TicketPriority }) {
  return <Pill tone={priorityTones[value]}>{ticketPriorities[value]}</Pill>;
}
export function StatusPill({ value }: { value: TicketStatus }) {
  return <Pill tone={statusTones[value]}>{ticketStatuses[value]}</Pill>;
}
