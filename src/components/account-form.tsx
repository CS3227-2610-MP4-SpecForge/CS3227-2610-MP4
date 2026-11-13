"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { reservedUsername, reservedUsernameMessage, usernameHint, usernamePattern } from "@/usernames";
import { api, failureMessage } from "./http";
import { BackLink, Button, Dropdown, Field, useNotificationState } from "./ui";

const signupRoles = [
  { value: "PM", label: "Product Manager", tone: "purple" },
  { value: "Developer", label: "Developer", tone: "blue" },
] as const;
export function AccountForm({ mode, footer }: { mode: "signup" | "signin" | "verify"; footer?: ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState<(typeof signupRoles)[number]["value"]>("PM");
  const [pending, setPending] = useState(false);
  const [, setError] = useNotificationState(true);
  const [message, setMessage] = useNotificationState(false);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (mode === "signup" && reservedUsername(username)) {
      setError(reservedUsernameMessage);
      setMessage("");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      const body =
        mode === "verify"
          ? { email, token }
          : mode === "signup"
            ? { email, password, role, username }
            : { email, password };
      const result = await api(`/api/auth/${mode}`, body);
      setPassword("");
      setToken("");
      if (mode === "signup") setMessage(result.message);
      else {
        router.replace("/workspace");
        router.refresh();
      }
    } catch (failure) {
      setError(failureMessage(failure));
      setPassword("");
      setToken("");
    } finally {
      setPending(false);
    }
  }
  async function resend() {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/auth/resend", { email });
      setMessage(result.message);
    } catch (failure) {
      setError(failureMessage(failure));
    } finally {
      setPending(false);
    }
  }
  const title = mode === "signup" ? "Create your account" : mode === "signin" ? "Welcome back" : "Verify your email";
  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">Your shared workspace</p>
        <h1>{title}</h1>
        <p className="muted">
          {mode === "signup"
            ? "Choose your perspective. Build a shared understanding."
            : mode === "signin"
              ? "Pick up where your team left off."
              : "Enter the one-time code sent to your email address."}
        </p>
      </div>
      <div className="card auth-card">
        {message && mode === "signup" && (
          <p>
            <Link href="/verify-email">Enter your verification code</Link>
          </p>
        )}
        <form onSubmit={submit} className="stack" aria-busy={pending}>
          {mode === "signup" && (
            <Field
              id="username"
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              pattern={usernamePattern}
              minLength={3}
              maxLength={24}
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={pending}
              hint={usernameHint}
            />
          )}
          <Field
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={pending}
          />
          {mode !== "verify" && (
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 12 : 1}
              maxLength={128}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={pending}
              hint={mode === "signup" ? "Use 12–128 characters." : undefined}
            />
          )}
          {mode === "signup" && (
            <div className="field">
              <Dropdown
                id="role"
                label="Application role"
                value={role}
                options={signupRoles}
                onChange={setRole}
                disabled={pending}
              />
              <p className="hint">Your role cannot be changed after signup.</p>
            </div>
          )}
          {mode === "verify" && (
            <Field
              id="token"
              label="Verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6,10}"
              minLength={6}
              maxLength={10}
              required
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={pending}
            />
          )}
          <Button disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : mode === "signin"
                  ? "Sign in"
                  : "Verify email"}
          </Button>
        </form>
        <div className="auth-links">
          {mode === "signup" ? (
            <p>
              Already have an account? <Link href="/sign-in">Sign in</Link>
            </p>
          ) : mode === "signin" ? (
            <>
              <p>
                New to SpecForge? <Link href="/sign-up">Create an account</Link>
              </p>
              <Link href="/verify-email">Verify your email</Link>
            </>
          ) : (
            <>
              <Button className="text-button" onClick={resend} disabled={pending || !email}>
                Send a new code
              </Button>
              <BackLink href="/sign-in">Back to sign in</BackLink>
            </>
          )}
        </div>
        {footer}
      </div>
    </section>
  );
}
