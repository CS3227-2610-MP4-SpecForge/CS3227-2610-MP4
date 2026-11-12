import type { SupabaseClient } from "@supabase/supabase-js";

export type RemovalOptions = { kit: string | null; yes: boolean };
export function removalOptions(argv: string[], url: string | undefined): RemovalOptions;
export function removeDemoKits(
  admin: SupabaseClient,
  options: RemovalOptions & { batch?: number },
  print?: (line: string) => void,
): Promise<{ kits: number; accounts: number; deleted: number }>;
