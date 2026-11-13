// Programmatic departures must ask editors before performing irreversible actions
// such as ending the session. Anchor and native unload guards remain in the editor.
const departureEvent = "specforge:before-departure";

/** Resolves true when every mounted guard agrees to leave. */
export async function requestDeparture() {
  const answers: Promise<boolean>[] = [];
  window.dispatchEvent(new CustomEvent(departureEvent, { detail: answers }));
  return (await Promise.all(answers)).every(Boolean);
}

export function guardDeparture(confirm: () => Promise<boolean>) {
  const handler = (event: Event) => {
    (event as CustomEvent<Promise<boolean>[]>).detail.push(confirm());
  };
  window.addEventListener(departureEvent, handler);
  return () => window.removeEventListener(departureEvent, handler);
}
