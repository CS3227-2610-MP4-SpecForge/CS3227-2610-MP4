"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Building2 } from "lucide-react";
import { reservedUsername, reservedUsernameMessage, usernameHint, usernamePattern } from "@/usernames";
import { api, ApiError, failureMessage } from "./http";
import { BackLink, Button, Field, Notice, useNotificationState } from "./ui";
import { publishAccount } from "./account-events";
import { useUnsavedChanges } from "./use-unsaved-changes";

type Account = { id: string; username: string; email: string; role: "PM" | "Developer"; createdAt: string };
type Organisation = { id: string; name: string; isAdmin: boolean };
export function Profile() {
  const router = useRouter();
  const [account, setAccount] = useState<Account>();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [, setError] = useNotificationState(true);
  const [validation, setValidation] = useState("");
  const [, setMessage] = useNotificationState(false);
  const [revision, setRevision] = useState(0);
  const saving = useRef(false);
  const dirty = Boolean(account && username !== account.username);
  useUnsavedChanges(dirty || pending);

  useEffect(() => {
    let active = true;
    Promise.all([api("/api/account"), api("/api/organisations")])
      .then(([identity, teams]) => {
        if (active) {
          setAccount(identity.account);
          setUsername(identity.account.username);
          setOrganisations(teams.organisations);
          publishAccount(identity.account);
        }
      })
      .catch(failure => {
        if (!active) return;
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) router.replace("/sign-in");
        else setError(failureMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router, revision, setError]);

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !dirty) return;
    setError("");
    setMessage("");
    setValidation("");
    if (!new RegExp(`^${usernamePattern}$`).test(username)) {
      setValidation(usernameHint);
      return;
    }
    if (reservedUsername(username)) {
      setValidation(reservedUsernameMessage);
      return;
    }
    saving.current = true;
    setPending(true);
    try {
      const result = await api("/api/account", { username });
      setAccount(result.account);
      setUsername(result.account.username);
      setMessage("Profile updated.");
      publishAccount(result.account);
    } catch (failure) {
      if (failure instanceof ApiError && [400, 409].includes(failure.status)) setValidation(failure.message);
      else setError(failureMessage(failure));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  if (loading) return <Notice>Loading your profile…</Notice>;
  if (!account)
    return (
      <section>
        <h1>Your profile</h1>
        <p className="muted">Profile unavailable.</p>
        <Button
          className="secondary"
          onClick={() => {
            setError("");
            setLoading(true);
            setRevision(n => n + 1);
          }}
        >
          Retry loading profile
        </Button>
      </section>
    );
  const role = account.role === "PM" ? "Product Manager" : "Developer";
  return (
    <section className="profile-page">
      <BackLink href="/workspace">Back to workspace</BackLink>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your account</p>
          <h1>Your profile</h1>
          <p className="muted">A little about you. One place to keep it up to date.</p>
        </div>
      </div>
      <div className="card profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {account.username.charAt(0).toUpperCase()}
        </span>
        <div className="profile-identity">
          <h2>{account.username}</h2>
          <span className="badge">{role}</span>
          <p className="muted profile-joined">
            Member since{" "}
            <time dateTime={account.createdAt}>
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(account.createdAt))}
            </time>
          </p>
        </div>
      </div>
      <div className="profile-grid">
        <section className="card profile-details" aria-labelledby="account-details-heading">
          <h2 id="account-details-heading">Account details</h2>
          <p className="muted">Your username is how your teammates recognise you.</p>
          <form onSubmit={save} className="stack" aria-busy={pending}>
            <Field
              id="profile-username"
              label="Username"
              value={username}
              onChange={event => {
                setUsername(event.target.value);
                setValidation("");
                setMessage("");
              }}
              required
              minLength={3}
              maxLength={24}
              pattern={usernamePattern}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending}
              hint={validation || usernameHint}
              aria-invalid={Boolean(validation)}
            />
            <dl className="profile-facts">
              <div>
                <dt>Email address</dt>
                <dd>
                  <span>{account.email}</span>
                  <span className="profile-verified">
                    <CheckCircle2 className="ui-icon" aria-hidden="true" />
                    Verified
                  </span>
                </dd>
              </div>
              <div>
                <dt>Application role</dt>
                <dd>
                  {role}
                  <span className="hint">
                    Chosen at signup. Your application role stays the same across organisations.
                  </span>
                </dd>
              </div>
            </dl>

            <div className="actions profile-form-actions">
              <Button disabled={!dirty || pending}>{pending ? "Saving…" : "Save changes"}</Button>
              <Button
                type="button"
                className="secondary"
                disabled={!dirty || pending}
                onClick={() => {
                  setUsername(account.username);
                  setValidation("");
                  setError("");
                  setMessage("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
        <section className="card profile-organisations" aria-labelledby="profile-organisations-heading">
          <Building2 className="profile-section-icon" aria-hidden="true" />
          <h2 id="profile-organisations-heading">Your organisations</h2>
          <p className="muted">The team spaces you’re part of.</p>
          {organisations.length ? (
            <ul className="profile-team-list">
              {organisations.map(org => (
                <li key={org.id}>
                  <span className="organisation-symbol" aria-hidden="true">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <h3>{org.name}</h3>
                    <span className="muted">{org.isAdmin ? "Admin" : "Member"}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="profile-empty">No organisations yet. Create a team or accept an invitation to get started.</p>
          )}
          <Link className="button secondary" href="/workspace">
            Manage organisations
          </Link>
        </section>
      </div>
    </section>
  );
}
