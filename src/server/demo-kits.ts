import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { error, json, readBody, serviceUnavailable } from "./http";

/** The Admin API calls a kit needs; only a secret-key client provides them. */
export type DemoKitAdmin = Pick<SupabaseClient["auth"]["admin"], "createUser" | "deleteUser">;
export type Reservation = { admitted: true } | { admitted: false; limit: "burst" | "daily"; retryAfter: number };
type LocalAdmission = { admitted: true } | { admitted: false; retryAfter: number };
export type DemoKitDependencies = {
  /** Reserves a slot in the database windows; throws when unconfigured or unavailable. */
  reserve(): Promise<Reservation>;
  /** A secret-key Admin client, never bound to cookies; throws when unconfigured. */
  admin(): DemoKitAdmin;
  /** Per-process load shedding before the database. */
  admitLocal(): LocalAdmission;
};

export const demoKitPath = "/api/demo-kits";
const unavailableMessage = "Demo kit service is temporarily unavailable. Try again.";
const roles = [
  { role: "PM", slug: "pm" },
  { role: "Developer", slug: "dev" },
] as const;

/** Caps from server configuration: defaults 5 and 30; anything else turns the endpoint off. */
export function demoKitCaps(env: Record<string, string | undefined>) {
  const read = (value: string | undefined, fallback: number, max: number) =>
    value === undefined ? fallback : /^[0-9]+$/.test(value) && Number(value) <= max ? Number(value) : NaN;
  const burst = read(env.DEMO_KITS_PER_10_MINUTES, 5, 5);
  const daily = read(env.DEMO_KITS_PER_DAY, 30, 30);
  return burst > 0 && daily > 0 ? { burst, daily } : null;
}

/** Ten kit requests per process per clock minute; separate from sign-in admission. */
export function createDemoKitAdmission(now: () => number = Date.now) {
  let window = 0;
  let count = 0;
  return (): LocalAdmission => {
    const instant = now();
    const current = Math.floor(instant / 60_000);
    if (current !== window) {
      window = current;
      count = 0;
    }
    if (++count <= 10) return { admitted: true };
    return { admitted: false, retryAfter: Math.max(1, Math.ceil(((current + 1) * 60_000 - instant) / 1000)) };
  };
}

const reservationRow = z
  .array(
    z.object({
      admitted: z.boolean(),
      limit_kind: z.enum(["burst", "daily"]).nullable(),
      retry_after: z.number().int().nonnegative(),
    }),
  )
  .length(1);
/** The database reservation through a secret-key client. */
export function databaseReservation(client: () => SupabaseClient, caps: { burst: number; daily: number } | null) {
  return async (): Promise<Reservation> => {
    if (!caps) throw new Error("Demo kits not configured.");
    const { data, error: failure } = await client().rpc("reserve_demo_kit", {
      burst_cap: caps.burst,
      daily_cap: caps.daily,
    });
    if (failure) throw failure;
    const [row] = reservationRow.parse(data);
    if (row.admitted) return { admitted: true };
    if (!row.limit_kind) throw new Error("Invalid reservation.");
    return { admitted: false, limit: row.limit_kind, retryAfter: Math.max(1, row.retry_after) };
  };
}

function limited(limit: "burst" | "daily", retryAfter: number) {
  const response = json({ error: "Demo kit limit reached.", limit, retryAfter }, 429);
  response.headers.set("Retry-After", String(retryAfter));
  return response;
}

/** Deletes an account this request created; a lost delete leaves a marked orphan for demo:remove. */
async function compensate(admin: DemoKitAdmin, id: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!(await admin.deleteUser(id, false)).error) return;
    } catch {
      // Bounded retry; the provider failure is never logged with its message.
    }
  }
}

/** POST /api/demo-kits: reserve first, then create both accounts or neither. */
export async function handleDemoKit(request: Request, dependencies: DemoKitDependencies): Promise<Response> {
  if (request.method !== "POST") {
    const response = error("Method not allowed.", 405);
    response.headers.set("Allow", "POST");
    return response;
  }
  if (!z.strictObject({}).safeParse(await readBody(request)).success) return error("Invalid request.", 400);
  const local = dependencies.admitLocal();
  if (!local.admitted) return limited("burst", local.retryAfter);
  let reservation: Reservation;
  try {
    reservation = await dependencies.reserve();
  } catch (failure) {
    return serviceUnavailable(request, failure, unavailableMessage);
  }
  if (!reservation.admitted) return limited(reservation.limit, reservation.retryAfter);

  const code = randomBytes(16).toString("hex");
  const created: string[] = [];
  let admin: DemoKitAdmin | undefined;
  try {
    admin = dependencies.admin();
    const accounts = [];
    for (const { role, slug } of roles) {
      const email = `demo-${slug}-${code}@example.com`;
      const username = `demo_${slug}_${code.slice(0, 8)}`;
      const password = randomBytes(24).toString("base64url");
      const { data, error: failure } = await admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role, username },
        app_metadata: { demo_kit: code },
      });
      if (failure || !data.user) throw failure ?? new Error("Demo kit account unavailable.");
      created.push(data.user.id);
      accounts.push({ role, email, username, password });
    }
    return json({ kit: { accounts } }, 201);
  } catch (failure) {
    if (admin) for (const id of created.reverse()) await compensate(admin, id);
    return serviceUnavailable(request, failure, unavailableMessage);
  }
}
