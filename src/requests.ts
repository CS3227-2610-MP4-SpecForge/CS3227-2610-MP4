export const requestFields = [
  { key: "title", label: "Title", max: 160 },
  { key: "description", label: "Description", max: 24000 },
] as const;
export type RequestFields = Record<(typeof requestFields)[number]["key"], string>;
export type FeatureRequest = {
  id: string; organisation_id: string; author_id: string; revision: number;
  fields: RequestFields; submitted_at: string | null; created_at: string; updated_at: string;
};
export function sameFields(a: RequestFields, b: RequestFields) { return requestFields.every(field => a[field.key] === b[field.key]); }
