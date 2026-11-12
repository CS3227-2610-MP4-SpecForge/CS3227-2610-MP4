"use client";
import { useEffect, useState } from "react";
import { onSessionChange } from "./http";

// Pages for signed-out visitors, where a 401 is the expected state.
const publicPaths = new Set(["/", "/sign-in", "/sign-up", "/verify-email"]);

/**
 * The root layout mounts this once. It shows a persistent banner after any api
 * call reports an ended session and hides it once a call succeeds again. It
 * never redirects, so unsaved editor text stays on screen; the plain link is a
 * document navigation, so the editors' departure guards still apply.
 */
export function SessionBanner() {
  const [expired, setExpired] = useState(false);
  useEffect(() => onSessionChange(active => {
    // On a public page a 401 is the signed-out visitor's normal state, so it
    // clears a banner carried over by a client redirect instead of showing one.
    setExpired(!active && !publicPaths.has(window.location.pathname));
  }), []);
  if (!expired) return null;
  return <div className="session-banner" role="alert">
    <p>Your session has ended. Sign in again to continue.</p>
    <a className="button secondary" href="/sign-in">Sign in again</a>
  </div>;
}
