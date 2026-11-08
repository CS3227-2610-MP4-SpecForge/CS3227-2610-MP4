import { z } from "zod";
export const taskFields = z.strictObject({ title: z.string().refine(value => [...value].length <= 160), description: z.string().refine(value => [...value].length <= 24000) });
const fields = taskFields;
const revision = z.number().int().min(1).max(2147483647);
export const requestRecord = z.object({ id: z.uuid(), organisation_id: z.uuid(), author_id: z.uuid(), revision, fields, submitted_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(), last_autosaved_at: z.string().nullable().default(null), ticket_number: z.number().int().positive(), delivery_revision: revision, due_date: z.string().nullable(), priority: z.enum(["low", "medium", "high"]), status: z.enum(["to_do", "in_progress", "in_review", "done", "cancelled"]), assignee_ids: z.array(z.uuid()).max(5) });
export const status = z.enum(["to_do", "in_progress", "in_review", "done", "cancelled"]);
export const priority = z.enum(["low", "medium", "high"]);
export const date = z.iso.date();
export const ticketListQuery = z.strictObject({
  search: z.string().max(160).optional(), status: z.enum(["draft", ...status.options]).optional(), priority: priority.optional(),
  assignee: z.union([z.uuid(), z.enum(["me", "unassigned"])]).optional(), overdue: z.enum(["true", "false"]).optional(), today: date.optional(),
  sort: z.enum(["due", "updated"]).optional(), offset: z.coerce.number().int().min(0).max(2147483597).default(0),
});
