// Removes demo kit accounts from one environment. Dry run by default.
//   npm run demo:remove -- --project <ref|local> (--kit <code> | --all) [--yes]
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for the target
// environment. Prints counts only: never emails, passwords, codes, URL or key.
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const kitCode = /^[0-9a-f]{32}$/;
const localUrl = "http://127.0.0.1:55321";
/** Errors whose fixed messages are safe to print. */
class RemovalError extends Error {}
const usage = "Use --project <ref|local> with exactly one of --kit <code> or --all, and optionally --yes.";

/** Parses arguments and checks that --project names the configured target. */
export function removalOptions(argv, url) {
  let project;
  let kit;
  let all = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" && project === undefined && i + 1 < argv.length) project = argv[++i];
    else if (arg === "--kit" && kit === undefined && i + 1 < argv.length) kit = argv[++i];
    else if (arg === "--all" && !all) all = true;
    else if (arg === "--yes" && !yes) yes = true;
    else throw new RemovalError(usage);
  }
  if (!project || all === (kit !== undefined) || (kit !== undefined && !kitCode.test(kit)))
    throw new RemovalError(usage);
  let target;
  try {
    const parsed = new URL(url ?? "");
    target =
      parsed.origin === localUrl
        ? "local"
        : parsed.protocol === "https:" && /^[a-z0-9]{20}\.supabase\.co$/.test(parsed.host)
          ? parsed.host.split(".")[0]
          : undefined;
  } catch {
    target = undefined;
  }
  if (!target || target !== project)
    throw new RemovalError("--project does not match the configured Supabase project. Nothing was changed.");
  return { kit: kit ?? null, yes };
}

const marker = user => {
  const value = user.app_metadata?.demo_kit;
  return typeof value === "string" && kitCode.test(value) ? value : null;
};

async function allUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new RemovalError("Unable to list accounts. Nothing was changed.");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

/** Splits a list so each query's URL stays short, however many kits exist. */
function* batches(values, size) {
  for (let i = 0; i < values.length; i += size) yield values.slice(i, i + size);
}

/** Every row of `query(from, to)`, a page of up to 1000 at a time. */
async function allRows(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new RemovalError("Unable to count affected data. Nothing was changed.");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Lists every account first, selects by exact marker, and deletes only on `yes`. */
export async function removeDemoKits(admin, { kit, yes, batch = 100 }, print = console.log) {
  const selected = (await allUsers(admin)).filter(user => {
    const code = marker(user);
    return code !== null && (kit === null || code === kit);
  });
  const ids = selected.map(user => user.id);
  const demoIds = new Set(ids);
  const kits = new Set(selected.map(marker)).size;
  const orgIds = [];
  for (const group of batches(ids, batch))
    for (const org of await allRows((from, to) =>
      admin.from("organisations").select("id").in("created_by", group).order("id").range(from, to),
    ))
      orgIds.push(org.id);
  let memberships = 0;
  for (const group of batches(orgIds, batch))
    for (const member of await allRows((from, to) =>
      admin
        .from("organisation_members")
        .select("organisation_id,user_id")
        .in("organisation_id", group)
        .order("organisation_id")
        .order("user_id")
        .range(from, to),
    ))
      if (!demoIds.has(member.user_id)) memberships++;
  const organisations = orgIds.length;
  print(`Found ${plural(kits, "demo kit")} (${plural(ids.length, "account")}).`);
  print(
    `Removing them also deletes ${plural(organisations, "organisation")} they created, with their tickets, ` +
      `and ends ${plural(memberships, "membership")} of other accounts in those organisations.`,
  );
  if (!yes) {
    print("Dry run: nothing was deleted. Add --yes to delete.");
    return { kits, accounts: ids.length, deleted: 0 };
  }
  let deleted = 0;
  for (const id of ids) {
    // Re-read just before deleting, so a changed marker is never acted on.
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data.user) continue;
    const code = marker(data.user);
    if (code === null || (kit !== null && code !== kit)) continue;
    if (!(await admin.auth.admin.deleteUser(id, false)).error) deleted++;
  }
  print(`Deleted ${plural(deleted, "account")} of ${ids.length}.`);
  return { kits, accounts: ids.length, deleted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const options = removalOptions(process.argv.slice(2), url);
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new RemovalError("SUPABASE_SECRET_KEY is not set. Nothing was changed.");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await removeDemoKits(admin, options);
    process.exit(options.yes && result.deleted !== result.accounts ? 1 : 0);
  } catch (failure) {
    console.error(
      failure instanceof RemovalError ? failure.message : "Removal failed. Check the configuration and try again.",
    );
    process.exit(1);
  }
}
