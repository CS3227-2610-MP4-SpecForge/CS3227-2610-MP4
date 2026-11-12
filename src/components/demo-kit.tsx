"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { api, ApiError } from "./http";
import { Button, Notice, useNotifications } from "./ui";

const accounts = z
  .array(
    z.strictObject({
      role: z.enum(["PM", "Developer"]),
      email: z.email(),
      username: z.string(),
      password: z.string().min(12),
    }),
  )
  .length(2);
type Account = z.infer<typeof accounts>[number];
const limitBody = z.object({ limit: z.enum(["burst", "daily"]), retryAfter: z.number().int().positive() });
const roleLabels = { PM: "Product Manager", Developer: "Developer" } as const;
const unavailable = "Demo kit service is temporarily unavailable. Try again.";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** The persistent, non-error explanation of a deliberate creation limit. */
function limitNotice({ limit, retryAfter }: z.infer<typeof limitBody>): ReactNode {
  const signUp = <Link href="/sign-up">create an account</Link>;
  return limit === "burst" ? (
    <>
      Demo kits are limited to 5 every 10 minutes to protect the service. Try again in{" "}
      {plural(Math.max(1, Math.ceil(retryAfter / 60)), "minute")}, or {signUp} with your own email.
    </>
  ) : (
    <>
      Today&apos;s 30 demo kits have all been used. New kits are available from midnight Singapore time (in about{" "}
      {plural(Math.max(1, Math.ceil(retryAfter / 3600)), "hour")}). You can still {signUp} with your own email.
    </>
  );
}

/** Creates a demo kit and shows its two logins once; they live only in this component's state. */
export function DemoKit() {
  const [logins, setLogins] = useState<Account[]>([]);
  const [limit, setLimit] = useState<ReactNode>(null);
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  // Bumped when the page is left, so a late reply never restores credentials.
  const generation = useRef(0);
  const { notify } = useNotifications();
  useEffect(() => {
    // A counter, not a DOM node: the cleanup must bump the live value.
    const counter = generation;
    const clear = () => {
      counter.current++;
      setLogins([]);
      setPending(false);
    };
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      counter.current++;
    };
  }, []);

  async function create() {
    if (pending) return;
    const current = ++generation.current;
    setPending(true);
    setLogins([]);
    setLimit(null);
    setFailure("");
    try {
      const result = accounts.safeParse((await api("/api/demo-kits", {}))?.kit?.accounts);
      if (current !== generation.current) return;
      if (result.success) setLogins(result.data);
      else setFailure(unavailable);
    } catch (problem) {
      if (current !== generation.current) return;
      const body = problem instanceof ApiError && problem.status === 429 ? limitBody.safeParse(problem.body) : null;
      if (body?.success) setLimit(limitNotice(body.data));
      else setFailure(unavailable);
    } finally {
      if (current === generation.current) setPending(false);
    }
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied.`);
    } catch {
      notify(`Could not copy the ${what.toLowerCase()}. Select it and copy it instead.`, true);
    }
  }

  return (
    <section className="demo-kit" aria-labelledby="demo-kit-heading">
      <h2 id="demo-kit-heading">Try SpecForge</h2>
      <p className="muted">
        Create a demo kit: a ready-to-use Product Manager login and Developer login, with no email needed.
      </p>
      <Button type="button" className="secondary" onClick={create} disabled={pending} aria-busy={pending}>
        {pending ? "Creating demo kit…" : "Create demo kit"}
      </Button>
      {limit && <Notice>{limit}</Notice>}
      {failure && <Notice danger>{failure}</Notice>}
      {/* Always mounted, so screen readers register the live region before it fills. */}
      <div className="demo-kit-logins" aria-live="polite">
        {logins.length > 0 && (
          <>
            <p>
              <strong>Save these now.</strong> They are shown only once and cannot be recovered. Use the sign-in form
              above with either login.
            </p>
            {logins.map(login => {
              const role = roleLabels[login.role];
              return (
                <section key={login.role} className="demo-kit-login" aria-label={`${role} login`}>
                  <h3>{role}</h3>
                  <dl>
                    <dt>Email</dt>
                    <dd>
                      <code>{login.email}</code>
                      <Button
                        type="button"
                        className="text-button"
                        onClick={() => copy(login.email, "Email")}
                        aria-label={`Copy ${role} email`}
                      >
                        Copy
                      </Button>
                    </dd>
                    <dt>Password</dt>
                    <dd>
                      <code>{login.password}</code>
                      <Button
                        type="button"
                        className="text-button"
                        onClick={() => copy(login.password, "Password")}
                        aria-label={`Copy ${role} password`}
                      >
                        Copy
                      </Button>
                    </dd>
                  </dl>
                </section>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
