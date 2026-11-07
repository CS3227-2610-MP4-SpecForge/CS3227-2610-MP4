"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, failureMessage } from "./http";
import { Button, Field, Notice } from "./ui";
export function AccountForm({ mode }: { mode: "signup" | "signin" | "verify" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState("PM");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try {
      const body = mode === "verify" ? { email, token } : mode === "signup" ? { email, password, role } : { email, password };
      const result = await api(`/api/auth/${mode}`, body);
      setPassword(""); setToken("");
      if (mode === "signup") setMessage(result.message);
      else { router.replace("/workspace"); router.refresh(); }
    } catch (failure) { setError(failureMessage(failure)); setPassword(""); setToken(""); }
    finally { setPending(false); }
  }
  async function resend() {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try { const result = await api("/api/auth/resend", { email }); setMessage(result.message); }
    catch (failure) { setError(failureMessage(failure)); }
    finally { setPending(false); }
  }
  const title = mode === "signup" ? "Create your account" : mode === "signin" ? "Welcome back" : "Verify your email";
  return <section className="auth-layout"><div className="auth-intro"><p className="eyebrow">Your shared workspace</p><h1>{title}</h1><p className="muted">{mode === "signup" ? "Choose your perspective. Build a shared understanding." : mode === "signin" ? "Pick up where your team left off." : "Enter the one-time code sent to your email address."}</p></div>
    <div className="card auth-card">
      {error && <Notice danger>{error}</Notice>}{message && <Notice>{message} {mode === "signup" && <Link href="/verify-email">Enter your verification code</Link>}</Notice>}
      <form onSubmit={submit} className="stack" aria-busy={pending}>
        <Field id="email" label="Email address" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={pending} />
        {mode !== "verify" && <Field id="password" label="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : 1} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={pending} hint={mode === "signup" ? "Use 12–128 characters. Password recovery is not available in this version." : undefined} />}
        {mode === "signup" && <div className="field"><label htmlFor="role">Application role</label><select id="role" value={role} onChange={e => setRole(e.target.value)} disabled={pending}><option value="PM">Product Manager</option><option value="Developer">Developer</option></select><p className="hint">Your role cannot be changed after signup. Organisation admin permissions are separate.</p></div>}
        {mode === "verify" && <Field id="token" label="Verification code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} onChange={e => setToken(e.target.value)} disabled={pending} />}
        <Button disabled={pending}>{pending ? "Please wait…" : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Verify email"}</Button>
      </form>
      <div className="auth-links">{mode === "signup" ? <p>Already have an account? <Link href="/sign-in">Sign in</Link></p> : mode === "signin" ? <><p>New to SpecForge? <Link href="/sign-up">Create an account</Link></p><Link href="/verify-email">Verify your email</Link></> : <><Button className="text-button" onClick={resend} disabled={pending || !email}>Send a new code</Button><Link href="/sign-in">Back to sign in</Link></>}</div>
    </div></section>;
}
