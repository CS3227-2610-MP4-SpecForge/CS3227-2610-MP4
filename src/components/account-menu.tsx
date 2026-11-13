"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { accountUpdatedEvent, type AccountIdentity } from "./account-events";
import { usePathname, useRouter } from "next/navigation";
import { api, failureMessage } from "./http";
import { Button, useNotificationState } from "./ui";
import { requestDeparture } from "./departure-guard";

export function AccountMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<{ pathname: string; account: AccountIdentity }>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useNotificationState(true);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  // Keep the menu (and Sign out, for focus return) open while a departure is confirmed.
  const departing = useRef(false);
  const account = identity?.pathname === pathname ? identity.account : undefined;

  useEffect(() => {
    let active = true;
    let requestRevision = 0;
    function refresh() {
      const revision = ++requestRevision;
      api("/api/account")
        .then(result => {
          if (active && revision === requestRevision) {
            setIdentity({ pathname, account: result.account });
            setOpen(false);
            setError("");
          }
        })
        .catch(() => {
          if (active && revision === requestRevision) setIdentity(undefined);
        });
    }
    function updated(event: Event) {
      const account = (event as CustomEvent<AccountIdentity>).detail;
      ++requestRevision; // Ignore an older read that completes after this update.
      setIdentity({ pathname, account });
      setOpen(false);
      setError("");
    }
    refresh();
    window.addEventListener(accountUpdatedEvent, updated);
    return () => {
      active = false;
      window.removeEventListener(accountUpdatedEvent, updated);
    };
  }, [pathname, setError]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!departing.current && !container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && !departing.current) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function signout() {
    if (submitting.current || departing.current) return;
    departing.current = true;
    const leave = await requestDeparture().finally(() => {
      departing.current = false;
    });
    if (!leave || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await api("/api/auth/signout", {});
      setIdentity(undefined);
      setOpen(false);
      router.replace("/sign-in");
      router.refresh();
    } catch (failure) {
      setError(failureMessage(failure));
      setOpen(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (!account) return null;
  return (
    <div
      className="account-menu"
      ref={container}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!departing.current && !container.current?.contains(document.activeElement) && !error && !pending)
          setOpen(false);
      }}
      onBlur={event => {
        if (!submitting.current && !departing.current && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <button
        className="account-trigger"
        ref={trigger}
        aria-expanded={open}
        aria-controls="account-options"
        onClick={() => setOpen(true)}
      >
        <span className="account-identity">
          <span className="account-username">{account.username}</span>
          <span className="account-email">{account.email}</span>
        </span>
        <span className="visually-hidden"> Account options</span>
      </button>
      {open && (
        <div className="account-popup" id="account-options">
          <Link className="account-profile-link" href="/profile" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Button className="secondary" onClick={signout} disabled={pending}>
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      )}
    </div>
  );
}
