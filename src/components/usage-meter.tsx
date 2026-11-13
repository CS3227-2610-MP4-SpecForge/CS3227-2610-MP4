/** A remaining-allowance bar with its caption, shared by the AI usage displays. */
export function UsageMeter({
  remaining,
  limit,
  label,
  children,
}: {
  remaining: number;
  limit: number;
  /** Accessible name of the meter, e.g. "AI requests left this hour". */
  label: string;
  /** The caption under the bar, announced politely when it changes. */
  children: React.ReactNode;
}) {
  const share = limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;
  return (
    <div className="assistant-usage">
      <div
        className={`usage-track ${remaining === 0 ? "usage-empty" : ""}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={remaining}
      >
        <span className="usage-fill" style={{ width: `${share}%` }} />
      </div>
      <p className="hint" aria-live="polite">
        {children}
      </p>
    </div>
  );
}
