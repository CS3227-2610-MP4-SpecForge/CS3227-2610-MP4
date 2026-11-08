import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it.skipIf(process.env.SPECFORGE_TICKET_MIGRATION_TEST !== "1")("migrates existing tickets without inventing deadlines or changing saved content and dates", () => {
  // Dedicated throwaway database in the disposable local container. Auth schema
  // is a minimal compatibility fixture; actual Auth/RLS is covered separately.
  const database = `ticket_migration_${randomUUID().replaceAll("-", "")}`;
  const sql = (databaseName: string, input: string) => {
    try { return execFileSync("docker", ["exec", "-i", "supabase_db_specforge", "psql", "-X", "-U", "postgres", "-d", databaseName, "-v", "ON_ERROR_STOP=1", "-qAt"], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 20000 }); }
    catch { throw new Error("Isolated local ticket migration check failed; SQL/provider output suppressed."); }
  };
  const root = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(root).filter(file => file.endsWith(".sql")).sort();
  const contents = (selected: string[]) => selected.map(file => readFileSync(new URL(file, root), "utf8")).join("\n");
  sql("postgres", `create database ${database};`);
  try {
    sql(database, `create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      ${contents(files.filter(file => file < "20261108010000"))}
      insert into auth.users values('11111111-1111-4111-8111-111111111111','fixture@example.com',now(),'{"role":"PM"}');
      select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
      do $$declare org uuid; draft jsonb; published jsonb; begin
        org := public.create_organisation('Migration team');
        draft := public.create_request(org,gen_random_uuid());
        published := public.create_request(org,gen_random_uuid());
        perform public.publish_request(org,(published->>'id')::uuid,1,'{"title":"Preserved title","description":"Preserved Unicode 漢🙂"}',true,true);
      end$$;
      create table private.migration_snapshot as select id,to_jsonb(r) document from public.feature_requests r;`);
    const result = sql(database, `${contents(files.filter(file => file >= "20261108010000"))}
      select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
      do $$declare org uuid; draft jsonb; begin
        if exists(select 1 from public.feature_requests r join private.migration_snapshot s using(id)
          where to_jsonb(r) - array['ticket_number','delivery_revision','due_date','priority','status','assignee_ids'] is distinct from s.document) then raise exception 'Changed legacy data'; end if;
        if exists(select 1 from public.feature_requests where due_date is not null or priority <> 'medium' or status <> 'to_do' or delivery_revision <> 1 or cardinality(assignee_ids) <> 0) then raise exception 'Invented metadata'; end if;
        if (select count(distinct ticket_number) from public.feature_requests) <> 2 then raise exception 'Missing references'; end if;
        select organisation_id into org from public.feature_requests limit 1;
        draft := public.create_request(org,gen_random_uuid());
        if draft->>'ticket_number' <> '3' then raise exception 'Counter not continued'; end if;
        perform public.publish_request(org,(draft->>'id')::uuid,1,'{"title":"New work","description":"Optional schedule"}',true,true);
        if (select due_date from public.feature_requests where id = (draft->>'id')::uuid) is not null then raise exception 'Invented deadline'; end if;
      end$$;
      select 'migration-ok';`);
    expect(result).toContain("migration-ok");
  } finally { sql("postgres", `drop database ${database} with (force);`); }
}, 60000);
