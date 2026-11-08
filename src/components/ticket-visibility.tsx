import { Eye, Lock } from "lucide-react";

export function TicketVisibility({ published, organisationName }: { published: boolean; organisationName: string }) {
  const Icon = published ? Eye : Lock;
  return <section className="ticket-visibility" aria-label="Task visibility">
    <Icon className="ui-icon" aria-hidden="true" focusable="false" />
    <span>{published ? <>This task is visible to members of the <strong>{organisationName}</strong> organisation</> : "This task is private and unpublished"}</span>
  </section>;
}
