"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./http";
import { UsageMeter } from "./usage-meter";

type OrganisationUsage = { remaining: number; limit: number; resets_at: string };

/**
 * An organisation's AI requests left today, for its admins. Reads on load and
 * when the admin comes back to the page; it does not poll. A failed read hides
 * the bar and leaves the rest of the page alone.
 */
export function OrganisationAiUsage({ organisationId }: { organisationId: string }) {
  // The count is kept with the organisation it belongs to, so switching
  // organisations never shows the previous one's count.
  const [usage, setUsage] = useState<(OrganisationUsage & { organisationId: string }) | null>(null);
  const read = useCallback(
    async (current: () => boolean) => {
      try {
        const result: OrganisationUsage = await api(`/api/organisations/${organisationId}/ai-usage`);
        if (current()) setUsage({ ...result, organisationId });
      } catch {
        if (current()) setUsage(null);
      }
    },
    [organisationId],
  );
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState === "visible") void read(() => active);
    };
    void Promise.resolve().then(refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [read]);
  if (!usage || usage.organisationId !== organisationId) return null;
  return (
    <section className="stack" aria-label="Organisation AI usage">
      <h2>AI usage</h2>
      <UsageMeter remaining={usage.remaining} limit={usage.limit} label="Organisation AI requests left today">
        AI today: {usage.remaining} of {usage.limit} left · resets at midnight Singapore time.
      </UsageMeter>
    </section>
  );
}
